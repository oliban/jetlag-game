import { describe, it, expect } from 'vitest';
import { findShortestPath, findReachable } from '../../src/engine/pathfinding';

describe('Pathfinding (Dijkstra)', () => {
  it('finds path between adjacent stations', () => {
    const result = findShortestPath('paris-nord', 'lille-europe');
    expect(result).not.toBeNull();
    expect(result!.path).toEqual(['paris-nord', 'lille-europe']);
    expect(result!.distance).toBe(225);
  });

  it('finds path between non-adjacent stations', () => {
    const result = findShortestPath('london-stpancras', 'berlin-hbf');
    expect(result).not.toBeNull();
    expect(result!.path.length).toBeGreaterThan(2);
    expect(result!.path[0]).toBe('london-stpancras');
    expect(result!.path[result!.path.length - 1]).toBe('berlin-hbf');
    expect(result!.distance).toBeGreaterThan(0);
  });

  it('returns same station path with distance 0 for same start/end', () => {
    const result = findShortestPath('paris-nord', 'paris-nord');
    expect(result).not.toBeNull();
    expect(result!.path).toEqual(['paris-nord']);
    expect(result!.distance).toBe(0);
  });

  it('returns null for non-existent stations', () => {
    const result = findShortestPath('nonexistent', 'paris-nord');
    expect(result).toBeNull();
  });

  it('returns null for both non-existent stations', () => {
    const result = findShortestPath('nonexistent-a', 'nonexistent-b');
    expect(result).toBeNull();
  });

  it('finds shortest path (not just any path)', () => {
    // Paris → Lyon: direct TGV route should be shorter than going through Strasbourg
    const result = findShortestPath('paris-lyon', 'lyon-part-dieu');
    expect(result).not.toBeNull();
    // Direct connection is 465km
    expect(result!.distance).toBe(465);
    expect(result!.path).toEqual(['paris-lyon', 'lyon-part-dieu']);
  });

  it('finds reachable stations from a hub', () => {
    const reachable = findReachable('paris-nord');
    // Paris Nord should be able to reach many stations
    expect(Object.keys(reachable).length).toBeGreaterThan(40);
    // Distance to self is 0
    expect(reachable['paris-nord']).toBe(0);
    // Adjacent station distance
    expect(reachable['lille-europe']).toBe(225);
  });

  it('all stations are reachable from Paris (connected graph)', () => {
    const reachable = findReachable('paris-nord');
    // Should reach all ~50 stations (the graph should be connected)
    expect(Object.keys(reachable).length).toBeGreaterThanOrEqual(50);
  });
});
