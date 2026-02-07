import { describe, it, expect } from 'vitest';
import { canTransition, transition } from '../../src/engine/stateMachine';

describe('State Machine', () => {
  it('allows setup → hiding', () => {
    expect(canTransition('setup', 'hiding')).toBe(true);
    expect(transition('setup', 'hiding')).toBe('hiding');
  });

  it('allows hiding → seeking', () => {
    expect(canTransition('hiding', 'seeking')).toBe(true);
  });

  it('allows seeking → round_end', () => {
    expect(canTransition('seeking', 'round_end')).toBe(true);
  });

  it('allows round_end → setup', () => {
    expect(canTransition('round_end', 'setup')).toBe(true);
  });

  it('allows setup → seeking (seeker mode)', () => {
    expect(canTransition('setup', 'seeking')).toBe(true);
    expect(transition('setup', 'seeking')).toBe('seeking');
  });

  it('rejects setup → round_end (skip)', () => {
    expect(canTransition('setup', 'round_end')).toBe(false);
  });

  it('rejects hiding → setup (backward)', () => {
    expect(canTransition('hiding', 'setup')).toBe(false);
  });

  it('rejects same-phase transition', () => {
    expect(canTransition('hiding', 'hiding')).toBe(false);
  });

  it('throws on invalid transition', () => {
    expect(() => transition('setup', 'round_end')).toThrow('Invalid phase transition');
  });
});
