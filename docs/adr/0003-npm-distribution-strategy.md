# ADR 0003: npm Distribution Strategy for yali

- **Date**: 2026-04-10
- **Status**: Accepted

---

## Context

`yali` (YAML LLM Interface) is a CLI tool that runs LLM commands defined in YAML files from the terminal. As an OSS CLI tool designed for broad adoption, the distribution strategy must balance two primary usage patterns:

- **Daily use**: Developers who run `yali` frequently want it available as a persistent, zero-latency command in their shell.
- **CI / spot use**: Automated pipelines and one-off users benefit from running `yali` without a prior installation step.

Additionally, `yali` is a **project-agnostic, cross-project general-purpose CLI** — unlike a project-scoped tool such as a linter or formatter, it is not intended to be installed as a per-project `devDependency`.

When implementing `package.json` for `yali`, the following design decisions were made but not yet recorded as an ADR:

- `npm install -g @shira022/yali` — for developers who use `yali` daily
- `npx @shira022/yali` — for CI pipelines and spot usage (no prior install required)
- The `bin` field in `package.json` automatically enables both patterns

---

## Considered Options

### Option A: `npx`-only support

Distribute `yali` without encouraging global installation. Users always run `npx @shira022/yali run ...`.

| Aspect | Assessment |
|---|---|
| Zero-install usage (CI/spot) | ◎ No setup required |
| Daily interactive use | ✕ Cold-start latency on every invocation; command is not in PATH |
| Shell tab-completion | ✕ Not possible without a persistent installation |
| Discoverability | △ Less intuitive than a native shell command |

**Rejected**: Developers who use `yali` daily need it as a persistent command in their PATH. Forcing `npx` on every invocation adds latency and reduces ergonomics.

---

### Option B: Global install (`npm install -g`) only

Require users to install `yali` globally before use.

| Aspect | Assessment |
|---|---|
| Daily interactive use | ◎ Persistent command in PATH, zero latency |
| CI / spot usage | ✕ Requires an explicit install step in every pipeline |
| Zero-setup trials | ✕ New users cannot try `yali` without installing first |

**Rejected**: CI pipelines and first-time evaluators benefit from a zero-install path. Requiring a global install as the only option adds unnecessary friction.

---

### Option C: Both `npm install -g` and `npx` (via `bin` field) ✅ Adopted

Support both usage patterns by publishing `yali` to npm with a `bin` field in `package.json`.

| Aspect | Assessment |
|---|---|
| Daily interactive use | ◎ `npm install -g @shira022/yali` → persistent `yali` command in PATH |
| CI / spot usage | ◎ `npx @shira022/yali run ...` → zero-install, runs latest version |
| Shell tab-completion | ○ Available after global install |
| Implementation overhead | ◎ Zero — the `bin` field handles both automatically |
| Local project install | ✕ Not recommended (see Rationale below) |

---

## Decision

**Publish `yali` to npm with a `bin` field**, supporting both `npm install -g @shira022/yali` (daily use) and `npx @shira022/yali` (CI / spot use).

The `package.json` `bin` field:

```json
{
  "name": "@shira022/yali",
  "bin": {
    "yali": "./dist/cli.js"
  }
}
```

This single configuration entry makes both installation methods work automatically — no additional distribution tooling is required.

---

## Rationale

1. **Single `bin` entry covers both patterns**: npm's `bin` mechanism is designed precisely for this. When installed globally (`-g`), npm symlinks the binary into the global PATH. When run via `npx`, npm downloads and executes the package temporarily. No extra configuration is needed.

2. **`yali` is project-agnostic**: Unlike linters (`eslint`) or formatters (`prettier`), `yali` is not scoped to a single project's toolchain. It operates across multiple projects and repositories. Installing it as a per-project `devDependency` (`npm install --save-dev yali`) would create redundant copies and version-lock it unnecessarily per project.

3. **Local install explicitly not recommended**: Because `yali` is cross-project by design, the documentation and README should guide users toward global install or `npx`, not local `devDependency` usage.

4. **Precedent in the npm ecosystem**: Well-known CLI tools such as `typescript`, `ts-node`, and `create-react-app` follow this same dual-distribution pattern via the `bin` field.

---

## Consequences

### Positive

- ✅ Zero additional distribution tooling — `bin` field is sufficient.
- ✅ Both daily and CI usage patterns are covered with a single `package.json` change.
- ✅ First-time users can evaluate `yali` immediately via `npx @shira022/yali --help`.
- ✅ Power users get a persistent, low-latency command via `npm install -g @shira022/yali`.

### Negative / Trade-offs

- ⚠️ Requires Node.js on the user's machine (mitigated by the broad adoption of Node.js in the target developer audience).
- ⚠️ `npx` downloads the package on each invocation if not cached — adds latency in cold CI environments. Caching strategies (e.g., `npm ci` with lockfile) are the standard mitigation.
- ⚠️ No single self-contained binary (unlike Go's `go build`). Single-binary packaging via tools such as `@vercel/pkg` is a future option if this becomes a pain point (see ADR 0001).

---

## References

- [`docs/spec-draft.md`](../spec-draft.md) — yali Foundation Spec v0.1
- [ADR 0001: Language Choice](./0001-language-choice.md)
- [npm Docs: package.json bin field](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#bin)
- [npx documentation](https://docs.npmjs.com/cli/v10/commands/npx)
