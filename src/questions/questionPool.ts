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
];

export function getQuestionById(id: string): Question | undefined {
  return QUESTION_POOL.find((q) => q.id === id);
}

export function getQuestionsByCategory(category: QuestionCategory): Question[] {
  return QUESTION_POOL.filter((q) => q.category === category);
}
