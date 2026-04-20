import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ModelSpec } from '../../types/index.js';
import { ExecutorError } from '../errors.js';
import type { LLMAdapter } from './types.js';

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 60_000;
const BASE_DELAY_MS = 1000;

function isRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    if ('code' in error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') return true;
    }
    const status = (error as unknown as Record<string, unknown>)['status'];
    if (typeof status === 'number') {
      return RETRYABLE_STATUS_CODES.has(status);
    }
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

export class GeminiAdapter implements LLMAdapter {
  private readonly client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
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
        const genModel = this.client.getGenerativeModel({
          model: modelName,
          generationConfig: {
            ...(temperature !== undefined && { temperature }),
            ...(max_tokens !== undefined && { maxOutputTokens: max_tokens }),
          },
        });
        const apiCall = genModel.generateContent(prompt);
        const result = await withTimeout(apiCall, timeoutMs, 'LLM API call');
        return result.response.text();
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
          const genModel = this.client.getGenerativeModel({
            model: modelName,
            generationConfig: {
              ...(temperature !== undefined && { temperature }),
              ...(max_tokens !== undefined && { maxOutputTokens: max_tokens }),
            },
          });
          const result = await genModel.generateContentStream(prompt);

          let fullText = '';
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              onChunk(text);
              fullText += text;
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
