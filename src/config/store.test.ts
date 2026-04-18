import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import {
  readConfig,
  writeConfig,
  getNestedValue,
  setNestedValue,
  unsetNestedValue,
  ConfigError,
} from './store.js';

const isWindows = platform() === 'win32';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'yali-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// readConfig
// ---------------------------------------------------------------------------
describe('readConfig()', () => {
  it('returns empty object when file does not exist', () => {
    const result = readConfig(join(tmpDir, 'config.yaml'));
    expect(result).toEqual({});
  });

  it('returns empty object when file is empty', () => {
    const path = join(tmpDir, 'config.yaml');
    writeConfig(path, {});
    const result = readConfig(path);
    expect(result).toEqual({});
  });

  it('parses valid YAML into config object', () => {
    const path = join(tmpDir, 'config.yaml');
    writeConfig(path, { openai: { api_key: 'sk-test' } });
    const result = readConfig(path);
    expect(result.openai?.api_key).toBe('sk-test');
  });

  it('throws ConfigError when YAML is malformed', () => {
    const path = join(tmpDir, 'config.yaml');
    writeFileSync(path, 'openai: [invalid: yaml: {{{');
    expect(() => readConfig(path)).toThrow(ConfigError);
  });
});

// ---------------------------------------------------------------------------
// writeConfig
// ---------------------------------------------------------------------------
describe('writeConfig()', () => {
  it('creates parent directories if they do not exist', () => {
    const path = join(tmpDir, 'nested', 'dir', 'config.yaml');
    expect(() => writeConfig(path, { openai: { api_key: 'sk-test' } })).not.toThrow();
    expect(readConfig(path).openai?.api_key).toBe('sk-test');
  });

  it('writes config as YAML to the specified path', () => {
    const path = join(tmpDir, 'config.yaml');
    writeConfig(path, { anthropic: { api_key: 'ant-key' } });
    const result = readConfig(path);
    expect(result.anthropic?.api_key).toBe('ant-key');
  });

  it.skipIf(isWindows)('sets file permissions to 0o600 on Unix', async () => {
    const { statSync } = await import('node:fs');
    const path = join(tmpDir, 'config.yaml');
    writeConfig(path, {});
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('overwrites existing file without losing other keys', () => {
    const path = join(tmpDir, 'config.yaml');
    writeConfig(path, { openai: { api_key: 'sk-test' } });
    const config = readConfig(path);
    const updated = setNestedValue(config, 'anthropic.api_key', 'ant-key');
    writeConfig(path, updated);
    const result = readConfig(path);
    expect(result.openai?.api_key).toBe('sk-test');
    expect(result.anthropic?.api_key).toBe('ant-key');
  });
});

// ---------------------------------------------------------------------------
// getNestedValue
// ---------------------------------------------------------------------------
describe('getNestedValue()', () => {
  it('returns value for a valid dotted key path', () => {
    const config = { openai: { api_key: 'sk-test' } };
    expect(getNestedValue(config, 'openai.api_key')).toBe('sk-test');
  });

  it('returns undefined for a missing key path', () => {
    expect(getNestedValue({}, 'openai.api_key')).toBeUndefined();
  });

  it('returns undefined when intermediate key is missing', () => {
    expect(getNestedValue({}, 'anthropic.api_key')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// setNestedValue
// ---------------------------------------------------------------------------
describe('setNestedValue()', () => {
  it('sets value at dotted key path in config object', () => {
    const config = { openai: { api_key: 'old' } };
    const result = setNestedValue(config, 'openai.api_key', 'new');
    expect(result.openai?.api_key).toBe('new');
  });

  it('creates intermediate objects if they do not exist', () => {
    const result = setNestedValue({}, 'openai.api_key', 'sk-test');
    expect(result.openai?.api_key).toBe('sk-test');
  });

  it('does not mutate the original config', () => {
    const config = { openai: { api_key: 'original' } };
    setNestedValue(config, 'openai.api_key', 'changed');
    expect(config.openai.api_key).toBe('original');
  });
});

// ---------------------------------------------------------------------------
// unsetNestedValue
// ---------------------------------------------------------------------------
describe('unsetNestedValue()', () => {
  it('removes key at dotted path', () => {
    const config = { openai: { api_key: 'sk-test' } };
    const result = unsetNestedValue(config, 'openai.api_key');
    expect(result.openai?.api_key).toBeUndefined();
  });

  it('does nothing if key does not exist', () => {
    expect(() => unsetNestedValue({}, 'openai.api_key')).not.toThrow();
  });

  it('does not mutate the original config', () => {
    const config = { openai: { api_key: 'sk-test' } };
    unsetNestedValue(config, 'openai.api_key');
    expect(config.openai?.api_key).toBe('sk-test');
  });
});
