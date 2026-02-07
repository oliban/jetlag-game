import { describe, it, expect } from 'vitest';
import stationsData from '../../src/data/stations.json';
import connectionsData from '../../src/data/connections.json';
import { getStations, buildAdjacencyList } from '../../src/data/graph';

describe('Data Integrity', () => {
  const stationIds = new Set(stationsData.map((s) => s.id));

  it('all stations have required fields', () => {
    for (const s of stationsData) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.country).toBeTruthy();
      expect(typeof s.lat).toBe('number');
      expect(typeof s.lng).toBe('number');
      // Valid coordinate ranges for Europe
      expect(s.lat).toBeGreaterThan(35);
      expect(s.lat).toBeLessThan(65);
      expect(s.lng).toBeGreaterThan(-15);
      expect(s.lng).toBeLessThan(30);
    }
  });

  it('station IDs are unique', () => {
    expect(stationIds.size).toBe(stationsData.length);
  });

  it('all connections reference valid stations', () => {
    for (const c of connectionsData) {
      expect(stationIds.has(c.from)).toBe(true);
      expect(stationIds.has(c.to)).toBe(true);
    }
  });

  it('connections are not self-referencing', () => {
    for (const c of connectionsData) {
      expect(c.from).not.toBe(c.to);
    }
  });

  it('connections have positive distances', () => {
    for (const c of connectionsData) {
      expect(c.distance).toBeGreaterThan(0);
    }
  });

  it('adjacency list is bidirectional', () => {
    const adj = buildAdjacencyList();
    for (const c of connectionsData) {
      const fromNeighbors = adj[c.from].map((n) => n.to);
      const toNeighbors = adj[c.to].map((n) => n.to);
      expect(fromNeighbors).toContain(c.to);
      expect(toNeighbors).toContain(c.from);
    }
  });

  it('has at least 50 stations', () => {
    expect(stationsData.length).toBeGreaterThanOrEqual(50);
  });

  it('has at least 80 connections', () => {
    expect(connectionsData.length).toBeGreaterThanOrEqual(80);
  });

  it('covers at least 6 countries', () => {
    const countries = new Set(stationsData.map((s) => s.country));
    expect(countries.size).toBeGreaterThanOrEqual(6);
  });

  it('getStations counts connections correctly', () => {
    const stations = getStations();
    // Paris Gare du Nord should have multiple connections
    expect(stations['paris-nord'].connections).toBeGreaterThan(0);
    // Check a specific known connection count (paris-lyon is a major hub)
    expect(stations['paris-lyon'].connections).toBeGreaterThanOrEqual(5);
  });
});
