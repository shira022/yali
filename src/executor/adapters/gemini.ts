import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ModelSpec } from '../../types/index.js';
import { ExecutorError } from '../errors.js';
import type { LLMAdapter } from './types.js';

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
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

export class GeminiAdapter implements LLMAdapter {
  private readonly client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async call(prompt: string, model: ModelSpec): Promise<string> {
    const { name: modelName, temperature, max_tokens } = model;
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
        const result = await genModel.generateContent(prompt);
        return result.response.text();
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === MAX_RETRIES) {
          break;
        }
      }
    }

    const message =
      lastError instanceof Error ? lastError.message : String(lastError);
    throw new ExecutorError(
      `LLM API call failed after ${MAX_RETRIES} retries: ${message}`,
      lastError,
    );
  }

  async callStreaming(
    prompt: string,
    model: ModelSpec,
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    const { name: modelName, temperature, max_tokens } = model;
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === MAX_RETRIES) {
          break;
        }
      }
    }

    const message =
      lastError instanceof Error ? lastError.message : String(lastError);
    throw new ExecutorError(
      `LLM API streaming call failed after ${MAX_RETRIES} retries: ${message}`,
      lastError,
    );
  }
}
