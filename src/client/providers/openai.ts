import type { AnthropicToolDefinition, ToolCall } from '../aiClient.ts';

export interface OpenAIProviderOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export interface OpenAITurnResult {
  toolCalls: ToolCall[];
  thinkingText: string;
  stopReason: string;
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAIToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

interface OpenAIResponse {
  id: string;
  choices: Array<{
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: 'stop' | 'tool_calls' | 'length';
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/** Convert Anthropic tool definitions to OpenAI format */
export function convertToolsToOpenAI(tools: AnthropicToolDefinition[]): OpenAIToolDef[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: t.input_schema.properties,
        required: t.input_schema.required,
      },
    },
  }));
}

/** Convert Anthropic-style conversation history to OpenAI format */
export function convertHistoryToOpenAI(
  history: Array<{
    role: 'user' | 'assistant';
    content: string | Array<{ type: string; [key: string]: unknown }>;
  }>,
): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [];

  for (const msg of history) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        messages.push({ role: 'user', content: msg.content });
      } else {
        // Tool results from Anthropic format → OpenAI tool messages
        const blocks = msg.content as Array<{ type: string; [key: string]: unknown }>;
        for (const block of blocks) {
          if (block.type === 'tool_result') {
            messages.push({
              role: 'tool',
              tool_call_id: block.tool_use_id as string,
              content: block.content as string,
            });
          }
        }
      }
    } else if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        messages.push({ role: 'assistant', content: msg.content });
      } else {
        // Convert assistant content blocks to OpenAI format
        const blocks = msg.content as Array<{ type: string; [key: string]: unknown }>;
        const textParts: string[] = [];
        const toolCalls: OpenAIToolCall[] = [];

        for (const block of blocks) {
          if (block.type === 'text') {
            textParts.push(block.text as string);
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id as string,
              type: 'function',
              function: {
                name: block.name as string,
                arguments: JSON.stringify(block.input),
              },
            });
          }
        }

        const assistantMsg: OpenAIMessage = {
          role: 'assistant',
          content: textParts.length > 0 ? textParts.join('\n') : null,
        };
        if (toolCalls.length > 0) {
          assistantMsg.tool_calls = toolCalls;
        }
        messages.push(assistantMsg);
      }
    }
  }

  return messages;
}

/** Parse OpenAI tool calls to our normalized format */
export function parseOpenAIToolCalls(toolCalls: OpenAIToolCall[] | undefined): ToolCall[] {
  if (!toolCalls) return [];
  return toolCalls.map((tc) => ({
    id: tc.id,
    name: tc.function.name as ToolCall['name'],
    input: JSON.parse(tc.function.arguments),
  }));
}

/**
 * Send a message to OpenAI and get back tool calls.
 * Uses direct fetch to the OpenAI API (browser-compatible).
 */
export async function sendOpenAIMessage(
  options: OpenAIProviderOptions,
  systemPrompt: string,
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string | Array<{ type: string; [key: string]: unknown }>;
  }>,
  tools: AnthropicToolDefinition[],
): Promise<OpenAITurnResult> {
  const { apiKey, model = 'gpt-4o', maxTokens = 2048 } = options;

  const openAIMessages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    ...convertHistoryToOpenAI(conversationHistory),
  ];

  const openAITools = convertToolsToOpenAI(tools);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: openAIMessages,
      tools: openAITools,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
  }

  const data: OpenAIResponse = await response.json();
  const choice = data.choices[0];

  if (!choice) {
    throw new Error('OpenAI returned no choices');
  }

  const toolCalls = parseOpenAIToolCalls(choice.message.tool_calls);
  const thinkingText = choice.message.content ?? '';

  return {
    toolCalls,
    thinkingText,
    stopReason: choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn',
  };
}

/**
 * Build a user message containing tool results for OpenAI.
 * Returns in Anthropic format — will be converted at send time.
 */
export function buildOpenAIToolResultMessage(
  results: Array<{ tool_use_id: string; content: string }>,
): { role: 'user'; content: Array<{ type: string; [key: string]: unknown }> } {
  return {
    role: 'user',
    content: results.map((r) => ({
      type: 'tool_result',
      tool_use_id: r.tool_use_id,
      content: r.content,
    })),
  };
}

/**
 * Build an assistant message from OpenAI's response content.
 * Returns in Anthropic format for normalized storage.
 */
export function buildOpenAIAssistantMessage(
  toolCalls: ToolCall[],
  thinkingText: string,
): { role: 'assistant'; content: Array<{ type: string; [key: string]: unknown }> } {
  const content: Array<{ type: string; [key: string]: unknown }> = [];

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

  return { role: 'assistant', content };
}
