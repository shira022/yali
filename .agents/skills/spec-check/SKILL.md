---
name: spec-check
description: Verifies that the current implementation is consistent with docs/spec_draft.md. Use before opening a PR or when reviewing existing code.
---

# spec-check

## When to Use

Invoke this skill:
- Before opening a PR to verify consistency with the spec.
- When reviewing existing code to identify spec drift.
- When implementing a feature to confirm the expected contract.

## Checklist

Work through each section of [`docs/spec_draft.md`](../../../docs/spec_draft.md) and verify the implementation matches.

---

### Section 1: YAML Schema Normalization (spec §1)

| Check | Expected Behavior | Status |
|---|---|---|
| Minimal config (`prompt` + `model` as string) is accepted | Parser normalizes to standard form | ☐ |
| `model: gpt-4o` (string) is normalized | → `model: { name: "gpt-4o" }` (object) | ☐ |
| `prompt: "..."` alone (no `steps`) is normalized | → `steps: [{ id: auto, prompt: "..." }]` | ☐ |
| Extended config with `steps[]` and `depends_on` is parsed | Each step has `id`, `prompt`, `model`, `depends_on` | ☐ |
| `tools:` top-level key does not break existing parsing | Parsed into `ToolSpec[]` on `ValidatedCommand` | ☐ |
| `output.format` defaults applied | `text` if not specified | ☐ |
| `output.target` defaults applied | `stdout` if not specified | ☐ |

---

### Section 2: I/O Abstraction (spec §2)

| Check | Expected Behavior | Status |
|---|---|---|
| Input resolution order is respected | CLI args > stdin > file > default | ☐ |
| `input.from: stdin` maps to `{{input}}` template variable | Full stdin text is bound | ☐ |
| `input.from: args` maps to `--input "..."` CLI flag | Flag value is bound to `{{input}}` | ☐ |
| `input.from: file` maps to `--input path/to/file.txt` | File contents are bound to `{{input}}` | ☐ |
| `--var key=value` flags coexist with `input.from` | `{{key}}` is resolved from `--var` | ☐ |
| Multi-step: `steps.X.output` is available in subsequent steps | `{{steps.X.output}}` resolves to step X's output | ☐ |
| `output.format: json` enables downstream pipe integration | Output is valid JSON | ☐ |

---

### Section 3: Layer Responsibilities (spec §3)

| Check | Expected Behavior | Status |
|---|---|---|
| Parser returns `ValidatedCommand` | Typed internal object, YAML-independent | ☐ |
| Parser is the only layer that reads YAML | No other layer imports or parses YAML | ☐ |
| Renderer is a pure function | No network, no file I/O, no env reads | ☐ |
| Renderer accepts `ValidatedCommand` + variable map | Does not re-read YAML or CLI args | ☐ |
| Renderer returns expanded prompt string(s) | Or an ordered Step array for multi-step | ☐ |
| Executor is the only layer that calls the LLM API | Parser and Renderer have no SDK imports | ☐ |
| Executor handles retries and rate limits | Not delegated to CLI or Parser | ☐ |
| Executor returns `ExecutionResult` | Contains exit code and output content | ☐ |

---

## Pass / Fail Criteria

- **Pass**: All checklist items are marked ✅; no spec drift found.
- **Fail**: Any item is marked ❌ or reveals unimplemented behavior. File a follow-up Issue or fix inline before merging.

## Notes

- If the spec itself is ambiguous or incomplete for the area you are checking, open a discussion or update `docs/spec_draft.md` before proceeding.
- The spec is versioned at `v0.1`. Reference the version in your PR description if the check reveals a spec gap.
