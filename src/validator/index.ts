/**
 * Input validation module for yali.
 *
 * All functions are pure (no side effects, no I/O).
 * Consumed by the CLI Layer (input-resolver), Parser (schema), and Executor layers.
 *
 * Validation rules applied to all user-supplied string values:
 * - No NUL bytes (\0)
 * - No ASCII control characters (\x01–\x08, \x0b–\x0c, \x0e–\x1f, \x7f)
 *   Tab (\t = \x09), newline (\n = \x0a), and carriage return (\r = \x0d) are permitted.
 * - Maximum length: MAX_INPUT_LENGTH characters
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/** Maximum allowed length for any user-supplied string value. */
export const MAX_INPUT_LENGTH = 100_000;

/**
 * Regex that matches disallowed control characters.
 * Permits tab (\x09), LF (\x0a), and CR (\x0d); rejects everything else in \x00–\x1f and \x7f.
 */
const DISALLOWED_CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

/**
 * Validates a user-supplied input value (e.g., --input, stdin content, file content).
 *
 * @param value - The string to validate.
 * @param label - A human-readable label used in error messages (e.g., '"--input"').
 */
export function validateInputValue(value: string, label: string): ValidationResult {
  if (value.includes('\0')) {
    return { valid: false, error: `${label}: NUL bytes are not allowed in input values` };
  }
  if (DISALLOWED_CONTROL_CHARS.test(value)) {
    return { valid: false, error: `${label}: input contains disallowed control characters` };
  }
  if (value.length > MAX_INPUT_LENGTH) {
    return {
      valid: false,
      error: `${label}: input exceeds the maximum allowed length of ${MAX_INPUT_LENGTH} characters (got ${value.length})`,
    };
  }
  return { valid: true };
}

/**
 * Validates the key portion of a --var key=value flag.
 * Keys must be non-empty and consist only of alphanumeric characters, underscores, and dots.
 *
 * @param key - The variable key to validate (e.g. "topic", "steps.step1.output").
 */
export function validateVarKey(key: string): ValidationResult {
  if (key.length === 0) {
    return { valid: false, error: '--var key must not be empty' };
  }
  if (!/^[A-Za-z0-9_.]+$/.test(key)) {
    return {
      valid: false,
      error: `--var key "${key}" contains invalid characters; only alphanumeric characters, underscores, and dots are allowed`,
    };
  }
  return { valid: true };
}

/**
 * Validates a prompt string from YAML or a fully-rendered prompt before LLM submission.
 *
 * Applies the same control-character and length rules as validateInputValue.
 *
 * @param prompt - The prompt string to validate.
 * @param label - A human-readable label used in error messages (e.g., '"prompt"').
 */
export function validatePromptContent(prompt: string, label: string): ValidationResult {
  if (prompt.includes('\0')) {
    return { valid: false, error: `${label}: NUL bytes are not allowed in prompts` };
  }
  if (DISALLOWED_CONTROL_CHARS.test(prompt)) {
    return { valid: false, error: `${label}: prompt contains disallowed control characters` };
  }
  if (prompt.length > MAX_INPUT_LENGTH) {
    return {
      valid: false,
      error: `${label}: prompt exceeds the maximum allowed length of ${MAX_INPUT_LENGTH} characters (got ${prompt.length})`,
    };
  }
  return { valid: true };
}
