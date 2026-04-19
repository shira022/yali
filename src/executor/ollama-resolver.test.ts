import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReadConfig = vi.fn();
const mockGetNestedValue = vi.fn();
const mockGetConfigPath = vi.fn().mockReturnValue('/fake/.yali/config.yaml');

vi.mock('../config/store.js', () => ({
  readConfig: mockReadConfig,
  getNestedValue: mockGetNestedValue,
}));

vi.mock('../config/paths.js', () => ({
  getConfigPath: mockGetConfigPath,
}));

// openai is imported transitively via adapters; mock to avoid real HTTP
vi.mock('openai', () => {
  class FakeAPIError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'APIError';
      this.status = status;
    }
  }
  const OpenAI = vi.fn().mockImplementation(() => ({
    chat: { completions: { create: vi.fn() } },
  }));
  (OpenAI as unknown as Record<string, unknown>)['APIError'] = FakeAPIError;
  return { default: OpenAI };
});

vi.mock('./api-key-resolver.js', () => ({
  resolveApiKey: vi.fn().mockReturnValue('test-key'),
}));

describe('resolveOllamaBaseUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfigPath.mockReturnValue('/fake/.yali/config.yaml');
    mockReadConfig.mockReturnValue({});
    mockGetNestedValue.mockReturnValue(undefined);
  });

  it('returns default URL when no config is set', async () => {
    const { resolveOllamaBaseUrl } = await import('./index.js');
    expect(resolveOllamaBaseUrl()).toBe('http://localhost:11434/v1');
  });

  it('returns config file value when ollama.base_url is configured', async () => {
    mockGetNestedValue.mockReturnValue('http://config-host:11434/v1');
    const { resolveOllamaBaseUrl } = await import('./index.js');
    expect(resolveOllamaBaseUrl()).toBe('http://config-host:11434/v1');
  });
});
