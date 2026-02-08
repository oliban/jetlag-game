import { describe, it, expect } from 'vitest';
import {
  computeBearing,
  getActiveTrains,
  buildSchedules,
} from '../../src/engine/activeTrains';

describe('activeTrains', () => {
  describe('computeBearing', () => {
    it('returns ~0 for due north', () => {
      // From (0, 0) to (10, 0) = due north
      const bearing = computeBearing(0, 0, 10, 0);
      expect(bearing).toBeCloseTo(0, 0);
    });

    it('returns ~90 for due east', () => {
      // From (0, 0) to (0, 10) = due east
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

  describe('buildSchedules', () => {
    it('returns 166 directional schedules (83 connections x 2)', () => {
      const schedules = buildSchedules();
      expect(schedules).toHaveLength(166);
    });

    it('each schedule has required fields', () => {
      const schedules = buildSchedules();
      for (const s of schedules) {
        expect(s.fromId).toBeTruthy();
        expect(s.toId).toBeTruthy();
        expect(s.frequency).toBeGreaterThan(0);
        expect(s.travelMins).toBeGreaterThan(0);
        expect(s.offset).toBeGreaterThanOrEqual(0);
        expect(s.offset).toBeLessThan(s.frequency);
        expect(s.bearing).toBeGreaterThanOrEqual(0);
        expect(s.bearing).toBeLessThan(360);
      }
    });
  });

  describe('getActiveTrains', () => {
    it('returns trains shortly after game start', () => {
      // At gameMinutes=0, no trains may have departed yet (depends on offsets)
      // But by gameMinutes=30 (smallest frequency), all local routes have departed
      const trains = getActiveTrains(30);
      expect(trains.length).toBeGreaterThan(0);
    });

    it('returns trains within expected count range at various times', () => {
      for (const t of [30, 60, 120, 240, 500]) {
        const trains = getActiveTrains(t);
        expect(trains.length).toBeGreaterThan(50);
        expect(trains.length).toBeLessThan(400);
      }
    });

    it('all progress values are in [0, 1]', () => {
      const trains = getActiveTrains(100);
      for (const train of trains) {
        expect(train.progress).toBeGreaterThanOrEqual(0);
        expect(train.progress).toBeLessThanOrEqual(1);
      }
    });

    it('trains exist in both directions', () => {
      const trains = getActiveTrains(120);
      // Find at least one pair where both directions exist for some connection
      const fromToPairs = new Set(trains.map((t) => `${t.fromId}:${t.toId}`));
      let foundBidirectional = false;
      for (const train of trains) {
        if (fromToPairs.has(`${train.toId}:${train.fromId}`)) {
          foundBidirectional = true;
          break;
        }
      }
      expect(foundBidirectional).toBe(true);
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

    it('departure < gameMinutes <= arrival for all trains', () => {
      const gameMinutes = 180;
      const trains = getActiveTrains(gameMinutes);
      for (const train of trains) {
        expect(train.departureTime).toBeLessThanOrEqual(gameMinutes);
        expect(train.arrivalTime).toBeGreaterThan(gameMinutes);
      }
    });

    it('lat/lng values are reasonable European coordinates', () => {
      const trains = getActiveTrains(100);
      for (const train of trains) {
        expect(train.lat).toBeGreaterThan(30);
        expect(train.lat).toBeLessThan(65);
        expect(train.lng).toBeGreaterThan(-10);
        expect(train.lng).toBeLessThan(25);
      }
    });
  });
});
