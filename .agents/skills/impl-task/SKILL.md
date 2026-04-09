---
name: impl-task
description: Standard procedure for implementing a feature from a GitHub Issue. Use when starting any new implementation task.
---

# impl-task

## When to Use

Invoke this skill at the start of every new implementation task that originates from a GitHub Issue.

## Step-by-Step Implementation Workflow

### Step 1 — Read the Issue and Identify the Target Layer

- Open the GitHub Issue and read the description and AI Agent Instructions section.
- Determine which layer(s) are affected:
  - **Parser** — YAML loading, normalization, validation
  - **Renderer** — template expansion, variable resolution, dependency graph
  - **Executor** — LLM API calls, output formatting, streaming
  - **CLI Layer** — argument parsing, stdin detection, exit codes
- Note the `spec-section:` field in the Issue template to find the relevant part of the spec.

### Step 2 — Reference `docs/spec_draft.md`

- Open [`docs/spec_draft.md`](../../../docs/spec_draft.md) and read the section referenced in the Issue.
- Confirm your understanding of:
  - The expected input/output contract for the layer.
  - Any normalization or promotion rules (Parser).
  - Side-effect restrictions (Renderer: none allowed).
  - The `ValidatedCommand` type definition (Appendix).

### Step 3 — Create a Branch

```bash
git checkout -b feature/issue-<number>-<short-description>
```

Examples:
- `feature/issue-3-yaml-parser`
- `feature/issue-5-template-renderer`

### Step 4 — Implement with Single Responsibility per Layer

- Place code in the correct directory for the target layer.
- Do **not** mix concerns across layers in a single file or function.
- Each function should have a single, clear purpose.
- Follow the layer invariants defined in `AGENTS.md`.

### Step 5 — Run `layer-guard` Skill

After implementation, invoke the `layer-guard` skill to verify:
- No architecture boundary violations.
- No forbidden actions in the target layer.
- The `ValidatedCommand` boundary is respected.

### Step 6 — Write Tests

- Tests are **mandatory for the Renderer** (pure function — no mocks needed).
- Use the `write-test` skill for per-layer test strategy guidance.
- Place tests alongside source files or in a dedicated `__tests__/` directory, following existing project conventions.

### Step 7 — Commit with Conventional Commits Format

```
feat: <short description of what was added>
fix:  <short description of what was fixed>
test: <short description of tests added>
```

Include a body if needed:
```
feat: implement YAML parser with schema normalization

- Normalizes model: string → model: { name: string }
- Promotes prompt: "..." → steps: [{ prompt: "..." }]
- Validates against JSON Schema and returns ValidatedCommand

Closes #3
```

### Step 8 — Open PR Linked to the Issue

- PR title: use the Conventional Commits format matching the commit message.
- PR description must include `Closes #<number>`.
- Ensure all CI checks pass before requesting a review.
- Keep PRs focused — one logical change per PR.

## Quick Reference

| Step | Action |
|---|---|
| 1 | Read Issue → identify target layer |
| 2 | Read `docs/spec_draft.md` relevant section |
| 3 | Create branch `feature/issue-<N>-<desc>` |
| 4 | Implement with single responsibility |
| 5 | Run `layer-guard` skill |
| 6 | Write tests (mandatory for Renderer) |
| 7 | Commit with Conventional Commits |
| 8 | Open PR with `Closes #<N>` |
