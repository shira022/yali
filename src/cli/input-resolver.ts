import { readFileSync } from 'node:fs';
import type { ValidatedCommand } from '../types/index.js';
import { validateInputValue, validateVarKey } from '../validator/index.js';

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
 *   1. CLI --var key=value flags  (always highest — any variable)
 *   2/3. Primary input source — determined by input_spec.from:
 *        - 'args'  → --input <value>
 *        - 'stdin' → piped stdin text
 *        - 'file'  → --input <path> (or input.path from YAML) read as file
 *   4. Default value defined in YAML (input.default)
 *
 * Returns a Record<string, string> ready to pass to the Renderer.
 */
export async function resolveInput(
  command: ValidatedCommand,
  opts: {
    /** Values from --var key=value (may be supplied multiple times). */
    vars: string[];
    /**
     * Value from --input flag.
     * - When input.from === 'args': used directly as the variable value.
     * - When input.from === 'file': treated as the file path to read.
     * - When input.from === 'stdin': ignored (stdin is used instead).
     */
    inputArg?: string;
    /**
     * Value from --input-file flag. Reads the specified file as UTF-8 and uses the content
     * as the primary input variable value — regardless of input.from setting.
     * This bypasses PowerShell pipe encoding issues for Japanese/CJK text on Windows.
     */
    inputFileArg?: string;
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

  // Priority 2/3 — Primary input source, gated by input.from (spec §2)
  if (input_spec.from === 'file') {
    // --input provides the file path; fall back to input.path from YAML
    const filePath = opts.inputArg ?? input_spec.path;
    if (filePath) {
      try {
        variables[input_spec.var] = readFileSync(filePath, 'utf-8');
      } catch (e) {
        throw new InputResolverError(
          `Cannot read input file: ${filePath} — ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    } else {
      throw new InputResolverError(
        'input.from is "file" but no file path was provided. Use --input <path> or set input.path in the YAML.',
      );
    }
  } else if (input_spec.from === 'stdin') {
    if (opts.hasStdin) {
      const stream = opts.stdin ?? process.stdin;
      variables[input_spec.var] = await readStream(stream);
    } else if (opts.inputArg !== undefined) {
      // Convenience fallback: when no stdin pipe but --input is provided,
      // use --input directly. Useful for dry-run and ad-hoc testing without piping.
      variables[input_spec.var] = opts.inputArg;
    }
  } else if (input_spec.from === 'args') {
    if (opts.inputArg !== undefined) {
      variables[input_spec.var] = opts.inputArg;
    }
  }

  // Priority 1.5 — --input-file flag: read file directly in Node.js (UTF-8), bypassing pipe encoding.
  // Applied after primary source so it overrides stdin/args, but before --var so --var can still override.
  if (opts.inputFileArg !== undefined) {
    try {
      variables[input_spec.var] = readFileSync(opts.inputFileArg, 'utf-8');
    } catch (e) {
      throw new InputResolverError(
        `Cannot read --input-file: ${opts.inputFileArg} — ${e instanceof Error ? e.message : String(e)}`,
      );
    }
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

    const keyResult = validateVarKey(key);
    if (!keyResult.valid) {
      throw new InputResolverError(keyResult.error!);
    }

    const valueResult = validateInputValue(value, `--var ${key}`);
    if (!valueResult.valid) {
      throw new InputResolverError(valueResult.error!);
    }

    variables[key] = value;
  }

  // Validate all resolved primary input values
  if (input_spec.var in variables) {
    const primaryResult = validateInputValue(variables[input_spec.var]!, `"${input_spec.var}" input`);
    if (!primaryResult.valid) {
      throw new InputResolverError(primaryResult.error!);
    }
  }

  return variables;
}
