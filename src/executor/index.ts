import { writeFile } from 'node:fs/promises';
import type { ValidatedCommand, ExecutionResult, ProviderName } from '../types/index.js';
import { orderSteps, renderStep } from '../renderer/index.js';
import { ExecutorError } from './errors.js';
import { resolveApiKey } from './api-key-resolver.js';
import { createAdapter } from './adapters/types.js';
import { DEFAULT_OLLAMA_BASE_URL } from './adapters/ollama.js';
import { getConfigPath } from '../config/paths.js';
import { readConfig, getNestedValue } from '../config/store.js';

/**
 * Resolves the Ollama base URL from yali config, env var, or default.
 */
export function resolveOllamaBaseUrl(): string {
  try {
    const config = readConfig(getConfigPath());
    const baseUrl = getNestedValue(config, 'ollama.base_url');
    if (baseUrl) return baseUrl;
  } catch { /* ignore */ }

  const envUrl = process.env['OLLAMA_BASE_URL'];
  if (envUrl) return envUrl;

  return DEFAULT_OLLAMA_BASE_URL;
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
  // stdout streaming is handled by the adapter's onChunk callback; buffered stdout written by caller
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
  const { output_spec } = command;
  const useStreaming = output_spec.target === 'stdout' && output_spec.format !== 'json';

  const vars: Record<string, string> = { ...variables };
  // Cache adapters by provider to avoid re-creating clients
  const adapterCache = new Map<ProviderName, ReturnType<typeof createAdapter>>();

  try {
    const orderedSteps = orderSteps(command);
    let lastOutput = '';

    for (let i = 0; i < orderedSteps.length; i++) {
      const step = orderedSteps[i]!;
      const rendered = renderStep(step, vars);
      const { provider = 'openai', temperature, max_tokens } = rendered.model;

      // Resolve adapter (with cache)
      let adapter = adapterCache.get(provider);
      if (!adapter) {
        let apiKeyOrBaseUrl: string;
        if (provider === 'ollama') {
          apiKeyOrBaseUrl = resolveOllamaBaseUrl();
        } else {
          try {
            apiKeyOrBaseUrl = resolveApiKey(provider);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { exitCode: 1, output: message };
          }
        }
        adapter = createAdapter(provider, apiKeyOrBaseUrl);
        adapterCache.set(provider, adapter);
      }

      const isFinalStep = i === orderedSteps.length - 1;
      let rawOutput: string;
      if (useStreaming && isFinalStep) {
        rawOutput = await adapter.callStreaming(
          rendered.prompt,
          rendered.model,
          (chunk) => process.stdout.write(chunk),
        );
        // Ensure trailing newline on stdout
        if (rawOutput && !rawOutput.endsWith('\n')) {
          process.stdout.write('\n');
        }
      } else {
        rawOutput = await adapter.call(rendered.prompt, rendered.model);
      }

      vars[`steps.${step.id}.output`] = rawOutput;
      lastOutput = rawOutput;
    }

    const formatted = formatOutput(lastOutput, output_spec.format);

    if (output_spec.target === 'file') {
      await writeOutput(formatted, output_spec.target, output_spec.path);
    } else if (!useStreaming) {
      process.stdout.write(formatted);
      if (!formatted.endsWith('\n')) {
        process.stdout.write('\n');
      }
    }

    return { exitCode: 0, output: formatted };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { exitCode: 1, output: message };
  }
}
