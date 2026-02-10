import { create } from 'zustand';
import type { GamePhase, HidingZone, TransitState, SeekerMode, TravelHistoryEntry } from '../types/game';
import { canTransition } from '../engine/stateMachine';
import {
  createGameClock,
  tickClock,
  setClockSpeed,
  pauseClock,
  resumeClock,
  type GameClock,
} from '../engine/gameLoop';
import { getNeighbors, getStations } from '../data/graph';
import { createSeededRandom } from '../utils/random';
import type { Constraint } from '../engine/constraints';
import type { CooldownTracker } from '../questions/cooldown';
import { createCooldownTracker } from '../questions/cooldown';
import { runSeekerTurn } from '../engine/seekerLoop';
import { runConsensusTurn, type ConsensusLogEntry } from '../engine/consensusLoop';
import { haversineDistance } from '../engine/geo';
import { logger } from '../engine/logger';
import { evaluateQuestion } from '../questions/evaluators';
import { getQuestionById, QUESTION_POOL } from '../questions/questionPool';
import {
  canAskCategory,
  recordQuestion,
} from '../questions/cooldown';
import { createCoinBudget, canAfford, spendCoins, type CoinBudget } from '../engine/coinSystem';
import { getTravelInfo } from '../engine/trainSchedule';
import { getRoutes, getUpcomingDepartures } from '../engine/trainRoutes';
import type { ProviderConfig } from '../client/providerAdapter';
import type { TravelRouteEntry } from '../client/aiClient';
import type { WeatherZone, TrainDelay, TrainAccident } from '../types/disruptions';
import { tickWeather, createInitialWeatherZones } from '../engine/weather';
import { tickDisruptions, getTrainDelay, isTrainAccident } from '../engine/disruptions';
import { getActiveTrains } from '../engine/activeTrains';
import { getBlockedSegments, isSegmentBlocked, isTrainBlockedOnSegment } from '../engine/segmentBlock';

export interface QuestionEntry {
  question: string;
  answer: string;
  category?: string;
}

export interface DebugLogEntry {
  timestamp: number;
  tool: string;
  args: unknown;
  result: unknown;
}

export interface GameStore {
  // Game state
  phase: GamePhase;
  playerRole: 'hider' | 'seeker';
  playerStationId: string | null;
  hidingZone: HidingZone | null;
  clock: GameClock;
  seed: number;

  // Transit state
  playerTransit: TransitState | null;
  seekerTransit: TransitState | null;

  // Seeking phase state
  seekerStationId: string | null;
  visitedStations: Set<string>;
  constraints: Constraint[];
  questionsAsked: QuestionEntry[];
  cooldownTracker: CooldownTracker | null;
  gameResult: 'seeker_wins' | 'hider_wins' | 'fatal_accident' | 'seeker_killed' | null;
  debugLog: DebugLogEntry[];
  hasAnthropicProvider: boolean;
  hasOpenaiProvider: boolean;
  isAISeeking: boolean;

  // Coin system
  coinBudget: CoinBudget | null;

  // Dual seeker / consensus
  seekerMode: SeekerMode;
  seekerTurnNumber: number;
  consensusLog: ConsensusLogEntry[];

  // Travel history (for route replay)
  seekerTravelHistory: TravelHistoryEntry[];
  seekerStartStationId: string | null;
  playerTravelHistory: TravelHistoryEntry[];
  playerStartStationId: string | null;

  // AI seeker scheduling
  seekerNextActionTime: number;
  seekerTravelQueue: TravelRouteEntry[];

  // Disruptions
  weatherZones: WeatherZone[];
  delays: Map<string, TrainDelay>;
  accidents: Map<string, TrainAccident>;

  // Queued connection (player clicked a departure while in transit)
  queuedRoute: { routeId: string; destinationStationId: string; departureTime: number } | null;

  // UI state
  hoveredRadarRadius: number | null;
  cameraFollow: boolean;

  // Actions
  setHoveredRadarRadius: (radius: number | null) => void;
  toggleCameraFollow: () => void;
  startGame: (seedOrRole?: number | 'hider' | 'seeker', seed?: number) => void;
  travelTo: (stationId: string) => void;
  settleHere: () => void;
  setSpeed: (speed: number) => void;
  togglePause: () => void;
  tick: (nowMs: number) => void;
  transitionPhase: (to: GamePhase) => void;
  fetchProviderConfig: () => Promise<void>;
  addConstraint: (constraint: Constraint) => void;
  addQuestion: (entry: QuestionEntry) => void;
  addDebugLog: (entry: DebugLogEntry) => void;
  setSeekerStation: (stationId: string) => void;
  setGameResult: (result: 'seeker_wins' | 'hider_wins' | 'fatal_accident' | 'seeker_killed') => void;
  setIsAISeeking: (seeking: boolean) => void;
  setCooldownTracker: (tracker: CooldownTracker) => void;
  startSeeking: () => void;
  executeSeekerTurn: () => Promise<void>;
  seekerAskQuestion: (questionId: string) => void;
  seekerTravelTo: (stationId: string) => void;
  travelViaRoute: (routeId: string, destinationStationId: string, departureTime: number) => void;
  getOffAtNextStation: () => void;
  stayOnTrain: () => void;
}

/**
 * Compute the seeker's current position for question evaluation.
 * Uses segmentDepartureTime / nextArrivalTime to interpolate directly —
 * no ActiveTrain matching needed.
 */
function getSeekerPos(state: { playerStationId: string | null; playerTransit: TransitState | null; clock: GameClock }): string | { lat: number; lng: number; country: string } {
  const { playerStationId, playerTransit, clock } = state;
  if (!playerStationId) return '';

  // Not in transit — use station directly
  if (!playerTransit || clock.gameMinutes < playerTransit.segmentDepartureTime) {
    return playerStationId;
  }

  // Accident stalled — player is stuck at departure station
  if (playerTransit.accidentStalled) {
    return playerTransit.fromStationId;
  }

  const stations = getStations();
  const from = stations[playerTransit.fromStationId];
  const to = stations[playerTransit.toStationId];
  if (!from || !to) return playerStationId;

  // Account for delay: effective departure is segmentDepartureTime + delayMinutes
  const delay = playerTransit.delayMinutes ?? 0;
  const effectiveDeparture = playerTransit.segmentDepartureTime + delay;

  // Train hasn't actually departed yet (still delayed at station)
  if (clock.gameMinutes < effectiveDeparture) {
    return playerTransit.fromStationId;
  }

  const segEnd = playerTransit.nextArrivalTime ?? playerTransit.arrivalTime;
  const segDuration = segEnd - playerTransit.segmentDepartureTime;
  const elapsed = clock.gameMinutes - effectiveDeparture;
  const progress = segDuration > 0 ? Math.min(1, elapsed / segDuration) : 0;

  return {
    lat: from.lat + (to.lat - from.lat) * progress,
    lng: from.lng + (to.lng - from.lng) * progress,
    country: progress < 0.5 ? from.country : to.country,
  };
}

export const useGameStore = create<GameStore>((set, get) => ({
  phase: 'setup',
  playerRole: 'hider',
  playerStationId: null,
  hidingZone: null,
  clock: createGameClock(),
  seed: Date.now(),

  // Transit
  playerTransit: null,
  seekerTransit: null,

  // Seeking phase state
  seekerStationId: null,
  visitedStations: new Set<string>(),
  constraints: [],
  questionsAsked: [],
  cooldownTracker: null,
  gameResult: null,
  debugLog: [],
  hasAnthropicProvider: false,
  hasOpenaiProvider: false,
  isAISeeking: false,

  // Coins
  coinBudget: null,

  // Dual seeker / consensus
  seekerMode: 'single',
  seekerTurnNumber: 0,
  consensusLog: [],

  // Travel history (for route replay)
  seekerTravelHistory: [],
  seekerStartStationId: null,
  playerTravelHistory: [],
  playerStartStationId: null,

  // AI seeker scheduling
  seekerNextActionTime: 0,
  seekerTravelQueue: [],

  // Disruptions
  weatherZones: [],
  delays: new Map(),
  accidents: new Map(),

  // Queued connection
  queuedRoute: null,

  // UI state
  hoveredRadarRadius: null,
  cameraFollow: false,

  setHoveredRadarRadius: (radius: number | null) => set({ hoveredRadarRadius: radius }),
  toggleCameraFollow: () => set((s) => ({ cameraFollow: !s.cameraFollow })),

  startGame: (seedOrRole?: number | 'hider' | 'seeker', seed?: number) => {
    // Parse arguments: startGame(), startGame(seed), startGame('seeker'), startGame('seeker', seed)
    let role: 'hider' | 'seeker' = 'hider';
    let s: number;
    if (typeof seedOrRole === 'string') {
      role = seedOrRole;
      s = seed ?? Date.now();
    } else {
      s = seedOrRole ?? Date.now();
    }

    const rng = createSeededRandom(s);
    const stations = getStations();
    const ids = Object.keys(stations);

    if (role === 'seeker') {
      // Seeker mode: pick player start, pick AI hider far away
      const playerStart = rng.pick(ids);
      const playerStation = stations[playerStart];

      // Pick AI hider: minimum distance threshold + distance-weighted random
      const MIN_HIDER_DISTANCE_KM = 300;
      const otherIds = ids.filter(id => id !== playerStart);
      const distances = otherIds.map(id => {
        const st = stations[id];
        return st && playerStation
          ? haversineDistance(st.lat, st.lng, playerStation.lat, playerStation.lng)
          : 0;
      });

      // Filter to stations beyond minimum distance; fall back to all if none qualify
      let candidateIds = otherIds.filter((_, i) => distances[i] >= MIN_HIDER_DISTANCE_KM);
      let candidateDists = distances.filter(d => d >= MIN_HIDER_DISTANCE_KM);
      if (candidateIds.length === 0) {
        candidateIds = otherIds;
        candidateDists = distances;
      }

      // Use distance as weight so farther stations are more likely but not guaranteed
      const bestHider = rng.weightedPick(candidateIds, candidateDists);
      const bestDist = candidateDists[candidateIds.indexOf(bestHider)];

      const hiderStation = stations[bestHider];
      logger.info('gameStore', `Seeker mode started. Player (seeker) at ${playerStation?.name} (${playerStart}), ${Math.round(bestDist)}km from hider, seed=${s}`);
      // Intentionally not logging hider position (anti-cheat)

      set({
        phase: 'seeking',
        playerRole: 'seeker',
        playerStationId: playerStart,
        hidingZone: hiderStation ? {
          stationId: bestHider,
          lat: hiderStation.lat,
          lng: hiderStation.lng,
          radius: 0.8,
        } : null,
        clock: createGameClock(),
        seed: s,
        seekerStationId: null,
        visitedStations: new Set([playerStart]),
        cooldownTracker: createCooldownTracker(),
        constraints: [],
        questionsAsked: [],
        gameResult: null,
        debugLog: [],
        isAISeeking: false,
        coinBudget: createCoinBudget(),
        playerTransit: null,
        seekerTransit: null,
        seekerTurnNumber: 0,
        seekerNextActionTime: 0,
  seekerTravelQueue: [],
        consensusLog: [],
        seekerTravelHistory: [],
        seekerStartStationId: playerStart,
        playerTravelHistory: [],
        playerStartStationId: playerStart,
        weatherZones: createInitialWeatherZones(rng),
        delays: new Map(),
        accidents: new Map(),
      });
      return;
    }

    // Hider mode (default): existing behavior
    const state = get();
    const hasBothKeys = state.hasAnthropicProvider && state.hasOpenaiProvider;

    const startStation = rng.pick(ids);
    logger.debug('gameStore', `Game started. Hider at ${stations[startStation]?.name} (${startStation}), seed=${s}`);

    set({
      phase: 'hiding',
      playerRole: 'hider',
      playerStationId: startStation,
      hidingZone: null,
      clock: createGameClock(),
      seed: s,
      seekerMode: hasBothKeys ? 'consensus' : 'single',
      playerTransit: null,
      seekerTransit: null,
      seekerTurnNumber: 0,
      consensusLog: [],
      seekerTravelHistory: [],
      seekerStartStationId: null,
      playerTravelHistory: [],
      playerStartStationId: startStation,
      weatherZones: createInitialWeatherZones(rng),
      delays: new Map(),
      accidents: new Map(),
    });
  },

  travelTo: (stationId: string) => {
    const { phase, playerStationId, hidingZone, playerTransit, clock } = get();
    if (phase !== 'hiding') return;
    if (hidingZone) return; // Already settled
    if (!playerStationId) return;
    // Block if already on the train (past departure), but allow changing while waiting
    if (playerTransit && clock.gameMinutes >= playerTransit.departureTime) return;

    const neighbors = getNeighbors(playerStationId);
    if (!neighbors.includes(stationId)) return;

    // Find a route departure that goes through the neighbor station
    const departures = getUpcomingDepartures(playerStationId, clock.gameMinutes, 20);
    const dep = departures.find(d => d.remainingStops.some(s => s.stationId === stationId));

    if (dep) {
      const stopInfo = dep.remainingStops.find(s => s.stationId === stationId)!;
      // Hider can't board a train that arrives after the hiding time limit
      const HIDING_TIME_LIMIT = 240;
      if (phase === 'hiding' && stopInfo.arrivalMin > HIDING_TIME_LIMIT) return;

      const route = dep.route;
      const dir = dep.direction;
      const routeStations = dir === 'forward' ? route.stations : [...route.stations].reverse();
      const fromIdx = routeStations.indexOf(playerStationId);
      const toIdx = routeStations.indexOf(stationId);
      const travelStations = routeStations.slice(fromIdx, toIdx + 1);

      set({
        playerTransit: {
          fromStationId: playerStationId,
          toStationId: stationId,
          departureTime: dep.departureTime,
          segmentDepartureTime: dep.departureTime,
          arrivalTime: stopInfo.arrivalMin,
          trainType: route.trainType,
          routeId: route.id,
          routeStations: travelStations,
          destinationStationId: stationId,
          nextArrivalTime: stopInfo.arrivalMin,
        },
      });
    }
  },

  settleHere: () => {
    const { phase, playerStationId, hidingZone, playerTransit } = get();
    if (phase !== 'hiding') return;
    if (hidingZone) return; // Already settled
    if (!playerStationId) return;
    // Can't settle while on the train, but can cancel a pending departure to settle
    const { clock } = get();
    if (playerTransit && clock.gameMinutes >= playerTransit.departureTime) return;

    const stations = getStations();
    const station = stations[playerStationId];
    if (!station) return;

    set({
      playerTransit: null, // Cancel any pending departure
      hidingZone: {
        stationId: playerStationId,
        lat: station.lat,
        lng: station.lng,
        radius: 0.8,
      },
      cooldownTracker: createCooldownTracker(),
    });
  },

  setSpeed: (speed: number) => {
    set((state) => ({ clock: setClockSpeed(state.clock, speed) }));
  },

  togglePause: () => {
    set((state) => ({
      clock: state.clock.paused
        ? resumeClock(state.clock)
        : pauseClock(state.clock),
    }));
  },

  tick: (nowMs: number) => {
    const state = get();
    if (state.gameResult) return; // Stop clock when game is over
    const newClock = tickClock(state.clock, nowMs);
    const deltaMinutes = newClock.gameMinutes - state.clock.gameMinutes;

    // --- Tick weather & disruptions ---
    const disruptionRng = createSeededRandom(state.seed + Math.floor(newClock.gameMinutes * 100));
    const updatedWeatherZones = tickWeather(state.weatherZones, newClock.gameMinutes, deltaMinutes, disruptionRng);

    const activeTrains = getActiveTrains(newClock.gameMinutes);
    const trainPositionMap = new Map<string, { lat: number; lng: number; fromStationId?: string; toStationId?: string; progress?: number }>();
    for (const t of activeTrains) {
      trainPositionMap.set(t.id, {
        lat: t.lat,
        lng: t.lng,
        fromStationId: t.dwelling ? undefined : (t.stations[t.currentSegmentIndex] ?? undefined),
        toStationId: t.dwelling ? undefined : t.nextStationId,
        progress: t.progress,
      });
    }

    // Build operator lookup from routes (routeId -> operator)
    const routes = getRoutes();
    const routeOperatorMap = new Map<string, string>();
    for (const r of routes) routeOperatorMap.set(r.id, r.operator);

    const disruptionResult = tickDisruptions({
      activeTrainIds: activeTrains.map(t => t.id),
      getTrainPosition: (id) => trainPositionMap.get(id) ?? null,
      weatherZones: updatedWeatherZones,
      delays: state.delays,
      accidents: state.accidents,
      gameMinutes: newClock.gameMinutes,
      deltaMinutes,
      rng: disruptionRng,
      getTrainOperator: (id) => {
        const routeId = id.split(':')[0];
        return routeOperatorMap.get(routeId) ?? null;
      },
    });

    let updatedDelays = disruptionResult.delays;
    let updatedAccidents = disruptionResult.accidents;

    // Log disruption summary when events happen
    if (disruptionResult.newDelays.length > 0 || disruptionResult.newAccidents.length > 0) {
      const activeDelays = [...updatedDelays.values()].filter(d => !d.resolved).length;
      logger.info('gameStore', `Disruptions: ${activeDelays} active delays, ${updatedAccidents.size} accidents, ${updatedWeatherZones.length} weather zones`);
    }

    // Compute blocked segments for segment-blocking logic
    const blockedSegments = getBlockedSegments(updatedAccidents, newClock.gameMinutes);

    // Check player transit completion
    let playerTransit = state.playerTransit;
    let playerStationId = state.playerStationId;
    let visitedStations = state.visitedStations;
    let seekerTravelHistoryFromPlayer = state.seekerTravelHistory;
    let playerTravelHistory = state.playerTravelHistory;

    if (playerTransit) {
      // If train is stalled (accident or segment block), skip transit completion
      // Re-check segment block status: if the block cleared, unstall
      if (playerTransit.accidentStalled) {
        const pFrom = playerTransit.fromStationId;
        const pTo = playerTransit.toStationId;
        if (!isSegmentBlocked(blockedSegments, pFrom, pTo)) {
          if (!playerTransit.routeId) {
            // Legacy single-hop: no own-accident tracking, so this IS the final unstall
            const stallStart = playerTransit.stalledAtGameMinutes ?? newClock.gameMinutes;
            const stallDuration = newClock.gameMinutes - stallStart;
            playerTransit = {
              ...playerTransit,
              accidentStalled: undefined,
              stalledAtGameMinutes: undefined,
              segmentDepartureTime: playerTransit.segmentDepartureTime + stallDuration,
              arrivalTime: playerTransit.arrivalTime + stallDuration,
              ...(playerTransit.nextArrivalTime != null ? { nextArrivalTime: playerTransit.nextArrivalTime + stallDuration } : {}),
            };
          } else {
            // Segment unblocked — clear accidentStalled but keep stalledAtGameMinutes.
            // The own-accident section below will either re-stall or do the final time-shift.
            playerTransit = { ...playerTransit, accidentStalled: undefined };
          }
        }
      }

      // Multi-stop route: check intermediate arrival (skip if stalled)
      // Account for delay: actual arrival = scheduled arrival + delay
      const playerDelay = playerTransit.delayMinutes ?? 0;
      if (!playerTransit.accidentStalled && playerTransit.nextArrivalTime != null && newClock.gameMinutes >= playerTransit.nextArrivalTime + playerDelay) {
        // Record travel history for this segment
        const segEntry = {
          fromStationId: playerTransit.fromStationId,
          toStationId: playerTransit.toStationId,
          departureTime: playerTransit.segmentDepartureTime,
          arrivalTime: playerTransit.nextArrivalTime!,
          trainType: playerTransit.trainType,
        };
        playerTravelHistory = [...playerTravelHistory, segEntry];
        if (state.playerRole === 'seeker') {
          seekerTravelHistoryFromPlayer = [...seekerTravelHistoryFromPlayer, segEntry];
        }
        // Arrived at intermediate stop
        playerStationId = playerTransit.toStationId;
        if (state.playerRole === 'seeker' && !visitedStations.has(playerStationId)) {
          visitedStations = new Set(visitedStations);
          visitedStations.add(playerStationId);
        }

        if (playerStationId === playerTransit.destinationStationId) {
          // Reached final destination
          playerTransit = null;
        } else if (playerTransit.routeStations) {
          // Advance to next station on the route
          const routeStations = playerTransit.routeStations;
          const currentIdx = routeStations.indexOf(playerStationId);
          if (currentIdx >= 0 && currentIdx < routeStations.length - 1) {
            const nextStationId = routeStations[currentIdx + 1];

            // Check if next segment is blocked by an accident
            if (isSegmentBlocked(blockedSegments, playerStationId, nextStationId)) {
              logger.info('gameStore', `Player held at ${playerStationId}: segment to ${nextStationId} blocked by accident`);
              playerTransit = null;
            } else {
            // Find the route to get stop times
            const routes = getRoutes();
            const route = routes.find(r => r.id === playerTransit!.routeId);
            if (route) {
              let segmentDuration = 0;
              const dwellTime = route.dwellTime;

              // Check forward stop times
              const fwdStopIdx = route.stopTimes.findIndex(s => s.stationId === playerStationId);
              const fwdNextIdx = route.stopTimes.findIndex(s => s.stationId === nextStationId);
              if (fwdStopIdx >= 0 && fwdNextIdx >= 0 && fwdNextIdx > fwdStopIdx) {
                segmentDuration = route.stopTimes[fwdNextIdx].arrivalMin - route.stopTimes[fwdStopIdx].departureMin;
              } else {
                // Check reverse stop times
                const revStopIdx = route.reverseStopTimes.findIndex(s => s.stationId === playerStationId);
                const revNextIdx = route.reverseStopTimes.findIndex(s => s.stationId === nextStationId);
                if (revStopIdx >= 0 && revNextIdx >= 0 && revNextIdx > revStopIdx) {
                  segmentDuration = route.reverseStopTimes[revNextIdx].arrivalMin - route.reverseStopTimes[revStopIdx].departureMin;
                }
              }

              const segDeparture = playerTransit!.nextArrivalTime! + dwellTime;
              const nextArrival = segDeparture + segmentDuration;
              playerTransit = {
                ...playerTransit,
                fromStationId: playerStationId,
                toStationId: nextStationId,
                segmentDepartureTime: segDeparture,
                nextArrivalTime: nextArrival,
              };
            } else {
              // Route not found — clear transit
              playerTransit = null;
            }
            }
          } else {
            // Can't find next station — clear transit
            playerTransit = null;
          }
        } else {
          // No route stations info — clear transit
          playerTransit = null;
        }
      } else if (!playerTransit.accidentStalled && playerTransit.nextArrivalTime == null && newClock.gameMinutes >= playerTransit.arrivalTime + playerDelay) {
        // Record travel history for legacy single-hop
        const legacyEntry = {
          fromStationId: playerTransit.fromStationId,
          toStationId: playerTransit.toStationId,
          departureTime: playerTransit.segmentDepartureTime,
          arrivalTime: playerTransit.arrivalTime,
          trainType: playerTransit.trainType,
        };
        playerTravelHistory = [...playerTravelHistory, legacyEntry];
        if (state.playerRole === 'seeker') {
          seekerTravelHistoryFromPlayer = [...seekerTravelHistoryFromPlayer, legacyEntry];
        }
        // Non-route transit (legacy single-hop): arrival clears transit
        playerStationId = playerTransit.toStationId;
        if (state.playerRole === 'seeker' && !visitedStations.has(playerStationId)) {
          visitedStations = new Set(visitedStations);
          visitedStations.add(playerStationId);
        }
        playerTransit = null;
      }
    }

    // Process queued route when player transit completes
    let queuedRoute = state.queuedRoute;
    if (!playerTransit && queuedRoute && playerStationId) {
      // Transit just completed — try to board queued connection
      // Only if the departure hasn't already left
      if (queuedRoute.departureTime >= newClock.gameMinutes) {
        // Defer to travelViaRoute after state update (will be called below)
      } else {
        // Missed the connection — discard
        logger.info('gameStore', `Queued route ${queuedRoute.routeId} missed (departed ${queuedRoute.departureTime}, now ${Math.floor(newClock.gameMinutes)})`);
        queuedRoute = null;
      }
    }

    // --- Apply delays/accidents to player transit ---
    let gameResult = state.gameResult;
    let phase = state.phase as GamePhase;
    if (playerTransit && playerTransit.routeId) {
      // Compute train instance ID for player's train
      const pRoute = getRoutes().find(r => r.id === playerTransit!.routeId);
      if (pRoute) {
        const pFwdIdx = pRoute.stations.indexOf(playerTransit.routeStations?.[0] ?? '');
        const pRevStations = [...pRoute.stations].reverse();
        const pRevIdx = pRevStations.indexOf(playerTransit.routeStations?.[0] ?? '');
        let pStopTimes = pRoute.stopTimes;
        if (pFwdIdx < 0 && pRevIdx >= 0) pStopTimes = pRoute.reverseStopTimes;
        const pDir = pStopTimes === pRoute.stopTimes ? 'forward' : 'reverse';
        const pFromStop = pStopTimes.find(s => s.stationId === playerTransit!.routeStations?.[0]);
        if (pFromStop) {
          const pOriginDep = playerTransit.departureTime - pFromStop.departureMin;
          const pTrainId = `${playerTransit.routeId}:${pDir}:${pOriginDep}`;

          // Check accident
          const pAccident = isTrainAccident(updatedAccidents, pTrainId);
          if (pAccident) {
            if (pAccident.isFatal) {
              logger.error('gameStore', `FATAL ACCIDENT on player's train ${pTrainId}! Game over.`);
              gameResult = state.playerRole === 'seeker' ? 'fatal_accident' : 'fatal_accident';
              phase = 'round_end';
            } else if (!playerTransit.accidentStalled) {
              logger.warn('gameStore', `Player's train ${pTrainId} involved in ACCIDENT — stalled until ${Math.round(pAccident.resumeAt)}min`);
              playerTransit = { ...playerTransit, accidentStalled: true, stalledAtGameMinutes: playerTransit.stalledAtGameMinutes ?? newClock.gameMinutes };
            }
          } else {
            // Check delay
            const pDelay = getTrainDelay(updatedDelays, pTrainId);
            if (pDelay > 0) {
              if (pDelay !== playerTransit.delayMinutes) {
                logger.info('gameStore', `Player's train ${pTrainId} delayed +${pDelay}min${playerTransit.delayMinutes ? ` (was +${playerTransit.delayMinutes}min)` : ''}`);
              }
              playerTransit = { ...playerTransit, delayMinutes: pDelay };
            } else if (playerTransit.delayMinutes) {
              logger.info('gameStore', `Player's train delay resolved (was +${playerTransit.delayMinutes}min)`);
              playerTransit = { ...playerTransit, delayMinutes: undefined };
            }
            // Clear stall and time-shift if no longer blocked by own accident or segment block
            if ((playerTransit.accidentStalled || playerTransit.stalledAtGameMinutes != null) &&
                !isSegmentBlocked(blockedSegments, playerTransit.fromStationId, playerTransit.toStationId)) {
              logger.info('gameStore', `Player's train accident cleared, resuming travel`);
              const stallStart = playerTransit.stalledAtGameMinutes ?? newClock.gameMinutes;
              const stallDuration = newClock.gameMinutes - stallStart;
              playerTransit = {
                ...playerTransit,
                accidentStalled: undefined,
                stalledAtGameMinutes: undefined,
                segmentDepartureTime: playerTransit.segmentDepartureTime + stallDuration,
                arrivalTime: playerTransit.arrivalTime + stallDuration,
                ...(playerTransit.nextArrivalTime != null ? { nextArrivalTime: playerTransit.nextArrivalTime + stallDuration } : {}),
              };
            }

            // Check mid-segment blocking by another train's accident
            if (playerTransit && !playerTransit.accidentStalled) {
              const pFrom = playerTransit.fromStationId;
              const pTo = playerTransit.toStationId;
              if (isTrainBlockedOnSegment(blockedSegments, pFrom, pTo, pTrainId)) {
                logger.info('gameStore', `Player's train blocked on ${pFrom}→${pTo} by accident ahead`);
                playerTransit = { ...playerTransit, accidentStalled: true, stalledAtGameMinutes: playerTransit.stalledAtGameMinutes ?? newClock.gameMinutes };
              }
            }
          }
        }
      }
    }

    // Check queued route for accidents
    if (queuedRoute) {
      const qRoute = getRoutes().find(r => r.id === queuedRoute!.routeId);
      if (qRoute) {
        // Check if any accident affects the queued train
        for (const [accId] of updatedAccidents) {
          if (accId.startsWith(queuedRoute!.routeId + ':')) {
            logger.info('gameStore', `Queued route ${queuedRoute!.routeId} discarded due to accident`);
            queuedRoute = null;
            break;
          }
        }
      }
    }

    // Check seeker transit completion
    let seekerTransit = state.seekerTransit;
    let seekerStationId = state.seekerStationId;
    let seekerTravelQueue = state.seekerTravelQueue;
    let seekerTravelHistory = state.seekerTravelHistory;
    // Unstall seeker if segment block cleared
    if (seekerTransit && seekerTransit.accidentStalled) {
      const sFrom = seekerTransit.fromStationId;
      const sTo = seekerTransit.toStationId;
      if (!isSegmentBlocked(blockedSegments, sFrom, sTo)) {
        if (!seekerTransit.routeId) {
          // Legacy single-hop: no own-accident tracking, so this IS the final unstall
          const stallStart = seekerTransit.stalledAtGameMinutes ?? newClock.gameMinutes;
          const stallDuration = newClock.gameMinutes - stallStart;
          seekerTransit = {
            ...seekerTransit,
            accidentStalled: undefined,
            stalledAtGameMinutes: undefined,
            segmentDepartureTime: seekerTransit.segmentDepartureTime + stallDuration,
            arrivalTime: seekerTransit.arrivalTime + stallDuration,
            ...(seekerTransit.nextArrivalTime != null ? { nextArrivalTime: seekerTransit.nextArrivalTime + stallDuration } : {}),
          };
        } else {
          // Segment unblocked — clear accidentStalled but keep stalledAtGameMinutes.
          // The own-accident section below will either re-stall or do the final time-shift.
          seekerTransit = { ...seekerTransit, accidentStalled: undefined };
        }
      }
    }
    const seekerDelay = seekerTransit?.delayMinutes ?? 0;
    if (seekerTransit && !seekerTransit.accidentStalled && newClock.gameMinutes >= seekerTransit.arrivalTime + seekerDelay) {
      seekerStationId = seekerTransit.toStationId;
      // Record travel history for route replay
      if (state.playerRole === 'hider') {
        seekerTravelHistory = [...seekerTravelHistory, {
          fromStationId: seekerTransit.fromStationId,
          toStationId: seekerTransit.toStationId,
          departureTime: seekerTransit.segmentDepartureTime,
          arrivalTime: seekerTransit.arrivalTime,
          trainType: seekerTransit.trainType,
        }];
      }
      // Track AI seeker's visited stations too (playerRole === 'hider' means AI is seeking)
      if (state.playerRole === 'hider' && !visitedStations.has(seekerStationId)) {
        visitedStations = new Set(visitedStations);
        visitedStations.add(seekerStationId);
      }
      // Process travel queue: start next hop immediately
      if (seekerTravelQueue.length > 0) {
        const [next, ...remaining] = seekerTravelQueue;
        // Check if next segment is blocked by an accident
        if (isSegmentBlocked(blockedSegments, next.fromStationId, next.stationId)) {
          logger.info('gameStore', `Seeker held at ${seekerStationId}: segment ${next.fromStationId}→${next.stationId} blocked`);
          seekerTransit = null;
          seekerTravelQueue = [];
        } else {
          seekerTransit = {
            fromStationId: next.fromStationId,
            toStationId: next.stationId,
            departureTime: next.departureTime,
            segmentDepartureTime: next.departureTime,
            arrivalTime: next.arrivalTime,
            trainType: next.trainType as 'express' | 'regional' | 'local',
          };
          seekerTravelQueue = remaining;
        }
      } else {
        seekerTransit = null;
      }
    }

    // --- Apply delays/accidents to seeker transit ---
    if (seekerTransit && seekerTransit.routeId) {
      const sRoute = getRoutes().find(r => r.id === seekerTransit!.routeId);
      if (sRoute) {
        const sFwdIdx = sRoute.stations.indexOf(seekerTransit.routeStations?.[0] ?? '');
        const sRevStations = [...sRoute.stations].reverse();
        const sRevIdx = sRevStations.indexOf(seekerTransit.routeStations?.[0] ?? '');
        let sStopTimes = sRoute.stopTimes;
        if (sFwdIdx < 0 && sRevIdx >= 0) sStopTimes = sRoute.reverseStopTimes;
        const sDir = sStopTimes === sRoute.stopTimes ? 'forward' : 'reverse';
        const sFromStop = sStopTimes.find(s => s.stationId === seekerTransit!.routeStations?.[0]);
        if (sFromStop) {
          const sOriginDep = seekerTransit.departureTime - sFromStop.departureMin;
          const sTrainId = `${seekerTransit.routeId}:${sDir}:${sOriginDep}`;

          const sAccident = isTrainAccident(updatedAccidents, sTrainId);
          if (sAccident) {
            if (sAccident.isFatal) {
              logger.error('gameStore', `FATAL ACCIDENT on seeker's train ${sTrainId}! Seeker killed — hider wins.`);
              gameResult = 'seeker_killed';
              phase = 'round_end';
            } else if (!seekerTransit.accidentStalled) {
              logger.warn('gameStore', `Seeker's train ${sTrainId} involved in ACCIDENT — stalled until ${Math.round(sAccident.resumeAt)}min`);
              seekerTransit = { ...seekerTransit, accidentStalled: true, stalledAtGameMinutes: seekerTransit.stalledAtGameMinutes ?? newClock.gameMinutes };
            }
          } else {
            const sDelay = getTrainDelay(updatedDelays, sTrainId);
            if (sDelay > 0) {
              if (sDelay !== seekerTransit.delayMinutes) {
                logger.info('gameStore', `Seeker's train ${sTrainId} delayed +${sDelay}min${seekerTransit.delayMinutes ? ` (was +${seekerTransit.delayMinutes}min)` : ''}`);
              }
              seekerTransit = { ...seekerTransit, delayMinutes: sDelay };
            } else if (seekerTransit.delayMinutes) {
              logger.info('gameStore', `Seeker's train delay resolved (was +${seekerTransit.delayMinutes}min)`);
              seekerTransit = { ...seekerTransit, delayMinutes: undefined };
            }
            // Clear stall and time-shift if no longer blocked by own accident or segment block
            if ((seekerTransit.accidentStalled || seekerTransit.stalledAtGameMinutes != null) &&
                !isSegmentBlocked(blockedSegments, seekerTransit.fromStationId, seekerTransit.toStationId)) {
              logger.info('gameStore', `Seeker's train accident cleared, resuming travel`);
              const stallStart = seekerTransit.stalledAtGameMinutes ?? newClock.gameMinutes;
              const stallDuration = newClock.gameMinutes - stallStart;
              seekerTransit = {
                ...seekerTransit,
                accidentStalled: undefined,
                stalledAtGameMinutes: undefined,
                segmentDepartureTime: seekerTransit.segmentDepartureTime + stallDuration,
                arrivalTime: seekerTransit.arrivalTime + stallDuration,
                ...(seekerTransit.nextArrivalTime != null ? { nextArrivalTime: seekerTransit.nextArrivalTime + stallDuration } : {}),
              };
            }

            // Check mid-segment blocking for seeker
            if (seekerTransit && !seekerTransit.accidentStalled) {
              const sFrom = seekerTransit.fromStationId;
              const sTo = seekerTransit.toStationId;
              if (isTrainBlockedOnSegment(blockedSegments, sFrom, sTo, sTrainId)) {
                logger.info('gameStore', `Seeker's train blocked on ${sFrom}→${sTo} by accident ahead`);
                seekerTransit = { ...seekerTransit, accidentStalled: true, stalledAtGameMinutes: seekerTransit.stalledAtGameMinutes ?? newClock.gameMinutes };
              }
            }
          }
        }
      }
    }

    // Merge travel history: AI seeker history takes precedence when playerRole === 'hider',
    // player seeker history when playerRole === 'seeker'
    const mergedTravelHistory = state.playerRole === 'hider' ? seekerTravelHistory : seekerTravelHistoryFromPlayer;

    set({
      clock: newClock,
      playerTransit,
      playerStationId,
      visitedStations,
      seekerTransit,
      seekerStationId,
      seekerTravelQueue,
      seekerTravelHistory: mergedTravelHistory,
      playerTravelHistory,
      queuedRoute,
      weatherZones: updatedWeatherZones,
      delays: updatedDelays,
      accidents: updatedAccidents,
      ...(gameResult !== state.gameResult ? { gameResult, phase } : {}),
    });

    // Process queued route now that state is updated
    if (!playerTransit && queuedRoute && queuedRoute.departureTime >= newClock.gameMinutes) {
      get().travelViaRoute(queuedRoute.routeId, queuedRoute.destinationStationId, queuedRoute.departureTime);
      set({ queuedRoute: null });
    }

    // Check win condition after player seeker arrives at a station
    if (state.playerRole === 'seeker' && playerStationId !== state.playerStationId) {
      const current = get();
      if (current.hidingZone && playerStationId === current.hidingZone.stationId) {
        logger.info('gameStore', `Seeker wins! Found hider at ${playerStationId}`);
        set({ gameResult: 'seeker_wins' });
      }
    }
  },

  transitionPhase: (to: GamePhase) => {
    const { phase } = get();
    if (!canTransition(phase, to)) return;
    if (to === 'setup') {
      // Full reset
      set({
        phase: 'setup',
        playerRole: 'hider',
        playerStationId: null,
        hidingZone: null,
        clock: createGameClock(),
        seekerStationId: null,
        visitedStations: new Set<string>(),
        constraints: [],
        questionsAsked: [],
        cooldownTracker: null,
        gameResult: null,
        debugLog: [],
        isAISeeking: false,
        coinBudget: null,
        playerTransit: null,
        seekerTransit: null,
        seekerMode: 'single',
        seekerTurnNumber: 0,
        seekerNextActionTime: 0,
  seekerTravelQueue: [],
        consensusLog: [],
        seekerTravelHistory: [],
        seekerStartStationId: null,
        playerTravelHistory: [],
        playerStartStationId: null,
        weatherZones: [],
        delays: new Map(),
        accidents: new Map(),
      });
    } else {
      set({ phase: to });
    }
  },

  fetchProviderConfig: async () => {
    try {
      const response = await fetch('/api/config');
      if (!response.ok) throw new Error(`Config fetch failed: ${response.status}`);
      const data = await response.json();
      set({
        hasAnthropicProvider: !!data.hasAnthropic,
        hasOpenaiProvider: !!data.hasOpenai,
      });
    } catch {
      // Server not running — detect keys from Vite env vars
      set({
        hasAnthropicProvider: !!import.meta.env.VITE_ANTHROPIC_API_KEY,
        hasOpenaiProvider: !!import.meta.env.VITE_OPENAI_API_KEY,
      });
    }
  },

  addConstraint: (constraint) =>
    set((state) => ({ constraints: [...state.constraints, constraint] })),

  addQuestion: (entry) =>
    set((state) => ({ questionsAsked: [...state.questionsAsked, entry] })),

  addDebugLog: (entry) =>
    set((state) => ({ debugLog: [...state.debugLog, entry] })),

  setSeekerStation: (stationId: string) => set({ seekerStationId: stationId }),

  setGameResult: (result) => set({ gameResult: result }),

  setIsAISeeking: (seeking: boolean) => set({ isAISeeking: seeking }),

  setCooldownTracker: (tracker) => set({ cooldownTracker: tracker }),

  startSeeking: () => {
    const { phase, playerStationId, seed, hidingZone } = get();
    if (phase !== 'hiding' || !hidingZone || !playerStationId) return;

    const stations = getStations();
    const ids = Object.keys(stations);
    const rng = createSeededRandom(seed + 1);
    const hiderStation = stations[playerStationId];

    // Pick a seeker start station far from the hider
    let bestStation = rng.pick(ids);
    let bestDist = 0;

    // Try several random candidates and pick the one farthest from hider
    const candidates = rng.shuffle([...ids]).slice(0, Math.min(10, ids.length));
    for (const id of candidates) {
      if (id === playerStationId) continue;
      const s = stations[id];
      if (s && hiderStation) {
        const d = haversineDistance(s.lat, s.lng, hiderStation.lat, hiderStation.lng);
        if (d > bestDist) {
          bestDist = d;
          bestStation = id;
        }
      }
    }

    logger.info('gameStore', `Seeking phase started. Seeker at ${stations[bestStation]?.name} (${bestStation}), ${Math.round(bestDist)}km from hider`);

    set({
      phase: 'seeking',
      clock: createGameClock(),
      seekerStationId: bestStation,
      visitedStations: new Set<string>([bestStation]),
      cooldownTracker: createCooldownTracker(),
      constraints: [],
      questionsAsked: [],
      gameResult: null,
      debugLog: [],
      isAISeeking: false,
      coinBudget: createCoinBudget(),
      playerTransit: null,
      seekerTransit: null,
      seekerTurnNumber: 0,
      seekerNextActionTime: 0,
  seekerTravelQueue: [],
      consensusLog: [],
      seekerTravelHistory: [],
      seekerStartStationId: bestStation,
      // Preserve playerTravelHistory and playerStartStationId from hiding phase
      // Preserve weatherZones from hiding phase, reset delays/accidents
      delays: new Map(),
      accidents: new Map(),
    });
  },

  executeSeekerTurn: async () => {
    const state = get();
    if (state.phase !== 'seeking') return;
    if (!state.seekerStationId || !state.playerStationId) return;
    if (!state.hasAnthropicProvider) return;
    if (state.isAISeeking) return; // Already running
    if (!state.cooldownTracker) return;

    set({ isAISeeking: true });
    logger.info('gameStore', `executeSeekerTurn: starting. Seeker at ${state.seekerStationId}, game time ${Math.floor(state.clock.gameMinutes)}min, mode=${state.seekerMode}`);

    try {
      if (state.seekerMode === 'consensus' && state.hasOpenaiProvider) {
        // Consensus mode: dual seekers
        const configA: ProviderConfig = { type: 'claude' };
        const configB: ProviderConfig = { type: 'openai' };

        const result = await runConsensusTurn(
          configA,
          configB,
          state.seekerStationId,
          state.playerStationId,
          state.clock.gameMinutes,
          state.cooldownTracker,
          state.constraints,
          state.questionsAsked,
          state.coinBudget,
          state.seekerTurnNumber,
          (action) => {
            const current = get();
            if (action.type === 'ask_question') {
              set({
                constraints: action.constraint
                  ? [...current.constraints, action.constraint]
                  : current.constraints,
                questionsAsked: [
                  ...current.questionsAsked,
                  { question: action.questionText, answer: action.answer, category: action.category },
                ],
                debugLog: [
                  ...current.debugLog,
                  {
                    timestamp: Date.now(),
                    tool: 'ask_question',
                    args: { question_id: action.questionId },
                    result: { answer: action.answer, constraint: action.constraint },
                  },
                ],
              });
            } else if (action.type === 'travel_to' && action.success) {
              // Just log — transit queue is managed from turn result
              set({
                debugLog: [
                  ...current.debugLog,
                  {
                    timestamp: Date.now(),
                    tool: 'travel_to',
                    args: { station_id: action.stationId },
                    result: { success: true, message: action.message },
                  },
                ],
              });
            } else if (action.type === 'thinking') {
              set({
                debugLog: [
                  ...current.debugLog,
                  {
                    timestamp: Date.now(),
                    tool: 'thinking',
                    args: {},
                    result: action.text,
                  },
                ],
              });
            }
          },
          (entry) => {
            set((s) => ({ consensusLog: [...s.consensusLog, entry] }));
          },
          state.visitedStations,
        );

        logger.info('gameStore', `executeSeekerTurn (consensus): completed. Seeker now at ${result.seekerStationId}, gameOver=${result.gameOver}, nextAction=${result.nextActionTime}, route=${result.travelRoute?.length ?? 0} hops`);
        const turnUpdates: Record<string, unknown> = {
          isAISeeking: false,
          coinBudget: result.coinBudget,
          cooldownTracker: result.cooldownTracker,
          seekerTurnNumber: state.seekerTurnNumber + 1,
          seekerNextActionTime: result.nextActionTime ?? 0,
        };
        // Set up travel queue from route
        if (result.travelRoute && result.travelRoute.length > 0) {
          const [first, ...rest] = result.travelRoute;
          turnUpdates.seekerTransit = {
            fromStationId: first.fromStationId,
            toStationId: first.stationId,
            departureTime: first.departureTime,
            segmentDepartureTime: first.departureTime,
            arrivalTime: first.arrivalTime,
            trainType: first.trainType,
          };
          turnUpdates.seekerTravelQueue = rest;
        } else {
          turnUpdates.seekerStationId = result.seekerStationId;
        }
        set(turnUpdates as Partial<GameStore>);

        if (result.gameOver && result.gameResult) {
          logger.info('gameStore', `Game over: ${result.gameResult}`);
          set({ gameResult: result.gameResult, phase: 'round_end' });
        }
      } else {
        // Single seeker mode
        const result = await runSeekerTurn(
          { type: 'claude' },
          state.seekerStationId,
          state.playerStationId,
          state.clock.gameMinutes,
          state.cooldownTracker,
          state.constraints,
          state.questionsAsked,
          (action) => {
            // Update store with each action for live UI updates
            const current = get();
            if (action.type === 'ask_question') {
              set({
                constraints: action.constraint
                  ? [...current.constraints, action.constraint]
                  : current.constraints,
                questionsAsked: [
                  ...current.questionsAsked,
                  { question: action.questionText, answer: action.answer, category: action.category },
                ],
                debugLog: [
                  ...current.debugLog,
                  {
                    timestamp: Date.now(),
                    tool: 'ask_question',
                    args: { question_id: action.questionId },
                    result: { answer: action.answer, constraint: action.constraint },
                  },
                ],
              });
            } else if (action.type === 'travel_to' && action.success) {
              // Just log — transit queue is managed from turn result
              set({
                debugLog: [
                  ...current.debugLog,
                  {
                    timestamp: Date.now(),
                    tool: 'travel_to',
                    args: { station_id: action.stationId },
                    result: { success: true, message: action.message },
                  },
                ],
              });
            } else if (action.type === 'thinking') {
              set({
                debugLog: [
                  ...current.debugLog,
                  {
                    timestamp: Date.now(),
                    tool: 'thinking',
                    args: {},
                    result: action.text,
                  },
                ],
              });
            }
          },
          state.coinBudget,
          state.visitedStations,
        );

        // Apply final results
        logger.info('gameStore', `executeSeekerTurn: completed. Seeker now at ${result.seekerStationId}, gameOver=${result.gameOver}, result=${result.gameResult}, nextAction=${result.nextActionTime}, route=${result.travelRoute?.length ?? 0} hops`);
        const singleUpdates: Record<string, unknown> = {
          isAISeeking: false,
          coinBudget: result.coinBudget ?? state.coinBudget,
          cooldownTracker: result.cooldownTracker ?? state.cooldownTracker,
          seekerTurnNumber: state.seekerTurnNumber + 1,
          seekerNextActionTime: result.nextActionTime ?? 0,
        };
        // Set up travel queue from route
        if (result.travelRoute && result.travelRoute.length > 0) {
          const [first, ...rest] = result.travelRoute;
          singleUpdates.seekerTransit = {
            fromStationId: first.fromStationId,
            toStationId: first.stationId,
            departureTime: first.departureTime,
            segmentDepartureTime: first.departureTime,
            arrivalTime: first.arrivalTime,
            trainType: first.trainType,
          };
          singleUpdates.seekerTravelQueue = rest;
        } else {
          singleUpdates.seekerStationId = result.seekerStationId;
        }
        set(singleUpdates as Partial<GameStore>);

        if (result.gameOver && result.gameResult) {
          logger.info('gameStore', `Game over: ${result.gameResult}`);
          set({ gameResult: result.gameResult, phase: 'round_end' });
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('gameStore', `executeSeekerTurn failed: ${errMsg}`, error);
      set({ isAISeeking: false });
      const current = get();
      set({
        debugLog: [
          ...current.debugLog,
          {
            timestamp: Date.now(),
            tool: 'error',
            args: {},
            result: errMsg,
          },
        ],
      });
    }
  },

  seekerAskQuestion: (questionId: string) => {
    const state = get();
    if (state.phase !== 'seeking' || state.playerRole !== 'seeker') return;
    if (!state.cooldownTracker || !state.playerStationId || !state.hidingZone) return;

    const question = getQuestionById(questionId);
    if (!question) return;

    // Check if already asked
    const alreadyAsked = state.questionsAsked.some(
      (q) => QUESTION_POOL.find((p) => p.text === q.question)?.id === questionId
    );
    if (alreadyAsked) return;

    // Check cooldown
    if (!canAskCategory(state.cooldownTracker, question.category, state.clock.gameMinutes)) return;

    // Check coin budget
    if (state.coinBudget && !canAfford(state.coinBudget, question.category)) return;

    // Compute seeker position (use actual transit position if on a train)
    const seekerPos = getSeekerPos(state);

    // Evaluate
    const result = evaluateQuestion(question, state.hidingZone.stationId, seekerPos);
    const newCooldown = recordQuestion(state.cooldownTracker, question.category, state.clock.gameMinutes);

    // Deduct coins
    const newCoins = state.coinBudget ? spendCoins(state.coinBudget, question.category) : null;

    set({
      constraints: result.constraint
        ? [...state.constraints, result.constraint]
        : state.constraints,
      questionsAsked: [
        ...state.questionsAsked,
        { question: question.text, answer: result.answer, category: question.category },
      ],
      cooldownTracker: newCooldown,
      coinBudget: newCoins ?? state.coinBudget,
    });

    logger.info('gameStore', `Seeker asked: "${question.text}" → "${result.answer}"`);
  },

  seekerTravelTo: (stationId: string) => {
    const state = get();
    if (state.phase !== 'seeking' || state.playerRole !== 'seeker') return;
    if (!state.playerStationId) return;
    // Block if already on the train (past departure), but allow changing while waiting
    if (state.playerTransit && state.clock.gameMinutes >= state.playerTransit.departureTime) return;

    const neighbors = getNeighbors(state.playerStationId);
    if (!neighbors.includes(stationId)) return;

    // Find a route departure that goes through the neighbor station
    const departures = getUpcomingDepartures(state.playerStationId, state.clock.gameMinutes, 20);
    const dep = departures.find(d => d.remainingStops.some(s => s.stationId === stationId));
    let usedRoute = false;

    if (dep) {
      const stopInfo = dep.remainingStops.find(s => s.stationId === stationId)!;
      const route = dep.route;
      const dir = dep.direction;
      const routeStations = dir === 'forward' ? route.stations : [...route.stations].reverse();
      const fromIdx = routeStations.indexOf(state.playerStationId);
      const toIdx = routeStations.indexOf(stationId);
      const travelStations = routeStations.slice(fromIdx, toIdx + 1);

      set({
        playerTransit: {
          fromStationId: state.playerStationId,
          toStationId: stationId,
          departureTime: dep.departureTime,
          segmentDepartureTime: dep.departureTime,
          arrivalTime: stopInfo.arrivalMin,
          trainType: route.trainType,
          routeId: route.id,
          routeStations: travelStations,
          destinationStationId: stationId,
          nextArrivalTime: stopInfo.arrivalMin,
        },
      });
      usedRoute = true;
    } else {
      // Fallback: legacy travel info
      const travelInfo = getTravelInfo(state.playerStationId, stationId, state.clock.gameMinutes);
      if (travelInfo) {
        set({
          playerTransit: {
            fromStationId: state.playerStationId,
            toStationId: stationId,
            departureTime: travelInfo.departureTime,
            segmentDepartureTime: travelInfo.departureTime,
            arrivalTime: travelInfo.arrivalTime,
            trainType: travelInfo.trainType,
          },
        });
        usedRoute = true;
      } else {
        // Fallback: instant travel
        const newVisited = new Set(state.visitedStations);
        newVisited.add(stationId);
        set({ playerStationId: stationId, visitedStations: newVisited });
      }
    }

    logger.info('gameStore', `Seeker traveled to ${stationId}`);

    // Win condition check is done in tick() when transit completes,
    // or immediately if instant
    if (!usedRoute) {
      const updated = get();
      if (updated.hidingZone && updated.playerStationId === updated.hidingZone.stationId) {
        logger.info('gameStore', `Seeker wins! Found hider at ${stationId}`);
        set({ gameResult: 'seeker_wins', phase: 'round_end' });
      }
    }
  },

  travelViaRoute: (routeId: string, destinationStationId: string, departureTime: number) => {
    const { phase, playerStationId, hidingZone, playerTransit, clock, playerRole } = get();

    // Allow in hiding (hider) or seeking (seeker) phases
    const hiderCanTravel = playerRole === 'hider' && phase === 'hiding' && !hidingZone;
    const seekerCanTravel = playerRole === 'seeker' && phase === 'seeking';
    if (!hiderCanTravel && !seekerCanTravel) return;
    if (!playerStationId) return;

    // If already on the train, queue this route for when we arrive
    if (playerTransit && clock.gameMinutes >= playerTransit.departureTime) {
      set({ queuedRoute: { routeId, destinationStationId, departureTime } });
      logger.info('gameStore', `Queued route ${routeId} toward ${destinationStationId} (departs ${departureTime})`);
      return;
    }

    // Find the route
    const routes = getRoutes();
    const route = routes.find(r => r.id === routeId);
    if (!route) return;

    // Determine direction: is the current station in forward or reverse stop list before the destination?
    let stopTimes = route.stopTimes;
    let routeStations = route.stations;
    const fwdFromIdx = route.stations.indexOf(playerStationId);
    const fwdToIdx = route.stations.indexOf(destinationStationId);
    const revStations = [...route.stations].reverse();
    const revFromIdx = revStations.indexOf(playerStationId);
    const revToIdx = revStations.indexOf(destinationStationId);

    if (fwdFromIdx >= 0 && fwdToIdx >= 0 && fwdToIdx > fwdFromIdx) {
      stopTimes = route.stopTimes;
      routeStations = route.stations;
    } else if (revFromIdx >= 0 && revToIdx >= 0 && revToIdx > revFromIdx) {
      stopTimes = route.reverseStopTimes;
      routeStations = revStations;
    } else {
      return; // Can't find valid path on this route
    }

    // Get the ordered stations from current to destination
    const fromIdx = routeStations.indexOf(playerStationId);
    const toIdx = routeStations.indexOf(destinationStationId);
    const travelStations = routeStations.slice(fromIdx, toIdx + 1);

    // Get stop time info
    const fromStop = stopTimes.find(s => s.stationId === playerStationId);
    const toStop = stopTimes.find(s => s.stationId === destinationStationId);
    const nextStop = stopTimes.find(s => s.stationId === travelStations[1]);
    if (!fromStop || !toStop || !nextStop) return;

    // Compute the origin departure for this specific service
    // departureTime = originDep + fromStop.departureMin
    // => originDep = departureTime - fromStop.departureMin
    const originDep = departureTime - fromStop.departureMin;
    const finalArrival = originDep + toStop.arrivalMin;
    const nextArrival = originDep + nextStop.arrivalMin;

    // Hider can't board a train that arrives after the hiding time limit
    const HIDING_TIME_LIMIT = 240;
    if (phase === 'hiding' && finalArrival > HIDING_TIME_LIMIT) return;

    // Check if first segment is blocked by an accident
    const boardBlockedSegments = getBlockedSegments(get().accidents, clock.gameMinutes);
    if (isSegmentBlocked(boardBlockedSegments, playerStationId, travelStations[1])) {
      logger.info('gameStore', `Cannot board route ${routeId}: segment ${playerStationId}→${travelStations[1]} blocked by accident`);
      return;
    }

    set({
      playerTransit: {
        fromStationId: playerStationId,
        toStationId: travelStations[1],
        departureTime,
        segmentDepartureTime: departureTime,
        arrivalTime: finalArrival,
        trainType: route.trainType,
        routeId,
        routeStations: travelStations,
        destinationStationId,
        nextArrivalTime: nextArrival,
      },
      queuedRoute: null,
    });

    logger.info('gameStore', `Boarded route ${routeId} toward ${destinationStationId}, departing ${departureTime}, arriving ${finalArrival}`);
  },

  getOffAtNextStation: () => {
    const { playerTransit, clock } = get();
    if (!playerTransit) return;

    // Must be on the train (past departure)
    if (clock.gameMinutes < playerTransit.departureTime) return;

    const nextStation = playerTransit.toStationId;
    const nextArrival = playerTransit.nextArrivalTime ?? playerTransit.arrivalTime;

    // Already heading to the next station as final destination
    if (nextStation === playerTransit.destinationStationId) return;

    // Truncate the route to end at the next station
    const routeStations = playerTransit.routeStations;
    let truncatedStations: string[] | undefined;
    if (routeStations) {
      const nextIdx = routeStations.indexOf(nextStation);
      truncatedStations = nextIdx >= 0 ? routeStations.slice(0, nextIdx + 1) : routeStations;
    }

    set({
      playerTransit: {
        ...playerTransit,
        destinationStationId: nextStation,
        arrivalTime: nextArrival,
        routeStations: truncatedStations,
      },
    });

    logger.info('gameStore', `Getting off at next station: ${nextStation}`);
  },

  stayOnTrain: () => {
    const { playerTransit, clock } = get();
    if (!playerTransit) return;

    // Must be on the train (past departure)
    if (clock.gameMinutes < playerTransit.departureTime) return;

    // Only useful when currently exiting (destination == next station but not the route terminus)
    if (!playerTransit.routeId) return;

    const route = getRoutes().find(r => r.id === playerTransit.routeId);
    if (!route) return;

    // Determine direction from the route
    const fwdStations = route.stations;
    const revStations = [...route.stations].reverse();
    const currentStation = playerTransit.fromStationId;
    const nextStation = playerTransit.toStationId;

    let dirStations: string[];
    let stopTimes: typeof route.stopTimes;
    const fwdFromIdx = fwdStations.indexOf(currentStation);
    const fwdNextIdx = fwdStations.indexOf(nextStation);
    const revFromIdx = revStations.indexOf(currentStation);
    const revNextIdx = revStations.indexOf(nextStation);

    if (fwdFromIdx >= 0 && fwdNextIdx > fwdFromIdx) {
      dirStations = fwdStations;
      stopTimes = route.stopTimes;
    } else if (revFromIdx >= 0 && revNextIdx > revFromIdx) {
      dirStations = revStations;
      stopTimes = route.reverseStopTimes;
    } else {
      return;
    }

    const terminus = dirStations[dirStations.length - 1];

    // Already heading to terminus — nothing to do
    if (playerTransit.destinationStationId === terminus) return;

    // Rebuild routeStations from current fromStation to terminus
    const fromIdx = dirStations.indexOf(currentStation);
    const newRouteStations = dirStations.slice(fromIdx);

    // Parse origin departure from departureTime and fromStop
    const fromStop = stopTimes.find(s => s.stationId === currentStation);
    const terminusStop = stopTimes.find(s => s.stationId === terminus);
    if (!fromStop || !terminusStop) return;

    const originDep = playerTransit.departureTime - fromStop.departureMin;
    const finalArrival = originDep + terminusStop.arrivalMin;

    set({
      playerTransit: {
        ...playerTransit,
        destinationStationId: terminus,
        arrivalTime: finalArrival,
        routeStations: newRouteStations,
      },
    });

    logger.info('gameStore', `Staying on train, continuing to terminus: ${terminus}`);
  },
}));
