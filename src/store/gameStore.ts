import { create } from 'zustand';
import type { GamePhase, HidingZone, TransitState, SeekerMode } from '../types/game';
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
import { runSeekerTurn, stationMatchesConstraints } from '../engine/seekerLoop';
import { runConsensusTurn, type ConsensusLogEntry } from '../engine/consensusLoop';
import { haversineDistance } from '../engine/geo';
import { logger } from '../engine/logger';
import { evaluateQuestion } from '../questions/evaluators';
import { getQuestionById, QUESTION_POOL } from '../questions/questionPool';
import {
  canAskCategory,
  recordQuestion,
  getCooldownRemaining,
} from '../questions/cooldown';
import { createCoinBudget, canAfford, spendCoins, type CoinBudget } from '../engine/coinSystem';
import { getTravelInfo } from '../engine/trainSchedule';
import type { ProviderConfig } from '../client/providerAdapter';

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
  gameResult: 'seeker_wins' | 'hider_wins' | null;
  debugLog: DebugLogEntry[];
  apiKey: string;
  isAISeeking: boolean;

  // Coin system
  coinBudget: CoinBudget | null;

  // Dual seeker / consensus
  openaiApiKey: string;
  seekerMode: SeekerMode;
  seekerTurnNumber: number;
  consensusLog: ConsensusLogEntry[];

  // UI state
  hoveredRadarRadius: number | null;

  // Actions
  setHoveredRadarRadius: (radius: number | null) => void;
  startGame: (seedOrRole?: number | 'hider' | 'seeker', seed?: number) => void;
  travelTo: (stationId: string) => void;
  settleHere: () => void;
  setSpeed: (speed: number) => void;
  togglePause: () => void;
  tick: (nowMs: number) => void;
  transitionPhase: (to: GamePhase) => void;
  setApiKey: (key: string) => void;
  setOpenaiApiKey: (key: string) => void;
  addConstraint: (constraint: Constraint) => void;
  addQuestion: (entry: QuestionEntry) => void;
  addDebugLog: (entry: DebugLogEntry) => void;
  setSeekerStation: (stationId: string) => void;
  setGameResult: (result: 'seeker_wins' | 'hider_wins') => void;
  setIsAISeeking: (seeking: boolean) => void;
  setCooldownTracker: (tracker: CooldownTracker) => void;
  startSeeking: () => void;
  executeSeekerTurn: () => Promise<void>;
  seekerAskQuestion: (questionId: string) => void;
  seekerTravelTo: (stationId: string) => void;
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
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY ?? '',
  isAISeeking: false,

  // Coins
  coinBudget: null,

  // Dual seeker / consensus
  openaiApiKey: import.meta.env.VITE_OPENAI_API_KEY ?? '',
  seekerMode: 'single',
  seekerTurnNumber: 0,
  consensusLog: [],

  // UI state
  hoveredRadarRadius: null,

  setHoveredRadarRadius: (radius: number | null) => set({ hoveredRadarRadius: radius }),

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

      // Pick AI hider far from player
      let bestHider = rng.pick(ids);
      let bestDist = 0;
      const candidates = rng.shuffle([...ids]).slice(0, Math.min(10, ids.length));
      for (const id of candidates) {
        if (id === playerStart) continue;
        const st = stations[id];
        if (st && playerStation) {
          const d = haversineDistance(st.lat, st.lng, playerStation.lat, playerStation.lng);
          if (d > bestDist) {
            bestDist = d;
            bestHider = id;
          }
        }
      }

      const hiderStation = stations[bestHider];
      logger.info('gameStore', `Seeker mode started. Player (seeker) at ${playerStation?.name} (${playerStart}), AI hider at ${hiderStation?.name} (${bestHider}), ${Math.round(bestDist)}km apart, seed=${s}`);

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
        consensusLog: [],
      });
      return;
    }

    // Hider mode (default): existing behavior
    const state = get();
    const hasBothKeys = state.apiKey.trim() !== '' && state.openaiApiKey.trim() !== '';

    const startStation = rng.pick(ids);
    logger.info('gameStore', `Game started. Hider at ${stations[startStation]?.name} (${startStation}), seed=${s}`);

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

    // Compute travel info
    const travelInfo = getTravelInfo(playerStationId, stationId, clock.gameMinutes);
    if (travelInfo) {
      set({
        playerTransit: {
          fromStationId: playerStationId,
          toStationId: stationId,
          departureTime: travelInfo.departureTime,
          arrivalTime: travelInfo.arrivalTime,
          trainType: travelInfo.trainType,
        },
      });
    } else {
      // Fallback: instant travel if no travel info
      set({ playerStationId: stationId });
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
    const newClock = tickClock(state.clock, nowMs);

    // Check player transit completion
    let playerTransit = state.playerTransit;
    let playerStationId = state.playerStationId;
    let visitedStations = state.visitedStations;
    if (playerTransit && newClock.gameMinutes >= playerTransit.arrivalTime) {
      playerStationId = playerTransit.toStationId;
      if (state.playerRole === 'seeker' && !visitedStations.has(playerStationId)) {
        visitedStations = new Set(visitedStations);
        visitedStations.add(playerStationId);
      }
      playerTransit = null;
    }

    // Check seeker transit completion
    let seekerTransit = state.seekerTransit;
    let seekerStationId = state.seekerStationId;
    if (seekerTransit && newClock.gameMinutes >= seekerTransit.arrivalTime) {
      seekerStationId = seekerTransit.toStationId;
      seekerTransit = null;
    }

    set({
      clock: newClock,
      playerTransit,
      playerStationId,
      visitedStations,
      seekerTransit,
      seekerStationId,
    });
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
        consensusLog: [],
      });
    } else {
      set({ phase: to });
    }
  },

  setApiKey: (key: string) => {
    set({ apiKey: key });
    // Check if we should switch to consensus mode
    const state = get();
    if (key.trim() && state.openaiApiKey.trim()) {
      set({ seekerMode: 'consensus' });
    } else {
      set({ seekerMode: 'single' });
    }
  },

  setOpenaiApiKey: (key: string) => {
    set({ openaiApiKey: key });
    // Check if we should switch to consensus mode
    const state = get();
    if (key.trim() && state.apiKey.trim()) {
      set({ seekerMode: 'consensus' });
    } else {
      set({ seekerMode: 'single' });
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
      seekerStationId: bestStation,
      visitedStations: new Set<string>(),
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
      consensusLog: [],
    });
  },

  executeSeekerTurn: async () => {
    const state = get();
    if (state.phase !== 'seeking') return;
    if (!state.seekerStationId || !state.playerStationId) return;
    if (!state.apiKey) return;
    if (state.isAISeeking) return; // Already running
    if (!state.cooldownTracker) return;

    set({ isAISeeking: true });
    logger.info('gameStore', `executeSeekerTurn: starting. Seeker at ${state.seekerStationId}, game time ${Math.floor(state.clock.gameMinutes)}min, mode=${state.seekerMode}`);

    try {
      if (state.seekerMode === 'consensus' && state.openaiApiKey) {
        // Consensus mode: dual seekers
        const configA: ProviderConfig = { type: 'claude', apiKey: state.apiKey };
        const configB: ProviderConfig = { type: 'openai', apiKey: state.openaiApiKey };

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
            } else if (action.type === 'travel_to') {
              if (action.success) {
                set({
                  seekerStationId: action.stationId,
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
              }
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
        );

        logger.info('gameStore', `executeSeekerTurn (consensus): completed. Seeker now at ${result.seekerStationId}, gameOver=${result.gameOver}`);
        set({
          seekerStationId: result.seekerStationId,
          isAISeeking: false,
          coinBudget: result.coinBudget,
          cooldownTracker: result.cooldownTracker,
          seekerTurnNumber: state.seekerTurnNumber + 1,
        });

        if (result.gameOver && result.gameResult) {
          logger.info('gameStore', `Game over: ${result.gameResult}`);
          set({ gameResult: result.gameResult, phase: 'round_end' });
        }
      } else {
        // Single seeker mode
        const result = await runSeekerTurn(
          state.apiKey,
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
            } else if (action.type === 'travel_to') {
              if (action.success) {
                set({
                  seekerStationId: action.stationId,
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
              }
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
        );

        // Apply final results
        logger.info('gameStore', `executeSeekerTurn: completed. Seeker now at ${result.seekerStationId}, gameOver=${result.gameOver}, result=${result.gameResult}`);
        set({
          seekerStationId: result.seekerStationId,
          isAISeeking: false,
          coinBudget: result.coinBudget ?? state.coinBudget,
          cooldownTracker: result.cooldownTracker ?? state.cooldownTracker,
          seekerTurnNumber: state.seekerTurnNumber + 1,
        });

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

    // Compute seeker position (interpolated if in transit)
    const allStations = getStations();
    let seekerPos: string | { lat: number; lng: number; country?: string } = state.playerStationId;
    if (state.playerTransit) {
      const fromSt = allStations[state.playerTransit.fromStationId];
      const toSt = allStations[state.playerTransit.toStationId];
      if (fromSt && toSt) {
        const totalDuration = state.playerTransit.arrivalTime - state.playerTransit.departureTime;
        const elapsed = state.clock.gameMinutes - state.playerTransit.departureTime;
        const t = totalDuration > 0 ? Math.max(0, Math.min(1, elapsed / totalDuration)) : 0;
        seekerPos = {
          lat: fromSt.lat + (toSt.lat - fromSt.lat) * t,
          lng: fromSt.lng + (toSt.lng - fromSt.lng) * t,
          country: t < 0.5 ? fromSt.country : toSt.country,
        };
      }
    }

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

    // Compute travel info
    const travelInfo = getTravelInfo(state.playerStationId, stationId, state.clock.gameMinutes);
    if (travelInfo) {
      set({
        playerTransit: {
          fromStationId: state.playerStationId,
          toStationId: stationId,
          departureTime: travelInfo.departureTime,
          arrivalTime: travelInfo.arrivalTime,
          trainType: travelInfo.trainType,
        },
      });
    } else {
      // Fallback: instant travel
      const newVisited = new Set(state.visitedStations);
      newVisited.add(stationId);
      set({ playerStationId: stationId, visitedStations: newVisited });
    }

    logger.info('gameStore', `Seeker traveled to ${stationId}`);

    // Win condition check is done in tick() when transit completes,
    // or immediately if instant
    if (!travelInfo) {
      const updated = get();
      if (updated.hidingZone && updated.playerStationId === updated.hidingZone.stationId) {
        logger.info('gameStore', `Seeker wins! Found hider at ${stationId}`);
        set({ gameResult: 'seeker_wins', phase: 'round_end' });
      }
    }
  },
}));
