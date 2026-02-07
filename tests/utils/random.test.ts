import { describe, it, expect } from 'vitest';
import { createSeededRandom } from '../../src/utils/random';

describe('Seeded Random', () => {
  it('produces deterministic sequence for same seed', () => {
    const rng1 = createSeededRandom(42);
    const rng2 = createSeededRandom(42);

    const seq1 = Array.from({ length: 10 }, () => rng1.random());
    const seq2 = Array.from({ length: 10 }, () => rng2.random());

    expect(seq1).toEqual(seq2);
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = createSeededRandom(42);
    const rng2 = createSeededRandom(99);

    const seq1 = Array.from({ length: 10 }, () => rng1.random());
    const seq2 = Array.from({ length: 10 }, () => rng2.random());

    expect(seq1).not.toEqual(seq2);
  });

  it('random() returns values in [0, 1)', () => {
    const rng = createSeededRandom(123);
    for (let i = 0; i < 1000; i++) {
      const val = rng.random();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('randInt returns values in [min, max]', () => {
    const rng = createSeededRandom(456);
    for (let i = 0; i < 1000; i++) {
      const val = rng.randInt(1, 6);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(6);
    }
  });

  it('pick returns elements from the array', () => {
    const rng = createSeededRandom(789);
    const items = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 100; i++) {
      const val = rng.pick(items);
      expect(items).toContain(val);
    }
  });

  it('shuffle is deterministic for same seed', () => {
    const arr1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const arr2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    const rng1 = createSeededRandom(42);
    const rng2 = createSeededRandom(42);

    rng1.shuffle(arr1);
    rng2.shuffle(arr2);

    expect(arr1).toEqual(arr2);
  });

  it('shuffle actually reorders elements', () => {
    const rng = createSeededRandom(42);
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const original = [...arr];
    rng.shuffle(arr);
    // Very unlikely to stay in same order with 10 elements
    expect(arr).not.toEqual(original);
    // But contains same elements
    expect(arr.sort()).toEqual(original.sort());
  });
});
