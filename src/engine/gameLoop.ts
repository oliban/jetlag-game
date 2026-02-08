export interface GameClock {
  /** Current game time in minutes */
  gameMinutes: number;
  /** Speed multiplier (1x, 2x, 5x, 10x) */
  speed: number;
  /** Whether clock is paused */
  paused: boolean;
  /** Last real timestamp in ms */
  lastTimestamp: number | null;
}

export function createGameClock(): GameClock {
  return {
    gameMinutes: 0,
    speed: 1,
    paused: false,
    lastTimestamp: null,
  };
}

/**
 * Advances game clock based on real elapsed time.
 * 1 real second = 0.5 game minutes at 1x speed.
 */
export function tickClock(clock: GameClock, nowMs: number): GameClock {
  if (clock.paused) {
    return { ...clock, lastTimestamp: nowMs };
  }

  if (clock.lastTimestamp === null) {
    return { ...clock, lastTimestamp: nowMs };
  }

  const elapsedRealMs = nowMs - clock.lastTimestamp;
  const elapsedRealSec = elapsedRealMs / 1000;
  // 1 real second = 0.5 game minutes at 1x
  const gameMinutesElapsed = elapsedRealSec * 0.5 * clock.speed;

  return {
    ...clock,
    gameMinutes: clock.gameMinutes + gameMinutesElapsed,
    lastTimestamp: nowMs,
  };
}

export function setClockSpeed(clock: GameClock, speed: number): GameClock {
  if (![1, 2, 5, 10, 20].includes(speed)) {
    throw new Error(`Invalid speed: ${speed}. Must be 1, 2, 5, 10, or 20.`);
  }
  return { ...clock, speed };
}

export function pauseClock(clock: GameClock): GameClock {
  return { ...clock, paused: true };
}

export function resumeClock(clock: GameClock): GameClock {
  return { ...clock, paused: false, lastTimestamp: null };
}

/** Format game minutes as HH:MM */
export function formatGameTime(gameMinutes: number): string {
  const hours = Math.floor(gameMinutes / 60);
  const mins = Math.floor(gameMinutes % 60);
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/** Format a duration in minutes as compact "Xh Ym" or just "Ym" */
export function formatDuration(minutes: number): string {
  const m = Math.ceil(minutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem.toString().padStart(2, '0')}m`;
}
