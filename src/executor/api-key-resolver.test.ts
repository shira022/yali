import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeConfig } from '../config/store.js';
import { resolveApiKey } from './api-key-resolver.js';
import { ExecutorError } from './errors.js';

let tmpDir: string;
let configPath: string;

// Hoisted mock — factory reads `configPath` at call time via closure
vi.mock('../config/paths.js', () => ({
  getConfigPath: () => configPath,
}));

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'yali-test-'));
  configPath = join(tmpDir, 'config.yaml');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('resolveApiKey()', () => {
  it('returns api_key from config file for openai', () => {
    writeConfig(configPath, { openai: { api_key: 'sk-from-config' } });
    expect(resolveApiKey('openai')).toBe('sk-from-config');
  });

  it('returns api_key from config file for anthropic', () => {
    writeConfig(configPath, { anthropic: { api_key: 'ant-from-config' } });
    expect(resolveApiKey('anthropic')).toBe('ant-from-config');
  });

  it('returns api_key from config file for google', () => {
    writeConfig(configPath, { google: { api_key: 'goog-from-config' } });
    expect(resolveApiKey('google')).toBe('goog-from-config');
  });

  it('returns api_key from config file for ollama', () => {
    writeConfig(configPath, { ollama: { api_key: 'ollama-from-config' } });
    expect(resolveApiKey('ollama')).toBe('ollama-from-config');
  });

  it('throws ExecutorError when config file does not exist', () => {
    expect(() => resolveApiKey('openai')).toThrow(ExecutorError);
  });

  it('throws ExecutorError when api_key is missing from config', () => {
    writeConfig(configPath, { openai: {} });
    expect(() => resolveApiKey('openai')).toThrow(ExecutorError);
  });

  it('error message includes yali config set guidance', () => {
    expect(() => resolveApiKey('openai')).toThrow(/yali config set openai\.api_key/);
  });

  it('error message includes provider label for openai', () => {
    expect(() => resolveApiKey('openai')).toThrow(/OpenAI/);
  });

  it('error message includes provider label for anthropic', () => {
    expect(() => resolveApiKey('anthropic')).toThrow(/Anthropic/);
  });

  it('does NOT read environment variables even if set', () => {
    process.env['OPENAI_API_KEY'] = 'sk-should-not-be-used';
    try {
      // Should throw because config file has no key, despite env var being set
      expect(() => resolveApiKey('openai')).toThrow(ExecutorError);
    } finally {
      delete process.env['OPENAI_API_KEY'];
    }
  });
});


