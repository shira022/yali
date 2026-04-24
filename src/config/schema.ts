import { z } from 'zod';

export const ProviderConfigSchema = z.object({
  api_key: z.string().optional(),
  base_url: z.string().optional(),
});

export const ConcurrencyConfigSchema = z.object({
  /** Maximum number of concurrent yali processes. Defaults to 3. */
  max: z.number().int().positive().optional(),
});

export const YaliConfigSchema = z.object({
  openai: ProviderConfigSchema.optional(),
  anthropic: ProviderConfigSchema.optional(),
  google: ProviderConfigSchema.optional(),
  ollama: ProviderConfigSchema.optional(),
  concurrency: ConcurrencyConfigSchema.optional(),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type YaliConfig = z.infer<typeof YaliConfigSchema>;
