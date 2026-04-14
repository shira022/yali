import type { ValidatedCommand, ModelSpec } from '../types/index.js';
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
      throw new RenderError(`Undefined variable: "{{${trimmedKey}}}" has no value in the variable map`);
    }
    return variables[trimmedKey];
  });
}

/**
 * Pure function: expands {{variable}} templates in each step's prompt.
 *
 * The caller (Executor) is responsible for populating `variables` with all
 * required values, including inter-step references such as
 * `"steps.summarize.output"` before calling this function for dependent steps.
 *
 * @throws {RenderError} if a template variable is not found in `variables`.
 */
export function renderSteps(
  command: ValidatedCommand,
  variables: Record<string, string>,
): RenderedStep[] {
  return command.steps.map((step) => ({
    id: step.id,
    prompt: expandTemplate(step.prompt, variables),
    model: step.model,
    depends_on: step.depends_on,
  }));
}
