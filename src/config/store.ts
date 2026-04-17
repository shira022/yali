import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import * as yaml from 'js-yaml';
import { YaliConfigSchema, type YaliConfig } from './schema.js';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Reads the config file at the given path and returns a parsed YaliConfig.
 * Returns an empty config object if the file does not exist or is empty.
 * Throws ConfigError if the YAML is malformed or fails schema validation.
 */
export function readConfig(filePath: string): YaliConfig {
  if (!existsSync(filePath)) {
    return {};
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (e) {
    throw new ConfigError(`Failed to read config file: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!raw.trim()) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (e) {
    throw new ConfigError(`Config file contains invalid YAML: ${e instanceof Error ? e.message : String(e)}`);
  }

  const result = YaliConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(`Config file has invalid structure: ${result.error.message}`);
  }

  return result.data;
}

/**
 * Writes the given config object as YAML to filePath.
 * Creates parent directories as needed.
 * On Unix, sets file permissions to 0o600 (owner read/write only).
 */
export function writeConfig(filePath: string, config: YaliConfig): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });

  const content = yaml.dump(config, { indent: 2 });
  writeFileSync(filePath, content, 'utf8');

  if (process.platform !== 'win32') {
    chmodSync(filePath, 0o600);
  }
}

/**
 * Gets a value from config using a dotted key path (e.g. 'openai.api_key').
 * Returns undefined if any part of the path is missing.
 */
export function getNestedValue(config: YaliConfig, keyPath: string): string | undefined {
  const parts = keyPath.split('.');
  let current: unknown = config;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

/**
 * Sets a value in config using a dotted key path.
 * Creates intermediate objects as needed.
 * Returns a new config object with the value set.
 */
export function setNestedValue(config: YaliConfig, keyPath: string, value: string): YaliConfig {
  const parts = keyPath.split('.');
  const result = structuredClone(config) as Record<string, unknown>;

  let current = result;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;

  return result as YaliConfig;
}

/**
 * Removes a value from config using a dotted key path.
 * Returns a new config object with the key removed.
 * Does nothing if the key does not exist.
 */
export function unsetNestedValue(config: YaliConfig, keyPath: string): YaliConfig {
  const parts = keyPath.split('.');
  const result = structuredClone(config) as Record<string, unknown>;

  let current = result;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (typeof current[part] !== 'object' || current[part] === null) {
      return result as YaliConfig;
    }
    current = current[part] as Record<string, unknown>;
  }
  delete current[parts[parts.length - 1]!];

  return result as YaliConfig;
}
