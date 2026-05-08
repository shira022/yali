import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ValidatedCommand } from '../types/index.js';
import { ExecutorError } from './errors.js';

// ---------------------------------------------------------------------------
// Mock the openai module before importing the executor
// ---------------------------------------------------------------------------
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

  // Attach static APIError so the executor's `instanceof OpenAI.APIError` works
  (OpenAI as unknown as Record<string, unknown>)['APIError'] = FakeAPIError;

  return { default: OpenAI, __mockCreate: mockCreate };
});

// Mock api-key-resolver so tests don't depend on config file existence
vi.mock('./api-key-resolver.js', () => ({
  resolveApiKey: vi.fn().mockReturnValue('test-key'),
}));

// ---------------------------------------------------------------------------
// Helper: build a minimal ValidatedCommand
// ---------------------------------------------------------------------------
function makeCommand(overrides: Partial<ValidatedCommand> = {}): ValidatedCommand {
  return {
    steps: [
      {
        id: 'step1',
        prompt: 'Say hello to {{input}}',
        model: { name: 'gpt-4o-mini' },
        depends_on: [],
      },
    ],
    input_spec: { from: 'args', var: 'input' },
    output_spec: { format: 'text', target: 'stdout' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('execute()', () => {
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();

    // Re-import after reset to pick up the mock
    const openaiModule = await import('openai') as unknown as { __mockCreate: ReturnType<typeof vi.fn> };
    mockCreate = openaiModule.__mockCreate;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper: makes mockCreate return a non-streaming response
  function mockNonStreaming(content: string) {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content } }],
    });
  }

  // Helper: makes mockCreate return an async iterable (streaming)
  function mockStreaming(chunks: string[]) {
    async function* gen() {
      for (const chunk of chunks) {
        yield { choices: [{ delta: { content: chunk } }] };
      }
    }
    mockCreate.mockResolvedValue(gen());
  }

  // ---------------------------------------------------------------------------
  // Missing API key
  // ---------------------------------------------------------------------------
  it('returns exitCode 1 when API key is not configured', async () => {
    const { resolveApiKey } = await import('./api-key-resolver.js') as { resolveApiKey: ReturnType<typeof vi.fn> };
    resolveApiKey.mockImplementationOnce(() => {
      throw new ExecutorError('OpenAI API key is not configured.\nRun: yali config set openai.api_key <YOUR_API_KEY>');
    });
    const { execute } = await import('./index.js');
    const result = await execute(makeCommand(), { input: 'world' });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('yali config set openai.api_key');
  });

  // ---------------------------------------------------------------------------
  // Single-step — stdout (streaming)
  // ---------------------------------------------------------------------------
  it('executes a single step and returns its output (streaming)', async () => {
    mockStreaming(['Hello ', 'world!']);
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { execute } = await import('./index.js');
    const result = await execute(makeCommand(), { input: 'world' });

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('Hello world!');
    expect(writeSpy).toHaveBeenCalledWith('Hello ');
    expect(writeSpy).toHaveBeenCalledWith('world!');
    writeSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Single-step — file target (buffered)
  // ---------------------------------------------------------------------------
  it('writes to a file when target is "file"', async () => {
    mockNonStreaming('buffered content');
    const writeFileMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock('node:fs/promises', () => ({ writeFile: writeFileMock }));

    const { execute } = await import('./index.js');
    const command = makeCommand({
      output_spec: { format: 'text', target: 'file', path: './out.txt' },
    });
    const result = await execute(command, { input: 'world' });

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('buffered content');
    expect(writeFileMock).toHaveBeenCalledWith('./out.txt', 'buffered content', 'utf-8');
  });

  // ---------------------------------------------------------------------------
  // Multi-step with dependency
  // ---------------------------------------------------------------------------
  it('executes multi-step commands in dependency order and passes inter-step output', async () => {
    mockCreate
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Summary text' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: '翻訳テキスト' } }] });

    const command: ValidatedCommand = {
      steps: [
        {
          id: 'summarize',
          prompt: 'Summarize: {{input}}',
          model: { name: 'gpt-4o-mini' },
          depends_on: [],
        },
        {
          id: 'translate',
          prompt: 'Translate to Japanese: {{steps.summarize.output}}',
          model: { name: 'gpt-4o' },
          depends_on: ['summarize'],
        },
      ],
      input_spec: { from: 'stdin', var: 'input' },
      output_spec: { format: 'text', target: 'file', path: './result.txt' },
    };

    vi.doMock('node:fs/promises', () => ({ writeFile: vi.fn().mockResolvedValue(undefined) }));

    const { execute } = await import('./index.js');
    const result = await execute(command, { input: 'Long article content' });

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('翻訳テキスト');

    // Second call should receive the first step's output as variable
    const secondCallMessages = mockCreate.mock.calls[1]?.[0]?.messages;
    expect(secondCallMessages?.[0]?.content).toContain('Summary text');
  });

  // ---------------------------------------------------------------------------
  // JSON format
  // ---------------------------------------------------------------------------
  it('parses and re-serializes JSON output when format is "json"', async () => {
    mockNonStreaming('{"key": "value", "num": 42}');

    const { execute } = await import('./index.js');
    const command = makeCommand({
      output_spec: { format: 'json', target: 'file', path: './out.json' },
    });
    vi.doMock('node:fs/promises', () => ({ writeFile: vi.fn().mockResolvedValue(undefined) }));

    const result = await execute(command, { input: 'test' });

    expect(result.exitCode).toBe(0);
    const parsed: unknown = JSON.parse(result.output);
    expect(parsed).toEqual({ key: 'value', num: 42 });
  });

  it('returns raw text when JSON format output is not valid JSON', async () => {
    mockNonStreaming('not json at all');

    const { execute } = await import('./index.js');
    const command = makeCommand({
      output_spec: { format: 'json', target: 'file', path: './out.json' },
    });
    vi.doMock('node:fs/promises', () => ({ writeFile: vi.fn().mockResolvedValue(undefined) }));

    const result = await execute(command, { input: 'test' });
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('not json at all');
  });

  it('extracts JSON from markdown code fences', async () => {
    mockNonStreaming('```json\n{"answer": 42}\n```');

    const { execute } = await import('./index.js');
    const command = makeCommand({
      output_spec: { format: 'json', target: 'file', path: './out.json' },
    });
    vi.doMock('node:fs/promises', () => ({ writeFile: vi.fn().mockResolvedValue(undefined) }));

    const result = await execute(command, { input: 'test' });
    expect(result.exitCode).toBe(0);
    const parsed: unknown = JSON.parse(result.output);
    expect(parsed).toEqual({ answer: 42 });
  });

  // ---------------------------------------------------------------------------
  // Markdown format (passthrough)
  // ---------------------------------------------------------------------------
  it('passes markdown output through unchanged', async () => {
    const markdownContent = '# Heading\n\n- item 1\n- item 2\n';
    mockNonStreaming(markdownContent);

    const { execute } = await import('./index.js');
    const command = makeCommand({
      output_spec: { format: 'markdown', target: 'file', path: './out.md' },
    });
    vi.doMock('node:fs/promises', () => ({ writeFile: vi.fn().mockResolvedValue(undefined) }));

    const result = await execute(command, { input: 'test' });
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(markdownContent);
  });

  // ---------------------------------------------------------------------------
  // JSON format + stdout: buffer then write formatted (no raw streaming)
  // ---------------------------------------------------------------------------
  it('buffers and formats JSON output before writing to stdout (no raw chunk streaming)', async () => {
    mockNonStreaming('{"key":"value"}');
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { execute } = await import('./index.js');
    const command = makeCommand({
      output_spec: { format: 'json', target: 'stdout' },
    });

    const result = await execute(command, { input: 'test' });

    expect(result.exitCode).toBe(0);
    // Should write the formatted JSON (not raw chunks)
    const written = writeSpy.mock.calls.map((c) => c[0]).join('');
    const parsed: unknown = JSON.parse(written.trim());
    expect(parsed).toEqual({ key: 'value' });
    writeSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Retry logic
  // ---------------------------------------------------------------------------
  it('retries on 429 and succeeds on the next attempt', async () => {
    vi.useFakeTimers();

    const openaiModule = await import('openai') as unknown as {
      default: { APIError: new (msg: string, status: number) => Error };
    };
    const APIError = openaiModule.default.APIError;

    mockCreate
      .mockRejectedValueOnce(new APIError('rate limit', 429))
      .mockResolvedValueOnce({ choices: [{ message: { content: 'retry success' } }] });

    const { execute } = await import('./index.js');
    const command = makeCommand({
      output_spec: { format: 'text', target: 'file', path: './out.txt' },
    });
    vi.doMock('node:fs/promises', () => ({ writeFile: vi.fn().mockResolvedValue(undefined) }));

    const promise = execute(command, { input: 'test' });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('retry success');
    expect(mockCreate).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('returns exitCode 1 after exhausting all retries', async () => {
    vi.useFakeTimers();

    const openaiModule = await import('openai') as unknown as {
      default: { APIError: new (msg: string, status: number) => Error };
    };
    const APIError = openaiModule.default.APIError;

    mockCreate.mockRejectedValue(new APIError('rate limit', 429));

    const { execute } = await import('./index.js');
    const command = makeCommand({
      output_spec: { format: 'text', target: 'file', path: './out.txt' },
    });
    vi.doMock('node:fs/promises', () => ({ writeFile: vi.fn().mockResolvedValue(undefined) }));

    const promise = execute(command, { input: 'test' });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('retries');
    expect(mockCreate).toHaveBeenCalledTimes(4); // 1 initial + 3 retries

    vi.useRealTimers();
  });

  it('does not retry on a 400 (non-retryable) error', async () => {
    const openaiModule = await import('openai') as unknown as {
      default: { APIError: new (msg: string, status: number) => Error };
    };
    const APIError = openaiModule.default.APIError;

    mockCreate.mockRejectedValue(new APIError('bad request', 400));

    const { execute } = await import('./index.js');
    const command = makeCommand({
      output_spec: { format: 'text', target: 'file', path: './out.txt' },
    });
    vi.doMock('node:fs/promises', () => ({ writeFile: vi.fn().mockResolvedValue(undefined) }));

    const result = await execute(command, { input: 'test' });

    expect(result.exitCode).toBe(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Network-level retries (advisory [3])
  // ---------------------------------------------------------------------------
  it('retries on network errors (ECONNRESET) and succeeds', async () => {
    vi.useFakeTimers();

    const networkError = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
    mockCreate
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ choices: [{ message: { content: 'network retry ok' } }] });

    const { execute } = await import('./index.js');
    const command = makeCommand({
      output_spec: { format: 'text', target: 'file', path: './out.txt' },
    });
    vi.doMock('node:fs/promises', () => ({ writeFile: vi.fn().mockResolvedValue(undefined) }));

    const promise = execute(command, { input: 'test' });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('network retry ok');
    expect(mockCreate).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Model parameters forwarded to API (advisory [4])
  // ---------------------------------------------------------------------------
  it('forwards temperature and max_tokens to the API', async () => {
    mockNonStreaming('result');

    const { execute } = await import('./index.js');
    const command: ValidatedCommand = {
      steps: [
        {
          id: 'step1',
          prompt: 'Hello {{input}}',
          model: { name: 'gpt-4o', temperature: 0.2, max_tokens: 512 },
          depends_on: [],
        },
      ],
      input_spec: { from: 'args', var: 'input' },
      output_spec: { format: 'text', target: 'file', path: './out.txt' },
    };
    vi.doMock('node:fs/promises', () => ({ writeFile: vi.fn().mockResolvedValue(undefined) }));

    await execute(command, { input: 'test' });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.2, max_tokens: 512 }),
    );
  });

  // ---------------------------------------------------------------------------
  // ExecutorError.cause property (advisory [5])
  // ---------------------------------------------------------------------------
  it('ExecutorError stores the cause property', async () => {
    const { ExecutorError } = await import('./errors.js');
    const cause = new Error('root cause');
    const err = new ExecutorError('wrapper message', cause);
    expect(err.message).toBe('wrapper message');
    expect(err.cause).toBe(cause);
    expect(err.name).toBe('ExecutorError');
  });

  // ---------------------------------------------------------------------------
  // Missing file path
  // ---------------------------------------------------------------------------
  it('returns exitCode 1 when file target has no path', async () => {
    mockNonStreaming('some output');

    const { execute } = await import('./index.js');
    const command: ValidatedCommand = {
      steps: [
        {
          id: 'step1',
          prompt: 'Hello {{input}}',
          model: { name: 'gpt-4o-mini' },
          depends_on: [],
        },
      ],
      input_spec: { from: 'args', var: 'input' },
      output_spec: { format: 'text', target: 'file' }, // path intentionally omitted
    };

    const result = await execute(command, { input: 'test' });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('path');
  });

  // ---------------------------------------------------------------------------
  // Multi-step streaming: only the final step streams to stdout
  // ---------------------------------------------------------------------------
  it('only the final step uses streaming; intermediate steps are buffered', async () => {
    // Step 1: buffered (non-streaming) response
    // Step 2: streaming response (final step)
    mockCreate
      .mockResolvedValueOnce({ choices: [{ message: { content: 'intermediate output' } }] })
      .mockImplementationOnce(async () => {
        async function* gen() {
          yield { choices: [{ delta: { content: 'final ' } }] };
          yield { choices: [{ delta: { content: 'output' } }] };
        }
        return gen();
      });

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { execute } = await import('./index.js');
    const command: ValidatedCommand = {
      steps: [
        {
          id: 'step1',
          prompt: 'Summarize: {{input}}',
          model: { name: 'gpt-4o-mini' },
          depends_on: [],
        },
        {
          id: 'step2',
          prompt: 'Translate: {{steps.step1.output}}',
          model: { name: 'gpt-4o' },
          depends_on: ['step1'],
        },
      ],
      input_spec: { from: 'args', var: 'input' },
      output_spec: { format: 'text', target: 'stdout' },
    };

    const result = await execute(command, { input: 'some long text' });

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('final output');

    // First call must be non-streaming (stream: false or absent)
    const firstCallArgs = mockCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstCallArgs?.['stream']).toBeFalsy();

    // Second call (final step) must be streaming
    const secondCallArgs = mockCreate.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(secondCallArgs?.['stream']).toBe(true);

    // stdout should receive the streamed chunks from the final step
    expect(writeSpy).toHaveBeenCalledWith('final ');
    expect(writeSpy).toHaveBeenCalledWith('output');

    writeSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Validation: invalid rendered prompt caught before LLM call
  // ---------------------------------------------------------------------------
  it('returns exitCode 1 when a variable value causes the rendered prompt to contain a NUL byte', async () => {
    // The prompt template itself is clean; the injected variable value contains a NUL byte.
    // renderStep expands the template, then validatePromptContent rejects the result.
    const command = makeCommand({
      steps: [
        {
          id: 'step1',
          prompt: 'Translate: {{input}}',
          model: { name: 'gpt-4o-mini' },
          depends_on: [],
        },
      ],
    });

    const { execute } = await import('./index.js');
    const result = await execute(command, { input: 'hello\x00world' });

    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/NUL bytes/);
    // The LLM adapter must NOT have been called
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns exitCode 1 when a variable value causes the rendered prompt to contain a forbidden control character', async () => {
    const command = makeCommand({
      steps: [
        {
          id: 'step1',
          prompt: 'Summarize: {{input}}',
          model: { name: 'gpt-4o-mini' },
          depends_on: [],
        },
      ],
    });

    const { execute } = await import('./index.js');
    const result = await execute(command, { input: 'data\x1binjected' });

    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/control characters/);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
