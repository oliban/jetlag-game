import type mapboxgl from 'mapbox-gl';
import type { Constraint, CircleConstraint, HalfPlaneConstraint, TextConstraint } from '../engine/constraints';

// Bounding box covering all of Europe and surroundings
const EUROPE_BBOX: [number, number][] = [
  [-30, 25], [50, 25], [50, 75], [-30, 75], [-30, 25],
];

/** Generate circle ring coordinates (counterclockwise) */
function circleRing(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  points = 64,
): [number, number][] {
  const coords: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = radiusKm * Math.cos(angle);
    const dy = radiusKm * Math.sin(angle);
    const lat = centerLat + dy / 111.32;
    const lng = centerLng + dx / (111.32 * Math.cos((centerLat * Math.PI) / 180));
    coords.push([lng, lat]);
  }
  return coords;
}

/**
 * Build the ELIMINATED region polygon for a circle constraint.
 * - inside=true  → hider IS inside → eliminate OUTSIDE the circle (bbox with circle hole)
 * - inside=false → hider is NOT inside → eliminate INSIDE the circle
 */
function circleEliminationPolygon(c: CircleConstraint): GeoJSON.Feature<GeoJSON.Polygon> {
  const ring = circleRing(c.centerLat, c.centerLng, c.radiusKm);

  if (c.inside) {
    // Shade everything OUTSIDE the circle: bbox exterior, circle as hole
    return {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [EUROPE_BBOX, ring.slice().reverse()] },
    };
  } else {
    // Shade the INSIDE of the circle
    return {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [ring] },
    };
  }
}

/** Circle boundary as a LineString */
function circleOutline(c: CircleConstraint): GeoJSON.Feature<GeoJSON.LineString> {
  const ring = circleRing(c.centerLat, c.centerLng, c.radiusKm);
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: ring },
  };
}

/**
 * Build the ELIMINATED region polygon for a half-plane constraint.
 * Direction tells us where the hider IS; we shade the OPPOSITE side.
 * - direction='above' (hider is north) → eliminate south (below the line)
 * - direction='below' (hider is south) → eliminate north (above the line)
 * - direction='east'  (hider is east)  → eliminate west
 * - direction='west'  (hider is west)  → eliminate east
 */
function halfPlaneEliminationPolygon(c: HalfPlaneConstraint): GeoJSON.Feature<GeoJSON.Polygon> {
  const [minLng, minLat, maxLng, maxLat] = [-30, 25, 50, 75];
  let coords: [number, number][];

  if (c.axis === 'latitude') {
    if (c.direction === 'above') {
      // Hider is above → shade below
      coords = [
        [minLng, minLat], [maxLng, minLat], [maxLng, c.value], [minLng, c.value], [minLng, minLat],
      ];
    } else {
      // Hider is below → shade above
      coords = [
        [minLng, c.value], [maxLng, c.value], [maxLng, maxLat], [minLng, maxLat], [minLng, c.value],
      ];
    }
  } else {
    if (c.direction === 'east') {
      // Hider is east → shade west
      coords = [
        [minLng, minLat], [c.value, minLat], [c.value, maxLat], [minLng, maxLat], [minLng, minLat],
      ];
    } else {
      // Hider is west → shade east
      coords = [
        [c.value, minLat], [maxLng, minLat], [maxLng, maxLat], [c.value, maxLat], [c.value, minLat],
      ];
    }
  }

  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [coords] },
  };
}

/** Half-plane boundary line */
function halfPlaneBoundaryLine(c: HalfPlaneConstraint): GeoJSON.Feature<GeoJSON.LineString> {
  const [minLng, minLat, maxLng, maxLat] = [-30, 25, 50, 75];
  const coords: [number, number][] =
    c.axis === 'latitude'
      ? [[minLng, c.value], [maxLng, c.value]]
      : [[c.value, minLat], [c.value, maxLat]];

  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: coords },
  };
}

/** Map game country names to ISO 3166-1 alpha-3 codes */
const COUNTRY_TO_ISO3: Record<string, string> = {
  France: 'FRA',
  'United Kingdom': 'GBR',
  Germany: 'DEU',
  Netherlands: 'NLD',
  Belgium: 'BEL',
  Switzerland: 'CHE',
  Austria: 'AUT',
  Italy: 'ITA',
  Spain: 'ESP',
  'Czech Republic': 'CZE',
  Poland: 'POL',
  Hungary: 'HUN',
  Denmark: 'DNK',
};

const ALL_GAME_ISOS = Object.values(COUNTRY_TO_ISO3);

/** Parse a TextConstraint label like "In France" or "Not in France" and return the country name, or null */
function parseCountryConstraint(c: TextConstraint): { country: string; negated: boolean } | null {
  const notMatch = c.label.match(/^Not in (.+)$/);
  if (notMatch && COUNTRY_TO_ISO3[notMatch[1]]) {
    return { country: notMatch[1], negated: true };
  }
  const inMatch = c.label.match(/^In (.+)$/);
  if (inMatch && COUNTRY_TO_ISO3[inMatch[1]]) {
    return { country: inMatch[1], negated: false };
  }
  return null;
}

/** Collect ISO codes of all eliminated countries from constraints */
function getEliminatedIsoCodes(constraints: Constraint[]): string[] {
  const eliminated = new Set<string>();

  for (const c of constraints) {
    if (c.type !== 'text') continue;
    const parsed = parseCountryConstraint(c);
    if (!parsed) continue;

    const iso = COUNTRY_TO_ISO3[parsed.country];
    if (parsed.negated) {
      // "Not in X" → X is eliminated
      eliminated.add(iso);
    } else {
      // "In X" → all OTHER game countries are eliminated
      for (const code of ALL_GAME_ISOS) {
        if (code !== iso) eliminated.add(code);
      }
    }
  }

  return Array.from(eliminated);
}

const COUNTRY_SOURCE_ID = 'country-boundaries-src';
const COUNTRY_LAYER_ID = 'country-constraint-fill';

/** Add the Mapbox country boundaries vector source (once) */
function ensureCountrySource(map: mapboxgl.Map): void {
  if (!map.getSource(COUNTRY_SOURCE_ID)) {
    map.addSource(COUNTRY_SOURCE_ID, {
      type: 'vector',
      url: 'mapbox://mapbox.country-boundaries-v1',
    });
  }
}

/** Render eliminated countries as red fill overlay */
function renderCountryConstraints(map: mapboxgl.Map, eliminatedCodes: string[]): void {
  // Remove existing layer if present
  if (map.getLayer(COUNTRY_LAYER_ID)) {
    map.removeLayer(COUNTRY_LAYER_ID);
  }

  if (eliminatedCodes.length === 0) return;

  ensureCountrySource(map);

  // Insert below station-dots so stations remain visible
  const beforeLayer = map.getLayer('station-dots') ? 'station-dots' : undefined;

  map.addLayer(
    {
      id: COUNTRY_LAYER_ID,
      type: 'fill',
      source: COUNTRY_SOURCE_ID,
      'source-layer': 'country_boundaries',
      filter: [
        'all',
        ['match', ['get', 'worldview'], ['all', 'US'], true, false],
        ['match', ['get', 'iso_3166_1_alpha_3'], eliminatedCodes, true, false],
      ],
      paint: {
        'fill-color': '#ef4444',
        'fill-opacity': 0.25,
      },
    },
    beforeLayer,
  );
}

const CONSTRAINT_PREFIX = 'constraint-';

/** Track which source/layer IDs have been added to the map */
let activeIds: string[] = [];

/** Remove all existing constraint layers/sources */
function clearConstraints(map: mapboxgl.Map): void {
  // Remove country constraint layer (keep source — it's reusable)
  if (map.getLayer(COUNTRY_LAYER_ID)) {
    map.removeLayer(COUNTRY_LAYER_ID);
  }

  for (const id of activeIds) {
    for (const suffix of ['-fill', '-line']) {
      const layerId = id + suffix;
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    }
    if (map.getSource(id)) {
      map.removeSource(id);
    }
  }
  activeIds = [];
}

/** Render all constraints on the map. Eliminated regions get a red fog overlay that stacks. */
export function renderConstraints(
  map: mapboxgl.Map,
  constraints: Constraint[],
): void {
  clearConstraints(map);

  let idx = 0;

  for (const c of constraints) {
    if (c.type === 'circle') {
      // Red fog over eliminated area
      const fillId = `${CONSTRAINT_PREFIX}${idx}-fill`;
      activeIds.push(fillId);
      map.addSource(fillId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [circleEliminationPolygon(c)] },
      });
      map.addLayer({
        id: fillId + '-fill',
        type: 'fill',
        source: fillId,
        paint: {
          'fill-color': '#ef4444',
          'fill-opacity': 0.25,
        },
      });

      // Bright boundary line
      const lineId = `${CONSTRAINT_PREFIX}${idx}-boundary`;
      activeIds.push(lineId);
      map.addSource(lineId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [circleOutline(c)] },
      });
      map.addLayer({
        id: lineId + '-line',
        type: 'line',
        source: lineId,
        paint: {
          'line-color': c.inside ? '#4ade80' : '#f87171',
          'line-width': 3,
          'line-dasharray': [4, 4],
        },
      });

      idx++;
    } else if (c.type === 'half-plane') {
      // Red fog over eliminated area
      const fillId = `${CONSTRAINT_PREFIX}${idx}-fill`;
      activeIds.push(fillId);
      map.addSource(fillId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [halfPlaneEliminationPolygon(c)] },
      });
      map.addLayer({
        id: fillId + '-fill',
        type: 'fill',
        source: fillId,
        paint: {
          'fill-color': '#ef4444',
          'fill-opacity': 0.25,
        },
      });

      // Bright boundary line
      const lineId = `${CONSTRAINT_PREFIX}${idx}-boundary`;
      activeIds.push(lineId);
      map.addSource(lineId, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [halfPlaneBoundaryLine(c)] },
      });
      map.addLayer({
        id: lineId + '-line',
        type: 'line',
        source: lineId,
        paint: {
          'line-color': '#c084fc',
          'line-width': 3,
          'line-dasharray': [6, 3],
        },
      });

      idx++;
    }
    // TextConstraint — handled by country rendering below
  }

  // Render country constraints from text constraints
  const eliminatedCodes = getEliminatedIsoCodes(constraints);
  renderCountryConstraints(map, eliminatedCodes);
}
