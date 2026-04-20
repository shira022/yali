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

describe('OpenAIAdapter', () => {
  let mockCreate: ReturnType<typeof vi.fn>;
  let OpenAIAdapter: new (apiKey: string) => import('./openai.js').OpenAIAdapter;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const openaiModule = (await import('openai')) as unknown as {
      __mockCreate: ReturnType<typeof vi.fn>;
    };
    mockCreate = openaiModule.__mockCreate;
    ({ OpenAIAdapter } = await import('./openai.js'));
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

  // call() — 正常系
  it('call() returns the response text', async () => {
    mockNonStreaming('Hello, world!');
    const adapter = new OpenAIAdapter('test-key');
    const result = await adapter.call('Say hello', { name: 'gpt-4o-mini' });
    expect(result).toBe('Hello, world!');
  });

  // call() — temperature, max_tokens が API に渡される
  it('call() forwards temperature and max_tokens to the API', async () => {
    mockNonStreaming('result');
    const adapter = new OpenAIAdapter('test-key');
    await adapter.call('prompt', { name: 'gpt-4o', temperature: 0.7, max_tokens: 256 });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.7, max_tokens: 256 }),
    );
  });

  // call() — 429 でリトライし成功する
  it('call() retries on 429 and succeeds', async () => {
    vi.useFakeTimers();
    const openaiModule = (await import('openai')) as unknown as {
      default: { APIError: new (msg: string, status: number) => Error };
    };
    const APIError = openaiModule.default.APIError;

    mockCreate
      .mockRejectedValueOnce(new APIError('rate limit', 429))
      .mockResolvedValueOnce({ choices: [{ message: { content: 'retry success' } }] });

    const adapter = new OpenAIAdapter('test-key');
    const promise = adapter.call('prompt', { name: 'gpt-4o-mini' });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('retry success');
    expect(mockCreate).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  // call() — 400 (non-retryable) はリトライしない
  it('call() does not retry on 400 (non-retryable)', async () => {
    const openaiModule = (await import('openai')) as unknown as {
      default: { APIError: new (msg: string, status: number) => Error };
    };
    const APIError = openaiModule.default.APIError;

    mockCreate.mockRejectedValue(new APIError('bad request', 400));
    const adapter = new OpenAIAdapter('test-key');
    const { ExecutorError } = await import('../errors.js');

    await expect(adapter.call('prompt', { name: 'gpt-4o-mini' })).rejects.toBeInstanceOf(
      ExecutorError,
    );
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  // call() — MAX_RETRIES 回失敗後 ExecutorError をスロー
  it('call() throws ExecutorError after exhausting all retries', async () => {
    vi.useFakeTimers();
    const openaiModule = (await import('openai')) as unknown as {
      default: { APIError: new (msg: string, status: number) => Error };
    };
    const APIError = openaiModule.default.APIError;

    mockCreate.mockRejectedValue(new APIError('rate limit', 429));
    const adapter = new OpenAIAdapter('test-key');
    const { ExecutorError } = await import('../errors.js');

    // Attach .catch() immediately to avoid unhandled rejection warning
    let caughtError: unknown;
    const settled = adapter.call('prompt', { name: 'gpt-4o-mini' }).catch((e) => {
      caughtError = e;
    });
    await vi.runAllTimersAsync();
    await settled;

    expect(caughtError).toBeInstanceOf(ExecutorError);
    expect(mockCreate).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  // call() — ECONNRESET でリトライし成功する
  it('call() retries on ECONNRESET and succeeds', async () => {
    vi.useFakeTimers();
    const networkError = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
    mockCreate
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ choices: [{ message: { content: 'network retry ok' } }] });

    const adapter = new OpenAIAdapter('test-key');
    const promise = adapter.call('prompt', { name: 'gpt-4o-mini' });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('network retry ok');
    expect(mockCreate).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  // callStreaming() — chunks が onChunk コールバックで返される
  it('callStreaming() invokes onChunk for each chunk', async () => {
    mockStreaming(['Hello ', 'world!']);
    const adapter = new OpenAIAdapter('test-key');
    const chunks: string[] = [];
    await adapter.callStreaming('prompt', { name: 'gpt-4o-mini' }, (c) => chunks.push(c));
    expect(chunks).toEqual(['Hello ', 'world!']);
  });

  // callStreaming() — 累積テキストを返す
  it('callStreaming() returns the accumulated full text', async () => {
    mockStreaming(['Hello ', 'world!']);
    const adapter = new OpenAIAdapter('test-key');
    const result = await adapter.callStreaming('prompt', { name: 'gpt-4o-mini' }, () => {});
    expect(result).toBe('Hello world!');
  });

  // call() — timeout_ms を超えた場合 ExecutorError をスロー
  it('call() throws ExecutorError when timeout_ms is exceeded', async () => {
    vi.useFakeTimers();
    mockCreate.mockReturnValue(new Promise(() => {})); // never resolves

    const adapter = new OpenAIAdapter('test-key');
    const { ExecutorError } = await import('../errors.js');

    let caughtError: unknown;
    const settled = adapter
      .call('prompt', { name: 'gpt-4o-mini', timeout_ms: 5000 })
      .catch((e) => { caughtError = e; });
    await vi.advanceTimersByTimeAsync(5001);
    await settled;

    expect(caughtError).toBeInstanceOf(ExecutorError);
    expect((caughtError as Error).message).toContain('timed out');
  });

  // callStreaming() — timeout_ms を超えた場合 ExecutorError をスロー
  it('callStreaming() throws ExecutorError when timeout_ms is exceeded', async () => {
    vi.useFakeTimers();
    async function* neverGen() {
      await new Promise<never>(() => {});
      yield { choices: [{ delta: { content: '' } }] };
    }
    mockCreate.mockResolvedValue(neverGen());

    const adapter = new OpenAIAdapter('test-key');
    const { ExecutorError } = await import('../errors.js');

    let caughtError: unknown;
    const settled = adapter
      .callStreaming('prompt', { name: 'gpt-4o-mini', timeout_ms: 5000 }, () => {})
      .catch((e) => { caughtError = e; });
    await vi.advanceTimersByTimeAsync(5001);
    await settled;

    expect(caughtError).toBeInstanceOf(ExecutorError);
    expect((caughtError as Error).message).toContain('timed out');
  });

  // call() — max_retries を指定した回数でリトライを止める
  it('call() respects custom max_retries', async () => {
    vi.useFakeTimers();
    const openaiModule = (await import('openai')) as unknown as {
      default: { APIError: new (msg: string, status: number) => Error };
    };
    const APIError = openaiModule.default.APIError;

    mockCreate.mockRejectedValue(new APIError('rate limit', 429));
    const adapter = new OpenAIAdapter('test-key');
    const { ExecutorError } = await import('../errors.js');

    let caughtError: unknown;
    const settled = adapter
      .call('prompt', { name: 'gpt-4o-mini', max_retries: 1 })
      .catch((e) => { caughtError = e; });
    await vi.runAllTimersAsync();
    await settled;

    expect(caughtError).toBeInstanceOf(ExecutorError);
    expect(mockCreate).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
  });

  // callStreaming() — max_retries を指定した回数でリトライを止める
  it('callStreaming() respects custom max_retries', async () => {
    vi.useFakeTimers();
    const openaiModule = (await import('openai')) as unknown as {
      default: { APIError: new (msg: string, status: number) => Error };
    };
    const APIError = openaiModule.default.APIError;

    mockCreate.mockRejectedValue(new APIError('rate limit', 429));
    const adapter = new OpenAIAdapter('test-key');
    const { ExecutorError } = await import('../errors.js');

    let caughtError: unknown;
    const settled = adapter
      .callStreaming('prompt', { name: 'gpt-4o-mini', max_retries: 1 }, () => {})
      .catch((e) => { caughtError = e; });
    await vi.runAllTimersAsync();
    await settled;

    expect(caughtError).toBeInstanceOf(ExecutorError);
    expect(mockCreate).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
  });

  // call() — max_retries: 0 は即座に失敗（リトライなし）
  it('call() makes exactly 1 attempt when max_retries is 0', async () => {
    const openaiModule = (await import('openai')) as unknown as {
      default: { APIError: new (msg: string, status: number) => Error };
    };
    const APIError = openaiModule.default.APIError;

    mockCreate.mockRejectedValue(new APIError('rate limit', 429));
    const adapter = new OpenAIAdapter('test-key');
    const { ExecutorError } = await import('../errors.js');

    await expect(
      adapter.call('prompt', { name: 'gpt-4o-mini', max_retries: 0 }),
    ).rejects.toBeInstanceOf(ExecutorError);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  // call() — タイムアウトはリトライされない（mockCreate は1回だけ呼ばれる）
  it('call() does not retry when timeout_ms is exceeded', async () => {
    vi.useFakeTimers();
    mockCreate.mockReturnValue(new Promise(() => {})); // never resolves

    const adapter = new OpenAIAdapter('test-key');
    const { ExecutorError } = await import('../errors.js');

    let caughtError: unknown;
    const settled = adapter
      .call('prompt', { name: 'gpt-4o-mini', timeout_ms: 5000 })
      .catch((e) => { caughtError = e; });
    await vi.advanceTimersByTimeAsync(5001);
    await settled;

    expect(caughtError).toBeInstanceOf(ExecutorError);
    expect(mockCreate).toHaveBeenCalledTimes(1); // no retry on timeout
  });
});
