import type { ProviderName } from '../types/index.js';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/** Human-readable display names used in error messages. */
const PROVIDER_DISPLAY_NAMES: Partial<Record<ProviderName, string>> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
};

/**
 * Per-provider API key validation rules.
 * Each rule specifies a regex pattern and a human-readable description
 * of the expected format for error messages.
 */
const PROVIDER_RULES: Partial<Record<ProviderName, { pattern: RegExp; description: string }>> = {
  openai: {
    pattern: /^sk-[A-Za-z0-9\-_]{20,}$/,
    description: 'must start with "sk-" and be at least 23 characters (e.g. sk-...)',
  },
  anthropic: {
    pattern: /^sk-ant-[A-Za-z0-9\-_]{10,}$/,
    description: 'must start with "sk-ant-" and be at least 17 characters (e.g. sk-ant-api03-...)',
  },
  google: {
    pattern: /^AIza[A-Za-z0-9\-_]{35}$/,
    description: 'must start with "AIza" and be exactly 39 characters',
  },
};

/**
 * Validates an API key for the given provider against known format rules.
 *
 * - OpenAI: must start with "sk-", min 23 chars total
 * - Anthropic: must start with "sk-ant-", min 17 chars total
 * - Google: must start with "AIza", exactly 39 chars
 * - Ollama: any string is accepted (no validation — local LLM, no real API key needed)
 *
 * @returns `{ valid: true }` if the key matches the expected format,
 *          `{ valid: false, error: string }` otherwise.
 */
export function validateApiKey(provider: ProviderName, key: string): ValidationResult {
  const rule = PROVIDER_RULES[provider];

  if (!rule) {
    // No rule defined (e.g. Ollama) → accept any non-empty string
    return { valid: true };
  }

  if (!rule.pattern.test(key)) {
    const providerLabel = PROVIDER_DISPLAY_NAMES[provider] ?? provider;
    return {
      valid: false,
      error: `Invalid ${providerLabel} API key format: ${rule.description}.`,
    };
  }

  return { valid: true };
}
