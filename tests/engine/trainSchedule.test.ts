import { describe, it, expect } from 'vitest';
import {
  classifyConnection,
  computeDepartureOffset,
  nextDeparture,
  travelDuration,
  getTravelInfo,
  getConnectionDistance,
  TRAIN_CONFIGS,
} from '../../src/engine/trainSchedule';

describe('trainSchedule', () => {
  describe('classifyConnection', () => {
    it('classifies short distances as local', () => {
      expect(classifyConnection(50)).toBe('local');
      expect(classifyConnection(99)).toBe('local');
    });

    it('classifies medium distances as regional', () => {
      expect(classifyConnection(100)).toBe('regional');
      expect(classifyConnection(200)).toBe('regional');
      expect(classifyConnection(300)).toBe('regional');
    });

    it('classifies long distances as express', () => {
      expect(classifyConnection(301)).toBe('express');
      expect(classifyConnection(500)).toBe('express');
      expect(classifyConnection(1000)).toBe('express');
    });
  });

  describe('computeDepartureOffset', () => {
    it('returns same offset regardless of direction', () => {
      const ab = computeDepartureOffset('paris', 'london');
      const ba = computeDepartureOffset('london', 'paris');
      expect(ab).toBe(ba);
    });

    it('returns a non-negative number', () => {
      const offset = computeDepartureOffset('a', 'b');
      expect(offset).toBeGreaterThanOrEqual(0);
    });

    it('returns different offsets for different routes', () => {
      const offset1 = computeDepartureOffset('paris', 'london');
      const offset2 = computeDepartureOffset('berlin-hbf', 'munich-hbf');
      expect(offset1).not.toBe(offset2);
    });
  });

  describe('nextDeparture', () => {
    it('returns first departure when before any', () => {
      // offset=10, freq=60 → departures at 10, 70, 130...
      expect(nextDeparture(0, 60, 10)).toBe(10);
    });

    it('returns exact time when exactly on a departure', () => {
      // offset=10, freq=60 → departures at 10, 70, 130...
      expect(nextDeparture(10, 60, 10)).toBe(10);
      expect(nextDeparture(70, 60, 10)).toBe(70);
    });

    it('returns next departure when between departures', () => {
      // offset=10, freq=60 → departures at 10, 70, 130...
      expect(nextDeparture(11, 60, 10)).toBe(70);
      expect(nextDeparture(50, 60, 10)).toBe(70);
    });

    it('handles offset larger than frequency by modding', () => {
      // offset=130, freq=60 → effectiveOffset=10 → departures at 10, 70, 130...
      expect(nextDeparture(0, 60, 130)).toBe(10);
    });

    it('handles zero offset', () => {
      // offset=0, freq=30 → departures at 0, 30, 60...
      expect(nextDeparture(0, 30, 0)).toBe(0);
      expect(nextDeparture(1, 30, 0)).toBe(30);
    });
  });

  describe('travelDuration', () => {
    it('computes correct duration', () => {
      // 250km at 250km/h = 1 hour = 60 min
      expect(travelDuration(250, 250)).toBe(60);
    });

    it('computes for short distances', () => {
      // 50km at 80km/h = 0.625 hours = 37.5 min
      expect(travelDuration(50, 80)).toBe(37.5);
    });
  });

  describe('getConnectionDistance', () => {
    it('returns distance for a valid connection', () => {
      // Paris Gare du Nord ↔ London St Pancras is a known connection
      const dist = getConnectionDistance('paris', 'london');
      expect(dist).toBeGreaterThan(0);
    });

    it('returns null for non-adjacent stations', () => {
      const dist = getConnectionDistance('london', 'rome-termini');
      expect(dist).toBeNull();
    });
  });

  describe('getTravelInfo', () => {
    it('returns travel info for a valid connection', () => {
      const info = getTravelInfo('paris', 'london', 0);
      expect(info).not.toBeNull();
      expect(info!.trainType).toBeDefined();
      expect(info!.departureTime).toBeGreaterThanOrEqual(0);
      expect(info!.arrivalTime).toBeGreaterThan(info!.departureTime);
      expect(info!.travelMinutes).toBeGreaterThan(0);
      expect(info!.totalMinutes).toBeGreaterThan(0);
    });

    it('returns null for non-adjacent stations', () => {
      const info = getTravelInfo('london', 'rome-termini', 0);
      expect(info).toBeNull();
    });

    it('wait time is non-negative', () => {
      const info = getTravelInfo('paris', 'london', 100);
      expect(info).not.toBeNull();
      expect(info!.waitMinutes).toBeGreaterThanOrEqual(0);
    });

    it('arrival = departure + travel', () => {
      const info = getTravelInfo('paris', 'london', 0);
      expect(info).not.toBeNull();
      const expected = info!.departureTime + info!.travelMinutes;
      expect(Math.abs(info!.arrivalTime - expected)).toBeLessThan(0.1);
    });
  });
});
