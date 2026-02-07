import { describe, it, expect } from 'vitest';
import {
  getToolDefinitions,
  type AnthropicToolDefinition,
} from '../../src/client/aiClient';
import { buildSeekerSystemPrompt } from '../../src/client/systemPrompts';
import {
  buildToolResultMessage,
  buildAssistantMessage,
} from '../../src/client/providers/claude';
import { filterStateForRole, type FullGameState } from '../../src/mcp/stateFilter';

describe('AI Client - Tool Definitions', () => {
  const tools = getToolDefinitions();

  it('returns all four tool definitions', () => {
    expect(tools).toHaveLength(4);
    const names = tools.map((t) => t.name);
    expect(names).toContain('ask_question');
    expect(names).toContain('travel_to');
    expect(names).toContain('get_my_state');
    expect(names).toContain('get_available_questions');
  });

  it('each tool has a name, description, and input_schema', () => {
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.input_schema).toBeDefined();
      expect(tool.input_schema.type).toBe('object');
    }
  });

  it('ask_question requires question_id', () => {
    const askQ = tools.find((t) => t.name === 'ask_question')!;
    expect(askQ.input_schema.required).toContain('question_id');
    expect(askQ.input_schema.properties).toHaveProperty('question_id');
  });

  it('travel_to requires station_id', () => {
    const travel = tools.find((t) => t.name === 'travel_to')!;
    expect(travel.input_schema.required).toContain('station_id');
    expect(travel.input_schema.properties).toHaveProperty('station_id');
  });

  it('get_my_state has no required params', () => {
    const getState = tools.find((t) => t.name === 'get_my_state')!;
    expect(getState.input_schema.required).toBeUndefined();
  });

  it('get_available_questions has no required params', () => {
    const getQ = tools.find((t) => t.name === 'get_available_questions')!;
    expect(getQ.input_schema.required).toBeUndefined();
  });

  it('tools match Anthropic tool format', () => {
    for (const tool of tools) {
      // Validate the shape matches Anthropic's expected format
      const t: AnthropicToolDefinition = tool;
      expect(typeof t.name).toBe('string');
      expect(typeof t.description).toBe('string');
      expect(t.input_schema.type).toBe('object');
      expect(typeof t.input_schema.properties).toBe('object');
    }
  });
});

describe('AI Client - System Prompt', () => {
  it('system prompt contains key game concepts', () => {
    const prompt = buildSeekerSystemPrompt();
    expect(prompt).toContain('Seeker');
    expect(prompt).toContain('hiding zone');
    expect(prompt).toContain('get_my_state');
    expect(prompt).toContain('ask_question');
    expect(prompt).toContain('travel_to');
    expect(prompt).toContain('get_available_questions');
    expect(prompt).toContain('cooldown');
    expect(prompt).toContain('radar');
    expect(prompt).toContain('relative');
    expect(prompt).toContain('Precision');
  });
});

describe('AI Client - Claude Provider Helpers', () => {
  it('buildToolResultMessage creates correct format', () => {
    const msg = buildToolResultMessage([
      { tool_use_id: 'call-1', content: '{"answer":"Yes"}' },
      { tool_use_id: 'call-2', content: '{"success":true}' },
    ]);
    expect(msg.role).toBe('user');
    expect(Array.isArray(msg.content)).toBe(true);
    const blocks = msg.content as Array<{ type: string; tool_use_id: string; content: string }>;
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('tool_result');
    expect(blocks[0].tool_use_id).toBe('call-1');
    expect(blocks[1].tool_use_id).toBe('call-2');
  });

  it('buildAssistantMessage includes text and tool_use blocks', () => {
    const msg = buildAssistantMessage(
      [{ id: 'call-1', name: 'get_my_state', input: {} }],
      'Let me check my state.',
    );
    expect(msg.role).toBe('assistant');
    const blocks = msg.content as Array<{ type: string }>;
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('text');
    expect(blocks[1].type).toBe('tool_use');
  });

  it('buildAssistantMessage handles empty thinking text', () => {
    const msg = buildAssistantMessage(
      [{ id: 'call-1', name: 'travel_to', input: { station_id: 'paris-nord' } }],
      '',
    );
    const blocks = msg.content as Array<{ type: string }>;
    // Should only have the tool_use block, no empty text block
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('tool_use');
  });
});

describe('AI Client - State Filtering for Seeker', () => {
  const fullState: FullGameState = {
    phase: 'seeking',
    hiderStationId: 'paris-nord',
    hiderStationName: 'Paris Gare du Nord',
    seekerStationId: 'berlin-hbf',
    seekerStationName: 'Berlin Hauptbahnhof',
    gameMinutes: 60,
    constraints: [
      {
        type: 'circle',
        centerLat: 52.52,
        centerLng: 13.37,
        radiusKm: 500,
        inside: false,
        label: 'Beyond 500km',
      },
    ],
    questionsAsked: [
      { question: 'Is the hider within 500km of you?', answer: 'No' },
    ],
    availableSeekerConnections: ['hamburg-hbf', 'dresden-hbf'],
    hidingZoneActive: true,
  };

  it('seeker view does not contain hider position', () => {
    const seekerView = filterStateForRole(fullState, 'seeker');
    expect((seekerView as Record<string, unknown>).hiderStationId).toBeUndefined();
    expect((seekerView as Record<string, unknown>).hiderStationName).toBeUndefined();
  });

  it('seeker view contains seeker station and connections', () => {
    const seekerView = filterStateForRole(fullState, 'seeker');
    expect('seekerStationId' in seekerView).toBe(true);
    if ('seekerStationId' in seekerView) {
      expect(seekerView.seekerStationId).toBe('berlin-hbf');
    }
    if ('availableConnections' in seekerView) {
      expect(seekerView.availableConnections).toEqual(['hamburg-hbf', 'dresden-hbf']);
    }
  });

  it('seeker view contains constraints and questions asked', () => {
    const seekerView = filterStateForRole(fullState, 'seeker');
    if ('constraints' in seekerView) {
      expect(seekerView.constraints).toHaveLength(1);
      expect(seekerView.constraints[0].type).toBe('circle');
    }
    if ('questionsAsked' in seekerView) {
      expect(seekerView.questionsAsked).toHaveLength(1);
    }
  });
});
