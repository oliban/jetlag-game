import { describe, it, expect } from 'vitest';
import {
  convertToolsToOpenAI,
  convertHistoryToOpenAI,
  parseOpenAIToolCalls,
} from '../../src/client/providers/openai';
import type { AnthropicToolDefinition } from '../../src/client/aiClient';

describe('OpenAI provider format conversion', () => {
  describe('convertToolsToOpenAI', () => {
    it('converts Anthropic tool definitions to OpenAI format', () => {
      const tools: AnthropicToolDefinition[] = [
        {
          name: 'ask_question',
          description: 'Ask a question',
          input_schema: {
            type: 'object',
            properties: { question_id: { type: 'string' } },
            required: ['question_id'],
          },
        },
      ];

      const result = convertToolsToOpenAI(tools);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('function');
      expect(result[0].function.name).toBe('ask_question');
      expect(result[0].function.description).toBe('Ask a question');
      expect(result[0].function.parameters.properties).toEqual({ question_id: { type: 'string' } });
      expect(result[0].function.parameters.required).toEqual(['question_id']);
    });

    it('handles tools with no required fields', () => {
      const tools: AnthropicToolDefinition[] = [
        {
          name: 'get_my_state',
          description: 'Get state',
          input_schema: { type: 'object', properties: {} },
        },
      ];

      const result = convertToolsToOpenAI(tools);
      expect(result[0].function.parameters.required).toBeUndefined();
    });
  });

  describe('convertHistoryToOpenAI', () => {
    it('converts simple text messages', () => {
      const history = [
        { role: 'user' as const, content: 'Hello' },
      ];

      const result = convertHistoryToOpenAI(history);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
      expect(result[0].content).toBe('Hello');
    });

    it('converts tool result messages to OpenAI tool messages', () => {
      const history = [
        {
          role: 'user' as const,
          content: [
            { type: 'tool_result', tool_use_id: 'call_1', content: '{"answer":"Yes"}' },
          ],
        },
      ];

      const result = convertHistoryToOpenAI(history);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('tool');
      expect(result[0].tool_call_id).toBe('call_1');
      expect(result[0].content).toBe('{"answer":"Yes"}');
    });

    it('converts assistant messages with tool calls', () => {
      const history = [
        {
          role: 'assistant' as const,
          content: [
            { type: 'text', text: 'Let me check...' },
            { type: 'tool_use', id: 'call_1', name: 'get_my_state', input: {} },
          ],
        },
      ];

      const result = convertHistoryToOpenAI(history);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('assistant');
      expect(result[0].content).toBe('Let me check...');
      expect(result[0].tool_calls).toHaveLength(1);
      expect(result[0].tool_calls![0].id).toBe('call_1');
      expect(result[0].tool_calls![0].function.name).toBe('get_my_state');
    });
  });

  describe('parseOpenAIToolCalls', () => {
    it('parses OpenAI tool calls to normalized format', () => {
      const toolCalls = [
        {
          id: 'call_abc',
          type: 'function' as const,
          function: {
            name: 'travel_to',
            arguments: '{"station_id":"paris-gare-du-nord"}',
          },
        },
      ];

      const result = parseOpenAIToolCalls(toolCalls);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('call_abc');
      expect(result[0].name).toBe('travel_to');
      expect(result[0].input).toEqual({ station_id: 'paris-gare-du-nord' });
    });

    it('returns empty array for undefined', () => {
      expect(parseOpenAIToolCalls(undefined)).toEqual([]);
    });

    it('handles multiple tool calls', () => {
      const toolCalls = [
        {
          id: 'call_1',
          type: 'function' as const,
          function: { name: 'get_my_state', arguments: '{}' },
        },
        {
          id: 'call_2',
          type: 'function' as const,
          function: { name: 'get_available_questions', arguments: '{}' },
        },
      ];

      const result = parseOpenAIToolCalls(toolCalls);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('get_my_state');
      expect(result[1].name).toBe('get_available_questions');
    });
  });
});
