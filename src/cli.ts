#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { parseCommand } from './parser/index.js';
import { orderSteps, renderStep } from './renderer/index.js';
import { execute } from './executor/index.js';
import { resolveInput, InputResolverError } from './cli/input-resolver.js';
import { formatDryRun } from './cli/dry-run-formatter.js';
import { handleConfigCommand } from './config/manager.js';

function printUsage(stream: NodeJS.WriteStream = process.stdout): void {
  stream.write(
    [
      'Usage: yali run <command.yaml> [options]',
      '',
      'Options:',
      '  --input <value|path>        Set the primary input variable, or file path when input.from is "file"',
      '  --input-file <path>         Read a file as the primary input variable (avoids PowerShell pipe encoding issues)',
      '  --var <key=value>          Set an arbitrary template variable (repeatable)',
      '  --dry-run                  Render prompts without calling the LLM',
      '  --format <text|json>       Output format for --dry-run (default: text)',
      '  --help                     Show this help message',
      '',
    ].join('\n'),
  );
}

export async function main(): Promise<void> {
  // Handle `yali config` before generic arg parsing (config has its own arg structure)
  const rawArgs = process.argv.slice(2);
  if (rawArgs[0] === 'config') {
    await handleConfigCommand(rawArgs.slice(1));
    process.exit(0);
  }

  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      input: { type: 'string' },
      'input-file': { type: 'string' },
      var: { type: 'string', multiple: true },
      'dry-run': { type: 'boolean', default: false },
      format: { type: 'string', default: 'text' },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  // Expect: yali run <file.yaml>
  if (positionals[0] !== 'run' || !positionals[1]) {
    printUsage(process.stderr);
    process.exit(1);
  }

  const filePath = positionals[1];
  const dryRun = values['dry-run'] ?? false;
  const outputFormat = values['format'] === 'json' ? 'json' : 'text';
  const vars = values['var'] ?? [];

  // Step 1 — Parse
  let command;
  try {
    command = parseCommand(filePath);
  } catch (e) {
    process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  }

  // Step 2 — Resolve input variables
  const hasStdin = !process.stdin.isTTY;
  let variables: Record<string, string>;
  try {
    variables = await resolveInput(command, {
      vars,
      inputArg: values['input'],
      inputFileArg: values['input-file'],
      hasStdin,
    });
  } catch (e) {
    if (e instanceof InputResolverError) {
      process.stderr.write(`Error: ${e.message}\n`);
    } else {
      process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
    }
    process.exit(1);
  }

  // Step 3a — Dry-run: render only, no LLM call
  if (dryRun) {
    try {
      const orderedSteps = orderSteps(command);
      const renderedSteps = orderedSteps.map((step) => renderStep(step, variables));
      const output = formatDryRun(renderedSteps, outputFormat);
      process.stdout.write(output);
      if (!output.endsWith('\n')) {
        process.stdout.write('\n');
      }
    } catch (e) {
      process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    }
    process.exit(0);
  }

  // Step 3b — Execute (calls LLM)
  const result = await execute(command, variables);
  if (result.exitCode !== 0) {
    process.stderr.write(`Error: ${result.output}\n`);
  }
  process.exit(result.exitCode);
}

import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

// Only call main() when this file is the direct entry point (not when imported by tests).
// realpathSync resolves Windows Junction symlinks created by `npm link`, ensuring
// process.argv[1] and import.meta.url compare against the same canonical path.
const isEntryPoint = (() => {
  try {
    return realpathSync(process.argv[1]!) === fileURLToPath(import.meta.url);
  } catch {
    return process.argv[1] === fileURLToPath(import.meta.url);
  }
})();
if (isEntryPoint) {
  main();
}
