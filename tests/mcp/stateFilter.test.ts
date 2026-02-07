import { describe, it, expect } from 'vitest';
import { filterStateForRole, type FullGameState, type SeekerViewState, type HiderViewState } from '../../src/mcp/stateFilter';

describe('State Filter (Anti-Cheat)', () => {
  const fullState: FullGameState = {
    phase: 'seeking',
    hiderStationId: 'paris-nord',
    hiderStationName: 'Paris Gare du Nord',
    seekerStationId: 'berlin-hbf',
    seekerStationName: 'Berlin Hauptbahnhof',
    gameMinutes: 120,
    constraints: [],
    questionsAsked: [{ question: 'Within 500km?', answer: 'No' }],
    availableSeekerConnections: ['hamburg-hbf', 'dresden-hbf', 'hannover-hbf'],
    hidingZoneActive: true,
  };

  it('seeker state does NOT contain hider position', () => {
    const seekerView = filterStateForRole(fullState, 'seeker') as SeekerViewState;
    // Seeker should see their own position
    expect(seekerView.seekerStationId).toBe('berlin-hbf');
    // Seeker should NOT see hider position
    expect((seekerView as unknown as Record<string, unknown>).hiderStationId).toBeUndefined();
    expect((seekerView as unknown as Record<string, unknown>).hiderStationName).toBeUndefined();
  });

  it('seeker state contains their own station and connections', () => {
    const seekerView = filterStateForRole(fullState, 'seeker') as SeekerViewState;
    expect(seekerView.seekerStationId).toBe('berlin-hbf');
    expect(seekerView.availableConnections).toContain('hamburg-hbf');
  });

  it('seeker state contains questions and constraints', () => {
    const seekerView = filterStateForRole(fullState, 'seeker') as SeekerViewState;
    expect(seekerView.questionsAsked).toHaveLength(1);
    expect(seekerView.constraints).toEqual([]);
  });

  it('hider state contains seeker position', () => {
    const hiderView = filterStateForRole(fullState, 'hider') as HiderViewState;
    expect(hiderView.seekerStationId).toBe('berlin-hbf');
    expect(hiderView.seekerStationName).toBe('Berlin Hauptbahnhof');
  });

  it('hider state contains their own position', () => {
    const hiderView = filterStateForRole(fullState, 'hider') as HiderViewState;
    expect(hiderView.hiderStationId).toBe('paris-nord');
  });

  it('hider state shows hiding zone status', () => {
    const hiderView = filterStateForRole(fullState, 'hider') as HiderViewState;
    expect(hiderView.hidingZoneActive).toBe(true);
  });
});
