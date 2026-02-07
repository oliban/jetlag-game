import { describe, it, expect } from 'vitest';
import {
  createCooldownTracker,
  canAskCategory,
  recordQuestion,
  getCooldownRemaining,
  COOLDOWN_MINUTES,
} from '../../src/questions/cooldown';

describe('Question Cooldown', () => {
  it('all categories available initially', () => {
    const tracker = createCooldownTracker();
    expect(canAskCategory(tracker, 'radar', 0)).toBe(true);
    expect(canAskCategory(tracker, 'relative', 0)).toBe(true);
    expect(canAskCategory(tracker, 'precision', 0)).toBe(true);
  });

  it('category blocked after asking', () => {
    let tracker = createCooldownTracker();
    tracker = recordQuestion(tracker, 'radar', 10);
    expect(canAskCategory(tracker, 'radar', 10)).toBe(false);
    expect(canAskCategory(tracker, 'radar', 20)).toBe(false);
    expect(canAskCategory(tracker, 'radar', 39)).toBe(false);
  });

  it('category available after cooldown', () => {
    let tracker = createCooldownTracker();
    tracker = recordQuestion(tracker, 'radar', 10);
    expect(canAskCategory(tracker, 'radar', 10 + COOLDOWN_MINUTES)).toBe(true);
    expect(canAskCategory(tracker, 'radar', 10 + COOLDOWN_MINUTES + 1)).toBe(true);
  });

  it('different categories are independent', () => {
    let tracker = createCooldownTracker();
    tracker = recordQuestion(tracker, 'radar', 10);
    expect(canAskCategory(tracker, 'relative', 10)).toBe(true);
    expect(canAskCategory(tracker, 'precision', 10)).toBe(true);
  });

  it('cooldown remaining is correct', () => {
    let tracker = createCooldownTracker();
    tracker = recordQuestion(tracker, 'radar', 10);
    expect(getCooldownRemaining(tracker, 'radar', 10)).toBe(COOLDOWN_MINUTES);
    expect(getCooldownRemaining(tracker, 'radar', 20)).toBe(COOLDOWN_MINUTES - 10);
    expect(getCooldownRemaining(tracker, 'radar', 10 + COOLDOWN_MINUTES)).toBe(0);
  });

  it('cooldown remaining is 0 for never-asked category', () => {
    const tracker = createCooldownTracker();
    expect(getCooldownRemaining(tracker, 'radar', 0)).toBe(0);
  });
});
