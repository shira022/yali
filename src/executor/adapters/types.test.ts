import { describe, it, expect, vi } from 'vitest';
import { ExecutorError } from '../errors.js';

// Mock adapters so createAdapter doesn't need a real API key
vi.mock('./openai.js', () => ({
  OpenAIAdapter: class MockOpenAIAdapter {
    constructor(public readonly apiKey: string) {}
    call = vi.fn();
    callStreaming = vi.fn();
  },
}));

vi.mock('./anthropic.js', () => ({
  AnthropicAdapter: class MockAnthropicAdapter {
    constructor(public readonly apiKey: string) {}
    call = vi.fn();
    callStreaming = vi.fn();
  },
}));

describe('createAdapter()', () => {
  it("returns an adapter with call() and callStreaming() for 'openai'", async () => {
    const { createAdapter } = await import('./types.js');
    const adapter = createAdapter('openai', 'test-key');
    expect(typeof adapter.call).toBe('function');
    expect(typeof adapter.callStreaming).toBe('function');
  });

  it("returns an adapter with call() and callStreaming() for 'anthropic'", async () => {
    const { createAdapter } = await import('./types.js');
    const adapter = createAdapter('anthropic', 'test-key');
    expect(typeof adapter.call).toBe('function');
    expect(typeof adapter.callStreaming).toBe('function');
  });

  it("throws ExecutorError for 'google' (not yet supported)", async () => {
    const { createAdapter } = await import('./types.js');
    expect(() => createAdapter('google', 'key')).toThrow(ExecutorError);
    expect(() => createAdapter('google', 'key')).toThrow(/not yet supported/);
  });

  it("throws ExecutorError for 'ollama' (not yet supported)", async () => {
    const { createAdapter } = await import('./types.js');
    expect(() => createAdapter('ollama', 'key')).toThrow(ExecutorError);
    expect(() => createAdapter('ollama', 'key')).toThrow(/not yet supported/);
  });

  it('error message for unsupported provider names the provider', async () => {
    const { createAdapter } = await import('./types.js');
    expect(() => createAdapter('google', 'key')).toThrow(/google/);
  });
});
