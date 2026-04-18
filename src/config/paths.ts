import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Returns the OS-native path to the yali config file.
 *
 * - Linux/macOS: $XDG_CONFIG_HOME/yali/config.yaml (defaults to ~/.config/yali/config.yaml)
 * - Windows:     %APPDATA%\yali\config.yaml
 */
export function getConfigPath(): string {
  if (process.platform === 'win32') {
    const appData = process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming');
    return join(appData, 'yali', 'config.yaml');
  }

  const xdgConfigHome = process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config');
  return join(xdgConfigHome, 'yali', 'config.yaml');
}
