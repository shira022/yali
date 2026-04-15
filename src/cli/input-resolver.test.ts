import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import { resolveInput, InputResolverError } from './input-resolver.js';
import type { ValidatedCommand } from '../types/index.js';

// Hoist node:fs mock so vi.mocked(readFileSync) works in ESM
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

import { readFileSync } from 'node:fs';
const mockedReadFileSync = vi.mocked(readFileSync);

// Minimal ValidatedCommand fixture
function makeCommand(overrides: Partial<ValidatedCommand['input_spec']> = {}): ValidatedCommand {
  return {
    steps: [
      { id: 'step1', prompt: '{{input}}', model: { name: 'gpt-4o' }, depends_on: [] },
    ],
    input_spec: {
      from: 'args',
      var: 'input',
      ...overrides,
    },
    output_spec: { format: 'text', target: 'stdout' },
  };
}

function makeReadable(text: string): NodeJS.ReadableStream {
  return Readable.from([text]);
}

describe('resolveInput — Input Resolution Order', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── Priority 4: YAML default ───────────────────────────────────────────

  it('Priority 4: uses YAML default when nothing else is provided (args source)', async () => {
    const command = makeCommand({ from: 'args', default: 'default-value' });
    const result = await resolveInput(command, { vars: [], hasStdin: false });
    expect(result).toEqual({ input: 'default-value' });
  });

  it('Priority 4: uses YAML default when stdin is not piped (stdin source)', async () => {
    const command = makeCommand({ from: 'stdin', default: 'default-value' });
    const result = await resolveInput(command, { vars: [], hasStdin: false });
    expect(result).toEqual({ input: 'default-value' });
  });

  // ── Primary source gated by input.from ────────────────────────────────

  it('from=stdin: reads piped stdin and maps to input var', async () => {
    const command = makeCommand({ from: 'stdin' });
    const result = await resolveInput(command, {
      vars: [],
      hasStdin: true,
      stdin: makeReadable('hello from stdin'),
    });
    expect(result).toEqual({ input: 'hello from stdin' });
  });

  it('from=stdin: stdin overrides YAML default', async () => {
    const command = makeCommand({ from: 'stdin', default: 'default-value' });
    const result = await resolveInput(command, {
      vars: [],
      hasStdin: true,
      stdin: makeReadable('from-stdin'),
    });
    expect(result['input']).toBe('from-stdin');
  });

  it('from=stdin: --input arg is ignored when stdin IS piped (stdin takes priority)', async () => {
    const command = makeCommand({ from: 'stdin' });
    const result = await resolveInput(command, {
      vars: [],
      inputArg: 'should-be-ignored',
      hasStdin: true,
      stdin: makeReadable('from-stdin'),
    });
    expect(result['input']).toBe('from-stdin');
  });

  it('from=stdin: --input used as fallback when no stdin pipe is available', async () => {
    const command = makeCommand({ from: 'stdin' });
    const result = await resolveInput(command, {
      vars: [],
      inputArg: 'fallback-value',
      hasStdin: false,
    });
    expect(result['input']).toBe('fallback-value');
  });

  it('from=args: --input value is used directly', async () => {
    const command = makeCommand({ from: 'args' });
    const result = await resolveInput(command, {
      vars: [],
      inputArg: 'hello',
      hasStdin: false,
    });
    expect(result['input']).toBe('hello');
  });

  it('from=args: stdin is not consumed even when piped', async () => {
    const command = makeCommand({ from: 'args' });
    const result = await resolveInput(command, {
      vars: [],
      inputArg: 'from-arg',
      hasStdin: true,
      stdin: makeReadable('should-be-ignored'),
    });
    expect(result['input']).toBe('from-arg');
  });

  it('from=file: reads file at path given by --input', async () => {
    mockedReadFileSync.mockReturnValue('file-content' as unknown as ReturnType<typeof readFileSync>);
    const command = makeCommand({ from: 'file' });
    const result = await resolveInput(command, {
      vars: [],
      inputArg: './data.txt',
      hasStdin: false,
    });
    expect(result['input']).toBe('file-content');
    expect(mockedReadFileSync).toHaveBeenCalledWith('./data.txt', 'utf-8');
  });

  it('from=file: falls back to input.path from YAML when --input is not provided', async () => {
    mockedReadFileSync.mockReturnValue('yaml-path-content' as unknown as ReturnType<typeof readFileSync>);
    const command = makeCommand({ from: 'file', path: './default.txt' });
    const result = await resolveInput(command, { vars: [], hasStdin: false });
    expect(result['input']).toBe('yaml-path-content');
    expect(mockedReadFileSync).toHaveBeenCalledWith('./default.txt', 'utf-8');
  });

  // ── Priority 1: --var (highest priority) ──────────────────────────────

  it('Priority 1: --var overrides --input arg (args source)', async () => {
    const command = makeCommand({ from: 'args' });
    const result = await resolveInput(command, {
      vars: ['input=from-var'],
      inputArg: 'from-arg',
      hasStdin: false,
    });
    expect(result['input']).toBe('from-var');
  });

  it('Priority 1: --var overrides stdin (stdin source)', async () => {
    const command = makeCommand({ from: 'stdin' });
    const result = await resolveInput(command, {
      vars: ['input=from-var'],
      hasStdin: true,
      stdin: makeReadable('from-stdin'),
    });
    expect(result['input']).toBe('from-var');
  });

  it('Priority 1: multiple --var flags set independent variables', async () => {
    const command = makeCommand({ from: 'args' });
    const result = await resolveInput(command, {
      vars: ['topic=AI', 'lang=Japanese'],
      hasStdin: false,
    });
    expect(result['topic']).toBe('AI');
    expect(result['lang']).toBe('Japanese');
  });

  it('Priority 1: --var with key=value=more preserves the rest of the value', async () => {
    const command = makeCommand({ from: 'args' });
    const result = await resolveInput(command, {
      vars: ['url=https://example.com/path?q=1'],
      hasStdin: false,
    });
    expect(result['url']).toBe('https://example.com/path?q=1');
  });

  // ── Error cases ───────────────────────────────────────────────────────

  it('throws InputResolverError when --var format is invalid (no =)', async () => {
    const command = makeCommand({ from: 'args' });
    await expect(
      resolveInput(command, { vars: ['no-equals-sign'], hasStdin: false }),
    ).rejects.toThrow(InputResolverError);
  });

  it('throws InputResolverError when input file cannot be read', async () => {
    mockedReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT: file not found');
    });
    const command = makeCommand({ from: 'file', path: './missing.txt' });
    await expect(
      resolveInput(command, { vars: [], hasStdin: false }),
    ).rejects.toThrow(InputResolverError);
  });

  it('throws InputResolverError when from=file with no --input and no YAML path', async () => {
    const command = makeCommand({ from: 'file' }); // no path in YAML
    await expect(
      resolveInput(command, { vars: [], hasStdin: false }), // no --input either
    ).rejects.toThrow(InputResolverError);
  });

  // ── Priority 1.5: --input-file ────────────────────────────────────────────

  it('Priority 1.5: --input-file reads file and sets the input variable', async () => {
    mockedReadFileSync.mockReturnValue('file content via --input-file');
    const command = makeCommand({ from: 'args' });
    const result = await resolveInput(command, {
      vars: [],
      inputFileArg: './doc.txt',
      hasStdin: false,
    });
    expect(result['input']).toBe('file content via --input-file');
    expect(mockedReadFileSync).toHaveBeenCalledWith('./doc.txt', 'utf-8');
  });

  it('Priority 1.5: --input-file overrides stdin when both are provided', async () => {
    mockedReadFileSync.mockReturnValue('from-file');
    const command = makeCommand({ from: 'stdin' });
    const result = await resolveInput(command, {
      vars: [],
      inputFileArg: './doc.txt',
      hasStdin: true,
      stdin: makeReadable('from-stdin'),
    });
    expect(result['input']).toBe('from-file');
  });

  it('Priority 1.5: --var overrides --input-file (--var has higher priority)', async () => {
    mockedReadFileSync.mockReturnValue('from-file');
    const command = makeCommand({ from: 'args' });
    const result = await resolveInput(command, {
      vars: ['input=from-var'],
      inputFileArg: './doc.txt',
      hasStdin: false,
    });
    expect(result['input']).toBe('from-var');
  });

  it('throws InputResolverError when --input-file path does not exist', async () => {
    mockedReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });
    const command = makeCommand({ from: 'args' });
    await expect(
      resolveInput(command, { vars: [], inputFileArg: './missing.txt', hasStdin: false }),
    ).rejects.toThrow(InputResolverError);
  });

  it('returns empty object when no sources apply', async () => {
    const command = makeCommand({ from: 'args' });
    const result = await resolveInput(command, { vars: [], hasStdin: false });
    expect(result).toEqual({});
  });
});
