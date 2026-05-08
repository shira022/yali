import { z } from 'zod';

export const ProviderConfigSchema = z.object({
  api_key: z.string().optional(),
  base_url: z.string().optional(),
});

export const YaliConfigSchema = z.object({
  openai: ProviderConfigSchema.optional(),
  anthropic: ProviderConfigSchema.optional(),
  google: ProviderConfigSchema.optional(),
  ollama: ProviderConfigSchema.optional(),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type YaliConfig = z.infer<typeof YaliConfigSchema>;
