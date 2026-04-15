import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExecutionResult } from '../types/index.js';
import type { RenderedStep } from '../renderer/index.js';

// ── Module mocks (hoisted before imports) ─────────────────────────────────
vi.mock('../parser/index.js', () => ({
  parseCommand: vi.fn(),
}));
vi.mock('../executor/index.js', () => ({
  execute: vi.fn(),
}));
vi.mock('../renderer/index.js', () => ({
  orderSteps: vi.fn(),
  renderStep: vi.fn(),
}));
vi.mock('./input-resolver.js', () => ({
  resolveInput: vi.fn(),
  InputResolverError: class InputResolverError extends Error {},
}));
vi.mock('./dry-run-formatter.js', () => ({
  formatDryRun: vi.fn(),
}));

import { parseCommand } from '../parser/index.js';
import { execute } from '../executor/index.js';
import { orderSteps, renderStep } from '../renderer/index.js';
import { resolveInput } from './input-resolver.js';
import { formatDryRun } from './dry-run-formatter.js';
import { main } from '../cli.js';

const mockedParseCommand = vi.mocked(parseCommand);
const mockedExecute = vi.mocked(execute);
const mockedOrderSteps = vi.mocked(orderSteps);
const mockedRenderStep = vi.mocked(renderStep);
const mockedResolveInput = vi.mocked(resolveInput);
const mockedFormatDryRun = vi.mocked(formatDryRun);

const MOCK_COMMAND = {
  steps: [{ id: 'step1', prompt: '{{input}}', model: { name: 'gpt-4o' }, depends_on: [] }],
  input_spec: { from: 'args' as const, var: 'input' },
  output_spec: { format: 'text' as const, target: 'stdout' as const },
};

const MOCK_RENDERED_STEP: RenderedStep = {
  id: 'step1',
  prompt: 'Hello, world',
  model: { name: 'gpt-4o' },
  depends_on: [],
};

describe('CLI Layer', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: any;
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: any) => {
      throw new Error(`process.exit(${_code})`);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((() => true) as any);

    // Default happy-path mocks
    mockedParseCommand.mockReturnValue(MOCK_COMMAND as ReturnType<typeof parseCommand>);
    mockedResolveInput.mockResolvedValue({ input: 'Hello, world' });
    mockedExecute.mockResolvedValue({ exitCode: 0, output: 'result' } satisfies ExecutionResult);
    mockedOrderSteps.mockReturnValue(MOCK_COMMAND.steps);
    mockedRenderStep.mockReturnValue(MOCK_RENDERED_STEP);
    mockedFormatDryRun.mockReturnValue('=== Step: step1 ===\nHello, world');

    // Simulate TTY (no piped stdin) by default
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
  });

  it('exits 1 and prints usage when subcommand is missing', async () => {
    process.argv = ['node', 'cli.js'];
    await expect(main()).rejects.toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits 1 and prints usage when yaml file is missing', async () => {
    process.argv = ['node', 'cli.js', 'run'];
    await expect(main()).rejects.toThrow('process.exit(1)');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits 0 on successful execution', async () => {
    process.argv = ['node', 'cli.js', 'run', 'cmd.yaml'];
    mockedExecute.mockResolvedValue({ exitCode: 0, output: 'ok' });
    await expect(main()).rejects.toThrow('process.exit(0)');
    expect(mockedExecute).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits 1 and prints to stderr on executor failure', async () => {
    process.argv = ['node', 'cli.js', 'run', 'cmd.yaml'];
    mockedExecute.mockResolvedValue({ exitCode: 1, output: 'LLM error' });
    await expect(main()).rejects.toThrow('process.exit(1)');
    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(stderrOutput).toContain('LLM error');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('does NOT call execute when --dry-run is passed', async () => {
    process.argv = ['node', 'cli.js', 'run', 'cmd.yaml', '--dry-run'];
    await expect(main()).rejects.toThrow('process.exit(0)');
    expect(mockedExecute).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('--dry-run outputs plain text by default', async () => {
    process.argv = ['node', 'cli.js', 'run', 'cmd.yaml', '--dry-run'];
    mockedFormatDryRun.mockReturnValue('=== Step: step1 ===\nHello');
    await expect(main()).rejects.toThrow('process.exit(0)');
    expect(mockedFormatDryRun).toHaveBeenCalledWith(expect.any(Array), 'text');
  });

  it('--dry-run --format=json outputs JSON', async () => {
    process.argv = ['node', 'cli.js', 'run', 'cmd.yaml', '--dry-run', '--format', 'json'];
    mockedFormatDryRun.mockReturnValue('{"steps":[]}');
    await expect(main()).rejects.toThrow('process.exit(0)');
    expect(mockedFormatDryRun).toHaveBeenCalledWith(expect.any(Array), 'json');
  });

  it('detects piped stdin (hasStdin=true) when isTTY is false', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    process.argv = ['node', 'cli.js', 'run', 'cmd.yaml'];
    await expect(main()).rejects.toThrow('process.exit(0)');
    expect(mockedResolveInput).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ hasStdin: true }),
    );
  });

  it('exits 0 and prints usage when --help is passed', async () => {
    process.argv = ['node', 'cli.js', '--help'];
    await expect(main()).rejects.toThrow('process.exit(0)');
    expect(exitSpy).toHaveBeenCalledWith(0);
    const stdoutOutput = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(stdoutOutput).toContain('Usage: yali run');
  });

  it('exits 1 and prints to stderr when parseCommand throws', async () => {
    process.argv = ['node', 'cli.js', 'run', 'bad.yaml'];
    mockedParseCommand.mockImplementation(() => { throw new Error('YAML syntax error'); });
    await expect(main()).rejects.toThrow('process.exit(1)');
    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(stderrOutput).toContain('YAML syntax error');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits 1 when resolveInput throws InputResolverError', async () => {
    process.argv = ['node', 'cli.js', 'run', 'cmd.yaml'];
    const { InputResolverError: IRError } = await import('./input-resolver.js');
    mockedResolveInput.mockRejectedValue(new IRError('bad --var format'));
    await expect(main()).rejects.toThrow('process.exit(1)');
    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(stderrOutput).toContain('bad --var format');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
