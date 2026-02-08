import mapboxgl from 'mapbox-gl';
import type { TrainType } from '../types/game';
import type { StationMap } from '../data/graph';
import { getActiveTrains } from '../engine/activeTrains';

const TRAIN_COLORS: Record<TrainType, string> = {
  express: '#eab308',
  regional: '#3b82f6',
  local: '#9ca3af',
};

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

/** Draw a multi-car train icon, return ImageData for Mapbox */
function createTrainImage(trainType: TrainType): { width: number; height: number; data: Uint8ClampedArray } {
  const pixelRatio = 2;
  const carWidth = 4;
  const carHeight = 12;
  const gap = 1;
  const numCars = TRAIN_CARS[trainType];
  const color = TRAIN_COLORS[trainType];

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
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  const imageData = ctx.getImageData(0, 0, canvasW, canvasH);
  return { width: canvasW, height: canvasH, data: imageData.data };
}

/** Register train icons on the map (call once on load) */
export function addTrainIcons(map: mapboxgl.Map): void {
  const types: TrainType[] = ['express', 'regional', 'local'];
  for (const t of types) {
    const img = createTrainImage(t);
    map.addImage(`train-${t}`, img, { pixelRatio: 2 });
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
        'icon-image': ['concat', 'train-', ['get', 'trainType']],
        'icon-rotate': ['get', 'bearing'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          3, 1.2,
          8, 3.0,
        ],
      },
    },
    'station-dots', // insert below station-dots
  );
}

/** Update train positions for the current game time */
export function updateTrainPositions(
  map: mapboxgl.Map,
  gameMinutes: number,
): void {
  const source = map.getSource('active-trains') as mapboxgl.GeoJSONSource;
  if (!source) return;

  const trains = getActiveTrains(gameMinutes);

  const features: GeoJSON.Feature[] = trains.map((train) => ({
    type: 'Feature',
    properties: {
      id: train.id,
      routeId: train.routeId,
      trainType: train.trainType,
      bearing: train.bearing,
      progress: train.progress,
      stations: JSON.stringify(train.stations),
      finalStationId: train.finalStationId,
      nextStationId: train.nextStationId,
      speed: train.speed,
      dwelling: train.dwelling,
      dwellingStationId: train.dwellingStationId,
    },
    geometry: {
      type: 'Point',
      coordinates: [train.lng, train.lat],
    },
  }));

  source.setData({ type: 'FeatureCollection', features });
}

/** Set up hover tooltip on train icons */
export function initTrainHover(
  map: mapboxgl.Map,
  stationMap: StationMap,
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

  map.on('mouseleave', 'train-icons', () => {
    map.getCanvas().style.cursor = '';
    popup.remove();
  });

  map.on('mousemove', 'train-icons', (e) => {
    if (!e.features?.[0]) return;

    const props = e.features[0].properties!;
    const trainType = props.trainType as TrainType;
    const color = TRAIN_COLORS[trainType];
    const label = TRAIN_LABELS[trainType];
    const speed = props.speed as number;
    const dwelling = props.dwelling;
    const dwellingStationId = props.dwellingStationId as string | null;
    const nextStationId = props.nextStationId as string;

    // Parse route stations and build display names
    let stationNames: string[] = [];
    try {
      const stationIds: string[] = JSON.parse(props.stations as string);
      stationNames = stationIds.map((id) => stationMap[id]?.name ?? id);
    } catch {
      stationNames = ['Unknown'];
    }

    const routeLine = stationNames.join(' \u2192 ');
    const nextName = stationMap[nextStationId]?.name ?? nextStationId;

    let statusLine: string;
    if (dwelling && dwellingStationId) {
      const dwellingName = stationMap[dwellingStationId]?.name ?? dwellingStationId;
      statusLine = `Stopped at: ${dwellingName}`;
    } else {
      statusLine = `Next: ${nextName}`;
    }

    const html = `
      <div style="font-size:13px;line-height:1.4;color:#e2e8f0;">
        <div style="font-weight:600;">${routeLine}</div>
        <div style="color:${color};font-size:11px;margin-top:2px;">${label} \u00b7 ${speed} km/h</div>
        <div style="font-size:11px;margin-top:2px;color:#94a3b8;">${statusLine}</div>
      </div>
    `;

    popup
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(map);
  });
}
