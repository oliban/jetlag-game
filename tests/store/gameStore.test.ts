import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/gameStore';
import { getNeighbors } from '../../src/data/graph';

describe('Game Store', () => {
  beforeEach(() => {
    // Reset store to initial state
    useGameStore.setState({
      phase: 'setup',
      playerStationId: null,
      hidingZone: null,
      clock: { gameMinutes: 0, speed: 1, paused: false, lastTimestamp: null },
      seed: 42,
    });
  });

  it('starts in setup phase', () => {
    const state = useGameStore.getState();
    expect(state.phase).toBe('setup');
    expect(state.playerStationId).toBeNull();
  });

  it('startGame transitions to hiding with a random station', () => {
    const { startGame } = useGameStore.getState();
    startGame(42);
    const state = useGameStore.getState();
    expect(state.phase).toBe('hiding');
    expect(state.playerStationId).toBeTruthy();
  });

  it('startGame is deterministic with same seed', () => {
    const { startGame } = useGameStore.getState();
    startGame(42);
    const station1 = useGameStore.getState().playerStationId;

    // Reset and start again with same seed
    useGameStore.setState({ phase: 'setup', playerStationId: null });
    useGameStore.getState().startGame(42);
    const station2 = useGameStore.getState().playerStationId;

    expect(station1).toBe(station2);
  });

  it('travelTo initiates transit to adjacent station', () => {
    const { startGame } = useGameStore.getState();
    startGame(42);
    const startStation = useGameStore.getState().playerStationId!;
    const neighbors = getNeighbors(startStation);
    expect(neighbors.length).toBeGreaterThan(0);

    useGameStore.getState().travelTo(neighbors[0]);
    // Player should now be in transit (not yet arrived)
    const state = useGameStore.getState();
    expect(state.playerTransit).not.toBeNull();
    expect(state.playerTransit!.toStationId).toBe(neighbors[0]);
    // Station hasn't changed yet — still at start
    expect(state.playerStationId).toBe(startStation);

    // Simulate transit completion by advancing game clock past arrival time
    // tick() checks if gameMinutes >= arrivalTime and completes transit
    const arrivalTime = state.playerTransit!.arrivalTime;
    useGameStore.setState({
      clock: { ...state.clock, gameMinutes: arrivalTime + 1, lastTimestamp: null },
    });
    // Call tick with current time — since lastTimestamp is null, it just sets it
    // but the transit check uses the already-set gameMinutes
    useGameStore.getState().tick(performance.now());
    expect(useGameStore.getState().playerStationId).toBe(neighbors[0]);
    expect(useGameStore.getState().playerTransit).toBeNull();
  });

  it('travelTo rejects non-adjacent stations', () => {
    const { startGame } = useGameStore.getState();
    startGame(42);
    const startStation = useGameStore.getState().playerStationId!;

    // Pick a station that's not adjacent
    const neighbors = new Set(getNeighbors(startStation));
    const nonAdjacent = startStation === 'naples' ? 'london' : 'naples';
    expect(neighbors.has(nonAdjacent)).toBe(false);

    useGameStore.getState().travelTo(nonAdjacent);
    expect(useGameStore.getState().playerStationId).toBe(startStation);
  });

  it('settleHere creates hiding zone', () => {
    const { startGame } = useGameStore.getState();
    startGame(42);
    expect(useGameStore.getState().hidingZone).toBeNull();

    useGameStore.getState().settleHere();
    const zone = useGameStore.getState().hidingZone;
    expect(zone).not.toBeNull();
    expect(zone!.radius).toBe(0.8);
    expect(zone!.stationId).toBe(useGameStore.getState().playerStationId);
  });

  it('cannot travel after settling', () => {
    const { startGame } = useGameStore.getState();
    startGame(42);
    const startStation = useGameStore.getState().playerStationId!;
    const neighbors = getNeighbors(startStation);

    useGameStore.getState().settleHere();
    useGameStore.getState().travelTo(neighbors[0]);

    // Position should not have changed
    expect(useGameStore.getState().playerStationId).toBe(startStation);
  });

  it('cannot settle twice', () => {
    const { startGame } = useGameStore.getState();
    startGame(42);
    useGameStore.getState().settleHere();
    const zone1 = useGameStore.getState().hidingZone;

    // Travel to adjacent first (which should fail since settled)
    const neighbors = getNeighbors(useGameStore.getState().playerStationId!);
    useGameStore.getState().travelTo(neighbors[0]);
    useGameStore.getState().settleHere();

    // Zone should be unchanged
    expect(useGameStore.getState().hidingZone).toEqual(zone1);
  });

  it('travelTo does nothing in setup phase', () => {
    useGameStore.getState().travelTo('paris');
    expect(useGameStore.getState().playerStationId).toBeNull();
  });
});
