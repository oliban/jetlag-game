export interface QuizQuestion {
  id: string;
  text: string;
  options: [string, string, string, string]; // A, B, C, D
  correct: number; // 0–3 index into options
  scope: 'city' | 'country';
}

export interface QuizSession {
  stationId: string;
  questions: QuizQuestion[];
  /** Shuffled option order per question: shuffledIndices[i] maps display slot → original option index */
  shuffledIndices: number[][];
  /** Correct answer remapped to shuffled display slot index */
  shuffledCorrect: number[];
  answers: (number | null)[]; // null = unanswered; value = display-slot index chosen
  currentIndex: number;
  phase: 'in_progress' | 'completed';
  coinsEarned: number;
}

export interface QuizData {
  stations: Record<string, QuizQuestion[]>; // keyed by station ID
  countries: Record<string, QuizQuestion[]>; // keyed by country name (lowercase)
}
