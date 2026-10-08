import { describe, it, expect } from 'vitest';
import { buildDryRunVariables, renderDryRunSteps, dryRunPlaceholder } from './dry-run.js';
import { formatDryRun } from './dry-run-formatter.js';
import { RenderError } from '../renderer/errors.js';
import type { ValidatedCommand, Step } from '../types/index.js';

function makeStep(overrides: Partial<Step> = {}): Step {
  return {
    id: 'summarize',
    prompt: 'Summarize: {{input}}',
    model: { name: 'gpt-4o' },
    depends_on: [],
    ...overrides,
  };
}

function makeCommand(steps: Step[]): ValidatedCommand {
  return {
    steps,
    input_spec: { from: 'stdin', var: 'input' },
    output_spec: { format: 'text', target: 'stdout' },
  };
}

const MULTI_STEP_COMMAND = makeCommand([
  makeStep(),
  makeStep({
    id: 'translate',
    model: { name: 'gpt-4o-mini' },
    depends_on: ['summarize'],
    prompt: 'Translate to English:\n{{steps.summarize.output}}',
  }),
]);

describe('dryRunPlaceholder', () => {
  it('returns an explicit dry-run marker containing the step id', () => {
    expect(dryRunPlaceholder('summarize')).toBe('[dry-run] summarize');
  });
});

describe('buildDryRunVariables', () => {
  it('pre-defines steps.<id>.output for every declared step', () => {
    const vars = buildDryRunVariables(MULTI_STEP_COMMAND, { input: 'Hello' });
    expect(vars['steps.summarize.output']).toBe('[dry-run] summarize');
    expect(vars['steps.translate.output']).toBe('[dry-run] translate');
  });

  it('preserves existing variables (e.g. --var overrides)', () => {
    const vars = buildDryRunVariables(MULTI_STEP_COMMAND, {
      input: 'Hello',
      'steps.summarize.output': 'user supplied output',
    });
    expect(vars['steps.summarize.output']).toBe('user supplied output');
    expect(vars.input).toBe('Hello');
  });

  it('does not define outputs for undeclared steps', () => {
    const vars = buildDryRunVariables(MULTI_STEP_COMMAND, {});
    expect('steps.unknown.output' in vars).toBe(false);
  });

  it('returns a new object without mutating the input map', () => {
    const original = { input: 'Hello' };
    buildDryRunVariables(MULTI_STEP_COMMAND, original);
    expect(original).toEqual({ input: 'Hello' });
  });
});

describe('renderDryRunSteps — multi-step with depends_on', () => {
  it('renders {{steps.<id>.output}} without throwing', () => {
    const rendered = renderDryRunSteps(MULTI_STEP_COMMAND, { input: 'Hello' });
    expect(rendered).toHaveLength(2);
    expect(rendered[1].prompt).toContain('[dry-run] summarize');
  });

  it('lists steps in depends_on order (execution plan)', () => {
    const rendered = renderDryRunSteps(MULTI_STEP_COMMAND, { input: 'Hello' });
    expect(rendered.map((s) => s.id)).toEqual(['summarize', 'translate']);
  });

  it('expands regular variables alongside step placeholders', () => {
    const rendered = renderDryRunSteps(MULTI_STEP_COMMAND, { input: 'Hello' });
    expect(rendered[0].prompt).toContain('Hello');
    expect(rendered[0].prompt).not.toContain('{{');
  });

  it('preserves model and depends_on metadata for the plan output', () => {
    const rendered = renderDryRunSteps(MULTI_STEP_COMMAND, { input: 'Hello' });
    expect(rendered[1].model).toEqual({ name: 'gpt-4o-mini' });
    expect(rendered[1].depends_on).toEqual(['summarize']);
  });
});

describe('renderDryRunSteps — error cases', () => {
  it('throws RenderError for an undeclared steps.<unknown>.output', () => {
    const command = makeCommand([
      makeStep({ id: 'step1', prompt: '{{steps.unknown.output}}' }),
    ]);
    expect(() => renderDryRunSteps(command, {})).toThrow(RenderError);
    expect(() => renderDryRunSteps(command, {})).toThrowError(
      'Variable "steps.unknown.output" is not defined',
    );
  });

  it('still throws RenderError for other undefined variables', () => {
    expect(() => renderDryRunSteps(MULTI_STEP_COMMAND, {})).toThrowError(
      'Variable "input" is not defined',
    );
  });

  it('throws on circular dependencies', () => {
    const command = makeCommand([
      makeStep({ id: 'a', depends_on: ['b'], prompt: '{{steps.b.output}}' }),
      makeStep({ id: 'b', depends_on: ['a'], prompt: '{{steps.a.output}}' }),
    ]);
    expect(() => renderDryRunSteps(command, {})).toThrow(RenderError);
  });
});

describe('dry-run output contains the placeholder (formatter integration)', () => {
  it('text format includes the placeholder in the rendered prompt', () => {
    const rendered = renderDryRunSteps(MULTI_STEP_COMMAND, { input: 'Hello' });
    const output = formatDryRun(rendered, 'text');
    expect(output).toContain('=== Step: summarize');
    expect(output).toContain('=== Step: translate');
    expect(output).toContain('[dry-run] summarize');
  });

  it('json format includes the placeholder in the rendered prompt', () => {
    const rendered = renderDryRunSteps(MULTI_STEP_COMMAND, { input: 'Hello' });
    const parsed = JSON.parse(formatDryRun(rendered, 'json'));
    expect(parsed.steps).toHaveLength(2);
    expect(parsed.steps[1].prompt).toContain('[dry-run] summarize');
    expect(parsed.steps[1].depends_on).toEqual(['summarize']);
  });
});
