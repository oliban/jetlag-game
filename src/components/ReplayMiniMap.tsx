import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getStationList, getConnections, getStations } from '../data/graph';
import type { TravelHistoryEntry } from '../types/game';
import ReplayScrubber from './ReplayScrubber';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

/** Game-minutes replayed per real second */
const REPLAY_SPEED = 20;

interface ReplayMiniMapProps {
  history: TravelHistoryEntry[];
  hiderStationId: string;
  seekerStartStationId: string;
  totalGameMinutes: number;
  gameResult: 'seeker_wins' | 'hider_wins';
}

// --- Particle system for end-of-replay effects ---

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  decay: number;
}

const SPARKLE_COLORS = ['#fbbf24', '#ffffff', '#86efac', '#fde68a', '#a7f3d0'];
const FIZZLE_COLORS = ['#6b7280', '#4b5563', '#9ca3af', '#ef4444'];

function createSparkleParticles(cx: number, cy: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < 50; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 80;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 1.5 + Math.random() * 3,
      color: SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)],
      alpha: 1,
      life: 0,
      maxLife: 1.2 + Math.random() * 0.8,
      decay: 0,
    });
  }
  // Add a few larger "star" particles
  for (let i = 0; i < 8; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 15 + Math.random() * 40;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 3 + Math.random() * 3,
      color: '#ffffff',
      alpha: 1,
      life: 0,
      maxLife: 0.6 + Math.random() * 0.6,
      decay: 0,
    });
  }
  return particles;
}

function createFizzleParticles(cx: number, cy: number): Particle[] {
  const particles: Particle[] = [];
  // Smoke-like particles drifting upward
  for (let i = 0; i < 20; i++) {
    particles.push({
      x: cx + (Math.random() - 0.5) * 10,
      y: cy,
      vx: (Math.random() - 0.5) * 15,
      vy: -(10 + Math.random() * 30),
      size: 2 + Math.random() * 4,
      color: FIZZLE_COLORS[Math.floor(Math.random() * FIZZLE_COLORS.length)],
      alpha: 0.7,
      life: 0,
      maxLife: 1.5 + Math.random() * 1,
      decay: 0,
    });
  }
  return particles;
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  dt: number,
  isSparkle: boolean,
): boolean {
  let alive = false;
  for (const p of particles) {
    p.life += dt;
    if (p.life >= p.maxLife) continue;
    alive = true;

    const progress = p.life / p.maxLife;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    // Decelerate
    p.vx *= (1 - dt * 2);
    p.vy *= (1 - dt * 2);
    if (!isSparkle) {
      // Fizzle particles float up and slow
      p.vy -= dt * 5;
    }

    // Fade out
    p.alpha = Math.max(0, 1 - progress);
    const size = isSparkle
      ? p.size * (1 - progress * 0.5)
      : p.size * (1 + progress * 0.5); // fizzle: grow and fade

    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;

    if (isSparkle) {
      // Draw 4-pointed star
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(progress * Math.PI);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
        const outerR = size;
        const innerR = size * 0.3;
        ctx.lineTo(Math.cos(a) * outerR, Math.sin(a) * outerR);
        const midA = a + Math.PI / 4;
        ctx.lineTo(Math.cos(midA) * innerR, Math.sin(midA) * innerR);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      // Fizzle: soft circle
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  return alive;
}

function getPositionAtTime(
  history: TravelHistoryEntry[],
  time: number,
  startStationId: string,
  stationMap: Record<string, { lat: number; lng: number }>,
): [number, number] {
  // Before any travel, at start station
  if (history.length === 0 || time <= history[0].departureTime) {
    const s = stationMap[startStationId];
    return s ? [s.lng, s.lat] : [0, 0];
  }

  // Find the active segment
  for (const entry of history) {
    if (time >= entry.departureTime && time <= entry.arrivalTime) {
      const from = stationMap[entry.fromStationId];
      const to = stationMap[entry.toStationId];
      if (!from || !to) continue;
      const duration = entry.arrivalTime - entry.departureTime;
      const progress = duration > 0 ? Math.min(1, (time - entry.departureTime) / duration) : 1;
      return [
        from.lng + (to.lng - from.lng) * progress,
        from.lat + (to.lat - from.lat) * progress,
      ];
    }
  }

  // After all travel, at last station
  const last = history[history.length - 1];
  const s = stationMap[last.toStationId];
  return s ? [s.lng, s.lat] : [0, 0];
}

function getTrailCoordsAtTime(
  history: TravelHistoryEntry[],
  time: number,
  startStationId: string,
  stationMap: Record<string, { lat: number; lng: number }>,
): [number, number][] {
  const start = stationMap[startStationId];
  if (!start) return [];

  const coords: [number, number][] = [[start.lng, start.lat]];

  for (const entry of history) {
    const from = stationMap[entry.fromStationId];
    const to = stationMap[entry.toStationId];
    if (!from || !to) continue;

    if (time < entry.departureTime) break;

    // Add from station if not already at end of coords
    const last = coords[coords.length - 1];
    if (Math.abs(last[0] - from.lng) > 0.001 || Math.abs(last[1] - from.lat) > 0.001) {
      coords.push([from.lng, from.lat]);
    }

    if (time >= entry.arrivalTime) {
      // Completed segment — add destination
      coords.push([to.lng, to.lat]);
    } else {
      // In-progress segment — add interpolated position
      const duration = entry.arrivalTime - entry.departureTime;
      const progress = duration > 0 ? (time - entry.departureTime) / duration : 1;
      coords.push([
        from.lng + (to.lng - from.lng) * progress,
        from.lat + (to.lat - from.lat) * progress,
      ]);
      break;
    }
  }

  return coords;
}

export default function ReplayMiniMap({
  history,
  hiderStationId,
  seekerStartStationId,
  totalGameMinutes,
  gameResult,
}: ReplayMiniMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const particleRafRef = useRef<number>(0);
  const effectTriggeredRef = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [replayTime, setReplayTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const stations = useMemo(() => getStationList(), []);
  const connections = useMemo(() => getConnections(), []);
  const stationMap = useMemo(() => getStations(), []);

  // Compute bounds for the route + hider + start
  const bounds = useMemo(() => {
    const lngs: number[] = [];
    const lats: number[] = [];

    const start = stationMap[seekerStartStationId];
    if (start) { lngs.push(start.lng); lats.push(start.lat); }

    const hider = stationMap[hiderStationId];
    if (hider) { lngs.push(hider.lng); lats.push(hider.lat); }

    for (const entry of history) {
      const from = stationMap[entry.fromStationId];
      const to = stationMap[entry.toStationId];
      if (from) { lngs.push(from.lng); lats.push(from.lat); }
      if (to) { lngs.push(to.lng); lats.push(to.lat); }
    }

    if (lngs.length === 0) return null;
    return new mapboxgl.LngLatBounds(
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    );
  }, [history, hiderStationId, seekerStartStationId, stationMap]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [10, 50],
      zoom: 4,
      interactive: false,
      attributionControl: false,
    });

    mapRef.current = map;

    map.on('load', () => {
      // Background connections (faint)
      const lineFeatures = connections.map((c) => {
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
      }).filter(Boolean);

      map.addSource('bg-connections', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: lineFeatures as GeoJSON.Feature[] },
      });

      map.addLayer({
        id: 'bg-connection-lines',
        type: 'line',
        source: 'bg-connections',
        paint: {
          'line-color': '#94a3b8',
          'line-opacity': 0.15,
          'line-width': 1,
        },
      });

      // Background stations (faint dots)
      const stationFeatures = stations.map((s) => ({
        type: 'Feature' as const,
        properties: { id: s.id },
        geometry: {
          type: 'Point' as const,
          coordinates: [s.lng, s.lat],
        },
      }));

      map.addSource('bg-stations', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: stationFeatures },
      });

      map.addLayer({
        id: 'bg-station-dots',
        type: 'circle',
        source: 'bg-stations',
        paint: {
          'circle-radius': 2.5,
          'circle-color': '#94a3b8',
          'circle-opacity': 0.3,
        },
      });

      // Trail glow (wider, dimmer behind the trail)
      map.addSource('seeker-trail', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'seeker-trail-glow',
        type: 'line',
        source: 'seeker-trail',
        paint: {
          'line-color': '#ef4444',
          'line-opacity': 0.3,
          'line-width': 6,
          'line-blur': 4,
        },
      });

      // Trail line (sharp red)
      map.addLayer({
        id: 'seeker-trail-line',
        type: 'line',
        source: 'seeker-trail',
        paint: {
          'line-color': '#ef4444',
          'line-opacity': 0.9,
          'line-width': 2.5,
        },
      });

      // Hider marker (green dot)
      const hiderStation = stationMap[hiderStationId];
      if (hiderStation) {
        map.addSource('hider-marker', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Point',
                coordinates: [hiderStation.lng, hiderStation.lat],
              },
            }],
          },
        });

        map.addLayer({
          id: 'hider-marker-glow',
          type: 'circle',
          source: 'hider-marker',
          paint: {
            'circle-radius': 10,
            'circle-color': '#22c55e',
            'circle-opacity': 0.2,
            'circle-blur': 0.5,
          },
        });

        map.addLayer({
          id: 'hider-marker-dot',
          type: 'circle',
          source: 'hider-marker',
          paint: {
            'circle-radius': 5,
            'circle-color': '#22c55e',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.5,
          },
        });
      }

      // Start marker (small white dot)
      const startStation = stationMap[seekerStartStationId];
      if (startStation) {
        map.addSource('start-marker', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Point',
                coordinates: [startStation.lng, startStation.lat],
              },
            }],
          },
        });

        map.addLayer({
          id: 'start-marker-dot',
          type: 'circle',
          source: 'start-marker',
          paint: {
            'circle-radius': 4,
            'circle-color': '#ffffff',
            'circle-stroke-color': '#ef4444',
            'circle-stroke-width': 1.5,
            'circle-opacity': 0.8,
          },
        });
      }

      // Seeker dot (animated red circle)
      map.addSource('seeker-dot', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'seeker-dot-glow',
        type: 'circle',
        source: 'seeker-dot',
        paint: {
          'circle-radius': 10,
          'circle-color': '#ef4444',
          'circle-opacity': 0.3,
          'circle-blur': 0.5,
        },
      });

      map.addLayer({
        id: 'seeker-dot-circle',
        type: 'circle',
        source: 'seeker-dot',
        paint: {
          'circle-radius': 5,
          'circle-color': '#ef4444',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });

      // Fit bounds
      if (bounds) {
        map.fitBounds(bounds, { padding: 40, duration: 0 });
      }

      setMapLoaded(true);
    });

    return () => {
      if (particleRafRef.current) cancelAnimationFrame(particleRafRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update sources when replayTime changes
  const updateSources = useCallback((time: number) => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const pos = getPositionAtTime(history, time, seekerStartStationId, stationMap);
    const trail = getTrailCoordsAtTime(history, time, seekerStartStationId, stationMap);

    // Update seeker dot
    const dotSource = map.getSource('seeker-dot') as mapboxgl.GeoJSONSource | undefined;
    if (dotSource) {
      dotSource.setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: pos },
        }],
      });
    }

    // Update trail
    const trailSource = map.getSource('seeker-trail') as mapboxgl.GeoJSONSource | undefined;
    if (trailSource && trail.length >= 2) {
      trailSource.setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: trail },
        }],
      });
    } else if (trailSource) {
      trailSource.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [history, seekerStartStationId, stationMap, mapLoaded]);

  // Animation loop
  useEffect(() => {
    if (!mapLoaded || !isPlaying) return;

    lastFrameRef.current = performance.now();

    const animate = (now: number) => {
      const dt = (now - lastFrameRef.current) / 1000; // real seconds
      lastFrameRef.current = now;

      setReplayTime((prev) => {
        const next = prev + dt * REPLAY_SPEED;
        if (next >= totalGameMinutes) {
          setIsPlaying(false);
          return totalGameMinutes;
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [mapLoaded, isPlaying, totalGameMinutes]);

  // Sync sources with replayTime
  useEffect(() => {
    updateSources(replayTime);
  }, [replayTime, updateSources]);

  // Trigger end-of-replay effect
  useEffect(() => {
    if (replayTime < totalGameMinutes || effectTriggeredRef.current) return;
    if (!mapRef.current || !canvasRef.current) return;

    effectTriggeredRef.current = true;
    const map = mapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Size the overlay canvas to match the map container
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      canvas.width = rect.width * devicePixelRatio;
      canvas.height = rect.height * devicePixelRatio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(devicePixelRatio, devicePixelRatio);
    }

    const isSparkle = gameResult === 'seeker_wins';

    // Get pixel position for the effect origin
    let effectLngLat: [number, number];
    if (isSparkle) {
      // Sparkle at the hider location
      const hider = stationMap[hiderStationId];
      effectLngLat = hider ? [hider.lng, hider.lat] : [0, 0];
    } else {
      // Fizzle at the seeker's final position
      effectLngLat = getPositionAtTime(history, totalGameMinutes, seekerStartStationId, stationMap);
    }

    const point = map.project(effectLngLat as [number, number]);
    const cx = point.x;
    const cy = point.y;

    // Create particles
    particlesRef.current = isSparkle
      ? createSparkleParticles(cx, cy)
      : createFizzleParticles(cx, cy);

    // For hider_wins: fade the trail to gray
    if (!isSparkle) {
      try {
        map.setPaintProperty('seeker-trail-line', 'line-color', '#4b5563');
        map.setPaintProperty('seeker-trail-line', 'line-opacity', 0.4);
        map.setPaintProperty('seeker-trail-glow', 'line-opacity', 0.1);
        map.setPaintProperty('seeker-dot-circle', 'circle-opacity', 0.3);
        map.setPaintProperty('seeker-dot-circle', 'circle-color', '#6b7280');
        map.setPaintProperty('seeker-dot-glow', 'circle-opacity', 0.1);
      } catch { /* layer might not exist */ }
    }

    // Particle animation loop
    let lastTime = performance.now();
    const animateParticles = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      ctx.clearRect(0, 0, canvas.width / devicePixelRatio, canvas.height / devicePixelRatio);
      const alive = drawParticles(ctx, particlesRef.current, dt, isSparkle);

      if (alive) {
        particleRafRef.current = requestAnimationFrame(animateParticles);
      }
    };

    particleRafRef.current = requestAnimationFrame(animateParticles);

    return () => {
      if (particleRafRef.current) cancelAnimationFrame(particleRafRef.current);
    };
  }, [replayTime, totalGameMinutes, gameResult, hiderStationId, seekerStartStationId, history, stationMap]);

  // Reset effect state when seeking back
  useEffect(() => {
    if (replayTime < totalGameMinutes && effectTriggeredRef.current) {
      effectTriggeredRef.current = false;
      // Restore trail colors
      const map = mapRef.current;
      if (map) {
        try {
          map.setPaintProperty('seeker-trail-line', 'line-color', '#ef4444');
          map.setPaintProperty('seeker-trail-line', 'line-opacity', 0.9);
          map.setPaintProperty('seeker-trail-glow', 'line-opacity', 0.3);
          map.setPaintProperty('seeker-dot-circle', 'circle-opacity', 1);
          map.setPaintProperty('seeker-dot-circle', 'circle-color', '#ef4444');
          map.setPaintProperty('seeker-dot-glow', 'circle-opacity', 0.3);
        } catch { /* layer might not exist */ }
      }
      // Clear particles
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      particlesRef.current = [];
      if (particleRafRef.current) cancelAnimationFrame(particleRafRef.current);
    }
  }, [replayTime, totalGameMinutes]);

  const handleSeek = useCallback((time: number) => {
    setIsPlaying(false);
    setReplayTime(time);
  }, []);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      // If at end, restart
      if (!prev && replayTime >= totalGameMinutes) {
        setReplayTime(0);
      }
      return !prev;
    });
  }, [replayTime, totalGameMinutes]);

  return (
    <div>
      <div className="relative h-[200px] md:h-[280px]">
        <div
          ref={mapContainer}
          className="w-full h-full rounded-lg border border-[#1a3a6a]/40 overflow-hidden"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none rounded-lg"
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <ReplayScrubber
        currentTime={replayTime}
        totalTime={totalGameMinutes}
        isPlaying={isPlaying}
        onSeek={handleSeek}
        onTogglePlay={handleTogglePlay}
      />
    </div>
  );
}
