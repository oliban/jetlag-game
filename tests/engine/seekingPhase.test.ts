import { describe, it, expect } from 'vitest';
import { haversineDistance } from '../../src/engine/geo';
import { checkWinCondition, checkTimeLimit, SEEKING_TIME_LIMIT } from '../../src/engine/seekingPhase';

describe('Seeking Phase', () => {
  it('haversine distance is approximately correct for known cities', () => {
    // Paris to London is ~344km
    const dist = haversineDistance(48.8566, 2.3522, 51.5074, -0.1278);
    expect(dist).toBeGreaterThan(330);
    expect(dist).toBeLessThan(360);
  });

  it('haversine distance is 0 for same point', () => {
    const dist = haversineDistance(48.8566, 2.3522, 48.8566, 2.3522);
    expect(dist).toBe(0);
  });

  it('seeker wins when within hiding zone radius', () => {
    // Same station = 0 distance = within 0.8km zone
    const result = checkWinCondition(
      { lat: 48.8809, lng: 2.3553 }, // seeker at paris-nord
      { lat: 48.8809, lng: 2.3553, radius: 0.8 }, // hiding zone at paris-nord
    );
    expect(result).toBe(true);
  });

  it('seeker does not win when outside hiding zone', () => {
    const result = checkWinCondition(
      { lat: 52.5250, lng: 13.3694 }, // seeker at berlin
      { lat: 48.8809, lng: 2.3553, radius: 0.8 }, // hiding zone at paris
    );
    expect(result).toBe(false);
  });

  it('time limit is 3000 game minutes (50 hours)', () => {
    expect(SEEKING_TIME_LIMIT).toBe(3000);
  });

  it('time limit not exceeded at start', () => {
    expect(checkTimeLimit(0)).toBe(false);
  });

  it('time limit exceeded at 3000 minutes', () => {
    expect(checkTimeLimit(3000)).toBe(true);
  });

  it('time limit exceeded past 3000 minutes', () => {
    expect(checkTimeLimit(3100)).toBe(true);
  });
});
