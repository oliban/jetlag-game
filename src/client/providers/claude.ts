import type { AnthropicToolDefinition, ToolCall, ToolResult } from '../aiClient.ts';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

interface AnthropicResponse {
  id: string;
  content: AnthropicContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  usage: { input_tokens: number; output_tokens: number };
}

export interface ClaudeProviderOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export interface ClaudeTurnResult {
  toolCalls: ToolCall[];
  thinkingText: string;
  stopReason: string;
}

/**
 * Send a message to Claude and get back tool calls.
 * Uses direct fetch to the Anthropic API (browser-compatible).
 */
export async function sendClaudeMessage(
  options: ClaudeProviderOptions,
  systemPrompt: string,
  conversationHistory: AnthropicMessage[],
  tools: AnthropicToolDefinition[],
): Promise<ClaudeTurnResult> {
  const { apiKey, model = 'claude-sonnet-4-5-20250929', maxTokens = 1024 } = options;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: conversationHistory,
      tools,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
  }

  const data: AnthropicResponse = await response.json();

  const toolCalls: ToolCall[] = [];
  let thinkingText = '';

  for (const block of data.content) {
    if (block.type === 'text') {
      thinkingText += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        name: block.name as ToolCall['name'],
        input: block.input,
      });
    }
  }

  return {
    toolCalls,
    thinkingText,
    stopReason: data.stop_reason,
  };
}

/**
 * Build a user message containing tool results to send back to Claude.
 */
export function buildToolResultMessage(results: ToolResult[]): AnthropicMessage {
  return {
    role: 'user',
    content: results.map((r) => ({
      type: 'tool_result' as const,
      tool_use_id: r.tool_use_id,
      content: r.content,
    })),
  };
}

/**
 * Build an assistant message from Claude's response content blocks.
 */
export function buildAssistantMessage(
  toolCalls: ToolCall[],
  thinkingText: string,
): AnthropicMessage {
  const content: AnthropicContentBlock[] = [];

  if (thinkingText) {
    content.push({ type: 'text', text: thinkingText });
  }

  for (const call of toolCalls) {
    content.push({
      type: 'tool_use',
      id: call.id,
      name: call.name,
      input: call.input,
    });
  }

  return {
    role: 'assistant',
    content,
  };
}
