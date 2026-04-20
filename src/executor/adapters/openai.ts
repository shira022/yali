import OpenAI from 'openai';
import type { ModelSpec } from '../../types/index.js';
import { ExecutorError } from '../errors.js';
import type { LLMAdapter } from './types.js';

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 60_000;
const BASE_DELAY_MS = 1000;

function isRetryable(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) {
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

export class OpenAIAdapter implements LLMAdapter {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
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
        const apiCall = this.client.chat.completions.create({
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          ...(temperature !== undefined && { temperature }),
          ...(max_tokens !== undefined && { max_tokens }),
        });

        const response = await withTimeout(apiCall, timeoutMs, 'LLM API call');
        return response.choices[0]?.message?.content ?? '';
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
          const stream = await this.client.chat.completions.create({
            model: modelName,
            messages: [{ role: 'user', content: prompt }],
            stream: true,
            ...(temperature !== undefined && { temperature }),
            ...(max_tokens !== undefined && { max_tokens }),
          });

          let fullText = '';
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content ?? '';
            if (delta) {
              onChunk(delta);
              fullText += delta;
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
