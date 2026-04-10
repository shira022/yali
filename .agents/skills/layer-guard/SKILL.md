---
name: layer-guard
description: Detects architecture boundary violations in the Parser/Renderer/Executor 3-layer model. Use when reviewing or implementing any code change.
---

# layer-guard

## When to Use

Invoke this skill whenever you:
- Implement a new feature in any layer (Parser, Renderer, Executor, CLI)
- Review a PR or diff that touches multiple files
- Are unsure whether a piece of logic belongs in the current layer

## Layer Checklist

### CLI Layer

| Check | Allowed | Forbidden |
|---|---|---|
| Argument parsing | ✅ | |
| stdin detection | ✅ | |
| Exit code management | ✅ | |
| Direct YAML parsing | | ❌ |
| LLM API calls | | ❌ |
| Template expansion | | ❌ |

### Parser

| Check | Allowed | Forbidden |
|---|---|---|
| Read YAML file | ✅ | |
| Detect and report syntax errors | ✅ | |
| Normalize `model: string` → `model: { name: string }` | ✅ | |
| Promote `prompt: "..."` → `steps: [{ prompt: "..." }]` | ✅ | |
| Validate against JSON Schema | ✅ | |
| Return `ValidatedCommand` | ✅ | |
| Call LLM API | | ❌ |
| Expand `{{variable}}` templates | | ❌ |
| Write to stdout/file | | ❌ |
| Reference YAML from outside this layer | | ❌ |

### Renderer

| Check | Allowed | Forbidden |
|---|---|---|
| Accept `ValidatedCommand` + variable map as input | ✅ | |
| Expand `{{variable}}` references | ✅ | |
| Resolve dependency graph for multi-step commands | ✅ | |
| Return expanded prompt string(s) | ✅ | |
| Any network call | | ❌ |
| Any file I/O | | ❌ |
| Calling the LLM API | | ❌ |
| Reading environment variables | | ❌ |
| Random number generation | | ❌ |

### Executor

| Check | Allowed | Forbidden |
|---|---|---|
| Initialize LLM API client | ✅ | |
| Call LLM API (including retries) | ✅ | |
| Handle streaming responses | ✅ | |
| Manage rate limits and errors | ✅ | |
| Dispatch multi-step steps | ✅ | |
| Convert and write output (text/json/markdown) | ✅ | |
| Return `ExecutionResult` | ✅ | |
| Parsing YAML | | ❌ |
| Expanding templates directly (must use Renderer) | | ❌ |

## Step-by-Step Check Procedure

1. **Identify the file's layer** — check the file path (e.g., `src/parser/`, `src/renderer/`, `src/executor/`).
2. **Scan imports** — verify no cross-layer imports violate the call flow (`CLI Layer` calls `Parser`, which hands off to `Renderer`, which hands off to `Executor`). Imports must never skip layers or flow in reverse (e.g., Parser must not import from Executor).
3. **Apply the checklist above** for the identified layer.
4. **Check the `ValidatedCommand` boundary** — ensure Parser outputs it and Renderer/Executor consume it; raw YAML must not cross this boundary.
5. **Check for side effects in Renderer** — any `fs`, `fetch`, `process.env`, or `Math.random` call inside the Renderer is a violation.
6. **Check for LLM API calls outside Executor** — search for `openai`, `fetch` (to LLM endpoints), or SDK client usage in Parser or Renderer files.

## Automated Check (Approach γ)

> **Note:** `scripts/check-layers.sh` will be added in a future iteration (Approach γ) to automate steps 2–6 above. Once available, run it as part of your pre-commit check:
>
> ```bash
> bash scripts/check-layers.sh
> ```

## Pass / Fail Criteria

- **Pass**: All checklist items for the relevant layer are satisfied; no cross-layer violations found.
- **Fail**: Any forbidden action is present in a layer, or a cross-layer import violates the dependency direction.
