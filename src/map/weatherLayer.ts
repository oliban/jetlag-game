import mapboxgl from 'mapbox-gl';
import type { WeatherZone } from '../types/disruptions';

export function initWeatherLayers(map: mapboxgl.Map): void {
  // Three concentric sources for gradient fade effect
  for (const ring of ['outer', 'mid', 'inner'] as const) {
    map.addSource(`weather-zones-${ring}`, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }

  // Outer ring — faint, soft edge
  map.addLayer(
    {
      id: 'weather-zone-outer',
      type: 'fill',
      source: 'weather-zones-outer',
      paint: {
        'fill-color': [
          'match',
          ['get', 'weatherType'],
          'cloudy', '#9ca3af',
          'rain', '#64748b',
          'storm', '#4c1d95',
          '#9ca3af',
        ],
        'fill-opacity': [
          'match',
          ['get', 'weatherType'],
          'cloudy', 0.03,
          'rain', 0.05,
          'storm', 0.07,
          0.03,
        ],
      },
    },
    'connection-lines',
  );

  // Mid ring
  map.addLayer(
    {
      id: 'weather-zone-mid',
      type: 'fill',
      source: 'weather-zones-mid',
      paint: {
        'fill-color': [
          'match',
          ['get', 'weatherType'],
          'cloudy', '#9ca3af',
          'rain', '#64748b',
          'storm', '#4c1d95',
          '#9ca3af',
        ],
        'fill-opacity': [
          'match',
          ['get', 'weatherType'],
          'cloudy', 0.05,
          'rain', 0.08,
          'storm', 0.12,
          0.05,
        ],
      },
    },
    'connection-lines',
  );

  // Inner core — strongest
  map.addLayer(
    {
      id: 'weather-zone-inner',
      type: 'fill',
      source: 'weather-zones-inner',
      paint: {
        'fill-color': [
          'match',
          ['get', 'weatherType'],
          'cloudy', '#9ca3af',
          'rain', '#64748b',
          'storm', '#4c1d95',
          '#9ca3af',
        ],
        'fill-opacity': [
          'match',
          ['get', 'weatherType'],
          'cloudy', 0.08,
          'rain', 0.12,
          'storm', 0.18,
          0.08,
        ],
      },
    },
    'connection-lines',
  );
}

/** Build a polygon circle with irregular wobble for organic shapes */
function buildZonePolygon(
  zone: WeatherZone,
  radiusScale: number,
): [number, number][] {
  const coords: [number, number][] = [];
  const steps = 64;
  const radius = zone.radiusKm * radiusScale;

  // Use zone id to seed consistent wobble per zone
  let hash = 0;
  for (let i = 0; i < zone.id.length; i++) {
    hash = ((hash << 5) - hash + zone.id.charCodeAt(i)) | 0;
  }

  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    // Irregular wobble: combine multiple frequencies for organic edges
    const wobble =
      1 +
      0.08 * Math.sin(angle * 3 + hash) +
      0.05 * Math.sin(angle * 5 + hash * 0.7) +
      0.03 * Math.sin(angle * 7 + hash * 1.3);
    const r = radius * wobble;
    const dx = r * Math.cos(angle);
    const dy = r * Math.sin(angle);
    const lat = zone.centerLat + dy / 111.32;
    const lng =
      zone.centerLng +
      dx / (111.32 * Math.cos((zone.centerLat * Math.PI) / 180));
    coords.push([lng, lat]);
  }
  return coords;
}

export function updateWeatherZones(map: mapboxgl.Map, zones: WeatherZone[]): void {
  const rings = [
    { key: 'outer', scale: 1.0 },
    { key: 'mid', scale: 0.8 },
    { key: 'inner', scale: 0.55 },
  ] as const;

  for (const ring of rings) {
    const features: GeoJSON.Feature[] = zones.map((zone) => {
      const coords = buildZonePolygon(zone, ring.scale);
      return {
        type: 'Feature' as const,
        properties: { weatherType: zone.weatherType, id: zone.id },
        geometry: { type: 'Polygon' as const, coordinates: [coords] },
      };
    });

    const source = map.getSource(`weather-zones-${ring.key}`) as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData({ type: 'FeatureCollection', features });
    }
  }
}
