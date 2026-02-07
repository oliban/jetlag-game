import { buildAdjacencyList } from '../data/graph';

export interface PathResult {
  path: string[];
  distance: number;
}

/**
 * Dijkstra's shortest path algorithm.
 * Returns the shortest path and total distance between two stations.
 * Returns null if no path exists.
 */
export function findShortestPath(
  from: string,
  to: string,
): PathResult | null {
  const adj = buildAdjacencyList();

  if (!adj[from] || !adj[to]) return null;
  if (from === to) return { path: [from], distance: 0 };

  const dist: Record<string, number> = {};
  const prev: Record<string, string | null> = {};
  const visited = new Set<string>();

  // Initialize
  for (const id of Object.keys(adj)) {
    dist[id] = Infinity;
    prev[id] = null;
  }
  dist[from] = 0;

  // Simple priority queue via linear scan (fine for ~50 nodes)
  while (true) {
    let current: string | null = null;
    let minDist = Infinity;

    for (const id of Object.keys(adj)) {
      if (!visited.has(id) && dist[id] < minDist) {
        current = id;
        minDist = dist[id];
      }
    }

    if (current === null) break;
    if (current === to) break;

    visited.add(current);

    for (const neighbor of adj[current]) {
      if (visited.has(neighbor.to)) continue;
      const newDist = dist[current] + neighbor.distance;
      if (newDist < dist[neighbor.to]) {
        dist[neighbor.to] = newDist;
        prev[neighbor.to] = current;
      }
    }
  }

  if (dist[to] === Infinity) return null;

  // Reconstruct path
  const path: string[] = [];
  let cur: string | null = to;
  while (cur !== null) {
    path.unshift(cur);
    cur = prev[cur];
  }

  return { path, distance: dist[to] };
}

/**
 * Find all stations reachable from a given station.
 * Returns a map of stationId → shortest distance.
 */
export function findReachable(from: string): Record<string, number> {
  const adj = buildAdjacencyList();
  if (!adj[from]) return {};

  const dist: Record<string, number> = {};
  const visited = new Set<string>();

  for (const id of Object.keys(adj)) {
    dist[id] = Infinity;
  }
  dist[from] = 0;

  while (true) {
    let current: string | null = null;
    let minDist = Infinity;

    for (const id of Object.keys(adj)) {
      if (!visited.has(id) && dist[id] < minDist) {
        current = id;
        minDist = dist[id];
      }
    }

    if (current === null) break;

    visited.add(current);

    for (const neighbor of adj[current]) {
      if (visited.has(neighbor.to)) continue;
      const newDist = dist[current] + neighbor.distance;
      if (newDist < dist[neighbor.to]) {
        dist[neighbor.to] = newDist;
      }
    }
  }

  // Only return reachable stations (not Infinity)
  const reachable: Record<string, number> = {};
  for (const [id, d] of Object.entries(dist)) {
    if (d < Infinity) {
      reachable[id] = d;
    }
  }
  return reachable;
}
