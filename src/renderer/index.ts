import type { ValidatedCommand, ModelSpec, Step } from '../types/index.js';
import { RenderError } from './errors.js';

/**
 * A single step with its prompt fully expanded by the Renderer.
 * Passed to the Executor for LLM invocation.
 */
export interface RenderedStep {
  id: string;
  /** Expanded prompt string — all {{variable}} references resolved. */
  prompt: string;
  model: ModelSpec;
  depends_on: string[];
}

const TEMPLATE_PATTERN = /\{\{([^}]+)\}\}/g;

function expandTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(TEMPLATE_PATTERN, (_match, key: string) => {
    const trimmedKey = key.trim();
    if (!(trimmedKey in variables)) {
      throw new RenderError(`Variable "${trimmedKey}" is not defined`);
    }
    return variables[trimmedKey];
  });
}

/**
 * Topologically sorts steps by their `depends_on` relationships (Kahn's algorithm).
 * Returns steps in a valid execution order (dependencies before dependents).
 *
 * @throws {RenderError} if an unknown step id is referenced in `depends_on`,
 *   or if a circular dependency is detected.
 */
function topologicalSort(steps: Step[]): Step[] {
  const idToStep = new Map(steps.map((s) => [s.id, s]));

  // Validate all depends_on references
  for (const step of steps) {
    for (const dep of step.depends_on) {
      if (!idToStep.has(dep)) {
        throw new RenderError(
          `Step "${step.id}" depends on unknown step "${dep}"`,
        );
      }
    }
  }

  // Kahn's algorithm
  const inDegree = new Map(steps.map((s) => [s.id, 0]));
  for (const step of steps) {
    for (const dep of step.depends_on) {
      inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
    }
  }

  const queue: Step[] = steps.filter((s) => inDegree.get(s.id) === 0);
  const sorted: Step[] = [];

  // Build reverse adjacency: dep → steps that depend on dep
  const dependents = new Map<string, string[]>();
  for (const step of steps) {
    for (const dep of step.depends_on) {
      if (!dependents.has(dep)) dependents.set(dep, []);
      dependents.get(dep)!.push(step.id);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const dependentId of dependents.get(current.id) ?? []) {
      const newDegree = (inDegree.get(dependentId) ?? 0) - 1;
      inDegree.set(dependentId, newDegree);
      if (newDegree === 0) {
        queue.push(idToStep.get(dependentId)!);
      }
    }
  }

  if (sorted.length !== steps.length) {
    throw new RenderError(
      'Circular dependency detected in steps: cannot determine a valid execution order',
    );
  }

  return sorted;
}

/**
 * Pure function: returns steps sorted in a valid execution order based on
 * `depends_on` dependencies. The Executor uses this for multi-step commands
 * to know which step to run next, then calls `renderStep` per step as
 * accumulated outputs become available.
 *
 * @throws {RenderError} if an unknown step id is referenced in `depends_on`,
 *   or if a circular dependency is detected.
 */
export function orderSteps(command: ValidatedCommand): Step[] {
  return topologicalSort(command.steps);
}

/**
 * Pure function: expands {{variable}} templates in a single step's prompt.
 * The Executor calls this per step in multi-step mode, after adding the
 * previous step's LLM output to `variables` (e.g. `"steps.step1.output"`).
 *
 * @throws {RenderError} if a template variable is not found in `variables`.
 */
export function renderStep(
  step: Step,
  variables: Record<string, string>,
): RenderedStep {
  return {
    id: step.id,
    prompt: expandTemplate(step.prompt, variables),
    model: step.model,
    depends_on: step.depends_on,
  };
}

/**
 * Pure function: topologically sorts steps by dependency graph, then expands
 * {{variable}} templates in each step's prompt.
 *
 * Use this for **single-step** commands, or for multi-step commands only when
 * all required variables (including `"steps.X.output"` inter-step references)
 * are already pre-populated in `variables`.
 *
 * For sequential multi-step execution, prefer `orderSteps` + `renderStep`
 * so that each step's output can be added to `variables` before the next
 * step is expanded.
 *
 * @throws {RenderError} if a template variable is not found in `variables`,
 *   if a `depends_on` references an unknown step id, or if a circular
 *   dependency is detected.
 */
export function renderSteps(
  command: ValidatedCommand,
  variables: Record<string, string>,
): RenderedStep[] {
  return orderSteps(command).map((step) => renderStep(step, variables));
}
