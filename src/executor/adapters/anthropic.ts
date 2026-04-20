import Anthropic from '@anthropic-ai/sdk';
import type { ModelSpec } from '../../types/index.js';
import { ExecutorError } from '../errors.js';
import type { LLMAdapter } from './types.js';

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 60_000;
const BASE_DELAY_MS = 1000;

function isRetryable(error: unknown): boolean {
  if (error instanceof Anthropic.APIError) {
    return RETRYABLE_STATUS_CODES.has(error.status);
  }
  if (error instanceof Error && 'code' in error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND';
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export class AnthropicAdapter implements LLMAdapter {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async call(prompt: string, model: ModelSpec): Promise<string> {
    const { name: modelName, temperature, max_tokens } = model;
    const maxRetries = model.max_retries ?? DEFAULT_MAX_RETRIES;
    const timeoutMs = model.timeout_ms ?? DEFAULT_TIMEOUT_MS;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
      }

      try {
        const apiCall = this.client.messages.create({
          model: modelName,
          max_tokens: max_tokens ?? 1024,
          messages: [{ role: 'user', content: prompt }],
          ...(temperature !== undefined && { temperature }),
        });

        const response = await withTimeout(apiCall, timeoutMs, 'LLM API call');
        return (response.content[0] as { type: string; text?: string })?.text ?? '';
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === maxRetries) {
          break;
        }
      }
    }

    const message =
      lastError instanceof Error ? lastError.message : String(lastError);
    throw new ExecutorError(
      `LLM API call failed after ${maxRetries} retries: ${message}`,
      lastError,
    );
  }

  async callStreaming(
    prompt: string,
    model: ModelSpec,
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    const { name: modelName, temperature, max_tokens } = model;
    const maxRetries = model.max_retries ?? DEFAULT_MAX_RETRIES;
    const timeoutMs = model.timeout_ms ?? DEFAULT_TIMEOUT_MS;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
      }

      try {
        const streamingCall = (async () => {
          const stream = await this.client.messages.create({
            model: modelName,
            max_tokens: max_tokens ?? 1024,
            messages: [{ role: 'user', content: prompt }],
            stream: true,
            ...(temperature !== undefined && { temperature }),
          });

          let fullText = '';
          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              onChunk(event.delta.text);
              fullText += event.delta.text;
            }
          }
          return fullText;
        })();

        return await withTimeout(streamingCall, timeoutMs, 'LLM API streaming call');
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === maxRetries) {
          break;
        }
      }
    }

    const message =
      lastError instanceof Error ? lastError.message : String(lastError);
    throw new ExecutorError(
      `LLM API streaming call failed after ${maxRetries} retries: ${message}`,
      lastError,
    );
  }
}
