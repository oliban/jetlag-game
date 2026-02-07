import type { QuestionCategory } from './questionPool';

const COOLDOWN_MINUTES = 30;

export interface CooldownTracker {
  /** Last asked time (game minutes) per category */
  lastAsked: Record<QuestionCategory, number | null>;
}

export function createCooldownTracker(): CooldownTracker {
  return {
    lastAsked: {
      radar: null,
      relative: null,
      precision: null,
    },
  };
}

export function canAskCategory(
  tracker: CooldownTracker,
  category: QuestionCategory,
  currentGameMinutes: number,
): boolean {
  const last = tracker.lastAsked[category];
  if (last === null) return true;
  return currentGameMinutes - last >= COOLDOWN_MINUTES;
}

export function recordQuestion(
  tracker: CooldownTracker,
  category: QuestionCategory,
  currentGameMinutes: number,
): CooldownTracker {
  return {
    lastAsked: {
      ...tracker.lastAsked,
      [category]: currentGameMinutes,
    },
  };
}

export function getCooldownRemaining(
  tracker: CooldownTracker,
  category: QuestionCategory,
  currentGameMinutes: number,
): number {
  const last = tracker.lastAsked[category];
  if (last === null) return 0;
  const remaining = COOLDOWN_MINUTES - (currentGameMinutes - last);
  return Math.max(0, remaining);
}

export { COOLDOWN_MINUTES };
