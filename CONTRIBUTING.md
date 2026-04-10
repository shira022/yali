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
