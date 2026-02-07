/**
 * Seeded pseudo-random number generator (mulberry32).
 * Produces deterministic sequences for reproducible games.
 */
export function createSeededRandom(seed: number) {
  let state = seed | 0;

  function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    /** Returns a float in [0, 1) */
    random: next,

    /** Returns an integer in [min, max] inclusive */
    randInt(min: number, max: number): number {
      return Math.floor(next() * (max - min + 1)) + min;
    },

    /** Picks a random element from an array */
    pick<T>(arr: T[]): T {
      return arr[Math.floor(next() * arr.length)];
    },

    /** Shuffles an array in place (Fisher-Yates) */
    shuffle<T>(arr: T[]): T[] {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}
