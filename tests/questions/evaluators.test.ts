import { describe, it, expect } from 'vitest';
import { evaluateQuestion } from '../../src/questions/evaluators';
import { getQuestionById } from '../../src/questions/questionPool';

describe('Question Evaluators', () => {
  describe('Radar questions', () => {
    it('radar-100: returns Yes when within 100km', () => {
      // Brussels and Antwerp are ~50km apart
      const q = getQuestionById('radar-100')!;
      const result = evaluateQuestion(q, 'brussels-midi', 'antwerp-centraal');
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
      const result = evaluateQuestion(q, 'paris', 'berlin-hbf');
      expect(result.answer).toBe('No');
      if (result.constraint?.type === 'circle') {
        expect(result.constraint.inside).toBe(false);
      }
    });

    it('radar-500: returns Yes for Paris-Amsterdam (~500km)', () => {
      const q = getQuestionById('radar-500')!;
      const result = evaluateQuestion(q, 'paris', 'amsterdam-centraal');
      expect(result.answer).toBe('Yes');
    });
  });

  describe('Relative questions', () => {
    it('rel-north: Paris is south of Amsterdam → No', () => {
      const q = getQuestionById('rel-north')!;
      const result = evaluateQuestion(q, 'paris', 'amsterdam-centraal');
      expect(result.answer).toBe('No');
      expect(result.constraint?.type).toBe('half-plane');
      if (result.constraint?.type === 'half-plane') {
        expect(result.constraint.direction).toBe('below');
      }
    });

    it('rel-north: Amsterdam is north of Paris → Yes', () => {
      const q = getQuestionById('rel-north')!;
      const result = evaluateQuestion(q, 'amsterdam-centraal', 'paris');
      expect(result.answer).toBe('Yes');
      if (result.constraint?.type === 'half-plane') {
        expect(result.constraint.direction).toBe('above');
      }
    });

    it('rel-east: Berlin is east of Paris → Yes', () => {
      const q = getQuestionById('rel-east')!;
      const result = evaluateQuestion(q, 'berlin-hbf', 'paris');
      expect(result.answer).toBe('Yes');
      if (result.constraint?.type === 'half-plane') {
        expect(result.constraint.direction).toBe('east');
      }
    });

    it('rel-east: Paris is west of Berlin → No', () => {
      const q = getQuestionById('rel-east')!;
      const result = evaluateQuestion(q, 'paris', 'berlin-hbf');
      expect(result.answer).toBe('No');
      if (result.constraint?.type === 'half-plane') {
        expect(result.constraint.direction).toBe('west');
      }
    });
  });

  describe('Precision questions', () => {
    it('prec-same-country: Yes when both in France', () => {
      const q = getQuestionById('prec-same-country')!;
      const result = evaluateQuestion(q, 'paris', 'marseille-st-charles');
      expect(result.answer).toBe('Yes');
    });

    it('prec-same-country: No when different countries', () => {
      const q = getQuestionById('prec-same-country')!;
      const result = evaluateQuestion(q, 'paris', 'berlin-hbf');
      expect(result.answer).toBe('No');
    });

    it('prec-hub: Yes for a station with 4+ connections', () => {
      // Paris Nord is a major hub
      const q = getQuestionById('prec-hub')!;
      const result = evaluateQuestion(q, 'paris', 'berlin-hbf');
      expect(result.answer).toBe('Yes');
    });

    it('prec-name-am: Yes for station starting with A-M', () => {
      // Berlin starts with B
      const q = getQuestionById('prec-name-am')!;
      const result = evaluateQuestion(q, 'berlin-hbf', 'paris');
      expect(result.answer).toBe('Yes');
    });

    it('prec-name-am: No for station starting with N-Z', () => {
      // Paris starts with P
      const q = getQuestionById('prec-name-am')!;
      const result = evaluateQuestion(q, 'paris', 'berlin-hbf');
      expect(result.answer).toBe('No');
    });

    it('prec-coastal: Yes for Marseille (coastal)', () => {
      const q = getQuestionById('prec-coastal')!;
      const result = evaluateQuestion(q, 'marseille-st-charles', 'paris');
      expect(result.answer).toBe('Yes');
      expect(result.constraint?.type).toBe('text');
    });

    it('prec-coastal: No for Paris (inland)', () => {
      const q = getQuestionById('prec-coastal')!;
      const result = evaluateQuestion(q, 'paris', 'berlin-hbf');
      expect(result.answer).toBe('No');
    });

    it('prec-mountain: Yes for Innsbruck (Alps)', () => {
      const q = getQuestionById('prec-mountain')!;
      const result = evaluateQuestion(q, 'innsbruck-hbf', 'paris');
      expect(result.answer).toBe('Yes');
    });

    it('prec-mountain: No for Berlin (flat)', () => {
      const q = getQuestionById('prec-mountain')!;
      const result = evaluateQuestion(q, 'berlin-hbf', 'paris');
      expect(result.answer).toBe('No');
    });

    it('prec-capital: Yes for Paris', () => {
      const q = getQuestionById('prec-capital')!;
      const result = evaluateQuestion(q, 'paris', 'berlin-hbf');
      expect(result.answer).toBe('Yes');
    });

    it('prec-capital: No for Lyon', () => {
      const q = getQuestionById('prec-capital')!;
      const result = evaluateQuestion(q, 'lyon-part-dieu', 'berlin-hbf');
      expect(result.answer).toBe('No');
    });

    it('prec-landlocked: Yes for Vienna (Austria)', () => {
      const q = getQuestionById('prec-landlocked')!;
      const result = evaluateQuestion(q, 'vienna-hbf', 'paris');
      expect(result.answer).toBe('Yes');
    });

    it('prec-landlocked: No for Paris (France)', () => {
      const q = getQuestionById('prec-landlocked')!;
      const result = evaluateQuestion(q, 'paris', 'berlin-hbf');
      expect(result.answer).toBe('No');
    });

    it('prec-country-area: Yes for France (643k km²)', () => {
      const q = getQuestionById('prec-country-area')!;
      const result = evaluateQuestion(q, 'paris', 'berlin-hbf');
      expect(result.answer).toBe('Yes');
    });

    it('prec-country-area: No for Belgium (30k km²)', () => {
      const q = getQuestionById('prec-country-area')!;
      const result = evaluateQuestion(q, 'brussels-midi', 'paris');
      expect(result.answer).toBe('No');
    });

    it('prec-olympic: Yes for Barcelona (1992)', () => {
      const q = getQuestionById('prec-olympic')!;
      const result = evaluateQuestion(q, 'barcelona-sants', 'paris');
      expect(result.answer).toBe('Yes');
    });

    it('prec-olympic: No for Madrid', () => {
      const q = getQuestionById('prec-olympic')!;
      const result = evaluateQuestion(q, 'madrid-atocha', 'paris');
      expect(result.answer).toBe('No');
    });

    it('prec-beer-wine: Beer for Germany', () => {
      const q = getQuestionById('prec-beer-wine')!;
      const result = evaluateQuestion(q, 'berlin-hbf', 'paris');
      expect(result.answer).toBe('Beer');
    });

    it('prec-beer-wine: Wine for France', () => {
      const q = getQuestionById('prec-beer-wine')!;
      const result = evaluateQuestion(q, 'paris', 'berlin-hbf');
      expect(result.answer).toBe('Wine');
    });

    it('prec-ancient: Yes for Rome', () => {
      const q = getQuestionById('prec-ancient')!;
      const result = evaluateQuestion(q, 'rome-termini', 'paris');
      expect(result.answer).toBe('Yes');
    });

    it('prec-ancient: No for Berlin', () => {
      const q = getQuestionById('prec-ancient')!;
      const result = evaluateQuestion(q, 'berlin-hbf', 'paris');
      expect(result.answer).toBe('No');
    });

    it('prec-f1: Yes for UK (Silverstone)', () => {
      const q = getQuestionById('prec-f1')!;
      const result = evaluateQuestion(q, 'london', 'paris');
      expect(result.answer).toBe('Yes');
    });

    it('prec-f1: No for Germany', () => {
      const q = getQuestionById('prec-f1')!;
      const result = evaluateQuestion(q, 'berlin-hbf', 'paris');
      expect(result.answer).toBe('No');
    });

    it('prec-metro: Yes for Paris', () => {
      const q = getQuestionById('prec-metro')!;
      const result = evaluateQuestion(q, 'paris', 'berlin-hbf');
      expect(result.answer).toBe('Yes');
    });

    it('prec-metro: No for Interlaken', () => {
      const q = getQuestionById('prec-metro')!;
      const result = evaluateQuestion(q, 'interlaken', 'paris');
      expect(result.answer).toBe('No');
    });
  });

  describe('Thermometer questions', () => {
    it('thermo-coast: Marseille (coastal) nearer to coast than Innsbruck (landlocked Alps)', () => {
      const q = getQuestionById('thermo-coast')!;
      const result = evaluateQuestion(q, 'marseille-st-charles', 'innsbruck-hbf');
      expect(result.answer).toBe('Yes');
      expect(result.constraint?.type).toBe('text');
      if (result.constraint?.type === 'text') {
        expect(result.constraint.label).toBe('Hider nearer to coast');
        expect(parseFloat(result.constraint.value)).toBeGreaterThan(0);
      }
    });

    it('thermo-coast: Innsbruck (inland) further from coast than Marseille (coastal)', () => {
      const q = getQuestionById('thermo-coast')!;
      const result = evaluateQuestion(q, 'innsbruck-hbf', 'marseille-st-charles');
      expect(result.answer).toBe('No');
      if (result.constraint?.type === 'text') {
        expect(result.constraint.label).toBe('Hider further from coast');
      }
    });

    it('thermo-capital: Paris (capital) nearer to capital than Lyon', () => {
      const q = getQuestionById('thermo-capital')!;
      const result = evaluateQuestion(q, 'paris', 'lyon-part-dieu');
      expect(result.answer).toBe('Yes');
      if (result.constraint?.type === 'text') {
        expect(result.constraint.label).toBe('Hider nearer to capital');
      }
    });

    it('thermo-capital: Lyon further from capital than Paris', () => {
      const q = getQuestionById('thermo-capital')!;
      const result = evaluateQuestion(q, 'lyon-part-dieu', 'paris');
      expect(result.answer).toBe('No');
      if (result.constraint?.type === 'text') {
        expect(result.constraint.label).toBe('Hider further from capital');
      }
    });

    it('thermo-mountain: Innsbruck (Alps) nearer to mountains than Amsterdam (flat)', () => {
      const q = getQuestionById('thermo-mountain')!;
      const result = evaluateQuestion(q, 'innsbruck-hbf', 'amsterdam-centraal');
      expect(result.answer).toBe('Yes');
      if (result.constraint?.type === 'text') {
        expect(result.constraint.label).toBe('Hider nearer to mountains');
      }
    });

    it('thermo-mountain: Amsterdam (flat) further from mountains than Innsbruck (Alps)', () => {
      const q = getQuestionById('thermo-mountain')!;
      const result = evaluateQuestion(q, 'amsterdam-centraal', 'innsbruck-hbf');
      expect(result.answer).toBe('No');
      if (result.constraint?.type === 'text') {
        expect(result.constraint.label).toBe('Hider further from mountains');
      }
    });
  });
});
