---
name: evaluate-review
description: Evaluates the output of the 3 reviewer sub-agents for a PR, synthesizes findings into a Fix-task comment, and applies approved or needs-fix labels. Invoked by the Orchestrator after all reviewers have posted.
---

# evaluate-review

## When to Use

Invoke this skill when you are acting as the **Evaluator** in the multi-agent PR review system. The Evaluator is called by the Orchestrator after the Architecture, Spec, and Test reviewers have all posted their comments on a PR.

## Step-by-Step Evaluation Procedure

### Step 1 — Read All Review Comments

```bash
gh pr view {PR_NUMBER} --comments --json comments,reviews
```

### Step 2 — Parse Reviewer Comments

Locate the three reviewer comments by their emoji headers:

| Emoji | Reviewer |
|---|---|
| 🏗️ | Architecture reviewer |
| 📋 | Spec reviewer |
| 🧪 | Test reviewer |

From each comment, extract the **Findings** section. Ignore any comments that are not from the automated reviewers.

### Step 3 — Synthesize Findings

Combine the findings from all three reviewers into a unified issue list:

- **Group by severity**: blocking issues first, non-blocking (advisory) issues second.
- **Deduplicate**: if two reviewers flag the same file/line for the same reason, merge into a single issue.
- **Number each issue** clearly (e.g., `[1]`, `[2]`, …) so developers can reference them when fixing.

### Step 4 — Decision: Blocking Issues?

#### If blocking issues exist → Post Fix-task comment and add `needs-fix`

```bash
gh pr comment {PR_NUMBER} -b "## 🔧 Fix Required

The automated review found the following issues that must be resolved before this PR can be approved.

### Blocking Issues
{numbered list of issues with file references and descriptions}

### Non-Blocking (Advisory)
{numbered list of advisory issues, or omit section if none}

### How to fix
1. Address each blocking issue listed above.
2. Push your changes to this branch.
3. The review cycle will restart automatically (a new \`review-needed\` label will be applied).

**Review cycle**: {N}/3"

gh pr edit {PR_NUMBER} --add-label "needs-fix"
```

#### If no blocking issues → Post approval comment and add `approved`

```bash
gh pr comment {PR_NUMBER} -b "## ✅ Automated Review Approved

All automated review checks have passed:
- 🏗️ Architecture: ✅ No violations
- 📋 Spec compliance: ✅ No violations
- 🧪 Test quality: ✅ No issues

**Next step**: This PR requires a human review (LGTM label) before it can be merged."

gh pr edit {PR_NUMBER} --add-label "approved"
```

### Step 5 — Re-review Handling (After Developer Fixes)

When the Evaluator is invoked for a PR that already has a previous Fix-task comment:

1. **Retrieve the previous Fix-task issue list** from the PR comment history.
2. **Get the latest diff** since the last review cycle:
   ```bash
   gh pr diff {PR_NUMBER}
   ```
3. **For each previously reported issue**, determine whether it is:
   - ✅ **Resolved** — the relevant code has been changed to address the issue.
   - ❌ **Still present** — no meaningful change was made to the relevant code.
4. **Only report issues that are genuinely still unresolved** in the new Fix-task comment. Do not re-report issues that have been fixed.
5. If all previously reported blocking issues are now resolved, proceed to the approval flow (Step 4, no blocking issues).

## Quick Reference

| Step | Action |
|---|---|
| 1 | `gh pr view {PR_NUMBER} --comments --json comments,reviews` |
| 2 | Find 🏗️ 📋 🧪 comments; extract Findings sections |
| 3 | Deduplicate and group by severity |
| 4a | Blocking issues found → Fix-task comment + `needs-fix` label |
| 4b | No blocking issues → Approval comment + `approved` label |
| 5 | On re-review: diff against previous Fix-task; only surface unresolved issues |
