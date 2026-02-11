export type QuestionCategory = 'radar' | 'relative' | 'precision';

export interface Question {
  id: string;
  category: QuestionCategory;
  text: string;
  /** Parameter for evaluation (e.g., radius in km for radar) */
  param?: number;
}

export const QUESTION_POOL: Question[] = [
  // Radar questions — "Is the hider within X km of you?"
  { id: 'radar-100', category: 'radar', text: 'Is the hider within 100km of you?', param: 100 },
  { id: 'radar-200', category: 'radar', text: 'Is the hider within 200km of you?', param: 200 },
  { id: 'radar-500', category: 'radar', text: 'Is the hider within 500km of you?', param: 500 },

  // Relative questions — directional yes/no
  { id: 'rel-north', category: 'relative', text: 'Is the hider north of you?' },
  { id: 'rel-east', category: 'relative', text: 'Is the hider east of you?' },

  // Precision questions — attribute-based yes/no
  { id: 'prec-same-country', category: 'precision', text: 'Is the hider in the same country as you?' },
  { id: 'prec-hub', category: 'precision', text: 'Does the hider\'s station have 4 or more direct connections?' },
  { id: 'prec-name-am', category: 'precision', text: 'Does the hider\'s station name start with a letter A–M?' },

  // Geographic precision
  { id: 'prec-coastal', category: 'precision', text: 'Is the hider within 50km of the coast?' },
  { id: 'prec-mountain', category: 'precision', text: 'Is the hider in a mountainous region?' },
  { id: 'prec-capital', category: 'precision', text: 'Is the hider in a capital city?' },
  { id: 'prec-landlocked', category: 'precision', text: 'Is the hider in a landlocked country?' },
  { id: 'prec-country-area', category: 'precision', text: 'Is the hider in a country larger than 200,000 km²?' },

  // Cultural & historical precision
  { id: 'prec-olympic', category: 'precision', text: "Has the hider's city hosted the Olympics?" },
  { id: 'prec-beer-wine', category: 'precision', text: 'Is the hider in a beer country or a wine country?' },
  { id: 'prec-ancient', category: 'precision', text: 'Is the hider in a city older than 2000 years?' },
  { id: 'prec-f1', category: 'precision', text: "Does the hider's country have a Formula 1 circuit?" },
  { id: 'prec-metro', category: 'precision', text: "Does the hider's city have a metro system?" },

  // Thermometer questions — hotter/colder comparison (hider vs seeker distance)
  { id: 'thermo-coast', category: 'precision', text: 'Is the hider nearer to a coastline than you?' },
  { id: 'thermo-capital', category: 'precision', text: 'Is the hider nearer to a capital city than you?' },
  { id: 'thermo-mountain', category: 'precision', text: 'Is the hider nearer to a mountainous region than you?' },
];

export function getQuestionById(id: string): Question | undefined {
  return QUESTION_POOL.find((q) => q.id === id);
}

export function getQuestionsByCategory(category: QuestionCategory): Question[] {
  return QUESTION_POOL.filter((q) => q.category === category);
}
