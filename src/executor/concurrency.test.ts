import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// We test concurrency.ts in isolation, mocking config/paths so the locks
// directory is written to a temp folder, not the real ~/.config/yali.
// ---------------------------------------------------------------------------

const tmpDir = join(os.tmpdir(), `yali-concurrency-test-${process.pid}`);
const tmpLocksDir = join(tmpDir, 'locks');
const tmpConfigFile = join(tmpDir, 'config.yaml');

vi.mock('../config/paths.js', () => ({
  getConfigPath: () => tmpConfigFile,
}));

// Import after mocking
const { ConcurrencyLock, getLockDir, getMaxConcurrent, cleanStaleLocks, DEFAULT_MAX_CONCURRENT } =
  await import('./concurrency.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function lockCount(): number {
  if (!existsSync(tmpLocksDir)) return 0;
  return readdirSync(tmpLocksDir).filter((f) => f.endsWith('.lock')).length;
}

function writeFakeLock(pid: number, createdAtMs?: number): void {
  mkdirSync(tmpLocksDir, { recursive: true, mode: 0o700 });
  const ts = createdAtMs ?? Date.now();
  writeFileSync(join(tmpLocksDir, `${pid}.lock`), `${pid}:${ts}`, 'utf-8');
}

function clearLocks(): void {
  if (!existsSync(tmpLocksDir)) return;
  for (const f of readdirSync(tmpLocksDir)) {
    unlinkSync(join(tmpLocksDir, f));
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ConcurrencyLock', () => {
  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
    clearLocks();
  });

  afterEach(() => {
    clearLocks();
  });

  it('getLockDir returns path derived from config path', () => {
    expect(getLockDir()).toBe(tmpLocksDir);
  });

  it('getMaxConcurrent returns DEFAULT_MAX_CONCURRENT when config is absent', () => {
    expect(getMaxConcurrent()).toBe(DEFAULT_MAX_CONCURRENT);
    expect(DEFAULT_MAX_CONCURRENT).toBe(3);
  });

  describe('acquire / release — normal flow', () => {
    it('creates a lock file on acquire and removes it on release', () => {
      const lock = new ConcurrencyLock();
      expect(lockCount()).toBe(0);

      lock.acquire();
      expect(lockCount()).toBe(1);

      lock.release();
      expect(lockCount()).toBe(0);
    });

    it('release is idempotent — safe to call multiple times', () => {
      const lock = new ConcurrencyLock();
      lock.acquire();
      lock.release();
      expect(() => lock.release()).not.toThrow();
      expect(lockCount()).toBe(0);
    });
  });

  describe('concurrency limit enforcement', () => {
    it('allows acquire when below the limit (max-1 existing locks)', () => {
      // Pre-fill max-1 fake locks with alive PIDs to stay just under the limit
      const max = DEFAULT_MAX_CONCURRENT;
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      for (let i = 1; i <= max - 1; i++) {
        writeFakeLock(process.pid + i);
      }

      // With max-1 "alive" locks + ours = max total → still within limit, should not throw
      const lock = new ConcurrencyLock();
      expect(() => lock.acquire()).not.toThrow();
      lock.release();

      killSpy.mockRestore();
    });

    it('throws ExecutorError when active locks equal max (via kill mock)', () => {
      // Pre-fill the lock directory with max fake lock files using PID+offset names.
      // Mock process.kill so all fake PIDs appear alive (not cleaned as stale).
      const max = DEFAULT_MAX_CONCURRENT;
      for (let i = 1; i <= max; i++) {
        writeFakeLock(process.pid + i);
      }

      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
      const lock = new ConcurrencyLock();

      // locks dir has max "alive" locks; adding ours makes max+1 → over limit
      expect(() => lock.acquire()).toThrow(/Maximum concurrent yali processes/);
      expect(() => lock.acquire()).toThrow(/concurrency\.max/);

      killSpy.mockRestore();
      clearLocks();
    });
  });

  describe('stale lock cleanup', () => {
    it('removes lock files for non-existent PIDs (ESRCH)', () => {
      // Use a PID that almost certainly doesn't exist
      const deadPid = 9_999_998;
      writeFakeLock(deadPid);
      expect(lockCount()).toBe(1);

      cleanStaleLocks(tmpLocksDir);
      expect(lockCount()).toBe(0);
    });

    it('keeps lock files for existing PIDs', () => {
      writeFakeLock(process.pid);
      expect(lockCount()).toBe(1);

      cleanStaleLocks(tmpLocksDir);
      // process.pid is alive — lock should remain
      expect(lockCount()).toBe(1);

      // Clean up manually
      clearLocks();
    });

    it('removes lock files older than 24 hours regardless of PID state', () => {
      const oldTs = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      writeFakeLock(process.pid, oldTs);
      expect(lockCount()).toBe(1);

      cleanStaleLocks(tmpLocksDir);
      // Even though PID is alive, timestamp is too old → stale → removed
      expect(lockCount()).toBe(0);
    });

    it('does not throw when locks directory does not exist', () => {
      const nonExistentDir = join(tmpDir, 'no-such-dir');
      expect(() => cleanStaleLocks(nonExistentDir)).not.toThrow();
    });
  });

  describe('security: EPERM handling', () => {
    it('keeps lock file when process.kill throws EPERM', () => {
      writeFakeLock(42);
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        const err = Object.assign(new Error('EPERM'), { code: 'EPERM' });
        throw err;
      });

      cleanStaleLocks(tmpLocksDir);
      // EPERM means process exists (can't signal) — lock should be kept
      expect(lockCount()).toBe(1);

      killSpy.mockRestore();
      clearLocks();
    });
  });

  describe('getMaxConcurrent — config value', () => {
    it('returns configured value when concurrency.max is set in config.yaml', () => {
      // Write a config file with concurrency.max: 7
      writeFileSync(tmpConfigFile, 'concurrency:\n  max: 7\n', 'utf-8');

      const result = getMaxConcurrent();
      expect(result).toBe(7);

      // Cleanup
      try { unlinkSync(tmpConfigFile); } catch { /* ignore */ }
    });
  });

  describe('acquire — EEXIST path', () => {
    it('overwrites stale same-PID lock file when O_EXCL throws EEXIST', () => {
      // Pre-write a lock file for the current PID (simulates a previous crash without cleanup)
      writeFakeLock(process.pid);
      expect(lockCount()).toBe(1);

      // acquire() should handle EEXIST gracefully and overwrite
      const lock = new ConcurrencyLock();
      expect(() => lock.acquire()).not.toThrow();
      // Still only 1 lock file (the overwritten one)
      expect(lockCount()).toBe(1);

      lock.release();
      expect(lockCount()).toBe(0);
    });
  });
});
