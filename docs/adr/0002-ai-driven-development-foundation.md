# ADR 0002: Use AGENTS.md and SKILL.md as the Universal AI-Driven Development Foundation

- **Date**: 2026-04-09
- **Status**: Accepted

---

## Context

- The `yali` project will be developed primarily using AI coding agents (Claude Code, GitHub Copilot Coding Agent, OpenAI Codex CLI, Cursor, and others).
- Multiple agents need a consistent, shared understanding of the project architecture and conventions to avoid conflicting implementations.
- Agent-specific files (`CLAUDE.md`, `copilot-instructions.md`, `.claude/`, etc.) create maintenance overhead and lead to inconsistency between agents — each agent ends up with a slightly different view of the project.
- The `SKILL.md` open standard ([agentskills.io](https://agentskills.io)) is now supported by all major agents as of late 2025, providing a universal skill format for reusable agent instructions.

---

## Decision

1. Use `AGENTS.md` (project root) as the **single source of truth** for all AI agents — no agent-specific config files.
2. Use `.agents/skills/*/SKILL.md` as the **universal skill format** for reusable, composable agent instructions.
3. Integrate AI instructions into GitHub Issue templates via an **"AI Agent Instructions"** section, so each Issue serves as an agent task brief.
4. Explicitly prohibit `CLAUDE.md`, `copilot-instructions.md`, agent-specific directories, and any other agent-specific config files.

---

## Consequences

### Positive

- ✅ One file (`AGENTS.md`) to update → all agents reflect the change immediately.
- ✅ New agents can onboard without any configuration changes.
- ✅ Skills (`.agents/skills/`) are reusable across projects and can be promoted to user-scope (`~/.agents/skills/`).
- ✅ Issue templates serve as structured agent task briefs, reducing ambiguity.
- ✅ The approach is transparent and auditable — all agent instructions are in version-controlled Markdown.

### Negative / Trade-offs

- ⚠️ Agent-specific advanced features (e.g., Claude hooks, Copilot prompt files, Cursor rules) are not leverageable under this approach.
- ⚠️ `AGENTS.md` can grow large as the project scales — requires periodic pruning and extraction into skills.

---

## Alternatives Considered

### Agent-specific config files per agent

Maintain `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, etc.

**Rejected**: High maintenance burden. Inconsistencies inevitably appear between files. Adding a new agent requires a new file.

### Centralized `docs/ai/` directory with modular prompt files

Place architecture context, conventions, and instructions in a `docs/ai/` directory.

**Rejected**: Agents do not auto-load subdirectory files uniformly. Each agent requires explicit configuration to reference files outside a few well-known locations (`AGENTS.md`, `README.md`, etc.), negating the benefit of modular organization.

---

## References

- [`docs/spec-draft.md`](../spec-draft.md) — yali Foundation Spec v0.1
- [`AGENTS.md`](../../AGENTS.md) — Universal AI agent guide for this project
- [agentskills.io](https://agentskills.io) — SKILL.md open standard specification
