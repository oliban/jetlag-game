import { describe, it, expect } from 'vitest';
import { evaluateQuestion } from '../../src/questions/evaluators';
import { getQuestionById } from '../../src/questions/questionPool';

describe('Question Evaluators', () => {
  describe('Radar questions', () => {
    it('radar-100: returns Yes when within 100km', () => {
      // Paris Nord and Paris Lyon are ~5km apart
      const q = getQuestionById('radar-100')!;
      const result = evaluateQuestion(q, 'paris-nord', 'paris-lyon');
      expect(result.answer).toBe('Yes');
      expect(result.constraint?.type).toBe('circle');
      if (result.constraint?.type === 'circle') {
        expect(result.constraint.inside).toBe(true);
        expect(result.constraint.radiusKm).toBe(100);
      }
    });

    it('radar-100: returns No when far apart', () => {
      // Paris Nord and Berlin are ~880km apart
      const q = getQuestionById('radar-100')!;
      const result = evaluateQuestion(q, 'paris-nord', 'berlin-hbf');
      expect(result.answer).toBe('No');
      if (result.constraint?.type === 'circle') {
        expect(result.constraint.inside).toBe(false);
      }
    });

    it('radar-500: returns Yes for Paris-Amsterdam (~500km)', () => {
      const q = getQuestionById('radar-500')!;
      const result = evaluateQuestion(q, 'paris-nord', 'amsterdam-centraal');
      expect(result.answer).toBe('Yes');
    });
  });

  describe('Relative questions', () => {
    it('rel-north: Paris is south of Amsterdam → No', () => {
      const q = getQuestionById('rel-north')!;
      const result = evaluateQuestion(q, 'paris-nord', 'amsterdam-centraal');
      expect(result.answer).toBe('No');
      expect(result.constraint?.type).toBe('half-plane');
      if (result.constraint?.type === 'half-plane') {
        expect(result.constraint.direction).toBe('below');
      }
    });

    it('rel-north: Amsterdam is north of Paris → Yes', () => {
      const q = getQuestionById('rel-north')!;
      const result = evaluateQuestion(q, 'amsterdam-centraal', 'paris-nord');
      expect(result.answer).toBe('Yes');
      if (result.constraint?.type === 'half-plane') {
        expect(result.constraint.direction).toBe('above');
      }
    });

    it('rel-east: Berlin is east of Paris → Yes', () => {
      const q = getQuestionById('rel-east')!;
      const result = evaluateQuestion(q, 'berlin-hbf', 'paris-nord');
      expect(result.answer).toBe('Yes');
      if (result.constraint?.type === 'half-plane') {
        expect(result.constraint.direction).toBe('east');
      }
    });

    it('rel-east: Paris is west of Berlin → No', () => {
      const q = getQuestionById('rel-east')!;
      const result = evaluateQuestion(q, 'paris-nord', 'berlin-hbf');
      expect(result.answer).toBe('No');
      if (result.constraint?.type === 'half-plane') {
        expect(result.constraint.direction).toBe('west');
      }
    });
  });

  describe('Precision questions', () => {
    it('prec-same-country: Yes when both in France', () => {
      const q = getQuestionById('prec-same-country')!;
      const result = evaluateQuestion(q, 'paris-nord', 'paris-lyon');
      expect(result.answer).toBe('Yes');
    });

    it('prec-same-country: No when different countries', () => {
      const q = getQuestionById('prec-same-country')!;
      const result = evaluateQuestion(q, 'paris-nord', 'berlin-hbf');
      expect(result.answer).toBe('No');
    });

    it('prec-hub: Yes for a station with 4+ connections', () => {
      // Paris Nord is a major hub
      const q = getQuestionById('prec-hub')!;
      const result = evaluateQuestion(q, 'paris-nord', 'berlin-hbf');
      expect(result.answer).toBe('Yes');
    });

    it('prec-name-am: Yes for station starting with A-M', () => {
      // Berlin starts with B
      const q = getQuestionById('prec-name-am')!;
      const result = evaluateQuestion(q, 'berlin-hbf', 'paris-nord');
      expect(result.answer).toBe('Yes');
    });

    it('prec-name-am: No for station starting with N-Z', () => {
      // Paris starts with P
      const q = getQuestionById('prec-name-am')!;
      const result = evaluateQuestion(q, 'paris-nord', 'berlin-hbf');
      expect(result.answer).toBe('No');
    });
  });
});
