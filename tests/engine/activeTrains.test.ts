import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeBearing,
  getActiveTrains,
  _resetActiveTrainCache,
} from '../../src/engine/activeTrains';
import { _resetRouteCache } from '../../src/engine/trainRoutes';

beforeEach(() => {
  _resetActiveTrainCache();
  _resetRouteCache();
});

describe('activeTrains', () => {
  describe('computeBearing', () => {
    it('returns ~0 for due north', () => {
      const bearing = computeBearing(0, 0, 10, 0);
      expect(bearing).toBeCloseTo(0, 0);
    });

    it('returns ~90 for due east', () => {
      const bearing = computeBearing(0, 0, 0, 10);
      expect(bearing).toBeCloseTo(90, 0);
    });

    it('returns ~180 for due south', () => {
      const bearing = computeBearing(10, 0, 0, 0);
      expect(bearing).toBeCloseTo(180, 0);
    });

    it('returns ~270 for due west', () => {
      const bearing = computeBearing(0, 10, 0, 0);
      expect(bearing).toBeCloseTo(270, 0);
    });

    it('returns value in [0, 360)', () => {
      const bearing = computeBearing(48.8, 2.3, 51.5, -0.1);
      expect(bearing).toBeGreaterThanOrEqual(0);
      expect(bearing).toBeLessThan(360);
    });
  });

  describe('getActiveTrains', () => {
    it('returns trains shortly after game start', () => {
      const trains = getActiveTrains(30);
      expect(trains.length).toBeGreaterThan(0);
    });

    it('returns trains within expected count range at various times', () => {
      for (const t of [30, 60, 120, 240, 500]) {
        _resetActiveTrainCache();
        const trains = getActiveTrains(t);
        // Route-based scheduling has fewer simultaneous trains than per-connection
        // (~35 routes × 2 dirs, but many share time windows)
        expect(trains.length).toBeGreaterThan(10);
        expect(trains.length).toBeLessThan(500);
      }
    });

    it('all progress values are in [0, 1]', () => {
      const trains = getActiveTrains(100);
      for (const train of trains) {
        expect(train.progress).toBeGreaterThanOrEqual(0);
        expect(train.progress).toBeLessThanOrEqual(1);
      }
    });

    it('same gameMinutes returns same results', () => {
      const trains1 = getActiveTrains(150);
      const trains2 = getActiveTrains(150);
      expect(trains1).toEqual(trains2);
    });

    it('all train IDs are unique', () => {
      const trains = getActiveTrains(200);
      const ids = trains.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('lat/lng values are reasonable European coordinates', () => {
      const trains = getActiveTrains(100);
      for (const train of trains) {
        expect(train.lat).toBeGreaterThan(30);
        expect(train.lat).toBeLessThan(65);
        expect(train.lng).toBeGreaterThan(-10);
        expect(train.lng).toBeLessThan(28);
      }
    });

    it('all trains have routeId and stations array', () => {
      const trains = getActiveTrains(120);
      for (const train of trains) {
        expect(train.routeId).toBeTruthy();
        expect(train.stations.length).toBeGreaterThanOrEqual(2);
        expect(train.finalStationId).toBeTruthy();
        expect(train.nextStationId).toBeTruthy();
        expect(train.speed).toBeGreaterThan(0);
      }
    });

    it('dwelling trains have valid dwellingStationId', () => {
      // Test at a time where intermediate stops are happening
      // With multi-stop routes, some trains should be dwelling
      let foundDwelling = false;
      for (const t of [60, 120, 180, 240, 300]) {
        _resetActiveTrainCache();
        const trains = getActiveTrains(t);
        const dwellingTrains = trains.filter((tr) => tr.dwelling);
        if (dwellingTrains.length > 0) {
          foundDwelling = true;
          for (const tr of dwellingTrains) {
            expect(tr.dwellingStationId).toBeTruthy();
            expect(tr.stations).toContain(tr.dwellingStationId);
            expect(tr.progress).toBe(0);
          }
          break;
        }
      }
      expect(foundDwelling).toBe(true);
    });

    it('non-dwelling trains have null dwellingStationId', () => {
      const trains = getActiveTrains(100);
      const moving = trains.filter((tr) => !tr.dwelling);
      expect(moving.length).toBeGreaterThan(0);
      for (const tr of moving) {
        expect(tr.dwellingStationId).toBeNull();
      }
    });

    it('finalStationId is the last station in the stations array', () => {
      const trains = getActiveTrains(150);
      for (const train of trains) {
        expect(train.finalStationId).toBe(train.stations[train.stations.length - 1]);
      }
    });

    it('trains exist in both directions for routes', () => {
      const trains = getActiveTrains(120);
      const hasForward = trains.some((t) => t.id.includes(':forward:'));
      const hasReverse = trains.some((t) => t.id.includes(':reverse:'));
      expect(hasForward).toBe(true);
      expect(hasReverse).toBe(true);
    });

    it('returns trains at gameMinutes=0 (pre-game departures)', () => {
      const trains = getActiveTrains(0);
      expect(trains.length).toBeGreaterThan(0);
    });
  });
});
