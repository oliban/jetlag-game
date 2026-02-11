import type { Constraint } from '../engine/constraints.ts';
import type { SeekerViewState } from '../mcp/stateFilter.ts';
import type { QuestionCategory } from '../questions/questionPool.ts';

// --- Tool parameter types ---

export interface AskQuestionParams {
  question_id: string;
}

export interface TravelToParams {
  station_id: string;
}

// get_my_state and get_available_questions have no parameters

// --- Tool result types ---

export interface AskQuestionResult {
  answer: string;
  constraint: Constraint | null;
}

export interface TravelToResult {
  success: boolean;
  message: string;
}

export interface AvailableQuestion {
  id: string;
  text: string;
  category: QuestionCategory;
  available: boolean;
  cooldown_remaining: number;
}

export interface GetAvailableQuestionsResult {
  questions: AvailableQuestion[];
}

// --- Tool call types ---

export type ToolName = 'ask_question' | 'travel_to' | 'get_my_state' | 'get_available_questions';

export interface ToolCall {
  id: string;
  name: ToolName;
  input: Record<string, unknown>;
}

export interface ToolResult {
  tool_use_id: string;
  content: string;
}

// --- Action types for the UI callback ---

export type SeekerAction =
  | { type: 'ask_question'; questionId: string; questionText: string; category: string; answer: string; constraint: Constraint | null }
  | { type: 'travel_to'; stationId: string; success: boolean; message: string; travelInfo?: { fromStationId: string; toStationId: string; departureTime: number; arrivalTime: number; trainType: string } }
  | { type: 'get_my_state'; state: SeekerViewState }
  | { type: 'get_available_questions'; questions: AvailableQuestion[] }
  | { type: 'thinking'; text: string }
  | { type: 'proposal'; seekerId: string; actionType: string; target: string; reasoning: string }
  | { type: 'consensus_reached'; method: string; actionType: string; target: string }
  | { type: 'discussion'; seekerId: string; revised: boolean };

// --- Turn result ---

export interface TravelRouteEntry {
  stationId: string;
  fromStationId: string;
  departureTime: number;
  arrivalTime: number;
  trainType: string;
}

export interface SeekerTurnResult {
  seekerStationId: string;
  newConstraints: Constraint[];
  newQuestions: Array<{ question: string; answer: string }>;
  gameOver: boolean;
  gameResult: 'seeker_wins' | 'hider_wins' | null;
  travelRoute?: TravelRouteEntry[];
  nextActionTime?: number;
}

// --- Anthropic API tool definition format ---

export interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export function getToolDefinitions(): AnthropicToolDefinition[] {
  return [
    {
      name: 'ask_question',
      description:
        'Ask a question about the hider\'s location. Each question category (radar, relative, precision) has a 30 game-minute cooldown. Use get_available_questions first to see what is available.',
      input_schema: {
        type: 'object',
        properties: {
          question_id: {
            type: 'string',
            description:
              'The ID of the question to ask. Options: radar-100, radar-200, radar-500 (is hider within X km? Answer: Yes/No), rel-north, rel-east (directional, Yes/No), prec-same-country (same country? Yes/No), prec-hub (4+ connections? Yes/No), prec-name-am (name A–M? Yes/No), prec-coastal (within 50km of coast? Yes/No), prec-mountain (mountainous region? Yes/No), prec-capital (capital city? Yes/No), prec-landlocked (landlocked country? Yes/No), prec-country-area (country >200k km²? Yes/No), prec-olympic (hosted Olympics? Yes/No), prec-beer-wine (beer or wine country? Answer: "Beer" or "Wine"), prec-ancient (city >2000 years old? Yes/No), prec-f1 (country has F1 circuit? Yes/No), prec-metro (city has metro? Yes/No), thermo-coast (hider nearer to coastline than you? Yes/No), thermo-capital (hider nearer to a capital than you? Yes/No), thermo-mountain (hider nearer to mountains than you? Yes/No).',
          },
        },
        required: ['question_id'],
      },
    },
    {
      name: 'travel_to',
      description:
        'Travel to an adjacent station. You can only move to stations directly connected to your current station. Use get_my_state to see available connections.',
      input_schema: {
        type: 'object',
        properties: {
          station_id: {
            type: 'string',
            description: 'The ID of the station to travel to. Must be directly connected to your current station.',
          },
        },
        required: ['station_id'],
      },
    },
    {
      name: 'get_my_state',
      description:
        'Get your current state: your station, available connections, game time, constraints, question history, and CANDIDATE STATIONS (the only stations where the hider could be based on all constraints). Always use candidateStations to guide your travel decisions.',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'get_available_questions',
      description:
        'Get the list of all questions you can ask, with their cooldown status. Questions on cooldown cannot be asked until the cooldown expires.',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },
  ];
}
