import { describe, it, expect } from 'vitest';
import {
  checkAgreement,
  getTiebreakerWinner,
  resolveConsensus,
  type SeekerProposal,
} from '../../src/engine/consensus';

const makeProposal = (
  seekerId: 'seeker-a' | 'seeker-b',
  actionType: string,
  target: string,
): SeekerProposal => ({
  seekerId,
  actionType,
  target,
  reasoning: 'test reasoning',
});

describe('consensus', () => {
  describe('checkAgreement', () => {
    it('returns true when proposals match', () => {
      const a = makeProposal('seeker-a', 'travel_to', 'paris-gare-du-nord');
      const b = makeProposal('seeker-b', 'travel_to', 'paris-gare-du-nord');
      expect(checkAgreement(a, b)).toBe(true);
    });

    it('returns false when action types differ', () => {
      const a = makeProposal('seeker-a', 'travel_to', 'paris-gare-du-nord');
      const b = makeProposal('seeker-b', 'ask_question', 'paris-gare-du-nord');
      expect(checkAgreement(a, b)).toBe(false);
    });

    it('returns false when targets differ', () => {
      const a = makeProposal('seeker-a', 'travel_to', 'paris-gare-du-nord');
      const b = makeProposal('seeker-b', 'travel_to', 'berlin-hbf');
      expect(checkAgreement(a, b)).toBe(false);
    });
  });

  describe('getTiebreakerWinner', () => {
    it('returns seeker-a for even turns', () => {
      expect(getTiebreakerWinner(0)).toBe('seeker-a');
      expect(getTiebreakerWinner(2)).toBe('seeker-a');
      expect(getTiebreakerWinner(4)).toBe('seeker-a');
    });

    it('returns seeker-b for odd turns', () => {
      expect(getTiebreakerWinner(1)).toBe('seeker-b');
      expect(getTiebreakerWinner(3)).toBe('seeker-b');
      expect(getTiebreakerWinner(5)).toBe('seeker-b');
    });
  });

  describe('resolveConsensus', () => {
    it('resolves via agreement when initial proposals match', () => {
      const a = makeProposal('seeker-a', 'travel_to', 'paris-gare-du-nord');
      const b = makeProposal('seeker-b', 'travel_to', 'paris-gare-du-nord');
      const result = resolveConsensus(a, b, null, null, 0);
      expect(result.agreed).toBe(true);
      expect(result.method).toBe('agreement');
      expect(result.action.target).toBe('paris-gare-du-nord');
    });

    it('resolves via discussion when revised proposals match', () => {
      const a = makeProposal('seeker-a', 'travel_to', 'paris-gare-du-nord');
      const b = makeProposal('seeker-b', 'travel_to', 'berlin-hbf');
      const revisedB = makeProposal('seeker-b', 'travel_to', 'paris-gare-du-nord');
      const result = resolveConsensus(a, b, null, revisedB, 0);
      expect(result.agreed).toBe(true);
      expect(result.method).toBe('discussion');
    });

    it('resolves via tiebreaker when still disagreed (even turn → seeker-a wins)', () => {
      const a = makeProposal('seeker-a', 'travel_to', 'paris-gare-du-nord');
      const b = makeProposal('seeker-b', 'travel_to', 'berlin-hbf');
      const result = resolveConsensus(a, b, null, null, 0);
      expect(result.agreed).toBe(false);
      expect(result.method).toBe('tiebreaker');
      expect(result.action.target).toBe('paris-gare-du-nord');
    });

    it('resolves via tiebreaker when still disagreed (odd turn → seeker-b wins)', () => {
      const a = makeProposal('seeker-a', 'travel_to', 'paris-gare-du-nord');
      const b = makeProposal('seeker-b', 'travel_to', 'berlin-hbf');
      const result = resolveConsensus(a, b, null, null, 1);
      expect(result.agreed).toBe(false);
      expect(result.method).toBe('tiebreaker');
      expect(result.action.target).toBe('berlin-hbf');
    });
  });
});
