import type { ProviderName } from '../types/index.js';
import { getConfigPath } from './paths.js';
import { validateApiKey } from './api-key-validator.js';
import {
  readConfig,
  writeConfig,
  getNestedValue,
  setNestedValue,
  unsetNestedValue,
  ConfigError,
} from './store.js';

const KNOWN_PROVIDERS = new Set<ProviderName>(['openai', 'anthropic', 'google', 'ollama']);

/** Masks an API key for safe display: sk-***...xxxx */
export function maskApiKey(value: string): string {
  if (value.length <= 8) {
    return '****';
  }
  return `${value.slice(0, 4)}***...${value.slice(-4)}`;
}

/**
 * Handles the `yali config` subcommand.
 * Subcommands: set <key> <value> | get <key> | list | unset <key>
 *
 * @param args - CLI arguments after `config` (e.g. ['set', 'openai.api_key', 'sk-...'])
 * @param configFilePath - Override the config file path (used in tests with tmpdir)
 */
export async function handleConfigCommand(
  args: string[],
  configFilePath?: string,
): Promise<void> {
  const configPath = configFilePath ?? getConfigPath();
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case 'set': {
      const [key, value] = rest;
      if (!key || !value) {
        process.stderr.write('Usage: yali config set <key> <value>\n');
        process.stderr.write('Example: yali config set openai.api_key sk-...\n');
        process.exit(1);
      }

      const keyParts = key.split('.');
      if (keyParts.length === 2 && keyParts[1] === 'api_key') {
        const provider = keyParts[0] as ProviderName;
        if (KNOWN_PROVIDERS.has(provider)) {
          const result = validateApiKey(provider, value);
          if (!result.valid) {
            process.stderr.write(`❌ ${result.error}\n`);
            process.exit(1);
          }
        }
      }

      try {
        const config = readConfig(configPath);
        const updated = setNestedValue(config, key, value);
        writeConfig(configPath, updated);
        process.stdout.write(`✓ Set ${key}\n`);
      } catch (e) {
        process.stderr.write(`Error: ${e instanceof ConfigError ? e.message : String(e)}\n`);
        process.exit(1);
      }
      break;
    }

    case 'get': {
      const [key] = rest;
      if (!key) {
        process.stderr.write('Usage: yali config get <key>\n');
        process.exit(1);
      }
      try {
        const config = readConfig(configPath);
        const value = getNestedValue(config, key);
        if (value === undefined) {
          process.stderr.write(`Error: "${key}" is not set. Run: yali config set ${key} <value>\n`);
          process.exit(1);
        }
        process.stdout.write(`${maskApiKey(value)}\n`);
      } catch (e) {
        process.stderr.write(`Error: ${e instanceof ConfigError ? e.message : String(e)}\n`);
        process.exit(1);
      }
      break;
    }

    case 'list': {
      try {
        const config = readConfig(configPath);
        const entries = collectEntries(config);
        if (entries.length === 0) {
          process.stdout.write('No configuration found.\n');
          break;
        }
        for (const { key, value } of entries) {
          process.stdout.write(`${key} = ${maskApiKey(value)}\n`);
        }
      } catch (e) {
        process.stderr.write(`Error: ${e instanceof ConfigError ? e.message : String(e)}\n`);
        process.exit(1);
      }
      break;
    }

    case 'unset': {
      const [key] = rest;
      if (!key) {
        process.stderr.write('Usage: yali config unset <key>\n');
        process.exit(1);
      }
      try {
        const config = readConfig(configPath);
        const updated = unsetNestedValue(config, key);
        writeConfig(configPath, updated);
        process.stdout.write(`✓ Unset ${key}\n`);
      } catch (e) {
        process.stderr.write(`Error: ${e instanceof ConfigError ? e.message : String(e)}\n`);
        process.exit(1);
      }
      break;
    }

    default: {
      process.stderr.write(
        [
          'Usage: yali config <subcommand>',
          '',
          'Subcommands:',
          '  set <key> <value>   Set a configuration value',
          '  get <key>           Get a configuration value (masked)',
          '  list                List all configuration values (masked)',
          '  unset <key>         Remove a configuration value',
          '',
          'Examples:',
          '  yali config set openai.api_key sk-...',
          '  yali config get openai.api_key',
          '  yali config list',
          '  yali config unset openai.api_key',
          '',
        ].join('\n'),
      );
      process.exit(1);
    }
  }
}

/** Recursively collects all leaf string entries from a nested config object. */
function collectEntries(
  obj: Record<string, unknown>,
  prefix = '',
): Array<{ key: string; value: string }> {
  const entries: Array<{ key: string; value: string }> = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      entries.push({ key: fullKey, value: v });
    } else if (v !== null && typeof v === 'object') {
      entries.push(...collectEntries(v as Record<string, unknown>, fullKey));
    }
  }
  return entries;
}
