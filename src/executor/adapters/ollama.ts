import OpenAI from 'openai';
import type { ModelSpec } from '../../types/index.js';
import { ExecutorError } from '../errors.js';
import type { LLMAdapter } from './types.js';

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1';

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

function isOllamaNotRunning(error: unknown): boolean {
  if (error instanceof Error && 'code' in error) {
    return (error as NodeJS.ErrnoException).code === 'ECONNREFUSED';
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OllamaAdapter implements LLMAdapter {
  private readonly client: OpenAI;

  constructor(baseUrl: string = DEFAULT_OLLAMA_BASE_URL) {
    this.client = new OpenAI({ baseURL: baseUrl, apiKey: 'ollama' });
  }

  async call(prompt: string, model: ModelSpec): Promise<string> {
    const { name: modelName, temperature, max_tokens } = model;
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
      }

      try {
        const response = await this.client.chat.completions.create({
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          ...(temperature !== undefined && { temperature }),
          ...(max_tokens !== undefined && { max_tokens }),
        });

        return response.choices[0]?.message?.content ?? '';
      } catch (error) {
        if (isOllamaNotRunning(error)) {
          throw new ExecutorError(
            'Ollama is not running. Start Ollama with: ollama serve',
            error,
          );
        }
        lastError = error;
        if (!isRetryable(error) || attempt === MAX_RETRIES) {
          break;
        }
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
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
      } catch (error) {
        if (isOllamaNotRunning(error)) {
          throw new ExecutorError(
            'Ollama is not running. Start Ollama with: ollama serve',
            error,
          );
        }
        lastError = error;
        if (!isRetryable(error) || attempt === MAX_RETRIES) {
          break;
        }
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new ExecutorError(
      `LLM API streaming call failed after ${MAX_RETRIES} retries: ${message}`,
      lastError,
    );
  }
}
