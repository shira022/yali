# AGENTS.md — yali AI Development Guide

> Single source of truth for all AI coding agents (Claude Code, GitHub Copilot, OpenAI Codex CLI, Cursor, and others).

---

## Project Overview

**yali** (YAML LLM Interface) is an open-source CLI tool that lets you define LLM commands in YAML and run them from the terminal.

```bash
yali run translate.yaml --input "Hello, world"
```

- **Language**: TypeScript (Node.js 20+)
- **Package manager**: npm
- **Test framework**: Vitest
- **LLM SDK**: openai (npm)
- **Full spec**: [`docs/spec_draft.md`](docs/spec_draft.md)

---

## Architecture Law (Immutable)

yali enforces a strict **3-layer pipeline**. Every agent must understand and respect these boundaries.

```
CLI Layer → Parser → Renderer → Executor
```

### Layer Invariants

| Layer | Responsibility | Invariants |
|---|---|---|
| **CLI Layer** | Argument parsing, stdin detection, exit codes | Entry point only. Passes data to Parser. |
| **Parser** | Read YAML → Normalize → Validate → Return `ValidatedCommand` | ❌ Never calls LLM API. ❌ Never references YAML outside this layer. |
| **Renderer** | Expand `{{variable}}` templates → Return final prompt string(s) | ✅ Pure function. ❌ Zero side effects. ❌ Zero I/O. |
| **Executor** | Call LLM API → Format output → Write to target | ✅ The **only** layer that performs I/O. |

### Key Types

- **`ValidatedCommand`** — the DMZ between YAML schema and LLM API (see spec Appendix)
- **`ExecutionResult`** — returned by Executor (exit code + output content)

### Do NOT Rules

- ❌ Never call the LLM API outside the Executor layer.
- ❌ Never reference raw YAML outside the Parser layer.
- ❌ Never add side effects (file I/O, network calls, randomness) to the Renderer.
- ❌ Never create agent-specific config files (`CLAUDE.md`, `copilot-instructions.md`, `.claude/`, etc.).
- ❌ Never bypass the `ValidatedCommand` interface between Parser and Renderer.

---

## Available Skills

Skills live in `.agents/skills/` and follow the [agentskills.io](https://agentskills.io) `SKILL.md` standard.

| Skill | Path | When to Use |
|---|---|---|
| `layer-guard` | [`.agents/skills/layer-guard/SKILL.md`](.agents/skills/layer-guard/SKILL.md) | When reviewing or implementing any code change — detects architecture boundary violations. |
| `impl-task` | [`.agents/skills/impl-task/SKILL.md`](.agents/skills/impl-task/SKILL.md) | When starting any new implementation task from a GitHub Issue. |
| `spec-check` | [`.agents/skills/spec-check/SKILL.md`](.agents/skills/spec-check/SKILL.md) | Before opening a PR or when reviewing existing code against the spec. |
| `write-test` | [`.agents/skills/write-test/SKILL.md`](.agents/skills/write-test/SKILL.md) | When adding or reviewing tests for any layer. |

---

## Implementation Workflow

When assigned a GitHub Issue, follow this sequence:

1. **Read the Issue** — identify the target layer (Parser / Renderer / Executor / CLI Layer).
2. **Invoke `impl-task` skill** — follow its step-by-step procedure.
3. **Reference `docs/spec_draft.md`** — find the relevant section before writing any code.
4. **Create a branch** — `feature/issue-<number>-<short-description>`.
5. **Implement** — single responsibility per layer; do not mix concerns.
6. **Run `layer-guard` skill** — verify no architecture violations.
7. **Write tests** — mandatory for Renderer (pure function); use `write-test` skill for guidance.
8. **Commit** — use Conventional Commits format (see below).
9. **Open PR** — include `Closes #<number>` in the description.

---

## Commit Convention (Conventional Commits)

```
feat:      add new feature
fix:       fix a bug
docs:      documentation changes only
test:      add or update tests
refactor:  code change that neither fixes a bug nor adds a feature
ci:        CI/CD pipeline changes
chore:     build process or tooling changes
```

Examples:
```
feat: implement YAML parser with schema normalization
fix: handle empty stdin gracefully in input resolver
test: add pure-function unit tests for Renderer
docs: add ADR for AI-driven development foundation
```

---

## Branch Naming

```
feature/issue-<number>-<short-description>
fix/issue-<number>-<short-description>
docs/issue-<number>-<short-description>
```

---

## References

- **Full spec**: [`docs/spec_draft.md`](docs/spec_draft.md)
- **ADRs**: [`docs/adr/`](docs/adr/)
- **Contributing guide**: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- **Skills**: [`.agents/skills/`](.agents/skills/)
