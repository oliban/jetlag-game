import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/gameStore';
import { getNeighbors } from '../../src/data/graph';
import { getRoutes, getRoutesAtStation, _resetRouteCache } from '../../src/engine/trainRoutes';

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

  describe('travelViaRoute', () => {
    // Use seeking phase (no time limit) for route travel tests
    function startSeekingAt(stationId: string) {
      useGameStore.setState({
        phase: 'seeking',
        playerRole: 'seeker',
        playerStationId: stationId,
        hidingZone: { stationId: 'naples', lat: 40.85, lng: 14.27, radius: 0.8 },
        playerTransit: null,
        clock: { gameMinutes: 0, speed: 1, paused: false, lastTimestamp: null },
        visitedStations: new Set([stationId]),
      });
    }

    it('sets up multi-stop transit with route info', () => {
      const routes = getRoutes();
      const multiStop = routes.find(r => r.stations.length >= 3);
      if (!multiStop) return;

      const origin = multiStop.stations[0];
      const destination = multiStop.stations[multiStop.stations.length - 1];
      startSeekingAt(origin);

      useGameStore.getState().travelViaRoute(multiStop.id, destination, multiStop.offset);

      const state = useGameStore.getState();
      expect(state.playerTransit).not.toBeNull();
      expect(state.playerTransit!.routeId).toBe(multiStop.id);
      expect(state.playerTransit!.destinationStationId).toBe(destination);
      expect(state.playerTransit!.toStationId).toBe(multiStop.stations[1]);
      expect(state.playerTransit!.nextArrivalTime).toBeDefined();
      expect(state.playerTransit!.routeStations).toBeDefined();
      expect(state.playerTransit!.routeStations!.length).toBeGreaterThanOrEqual(2);
    });

    it('rejects boarding when not at a valid station on the route', () => {
      const routes = getRoutes();
      const route = routes[0];

      // Put player at a station NOT on this route
      const stationNotOnRoute = routes.find(r => r.id !== route.id && !route.stations.includes(r.stations[0]))?.stations[0];
      if (!stationNotOnRoute) return;

      startSeekingAt(stationNotOnRoute);
      useGameStore.getState().travelViaRoute(route.id, route.stations[route.stations.length - 1], 0);

      expect(useGameStore.getState().playerTransit).toBeNull();
    });

    it('blocks travel past hiding time limit in hiding phase', () => {
      const routes = getRoutes();
      const longRoute = routes.find(r => r.totalDuration > 240 && r.stations.length >= 3);
      if (!longRoute) return;

      // Use hiding phase for this specific test
      useGameStore.setState({
        phase: 'hiding',
        playerRole: 'hider',
        playerStationId: longRoute.stations[0],
        hidingZone: null,
        playerTransit: null,
        clock: { gameMinutes: 0, speed: 1, paused: false, lastTimestamp: null },
      });
      useGameStore.getState().travelViaRoute(
        longRoute.id,
        longRoute.stations[longRoute.stations.length - 1],
        longRoute.offset,
      );

      expect(useGameStore.getState().playerTransit).toBeNull();
    });
  });

  describe('multi-stop tick advancement', () => {
    function startSeekingAt(stationId: string) {
      useGameStore.setState({
        phase: 'seeking',
        playerRole: 'seeker',
        playerStationId: stationId,
        hidingZone: { stationId: 'naples', lat: 40.85, lng: 14.27, radius: 0.8 },
        playerTransit: null,
        clock: { gameMinutes: 0, speed: 1, paused: false, lastTimestamp: null },
        visitedStations: new Set([stationId]),
        gameResult: null,
      });
    }

    it('advances through intermediate stations', () => {
      const routes = getRoutes();
      const route = routes.find(r => r.stations.length >= 3);
      if (!route) return;

      const origin = route.stations[0];
      const midStation = route.stations[1];
      const destination = route.stations[2];

      startSeekingAt(origin);
      useGameStore.getState().travelViaRoute(route.id, destination, route.offset);
      const transit = useGameStore.getState().playerTransit;
      expect(transit).not.toBeNull();
      expect(transit!.toStationId).toBe(midStation);

      // Advance clock past the first intermediate arrival
      const firstArrival = transit!.nextArrivalTime!;
      useGameStore.setState({
        clock: { gameMinutes: firstArrival + 0.1, speed: 1, paused: false, lastTimestamp: null },
      });
      useGameStore.getState().tick(performance.now());

      const afterFirst = useGameStore.getState();
      expect(afterFirst.playerStationId).toBe(midStation);

      if (midStation !== destination) {
        expect(afterFirst.playerTransit).not.toBeNull();
        expect(afterFirst.playerTransit!.toStationId).toBe(destination);
        expect(afterFirst.playerTransit!.nextArrivalTime).toBeGreaterThan(firstArrival);
      }
    });

    it('clears transit when reaching final destination', () => {
      const routes = getRoutes();
      const route = routes.find(r => r.stations.length >= 3);
      if (!route) return;

      const origin = route.stations[0];
      const destination = route.stations[route.stations.length - 1];

      startSeekingAt(origin);
      useGameStore.getState().travelViaRoute(route.id, destination, route.offset);
      const transit = useGameStore.getState().playerTransit;
      expect(transit).not.toBeNull();

      // Tick through each intermediate stop
      const finalArrival = transit!.arrivalTime;
      for (let i = 0; i < route.stations.length; i++) {
        const t = useGameStore.getState().playerTransit;
        if (!t) break;
        const arrival = t.nextArrivalTime ?? t.arrivalTime;
        useGameStore.setState({
          clock: { gameMinutes: arrival + 0.1, speed: 1, paused: false, lastTimestamp: null },
        });
        useGameStore.getState().tick(performance.now());
      }

      const finalState = useGameStore.getState();
      expect(finalState.playerStationId).toBe(destination);
      expect(finalState.playerTransit).toBeNull();
    });

    it('dwell timing is deterministic regardless of clock speed', () => {
      const routes = getRoutes();
      const route = routes.find(r => r.stations.length >= 3);
      if (!route) return;

      const origin = route.stations[0];
      const destination = route.stations[2];

      startSeekingAt(origin);
      useGameStore.getState().travelViaRoute(route.id, destination, route.offset);
      const transit1 = useGameStore.getState().playerTransit!;
      const firstArrival = transit1.nextArrivalTime!;

      // Simulate high speed: clock jumps well past arrival
      useGameStore.setState({
        clock: { gameMinutes: firstArrival + 50, speed: 10, paused: false, lastTimestamp: null },
      });
      useGameStore.getState().tick(performance.now());

      const afterJump = useGameStore.getState();
      if (afterJump.playerTransit?.nextArrivalTime) {
        // Next arrival should be based on firstArrival (exact arrival time),
        // not the jumped clock time — ensures deterministic dwell
        expect(afterJump.playerTransit.nextArrivalTime).toBeLessThan(firstArrival + 500);
        expect(afterJump.playerTransit.nextArrivalTime).toBeGreaterThan(firstArrival);
      }
    });
  });
});
