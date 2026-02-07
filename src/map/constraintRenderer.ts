import type mapboxgl from 'mapbox-gl';
import type { Constraint, CircleConstraint, HalfPlaneConstraint } from '../engine/constraints';

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

const CONSTRAINT_PREFIX = 'constraint-';

/** Track which source/layer IDs have been added to the map */
let activeIds: string[] = [];

/** Remove all existing constraint layers/sources */
function clearConstraints(map: mapboxgl.Map): void {
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
    // TextConstraint has no map rendering
  }
}
