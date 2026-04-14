import { writeFile } from 'node:fs/promises';
import OpenAI from 'openai';
import type { ValidatedCommand, ExecutionResult } from '../types/index.js';
import { orderSteps, renderStep } from '../renderer/index.js';
import { ExecutorError } from './errors.js';

// Retryable HTTP status codes
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function createClient(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    throw new ExecutorError('OPENAI_API_KEY environment variable is not set');
  }
  return new OpenAI({ apiKey });
}

function isRetryable(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) {
    return RETRYABLE_STATUS_CODES.has(error.status);
  }
  // Network errors (no status code) are retryable
  if (error instanceof Error && 'code' in error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND';
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls the LLM API with exponential-backoff retry.
 * Returns the full response text.
 */
async function callLLM(
  client: OpenAI,
  prompt: string,
  modelName: string,
  temperature?: number,
  maxTokens?: number,
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }

    try {
      const response = await client.chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        ...(temperature !== undefined && { temperature }),
        ...(maxTokens !== undefined && { max_tokens: maxTokens }),
      });

      return response.choices[0]?.message?.content ?? '';
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === MAX_RETRIES) {
        break;
      }
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new ExecutorError(`LLM API call failed after ${MAX_RETRIES} retries: ${message}`, lastError);
}

/**
 * Calls the LLM API with streaming and writes chunks to stdout in real-time.
 * Returns the accumulated full response text.
 */
async function callLLMStreaming(
  client: OpenAI,
  prompt: string,
  modelName: string,
  temperature?: number,
  maxTokens?: number,
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }

    try {
      const stream = await client.chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        ...(temperature !== undefined && { temperature }),
        ...(maxTokens !== undefined && { max_tokens: maxTokens }),
      });

      let fullText = '';
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? '';
        if (delta) {
          process.stdout.write(delta);
          fullText += delta;
        }
      }
      // Ensure trailing newline on stdout
      if (fullText && !fullText.endsWith('\n')) {
        process.stdout.write('\n');
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
  throw new ExecutorError(`LLM API streaming call failed after ${MAX_RETRIES} retries: ${message}`, lastError);
}

/**
 * Formats the LLM output according to the requested format.
 * For 'json', validates and re-serializes the output.
 * For 'text' and 'markdown', returns the text as-is.
 */
function formatOutput(text: string, format: 'text' | 'markdown' | 'json'): string {
  if (format !== 'json') {
    return text;
  }

  // Try to extract JSON from the response (LLMs may wrap it in markdown code fences)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? null;
  const jsonText = jsonMatch ? jsonMatch[1]!.trim() : text.trim();

  try {
    const parsed: unknown = JSON.parse(jsonText);
    return JSON.stringify(parsed, null, 2);
  } catch {
    // Return raw text if JSON parsing fails — don't error out
    return text;
  }
}

/**
 * Writes the final output to the target (stdout already written during streaming,
 * so this is a no-op for stdout. For file targets, writes the buffered content.)
 */
async function writeOutput(
  content: string,
  target: 'stdout' | 'file',
  path?: string,
): Promise<void> {
  if (target === 'file') {
    if (!path) {
      throw new ExecutorError('output.path is required when output.target is "file"');
    }
    await writeFile(path, content, 'utf-8');
  }
  // stdout streaming is handled in callLLMStreaming; buffered stdout written by caller
}

/**
 * Executes a ValidatedCommand by:
 *  1. Ordering steps topologically (via Renderer's orderSteps)
 *  2. For each step: rendering the prompt (renderStep), calling the LLM API,
 *     and accumulating the output into `variables` as `steps.<id>.output`
 *  3. Writing the final step's output to the configured target
 *
 * @returns ExecutionResult with exitCode 0 on success, 1 on error.
 */
export async function execute(
  command: ValidatedCommand,
  variables: Record<string, string>,
): Promise<ExecutionResult> {
  let client: OpenAI;
  try {
    client = createClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { exitCode: 1, output: message };
  }

  const { output_spec } = command;
  const isStreaming = output_spec.target === 'stdout';

  // Mutable copy so we can accumulate step outputs
  const vars: Record<string, string> = { ...variables };

  try {
    const orderedSteps = orderSteps(command);
    let lastOutput = '';

    for (const step of orderedSteps) {
      const rendered = renderStep(step, vars);
      const { name: modelName, temperature, max_tokens } = rendered.model;

      let rawOutput: string;
      if (isStreaming) {
        rawOutput = await callLLMStreaming(client, rendered.prompt, modelName, temperature, max_tokens);
      } else {
        rawOutput = await callLLM(client, rendered.prompt, modelName, temperature, max_tokens);
      }

      // Accumulate for inter-step references
      vars[`steps.${step.id}.output`] = rawOutput;
      lastOutput = rawOutput;
    }

    const formatted = formatOutput(lastOutput, output_spec.format);

    // For file target: write buffered output now
    if (!isStreaming) {
      await writeOutput(formatted, output_spec.target, output_spec.path);
    }

    return { exitCode: 0, output: formatted };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { exitCode: 1, output: message };
  }
}
