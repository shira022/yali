import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('openai', () => {
  const mockCreate = vi.fn();

  class FakeAPIError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'APIError';
      this.status = status;
    }
  }

  const OpenAI = vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  }));

  (OpenAI as unknown as Record<string, unknown>)['APIError'] = FakeAPIError;

  return { default: OpenAI, __mockCreate: mockCreate };
});

describe('OllamaAdapter', () => {
  let mockCreate: ReturnType<typeof vi.fn>;
  let OpenAIMock: ReturnType<typeof vi.fn>;
  let OllamaAdapter: new (baseUrl?: string) => import('./ollama.js').OllamaAdapter;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const openaiModule = (await import('openai')) as unknown as {
      default: ReturnType<typeof vi.fn>;
      __mockCreate: ReturnType<typeof vi.fn>;
    };
    mockCreate = openaiModule.__mockCreate;
    OpenAIMock = openaiModule.default;
    ({ OllamaAdapter } = await import('./ollama.js'));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  function mockNonStreaming(content: string) {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content } }],
    });
  }

  function mockStreaming(chunks: string[]) {
    async function* gen() {
      for (const chunk of chunks) {
        yield { choices: [{ delta: { content: chunk } }] };
      }
    }
    mockCreate.mockResolvedValue(gen());
  }

  it('uses default baseUrl when no argument is provided', () => {
    new OllamaAdapter();
    expect(OpenAIMock).toHaveBeenCalledWith({
      baseURL: 'http://localhost:11434/v1',
      apiKey: 'ollama',
    });
  });

  it('uses custom baseUrl when provided', () => {
    new OllamaAdapter('http://custom-host:11434/v1');
    expect(OpenAIMock).toHaveBeenCalledWith({
      baseURL: 'http://custom-host:11434/v1',
      apiKey: 'ollama',
    });
  });

  it('call() returns the response text', async () => {
    mockNonStreaming('Hello from Ollama!');
    const adapter = new OllamaAdapter();
    const result = await adapter.call('Say hello', { name: 'llama3' });
    expect(result).toBe('Hello from Ollama!');
  });

  it('call() forwards temperature and max_tokens to the API', async () => {
    mockNonStreaming('result');
    const adapter = new OllamaAdapter();
    await adapter.call('prompt', { name: 'llama3', temperature: 0.5, max_tokens: 128 });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.5, max_tokens: 128 }),
    );
  });

  it('call() throws ExecutorError with helpful message on ECONNREFUSED', async () => {
    const connRefused = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
    mockCreate.mockRejectedValue(connRefused);
    const adapter = new OllamaAdapter();
    const { ExecutorError } = await import('../errors.js');

    await expect(adapter.call('prompt', { name: 'llama3' })).rejects.toThrow(
      'Ollama is not running. Start Ollama with: ollama serve',
    );
    await expect(adapter.call('prompt', { name: 'llama3' })).rejects.toBeInstanceOf(ExecutorError);
  });

  it('call() does NOT retry on ECONNREFUSED', async () => {
    const connRefused = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
    mockCreate.mockRejectedValue(connRefused);
    const adapter = new OllamaAdapter();

    await expect(adapter.call('prompt', { name: 'llama3' })).rejects.toThrow();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('call() retries on 429 and succeeds', async () => {
    vi.useFakeTimers();
    const openaiModule = (await import('openai')) as unknown as {
      default: { APIError: new (msg: string, status: number) => Error };
    };
    const APIError = openaiModule.default.APIError;

    mockCreate
      .mockRejectedValueOnce(new APIError('rate limit', 429))
      .mockResolvedValueOnce({ choices: [{ message: { content: 'retry success' } }] });

    const adapter = new OllamaAdapter();
    const promise = adapter.call('prompt', { name: 'llama3' });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('retry success');
    expect(mockCreate).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('call() throws ExecutorError after exhausting all retries', async () => {
    vi.useFakeTimers();
    const openaiModule = (await import('openai')) as unknown as {
      default: { APIError: new (msg: string, status: number) => Error };
    };
    const APIError = openaiModule.default.APIError;

    mockCreate.mockRejectedValue(new APIError('rate limit', 429));
    const adapter = new OllamaAdapter();
    const { ExecutorError } = await import('../errors.js');

    let caughtError: unknown;
    const settled = adapter.call('prompt', { name: 'llama3' }).catch((e) => {
      caughtError = e;
    });
    await vi.runAllTimersAsync();
    await settled;

    expect(caughtError).toBeInstanceOf(ExecutorError);
    expect(mockCreate).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it('call() does not retry on 400 (non-retryable)', async () => {
    const openaiModule = (await import('openai')) as unknown as {
      default: { APIError: new (msg: string, status: number) => Error };
    };
    const APIError = openaiModule.default.APIError;

    mockCreate.mockRejectedValue(new APIError('bad request', 400));
    const adapter = new OllamaAdapter();
    const { ExecutorError } = await import('../errors.js');

    await expect(adapter.call('prompt', { name: 'llama3' })).rejects.toBeInstanceOf(ExecutorError);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('call() retries on ECONNRESET and succeeds', async () => {
    vi.useFakeTimers();
    const networkError = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
    mockCreate
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ choices: [{ message: { content: 'network retry ok' } }] });

    const adapter = new OllamaAdapter();
    const promise = adapter.call('prompt', { name: 'llama3' });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('network retry ok');
    expect(mockCreate).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('callStreaming() invokes onChunk for each chunk', async () => {
    mockStreaming(['Hello ', 'from ', 'Ollama!']);
    const adapter = new OllamaAdapter();
    const chunks: string[] = [];
    await adapter.callStreaming('prompt', { name: 'llama3' }, (c) => chunks.push(c));
    expect(chunks).toEqual(['Hello ', 'from ', 'Ollama!']);
  });

  it('callStreaming() returns the accumulated full text', async () => {
    mockStreaming(['Hello ', 'world!']);
    const adapter = new OllamaAdapter();
    const result = await adapter.callStreaming('prompt', { name: 'llama3' }, () => {});
    expect(result).toBe('Hello world!');
  });

  it('callStreaming() throws ExecutorError immediately on ECONNREFUSED (no retry)', async () => {
    const connRefused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    mockCreate.mockRejectedValue(connRefused);
    const adapter = new OllamaAdapter();
    const { ExecutorError } = await import('../errors.js');

    await expect(
      adapter.callStreaming('prompt', { name: 'llama3.2' }, () => {}),
    ).rejects.toBeInstanceOf(ExecutorError);
    expect(mockCreate).toHaveBeenCalledTimes(1); // no retry
  });

  it('callStreaming() ECONNREFUSED error message mentions ollama serve', async () => {
    const connRefused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    mockCreate.mockRejectedValue(connRefused);
    const adapter = new OllamaAdapter();

    await expect(
      adapter.callStreaming('prompt', { name: 'llama3.2' }, () => {}),
    ).rejects.toThrow(/ollama serve/i);
  });

  it('callStreaming() retries on 429 and succeeds', async () => {
    vi.useFakeTimers();
    const openaiModule = (await import('openai')) as unknown as {
      default: { APIError: new (msg: string, status: number) => Error };
    };
    const APIError = openaiModule.default.APIError;

    async function* successStream() {
      yield { choices: [{ delta: { content: 'retry ok' } }] };
    }
    mockCreate
      .mockRejectedValueOnce(new APIError('rate limit', 429))
      .mockResolvedValueOnce(successStream());

    const adapter = new OllamaAdapter();
    const chunks: string[] = [];
    const promise = adapter.callStreaming('prompt', { name: 'llama3.2' }, (c) => chunks.push(c));
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('retry ok');
    expect(chunks).toEqual(['retry ok']);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('callStreaming() throws ExecutorError after exhausting all retries', async () => {
    vi.useFakeTimers();
    const openaiModule = (await import('openai')) as unknown as {
      default: { APIError: new (msg: string, status: number) => Error };
    };
    const APIError = openaiModule.default.APIError;

    mockCreate.mockRejectedValue(new APIError('rate limit', 429));
    const adapter = new OllamaAdapter();
    const { ExecutorError } = await import('../errors.js');

    let caughtError: unknown;
    const settled = adapter.callStreaming('prompt', { name: 'llama3.2' }, () => {}).catch((e) => {
      caughtError = e;
    });
    await vi.runAllTimersAsync();
    await settled;

    expect(caughtError).toBeInstanceOf(ExecutorError);
    expect(mockCreate).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    vi.useRealTimers();
  });

  it('callStreaming() does not retry on 400', async () => {
    const openaiModule = (await import('openai')) as unknown as {
      default: { APIError: new (msg: string, status: number) => Error };
    };
    const APIError = openaiModule.default.APIError;

    mockCreate.mockRejectedValue(new APIError('bad request', 400));
    const adapter = new OllamaAdapter();
    const { ExecutorError } = await import('../errors.js');

    await expect(
      adapter.callStreaming('prompt', { name: 'llama3.2' }, () => {}),
    ).rejects.toBeInstanceOf(ExecutorError);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
