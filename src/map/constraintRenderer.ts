import type { Constraint, CircleConstraint, HalfPlaneConstraint, TextConstraint } from '../engine/constraints';
import { COUNTRY_DATA } from '../data/countryData';
import type { CountryInfo } from '../data/countryData';
import { getStationList } from '../data/graph';
import { nearestStationDistance } from '../questions/evaluators';
import type { Station } from '../types/game';

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

import { COUNTRY_TO_ISO3, ALL_GAME_ISOS } from '../theme/colors';

// Cached stations-by-country lookup
let _stationsByCountry: Record<string, Station[]> | null = null;
function getStationsByCountry(): Record<string, Station[]> {
  if (_stationsByCountry) return _stationsByCountry;
  _stationsByCountry = {};
  for (const s of getStationList()) {
    (_stationsByCountry[s.country] ??= []).push(s);
  }
  return _stationsByCountry;
}

// Cached filtered station lists for thermometer elimination
let _crCoastal: Station[] | null = null;
let _crCapital: Station[] | null = null;
let _crMountainous: Station[] | null = null;
function getCRCoastal(): Station[] {
  if (!_crCoastal) _crCoastal = getStationList().filter(s => s.isCoastal);
  return _crCoastal;
}
function getCRCapital(): Station[] {
  if (!_crCapital) _crCapital = getStationList().filter(s => s.isCapital);
  return _crCapital;
}
function getCRMountainous(): Station[] {
  if (!_crMountainous) _crMountainous = getStationList().filter(s => s.isMountainous);
  return _crMountainous;
}

/** Eliminate countries where NO station satisfies predicate `hiderHasIt=true`
 *  or ALL stations satisfy predicate when `hiderHasIt=false` */
function eliminateCountriesByStation(
  eliminated: Set<string>,
  predicate: (s: Station) => boolean,
  hiderHasIt: boolean,
): void {
  const byCountry = getStationsByCountry();
  for (const [country, stations] of Object.entries(byCountry)) {
    const iso = COUNTRY_TO_ISO3[country];
    if (!iso) continue;
    if (hiderHasIt) {
      // Hider's station has the property → eliminate countries where NO station has it
      if (!stations.some(predicate)) eliminated.add(iso);
    } else {
      // Hider's station lacks the property → eliminate countries where ALL stations have it
      if (stations.every(predicate)) eliminated.add(iso);
    }
  }
}

/** Eliminate countries based on country-level data (landlocked, area, F1, beer/wine) */
function eliminateCountriesByData(
  eliminated: Set<string>,
  predicate: (ci: CountryInfo) => boolean,
  hiderMatches: boolean,
): void {
  for (const [country, ci] of Object.entries(COUNTRY_DATA)) {
    const iso = COUNTRY_TO_ISO3[country];
    if (!iso) continue;
    if (hiderMatches && !predicate(ci)) eliminated.add(iso);
    if (!hiderMatches && predicate(ci)) eliminated.add(iso);
  }
}

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

    // "In X" / "Not in X" country constraints
    const parsed = parseCountryConstraint(c);
    if (parsed) {
      const iso = COUNTRY_TO_ISO3[parsed.country];
      if (parsed.negated) {
        eliminated.add(iso);
      } else {
        for (const code of ALL_GAME_ISOS) {
          if (code !== iso) eliminated.add(code);
        }
      }
      continue;
    }

    // Country-level property constraints
    switch (c.label) {
      case 'Landlocked country':
        eliminateCountriesByData(eliminated, ci => ci.landlocked, c.value === 'Yes');
        break;
      case 'Large country (>200k km²)':
        eliminateCountriesByData(eliminated, ci => ci.areaOver200k, c.value === 'Yes');
        break;
      case 'Country has F1 circuit':
        eliminateCountriesByData(eliminated, ci => ci.hasF1Circuit, c.value === 'Yes');
        break;
      case 'Beer country':
        // Hider is in a beer country → eliminate wine countries
        eliminateCountriesByData(eliminated, ci => ci.beerOrWine === 'beer', true);
        break;
      case 'Wine country':
        // Hider is in a wine country → eliminate beer countries
        eliminateCountriesByData(eliminated, ci => ci.beerOrWine === 'wine', true);
        break;

      // Station-level property constraints
      case 'Coastal station':
        eliminateCountriesByStation(eliminated, s => s.isCoastal, c.value === 'Yes');
        break;
      case 'Mountainous region':
        eliminateCountriesByStation(eliminated, s => s.isMountainous, c.value === 'Yes');
        break;
      case 'Capital city':
        eliminateCountriesByStation(eliminated, s => s.isCapital, c.value === 'Yes');
        break;
      case 'Olympic host city':
        eliminateCountriesByStation(eliminated, s => s.hasHostedOlympics, c.value === 'Yes');
        break;
      case 'Ancient city (>2000 years)':
        eliminateCountriesByStation(eliminated, s => s.isAncient, c.value === 'Yes');
        break;
      case 'City has metro':
        eliminateCountriesByStation(eliminated, s => s.hasMetro, c.value === 'Yes');
        break;
      case 'Hub station (4+ connections)':
        eliminateCountriesByStation(eliminated, s => s.connections >= 4, c.value === 'Yes');
        break;
      case 'Station name A–M': {
        const isAM = (s: Station) => {
          const ch = s.name[0].toUpperCase();
          return ch >= 'A' && ch <= 'M';
        };
        eliminateCountriesByStation(eliminated, isAM, c.value === 'Yes');
        break;
      }

      // Thermometer constraints
      case 'Hider nearer to coast': {
        const threshold = parseFloat(c.value);
        const byCountry = getStationsByCountry();
        const coastal = getCRCoastal();
        for (const [country, stations] of Object.entries(byCountry)) {
          const iso = COUNTRY_TO_ISO3[country];
          if (!iso) continue;
          if (!stations.some(s => nearestStationDistance(s, coastal) < threshold))
            eliminated.add(iso);
        }
        break;
      }
      case 'Hider further from coast': {
        const threshold = parseFloat(c.value);
        const byCountry = getStationsByCountry();
        const coastal = getCRCoastal();
        for (const [country, stations] of Object.entries(byCountry)) {
          const iso = COUNTRY_TO_ISO3[country];
          if (!iso) continue;
          if (!stations.some(s => nearestStationDistance(s, coastal) >= threshold))
            eliminated.add(iso);
        }
        break;
      }
      case 'Hider nearer to capital': {
        const threshold = parseFloat(c.value);
        const byCountry = getStationsByCountry();
        const capitals = getCRCapital();
        for (const [country, stations] of Object.entries(byCountry)) {
          const iso = COUNTRY_TO_ISO3[country];
          if (!iso) continue;
          if (!stations.some(s => nearestStationDistance(s, capitals) < threshold))
            eliminated.add(iso);
        }
        break;
      }
      case 'Hider further from capital': {
        const threshold = parseFloat(c.value);
        const byCountry = getStationsByCountry();
        const capitals = getCRCapital();
        for (const [country, stations] of Object.entries(byCountry)) {
          const iso = COUNTRY_TO_ISO3[country];
          if (!iso) continue;
          if (!stations.some(s => nearestStationDistance(s, capitals) >= threshold))
            eliminated.add(iso);
        }
        break;
      }
      case 'Hider nearer to mountains': {
        const threshold = parseFloat(c.value);
        const byCountry = getStationsByCountry();
        const mountains = getCRMountainous();
        for (const [country, stations] of Object.entries(byCountry)) {
          const iso = COUNTRY_TO_ISO3[country];
          if (!iso) continue;
          if (!stations.some(s => nearestStationDistance(s, mountains) < threshold))
            eliminated.add(iso);
        }
        break;
      }
      case 'Hider further from mountains': {
        const threshold = parseFloat(c.value);
        const byCountry = getStationsByCountry();
        const mountains = getCRMountainous();
        for (const [country, stations] of Object.entries(byCountry)) {
          const iso = COUNTRY_TO_ISO3[country];
          if (!iso) continue;
          if (!stations.some(s => nearestStationDistance(s, mountains) >= threshold))
            eliminated.add(iso);
        }
        break;
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
        ['any', ['==', ['get', 'worldview'], 'all'], ['in', 'US', ['get', 'worldview']]],
        ['match', ['get', 'iso_3166_1_alpha_3'], eliminatedCodes, true, false],
      ],
      paint: {
        'fill-color': '#1a0000',
        'fill-opacity': 0.7,
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
          'fill-color': '#1a0000',
          'fill-opacity': 0.55,
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
          'fill-color': '#1a0000',
          'fill-opacity': 0.55,
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
