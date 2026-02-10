import mapboxgl from 'mapbox-gl';
import type { TrainAccident } from '../types/disruptions';

export function initSmokeLayers(map: mapboxgl.Map): void {
  map.addSource('accident-smoke', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  // Outer glow — large, faint, represents smoke rising
  map.addLayer({
    id: 'accident-smoke-glow',
    type: 'circle',
    source: 'accident-smoke',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 28, 6, 55, 10, 100],
      'circle-color': ['case', ['get', 'isFatal'], '#1f2937', '#4b5563'],
      'circle-opacity': 0.15,
      'circle-blur': 1,
    },
  });

  // Mid layer — billowing smoke body
  map.addLayer({
    id: 'accident-smoke-mid',
    type: 'circle',
    source: 'accident-smoke',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 16, 6, 35, 10, 65],
      'circle-color': ['case', ['get', 'isFatal'], '#374151', '#6b7280'],
      'circle-opacity': 0.3,
      'circle-blur': 0.7,
    },
  });

  // Inner core — dense smoke
  map.addLayer({
    id: 'accident-smoke-circles',
    type: 'circle',
    source: 'accident-smoke',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 8, 6, 18, 10, 35],
      'circle-color': ['case', ['get', 'isFatal'], '#111827', '#374151'],
      'circle-opacity': 0.45,
      'circle-blur': 0.5,
    },
  });
}

export function updateSmokePositions(
  map: mapboxgl.Map,
  accidents: Map<string, TrainAccident>,
  gameMinutes: number,
): void {
  const source = map.getSource('accident-smoke') as mapboxgl.GeoJSONSource | undefined;
  if (!source) return;

  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];

  for (const accident of accidents.values()) {
    if (gameMinutes < accident.resumeAt) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [accident.stoppedAtLng, accident.stoppedAtLat],
        },
        properties: {
          isFatal: accident.isFatal,
        },
      });
    }
  }

  source.setData({ type: 'FeatureCollection', features });

  // Animate all layers for billowing effect
  const t = gameMinutes * 0.15;
  const coreOpacity = 0.4 + 0.1 * Math.sin(t);
  const midOpacity = 0.25 + 0.1 * Math.sin(t * 0.7 + 1);
  const glowOpacity = 0.12 + 0.06 * Math.sin(t * 0.5 + 2);
  map.setPaintProperty('accident-smoke-circles', 'circle-opacity', coreOpacity);
  map.setPaintProperty('accident-smoke-mid', 'circle-opacity', midOpacity);
  map.setPaintProperty('accident-smoke-glow', 'circle-opacity', glowOpacity);
}
