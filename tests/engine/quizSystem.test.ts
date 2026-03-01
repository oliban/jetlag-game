import { describe, it, expect } from 'vitest';
import {
  calculateCoinsEarned,
  canTakeQuiz,
  getCooldownExpiry,
  formatCooldownRemaining,
  buildShuffledIndices,
  pickQuestions,
  QUIZ_COOLDOWN_MINUTES,
  QUIZ_COST,
  QUIZ_QUESTION_COUNT,
} from '../../src/engine/quizSystem';
import type { QuizQuestion } from '../../src/types/quiz';

describe('quizSystem', () => {
  describe('calculateCoinsEarned', () => {
    describe('10-question quiz', () => {
      it('returns 5 for 10/10', () => expect(calculateCoinsEarned(10, 10)).toBe(5));
      it('returns 3 for 9/10', () => expect(calculateCoinsEarned(9, 10)).toBe(3));
      it('returns 2 for 8/10', () => expect(calculateCoinsEarned(8, 10)).toBe(2));
      it('returns 1 for 7/10', () => expect(calculateCoinsEarned(7, 10)).toBe(1));
      it('returns 0 for <7', () => expect(calculateCoinsEarned(6, 10)).toBe(0));
    });
    describe('5-question quiz', () => {
      it('returns 3 for 5/5', () => expect(calculateCoinsEarned(5, 5)).toBe(3));
      it('returns 2 for 4/5', () => expect(calculateCoinsEarned(4, 5)).toBe(2));
      it('returns 1 for 3/5', () => expect(calculateCoinsEarned(3, 5)).toBe(1));
      it('returns 0 for <3', () => expect(calculateCoinsEarned(2, 5)).toBe(0));
    });
  });

  describe('canTakeQuiz', () => {
    it('returns true when no cooldown exists', () => {
      expect(canTakeQuiz(null, 100)).toBe(true);
    });
    it('returns false when cooldown has not expired', () => {
      expect(canTakeQuiz(400, 300)).toBe(false);
    });
    it('returns true when cooldown has expired', () => {
      expect(canTakeQuiz(400, 400)).toBe(true);
    });
  });

  describe('getCooldownExpiry', () => {
    it('returns gameMinutes + QUIZ_COOLDOWN_MINUTES', () => {
      expect(getCooldownExpiry(100)).toBe(100 + QUIZ_COOLDOWN_MINUTES);
    });
  });

  describe('formatCooldownRemaining', () => {
    it('formats hours and minutes', () => {
      expect(formatCooldownRemaining(300, 100)).toBe('3h 20m');
    });
    it('formats minutes only when <1h', () => {
      expect(formatCooldownRemaining(150, 100)).toBe('50m');
    });
    it('returns 0m when expired', () => {
      expect(formatCooldownRemaining(100, 200)).toBe('0m');
    });
  });

  describe('buildShuffledIndices', () => {
    const makeQ = (id: string, correct: number): QuizQuestion => ({
      id,
      text: 'Test question',
      options: ['A', 'B', 'C', 'D'],
      correct,
      scope: 'city',
    });

    it('shuffledCorrect maps to the correct original option', () => {
      const questions = [makeQ('q1', 2), makeQ('q2', 0)];
      const { shuffledIndices, shuffledCorrect } = buildShuffledIndices(questions);

      for (let i = 0; i < questions.length; i++) {
        const originalCorrect = questions[i].correct;
        const displaySlot = shuffledCorrect[i];
        const originalIndex = shuffledIndices[i][displaySlot];
        expect(originalIndex).toBe(originalCorrect);
      }
    });

    it('produces valid permutations of [0,1,2,3]', () => {
      const questions = [makeQ('q1', 1)];
      const { shuffledIndices } = buildShuffledIndices(questions);
      expect(shuffledIndices[0].sort()).toEqual([0, 1, 2, 3]);
    });
  });

  describe('pickQuestions', () => {
    const pool: QuizQuestion[] = Array.from({ length: 20 }, (_, i) => ({
      id: `q${i}`,
      text: `Question ${i}`,
      options: ['A', 'B', 'C', 'D'],
      correct: 0,
      scope: 'city',
    }));

    it('returns the requested number of questions', () => {
      expect(pickQuestions(pool, 10)).toHaveLength(10);
    });

    it('returns pool as-is when count >= pool size', () => {
      expect(pickQuestions(pool, 25)).toHaveLength(20);
    });

    it('returns unique questions', () => {
      const picked = pickQuestions(pool, 10);
      const ids = picked.map(q => q.id);
      expect(new Set(ids).size).toBe(10);
    });
  });

  describe('constants', () => {
    it('has expected values', () => {
      expect(QUIZ_COST).toBe(1);
      expect(QUIZ_QUESTION_COUNT).toBe(10);
      expect(QUIZ_COOLDOWN_MINUTES).toBe(240);
    });
  });
});
