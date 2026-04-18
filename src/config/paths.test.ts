import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getConfigPath } from './paths.js';

const originalPlatform = process.platform;
const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('getConfigPath()', () => {
  it.skipIf(process.platform === 'win32')('returns XDG_CONFIG_HOME-based path when XDG_CONFIG_HOME is set', () => {
    process.env['XDG_CONFIG_HOME'] = '/custom/config';
    const path = getConfigPath();
    expect(path).toBe('/custom/config/yali/config.yaml');
  });

  it.skipIf(process.platform === 'win32')('returns ~/.config/yali/config.yaml when XDG_CONFIG_HOME is unset (Linux/macOS)', () => {
    delete process.env['XDG_CONFIG_HOME'];
    const path = getConfigPath();
    expect(path).toBe(join(homedir(), '.config', 'yali', 'config.yaml'));
  });

  it.skipIf(process.platform !== 'win32')('returns %APPDATA%/yali/config.yaml on Windows', () => {
    process.env['APPDATA'] = 'C:\\Users\\test\\AppData\\Roaming';
    const path = getConfigPath();
    expect(path).toBe('C:\\Users\\test\\AppData\\Roaming\\yali\\config.yaml');
  });

  it('returns a path ending with config.yaml', () => {
    const path = getConfigPath();
    expect(path.endsWith('config.yaml')).toBe(true);
  });

  it('returns a path containing "yali"', () => {
    const path = getConfigPath();
    expect(path).toContain('yali');
  });
});
