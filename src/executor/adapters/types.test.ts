import { describe, it, expect, vi } from 'vitest';

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

vi.mock('./gemini.js', () => ({
  GeminiAdapter: class MockGeminiAdapter {
    constructor(public readonly apiKey: string) {}
    call = vi.fn();
    callStreaming = vi.fn();
  },
}));

vi.mock('./ollama.js', () => ({
  OllamaAdapter: class MockOllamaAdapter {
    constructor(public readonly baseUrl: string) {}
    call = vi.fn();
    callStreaming = vi.fn();
  },
  DEFAULT_OLLAMA_BASE_URL: 'http://localhost:11434/v1',
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

  it("returns an adapter with call() and callStreaming() for 'google'", async () => {
    const { createAdapter } = await import('./types.js');
    const adapter = createAdapter('google', 'test-key');
    expect(typeof adapter.call).toBe('function');
    expect(typeof adapter.callStreaming).toBe('function');
  });

  it("returns an adapter with call() and callStreaming() for 'ollama'", async () => {
    const { createAdapter } = await import('./types.js');
    const adapter = createAdapter('ollama', 'http://localhost:11434/v1');
    expect(typeof adapter.call).toBe('function');
    expect(typeof adapter.callStreaming).toBe('function');
  });
});
