import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import { resolveInput, InputResolverError } from './input-resolver.js';
import type { ValidatedCommand } from '../types/index.js';

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
    vi.restoreAllMocks();
  });

  it('Priority 4: uses YAML default when nothing else is provided', async () => {
    const command = makeCommand({ from: 'args', default: 'default-value' });
    const result = await resolveInput(command, { vars: [], hasStdin: false });
    expect(result).toEqual({ input: 'default-value' });
  });

  it('Priority 2: stdin overrides YAML default', async () => {
    const command = makeCommand({ from: 'stdin', default: 'default-value' });
    const result = await resolveInput(command, {
      vars: [],
      hasStdin: true,
      stdin: makeReadable('from-stdin'),
    });
    expect(result).toEqual({ input: 'from-stdin' });
  });

  it('Priority 2: --input arg overrides stdin', async () => {
    const command = makeCommand({ from: 'args' });
    const result = await resolveInput(command, {
      vars: [],
      inputArg: 'from-arg',
      hasStdin: true,
      stdin: makeReadable('from-stdin'),
    });
    // --input (inputArg) is applied after stdin, so it wins
    expect(result['input']).toBe('from-arg');
  });

  it('Priority 1: --var overrides --input arg', async () => {
    const command = makeCommand({ from: 'args' });
    const result = await resolveInput(command, {
      vars: ['input=from-var'],
      inputArg: 'from-arg',
      hasStdin: false,
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

  it('Priority 1: --var with key=value=more preserves the rest of value', async () => {
    const command = makeCommand({ from: 'args' });
    const result = await resolveInput(command, {
      vars: ['url=https://example.com/path?q=1'],
      hasStdin: false,
    });
    expect(result['url']).toBe('https://example.com/path?q=1');
  });

  it('Priority 3: reads file when input.from is file and inputFile is provided', async () => {
    vi.mock('node:fs', () => ({
      readFileSync: vi.fn().mockReturnValue('file-content'),
    }));
    // Re-import to pick up mock — use inline mock instead
    const fsMod = await import('node:fs');
    vi.spyOn(fsMod, 'readFileSync').mockReturnValue('file-content' as unknown as ReturnType<typeof fsMod.readFileSync>);

    const command = makeCommand({ from: 'file' });
    const result = await resolveInput(command, {
      vars: [],
      inputFile: './data.txt',
      hasStdin: false,
    });
    expect(result['input']).toBe('file-content');
  });

  it('throws InputResolverError when --var format is invalid', async () => {
    const command = makeCommand({ from: 'args' });
    await expect(
      resolveInput(command, { vars: ['no-equals-sign'], hasStdin: false }),
    ).rejects.toThrow(InputResolverError);
  });

  it('throws InputResolverError when input file cannot be read', async () => {
    const fsMod = await import('node:fs');
    vi.spyOn(fsMod, 'readFileSync').mockImplementation(() => {
      throw new Error('ENOENT: file not found');
    });

    const command = makeCommand({ from: 'file', path: './missing.txt' });
    await expect(
      resolveInput(command, { vars: [], hasStdin: false }),
    ).rejects.toThrow(InputResolverError);
  });

  it('returns empty object when no sources apply', async () => {
    const command = makeCommand({ from: 'args' });
    const result = await resolveInput(command, { vars: [], hasStdin: false });
    expect(result).toEqual({});
  });
});
