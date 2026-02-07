import type { Station, Connection } from '../types/game';
import stationsData from './stations.json';
import connectionsData from './connections.json';

export interface StationMap {
  [id: string]: Station;
}

export interface AdjacencyList {
  [stationId: string]: Array<{ to: string; distance: number }>;
}

/** All stations keyed by ID */
export function getStations(): StationMap {
  const map: StationMap = {};
  for (const s of stationsData) {
    map[s.id] = { ...s, connections: 0 };
  }
  // Count connections per station
  for (const c of connectionsData) {
    if (map[c.from]) map[c.from].connections++;
    if (map[c.to]) map[c.to].connections++;
  }
  return map;
}

/** All connections as typed array */
export function getConnections(): Connection[] {
  return connectionsData as Connection[];
}

/** Build adjacency list (bidirectional) */
export function buildAdjacencyList(): AdjacencyList {
  const adj: AdjacencyList = {};
  for (const s of stationsData) {
    adj[s.id] = [];
  }
  for (const c of connectionsData) {
    adj[c.from]?.push({ to: c.to, distance: c.distance });
    adj[c.to]?.push({ to: c.from, distance: c.distance });
  }
  return adj;
}

/** Get IDs of stations directly connected to a given station */
export function getNeighbors(stationId: string): string[] {
  const adj = buildAdjacencyList();
  return (adj[stationId] ?? []).map((n) => n.to);
}

/** Get the distance (km) between two directly connected stations, or null if not connected */
export function getConnectionDistance(fromId: string, toId: string): number | null {
  const adj = buildAdjacencyList();
  const neighbors = adj[fromId];
  if (!neighbors) return null;
  const edge = neighbors.find((n) => n.to === toId);
  return edge ? edge.distance : null;
}

/** All station IDs */
export function getStationIds(): string[] {
  return stationsData.map((s) => s.id);
}

/** All stations as array */
export function getStationList(): Station[] {
  const stationMap = getStations();
  return Object.values(stationMap);
}
