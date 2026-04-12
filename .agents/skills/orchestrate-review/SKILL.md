---
name: orchestrate-review
description: Orchestrates the multi-agent PR review system. Monitors for PRs needing review, spawns reviewer sub-agents, enforces the 3-iteration loop limit, and invokes the Evaluator.
---

# orchestrate-review

## When to Use

Invoke this skill when you are acting as the **Orchestrator** in the multi-agent PR review system. The Orchestrator is a long-running agent that monitors open PRs and drives the full review pipeline.

## Label State Machine

```
review-needed → review-in-progress → review-count-1/2/3
  → needs-fix        (blocking issues found by Evaluator)
  → approved         (all issues resolved)
  → LGTM             (added manually by a human maintainer)
  → manual-review-needed  (loop limit exceeded)
```

## Monitoring Loop

Poll GitHub continuously for PRs that need processing:

```bash
while true; do
  # List open PRs with review-needed label
  gh pr list --label "review-needed" --json number,title,labels --state open

  # For each PR that does NOT already have the review-in-progress label:
  #   → Process it (see "Per-PR Processing" below)

  # Wait before the next check (e.g., 2 minutes)
  sleep 120
done
```

**Concurrent PR handling**: Skip any PR that already carries the `review-in-progress` label. This prevents duplicate processing when multiple Orchestrator instances run simultaneously.

## Per-PR Processing

### Step 1 — Check Loop Limit

Before doing anything else, inspect the PR's existing labels:

```bash
gh pr view {PR_NUMBER} --json labels
```

| Existing label | Action |
|---|---|
| `review-count-3` already present | Post a manual-review comment (see below), add `manual-review-needed`, stop processing this PR |
| `review-count-2` present | Add `review-count-3`, continue |
| `review-count-1` present | Add `review-count-2`, continue |
| None of the above | Add `review-count-1`, continue |

**Manual-review comment** (when loop limit exceeded):

```bash
gh pr comment {PR_NUMBER} -b "## ⚠️ Manual Review Required

The automated review loop has reached its maximum of 3 iterations without resolving all issues.

A human maintainer must review this PR manually.

**Action required**: Please inspect the Fix-task comments in this thread and review the outstanding issues directly."
gh pr edit {PR_NUMBER} --add-label "manual-review-needed"
```

### Step 2 — Mark as In-Progress

```bash
gh pr edit {PR_NUMBER} --add-label "review-in-progress"
```

### Step 3 — Get the PR Diff

```bash
# Get the file list first to understand scope
gh pr diff {PR_NUMBER} --name-only

# Get the full diff
gh pr diff {PR_NUMBER}
```

For very large PRs (> 500 changed lines), summarize the file list to give each sub-agent focused context.

### Step 4 — Spawn 3 Reviewer Sub-Agents

Invoke the three reviewer skills **in parallel** (or sequentially if parallel sub-agents are not supported by the runtime):

| Sub-agent | Skill file |
|---|---|
| Architecture reviewer | `.agents/skills/review-architecture/SKILL.md` |
| Spec reviewer | `.agents/skills/review-spec/SKILL.md` |
| Test reviewer | `.agents/skills/review-tests/SKILL.md` |

Provide each sub-agent with:
- The PR number
- The full diff (or the file list + diff for large PRs)
- Instruction to post its findings as a `gh pr review` comment before returning

**Fallback (sequential execution)**: If the runtime does not support parallel sub-agents, read each skill file yourself and perform the review role sequentially — Architecture, then Spec, then Tests — posting a `gh pr review` comment after each role before moving on.

### Step 5 — Wait for All Reviews

Confirm that all 3 reviewer comments are present before proceeding:

```bash
gh pr view {PR_NUMBER} --comments --json comments,reviews
```

Look for comments with 🏗️, 📋, and 🧪 emoji headers. If any are missing, wait and re-check (up to a reasonable timeout, e.g., 5 minutes).

### Step 6 — Invoke the Evaluator

Read `.agents/skills/evaluate-review/SKILL.md` and perform the Evaluator role for `{PR_NUMBER}`, or spawn it as a sub-agent if supported.

### Step 7 — Clean Up In-Progress Label

After the Evaluator completes:

```bash
gh pr edit {PR_NUMBER} --remove-label "review-in-progress"
gh pr edit {PR_NUMBER} --remove-label "review-needed"
```

## Quick Reference

| Step | Action |
|---|---|
| 1 | Check loop limit via `review-count-N` labels; add next counter or halt |
| 2 | Add `review-in-progress` |
| 3 | Fetch PR diff (`--name-only` then full) |
| 4 | Spawn/execute 3 reviewer sub-agents |
| 5 | Wait for 🏗️ 📋 🧪 comments |
| 6 | Invoke Evaluator skill |
| 7 | Remove `review-in-progress` and `review-needed` labels |
