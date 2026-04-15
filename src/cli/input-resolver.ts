import { readFileSync } from 'node:fs';
import type { ValidatedCommand } from '../types/index.js';

export class InputResolverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputResolverError';
  }
}

/**
 * Reads all available bytes from a Readable stream and resolves with the result.
 * Used to consume stdin when it is piped (not a TTY).
 */
export function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer | string) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    stream.on('error', reject);
  });
}

/**
 * Resolves the variable map for a command according to the Input Resolution Order
 * defined in spec §2 (highest priority first):
 *
 *   1. CLI --var key=value flags
 *   2. stdin (piped text)  → mapped to `input_spec.var`
 *   3. File  (input.from: file, --input-file <path> or input.path)
 *   4. Default value defined in YAML (input.default)
 *
 * Returns a Record<string, string> ready to pass to the Renderer.
 */
export async function resolveInput(
  command: ValidatedCommand,
  opts: {
    /** Values from --var key=value (may be supplied multiple times). */
    vars: string[];
    /** Value from --input flag (maps to input_spec.var, treated as args source). */
    inputArg?: string;
    /** Path from --input-file flag (used when input.from === 'file'). */
    inputFile?: string;
    /** Whether stdin is available (i.e. !process.stdin.isTTY). */
    hasStdin: boolean;
    /** Injectable stdin stream for testing. Defaults to process.stdin. */
    stdin?: NodeJS.ReadableStream;
  },
): Promise<Record<string, string>> {
  const variables: Record<string, string> = {};
  const { input_spec } = command;

  // Priority 4 — YAML default (lowest priority, applied first so higher ones can override)
  if (input_spec.default !== undefined) {
    variables[input_spec.var] = input_spec.default;
  }

  // Priority 3 — File source
  if (input_spec.from === 'file') {
    const filePath = opts.inputFile ?? input_spec.path;
    if (filePath) {
      try {
        variables[input_spec.var] = readFileSync(filePath, 'utf-8');
      } catch (e) {
        throw new InputResolverError(
          `Cannot read input file: ${filePath} — ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  // Priority 2 — stdin (piped)
  if (opts.hasStdin) {
    const stream = opts.stdin ?? process.stdin;
    const text = await readStream(stream);
    variables[input_spec.var] = text;
  }

  // Priority 2 (args source) — --input flag maps to the primary input variable
  if (opts.inputArg !== undefined) {
    variables[input_spec.var] = opts.inputArg;
  }

  // Priority 1 — --var key=value flags (highest priority, applied last)
  for (const pair of opts.vars) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) {
      throw new InputResolverError(
        `Invalid --var format: "${pair}". Expected "key=value".`,
      );
    }
    const key = pair.slice(0, eqIdx);
    const value = pair.slice(eqIdx + 1);
    variables[key] = value;
  }

  return variables;
}
