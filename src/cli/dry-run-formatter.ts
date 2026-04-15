import type { RenderedStep } from '../renderer/index.js';

/**
 * Formats the output of a --dry-run invocation.
 * Default is plain text for human readability; pass format='json' for machine-readable output.
 */
export function formatDryRun(
  steps: RenderedStep[],
  format: 'text' | 'json' = 'text',
): string {
  if (format === 'json') {
    return JSON.stringify(
      {
        steps: steps.map((s) => ({
          id: s.id,
          prompt: s.prompt,
          model: s.model,
          depends_on: s.depends_on,
        })),
      },
      null,
      2,
    );
  }

  // Plain text — human-readable
  return steps
    .map((s) => {
      const header = `=== Step: ${s.id} (model: ${s.model.name}) ===`;
      return `${header}\n${s.prompt}`;
    })
    .join('\n\n');
}
