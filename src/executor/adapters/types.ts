import type { ModelSpec, ProviderName } from '../../types/index.js';
import { ExecutorError } from '../errors.js';
import { AnthropicAdapter } from './anthropic.js';
import { OpenAIAdapter } from './openai.js';

/**
 * Common interface for all LLM provider adapters.
 * Only the Executor layer may use this interface.
 */
export interface LLMAdapter {
  /** Calls the LLM API and returns the full response text. */
  call(prompt: string, model: ModelSpec): Promise<string>;
  /**
   * Calls the LLM API with streaming.
   * Invokes onChunk for each received text chunk.
   * Returns the accumulated full response text.
   */
  callStreaming(
    prompt: string,
    model: ModelSpec,
    onChunk: (chunk: string) => void,
  ): Promise<string>;
}

/**
 * Creates an LLMAdapter for the given provider.
 * Throws ExecutorError for unsupported providers.
 */
export function createAdapter(provider: ProviderName, apiKey: string): LLMAdapter {
  switch (provider) {
    case 'openai':
      return new OpenAIAdapter(apiKey);
    case 'anthropic':
      return new AnthropicAdapter(apiKey);
    case 'google':
    case 'ollama':
      throw new ExecutorError(
        `Provider '${provider}' is not yet supported. Only 'openai' and 'anthropic' are currently available.`,
      );
    default: {
      const _exhaustive: never = provider;
      throw new ExecutorError(`Unknown provider: ${String(_exhaustive)}`);
    }
  }
}
