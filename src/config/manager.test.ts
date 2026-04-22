import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeConfig } from './store.js';
import { handleConfigCommand, maskApiKey } from './manager.js';

let tmpDir: string;
let configPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'yali-test-'));
  configPath = join(tmpDir, 'config.yaml');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// maskApiKey
// ---------------------------------------------------------------------------
describe('maskApiKey()', () => {
  it('masks a long key as prefix***...suffix', () => {
    expect(maskApiKey('sk-abcdefgh12345678')).toBe('sk-a***...5678');
  });

  it('returns **** for keys 8 chars or shorter', () => {
    expect(maskApiKey('short')).toBe('****');
    expect(maskApiKey('12345678')).toBe('****');
  });
});

// ---------------------------------------------------------------------------
// handleConfigCommand — set
// ---------------------------------------------------------------------------
describe('handleConfigCommand set', () => {
  it('writes key to config file', async () => {
    // Temporarily override getConfigPath via env
    const { readConfig } = await import('./store.js');
    // We test by directly using configPath
    await handleConfigCommand(['set', 'openai.api_key', 'sk-abcdefghijklmnopqrst'], configPath);
    const config = readConfig(configPath);
    expect(config.openai?.api_key).toBe('sk-abcdefghijklmnopqrst');
  });

  it('exits with code 1 if value argument is missing', async () => {
    const exitMock = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    await expect(
      handleConfigCommand(['set', 'openai.api_key'], configPath),
    ).rejects.toThrow('process.exit called');
    exitMock.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// handleConfigCommand — get
// ---------------------------------------------------------------------------
describe('handleConfigCommand get', () => {
  it('prints masked key', async () => {
    writeConfig(configPath, { openai: { api_key: 'sk-abcdefgh12345678' } });
    const output: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((data: string | Uint8Array) => {
      output.push(String(data));
      return true;
    });
    await handleConfigCommand(['get', 'openai.api_key'], configPath);
    expect(output.join('')).toContain('sk-a***...5678');
    vi.restoreAllMocks();
  });

  it('exits with code 1 if key is not set', async () => {
    const exitMock = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    await expect(
      handleConfigCommand(['get', 'openai.api_key'], configPath),
    ).rejects.toThrow('process.exit called');
    exitMock.mockRestore();
  });

  it('exits with code 1 if key argument is missing', async () => {
    const exitMock = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    await expect(handleConfigCommand(['get'], configPath)).rejects.toThrow('process.exit called');
    exitMock.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// handleConfigCommand — list
// ---------------------------------------------------------------------------
describe('handleConfigCommand list', () => {
  it('prints "No configuration found." when file does not exist', async () => {
    const output: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((data: string | Uint8Array) => {
      output.push(String(data));
      return true;
    });
    await handleConfigCommand(['list'], configPath);
    expect(output.join('')).toContain('No configuration found.');
    vi.restoreAllMocks();
  });

  it('prints all keys with masked values', async () => {
    writeConfig(configPath, {
      openai: { api_key: 'sk-abcdefgh12345678' },
      anthropic: { api_key: 'ant-abcdefgh12345678' },
    });
    const output: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((data: string | Uint8Array) => {
      output.push(String(data));
      return true;
    });
    await handleConfigCommand(['list'], configPath);
    const joined = output.join('');
    expect(joined).toContain('openai.api_key');
    expect(joined).toContain('anthropic.api_key');
    expect(joined).not.toContain('sk-abcdefgh12345678');
    expect(joined).not.toContain('ant-abcdefgh12345678');
    expect(joined).toContain('***');
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// handleConfigCommand — unset
// ---------------------------------------------------------------------------
describe('handleConfigCommand unset', () => {
  it('removes the key from config file', async () => {
    writeConfig(configPath, { openai: { api_key: 'sk-test' } });
    await handleConfigCommand(['unset', 'openai.api_key'], configPath);
    const { readConfig } = await import('./store.js');
    const config = readConfig(configPath);
    expect(config.openai?.api_key).toBeUndefined();
  });

  it('exits 0 if key does not exist', async () => {
    await expect(
      handleConfigCommand(['unset', 'openai.api_key'], configPath),
    ).resolves.toBeUndefined();
  });

  it('exits with code 1 if key argument is missing', async () => {
    const exitMock = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    await expect(handleConfigCommand(['unset'], configPath)).rejects.toThrow('process.exit called');
    exitMock.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// handleConfigCommand unknown subcommand
// ---------------------------------------------------------------------------
describe('handleConfigCommand unknown subcommand', () => {
  it('exits with code 1 and usage error', async () => {
    const exitMock = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    await expect(
      handleConfigCommand(['unknown'], configPath),
    ).rejects.toThrow('process.exit called');
    exitMock.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// handleConfigCommand set — API key format validation
// ---------------------------------------------------------------------------
describe('handleConfigCommand set — API key format validation', () => {
  it('exits with code 1 and writes to stderr for invalid OpenAI key (missing sk- prefix)', async () => {
    const exitMock = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    const stderrOutput: string[] = [];
    const stderrMock = vi.spyOn(process.stderr, 'write').mockImplementation((data: string | Uint8Array) => {
      stderrOutput.push(String(data));
      return true;
    });
    await expect(
      handleConfigCommand(['set', 'openai.api_key', 'invalid-key-without-prefix'], configPath),
    ).rejects.toThrow('process.exit called');
    expect(stderrOutput.join('')).toContain('❌');
    exitMock.mockRestore();
    stderrMock.mockRestore();
  });

  it('does NOT exit and saves successfully for a valid OpenAI key', async () => {
    const { readConfig } = await import('./store.js');
    await handleConfigCommand(['set', 'openai.api_key', 'sk-abcdefghijklmnopqrst'], configPath);
    const config = readConfig(configPath);
    expect(config.openai?.api_key).toBe('sk-abcdefghijklmnopqrst');
  });

  it('exits with code 1 and writes to stderr for an invalid Anthropic key', async () => {
    const exitMock = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    const stderrOutput: string[] = [];
    const stderrMock = vi.spyOn(process.stderr, 'write').mockImplementation((data: string | Uint8Array) => {
      stderrOutput.push(String(data));
      return true;
    });
    await expect(
      handleConfigCommand(['set', 'anthropic.api_key', 'invalid-anthropic-key'], configPath),
    ).rejects.toThrow('process.exit called');
    expect(stderrOutput.join('')).toContain('❌');
    exitMock.mockRestore();
    stderrMock.mockRestore();
  });

  it('does NOT exit and saves successfully for a valid Anthropic key', async () => {
    const { readConfig } = await import('./store.js');
    await handleConfigCommand(['set', 'anthropic.api_key', 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456789012'], configPath);
    const config = readConfig(configPath);
    expect(config.anthropic?.api_key).toBe('sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456789012');
  });

  it('exits with code 1 and writes to stderr for an invalid Google key', async () => {
    const exitMock = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    const stderrOutput: string[] = [];
    const stderrMock = vi.spyOn(process.stderr, 'write').mockImplementation((data: string | Uint8Array) => {
      stderrOutput.push(String(data));
      return true;
    });
    await expect(
      handleConfigCommand(['set', 'google.api_key', 'not-a-google-key'], configPath),
    ).rejects.toThrow('process.exit called');
    expect(stderrOutput.join('')).toContain('❌');
    exitMock.mockRestore();
    stderrMock.mockRestore();
  });

  it('does NOT exit and saves successfully for a valid Google key', async () => {
    const { readConfig } = await import('./store.js');
    await handleConfigCommand(['set', 'google.api_key', 'AIzaTEST_ONLY_FAKE_KEY_NOT_REAL_ABCDEFG'], configPath);
    const config = readConfig(configPath);
    expect(config.google?.api_key).toBe('AIzaTEST_ONLY_FAKE_KEY_NOT_REAL_ABCDEFG');
  });

  it('does NOT exit for an Ollama arbitrary key (no validation)', async () => {
    const { readConfig } = await import('./store.js');
    await handleConfigCommand(['set', 'ollama.api_key', 'any-arbitrary-value'], configPath);
    const config = readConfig(configPath);
    expect(config.ollama?.api_key).toBe('any-arbitrary-value');
  });
});
