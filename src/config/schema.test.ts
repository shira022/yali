import { describe, it, expect } from 'vitest';
import { ConcurrencyConfigSchema, YaliConfigSchema } from './schema.js';

describe('ConcurrencyConfigSchema', () => {
  describe('valid values', () => {
    it('accepts positive integer', () => {
      expect(ConcurrencyConfigSchema.safeParse({ max: 5 }).success).toBe(true);
    });

    it('accepts max: 1', () => {
      expect(ConcurrencyConfigSchema.safeParse({ max: 1 }).success).toBe(true);
    });

    it('accepts absent max (optional field)', () => {
      expect(ConcurrencyConfigSchema.safeParse({}).success).toBe(true);
    });
  });

  describe('invalid values', () => {
    it('rejects max: 0', () => {
      expect(ConcurrencyConfigSchema.safeParse({ max: 0 }).success).toBe(false);
    });

    it('rejects negative max', () => {
      expect(ConcurrencyConfigSchema.safeParse({ max: -1 }).success).toBe(false);
    });

    it('rejects non-integer (float)', () => {
      expect(ConcurrencyConfigSchema.safeParse({ max: 1.5 }).success).toBe(false);
    });

    it('rejects string value', () => {
      expect(ConcurrencyConfigSchema.safeParse({ max: 'five' }).success).toBe(false);
    });

    it('rejects null', () => {
      expect(ConcurrencyConfigSchema.safeParse({ max: null }).success).toBe(false);
    });
  });
});

describe('YaliConfigSchema — concurrency field', () => {
  it('accepts a full config with concurrency.max', () => {
    const result = YaliConfigSchema.safeParse({
      openai: { api_key: 'sk-test' },
      concurrency: { max: 5 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts config without concurrency key (backward compatible)', () => {
    const result = YaliConfigSchema.safeParse({
      openai: { api_key: 'sk-test' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid concurrency.max in full config', () => {
    const result = YaliConfigSchema.safeParse({
      concurrency: { max: -1 },
    });
    expect(result.success).toBe(false);
  });
});
