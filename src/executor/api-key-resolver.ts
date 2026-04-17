import type { ProviderName } from '../types/index.js';
import { ExecutorError } from './errors.js';

/** Maps provider names to their environment variable names. */
const ENV_VAR_MAP: Record<ProviderName, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  ollama: 'OLLAMA_API_KEY',
};

/** Human-readable display names for each provider. */
const PROVIDER_LABELS: Record<ProviderName, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  ollama: 'Ollama',
};

/**
 * Resolves the API key for the given provider.
 *
 * Resolution order:
 *   1. Environment variable (backward compatible)
 *   2. (Future) ~/.config/yali/config.yaml — to be implemented with yali config issue
 *
 * Throws ExecutorError with user-friendly guidance if the key is not configured.
 */
export function resolveApiKey(provider: ProviderName): string {
  const envVar = ENV_VAR_MAP[provider];
  const apiKey = process.env[envVar];
  if (apiKey) {
    return apiKey;
  }

  const providerLabel = PROVIDER_LABELS[provider];
  throw new ExecutorError(
    `${providerLabel} API key is not configured.\n` +
      `Set the ${envVar} environment variable, or run:\n` +
      `  yali config set ${provider}.api_key <YOUR_API_KEY>`,
  );
}
