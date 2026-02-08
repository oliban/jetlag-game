import type { AnthropicToolDefinition, ToolCall, ToolResult } from './aiClient.ts';
import {
  sendClaudeMessage,
  buildToolResultMessage as buildClaudeToolResult,
  buildAssistantMessage as buildClaudeAssistant,
} from './providers/claude.ts';
import {
  sendOpenAIMessage,
  buildOpenAIToolResultMessage,
  buildOpenAIAssistantMessage,
} from './providers/openai.ts';

export type ProviderType = 'claude' | 'openai';

export interface ProviderConfig {
  type: ProviderType;
  model?: string;
}

export interface ProviderTurnResult {
  toolCalls: ToolCall[];
  thinkingText: string;
  stopReason: string;
}

/** Normalized conversation message — stored in Anthropic format internally */
export type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; [key: string]: unknown }>;
};

/**
 * Send a message to any provider using a unified interface.
 * Conversation history is stored in Anthropic/normalized format.
 */
export async function sendProviderMessage(
  config: ProviderConfig,
  systemPrompt: string,
  conversationHistory: ConversationMessage[],
  tools: AnthropicToolDefinition[],
): Promise<ProviderTurnResult> {
  switch (config.type) {
    case 'claude':
      return sendClaudeMessage(
        { model: config.model },
        systemPrompt,
        conversationHistory,
        tools,
      );
    case 'openai':
      return sendOpenAIMessage(
        { model: config.model },
        systemPrompt,
        conversationHistory,
        tools,
      );
    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}

/**
 * Build a tool result message in normalized format.
 * Works with any provider — format is provider-agnostic at storage layer.
 */
export function buildToolResultMessage(results: ToolResult[]): ConversationMessage {
  return buildClaudeToolResult(results);
}

/**
 * Build an assistant message in normalized format.
 */
export function buildAssistantMessage(
  toolCalls: ToolCall[],
  thinkingText: string,
): ConversationMessage {
  return buildClaudeAssistant(toolCalls, thinkingText);
}
