import { create } from 'zustand';
import type { GamePhase, HidingZone } from '../types/game';
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
import { haversineDistance } from '../engine/geo';
import { logger } from '../engine/logger';
import { evaluateQuestion } from '../questions/evaluators';
import { getQuestionById, QUESTION_POOL } from '../questions/questionPool';
import {
  canAskCategory,
  recordQuestion,
  getCooldownRemaining,
} from '../questions/cooldown';

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

  // Seeking phase state
  seekerStationId: string | null;
  constraints: Constraint[];
  questionsAsked: QuestionEntry[];
  cooldownTracker: CooldownTracker | null;
  gameResult: 'seeker_wins' | 'hider_wins' | null;
  debugLog: DebugLogEntry[];
  apiKey: string;
  isAISeeking: boolean;

  // Actions
  startGame: (seedOrRole?: number | 'hider' | 'seeker', seed?: number) => void;
  travelTo: (stationId: string) => void;
  settleHere: () => void;
  setSpeed: (speed: number) => void;
  togglePause: () => void;
  tick: (nowMs: number) => void;
  transitionPhase: (to: GamePhase) => void;
  setApiKey: (key: string) => void;
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

  // Seeking phase state
  seekerStationId: null,
  constraints: [],
  questionsAsked: [],
  cooldownTracker: null,
  gameResult: null,
  debugLog: [],
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY ?? '',
  isAISeeking: false,

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
        cooldownTracker: createCooldownTracker(),
        constraints: [],
        questionsAsked: [],
        gameResult: null,
        debugLog: [],
        isAISeeking: false,
      });
      return;
    }

    // Hider mode (default): existing behavior
    const startStation = rng.pick(ids);
    logger.info('gameStore', `Game started. Hider at ${stations[startStation]?.name} (${startStation}), seed=${s}`);

    set({
      phase: 'hiding',
      playerRole: 'hider',
      playerStationId: startStation,
      hidingZone: null,
      clock: createGameClock(),
      seed: s,
    });
  },

  travelTo: (stationId: string) => {
    const { phase, playerStationId, hidingZone } = get();
    if (phase !== 'hiding') return;
    if (hidingZone) return; // Already settled
    if (!playerStationId) return;

    const neighbors = getNeighbors(playerStationId);
    if (!neighbors.includes(stationId)) return;

    set({ playerStationId: stationId });
  },

  settleHere: () => {
    const { phase, playerStationId, hidingZone } = get();
    if (phase !== 'hiding') return;
    if (hidingZone) return; // Already settled
    if (!playerStationId) return;

    const stations = getStations();
    const station = stations[playerStationId];
    if (!station) return;

    set({
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
    set((state) => ({ clock: tickClock(state.clock, nowMs) }));
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
        constraints: [],
        questionsAsked: [],
        cooldownTracker: null,
        gameResult: null,
        debugLog: [],
        isAISeeking: false,
      });
    } else {
      set({ phase: to });
    }
  },

  setApiKey: (key: string) => set({ apiKey: key }),

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
      cooldownTracker: createCooldownTracker(),
      constraints: [],
      questionsAsked: [],
      gameResult: null,
      debugLog: [],
      isAISeeking: false,
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
    logger.info('gameStore', `executeSeekerTurn: starting. Seeker at ${state.seekerStationId}, game time ${Math.floor(state.clock.gameMinutes)}min`);

    try {
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
      );

      // Apply final results
      logger.info('gameStore', `executeSeekerTurn: completed. Seeker now at ${result.seekerStationId}, gameOver=${result.gameOver}, result=${result.gameResult}`);
      set({
        seekerStationId: result.seekerStationId,
        isAISeeking: false,
      });

      if (result.gameOver && result.gameResult) {
        logger.info('gameStore', `Game over: ${result.gameResult}`);
        set({ gameResult: result.gameResult, phase: 'round_end' });
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

    // Evaluate
    const result = evaluateQuestion(question, state.hidingZone.stationId, state.playerStationId);
    const newCooldown = recordQuestion(state.cooldownTracker, question.category, state.clock.gameMinutes);

    set({
      constraints: result.constraint
        ? [...state.constraints, result.constraint]
        : state.constraints,
      questionsAsked: [
        ...state.questionsAsked,
        { question: question.text, answer: result.answer, category: question.category },
      ],
      cooldownTracker: newCooldown,
    });

    logger.info('gameStore', `Seeker asked: "${question.text}" → "${result.answer}"`);
  },

  seekerTravelTo: (stationId: string) => {
    const state = get();
    if (state.phase !== 'seeking' || state.playerRole !== 'seeker') return;
    if (!state.playerStationId) return;

    const neighbors = getNeighbors(state.playerStationId);
    if (!neighbors.includes(stationId)) return;

    set({ playerStationId: stationId });
    logger.info('gameStore', `Seeker traveled to ${stationId}`);

    // Check win condition
    const updated = get();
    if (updated.hidingZone && updated.playerStationId === updated.hidingZone.stationId) {
      logger.info('gameStore', `Seeker wins! Found hider at ${stationId}`);
      set({ gameResult: 'seeker_wins', phase: 'round_end' });
    }
  },
}));
