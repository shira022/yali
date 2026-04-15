import { describe, it, expect } from 'vitest';
import { formatDryRun } from './dry-run-formatter.js';
import type { RenderedStep } from '../renderer/index.js';

function makeStep(overrides: Partial<RenderedStep> = {}): RenderedStep {
  return {
    id: 'step1',
    prompt: 'Translate the following: Hello',
    model: { name: 'gpt-4o' },
    depends_on: [],
    ...overrides,
  };
}

describe('formatDryRun', () => {
  describe('text format (default)', () => {
    it('formats a single step with the correct header and prompt', () => {
      const step = makeStep({ id: 'translate', prompt: 'Translate: Hello' });
      const output = formatDryRun([step]);
      expect(output).toContain('=== Step: translate (model: gpt-4o) ===');
      expect(output).toContain('Translate: Hello');
    });

    it('separates multiple steps with a double newline', () => {
      const steps = [
        makeStep({ id: 'summarize', prompt: 'Summarize this.' }),
        makeStep({ id: 'translate', prompt: 'Translate this.' }),
      ];
      const output = formatDryRun(steps);
      expect(output).toContain('=== Step: summarize (model: gpt-4o) ===');
      expect(output).toContain('=== Step: translate (model: gpt-4o) ===');
      // Double newline between sections
      expect(output).toMatch(/Summarize this\.\n\n=== Step: translate/);
    });

    it('includes the model name in the header', () => {
      const step = makeStep({ model: { name: 'gpt-4o-mini' } });
      const output = formatDryRun([step]);
      expect(output).toContain('(model: gpt-4o-mini)');
    });

    it('returns an empty string for empty steps array', () => {
      const output = formatDryRun([]);
      expect(output).toBe('');
    });

    it('uses text format when format argument is omitted (default)', () => {
      const step = makeStep();
      const output = formatDryRun([step]);
      expect(output).toContain('===');
      expect(() => JSON.parse(output)).toThrow(); // not JSON
    });
  });

  describe('json format', () => {
    it('returns valid JSON', () => {
      const step = makeStep();
      const output = formatDryRun([step], 'json');
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('JSON output contains steps array with expected fields', () => {
      const step = makeStep({ id: 'step1', prompt: 'Hello', model: { name: 'gpt-4o' }, depends_on: ['dep1'] });
      const parsed = JSON.parse(formatDryRun([step], 'json'));
      expect(parsed).toHaveProperty('steps');
      expect(parsed.steps).toHaveLength(1);
      expect(parsed.steps[0]).toMatchObject({
        id: 'step1',
        prompt: 'Hello',
        model: { name: 'gpt-4o' },
        depends_on: ['dep1'],
      });
    });

    it('JSON output is pretty-printed (2-space indent)', () => {
      const step = makeStep();
      const output = formatDryRun([step], 'json');
      // Pretty-printed JSON will have newlines and indentation
      expect(output).toContain('\n');
      expect(output).toContain('  ');
    });

    it('handles multiple steps in JSON output', () => {
      const steps = [
        makeStep({ id: 'step1', prompt: 'First' }),
        makeStep({ id: 'step2', prompt: 'Second' }),
      ];
      const parsed = JSON.parse(formatDryRun(steps, 'json'));
      expect(parsed.steps).toHaveLength(2);
      expect(parsed.steps[0].id).toBe('step1');
      expect(parsed.steps[1].id).toBe('step2');
    });

    it('returns empty steps array for empty input in JSON format', () => {
      const parsed = JSON.parse(formatDryRun([], 'json'));
      expect(parsed).toEqual({ steps: [] });
    });
  });
});
