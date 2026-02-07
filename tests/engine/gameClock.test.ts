import { describe, it, expect } from 'vitest';
import {
  createGameClock,
  tickClock,
  setClockSpeed,
  pauseClock,
  resumeClock,
  formatGameTime,
} from '../../src/engine/gameLoop';

describe('Game Clock', () => {
  it('starts at 0 minutes', () => {
    const clock = createGameClock();
    expect(clock.gameMinutes).toBe(0);
    expect(clock.speed).toBe(1);
    expect(clock.paused).toBe(false);
  });

  it('ticks at correct rate (1 real sec = 0.5 game min at 1x)', () => {
    let clock = createGameClock();
    clock = tickClock(clock, 0); // Initialize timestamp
    clock = tickClock(clock, 1000); // 1 second later
    expect(clock.gameMinutes).toBeCloseTo(0.5, 5);
  });

  it('ticks at 2x speed', () => {
    let clock = createGameClock();
    clock = setClockSpeed(clock, 2);
    clock = tickClock(clock, 0);
    clock = tickClock(clock, 1000); // 1 second later
    expect(clock.gameMinutes).toBeCloseTo(1.0, 5);
  });

  it('ticks at 4x speed', () => {
    let clock = createGameClock();
    clock = setClockSpeed(clock, 4);
    clock = tickClock(clock, 0);
    clock = tickClock(clock, 1000);
    expect(clock.gameMinutes).toBeCloseTo(2.0, 5);
  });

  it('pauses the clock', () => {
    let clock = createGameClock();
    clock = tickClock(clock, 0);
    clock = tickClock(clock, 1000); // 0.5 min
    clock = pauseClock(clock);
    clock = tickClock(clock, 5000); // 4 more seconds, but paused
    expect(clock.gameMinutes).toBeCloseTo(0.5, 5);
  });

  it('resumes after pause', () => {
    let clock = createGameClock();
    clock = tickClock(clock, 0);
    clock = tickClock(clock, 1000); // 0.5 min
    clock = pauseClock(clock);
    clock = tickClock(clock, 5000); // paused, no change
    clock = resumeClock(clock);
    clock = tickClock(clock, 6000); // initializes timestamp
    clock = tickClock(clock, 8000); // 2 seconds at 1x = 1 min
    expect(clock.gameMinutes).toBeCloseTo(1.5, 5);
  });

  it('rejects invalid speeds', () => {
    const clock = createGameClock();
    expect(() => setClockSpeed(clock, 3)).toThrow('Invalid speed');
    expect(() => setClockSpeed(clock, 0)).toThrow('Invalid speed');
  });

  it('formats game time correctly', () => {
    expect(formatGameTime(0)).toBe('00:00');
    expect(formatGameTime(90)).toBe('01:30');
    expect(formatGameTime(720)).toBe('12:00');
    expect(formatGameTime(61.5)).toBe('01:01');
  });
});
