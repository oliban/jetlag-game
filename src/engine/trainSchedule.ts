import { buildAdjacencyList } from '../data/graph.ts';

export type TrainType = 'express' | 'regional' | 'local';

export interface TrainConfig {
  frequency: number; // minutes between departures
  speed: number; // km/h
}

export const TRAIN_CONFIGS: Record<TrainType, TrainConfig> = {
  express: { frequency: 120, speed: 250 },
  regional: { frequency: 60, speed: 150 },
  local: { frequency: 30, speed: 80 },
};

export interface TravelInfo {
  trainType: TrainType;
  departureTime: number; // game minutes
  arrivalTime: number; // game minutes
  waitMinutes: number;
  travelMinutes: number;
  totalMinutes: number;
}

/** Classify a connection by distance */
export function classifyConnection(distanceKm: number): TrainType {
  if (distanceKm > 300) return 'express';
  if (distanceKm >= 100) return 'regional';
  return 'local';
}

/** Deterministic hash-based offset to stagger departures across connections */
export function computeDepartureOffset(fromId: string, toId: string): number {
  // Sort IDs for consistency regardless of direction
  const [a, b] = [fromId, toId].sort();
  let hash = 0;
  const str = `${a}:${b}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  // Return a positive offset 0..(frequency-1) — we'll mod by frequency at usage
  return Math.abs(hash);
}

/** Next departure time >= currentGameMinutes */
export function nextDeparture(currentGameMinutes: number, frequency: number, offset: number): number {
  const effectiveOffset = offset % frequency;
  // Find the next departure at or after currentGameMinutes
  // Departures happen at: effectiveOffset, effectiveOffset + frequency, effectiveOffset + 2*frequency, ...
  const sinceOffset = currentGameMinutes - effectiveOffset;
  if (sinceOffset < 0) {
    return effectiveOffset;
  }
  const cyclesPassed = Math.floor(sinceOffset / frequency);
  const nextTime = effectiveOffset + (cyclesPassed + 1) * frequency;
  // If we're exactly on a departure, use it
  const currentDep = effectiveOffset + cyclesPassed * frequency;
  if (Math.abs(currentDep - currentGameMinutes) < 0.001) {
    return currentDep;
  }
  return nextTime;
}

/** Travel duration in game-minutes */
export function travelDuration(distanceKm: number, speedKmh: number): number {
  return (distanceKm / speedKmh) * 60;
}

/** Get connection distance from the adjacency list */
export function getConnectionDistance(fromId: string, toId: string): number | null {
  const adj = buildAdjacencyList();
  const neighbors = adj[fromId];
  if (!neighbors) return null;
  const edge = neighbors.find((n) => n.to === toId);
  return edge ? edge.distance : null;
}

/** Full travel info for a connection */
export function getTravelInfo(
  fromId: string,
  toId: string,
  currentGameMinutes: number,
): TravelInfo | null {
  const distance = getConnectionDistance(fromId, toId);
  if (distance === null) return null;

  const trainType = classifyConnection(distance);
  const config = TRAIN_CONFIGS[trainType];
  const offset = computeDepartureOffset(fromId, toId);

  const departureTime = nextDeparture(currentGameMinutes, config.frequency, offset);
  const travelMins = travelDuration(distance, config.speed);
  const arrivalTime = departureTime + travelMins;
  const waitMinutes = departureTime - currentGameMinutes;

  return {
    trainType,
    departureTime,
    arrivalTime,
    waitMinutes,
    travelMinutes: Math.round(travelMins * 10) / 10,
    totalMinutes: Math.round((waitMinutes + travelMins) * 10) / 10,
  };
}
