import type { ValidatedCommand } from '../types/index.js';
import type { RenderedStep } from '../renderer/index.js';
import { orderSteps, renderStep } from '../renderer/index.js';

/**
 * Placeholder value substituted for a declared step's output during --dry-run.
 * No LLM is called, so inter-step references resolve to this explicit marker.
 */
export function dryRunPlaceholder(stepId: string): string {
  return `[dry-run] ${stepId}`;
}

/**
 * Pure function: builds the variable map for a --dry-run by pre-defining
 * `steps.<id>.output` for every declared step with a placeholder value.
 * Values already present in `variables` (e.g. via --var) are never overwritten.
 *
 * This is dry-run-only logic; the Executor's real output accumulation
 * (`steps.<id>.output` = actual LLM output) is untouched.
 */
export function buildDryRunVariables(
  command: ValidatedCommand,
  variables: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = { ...variables };
  for (const step of command.steps) {
    const key = `steps.${step.id}.output`;
    if (!(key in result)) {
      result[key] = dryRunPlaceholder(step.id);
    }
  }
  return result;
}

/**
 * Pure function: renders every step for a --dry-run invocation.
 * Orders steps topologically (the execution plan), pre-defines placeholder
 * outputs for all declared steps, then expands each prompt via the Renderer.
 *
 * @throws {RenderError} if a template references an undefined variable
 *   (e.g. an undeclared `steps.<unknown>.output`), or if the dependency
 *   graph is invalid.
 */
export function renderDryRunSteps(
  command: ValidatedCommand,
  variables: Record<string, string>,
): RenderedStep[] {
  const dryRunVariables = buildDryRunVariables(command, variables);
  return orderSteps(command).map((step) => renderStep(step, dryRunVariables));
}
