import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseCommand } from './index.js';
import { ParseError } from './errors.js';
import { ValidatedCommandSchema } from './schema.js';

// ---------------------------------------------------------------------------
// Schema-level tests (no file I/O — tests normalization and validation logic)
// ---------------------------------------------------------------------------

describe('ValidatedCommandSchema — normalization', () => {
  it('normalizes model string to object form', () => {
    const result = ValidatedCommandSchema.parse({
      prompt: 'Hello {{input}}',
      model: 'gpt-4o',
    });
    expect(result.steps[0].model).toEqual({ name: 'gpt-4o' });
  });

  it('promotes standalone prompt to steps[0]', () => {
    const result = ValidatedCommandSchema.parse({
      prompt: 'Translate: {{input}}',
      model: 'gpt-4o',
    });
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].id).toBe('step0');
    expect(result.steps[0].prompt).toBe('Translate: {{input}}');
    expect(result.steps[0].depends_on).toEqual([]);
  });

  it('uses model object form as-is when already an object', () => {
    const result = ValidatedCommandSchema.parse({
      prompt: 'Hello',
      model: { name: 'gpt-4o-mini', temperature: 0.5, max_tokens: 512 },
    });
    expect(result.steps[0].model).toEqual({
      name: 'gpt-4o-mini',
      temperature: 0.5,
      max_tokens: 512,
    });
  });

  it('defaults input_spec to stdin when input key is absent', () => {
    const result = ValidatedCommandSchema.parse({ prompt: 'Hi', model: 'gpt-4o' });
    expect(result.input_spec).toEqual({ from: 'stdin', var: 'input' });
  });

  it('defaults output_spec to text/stdout when output key is absent', () => {
    const result = ValidatedCommandSchema.parse({ prompt: 'Hi', model: 'gpt-4o' });
    expect(result.output_spec).toEqual({ format: 'text', target: 'stdout' });
  });
});

describe('ValidatedCommandSchema — standard config', () => {
  it('parses full standard YAML with explicit input/output', () => {
    const result = ValidatedCommandSchema.parse({
      name: 'translate',
      model: { name: 'gpt-4o', temperature: 0.3 },
      prompt: 'Translate: {{input}}',
      input: { from: 'stdin', var: 'input' },
      output: { format: 'markdown', target: 'stdout' },
    });
    expect(result.name).toBe('translate');
    expect(result.input_spec.from).toBe('stdin');
    expect(result.output_spec.format).toBe('markdown');
  });
});

describe('ValidatedCommandSchema — extended config (multi-step)', () => {
  it('parses steps array with depends_on', () => {
    const result = ValidatedCommandSchema.parse({
      name: 'summarize-and-translate',
      version: '1.0',
      steps: [
        { id: 'summarize', prompt: 'Summarize: {{input}}', model: 'gpt-4o-mini', depends_on: [] },
        { id: 'translate', prompt: 'Translate: {{steps.summarize.output}}', model: 'gpt-4o', depends_on: ['summarize'] },
      ],
      input: { from: 'stdin', var: 'input' },
      output: { format: 'text', target: 'stdout' },
    });
    expect(result.steps).toHaveLength(2);
    expect(result.steps[1].depends_on).toEqual(['summarize']);
    // model string normalized in each step
    expect(result.steps[0].model).toEqual({ name: 'gpt-4o-mini' });
    expect(result.steps[1].model).toEqual({ name: 'gpt-4o' });
  });

  it('defaults depends_on to [] when not provided in a step', () => {
    const result = ValidatedCommandSchema.parse({
      steps: [{ id: 'step1', prompt: 'Do something', model: 'gpt-4o' }],
    });
    expect(result.steps[0].depends_on).toEqual([]);
  });
});

describe('ValidatedCommandSchema — validation errors', () => {
  it('throws when neither prompt nor steps is provided', () => {
    expect(() => ValidatedCommandSchema.parse({ model: 'gpt-4o' })).toThrow();
  });

  it('throws when input.from is an invalid enum value', () => {
    expect(() =>
      ValidatedCommandSchema.parse({
        prompt: 'Hi',
        model: 'gpt-4o',
        input: { from: 'http', var: 'input' },
      }),
    ).toThrow();
  });

  it('throws when output.format is an invalid enum value', () => {
    expect(() =>
      ValidatedCommandSchema.parse({
        prompt: 'Hi',
        model: 'gpt-4o',
        output: { format: 'xml', target: 'stdout' },
      }),
    ).toThrow();
  });

  it('throws when a step is missing required id field', () => {
    expect(() =>
      ValidatedCommandSchema.parse({
        steps: [{ prompt: 'No id here', model: 'gpt-4o' }],
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// parseCommand() integration tests (with real temp files)
// ---------------------------------------------------------------------------

describe('parseCommand — file I/O', () => {
  let tmpDir: string;
  let tmpFile: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'yali-test-'));
    tmpFile = join(tmpDir, 'cmd.yaml');
  });

  afterEach(() => {
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
  });

  it('parses a minimal YAML file correctly', () => {
    writeFileSync(tmpFile, 'prompt: "Hello {{input}}"\nmodel: gpt-4o\n');
    const result = parseCommand(tmpFile);
    expect(result.steps[0].prompt).toBe('Hello {{input}}');
    expect(result.steps[0].model.name).toBe('gpt-4o');
  });

  it('throws ParseError when file does not exist', () => {
    expect(() => parseCommand('/nonexistent/path/cmd.yaml')).toThrowError(ParseError);
  });

  it('throws ParseError on YAML syntax error', () => {
    writeFileSync(tmpFile, 'prompt: :\n  - bad: [unclosed\n');
    expect(() => parseCommand(tmpFile)).toThrowError(ParseError);
  });

  it('throws ParseError when schema validation fails', () => {
    writeFileSync(tmpFile, 'model: gpt-4o\n'); // no prompt or steps
    expect(() => parseCommand(tmpFile)).toThrowError(ParseError);
  });

  it('ParseError has correct name property', () => {
    try {
      parseCommand('/nonexistent/path/cmd.yaml');
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).name).toBe('ParseError');
    }
  });
});
