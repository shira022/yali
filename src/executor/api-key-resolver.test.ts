import { describe, it, expect, afterEach } from 'vitest';
import { resolveApiKey } from './api-key-resolver.js';
import { ExecutorError } from './errors.js';

const ALL_ENV_VARS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'OLLAMA_API_KEY',
] as const;

afterEach(() => {
  for (const key of ALL_ENV_VARS) {
    delete process.env[key];
  }
});

describe('resolveApiKey()', () => {
  // ---------------------------------------------------------------------------
  // openai
  // ---------------------------------------------------------------------------
  it('returns the key when OPENAI_API_KEY is set', () => {
    process.env['OPENAI_API_KEY'] = 'sk-test-openai';
    expect(resolveApiKey('openai')).toBe('sk-test-openai');
  });

  it('throws ExecutorError when OPENAI_API_KEY is not set', () => {
    expect(() => resolveApiKey('openai')).toThrow(ExecutorError);
  });

  it('error message mentions the env var name for openai', () => {
    expect(() => resolveApiKey('openai')).toThrow(/OPENAI_API_KEY/);
  });

  it('error message includes yali config set guidance for openai', () => {
    expect(() => resolveApiKey('openai')).toThrow(/yali config set openai\.api_key/);
  });

  // ---------------------------------------------------------------------------
  // Provider → env var mapping
  // ---------------------------------------------------------------------------
  it('maps anthropic to ANTHROPIC_API_KEY', () => {
    process.env['ANTHROPIC_API_KEY'] = 'ant-key';
    expect(resolveApiKey('anthropic')).toBe('ant-key');
  });

  it('maps google to GOOGLE_API_KEY', () => {
    process.env['GOOGLE_API_KEY'] = 'goog-key';
    expect(resolveApiKey('google')).toBe('goog-key');
  });

  it('maps ollama to OLLAMA_API_KEY', () => {
    process.env['OLLAMA_API_KEY'] = 'ollama-key';
    expect(resolveApiKey('ollama')).toBe('ollama-key');
  });

  // ---------------------------------------------------------------------------
  // Error messages for other providers
  // ---------------------------------------------------------------------------
  it('throws when anthropic key is missing with correct guidance', () => {
    expect(() => resolveApiKey('anthropic')).toThrow(/yali config set anthropic\.api_key/);
  });

  it('error message for anthropic mentions ANTHROPIC_API_KEY', () => {
    expect(() => resolveApiKey('anthropic')).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('error message includes capitalised provider label', () => {
    // "OpenAI API key is not configured"
    expect(() => resolveApiKey('openai')).toThrow(/OpenAI/);
    // "Anthropic API key is not configured"
    expect(() => resolveApiKey('anthropic')).toThrow(/Anthropic/);
  });
});
