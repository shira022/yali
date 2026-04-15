import { describe, it, expect } from 'vitest';
import { renderSteps, orderSteps, renderStep } from './index.js';
import { RenderError } from './errors.js';
import type { ValidatedCommand, Step } from '../types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCommand(overrides: Partial<ValidatedCommand> = {}): ValidatedCommand {
  return {
    steps: [
      {
        id: 'step0',
        prompt: 'Translate: {{input}}',
        model: { name: 'gpt-4o' },
        depends_on: [],
      },
    ],
    input_spec: { from: 'stdin', var: 'input' },
    output_spec: { format: 'text', target: 'stdout' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// renderSteps — single step
// ---------------------------------------------------------------------------

describe('renderSteps — single step', () => {
  it('expands a single variable in a prompt', () => {
    const cmd = makeCommand();
    const result = renderSteps(cmd, { input: 'Hello, world' });
    expect(result).toHaveLength(1);
    expect(result[0].prompt).toBe('Translate: Hello, world');
  });

  it('preserves step metadata (id, model, depends_on)', () => {
    const cmd = makeCommand();
    const result = renderSteps(cmd, { input: 'test' });
    expect(result[0].id).toBe('step0');
    expect(result[0].model).toEqual({ name: 'gpt-4o' });
    expect(result[0].depends_on).toEqual([]);
  });

  it('expands multiple variables in one prompt', () => {
    const cmd = makeCommand({
      steps: [
        {
          id: 'step0',
          prompt: 'Translate "{{input}}" to {{lang}}',
          model: { name: 'gpt-4o' },
          depends_on: [],
        },
      ],
    });
    const result = renderSteps(cmd, { input: 'Hello', lang: 'Japanese' });
    expect(result[0].prompt).toBe('Translate "Hello" to Japanese');
  });

  it('expands the same variable referenced multiple times', () => {
    const cmd = makeCommand({
      steps: [
        {
          id: 'step0',
          prompt: '{{input}} and {{input}}',
          model: { name: 'gpt-4o' },
          depends_on: [],
        },
      ],
    });
    const result = renderSteps(cmd, { input: 'foo' });
    expect(result[0].prompt).toBe('foo and foo');
  });

  it('handles a prompt with no template variables', () => {
    const cmd = makeCommand({
      steps: [{ id: 'step0', prompt: 'Say hello.', model: { name: 'gpt-4o' }, depends_on: [] }],
    });
    const result = renderSteps(cmd, {});
    expect(result[0].prompt).toBe('Say hello.');
  });

  it('ignores extra variables not referenced in the template', () => {
    const cmd = makeCommand();
    const result = renderSteps(cmd, { input: 'Hi', unused: 'extra' });
    expect(result[0].prompt).toBe('Translate: Hi');
  });

  it('handles whitespace inside {{ }} delimiters', () => {
    const cmd = makeCommand({
      steps: [
        { id: 'step0', prompt: 'Hello {{ input }}', model: { name: 'gpt-4o' }, depends_on: [] },
      ],
    });
    const result = renderSteps(cmd, { input: 'World' });
    expect(result[0].prompt).toBe('Hello World');
  });
});

// ---------------------------------------------------------------------------
// renderSteps — error cases
// ---------------------------------------------------------------------------

describe('renderSteps — undefined variable errors', () => {
  it('throws RenderError when a required variable is missing', () => {
    const cmd = makeCommand();
    expect(() => renderSteps(cmd, {})).toThrow(RenderError);
  });

  it('RenderError message names the missing variable', () => {
    const cmd = makeCommand();
    expect(() => renderSteps(cmd, {})).toThrowError('Variable "input" is not defined');
  });

  it('RenderError has correct name property', () => {
    expect.assertions(2);
    const cmd = makeCommand();
    try {
      renderSteps(cmd, {});
    } catch (e) {
      expect(e).toBeInstanceOf(RenderError);
      expect((e as RenderError).name).toBe('RenderError');
    }
  });

  it('throws on first missing variable when multiple are missing', () => {
    const cmd = makeCommand({
      steps: [
        {
          id: 'step0',
          prompt: '{{foo}} and {{bar}}',
          model: { name: 'gpt-4o' },
          depends_on: [],
        },
      ],
    });
    expect(() => renderSteps(cmd, {})).toThrow(RenderError);
  });
});

// ---------------------------------------------------------------------------
// renderSteps — multi-step
// ---------------------------------------------------------------------------

describe('renderSteps — multi-step', () => {
  it('expands all steps and returns an array of RenderedStep', () => {
    const cmd = makeCommand({
      steps: [
        { id: 'summarize', prompt: 'Summarize: {{input}}', model: { name: 'gpt-4o-mini' }, depends_on: [] },
        { id: 'translate', prompt: 'Translate: {{steps.summarize.output}}', model: { name: 'gpt-4o' }, depends_on: ['summarize'] },
      ],
    });
    const result = renderSteps(cmd, {
      input: 'Hello',
      'steps.summarize.output': 'A summary',
    });
    expect(result).toHaveLength(2);
    expect(result[0].prompt).toBe('Summarize: Hello');
    expect(result[1].prompt).toBe('Translate: A summary');
  });

  it('preserves depends_on in each RenderedStep', () => {
    const cmd = makeCommand({
      steps: [
        { id: 'step1', prompt: '{{input}}', model: { name: 'gpt-4o' }, depends_on: [] },
        { id: 'step2', prompt: '{{steps.step1.output}}', model: { name: 'gpt-4o' }, depends_on: ['step1'] },
      ],
    });
    const result = renderSteps(cmd, { input: 'hi', 'steps.step1.output': 'there' });
    expect(result[1].depends_on).toEqual(['step1']);
  });

  it('throws RenderError when a step variable is absent from the map', () => {
    const cmd = makeCommand({
      steps: [
        { id: 'step1', prompt: 'Summarize: {{input}}', model: { name: 'gpt-4o' }, depends_on: [] },
        { id: 'step2', prompt: 'Translate: {{steps.step1.output}}', model: { name: 'gpt-4o' }, depends_on: ['step1'] },
      ],
    });
    // Executor forgot to add steps.step1.output to the map
    expect(() => renderSteps(cmd, { input: 'Hello' })).toThrow(RenderError);
  });
});

// ---------------------------------------------------------------------------
// renderSteps — model spec preservation
// ---------------------------------------------------------------------------

describe('renderSteps — model spec preservation', () => {
  it('preserves full ModelSpec including optional fields', () => {
    const cmd = makeCommand({
      steps: [
        {
          id: 'step0',
          prompt: '{{input}}',
          model: { name: 'gpt-4o', temperature: 0.3, max_tokens: 512 },
          depends_on: [],
        },
      ],
    });
    const result = renderSteps(cmd, { input: 'hi' });
    expect(result[0].model).toEqual({ name: 'gpt-4o', temperature: 0.3, max_tokens: 512 });
  });
});

// ---------------------------------------------------------------------------
// renderSteps — topological sort
// ---------------------------------------------------------------------------

describe('renderSteps — topological sort', () => {
  it('returns single step unchanged', () => {
    const cmd = makeCommand();
    const result = renderSteps(cmd, { input: 'hi' });
    expect(result.map((s) => s.id)).toEqual(['step0']);
  });

  it('returns steps in dependency order when declared out of order', () => {
    const cmd = makeCommand({
      steps: [
        // translate declared first but depends on summarize
        { id: 'translate', prompt: '{{steps.summarize.output}}', model: { name: 'gpt-4o' }, depends_on: ['summarize'] },
        { id: 'summarize', prompt: '{{input}}', model: { name: 'gpt-4o-mini' }, depends_on: [] },
      ],
    });
    const result = renderSteps(cmd, { input: 'Hello', 'steps.summarize.output': 'Summary' });
    expect(result.map((s) => s.id)).toEqual(['summarize', 'translate']);
  });

  it('handles empty steps array and returns []', () => {
    const cmd = makeCommand({ steps: [] });
    const result = renderSteps(cmd, {});
    expect(result).toEqual([]);
  });

  it('throws RenderError on circular dependency', () => {
    const cmd = makeCommand({
      steps: [
        { id: 'a', prompt: '{{input}}', model: { name: 'gpt-4o' }, depends_on: ['b'] },
        { id: 'b', prompt: '{{input}}', model: { name: 'gpt-4o' }, depends_on: ['a'] },
      ],
    });
    expect(() => renderSteps(cmd, { input: 'hi' })).toThrow(RenderError);
  });

  it('throws RenderError when depends_on references unknown step id', () => {
    const cmd = makeCommand({
      steps: [
        { id: 'step1', prompt: '{{input}}', model: { name: 'gpt-4o' }, depends_on: ['nonexistent'] },
      ],
    });
    expect(() => renderSteps(cmd, { input: 'hi' })).toThrow(RenderError);
  });
});

// ---------------------------------------------------------------------------
// renderSteps — advisory fixes
// ---------------------------------------------------------------------------

describe('renderSteps — advisory', () => {
  it('throws on first missing variable and error message names that variable', () => {
    const cmd = makeCommand({
      steps: [
        { id: 'step0', prompt: '{{foo}} and {{bar}}', model: { name: 'gpt-4o' }, depends_on: [] },
      ],
    });
    expect(() => renderSteps(cmd, {})).toThrowError(/foo/);
  });
});

// ---------------------------------------------------------------------------
// orderSteps — pure topological sort (no template expansion)
// ---------------------------------------------------------------------------

describe('orderSteps', () => {
  it('returns single step in array', () => {
    const cmd = makeCommand();
    expect(orderSteps(cmd).map((s) => s.id)).toEqual(['step0']);
  });

  it('returns steps in dependency order when declared out of order', () => {
    const cmd = makeCommand({
      steps: [
        { id: 'translate', prompt: '{{steps.summarize.output}}', model: { name: 'gpt-4o' }, depends_on: ['summarize'] },
        { id: 'summarize', prompt: '{{input}}', model: { name: 'gpt-4o-mini' }, depends_on: [] },
      ],
    });
    expect(orderSteps(cmd).map((s) => s.id)).toEqual(['summarize', 'translate']);
  });

  it('returns Step objects (not RenderedStep — prompts are NOT expanded)', () => {
    const cmd = makeCommand();
    const steps = orderSteps(cmd);
    // prompt still contains the raw template placeholder
    expect(steps[0].prompt).toBe('Translate: {{input}}');
  });

  it('returns empty array for empty steps', () => {
    expect(orderSteps(makeCommand({ steps: [] }))).toEqual([]);
  });

  it('throws RenderError on circular dependency', () => {
    const cmd = makeCommand({
      steps: [
        { id: 'a', prompt: '{{input}}', model: { name: 'gpt-4o' }, depends_on: ['b'] },
        { id: 'b', prompt: '{{input}}', model: { name: 'gpt-4o' }, depends_on: ['a'] },
      ],
    });
    expect(() => orderSteps(cmd)).toThrowError(/[Cc]ircular/);
  });

  it('throws RenderError when depends_on references unknown step id', () => {
    const cmd = makeCommand({
      steps: [
        { id: 'step1', prompt: '{{input}}', model: { name: 'gpt-4o' }, depends_on: ['nonexistent'] },
      ],
    });
    expect(() => orderSteps(cmd)).toThrowError(/nonexistent/);
  });
});

// ---------------------------------------------------------------------------
// renderStep — single step expansion (for Executor multi-step usage)
// ---------------------------------------------------------------------------

describe('renderStep', () => {
  const step: Step = { id: 'step1', prompt: 'Translate: {{input}}', model: { name: 'gpt-4o' }, depends_on: [] };

  it('expands template variables in a single step', () => {
    const result = renderStep(step, { input: 'Hello' });
    expect(result.prompt).toBe('Translate: Hello');
  });

  it('preserves all step metadata', () => {
    const result = renderStep(step, { input: 'Hi' });
    expect(result.id).toBe('step1');
    expect(result.model).toEqual({ name: 'gpt-4o' });
    expect(result.depends_on).toEqual([]);
  });

  it('throws RenderError for missing variable', () => {
    expect(() => renderStep(step, {})).toThrow(RenderError);
  });

  it('supports multi-step pattern: Executor accumulates variables per step', () => {
    const summarize: Step = { id: 'summarize', prompt: 'Summarize: {{input}}', model: { name: 'gpt-4o-mini' }, depends_on: [] };
    const translate: Step = { id: 'translate', prompt: 'Translate: {{steps.summarize.output}}', model: { name: 'gpt-4o' }, depends_on: ['summarize'] };

    // Step 1: Executor renders summarize with only {input}
    const r1 = renderStep(summarize, { input: 'Hello' });
    expect(r1.prompt).toBe('Summarize: Hello');

    // Executor runs LLM → gets "A summary"
    // Step 2: Executor adds step output to variables, then renders translate
    const r2 = renderStep(translate, { input: 'Hello', 'steps.summarize.output': 'A summary' });
    expect(r2.prompt).toBe('Translate: A summary');
  });
});
