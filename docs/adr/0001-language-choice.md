# ADR 0001: Language Choice for yali

- **Date**: 2026-04-09
- **Status**: Accepted

---

## Context

`yali` (YAML LLM Interface) is a CLI tool that lets users define LLM commands in YAML and run them from the command line. Its internal architecture follows a three-layer design — **Parser → Renderer → Executor** — with a strong emphasis on type safety, pure-function design, and OSS accessibility.

Key characteristics that inform the language choice:

- **Internal type safety**: `ValidatedCommand` and related types must be expressed precisely at compile time.
- **Pure-function Renderer**: The Renderer must be side-effect-free and trivially unit-testable.
- **LLM API integration**: Streaming, multi-step orchestration, and Agents SDK support are core requirements.
- **OSS distribution**: The tool should be easy to install and run without environment setup friction.
- **UNIX philosophy**: Full `stdin`/`stdout`/pipe support is required.

See [`docs/spec-draft.md`](../spec-draft.md) for the full specification.

---

## Considered Options

### Option A: TypeScript

| Aspect | Assessment |
|---|---|
| Official OpenAI SDK maturity | ◎ Fully supported, type-safe |
| Agents SDK support | ◎ Full parity with Python as of June 2025 |
| Streaming | ◎ `for await` syntax is natural |
| Realtime / Voice API | ◎ Supported |
| `ValidatedCommand` type definition | ◎ `interface`/type system maps naturally |
| Pure-function Renderer | ◎ Functional style is idiomatic |
| UNIX pipe / stdin·stdout | ○ `process.stdin` works well |
| Single-binary distribution | △ Requires `pkg` or similar; `npx yali` is practical |
| OSS distribution | ◎ `npm publish` / `npx yali` — broad reach |
| Testing | ◎ Vitest/Jest, excellent for pure-function unit tests |

### Option B: Go

| Aspect | Assessment |
|---|---|
| Official OpenAI SDK maturity | ○ v3+, auto-generated from OpenAPI spec |
| Agents SDK support | △ REST API only — no native SDK support |
| Streaming | ○ `ssestream.Stream[T]` works |
| Realtime / Voice API | ✕ Not supported |
| `ValidatedCommand` type definition | ◎ Struct-based, compile-time checked |
| Pure-function Renderer | ○ Achievable but more verbose |
| UNIX pipe / stdin·stdout | ◎ Most robust — idiomatic Go |
| Single-binary distribution | ◎ `go build` produces a cross-compiled binary |
| OSS distribution | ◎ Homebrew, easy binary distribution |
| Testing | ◎ Standard `go test` |

### Option C: Python

| Aspect | Assessment |
|---|---|
| Official OpenAI SDK maturity | ◎ Most mature and feature-rich |
| Agents SDK support | ◎ First-class support since March 2025 |
| Streaming | ◎ `stream=True` — fully supported |
| Realtime / Voice API | ◎ Supported |
| `ValidatedCommand` type definition | △ `dataclass`/`TypedDict` is supplementary |
| Pure-function Renderer | ○ Possible but type guarantees are weaker |
| UNIX pipe / stdin·stdout | ○ `sys.stdin` works |
| Single-binary distribution | ✕ Requires Python environment |
| OSS distribution | △ `pip install` / `pipx` — viable but adds friction |
| Testing | ◎ pytest |

---

## Decision

**TypeScript** is adopted as the implementation language for `yali`.

---

## Rationale

1. **Type system alignment**: TypeScript's `interface` and union types map directly onto `ValidatedCommand`, `Step`, `ModelSpec`, and other internal types defined in the spec. The type system enforces correctness at compile time in a way that feels natural rather than bolted on.

2. **Pure-function Renderer**: The functional programming style in TypeScript makes it straightforward to implement the Renderer as a pure, side-effect-free function — which is a core architectural invariant. This also makes unit testing with Vitest trivial.

3. **Agents SDK — full parity**: As of June 2025, the OpenAI TypeScript Agents SDK has reached full feature parity with Python. Multi-step orchestration and streaming can be implemented at the SDK level rather than building on raw REST calls, which would be required in Go.

4. **OSS distribution via npm**: Publishing to npm and supporting `npx yali` makes the tool immediately accessible to a wide developer audience without any environment setup. This aligns with the goal of broad OSS adoption.

5. **Streaming is idiomatic**: `for await...of` async iteration over streaming responses is natural TypeScript, matching the feel of the rest of the codebase.

---

## Trade-offs and Concerns

- **Single-binary distribution**: Go produces a standalone binary via `go build` with no runtime dependency. TypeScript requires Node.js on the user's machine. `npx yali` mitigates this for the npm ecosystem, but distributing via Homebrew or as a self-contained binary requires additional tooling (e.g., `@vercel/pkg`).

- **UNIX pipe robustness**: Go's standard library handles `stdin`/`stdout`/pipe and exit-code management more robustly than Node.js. This is an area that will require careful implementation in the Executor layer.

- **Startup latency**: Node.js has a higher cold-start time compared to a Go binary. For interactive CLI use this is generally acceptable, but it is worth monitoring.

---

## References

- [`docs/spec-draft.md`](../spec-draft.md) — yali Foundation Spec v0.1
- [OpenAI Node.js SDK](https://github.com/openai/openai-node)
- [OpenAI Agents SDK for TypeScript](https://github.com/openai/openai-agents-js)
