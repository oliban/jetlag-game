import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getStationList, getConnections, getNeighbors, getStations } from '../data/graph';
import { useGameStore } from '../store/gameStore';
import type { Station } from '../types/game';
import { renderConstraints } from './constraintRenderer';
import { initTrainLayer, updateTrainPositions, initTrainHover, initTrainClick } from './trainRenderer';
import { logger } from '../engine/logger';
import { classifyConnection } from '../engine/trainSchedule';
import { findTransitTrainPosition } from '../engine/transitPosition';
import { ALL_GAME_ISOS, stationColorMatchExpression, countryFillMatchExpression, countryBorderMatchExpression } from '../theme/colors';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

interface StationPopupInfo {
  station: Station;
  neighbors: string[];
}

export default function GameMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const playerMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const seekerMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [popup, setPopup] = useState<StationPopupInfo | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const phase = useGameStore((s) => s.phase);
  const playerStationId = useGameStore((s) => s.playerStationId);
  const hidingZone = useGameStore((s) => s.hidingZone);
  const travelTo = useGameStore((s) => s.travelTo);
  const seekerStationId = useGameStore((s) => s.seekerStationId);
  const constraints = useGameStore((s) => s.constraints);
  const playerRole = useGameStore((s) => s.playerRole);
  const seekerTravelTo = useGameStore((s) => s.seekerTravelTo);
  const playerTransit = useGameStore((s) => s.playerTransit);
  const seekerTransit = useGameStore((s) => s.seekerTransit);
  const clock = useGameStore((s) => s.clock);
  const hoveredRadarRadius = useGameStore((s) => s.hoveredRadarRadius);
  const visitedStations = useGameStore((s) => s.visitedStations);

  const stations = useMemo(() => getStationList(), []);
  const connections = useMemo(() => getConnections(), []);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [10, 50],
      zoom: 4,
      minZoom: 3,
      maxZoom: 10,
    });

    mapRef.current = map;

    map.on('load', () => {
      // Country fill + border layers (below everything else)
      map.addSource('country-boundaries-src', {
        type: 'vector',
        url: 'mapbox://mapbox.country-boundaries-v1',
      });

      map.addLayer({
        id: 'country-fills',
        type: 'fill',
        source: 'country-boundaries-src',
        'source-layer': 'country_boundaries',
        filter: [
          'all',
          ['match', ['get', 'worldview'], ['all', 'US'], true, false],
          ['match', ['get', 'iso_3166_1_alpha_3'], ALL_GAME_ISOS, true, false],
        ],
        paint: {
          'fill-color': countryFillMatchExpression(),
          'fill-opacity': 0.15,
        },
      });

      map.addLayer({
        id: 'country-borders',
        type: 'line',
        source: 'country-boundaries-src',
        'source-layer': 'country_boundaries',
        filter: [
          'all',
          ['match', ['get', 'worldview'], ['all', 'US'], true, false],
          ['match', ['get', 'iso_3166_1_alpha_3'], ALL_GAME_ISOS, true, false],
        ],
        paint: {
          'line-color': countryBorderMatchExpression(),
          'line-opacity': 0.3,
          'line-width': 1,
        },
      });

      // Connection lines — colored by train type
      const lineFeatures = connections.map((c) => {
        const fromStation = stations.find((s) => s.id === c.from);
        const toStation = stations.find((s) => s.id === c.to);
        if (!fromStation || !toStation) return null;
        const trainType = classifyConnection(c.distance);
        return {
          type: 'Feature' as const,
          properties: { distance: c.distance, trainType },
          geometry: {
            type: 'LineString' as const,
            coordinates: [
              [fromStation.lng, fromStation.lat],
              [toStation.lng, toStation.lat],
            ],
          },
        };
      }).filter(Boolean);

      map.addSource('connections', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: lineFeatures as GeoJSON.Feature[] },
      });

      map.addLayer({
        id: 'connection-lines',
        type: 'line',
        source: 'connections',
        paint: {
          'line-color': [
            'match', ['get', 'trainType'],
            'express', '#eab308', // gold
            'regional', '#3b82f6', // blue
            '#9ca3af', // gray (local / default)
          ],
          'line-opacity': [
            'match', ['get', 'trainType'],
            'express', 0.6,
            'regional', 0.5,
            0.3,
          ],
          'line-width': [
            'match', ['get', 'trainType'],
            'express', 2.5,
            'regional', 1.8,
            1.2,
          ],
        },
      });

      // Highlighted connections (for adjacent stations during hiding)
      map.addSource('highlighted-connections', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'highlighted-connection-lines',
        type: 'line',
        source: 'highlighted-connections',
        paint: {
          'line-color': '#22c55e',
          'line-opacity': 0.7,
          'line-width': 3,
        },
      });

      // Station dots
      const stationFeatures = stations.map((s) => ({
        type: 'Feature' as const,
        properties: {
          id: s.id,
          name: s.name,
          country: s.country,
          connections: s.connections,
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [s.lng, s.lat],
        },
      }));

      map.addSource('stations', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: stationFeatures },
      });

      map.addLayer({
        id: 'station-dots',
        type: 'circle',
        source: 'stations',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['get', 'connections'],
            1, 4, 5, 7, 10, 10,
          ],
          'circle-color': stationColorMatchExpression(),
          'circle-stroke-color': 'rgba(255,255,255,0.6)',
          'circle-stroke-width': 0.8,
          'circle-opacity': 0.9,
        },
      });

      // Station labels
      map.addLayer({
        id: 'station-labels',
        type: 'symbol',
        source: 'stations',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
          'text-optional': true,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#e2e8f0',
          'text-halo-color': '#1a202c',
          'text-halo-width': 1,
        },
      });

      // Hiding zone circle source
      map.addSource('hiding-zone', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'hiding-zone-fill',
        type: 'fill',
        source: 'hiding-zone',
        paint: {
          'fill-color': '#22c55e',
          'fill-opacity': 0.15,
        },
      }, 'station-dots');

      map.addLayer({
        id: 'hiding-zone-outline',
        type: 'line',
        source: 'hiding-zone',
        paint: {
          'line-color': '#22c55e',
          'line-width': 2,
          'line-dasharray': [2, 2],
        },
      }, 'station-dots');

      // Radar preview circle
      map.addSource('radar-preview', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'radar-preview-fill',
        type: 'fill',
        source: 'radar-preview',
        paint: {
          'fill-color': '#f59e0b',
          'fill-opacity': 0.1,
        },
      }, 'station-dots');

      map.addLayer({
        id: 'radar-preview-outline',
        type: 'line',
        source: 'radar-preview',
        paint: {
          'line-color': '#f59e0b',
          'line-width': 2,
          'line-opacity': 0.6,
          'line-dasharray': [3, 2],
        },
      }, 'station-dots');

      // Train visualization layer (above connection-lines, below station-dots)
      initTrainLayer(map);
      initTrainHover(map, getStations(), () => useGameStore.getState().playerStationId);
      initTrainClick(
        map,
        () => useGameStore.getState().playerStationId,
        (routeId, dest, depTime) => useGameStore.getState().travelViaRoute(routeId, dest, depTime),
      );

      setMapLoaded(true);
    });

    // Cursor
    map.on('mouseenter', 'station-dots', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'station-dots', () => {
      map.getCanvas().style.cursor = '';
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Handle station click
  const handleStationClick = useCallback(
    (stationId: string) => {
      const station = stations.find((s) => s.id === stationId);
      if (!station) return;

      // Seeker mode: click adjacent station to travel
      if (phase === 'seeking' && playerRole === 'seeker' && playerStationId) {
        const neighbors = getNeighbors(playerStationId);
        if (neighbors.includes(stationId)) {
          seekerTravelTo(stationId);
          return;
        }
      }

      if (phase === 'hiding' && playerStationId && !hidingZone) {
        const neighbors = getNeighbors(playerStationId);
        if (neighbors.includes(stationId)) {
          travelTo(stationId);
          return;
        }
      }

      // Show info popup for non-travel clicks
      const neighborIds = connections
        .filter((c) => c.from === stationId || c.to === stationId)
        .map((c) => {
          const nId = c.from === stationId ? c.to : c.from;
          const n = stations.find((s) => s.id === nId);
          return n ? `${n.name} (${c.distance}km)` : nId;
        });
      setPopup({ station, neighbors: neighborIds });
    },
    [phase, playerRole, playerStationId, hidingZone, travelTo, seekerTravelTo, stations, connections],
  );

  // Attach click handler
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const handler = (e: mapboxgl.MapMouseEvent & mapboxgl.EventData) => {
      if (!e.features?.[0]) return;
      handleStationClick(e.features[0].properties!.id);
    };

    map.on('click', 'station-dots', handler);
    return () => { map.off('click', 'station-dots', handler); };
  }, [mapLoaded, handleStationClick]);

  // Create/recreate player marker when station or role changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!playerStationId) {
      playerMarkerRef.current?.remove();
      playerMarkerRef.current = null;
      return;
    }

    const stationMap = getStations();
    const station = stationMap[playerStationId];
    if (!station) {
      logger.warn('GameMap', `Player station not found: ${playerStationId}`);
      return;
    }

    // Remove old marker when station/role changes (recreate with correct color)
    if (playerMarkerRef.current) {
      playerMarkerRef.current.remove();
      playerMarkerRef.current = null;
    }

    const isSeeker = playerRole === 'seeker';
    const color = isSeeker ? '#ef4444' : '#3b82f6';
    const glow = isSeeker
      ? '0 0 15px rgba(239, 68, 68, 0.8)'
      : '0 0 15px rgba(59, 130, 246, 0.8)';

    const el = document.createElement('div');
    el.style.width = '24px';
    el.style.height = '24px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = color;
    el.style.border = '3px solid white';
    el.style.boxShadow = glow;
    playerMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([station.lng, station.lat])
      .addTo(map);
    logger.info('GameMap', `Player marker CREATED at ${station.name} (role=${playerRole})`);

  }, [playerStationId, playerRole, mapLoaded]);

  // Attach player marker to active train during transit
  useEffect(() => {
    if (!playerTransit || !playerMarkerRef.current) return;
    if (clock.gameMinutes < playerTransit.departureTime) return; // not departed yet

    const pos = findTransitTrainPosition(playerTransit, clock.gameMinutes);
    if (pos) {
      playerMarkerRef.current.setLngLat(pos);
    }
  }, [playerTransit, clock.gameMinutes]);

  // Highlight adjacent connections (hiding phase + seeker seeking phase when not in transit)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource('highlighted-connections') as mapboxgl.GeoJSONSource;
    if (!source) return;

    // Show green lines when player can change destination (not on the train yet)
    const onTheTrain = playerTransit && clock.gameMinutes >= playerTransit.departureTime;
    const hiderCanTravel = phase === 'hiding' && !hidingZone && !onTheTrain;
    const seekerCanTravel = phase === 'seeking' && playerRole === 'seeker' && !onTheTrain;

    if ((!hiderCanTravel && !seekerCanTravel) || !playerStationId) {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const neighbors = new Set(getNeighbors(playerStationId));
    const features = connections
      .filter((c) =>
        (c.from === playerStationId && neighbors.has(c.to)) ||
        (c.to === playerStationId && neighbors.has(c.from))
      )
      .map((c) => {
        const from = stations.find((s) => s.id === c.from);
        const to = stations.find((s) => s.id === c.to);
        if (!from || !to) return null;
        return {
          type: 'Feature' as const,
          properties: {},
          geometry: {
            type: 'LineString' as const,
            coordinates: [[from.lng, from.lat], [to.lng, to.lat]],
          },
        };
      })
      .filter(Boolean);

    source.setData({
      type: 'FeatureCollection',
      features: features as GeoJSON.Feature[],
    });
  }, [playerStationId, phase, hidingZone, playerRole, playerTransit, clock.gameMinutes, mapLoaded]);

  // Update seeker marker (only visible when player is hider)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) {
      logger.debug('GameMap', `Seeker marker: map not ready (map=${!!map}, loaded=${mapLoaded})`);
      return;
    }

    if (playerRole !== 'hider' || !seekerStationId || phase !== 'seeking') {
      if (seekerMarkerRef.current) {
        logger.debug('GameMap', `Seeker marker: removing (role=${playerRole}, phase=${phase}, id=${seekerStationId})`);
        seekerMarkerRef.current.remove();
        seekerMarkerRef.current = null;
      }
      return;
    }

    const stationMap = getStations();
    const station = stationMap[seekerStationId];
    if (!station) {
      logger.warn('GameMap', `Seeker station not found: ${seekerStationId}`);
      return;
    }

    logger.info('GameMap', `Seeker marker: ${station.name} (${seekerStationId}) [${station.lat}, ${station.lng}], existing=${!!seekerMarkerRef.current}`);

    if (!seekerMarkerRef.current) {
      const el = document.createElement('div');
      el.style.width = '28px';
      el.style.height = '28px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = '#ef4444';
      el.style.border = '4px solid white';
      el.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.9)';
      seekerMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([station.lng, station.lat])
        .addTo(map);
      // Ensure the marker wrapper has high z-index
      seekerMarkerRef.current.getElement().style.zIndex = '10';
      logger.info('GameMap', `Seeker marker CREATED at ${station.name}`);
    } else if (!seekerTransit) {
      // Only snap to station when NOT in transit — let interpolation handle transit movement
      seekerMarkerRef.current.setLngLat([station.lng, station.lat]);
      logger.debug('GameMap', `Seeker marker MOVED to ${station.name}`);
    }
  }, [seekerStationId, seekerTransit, phase, playerRole, mapLoaded]);

  // Attach seeker marker to active train during transit
  useEffect(() => {
    if (!seekerTransit || !seekerMarkerRef.current) return;
    if (clock.gameMinutes < seekerTransit.departureTime) return;

    const pos = findTransitTrainPosition(seekerTransit, clock.gameMinutes);
    if (pos) {
      seekerMarkerRef.current.setLngLat(pos);
    }
  }, [seekerTransit, clock.gameMinutes]);

  // Update constraint overlays
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    renderConstraints(map, constraints);
  }, [constraints, mapLoaded]);

  // Update station dots with visited state (red for visited stations)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource('stations') as mapboxgl.GeoJSONSource;
    if (!source) return;

    // Only show visited coloring during seeking phase
    if (phase !== 'seeking' || visitedStations.size === 0) {
      map.setPaintProperty('station-dots', 'circle-color', stationColorMatchExpression());
      return;
    }

    // Update features with visited property
    const features = stations.map((s) => ({
      type: 'Feature' as const,
      properties: {
        id: s.id,
        name: s.name,
        country: s.country,
        connections: s.connections,
        visited: visitedStations.has(s.id) ? 1 : 0,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [s.lng, s.lat],
      },
    }));

    source.setData({ type: 'FeatureCollection', features });

    // Use case expression: visited stations are red, others keep country color
    map.setPaintProperty('station-dots', 'circle-color', [
      'case',
      ['==', ['get', 'visited'], 1],
      '#ef4444',
      stationColorMatchExpression(),
    ] as mapboxgl.Expression);
  }, [visitedStations, phase, mapLoaded, stations]);

  // Update hiding zone circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource('hiding-zone') as mapboxgl.GeoJSONSource;
    if (!source) return;

    if (playerRole === 'seeker') {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    if (!hidingZone) {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    // Create circle as GeoJSON polygon (approximate 0.8km radius)
    const center = [hidingZone.lng, hidingZone.lat];
    const radiusKm = hidingZone.radius;
    const points = 64;
    const coords: [number, number][] = [];

    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * 2 * Math.PI;
      const dx = radiusKm * Math.cos(angle);
      const dy = radiusKm * Math.sin(angle);
      const lat = center[1] + (dy / 111.32);
      const lng = center[0] + (dx / (111.32 * Math.cos(center[1] * Math.PI / 180)));
      coords.push([lng, lat]);
    }

    source.setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [coords] },
      }],
    });
  }, [hidingZone, playerRole, mapLoaded]);

  // Radar preview circle on hover
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource('radar-preview') as mapboxgl.GeoJSONSource;
    if (!source) return;

    if (!hoveredRadarRadius || !playerStationId) {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const stationMap = getStations();
    const station = stationMap[playerStationId];
    if (!station) {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    // Use train position if in transit
    let centerLng = station.lng;
    let centerLat = station.lat;
    if (playerTransit && clock.gameMinutes >= playerTransit.departureTime) {
      const pos = findTransitTrainPosition(playerTransit, clock.gameMinutes);
      if (pos) {
        [centerLng, centerLat] = pos;
      }
    }
    const radiusKm = hoveredRadarRadius;
    const points = 64;
    const coords: [number, number][] = [];

    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * 2 * Math.PI;
      const dx = radiusKm * Math.cos(angle);
      const dy = radiusKm * Math.sin(angle);
      const lat = centerLat + (dy / 111.32);
      const lng = centerLng + (dx / (111.32 * Math.cos(centerLat * Math.PI / 180)));
      coords.push([lng, lat]);
    }

    source.setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [coords] },
      }],
    });
  }, [hoveredRadarRadius, playerStationId, playerTransit, clock.gameMinutes, mapLoaded]);

  // Update train positions on clock tick (throttled to ~100ms)
  const lastTrainUpdateRef = useRef(0);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || phase === 'setup') return;

    const now = performance.now();
    if (now - lastTrainUpdateRef.current < 100) return;
    lastTrainUpdateRef.current = now;

    updateTrainPositions(map, clock.gameMinutes);
  }, [clock.gameMinutes, mapLoaded, phase]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />

      {popup && (
        <div className="absolute top-14 right-4 bg-gray-900/95 backdrop-blur text-white p-4 rounded-lg shadow-xl max-w-xs border border-gray-700/60 z-20">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-amber-400 text-lg">{popup.station.name}</h3>
            <button
              onClick={() => setPopup(null)}
              className="text-gray-400 hover:text-white ml-2 text-xl leading-none"
            >
              &times;
            </button>
          </div>
          <p className="text-gray-300 text-sm mb-1">{popup.station.country}</p>
          <p className="text-gray-400 text-xs mb-3">
            {popup.station.lat.toFixed(4)}°N, {popup.station.lng.toFixed(4)}°E
          </p>
          <div>
            <h4 className="text-sm font-semibold text-gray-300 mb-1">
              Connections ({popup.neighbors.length}):
            </h4>
            <ul className="text-sm text-gray-400 space-y-0.5">
              {popup.neighbors.map((n, i) => (
                <li key={`${i}-${n}`}>• {n}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <style>{`
        .mapboxgl-marker {
          z-index: 5 !important;
        }
        .train-popup .mapboxgl-popup-content {
          background: rgba(17, 24, 39, 0.95);
          border: 1px solid #374151;
          border-radius: 8px;
          padding: 8px 12px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        }
        .train-popup .mapboxgl-popup-tip {
          border-top-color: rgba(17, 24, 39, 0.95);
        }
      `}</style>
    </div>
  );
}
