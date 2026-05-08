# Contributing to yali

`yali` (YAML LLM Interface) is an open-source CLI tool that lets you define LLM commands in YAML and run them from the terminal. We welcome contributions of all kinds — bug fixes, new features, documentation improvements, and more.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Runtime | Node.js |
| Package Manager | npm |
| Test Framework | Vitest |
| LLM SDK | openai (npm) |

For the rationale behind these choices, see [`docs/adr/0001-language-choice.md`](docs/adr/0001-language-choice.md).

---

## Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/shira022/yali.git
cd yali

# 2. Install dependencies
npm install

# 3. Run tests
npm test

# 4. Build
npm run build
```

> **Requirements**: Node.js 20+ and npm 10+.

---

## Branch and Commit Conventions

### Branch Naming

```
feature/issue-<number>-<short-description>
fix/issue-<number>-<short-description>
docs/issue-<number>-<short-description>
```

Examples:
- `feature/issue-3-yaml-parser`
- `fix/issue-7-stdin-handling`
- `docs/issue-5-readme-update`

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat:  add new feature
fix:   fix a bug
docs:  documentation changes only
test:  add or update tests
chore: build process or tooling changes
refactor: code change that neither fixes a bug nor adds a feature
```

Examples:
```
feat: implement YAML parser with schema normalization
fix: handle empty stdin gracefully in input resolver
docs: add ADR for language choice
```

### Pull Requests

- Every PR must be linked to an Issue: include `Closes #<number>` in the PR description.
- Keep PRs focused — one logical change per PR.
- All CI checks must pass before requesting a review.

---

## Architecture Overview

`yali` follows a three-layer architecture: **Parser → Renderer → Executor**.

- **Parser**: Reads and normalizes YAML into a typed `ValidatedCommand` object.
- **Renderer**: Resolves variables and expands templates — pure function, no side effects.
- **Executor**: Calls the LLM API, handles streaming, and writes output.

See [`docs/spec-draft.md`](docs/spec-draft.md) for the full specification.

---

## Architecture Decision Records

Significant technical decisions are documented as ADRs in [`docs/adr/`](docs/adr/). Please add an ADR when proposing a major change to the tech stack, architecture, or tooling.

---

## AI-Driven PR Review Process

yali uses a multi-agent system to automatically review PRs when they are created or updated.

### How It Works

1. **You create a PR** → GitHub Actions automatically adds the `review-needed` label and posts a structured comment
2. **An Orchestrator agent** (any contributor running the `orchestrate-review` skill) detects the label and coordinates 3 independent review agents
3. **Three reviewers** check the PR from different perspectives:
   - 🏗️ **Architecture**: Checks for 3-layer boundary violations
   - 📋 **Spec**: Checks for compliance with `docs/spec-draft.md`
   - 🧪 **Tests**: Checks for test quality and coverage
4. **An Evaluator agent** synthesizes the reviews and either:
   - Posts a Fix-task comment with required changes (adds `needs-fix` label)
   - Marks the PR as approved (adds `approved` label)
5. **After fixes**, push your changes — the review loop restarts automatically (max 3 iterations)
6. **A human maintainer** adds the `LGTM` label after their own review
7. **Merge** becomes available when both `approved` + `LGTM` labels are present

### Participating as the Orchestrator

Any contributor can serve as the Orchestrator for open PRs awaiting review:

1. Ensure you have the `gh` CLI installed and authenticated
2. Open your preferred AI agent (Claude Code, Copilot CLI, Cursor, etc.)
3. Tell it: *"Read `.agents/skills/orchestrate-review/SKILL.md` and start the monitoring loop"*
4. The agent will automatically find PRs with `review-needed` label and manage the full review cycle

> **Note**: The Orchestrator role is intentionally not tied to a specific AI service. Any agent that can read files and run `gh` CLI commands can be the Orchestrator.

### GitHub Actions Cost

**For public repositories (like yali): GitHub Actions is completely free.**

The `pr-review-trigger.yml` and `merge-gate.yml` workflows:
- Do not call any AI APIs
- Only run `gh` CLI commands (label management + comments)
- Run in seconds per trigger

All AI processing happens on contributors' local machines or cloud agents — not in GitHub Actions runners.

### Label Reference

| Label | Added By | Meaning |
|---|---|---|
| `review-needed` | GitHub Actions (auto) | PR is awaiting multi-agent review |
| `review-in-progress` | Orchestrator | Review is currently running (prevents duplicates) |
| `review-count-1/2/3` | Orchestrator | Current review iteration number |
| `needs-fix` | Evaluator | Issues found; developer should fix and push |
| `approved` | Evaluator | All automated review checks passed |
| `LGTM` | Human maintainer | Human has reviewed and approved |
| `manual-review-needed` | Orchestrator | Max iterations reached; needs human review |
