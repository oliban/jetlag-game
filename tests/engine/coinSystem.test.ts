import { describe, it, expect } from 'vitest';
import {
  createCoinBudget,
  canAfford,
  spendCoins,
  getCost,
  STARTING_COINS,
  QUESTION_COSTS,
} from '../../src/engine/coinSystem';

describe('coinSystem', () => {
  it('creates a budget with default starting coins', () => {
    const budget = createCoinBudget();
    expect(budget.total).toBe(STARTING_COINS);
    expect(budget.spent).toBe(0);
    expect(budget.remaining).toBe(STARTING_COINS);
  });

  it('creates a budget with custom total', () => {
    const budget = createCoinBudget(5);
    expect(budget.total).toBe(5);
    expect(budget.remaining).toBe(5);
  });

  it('getCost returns correct costs per category', () => {
    expect(getCost('radar')).toBe(1);
    expect(getCost('relative')).toBe(2);
    expect(getCost('precision')).toBe(3);
  });

  it('canAfford returns true when enough coins', () => {
    const budget = createCoinBudget(3);
    expect(canAfford(budget, 'radar')).toBe(true);
    expect(canAfford(budget, 'relative')).toBe(true);
    expect(canAfford(budget, 'precision')).toBe(true);
  });

  it('canAfford returns false when not enough coins', () => {
    const budget = createCoinBudget(1);
    expect(canAfford(budget, 'radar')).toBe(true);
    expect(canAfford(budget, 'relative')).toBe(false);
    expect(canAfford(budget, 'precision')).toBe(false);
  });

  it('spendCoins deducts correctly', () => {
    let budget = createCoinBudget(10);
    budget = spendCoins(budget, 'radar'); // cost 1
    expect(budget.spent).toBe(1);
    expect(budget.remaining).toBe(9);

    budget = spendCoins(budget, 'precision'); // cost 3
    expect(budget.spent).toBe(4);
    expect(budget.remaining).toBe(6);
  });

  it('spendCoins throws when insufficient funds', () => {
    const budget = createCoinBudget(1);
    expect(() => spendCoins(budget, 'precision')).toThrow('Cannot afford');
  });

  it('supports spending all coins exactly', () => {
    let budget = createCoinBudget(3);
    budget = spendCoins(budget, 'precision'); // cost 3
    expect(budget.remaining).toBe(0);
    expect(canAfford(budget, 'radar')).toBe(false);
  });
});
