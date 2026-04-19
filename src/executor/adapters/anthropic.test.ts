import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn();

  class FakeAPIError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'APIError';
      this.status = status;
    }
  }

  const Anthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
    },
  }));
  (Anthropic as unknown as Record<string, unknown>)['APIError'] = FakeAPIError;

  return { default: Anthropic, __mockCreate: mockCreate };
});

describe('AnthropicAdapter', () => {
  let mockCreate: ReturnType<typeof vi.fn>;
  let AnthropicAdapter: new (apiKey: string) => import('./anthropic.js').AnthropicAdapter;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const anthropicModule = (await import('@anthropic-ai/sdk')) as unknown as {
      __mockCreate: ReturnType<typeof vi.fn>;
    };
    mockCreate = anthropicModule.__mockCreate;
    ({ AnthropicAdapter } = await import('./anthropic.js'));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  function mockNonStreaming(content: string) {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: content }],
    });
  }

  async function* makeStreamEvents(chunks: string[]) {
    for (const chunk of chunks) {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: chunk } };
    }
    yield { type: 'message_stop' };
  }

  function mockStreaming(chunks: string[]) {
    mockCreate.mockResolvedValue(makeStreamEvents(chunks));
  }

  // call() — 正常系
  it('call() returns the response text', async () => {
    mockNonStreaming('Hello, Claude!');
    const adapter = new AnthropicAdapter('test-key');
    const result = await adapter.call('Say hello', { name: 'claude-3-5-haiku-20241022' });
    expect(result).toBe('Hello, Claude!');
  });

  // call() — temperature, max_tokens が API に渡される
  it('call() forwards temperature and max_tokens to the API', async () => {
    mockNonStreaming('result');
    const adapter = new AnthropicAdapter('test-key');
    await adapter.call('prompt', { name: 'claude-3-5-haiku-20241022', temperature: 0.7, max_tokens: 256 });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.7, max_tokens: 256 }),
    );
  });

  // call() — 429 でリトライし成功する
  it('call() retries on 429 and succeeds', async () => {
    vi.useFakeTimers();
    const anthropicModule = (await import('@anthropic-ai/sdk')) as unknown as {
      default: { APIError: new (msg: string, status: number) => Error };
    };
    const APIError = anthropicModule.default.APIError;

    mockCreate
      .mockRejectedValueOnce(new APIError('rate limit', 429))
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'retry success' }] });

    const adapter = new AnthropicAdapter('test-key');
    const promise = adapter.call('prompt', { name: 'claude-3-5-haiku-20241022' });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('retry success');
    expect(mockCreate).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  // call() — MAX_RETRIES 回失敗後 ExecutorError をスロー
  it('call() throws ExecutorError after exhausting all retries', async () => {
    vi.useFakeTimers();
    const anthropicModule = (await import('@anthropic-ai/sdk')) as unknown as {
      default: { APIError: new (msg: string, status: number) => Error };
    };
    const APIError = anthropicModule.default.APIError;

    mockCreate.mockRejectedValue(new APIError('rate limit', 429));
    const adapter = new AnthropicAdapter('test-key');
    const { ExecutorError } = await import('../errors.js');

    let caughtError: unknown;
    const settled = adapter.call('prompt', { name: 'claude-3-5-haiku-20241022' }).catch((e) => {
      caughtError = e;
    });
    await vi.runAllTimersAsync();
    await settled;

    expect(caughtError).toBeInstanceOf(ExecutorError);
    expect(mockCreate).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  // call() — 400 (non-retryable) はリトライしない
  it('call() does not retry on 400 (non-retryable)', async () => {
    const anthropicModule = (await import('@anthropic-ai/sdk')) as unknown as {
      default: { APIError: new (msg: string, status: number) => Error };
    };
    const APIError = anthropicModule.default.APIError;

    mockCreate.mockRejectedValue(new APIError('bad request', 400));
    const adapter = new AnthropicAdapter('test-key');
    const { ExecutorError } = await import('../errors.js');

    await expect(adapter.call('prompt', { name: 'claude-3-5-haiku-20241022' })).rejects.toBeInstanceOf(
      ExecutorError,
    );
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  // call() — ECONNRESET でリトライし成功する
  it('call() retries on ECONNRESET and succeeds', async () => {
    vi.useFakeTimers();
    const networkError = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
    mockCreate
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'network retry ok' }] });

    const adapter = new AnthropicAdapter('test-key');
    const promise = adapter.call('prompt', { name: 'claude-3-5-haiku-20241022' });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('network retry ok');
    expect(mockCreate).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  // callStreaming() — chunks が onChunk コールバックで返される
  it('callStreaming() invokes onChunk for each text delta', async () => {
    mockStreaming(['Hello ', 'Claude!']);
    const adapter = new AnthropicAdapter('test-key');
    const chunks: string[] = [];
    await adapter.callStreaming('prompt', { name: 'claude-3-5-haiku-20241022' }, (c) => chunks.push(c));
    expect(chunks).toEqual(['Hello ', 'Claude!']);
  });

  // callStreaming() — 累積テキストを返す
  it('callStreaming() returns the accumulated full text', async () => {
    mockStreaming(['Hello ', 'Claude!']);
    const adapter = new AnthropicAdapter('test-key');
    const result = await adapter.callStreaming('prompt', { name: 'claude-3-5-haiku-20241022' }, () => {});
    expect(result).toBe('Hello Claude!');
  });

  // callStreaming() — 429 でリトライし成功する
  it('callStreaming() retries on 429 and succeeds', async () => {
    vi.useFakeTimers();
    const anthropicModule = (await import('@anthropic-ai/sdk')) as unknown as {
      default: { APIError: new (msg: string, status: number) => Error };
    };
    const APIError = anthropicModule.default.APIError;

    mockCreate
      .mockRejectedValueOnce(new APIError('rate limit', 429))
      .mockResolvedValueOnce(makeStreamEvents(['retry ok']));

    const adapter = new AnthropicAdapter('test-key');
    const chunks: string[] = [];
    const promise = adapter.callStreaming('prompt', { name: 'claude-3-5-sonnet-20241022' }, (c) => chunks.push(c));
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('retry ok');
    expect(chunks).toEqual(['retry ok']);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  // callStreaming() — MAX_RETRIES 回失敗後 ExecutorError をスロー
  it('callStreaming() throws ExecutorError after exhausting all retries', async () => {
    vi.useFakeTimers();
    const anthropicModule = (await import('@anthropic-ai/sdk')) as unknown as {
      default: { APIError: new (msg: string, status: number) => Error };
    };
    const APIError = anthropicModule.default.APIError;

    mockCreate.mockRejectedValue(new APIError('rate limit', 429));
    const adapter = new AnthropicAdapter('test-key');
    const { ExecutorError } = await import('../errors.js');

    let caughtError: unknown;
    const settled = adapter.callStreaming('prompt', { name: 'claude-3-5-sonnet-20241022' }, () => {}).catch((e) => {
      caughtError = e;
    });
    await vi.runAllTimersAsync();
    await settled;

    expect(caughtError).toBeInstanceOf(ExecutorError);
    expect(mockCreate).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    vi.useRealTimers();
  });
});
