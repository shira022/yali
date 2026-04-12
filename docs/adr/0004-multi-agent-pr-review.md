# ADR 0004: Multi-Agent PR Review System

- **Date**: 2026-04-12
- **Status**: Accepted

---

## Context

`yali` is developed primarily by AI agents working on GitHub Issues (see ADR 0002). As the number of PRs grows, two problems emerge:

1. **No consistent review**: PRs submitted by an AI agent are not automatically reviewed — a human maintainer must check each one manually.
2. **Review quality gaps**: A single reviewer (human or AI) may miss issues in specific dimensions — architecture correctness, spec compliance, and test quality all require different expertise.

The goal is a fully automated PR review system where multiple independent agents review each PR from distinct perspectives, then iterate with the PR author until all issues are resolved.

### Key Constraints

- **Vendor-agnostic**: Must work with Claude Code, GitHub Copilot CLI, OpenAI Codex CLI, Cursor, and any future agent — no hard dependency on a specific AI provider.
- **No AI API keys in GitHub Secrets**: OSS contributors should not need to configure secrets to participate. All AI processing must happen client-side.
- **Zero additional cost for public repos**: GitHub Actions for public repositories is free; all AI compute is billed to each contributor's own account.
- **Self-contained**: The review protocol must be fully describable in files bundled in the repository (`AGENTS.md`, `SKILL.md` files).

---

## Considered Approaches

### A: GitHub Copilot Automatic Code Review

Use GitHub's native Copilot code review feature (enabled in repository settings).

**Rejected**:
- Vendor lock-in to GitHub Copilot.
- Single reviewer perspective only (no multi-agent sectioning).
- Cannot be customized with project-specific rules (3-layer architecture, spec compliance).
- Not available for all GitHub plan tiers.

### B: Orchestrator-Workers Pattern (local agent only)

An AI agent acts as the Orchestrator, spawning sub-agents for each review perspective, then invoking an Evaluator to synthesize results.

**Partially adopted**: Provides reliability (one entity is responsible for all reviews), but lacks visibility — no trace in the PR of what's happening.

### C: GitHub Actions + Structured PR Comment Protocol

GitHub Actions posts a structured comment to the PR with instructions for independent agents. Any agent can pick up the task and post their review.

**Partially adopted**: Provides transparency (the PR comment is a public audit trail), but has a liveness risk — reviews might not get picked up if no orchestrator is monitoring.

### D: MCP (Model Context Protocol) Integration

Use MCP servers to expose GitHub API as tools for AI agents, enabling richer context access.

**Rejected**:
- Requires each contributor to configure MCP servers with GitHub PAT or OAuth credentials.
- Raises the barrier to entry for OSS contributors who already know `gh` CLI.
- `gh` CLI + Skills bundled in the repository achieve the same goal with zero external dependencies.

### E: External Multi-Agent Platform (LangGraph, CrewAI, AutoGen, etc.)

Use a dedicated multi-agent framework to orchestrate the review pipeline.

**Rejected**:
- Requires a hosted service or additional infrastructure.
- Vendor-specific API keys needed in GitHub Secrets.
- Contradicts the constraint of vendor-agnostic, client-side AI processing.

---

## Decision

Adopt a **Hybrid B+C approach**:

1. **GitHub Actions (trigger layer)**: On PR open/synchronize, automatically:
   - Adds the `review-needed` label
   - Posts a structured comment with the review pipeline table and instructions for the Orchestrator
   - Manages label transitions on re-push (removes `needs-fix`, re-adds `review-needed`)

2. **Orchestrator (local agent, maintainer-run)**: Polls `gh pr list --label "review-needed"` in a monitoring loop. For each unprocessed PR:
   - Adds `review-in-progress` label (prevents duplicate processing)
   - Spawns 3 sub-agents in parallel (or sequentially as fallback)
   - Invokes the Evaluator after all reviews complete

3. **Reviewer sub-agents** (3 parallel agents):
   - `review-architecture`: checks 3-layer boundary violations
   - `review-spec`: checks `docs/spec-draft.md` compliance
   - `review-tests`: checks test quality and coverage

4. **Evaluator**: Synthesizes all review comments, creates a Fix-task, and either adds `needs-fix` or `approved` label.

5. **Merge Gate** (GitHub Actions): Blocks merge unless both `approved` (AI) and `LGTM` (human) labels are present.

### Label State Machine

```
PR created/updated
      ↓
GitHub Actions → review-needed
      ↓
Orchestrator → review-in-progress → review-count-1
      ↓
3 Reviewers post comments
      ↓
Evaluator synthesizes
      ↓
Issues found?
  YES → needs-fix → developer fixes → push → review-needed (loop, max 3×)
  NO  → approved
      ↓
Human adds LGTM
      ↓
Merge gate passes → merge
      ↓ (if 3rd loop also fails)
manual-review-needed
```

### Key Sub-Decisions

| Sub-decision | Choice | Reason |
|---|---|---|
| **Transport protocol** | `gh` CLI | OSS contributors already know it; zero auth setup beyond `gh auth login` |
| **AI compute location** | Client-side | No API keys in GitHub Secrets; free for public repos; each contributor uses their own quota |
| **Loop limit** | 3 iterations | Prevents infinite loops; `review-count-N` labels provide visibility; manual escalation path |
| **Merge gate** | `approved` + `LGTM` both required | AI catches technical issues; human makes the final judgment call |
| **Orchestrator deployment** | Maintainer's local agent | Avoids always-on server cost; maintainer controls when review cycles run |
| **Fallback** | Sequential self-execution | If sub-agents are not supported, the Orchestrator performs all 3 reviewer roles itself |

---

## Consequences

### Positive

- ✅ **Vendor-agnostic**: Any AI agent that can read Markdown and run `gh` CLI commands can participate in any role.
- ✅ **No secrets**: Zero AI API keys required in GitHub Secrets; all compute is client-side.
- ✅ **Self-documenting**: The PR comment and label history provide a full audit trail of the review cycle.
- ✅ **Composable**: Each reviewer skill references existing skills (`layer-guard`, `spec-check`, `write-test`), avoiding duplication.
- ✅ **Free for OSS**: GitHub Actions workflows only run `gh` CLI commands; no AI API calls in Actions runners.
- ✅ **Deterministic escalation**: After 3 failed iterations, the system escalates with `manual-review-needed` instead of looping indefinitely.

### Negative / Trade-offs

- ⚠️ **Orchestrator requires a human to start**: The monitoring loop is not always-on — a maintainer must actively run the Orchestrator agent. Reviews are not instantaneous.
- ⚠️ **Context window limits**: Large PRs may exceed sub-agent context limits. The `orchestrate-review` skill mitigates this with a file-list-first strategy, but very large diffs may still have coverage gaps.
- ⚠️ **Label proliferation**: The label state machine requires 8+ labels (`review-needed`, `review-in-progress`, `review-count-1/2/3`, `needs-fix`, `approved`, `LGTM`, `manual-review-needed`). Requires upfront label creation in the repository.
- ⚠️ **Single orchestrator point of failure**: If no one runs the Orchestrator, PRs accumulate `review-needed` labels. Mitigated by: any contributor can start the Orchestrator at any time.

---

## References

- [ADR 0002: Use AGENTS.md and SKILL.md as the Universal AI-Driven Development Foundation](0002-ai-driven-development-foundation.md)
- [Anthropic: Building Effective Agents — Parallelization Pattern](https://www.anthropic.com/research/building-effective-agents)
- `.agents/skills/orchestrate-review/SKILL.md` — Orchestrator monitoring loop implementation
- `.agents/skills/evaluate-review/SKILL.md` — Evaluator fix-loop implementation
- `.github/workflows/pr-review-trigger.yml` — GitHub Actions trigger layer
- `.github/workflows/merge-gate.yml` — Merge gate enforcement
