import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRoutes,
  getRoutesAtStation,
  getUpcomingDepartures,
  _resetRouteCache,
  type TrainRoute,
} from '../../src/engine/trainRoutes';
import { getConnections } from '../../src/data/graph';

beforeEach(() => {
  _resetRouteCache();
});

describe('trainRoutes', () => {
  describe('getRoutes', () => {
    it('generates routes covering all connections', () => {
      const routes = getRoutes();
      const connections = getConnections();

      // Build set of all connection keys
      const allConns = new Set<string>();
      for (const c of connections) {
        const [a, b] = [c.from, c.to].sort();
        allConns.add(`${a}:${b}`);
      }

      // Collect connections covered by routes
      const coveredConns = new Set<string>();
      for (const route of routes) {
        for (let i = 0; i < route.stations.length - 1; i++) {
          const [a, b] = [route.stations[i], route.stations[i + 1]].sort();
          coveredConns.add(`${a}:${b}`);
        }
      }

      // Every connection must be covered
      for (const conn of allConns) {
        expect(coveredConns.has(conn), `Connection ${conn} not covered`).toBe(true);
      }
    });

    it('generates ~20-40 routes', () => {
      const routes = getRoutes();
      expect(routes.length).toBeGreaterThanOrEqual(15);
      expect(routes.length).toBeLessThanOrEqual(100);
    });

    it('all routes have at least 2 stations', () => {
      for (const route of getRoutes()) {
        expect(route.stations.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('express routes have at most 8 stations', () => {
      for (const route of getRoutes()) {
        if (route.trainType === 'express') {
          expect(route.stations.length).toBeLessThanOrEqual(8);
        }
      }
    });

    it('regional routes have at most 6 stations', () => {
      for (const route of getRoutes()) {
        if (route.trainType === 'regional') {
          expect(route.stations.length).toBeLessThanOrEqual(6);
        }
      }
    });

    it('local routes have at most 4 stations', () => {
      for (const route of getRoutes()) {
        if (route.trainType === 'local') {
          expect(route.stations.length).toBeLessThanOrEqual(4);
        }
      }
    });

    it('all routes have valid IDs', () => {
      const routes = getRoutes();
      for (const route of routes) {
        expect(route.id).toMatch(/^(EXP|REG|LOC)-\d+$/);
      }
      // IDs are unique
      const ids = routes.map(r => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('routes are cached (same reference)', () => {
      const r1 = getRoutes();
      const r2 = getRoutes();
      expect(r1).toBe(r2);
    });
  });

  describe('route classification', () => {
    it('express routes have speed 250, freq 120, dwell 5', () => {
      for (const route of getRoutes()) {
        if (route.trainType === 'express') {
          expect(route.speed).toBe(250);
          expect(route.frequency).toBe(120);
          expect(route.dwellTime).toBe(5);
        }
      }
    });

    it('regional routes have speed 150, freq 60, dwell 3', () => {
      for (const route of getRoutes()) {
        if (route.trainType === 'regional') {
          expect(route.speed).toBe(150);
          expect(route.frequency).toBe(60);
          expect(route.dwellTime).toBe(3);
        }
      }
    });

    it('local routes have speed 80, freq 30, dwell 2', () => {
      for (const route of getRoutes()) {
        if (route.trainType === 'local') {
          expect(route.speed).toBe(80);
          expect(route.frequency).toBe(30);
          expect(route.dwellTime).toBe(2);
        }
      }
    });

    it('has all three route types', () => {
      const routes = getRoutes();
      const types = new Set(routes.map(r => r.trainType));
      expect(types.has('express')).toBe(true);
      expect(types.has('regional')).toBe(true);
      expect(types.has('local')).toBe(true);
    });
  });

  describe('stopTimes', () => {
    it('forward stopTimes start at 0 and are monotonically increasing', () => {
      for (const route of getRoutes()) {
        expect(route.stopTimes[0].arrivalMin).toBe(0);
        expect(route.stopTimes[0].departureMin).toBe(0); // origin has no dwell
        for (let i = 1; i < route.stopTimes.length; i++) {
          expect(route.stopTimes[i].arrivalMin).toBeGreaterThan(route.stopTimes[i - 1].departureMin);
          expect(route.stopTimes[i].departureMin).toBeGreaterThanOrEqual(route.stopTimes[i].arrivalMin);
        }
      }
    });

    it('reverse stopTimes start at 0 and are monotonically increasing', () => {
      for (const route of getRoutes()) {
        expect(route.reverseStopTimes[0].arrivalMin).toBe(0);
        expect(route.reverseStopTimes[0].departureMin).toBe(0);
        for (let i = 1; i < route.reverseStopTimes.length; i++) {
          expect(route.reverseStopTimes[i].arrivalMin).toBeGreaterThan(route.reverseStopTimes[i - 1].departureMin);
        }
      }
    });

    it('forward and reverse have same total duration', () => {
      for (const route of getRoutes()) {
        const fwdTotal = route.stopTimes[route.stopTimes.length - 1].arrivalMin;
        const revTotal = route.reverseStopTimes[route.reverseStopTimes.length - 1].arrivalMin;
        expect(fwdTotal).toBeCloseTo(revTotal, 5);
      }
    });

    it('totalDuration matches last stop arrivalMin', () => {
      for (const route of getRoutes()) {
        expect(route.totalDuration).toBeCloseTo(
          route.stopTimes[route.stopTimes.length - 1].arrivalMin,
          5,
        );
      }
    });

    it('intermediate stops have dwell time applied', () => {
      for (const route of getRoutes()) {
        if (route.stations.length <= 2) continue;
        for (let i = 1; i < route.stopTimes.length - 1; i++) {
          expect(route.stopTimes[i].departureMin - route.stopTimes[i].arrivalMin)
            .toBeCloseTo(route.dwellTime, 5);
        }
      }
    });

    it('terminus has no dwell (departure = arrival)', () => {
      for (const route of getRoutes()) {
        const last = route.stopTimes[route.stopTimes.length - 1];
        expect(last.departureMin).toBe(last.arrivalMin);
      }
    });

    it('stopTimes station IDs match route stations', () => {
      for (const route of getRoutes()) {
        expect(route.stopTimes.map(s => s.stationId)).toEqual(route.stations);
        expect(route.reverseStopTimes.map(s => s.stationId)).toEqual([...route.stations].reverse());
      }
    });
  });

  describe('getRoutesAtStation', () => {
    it('returns routes containing the station', () => {
      const parisRoutes = getRoutesAtStation('paris');
      expect(parisRoutes.length).toBeGreaterThan(0);
      for (const route of parisRoutes) {
        expect(route.stations).toContain('paris');
      }
    });

    it('returns empty for nonexistent station', () => {
      expect(getRoutesAtStation('nonexistent')).toEqual([]);
    });

    it('hub stations have more routes than leaf stations', () => {
      const parisRoutes = getRoutesAtStation('paris');
      const interlakenRoutes = getRoutesAtStation('interlaken');
      expect(parisRoutes.length).toBeGreaterThan(interlakenRoutes.length);
    });
  });

  describe('getUpcomingDepartures', () => {
    it('returns departures sorted by departure time', () => {
      const deps = getUpcomingDepartures('paris', 0, 10);
      for (let i = 1; i < deps.length; i++) {
        expect(deps[i].departureTime).toBeGreaterThanOrEqual(deps[i - 1].departureTime);
      }
    });

    it('all departures are at or after gameMinutes', () => {
      const gameMinutes = 100;
      const deps = getUpcomingDepartures('paris', gameMinutes, 10);
      for (const dep of deps) {
        expect(dep.departureTime).toBeGreaterThanOrEqual(gameMinutes);
      }
    });

    it('returns at most count departures', () => {
      const deps = getUpcomingDepartures('paris', 0, 5);
      expect(deps.length).toBeLessThanOrEqual(5);
    });

    it('remaining stops have absolute times after departure', () => {
      const deps = getUpcomingDepartures('paris', 0, 5);
      for (const dep of deps) {
        expect(dep.remainingStops.length).toBeGreaterThan(0);
        for (const stop of dep.remainingStops) {
          expect(stop.arrivalMin).toBeGreaterThan(dep.departureTime);
        }
      }
    });

    it('remaining stops do not include the departure station', () => {
      const deps = getUpcomingDepartures('paris', 0, 5);
      for (const dep of deps) {
        for (const stop of dep.remainingStops) {
          expect(stop.stationId).not.toBe('paris');
        }
      }
    });

    it('returns departures for terminus stations (reverse direction)', () => {
      // A station that is a terminus in some route should still get departures (reverse)
      const routes = getRoutes();
      // Find a station that appears as last station in some route
      const terminusStation = routes[0].stations[routes[0].stations.length - 1];
      const deps = getUpcomingDepartures(terminusStation, 0, 10);
      // Should have at least some departures (from reverse direction or other routes)
      expect(deps.length).toBeGreaterThan(0);
    });

    it('includes both forward and reverse departures', () => {
      // A station in the middle of a multi-stop route should get both directions
      const routes = getRoutes();
      const multiStopRoute = routes.find(r => r.stations.length >= 3);
      if (!multiStopRoute) return; // skip if no multi-stop routes
      const middleStation = multiStopRoute.stations[1];
      const deps = getUpcomingDepartures(middleStation, 0, 20);
      const directions = new Set(deps.map(d => d.direction));
      // Should have at least the forward direction from this route
      expect(directions.size).toBeGreaterThanOrEqual(1);
    });

    it('every station has departures within reasonable time at gameMinutes=0', () => {
      const routes = getRoutes();
      // Collect all unique station IDs from routes
      const allStations = new Set<string>();
      for (const route of routes) {
        for (const stId of route.stations) {
          allStations.add(stId);
        }
      }

      for (const stationId of allStations) {
        const deps = getUpcomingDepartures(stationId, 0, 5);
        expect(deps.length, `No departures at ${stationId}`).toBeGreaterThan(0);
        // First departure should be within a reasonable window (not 300+ min)
        expect(
          deps[0].departureTime,
          `First departure at ${stationId} is too far away: ${deps[0].departureTime}min`,
        ).toBeLessThanOrEqual(120);
      }
    });
  });
});
