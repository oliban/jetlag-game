import type { GamePhase } from '../types/game';

const VALID_TRANSITIONS: Record<GamePhase, GamePhase[]> = {
  setup: ['hiding'],
  hiding: ['seeking'],
  seeking: ['round_end'],
  round_end: ['setup'],
};

export function canTransition(from: GamePhase, to: GamePhase): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transition(from: GamePhase, to: GamePhase): GamePhase {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid phase transition: ${from} → ${to}`);
  }
  return to;
}
