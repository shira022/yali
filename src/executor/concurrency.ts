import {
  mkdirSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  readFileSync,
  existsSync,
  openSync,
  closeSync,
  constants as fsConstants,
} from 'node:fs';
import { join } from 'node:path';
import { getConfigPath } from '../config/paths.js';
import { readConfig } from '../config/store.js';
import { ExecutorError } from './errors.js';

export const DEFAULT_MAX_CONCURRENT = 3;

/**
 * Maximum age (in milliseconds) of a lock file before it is considered stale,
 * even if the PID still appears to be alive (handles PID reuse).
 */
const STALE_LOCK_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Returns the directory where PID lock files are stored.
 * Derived from the yali config file location: ~/.config/yali/locks/
 */
export function getLockDir(): string {
  const configFilePath = getConfigPath();
  return join(configFilePath, '..', 'locks');
}

/**
 * Reads the configured maximum number of concurrent yali processes.
 * Falls back to DEFAULT_MAX_CONCURRENT if not set or on any error.
 */
export function getMaxConcurrent(): number {
  try {
    const config = readConfig(getConfigPath());
    const max = config.concurrency?.max;
    if (max !== undefined && max > 0) {
      return Math.floor(max);
    }
  } catch { /* ignore: config may not exist */ }
  return DEFAULT_MAX_CONCURRENT;
}

/**
 * Removes lock files that belong to processes that no longer exist (stale locks).
 *
 * Stale detection rules:
 * - Lock file content is `<pid>:<created_at_ms>`.
 * - If the PID does not exist (ESRCH), the lock is stale.
 * - If the lock file is older than STALE_LOCK_AGE_MS, it is considered stale
 *   regardless of PID state (handles PID reuse after 24 h).
 * - EPERM (can't signal the process) is treated as "process alive" — lock kept.
 */
export function cleanStaleLocks(lockDir: string): void {
  if (!existsSync(lockDir)) return;

  const files = readdirSync(lockDir).filter((f) => f.endsWith('.lock'));
  const now = Date.now();

  for (const file of files) {
    const lockFile = join(lockDir, file);
    try {
      const content = readFileSync(lockFile, 'utf-8').trim();
      const [pidStr, tsStr] = content.split(':');
      const pid = Number(pidStr);
      const createdAt = Number(tsStr);

      // If the lock file is too old, treat as stale (guards against PID reuse)
      if (!isNaN(createdAt) && now - createdAt > STALE_LOCK_AGE_MS) {
        unlinkSync(lockFile);
        continue;
      }

      if (!isNaN(pid)) {
        try {
          process.kill(pid, 0);
          // Process exists — keep the lock
        } catch (err: unknown) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === 'ESRCH') {
            // Process not found — remove stale lock
            unlinkSync(lockFile);
          }
          // EPERM: process exists but we can't signal it — treat as alive, keep lock
        }
      }
    } catch {
      // Failed to read/parse the lock file — leave it alone
    }
  }
}

/**
 * Manages a process-level concurrency lock for yali.
 *
 * Each yali process acquires a lock on startup and releases it on exit.
 * If the number of active locks would exceed the configured maximum,
 * acquire() throws an ExecutorError.
 *
 * Implementation uses the "create-then-count" strategy to minimise the
 * TOCTOU window: the PID lock file is written atomically (O_EXCL) before
 * checking the total count. If the count exceeds the limit, the newly
 * created lock is removed and an error is thrown.
 */
export class ConcurrencyLock {
  private readonly lockFile: string;
  private acquired = false;

  constructor() {
    this.lockFile = join(getLockDir(), `${process.pid}.lock`);
  }

  /**
   * Acquires the concurrency lock.
   * Throws ExecutorError if the configured maximum is already reached.
   */
  acquire(): void {
    const lockDir = getLockDir();
    mkdirSync(lockDir, { recursive: true, mode: 0o700 });

    // Create our own lock file atomically (O_EXCL prevents overwriting an existing file)
    try {
      const fd = openSync(
        this.lockFile,
        fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
        0o600,
      );
      writeFileSync(fd, `${process.pid}:${Date.now()}`, 'utf-8');
      closeSync(fd);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') {
        // A lock for this PID already exists (shouldn't happen in normal use)
        // Just overwrite it to update the timestamp
        writeFileSync(this.lockFile, `${process.pid}:${Date.now()}`, 'utf-8');
      } else {
        throw err;
      }
    }

    // Clean up stale locks now that ours is on disk
    cleanStaleLocks(lockDir);

    const maxConcurrent = getMaxConcurrent();
    const activeLockCount = readdirSync(lockDir).filter((f) => f.endsWith('.lock')).length;

    if (activeLockCount > maxConcurrent) {
      // We are over the limit — remove our own lock and fail
      try { unlinkSync(this.lockFile); } catch { /* ignore */ }
      throw new ExecutorError(
        `Maximum concurrent yali processes (${maxConcurrent}) reached. ` +
          `Use 'yali config set concurrency.max <n>' to increase the limit.`,
      );
    }

    this.acquired = true;
  }

  /**
   * Releases the concurrency lock by removing the PID lock file.
   * Safe to call multiple times.
   */
  release(): void {
    if (this.acquired && existsSync(this.lockFile)) {
      try {
        unlinkSync(this.lockFile);
      } catch { /* ignore: already deleted or race condition */ }
      this.acquired = false;
    }
  }
}
