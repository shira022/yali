import { z } from 'zod';
import type { ProviderName, ValidatedCommand } from '../types/index.js';

const PROVIDER_VALUES = ['openai', 'anthropic', 'google', 'ollama'] as const;

const ModelSpecSchema = z.preprocess(
  (val) => (typeof val === 'string' ? { name: val } : val),
  z.object({
    name: z.string(),
    provider: z.enum(PROVIDER_VALUES).optional(),
    temperature: z.number().optional(),
    max_tokens: z.number().int().optional(),
  })
);

const StepSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  model: ModelSpecSchema,
  depends_on: z.array(z.string()).default([]),
});

const InputSpecSchema = z.object({
  from: z.enum(['stdin', 'args', 'file']),
  var: z.string(),
  default: z.string().optional(),
  path: z.string().optional(),
});

const OutputSpecSchema = z.object({
  format: z.enum(['text', 'markdown', 'json']),
  target: z.enum(['stdout', 'file']),
  path: z.string().optional(),
}).refine(
  (val) => val.target !== 'file' || val.path !== undefined,
  { message: 'output.path is required when output.target is "file"' },
);

const ToolSpecSchema = z.object({
  type: z.string(),
  server: z.string().optional(),
  allowed_actions: z.array(z.string()).optional(),
});

const RawCommandSchema = z.object({
  name: z.string().optional(),
  version: z.string().optional(),
  model: z.union([z.string(), z.object({ name: z.string() }).passthrough()]).optional(),
  prompt: z.string().optional(),
  steps: z.array(z.unknown()).optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  tools: z.array(z.unknown()).optional(),
});

export const ValidatedCommandSchema: z.ZodType<ValidatedCommand, z.ZodTypeDef, unknown> = z
  .unknown()
  .transform((raw, ctx) => {
    const parsed = RawCommandSchema.safeParse(raw);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => ctx.addIssue(issue));
      return z.NEVER;
    }

    const data = parsed.data;

    // Resolve steps
    let steps: ValidatedCommand['steps'];
    if (data.steps !== undefined && data.prompt !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Cannot specify both "prompt" and "steps" in the same YAML file' });
      return z.NEVER;
    } else if (data.steps !== undefined) {
      const stepsResult = z.array(StepSchema).safeParse(data.steps);
      if (!stepsResult.success) {
        stepsResult.error.issues.forEach((issue) => ctx.addIssue(issue));
        return z.NEVER;
      }
      steps = stepsResult.data;
    } else if (data.prompt !== undefined) {
      const modelRaw = data.model ?? 'gpt-4o';
      const modelResult = ModelSpecSchema.safeParse(modelRaw);
      if (!modelResult.success) {
        modelResult.error.issues.forEach((issue) => ctx.addIssue(issue));
        return z.NEVER;
      }
      steps = [{ id: 'step0', prompt: data.prompt, model: modelResult.data, depends_on: [] }];
    } else {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must provide either "prompt" or "steps"' });
      return z.NEVER;
    }

    // Resolve top-level provider and propagate to steps
    let topLevelProvider: ProviderName | undefined;
    if (data.model !== undefined) {
      const topLevelModelResult = ModelSpecSchema.safeParse(data.model);
      if (topLevelModelResult.success) {
        topLevelProvider = topLevelModelResult.data.provider;
      }
    }
    steps = steps.map(step => ({
      ...step,
      model: {
        ...step.model,
        provider: step.model.provider ?? topLevelProvider ?? 'openai',
      },
    }));

    // Resolve input_spec
    let input_spec: ValidatedCommand['input_spec'];
    if (data.input !== undefined) {
      const inputResult = InputSpecSchema.safeParse(data.input);
      if (!inputResult.success) {
        inputResult.error.issues.forEach((issue) => ctx.addIssue(issue));
        return z.NEVER;
      }
      input_spec = inputResult.data;
    } else {
      input_spec = { from: 'stdin', var: 'input' };
    }

    // Resolve output_spec
    let output_spec: ValidatedCommand['output_spec'];
    if (data.output !== undefined) {
      const outputResult = OutputSpecSchema.safeParse(data.output);
      if (!outputResult.success) {
        outputResult.error.issues.forEach((issue) => ctx.addIssue(issue));
        return z.NEVER;
      }
      output_spec = outputResult.data;
    } else {
      output_spec = { format: 'text', target: 'stdout' };
    }

    // Resolve tools
    let tools: ValidatedCommand['tools'];
    if (data.tools !== undefined) {
      const toolsResult = z.array(ToolSpecSchema).safeParse(data.tools);
      if (!toolsResult.success) {
        toolsResult.error.issues.forEach((issue) => ctx.addIssue(issue));
        return z.NEVER;
      }
      tools = toolsResult.data;
    }

    const result: ValidatedCommand = {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.version !== undefined && { version: data.version }),
      steps,
      input_spec,
      output_spec,
      ...(tools !== undefined && { tools }),
    };

    return result;
  });
