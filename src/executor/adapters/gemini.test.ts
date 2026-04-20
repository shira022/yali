import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGenerateContent = vi.fn();
const mockGenerateContentStream = vi.fn();

vi.mock('@google/generative-ai', () => {
  const GoogleGenerativeAI = vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: mockGenerateContent,
      generateContentStream: mockGenerateContentStream,
    }),
  }));
  return { GoogleGenerativeAI };
});

describe('GeminiAdapter', () => {
  let GeminiAdapter: new (apiKey: string) => import('./gemini.js').GeminiAdapter;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    ({ GeminiAdapter } = await import('./gemini.js'));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  function mockNonStreaming(text: string) {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => text },
    });
  }

  async function* makeStreamChunks(texts: string[]) {
    for (const t of texts) {
      yield { text: () => t };
    }
  }

  function mockStreaming(texts: string[]) {
    mockGenerateContentStream.mockResolvedValue({
      stream: makeStreamChunks(texts),
    });
  }

  // call() — 正常系
  it('call() returns the response text', async () => {
    mockNonStreaming('Hello, world!');
    const adapter = new GeminiAdapter('test-key');
    const result = await adapter.call('Say hello', { name: 'gemini-pro' });
    expect(result).toBe('Hello, world!');
  });

  // call() — temperature, maxOutputTokens が API に渡される
  it('call() forwards temperature and maxOutputTokens to the model config', async () => {
    mockNonStreaming('result');
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const mockGetGenerativeModel = vi.fn().mockReturnValue({
      generateContent: mockGenerateContent,
      generateContentStream: mockGenerateContentStream,
    });
    (GoogleGenerativeAI as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      getGenerativeModel: mockGetGenerativeModel,
    }));

    const adapter = new GeminiAdapter('test-key');
    await adapter.call('prompt', { name: 'gemini-pro', temperature: 0.7, max_tokens: 256 });
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        generationConfig: expect.objectContaining({ temperature: 0.7, maxOutputTokens: 256 }),
      }),
    );
  });

  // call() — 429 でリトライし成功する
  it('call() retries on 429 and succeeds', async () => {
    vi.useFakeTimers();
    const rateLimitError = Object.assign(new Error('rate limit'), { status: 429 });
    mockGenerateContent
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({ response: { text: () => 'retry success' } });

    const adapter = new GeminiAdapter('test-key');
    const promise = adapter.call('prompt', { name: 'gemini-pro' });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('retry success');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  // call() — MAX_RETRIES 回失敗後 ExecutorError をスロー
  it('call() throws ExecutorError after exhausting all retries', async () => {
    vi.useFakeTimers();
    const rateLimitError = Object.assign(new Error('rate limit'), { status: 429 });
    mockGenerateContent.mockRejectedValue(rateLimitError);

    const adapter = new GeminiAdapter('test-key');
    const { ExecutorError } = await import('../errors.js');

    let caughtError: unknown;
    const settled = adapter.call('prompt', { name: 'gemini-pro' }).catch((e) => {
      caughtError = e;
    });
    await vi.runAllTimersAsync();
    await settled;

    expect(caughtError).toBeInstanceOf(ExecutorError);
    expect(mockGenerateContent).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  // call() — 400 (non-retryable) はリトライしない
  it('call() does not retry on 400 (non-retryable)', async () => {
    const badRequestError = Object.assign(new Error('bad request'), { status: 400 });
    mockGenerateContent.mockRejectedValue(badRequestError);

    const adapter = new GeminiAdapter('test-key');
    const { ExecutorError } = await import('../errors.js');

    await expect(adapter.call('prompt', { name: 'gemini-pro' })).rejects.toBeInstanceOf(
      ExecutorError,
    );
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  // call() — ECONNRESET でリトライし成功する
  it('call() retries on ECONNRESET and succeeds', async () => {
    vi.useFakeTimers();
    const networkError = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
    mockGenerateContent
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ response: { text: () => 'network retry ok' } });

    const adapter = new GeminiAdapter('test-key');
    const promise = adapter.call('prompt', { name: 'gemini-pro' });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('network retry ok');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  // callStreaming() — chunks が onChunk コールバックで返される
  it('callStreaming() invokes onChunk for each chunk', async () => {
    mockStreaming(['Hello ', 'world!']);
    const adapter = new GeminiAdapter('test-key');
    const chunks: string[] = [];
    await adapter.callStreaming('prompt', { name: 'gemini-pro' }, (c) => chunks.push(c));
    expect(chunks).toEqual(['Hello ', 'world!']);
  });

  // callStreaming() — 累積テキストを返す
  it('callStreaming() returns the accumulated full text', async () => {
    mockStreaming(['Hello ', 'world!']);
    const adapter = new GeminiAdapter('test-key');
    const result = await adapter.callStreaming('prompt', { name: 'gemini-pro' }, () => {});
    expect(result).toBe('Hello world!');
  });

  // call() — 500 でリトライし成功する
  it('call() retries on 500 (server error) and succeeds', async () => {
    vi.useFakeTimers();
    const serverError = Object.assign(new Error('internal server error'), { status: 500 });
    mockGenerateContent
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce({ response: { text: () => 'recovered' } });

    const adapter = new GeminiAdapter('test-key');
    const promise = adapter.call('prompt', { name: 'gemini-1.5-flash' });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('recovered');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  // callStreaming() — 429 でリトライし成功する
  it('callStreaming() retries on 429 and succeeds', async () => {
    vi.useFakeTimers();
    const rateLimitError = Object.assign(new Error('rate limit'), { status: 429 });

    async function* successStream() {
      yield { text: () => 'streamed ok' };
    }

    mockGenerateContentStream
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({ stream: successStream() });

    const adapter = new GeminiAdapter('test-key');
    const chunks: string[] = [];
    const promise = adapter.callStreaming('prompt', { name: 'gemini-1.5-flash' }, (c) => chunks.push(c));
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('streamed ok');
    expect(chunks).toEqual(['streamed ok']);
    expect(mockGenerateContentStream).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  // callStreaming() — MAX_RETRIES 回失敗後 ExecutorError をスロー
  it('callStreaming() throws ExecutorError after exhausting all retries', async () => {
    vi.useFakeTimers();
    const rateLimitError = Object.assign(new Error('rate limit'), { status: 429 });
    mockGenerateContentStream.mockRejectedValue(rateLimitError);

    const adapter = new GeminiAdapter('test-key');
    const { ExecutorError } = await import('../errors.js');

    let caughtError: unknown;
    const settled = adapter.callStreaming('prompt', { name: 'gemini-1.5-flash' }, () => {}).catch((e) => {
      caughtError = e;
    });
    await vi.runAllTimersAsync();
    await settled;

    expect(caughtError).toBeInstanceOf(ExecutorError);
    expect(mockGenerateContentStream).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    vi.useRealTimers();
  });

  // call() — timeout_ms を超えた場合 ExecutorError をスロー
  it('call() throws ExecutorError when timeout_ms is exceeded', async () => {
    vi.useFakeTimers();
    mockGenerateContent.mockReturnValue(new Promise(() => {})); // never resolves

    const adapter = new GeminiAdapter('test-key');
    const { ExecutorError } = await import('../errors.js');

    let caughtError: unknown;
    const settled = adapter
      .call('prompt', { name: 'gemini-1.5-flash', timeout_ms: 5000 })
      .catch((e) => { caughtError = e; });
    await vi.advanceTimersByTimeAsync(5001);
    await settled;

    expect(caughtError).toBeInstanceOf(ExecutorError);
    expect((caughtError as Error).message).toContain('timed out');
  });

  // callStreaming() — timeout_ms を超えた場合 ExecutorError をスロー
  it('callStreaming() throws ExecutorError when timeout_ms is exceeded', async () => {
    vi.useFakeTimers();
    async function* neverStream() {
      await new Promise<never>(() => {});
      yield { text: () => '' };
    }
    mockGenerateContentStream.mockResolvedValue({ stream: neverStream() });

    const adapter = new GeminiAdapter('test-key');
    const { ExecutorError } = await import('../errors.js');

    let caughtError: unknown;
    const settled = adapter
      .callStreaming('prompt', { name: 'gemini-1.5-flash', timeout_ms: 5000 }, () => {})
      .catch((e) => { caughtError = e; });
    await vi.advanceTimersByTimeAsync(5001);
    await settled;

    expect(caughtError).toBeInstanceOf(ExecutorError);
    expect((caughtError as Error).message).toContain('timed out');
  });

  // call() — max_retries を指定した回数でリトライを止める
  it('call() respects custom max_retries', async () => {
    vi.useFakeTimers();
    const rateLimitError = Object.assign(new Error('rate limit'), { status: 429 });
    mockGenerateContent.mockRejectedValue(rateLimitError);

    const adapter = new GeminiAdapter('test-key');
    const { ExecutorError } = await import('../errors.js');

    let caughtError: unknown;
    const settled = adapter
      .call('prompt', { name: 'gemini-1.5-flash', max_retries: 1 })
      .catch((e) => { caughtError = e; });
    await vi.runAllTimersAsync();
    await settled;

    expect(caughtError).toBeInstanceOf(ExecutorError);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
  });
});
