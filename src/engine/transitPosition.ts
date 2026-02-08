import type { TransitState } from '../types/game';
import { getActiveTrains, type ActiveTrain } from './activeTrains';
import { getRoutes } from './trainRoutes';
import { getStations } from '../data/graph';

/** Find the ActiveTrain matching a player/seeker transit */
function findMatchingTrain(transit: TransitState, gameMinutes: number): ActiveTrain | null {
  const { routeId, routeStations, departureTime } = transit;
  if (!routeId || !routeStations || routeStations.length < 2) return null;

  const route = getRoutes().find(r => r.id === routeId);
  if (!route) return null;

  const boardingStation = routeStations[0];
  const fwdIdx = route.stations.indexOf(boardingStation);
  const fwdNextIdx = route.stations.indexOf(routeStations[1]);

  let stopTimes;
  if (fwdIdx >= 0 && fwdNextIdx > fwdIdx) {
    stopTimes = route.stopTimes;
  } else {
    stopTimes = route.reverseStopTimes;
  }

  const boardingStop = stopTimes.find(s => s.stationId === boardingStation);
  if (!boardingStop) return null;

  const originDep = departureTime - boardingStop.departureMin;
  const direction = stopTimes === route.stopTimes ? 'forward' : 'reverse';
  const trainId = `${routeId}:${direction}:${originDep}`;

  return getActiveTrains(gameMinutes).find(t => t.id === trainId) ?? null;
}

/**
 * Find the actual position of a player/seeker by matching their TransitState
 * to the active train they're riding. Returns [lng, lat] or null if not found.
 */
export function findTransitTrainPosition(
  transit: TransitState,
  gameMinutes: number,
): [number, number] | null {
  const train = findMatchingTrain(transit, gameMinutes);
  return train ? [train.lng, train.lat] : null;
}

/**
 * Find the actual position and country of a player/seeker on a train.
 * Country is determined by the nearer station on the current segment.
 */
export function findTransitPosition(
  transit: TransitState,
  gameMinutes: number,
): { lng: number; lat: number; country: string } | null {
  const train = findMatchingTrain(transit, gameMinutes);
  if (!train) return null;

  const stations = getStations();

  // If dwelling at a station, use that station's country
  if (train.dwelling && train.dwellingStationId) {
    const dwellStation = stations[train.dwellingStationId];
    return { lng: train.lng, lat: train.lat, country: dwellStation?.country ?? '' };
  }

  // Use the nearer station on the current segment based on progress
  const segIdx = train.currentSegmentIndex;
  const routeStations = train.stations;
  const fromId = routeStations[segIdx];
  const toId = routeStations[segIdx + 1];
  const fromStation = stations[fromId];
  const toStation = stations[toId];

  const country = train.progress < 0.5
    ? (fromStation?.country ?? toStation?.country ?? '')
    : (toStation?.country ?? fromStation?.country ?? '');

  return { lng: train.lng, lat: train.lat, country };
}

/**
 * Check if the train the player is riding is currently dwelling at a station.
 */
export function findTransitTrainDwelling(
  transit: TransitState,
  gameMinutes: number,
): boolean {
  const train = findMatchingTrain(transit, gameMinutes);
  return train?.dwelling ?? false;
}
