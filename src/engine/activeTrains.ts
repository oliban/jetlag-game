import { getStations } from '../data/graph';
import type { TrainType } from '../types/game';
import { getRoutes, type TrainRoute, type StopTime } from './trainRoutes';
import { computeBearing } from './geo';

export { computeBearing };

export interface ActiveTrain {
  id: string;              // "{routeId}:{dir}:{departureTime}"
  routeId: string;
  trainType: TrainType;
  speed: number;           // km/h
  stations: string[];      // full route (in current direction)
  finalStationId: string;
  currentSegmentIndex: number;
  nextStationId: string;
  progress: number;        // 0..1 within current segment
  lng: number;
  lat: number;
  bearing: number;
  dwelling: boolean;       // stopped at intermediate station
  dwellingStationId: string | null;
  country: string;         // origin station's country (for coloring)
}

let cachedTrains: { gameMinutes: number; trains: ActiveTrain[] } | null = null;

/** Get all currently-active trains at a given game time */
export function getActiveTrains(gameMinutes: number): ActiveTrain[] {
  if (cachedTrains && cachedTrains.gameMinutes === gameMinutes) {
    return cachedTrains.trains;
  }

  const routes = getRoutes();
  const stationMap = getStations();
  const trains: ActiveTrain[] = [];

  for (const route of routes) {
    // Process both directions
    for (const dir of ['forward', 'reverse'] as const) {
      const stopTimes = dir === 'forward' ? route.stopTimes : route.reverseStopTimes;
      const offset = dir === 'forward' ? route.offset : route.reverseOffset;
      const dirStations = dir === 'forward'
        ? route.stations
        : [...route.stations].reverse();

      collectActiveTrains(
        route, dir, stopTimes, dirStations, offset, gameMinutes, stationMap, trains,
      );
    }
  }

  cachedTrains = { gameMinutes, trains };
  return trains;
}

/** Collect active trains for one direction of a route */
function collectActiveTrains(
  route: TrainRoute,
  dir: 'forward' | 'reverse',
  stopTimes: StopTime[],
  dirStations: string[],
  offset: number,
  gameMinutes: number,
  stationMap: ReturnType<typeof getStations>,
  out: ActiveTrain[],
): void {
  const { totalDuration, frequency } = route;

  // Find the range of service indices n whose trains could be active.
  // A train with index n departs origin at: offset + n * frequency
  // and arrives terminus at: offset + n * frequency + totalDuration
  // Active when: dep <= gameMinutes < dep + totalDuration
  // => n <= (gameMinutes - offset) / frequency
  // => n >= (gameMinutes - offset - totalDuration) / frequency
  const nMax = Math.floor((gameMinutes - offset) / frequency);
  const nMin = Math.ceil((gameMinutes - offset - totalDuration) / frequency);

  for (let n = nMin; n <= nMax; n++) {
    const originDep = offset + n * frequency;
    const originArr = originDep + totalDuration;

    // Must have departed origin and not yet arrived at terminus
    if (originDep > gameMinutes || originArr <= gameMinutes) continue;

    const elapsed = gameMinutes - originDep; // minutes since origin departure

    // Walk through stop times to find current phase
    const train = resolveTrainPosition(
      route, dir, stopTimes, dirStations, originDep, elapsed, stationMap,
    );

    if (train) {
      out.push(train);
    }
  }
}

/** Given elapsed minutes since origin departure, resolve current position */
function resolveTrainPosition(
  route: TrainRoute,
  dir: 'forward' | 'reverse',
  stopTimes: StopTime[],
  dirStations: string[],
  originDep: number,
  elapsed: number,
  stationMap: ReturnType<typeof getStations>,
): ActiveTrain | null {
  const finalStationId = dirStations[dirStations.length - 1];
  const country = stationMap[dirStations[0]]?.country ?? 'Unknown';

  for (let i = 0; i < stopTimes.length - 1; i++) {
    const currentStop = stopTimes[i];
    const nextStop = stopTimes[i + 1];

    // Check if dwelling at this station (between arrival and departure)
    if (elapsed >= currentStop.arrivalMin && elapsed < currentStop.departureMin) {
      const st = stationMap[currentStop.stationId];
      if (!st) return null;

      return {
        id: `${route.id}:${dir}:${originDep}`,
        routeId: route.id,
        trainType: route.trainType,
        speed: route.speed,
        stations: dirStations,
        finalStationId,
        currentSegmentIndex: i > 0 ? i - 1 : 0,
        nextStationId: nextStop.stationId,
        progress: 0,
        lng: st.lng,
        lat: st.lat,
        bearing: computeSegmentBearing(currentStop.stationId, nextStop.stationId, stationMap),
        dwelling: true,
        dwellingStationId: currentStop.stationId,
        country,
      };
    }

    // Check if traveling between currentStop and nextStop
    if (elapsed >= currentStop.departureMin && elapsed < nextStop.arrivalMin) {
      const segmentDuration = nextStop.arrivalMin - currentStop.departureMin;
      const segmentElapsed = elapsed - currentStop.departureMin;
      const progress = segmentDuration > 0 ? segmentElapsed / segmentDuration : 0;

      const fromSt = stationMap[currentStop.stationId];
      const toSt = stationMap[nextStop.stationId];
      if (!fromSt || !toSt) return null;

      const lng = fromSt.lng + (toSt.lng - fromSt.lng) * progress;
      const lat = fromSt.lat + (toSt.lat - fromSt.lat) * progress;

      return {
        id: `${route.id}:${dir}:${originDep}`,
        routeId: route.id,
        trainType: route.trainType,
        speed: route.speed,
        stations: dirStations,
        finalStationId,
        currentSegmentIndex: i,
        nextStationId: nextStop.stationId,
        progress,
        lng,
        lat,
        bearing: computeBearing(fromSt.lat, fromSt.lng, toSt.lat, toSt.lng),
        dwelling: false,
        dwellingStationId: null,
        country,
      };
    }
  }

  // Check dwelling at terminus (should not happen since arrival = departure for terminus)
  const lastStop = stopTimes[stopTimes.length - 1];
  if (elapsed >= lastStop.arrivalMin) {
    const st = stationMap[lastStop.stationId];
    if (!st) return null;

    return {
      id: `${route.id}:${dir}:${originDep}`,
      routeId: route.id,
      trainType: route.trainType,
      speed: route.speed,
      stations: dirStations,
      finalStationId,
      currentSegmentIndex: stopTimes.length - 2,
      nextStationId: lastStop.stationId,
      progress: 1,
      lng: st.lng,
      lat: st.lat,
      bearing: 0,
      dwelling: false,
      dwellingStationId: null,
      country,
    };
  }

  return null;
}

/** Compute bearing between two stations by ID */
function computeSegmentBearing(
  fromId: string,
  toId: string,
  stationMap: ReturnType<typeof getStations>,
): number {
  const fromSt = stationMap[fromId];
  const toSt = stationMap[toId];
  if (!fromSt || !toSt) return 0;
  return computeBearing(fromSt.lat, fromSt.lng, toSt.lat, toSt.lng);
}

/** Reset cached active trains (for testing) */
export function _resetActiveTrainCache(): void {
  cachedTrains = null;
}
