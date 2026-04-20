import type { ProviderName } from '../types/index.js';
import { ExecutorError } from './errors.js';
import { getConfigPath } from '../config/paths.js';
import { readConfig, getNestedValue } from '../config/store.js';
import { validateApiKey } from '../config/api-key-validator.js';

/** Human-readable display names for each provider. */
const PROVIDER_LABELS: Record<ProviderName, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  ollama: 'Ollama',
};

/**
 * Resolves the API key for the given provider from the yali config file.
 *
 * Resolution: ~/.config/yali/config.yaml (or OS equivalent) only.
 * Environment variables are not consulted.
 *
 * Throws ExecutorError with user-friendly guidance if the key is not configured.
 */
export function resolveApiKey(provider: ProviderName): string {
  const configPath = getConfigPath();
  let apiKey: string | undefined;

  try {
    const config = readConfig(configPath);
    apiKey = getNestedValue(config, `${provider}.api_key`);
  } catch {
    // If the config file is unreadable/malformed, fall through to the error below
  }

  if (apiKey) {
    const validation = validateApiKey(provider, apiKey);
    if (!validation.valid) {
      process.stderr.write(`⚠ Warning: ${validation.error}\n`);
    }
    return apiKey;
  }

  const providerLabel = PROVIDER_LABELS[provider];
  throw new ExecutorError(
    `${providerLabel} API key is not configured.\n` +
      `Run: yali config set ${provider}.api_key <YOUR_API_KEY>`,
  );
}
