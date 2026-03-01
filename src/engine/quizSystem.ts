import type { QuizQuestion, QuizSession } from '../types/quiz';
import { getStations } from '../data/graph';

export const QUIZ_COST = 1;
export const QUIZ_QUESTION_COUNT = 10;
export const QUIZ_COOLDOWN_MINUTES = 240; // 4 game-hours

// Lazy-loaded quiz data to avoid huge import in initial bundle
let quizDataCache: { stations: Record<string, QuizQuestion[]>; countries: Record<string, QuizQuestion[]> } | null = null;

async function getQuizData() {
  if (!quizDataCache) {
    const data = await import('../data/quizQuestions.json');
    quizDataCache = data.default as unknown as { stations: Record<string, QuizQuestion[]>; countries: Record<string, QuizQuestion[]> };
  }
  return quizDataCache;
}

export function getStationCountry(stationId: string): string {
  const stations = getStations();
  return stations[stationId]?.country?.toLowerCase() ?? '';
}

export async function getQuizPool(stationId: string): Promise<QuizQuestion[]> {
  const data = await getQuizData();
  const cityQs = data.stations[stationId] ?? [];
  const country = getStationCountry(stationId);
  const countryQs = data.countries[country] ?? [];
  return [...cityQs, ...countryQs];
}

/** Fisher-Yates shuffle using Math.random */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickQuestions(pool: QuizQuestion[], count: number): QuizQuestion[] {
  return shuffle(pool).slice(0, count);
}

/** Build per-question shuffled option display order */
export function buildShuffledIndices(questions: QuizQuestion[]): { shuffledIndices: number[][]; shuffledCorrect: number[] } {
  const shuffledIndices: number[][] = [];
  const shuffledCorrect: number[] = [];

  for (const q of questions) {
    // Shuffle [0,1,2,3] to get display order
    const order = shuffle([0, 1, 2, 3]);
    shuffledIndices.push(order);
    // The correct answer's new display slot is where order contains q.correct
    shuffledCorrect.push(order.indexOf(q.correct));
  }
  return { shuffledIndices, shuffledCorrect };
}

export function calculateCoinsEarned(correct: number, total: number): number {
  if (total <= 5) {
    // 5-question rewards (Option A: proportional thresholds, lower ceiling)
    if (correct >= 5) return 3;
    if (correct >= 4) return 2;
    if (correct >= 3) return 1;
    return 0;
  }
  // 10-question rewards
  if (correct >= 10) return 5;
  if (correct >= 9) return 3;
  if (correct >= 8) return 2;
  if (correct >= 7) return 1;
  return 0;
}

export function canTakeQuiz(
  quizCooldown: number | null,
  gameMinutes: number,
): boolean {
  if (quizCooldown === null) return true;
  return gameMinutes >= quizCooldown;
}

export function getCooldownExpiry(gameMinutes: number): number {
  return gameMinutes + QUIZ_COOLDOWN_MINUTES;
}

export function formatCooldownRemaining(cooldownExpiry: number, gameMinutes: number): string {
  const remaining = Math.max(0, Math.ceil(cooldownExpiry - gameMinutes));
  const hours = Math.floor(remaining / 60);
  const mins = remaining % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export async function createQuizSession(stationId: string, count = QUIZ_QUESTION_COUNT): Promise<QuizSession> {
  const pool = await getQuizPool(stationId);
  const questions = pickQuestions(pool, count);
  const { shuffledIndices, shuffledCorrect } = buildShuffledIndices(questions);
  return {
    stationId,
    questions,
    shuffledIndices,
    shuffledCorrect,
    answers: Array(questions.length).fill(null),
    currentIndex: 0,
    phase: 'in_progress',
    coinsEarned: 0,
  };
}
