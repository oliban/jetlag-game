import mapboxgl from 'mapbox-gl';
import type { TrainType } from '../types/game';
import type { TrainDelay, TrainAccident } from '../types/disruptions';
import type { StationMap } from '../data/graph';
import { getStations } from '../data/graph';
import { getActiveTrains } from '../engine/activeTrains';
import { getRoutes } from '../engine/trainRoutes';
import { getBlockedSegments, isTrainBlockedOnSegment, isSegmentBlocked, getSegmentBlock } from '../engine/segmentBlock';
import { RAILWAY_COLORS, TRAIN_COLORS } from '../theme/colors';

const TRAIN_CARS: Record<TrainType, number> = {
  express: 5,
  regional: 4,
  local: 3,
};

const TRAIN_LABELS: Record<TrainType, string> = {
  express: 'Express',
  regional: 'Regional',
  local: 'Local',
};

/** Railway company names per country */
const RAILWAY_NAMES: Record<string, string> = {
  France: 'SNCF',
  'United Kingdom': 'National Rail',
  Germany: 'DB',
  Netherlands: 'NS',
  Belgium: 'SNCB',
  Switzerland: 'SBB',
  Austria: 'ÖBB',
  Italy: 'Trenitalia',
  Spain: 'Renfe',
  'Czech Republic': 'ČD',
  Poland: 'PKP',
  Hungary: 'MÁV',
  Denmark: 'DSB',
};

/** All countries that have railway colors */
const ALL_COUNTRIES = Object.keys(RAILWAY_COLORS);

/** Draw a multi-car train icon colored by country, return ImageData for Mapbox */
function createTrainImage(trainType: TrainType, country: string): { width: number; height: number; data: Uint8ClampedArray } {
  const pixelRatio = 2;
  const carWidth = 4;
  const carHeight = 12;
  const gap = 1;
  const numCars = TRAIN_CARS[trainType];

  const railwayColor = RAILWAY_COLORS[country];
  const color = railwayColor?.train ?? TRAIN_COLORS[trainType];
  const engineColor = railwayColor?.engine ?? color;

  const totalHeight = numCars * carHeight + (numCars - 1) * gap;
  const padding = 2;
  const canvasW = (carWidth + padding * 2) * pixelRatio;
  const canvasH = (totalHeight + padding * 2) * pixelRatio;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(pixelRatio, pixelRatio);

  for (let i = 0; i < numCars; i++) {
    const y = padding + i * (carHeight + gap);
    const r = 1.5;
    ctx.beginPath();
    ctx.roundRect(padding, y, carWidth, carHeight, r);
    ctx.fillStyle = i === 0 ? engineColor : color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  const imageData = ctx.getImageData(0, 0, canvasW, canvasH);
  return { width: canvasW, height: canvasH, data: imageData.data };
}

/** Register train icons on the map: one per type × country (call once on load) */
export function addTrainIcons(map: mapboxgl.Map): void {
  const types: TrainType[] = ['express', 'regional', 'local'];
  for (const t of types) {
    for (const country of ALL_COUNTRIES) {
      const img = createTrainImage(t, country);
      map.addImage(`train-${t}-${country}`, img, { pixelRatio: 2 });
    }
  }
}

/** Set up the active-trains source and train-icons layer */
export function initTrainLayer(map: mapboxgl.Map): void {
  addTrainIcons(map);

  map.addSource('active-trains', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addLayer(
    {
      id: 'train-icons',
      type: 'symbol',
      source: 'active-trains',
      layout: {
        'icon-image': ['concat', 'train-', ['get', 'trainType'], '-', ['get', 'country']],
        'icon-rotate': ['get', 'bearing'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          3, 0.6,
          6, 1.0,
          10, 1.8,
        ],
      },
    },
    'station-dots', // insert below station-dots
  );

  // Highlight source+layer for next station on train hover (blue ring)
  map.addSource('train-next-station', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addLayer({
    id: 'train-next-station-glow',
    type: 'circle',
    source: 'train-next-station',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 12, 8, 24],
      'circle-color': '#3b82f6',
      'circle-opacity': 0.3,
      'circle-blur': 0.5,
    },
  });

  map.addLayer({
    id: 'train-next-station-ring',
    type: 'circle',
    source: 'train-next-station',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 8, 8, 16],
      'circle-color': 'transparent',
      'circle-stroke-color': '#3b82f6',
      'circle-stroke-width': 3,
      'circle-stroke-opacity': 0.9,
    },
  });

  // Highlight source+layer for player's current station on train hover (amber ring)
  map.addSource('train-current-station', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addLayer({
    id: 'train-current-station-glow',
    type: 'circle',
    source: 'train-current-station',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 12, 8, 24],
      'circle-color': '#f59e0b',
      'circle-opacity': 0.3,
      'circle-blur': 0.5,
    },
  });

  map.addLayer({
    id: 'train-current-station-ring',
    type: 'circle',
    source: 'train-current-station',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 8, 8, 16],
      'circle-color': 'transparent',
      'circle-stroke-color': '#f59e0b',
      'circle-stroke-width': 3,
      'circle-stroke-opacity': 0.9,
    },
  });
}

/**
 * Module-level state: snapshot of blocked trains so they persist
 * after their schedule ends. Key = train instance ID.
 */
const frozenBlockedTrains = new Map<string, {
  fromStationId: string;
  toStationId: string;
  feature: GeoJSON.Feature;
}>();

/** Update train positions for the current game time */
export function updateTrainPositions(
  map: mapboxgl.Map,
  gameMinutes: number,
  delays?: Map<string, TrainDelay>,
  accidents?: Map<string, TrainAccident>,
): void {
  const source = map.getSource('active-trains') as mapboxgl.GeoJSONSource;
  if (!source) return;

  const trains = getActiveTrains(gameMinutes);
  const stationMap = getStations();

  // Compute blocked segments from accidents
  const blockedSegments = accidents ? getBlockedSegments(accidents, gameMinutes) : new Map();

  // Also include accident-stalled trains that have "left" the schedule
  // (their scheduled journey ended but they're still stopped)
  const activeTrainIds = new Set(trains.map(t => t.id));
  const stalledFeatures: GeoJSON.Feature[] = [];
  if (accidents) {
    for (const [trainId, accident] of accidents) {
      if (activeTrainIds.has(trainId)) continue; // still in schedule, handled below
      if (gameMinutes >= accident.resumeAt) continue; // accident over
      // Train fell off the schedule but is still stalled — render at stopped position
      const parts = trainId.split(':');
      const routeId = parts[0];
      const route = getRoutes().find(r => r.id === routeId);
      if (!route) continue;
      const originCountry = stationMap[route.stations[0]]?.country ?? 'France';
      stalledFeatures.push({
        type: 'Feature',
        properties: {
          id: trainId,
          routeId,
          trainType: route.trainType,
          country: originCountry,
          bearing: 0,
          progress: accident.progress,
          stations: '[]',
          finalStationId: '',
          nextStationId: accident.segmentToStationId,
          currentSegmentIndex: 0,
          speed: 0,
          dwelling: false,
          dwellingStationId: null,
          accident: true,
          blocked: false,
          delayMinutes: 0,
        },
        geometry: {
          type: 'Point',
          coordinates: [accident.stoppedAtLng, accident.stoppedAtLat],
        },
      });
    }
  }

  const features: GeoJSON.Feature[] = [];

  for (const train of trains) {
    const accident = accidents?.get(train.id);
    const delay = delays?.get(train.id);
    const hasAccident = accident && gameMinutes < accident.resumeAt;
    const delayMin = delay && !delay.resolved ? delay.delayMinutes : 0;

    // If this train was previously frozen on a blocked segment, check if still blocked
    const frozen = frozenBlockedTrains.get(train.id);
    if (frozen && isSegmentBlocked(blockedSegments, frozen.fromStationId, frozen.toStationId)) {
      // Still blocked — keep rendering at frozen position, don't follow schedule
      features.push(frozen.feature);
      continue;
    } else if (frozen) {
      // Segment cleared — unfreeze, render normally
      frozenBlockedTrains.delete(train.id);
    }

    // Check if train is blocked by an accident ahead on the same segment
    let isBlocked = false;
    let blockedLng = train.lng;
    let blockedLat = train.lat;
    let blockedFrom = '';
    let blockedTo = '';

    if (!hasAccident && blockedSegments.size > 0) {
      if (train.dwelling && train.dwellingStationId) {
        // Dwelling train: check if next segment is blocked
        const nextStationId = train.nextStationId;
        if (isSegmentBlocked(blockedSegments, train.dwellingStationId, nextStationId)) {
          isBlocked = true;
          blockedFrom = train.dwellingStationId;
          blockedTo = nextStationId;
          // Already at station, no position override needed
        }
      } else {
        // Moving train: check if blocked on current segment
        const fromStation = train.stations[train.currentSegmentIndex];
        const toStation = train.stations[train.currentSegmentIndex + 1];
        if (fromStation && toStation && isTrainBlockedOnSegment(blockedSegments, fromStation, toStation, train.id)) {
          isBlocked = true;
          blockedFrom = fromStation;
          blockedTo = toStation;
          // Train halts in place, well behind the accident (away from smoke)
          const block = getSegmentBlock(blockedSegments, fromStation, toStation);
          const fromSt = stationMap[fromStation];
          const toSt = stationMap[toStation];
          if (block && fromSt && toSt) {
            const cappedProgress = Math.min(train.progress, Math.max(0, block.accidentProgress - 0.20));
            blockedLng = fromSt.lng + (toSt.lng - fromSt.lng) * cappedProgress;
            blockedLat = fromSt.lat + (toSt.lat - fromSt.lat) * cappedProgress;
          }
        }
      }
    }

    // If train has an accident, freeze it at the accident position
    const lng = hasAccident ? accident.stoppedAtLng : isBlocked ? blockedLng : train.lng;
    const lat = hasAccident ? accident.stoppedAtLat : isBlocked ? blockedLat : train.lat;
    const bearing = train.bearing;

    const feature: GeoJSON.Feature = {
      type: 'Feature',
      properties: {
        id: train.id,
        routeId: train.routeId,
        trainType: train.trainType,
        country: train.country,
        bearing,
        progress: hasAccident ? accident.progress : train.progress,
        stations: JSON.stringify(train.stations),
        finalStationId: train.finalStationId,
        nextStationId: train.nextStationId,
        currentSegmentIndex: train.currentSegmentIndex,
        speed: hasAccident ? 0 : isBlocked ? 0 : train.speed,
        dwelling: hasAccident ? false : train.dwelling,
        dwellingStationId: hasAccident ? null : train.dwellingStationId,
        accident: !!hasAccident,
        blocked: isBlocked,
        delayMinutes: delayMin,
      },
      geometry: {
        type: 'Point',
        coordinates: [lng, lat],
      },
    };

    features.push(feature);

    // Snapshot blocked trains so they persist after schedule ends
    if (isBlocked) {
      frozenBlockedTrains.set(train.id, {
        fromStationId: blockedFrom,
        toStationId: blockedTo,
        feature,
      });
    }
  }

  // Render frozen blocked trains that fell off the schedule
  for (const [trainId, frozen] of frozenBlockedTrains) {
    if (activeTrainIds.has(trainId)) continue; // already processed above
    if (isSegmentBlocked(blockedSegments, frozen.fromStationId, frozen.toStationId)) {
      // Segment still blocked — keep rendering at frozen position
      features.push(frozen.feature);
    } else {
      // Segment cleared — remove snapshot
      frozenBlockedTrains.delete(trainId);
    }
  }

  source.setData({ type: 'FeatureCollection', features: [...features, ...stalledFeatures] });
}

/** Set up hover tooltip on train icons */
export function initTrainHover(
  map: mapboxgl.Map,
  stationMap: StationMap,
  getPlayerStationId: () => string | null,
): void {
  const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    className: 'train-popup',
    offset: 12,
  });

  map.on('mouseenter', 'train-icons', () => {
    map.getCanvas().style.cursor = 'pointer';
  });

  const emptyFC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

  const clearHighlights = () => {
    const nextSrc = map.getSource('train-next-station') as mapboxgl.GeoJSONSource | undefined;
    const currSrc = map.getSource('train-current-station') as mapboxgl.GeoJSONSource | undefined;
    nextSrc?.setData(emptyFC);
    currSrc?.setData(emptyFC);
  };

  map.on('mouseleave', 'train-icons', () => {
    map.getCanvas().style.cursor = '';
    popup.remove();
    clearHighlights();
  });

  map.on('mousemove', 'train-icons', (e) => {
    if (!e.features?.[0]) return;

    const props = e.features[0].properties!;
    const trainType = props.trainType as TrainType;
    const trainCountry = props.country as string;
    const color = RAILWAY_COLORS[trainCountry]?.train ?? TRAIN_COLORS[trainType];
    const railwayName = RAILWAY_NAMES[trainCountry] ?? trainCountry;
    const label = TRAIN_LABELS[trainType];
    const speed = props.speed as number;
    const dwelling = props.dwelling;
    const dwellingStationId = props.dwellingStationId as string | null;
    const nextStationId = props.nextStationId as string;

    // Build popup DOM safely (no innerHTML/setHTML)
    const playerStId = getPlayerStationId();
    const nextName = stationMap[nextStationId]?.name ?? nextStationId;

    const container = document.createElement('div');
    container.style.cssText = 'font-size:13px;line-height:1.4;color:#e2e8f0;';

    // Route line
    const routeDiv = document.createElement('div');
    routeDiv.style.fontWeight = '600';

    // Build route with styled station names
    let stationIds: string[] = [];
    try {
      stationIds = JSON.parse(props.stations as string);
    } catch {
      stationIds = [];
    }

    stationIds.forEach((id, idx) => {
      if (idx > 0) {
        const arrow = document.createElement('span');
        arrow.style.color = '#64748b';
        arrow.textContent = ' \u2192 ';
        routeDiv.appendChild(arrow);
      }
      const nameSpan = document.createElement('span');
      nameSpan.textContent = stationMap[id]?.name ?? id;
      if (id === playerStId) {
        nameSpan.style.cssText = 'color:#f59e0b;font-weight:700;';
      } else if (id === nextStationId) {
        nameSpan.style.cssText = 'color:#3b82f6;font-weight:700;';
      }
      routeDiv.appendChild(nameSpan);
    });
    container.appendChild(routeDiv);

    // Info line
    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = `color:${color};font-size:11px;margin-top:2px;`;
    infoDiv.textContent = `${railwayName} \u00b7 ${label} \u00b7 ${speed} km/h`;
    container.appendChild(infoDiv);

    // Status line
    const statusDiv = document.createElement('div');
    statusDiv.style.cssText = 'font-size:11px;margin-top:2px;color:#94a3b8;';

    const isAccident = props.accident as boolean;
    const isBlockedProp = props.blocked as boolean;
    const delayMinutes = props.delayMinutes as number;

    if (isAccident) {
      statusDiv.style.color = '#ef4444';
      statusDiv.style.fontWeight = '700';
      statusDiv.textContent = 'ACCIDENT — Train stopped';
    } else if (isBlockedProp) {
      statusDiv.style.color = '#eab308';
      statusDiv.style.fontWeight = '600';
      statusDiv.textContent = 'Halted — Waiting for track to clear';
    } else if (dwelling && dwellingStationId && dwellingStationId !== 'null') {
      const dwellingName = stationMap[dwellingStationId]?.name ?? dwellingStationId;
      statusDiv.textContent = 'Stopped at: ';
      const dwellSpan = document.createElement('span');
      dwellSpan.style.color = '#f59e0b';
      dwellSpan.textContent = dwellingName;
      statusDiv.appendChild(dwellSpan);
    } else {
      statusDiv.textContent = 'Next: ';
      const nextSpan = document.createElement('span');
      nextSpan.style.color = '#3b82f6';
      nextSpan.textContent = nextName;
      statusDiv.appendChild(nextSpan);
    }
    container.appendChild(statusDiv);

    if (delayMinutes > 0 && !isAccident) {
      const delayDiv = document.createElement('div');
      delayDiv.style.cssText = 'font-size:11px;margin-top:2px;color:#f97316;font-weight:600;';
      delayDiv.textContent = `DELAYED +${delayMinutes}min`;
      container.appendChild(delayDiv);
    }

    popup
      .setLngLat(e.lngLat)
      .setDOMContent(container)
      .addTo(map);

    // Highlight next station (blue)
    const nextSrc = map.getSource('train-next-station') as mapboxgl.GeoJSONSource | undefined;
    if (nextSrc) {
      const nextStation = stationMap[nextStationId];
      if (nextStation) {
        nextSrc.setData({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [nextStation.lng, nextStation.lat] },
          }],
        });
      } else {
        nextSrc.setData(emptyFC);
      }
    }

    // Highlight player's current station (amber)
    const currSrc = map.getSource('train-current-station') as mapboxgl.GeoJSONSource | undefined;
    if (currSrc) {
      const playerStId = getPlayerStationId();
      const playerStation = playerStId ? stationMap[playerStId] : null;
      if (playerStation) {
        currSrc.setData({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [playerStation.lng, playerStation.lat] },
          }],
        });
      } else {
        currSrc.setData(emptyFC);
      }
    }
  });
}

/** Set up click-to-board on dwelling trains at the player's station */
export function initTrainClick(
  map: mapboxgl.Map,
  getPlayerStationId: () => string | null,
  onBoard: (routeId: string, destinationStationId: string, departureTime: number) => void,
): void {
  map.on('click', 'train-icons', (e) => {
    if (!e.features?.[0]) return;

    const props = e.features[0].properties!;
    const dwelling = props.dwelling;
    const dwellingStationId = props.dwellingStationId as string | null;
    const routeId = props.routeId as string;
    const trainId = props.id as string;
    const finalStationId = props.finalStationId as string;

    // Parse origin departure from train id: "{routeId}:{dir}:{originDep}"
    const parts = trainId.split(':');
    const direction = parts[1] as 'forward' | 'reverse';
    const originDep = parseFloat(parts[2]);

    const playerStId = getPlayerStationId();
    if (!playerStId) return;

    const route = getRoutes().find(r => r.id === routeId);
    if (!route) return;

    const stopTimes = direction === 'forward' ? route.stopTimes : route.reverseStopTimes;

    // Path 1: Board a dwelling train at the player's station
    if (dwelling && dwellingStationId && dwellingStationId !== 'null' && playerStId === dwellingStationId) {
      const stop = stopTimes.find(s => s.stationId === dwellingStationId);
      if (!stop) return;
      const stationDep = originDep + stop.departureMin;
      onBoard(routeId, finalStationId, stationDep);
      return;
    }

    // Path 2: Pre-book an approaching train whose route passes through the player's station
    let stationIds: string[];
    try {
      stationIds = JSON.parse(props.stations as string);
    } catch { return; }

    const currentSegIdx = props.currentSegmentIndex as number;
    const playerIdx = stationIds.indexOf(playerStId);
    // Player's station must be ahead on the route (index > currentSegmentIndex)
    if (playerIdx < 0 || playerIdx <= currentSegIdx) return;

    const stop = stopTimes.find(s => s.stationId === playerStId);
    if (!stop) return;

    const stationDep = originDep + stop.departureMin;
    onBoard(routeId, finalStationId, stationDep);
  });
}
