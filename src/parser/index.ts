import { readFileSync } from 'fs';
import { load, YAMLException } from 'js-yaml';
import type { ValidatedCommand } from '../types/index.js';
import { ValidatedCommandSchema } from './schema.js';
import { ParseError } from './errors.js';

export function parseCommand(filePath: string): ValidatedCommand {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (e) {
    throw new ParseError(`Cannot read file: ${filePath}`, e);
  }

  let yaml: unknown;
  try {
    yaml = load(raw);
  } catch (e) {
    if (e instanceof YAMLException) {
      throw new ParseError(`YAML syntax error in ${filePath}: ${e.message}`, e);
    }
    throw new ParseError(`Failed to parse YAML: ${filePath}`, e);
  }

  const result = ValidatedCommandSchema.safeParse(yaml);
  if (!result.success) {
    throw new ParseError(
      `Invalid command schema in ${filePath}: ${result.error.message}`,
      result.error,
    );
  }

  return result.data;
}
