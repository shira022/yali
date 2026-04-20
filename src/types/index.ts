/** Supported LLM provider identifiers. */
export type ProviderName = 'openai' | 'anthropic' | 'google' | 'ollama';

/**
 * Describes the LLM model configuration for a step.
 * Used within Step, always normalized to object form by the Parser.
 */
export interface ModelSpec {
  name: string;
  /** LLM provider. Resolved by the Parser; defaults to 'openai' if omitted. */
  provider?: ProviderName;
  temperature?: number;
  max_tokens?: number;
  /** Maximum time in milliseconds to wait for the API call to complete. Defaults to 60000 (60s). */
  timeout_ms?: number;
  /** Maximum number of retries on retryable errors. Defaults to 3. */
  max_retries?: number;
}

/**
 * Represents a single prompt step in the pipeline.
 * The Parser normalizes all steps into this form.
 * The Renderer expands `prompt` templates; the Executor runs the LLM call.
 */
export interface Step {
  id: string;
  /** Raw prompt string before template expansion by the Renderer. */
  prompt: string;
  model: ModelSpec;
  depends_on: string[];
}

/**
 * Describes the input source for a command.
 * Parsed and validated by the Parser layer.
 */
export interface InputSpec {
  from: 'stdin' | 'args' | 'file';
  var: string;
  default?: string;
  path?: string;
}

/**
 * Describes the output target for a command.
 * Consumed by the Executor layer when writing results.
 */
export interface OutputSpec {
  format: 'text' | 'markdown' | 'json';
  target: 'stdout' | 'file';
  path?: string;
}

/**
 * Describes an MCP/function tool available to the LLM.
 */
export interface ToolSpec {
  type: string;
  server?: string;
  allowed_actions?: string[];
}

/**
 * The validated, normalized representation of a YAML command file.
 * This is the DMZ interface between the Parser and the Renderer/Executor layers.
 * The Parser produces it; downstream layers must not reference raw YAML.
 */
export interface ValidatedCommand {
  name?: string;
  version?: string;
  /** Always normalized to a Step array by the Parser. */
  steps: Step[];
  input_spec: InputSpec;
  output_spec: OutputSpec;
  tools?: ToolSpec[];
}

/**
 * The result returned by the Executor after running an LLM command.
 * The CLI layer uses this to set the process exit code and write output.
 */
export interface ExecutionResult {
  exitCode: number;
  output: string;
}
