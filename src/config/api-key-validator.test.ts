import { describe, it, expect } from 'vitest';
import { validateApiKey } from './api-key-validator.js';

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------
describe('validateApiKey() — openai', () => {
  it('accepts a valid legacy sk- key', () => {
    const result = validateApiKey('openai', 'sk-abcdefghijklmnopqrstuvwxyz12345678901234567890');
    expect(result.valid).toBe(true);
  });

  it('accepts a valid sk-proj- key', () => {
    const result = validateApiKey('openai', 'sk-proj-abcdefghijklmnopqrstuvwxyz123456789');
    expect(result.valid).toBe(true);
  });

  it('rejects a key without sk- prefix', () => {
    const result = validateApiKey('openai', 'pk-abcdefghijklmnopqrstuvwxyz12345678');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/OpenAI/);
    expect(result.error).toMatch(/sk-/);
  });

  it('rejects a key that is too short', () => {
    const result = validateApiKey('openai', 'sk-tooshort');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Invalid OpenAI API key format/);
  });

  it('rejects an empty string', () => {
    const result = validateApiKey('openai', '');
    expect(result.valid).toBe(false);
  });

  it('rejects a key with invalid characters', () => {
    const result = validateApiKey('openai', 'sk-invalid key with spaces!!!');
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------
describe('validateApiKey() — anthropic', () => {
  it('accepts a valid sk-ant- key', () => {
    const result = validateApiKey(
      'anthropic',
      'sk-ant-api03-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz',
    );
    expect(result.valid).toBe(true);
  });

  it('rejects a key without sk-ant- prefix', () => {
    const result = validateApiKey('anthropic', 'sk-abcdefghijklmnopqrstuvwxyz12345678901234567');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Anthropic/);
    expect(result.error).toMatch(/sk-ant-/);
  });

  it('rejects a key that is too short', () => {
    const result = validateApiKey('anthropic', 'sk-ant-short');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Invalid Anthropic API key format/);
  });

  it('rejects an empty string', () => {
    const result = validateApiKey('anthropic', '');
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------
describe('validateApiKey() — google', () => {
  it('accepts a valid AIza key of exactly 39 chars', () => {
    // AIza + 35 chars = 39 total
    const result = validateApiKey('google', 'AIzaTEST_ONLY_FAKE_KEY_NOT_REAL_ABCDEFG');
    expect(result.valid).toBe(true);
  });

  it('rejects a key without AIza prefix', () => {
    const result = validateApiKey('google', 'BIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Google/);
    expect(result.error).toMatch(/AIza/);
  });

  it('rejects a key that is too short (less than 39 chars)', () => {
    const result = validateApiKey('google', 'AIzaShort');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Invalid Google API key format/);
  });

  it('rejects a key that is too long (more than 39 chars)', () => {
    const result = validateApiKey('google', 'AIzaTEST_ONLY_FAKE_KEY_NOT_REAL_ABCDEFGEXTRA');
    expect(result.valid).toBe(false);
  });

  it('rejects an empty string', () => {
    const result = validateApiKey('google', '');
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Ollama
// ---------------------------------------------------------------------------
describe('validateApiKey() — ollama', () => {
  it('accepts any string, including empty', () => {
    expect(validateApiKey('ollama', 'anything-goes').valid).toBe(true);
    expect(validateApiKey('ollama', 'local-token-123').valid).toBe(true);
    expect(validateApiKey('ollama', 'short').valid).toBe(true);
  });

  it('accepts a key that would be invalid for other providers', () => {
    expect(validateApiKey('ollama', 'pk-wrong-prefix').valid).toBe(true);
  });

  it('accepts an empty string', () => {
    expect(validateApiKey('ollama', '').valid).toBe(true);
  });
});
