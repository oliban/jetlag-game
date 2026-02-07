import type { QuestionCategory } from '../questions/questionPool.ts';

export interface CoinBudget {
  total: number;
  spent: number;
  remaining: number;
}

export const STARTING_COINS = 10;

export const QUESTION_COSTS: Record<QuestionCategory, number> = {
  radar: 1,
  relative: 2,
  precision: 3,
};

export function createCoinBudget(total: number = STARTING_COINS): CoinBudget {
  return { total, spent: 0, remaining: total };
}

export function getCost(category: QuestionCategory): number {
  return QUESTION_COSTS[category];
}

export function canAfford(budget: CoinBudget, category: QuestionCategory): boolean {
  return budget.remaining >= QUESTION_COSTS[category];
}

export function spendCoins(budget: CoinBudget, category: QuestionCategory): CoinBudget {
  const cost = QUESTION_COSTS[category];
  if (budget.remaining < cost) {
    throw new Error(`Cannot afford ${category} question (cost=${cost}, remaining=${budget.remaining})`);
  }
  return {
    total: budget.total,
    spent: budget.spent + cost,
    remaining: budget.remaining - cost,
  };
}
