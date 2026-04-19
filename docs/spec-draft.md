# yali Foundation Spec v0.1

> YAML LLM Interface — Define LLM commands in YAML and run them as a CLI tool

---

## 1. Extensible YAML Schema Design

### Design Principle: "Flat First, Nesting Allowed"

At minimum, a command file should be completely flat. Nesting only appears when needed for advanced configuration.
This follows the **Progressive Disclosure** UX pattern, which applies equally well to schema evolution.

### Minimal Configuration

```yaml
prompt: "Translate the following text to Japanese: {{input}}"
model: gpt-4o
```

### Standard Configuration

```yaml
name: translate
description: Translate text to Japanese

model:
  name: gpt-4o
  temperature: 0.3
  max_tokens: 1024

prompt: |
  Please translate the following text into Japanese.

  {{input}}

input:
  from: stdin          # stdin | args | file
  var: input           # template variable name
```

### Extended Configuration — Future-Ready

```yaml
name: summarize-and-translate
version: "1.0"

steps:
  - id: summarize
    prompt: "Summarize the following in English: {{input}}"
    model: gpt-4o-mini

  - id: translate
    prompt: "Translate the following to Japanese: {{steps.summarize.output}}"
    model: gpt-4o
    depends_on: [summarize]

tools:
  - type: mcp
    server: filesystem
    allowed_actions: [read_file]

output:
  format: markdown     # text | markdown | json
  target: stdout       # stdout | file
  path: ./out.txt      # required when target is file
```

### Why This Structure Is Resilient to Change

| Problem | Mitigation |
|---|---|
| `model` changes from string to object | Parser normalizes both forms into the same internal representation |
| `steps` is added later | When `steps` is absent, Parser automatically promotes `prompt` to `steps[0]` |
| `tools` / MCP support is added | Adding a top-level key does not affect any existing definitions |

**The key insight is that the Parser normalizes old syntax into a new internal representation**, decoupling the YAML schema from the core logic.

---

## 2. Interface (I/O) Abstraction

### Alignment with UNIX Philosophy

```
[Input Source] → [Variable Resolution] → [Template Binding] → [LLM] → [Output Target]
```

`yali` treats LLMs as standard UNIX commands — input and output are fully controllable from the outside.

### Input Resolution Order (highest priority first)

```
1.   CLI arguments (--var key=value)
1.5. --input-file <path>  (reads file directly as UTF-8; overrides stdin/args/file sources)
2.   stdin (text piped in) — when input.from: stdin and stdin is piped
2a.  --input "<value>"    — fallback when input.from: stdin but no pipe is available
3.   File (input.from: file, input.path: ./data.txt)
4.   Default value defined inline in YAML (input.default: "...")
```

Higher-priority sources override lower-priority ones for the same variable name (following standard CLI convention).

> **Note on `--input-file`:** When Windows PowerShell pipes non-ASCII text to external processes,
> the default `$OutputEncoding` (ASCII) corrupts multibyte characters. The `--input-file` flag
> reads the file directly inside Node.js as UTF-8, completely bypassing the pipe. It applies
> regardless of `input.from` and has higher priority than stdin/args/file sources but lower than
> `--var`.

> **Note on `from: stdin` → `--input` fallback:** When `input.from: stdin` is specified but no
> stdin is piped (e.g., during `--dry-run` testing or interactive use), `--input "<value>"` may
> be provided as a convenience fallback. This allows dry-run testing without requiring a pipe.

### Variable Mapping Rules

| YAML Definition | Template Variable | Input Source |
|---|---|---|
| `input.from: stdin` | `{{input}}` | Full text from pipe; falls back to `--input` when not piped |
| `input.from: args` | `{{input}}` | `yali run cmd.yaml --input "..."` |
| `input.from: file` | `{{input}}` | `--input path/to/file.txt` or `input.path` in YAML |
| `--input-file <path>` | `{{input}}` | File read directly as UTF-8 by Node.js (overrides stdin/args/file) |
| `--var topic=AI` | `{{topic}}` | Can coexist with any `from` |
| `steps.X.output` | `{{steps.X.output}}` | Output of a preceding step (multi-step mode) |

### Output Abstraction

```yaml
output:
  format: text     # text | json | markdown
  target: stdout   # stdout | file
  path: ./out.txt  # required when target is file
```

Setting `format: json` enables integration with downstream pipe commands such as `jq`:

```bash
# Typical UNIX pipe integration
cat input.txt | yali run translate.yaml | jq '.result'
```

### Why This Structure Is Resilient to Change

- **Explicit variable namespacing** (`input.*` / `steps.*` / `vars.*`) prevents naming collisions when new features are added.
- Extracting input resolution into a dedicated **Input Resolver** module means new input sources (HTTP, DB, etc.) can be added without touching other layers.
- The unified `{{variable}}` syntax means templates never need to be rewritten when the input source changes.

---

## 3. Core Logic Responsibilities

### Three-Layer Architecture

```
┌──────────────────────────────────────────────────┐
│                    CLI Layer                      │
│  (argument parsing, stdin detection, exit codes)  │
└───────────────────┬──────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────┐
│                   Parser                          │
│  Read YAML → Normalize → Return ValidatedCommand  │
└───────────────────┬──────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────┐
│                  Renderer                         │
│  Resolve variables → Expand template → Final prompt│
└───────────────────┬──────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────┐
│                  Executor                         │
│  Call LLM API → Format result → Write to output  │
└──────────────────────────────────────────────────┘
```

### Parser Responsibilities

**"Convert external formats into a stable internal representation."**

- Read YAML and detect syntax errors
- **Normalize**: `model: gpt-4o` (string) → `model: { name: gpt-4o }` (object)
- **Promote**: `prompt: "..."` alone → `steps: [{prompt: "..."}]`
- Validate against JSON Schema
- **Returns: a typed `ValidatedCommand` internal object (YAML-independent)**

> **Invariant:** No code beyond the Parser ever references YAML directly. This means supporting TOML or JSON input in the future requires changes only in the Parser.

### Renderer Responsibilities

**"Transform data into text — with no side effects."**

- Receive a variable map from the Input Resolver
- Expand `{{variable}}` references Mustache/Jinja-style
- In multi-step mode, analyze the dependency graph to determine execution order
- **Returns: expanded prompt string(s) (or an ordered Step array)**

> **Invariant:** The Renderer is a pure, side-effect-free module. This makes unit testing trivial and naturally enables a `--dry-run` feature.

### Executor Responsibilities

**"The only layer that performs real I/O."**

- Initialize and call the LLM API client (including retries)
- **Resolve API keys via `src/config/` module** (config file only; environment variables are not consulted)
- Handle streaming responses
- Manage rate limits and errors
- Dispatch multi-step steps sequentially or in parallel
- Convert output format (text/json/markdown) and write to the target
- **Returns: `ExecutionResult` (exit code and output content)**

> **Invariant:** Changes to LLM APIs or adding MCP support are contained within the Executor (or its sub-adapters). Parser and Renderer remain unchanged.

---

## 4. Configuration Management

### Overview

`yali config` manages API keys for LLM providers in an OS-native config file. This eliminates the need for environment variables and centralizes key management.

```bash
yali config set openai.api_key sk-...      # Store a key
yali config get openai.api_key             # Show masked key (sk-***...xxxx)
yali config list                           # List all keys (masked)
yali config unset openai.api_key           # Remove a key
```

### Config File Location

| OS | Path |
|---|---|
| Linux / macOS | `$XDG_CONFIG_HOME/yali/config.yaml` (defaults to `~/.config/yali/config.yaml`) |
| Windows | `%APPDATA%\yali\config.yaml` |

Path resolution is implemented in `src/config/paths.ts` using `os.homedir()` with platform branching — no external dependencies.

### Config File Format

```yaml
openai:
  api_key: sk-...
anthropic:
  api_key: sk-ant-...
google:
  api_key: AIza...
ollama:
  base_url: http://localhost:11434/v1
```

### Security

- On Unix, the config file is protected with `chmod 600` (owner read/write only) — the same convention as SSH private keys (`~/.ssh/id_rsa`).
- All `get` and `list` output masks API keys (`sk-***...xxxx`). Plain-text keys are never displayed.
- The config file lives outside the repository (`~/.config/` or `%APPDATA%`), so it cannot be accidentally committed to git.

### API Key Resolution

API keys are resolved **from the config file only**. Environment variables (`OPENAI_API_KEY`, etc.) are not consulted.

- Key found in config file → used as-is
- Key absent or config file missing → `ExecutorError` with `yali config set <provider>.api_key` guidance

This is implemented in `src/executor/api-key-resolver.ts`, which reads from `src/config/store.ts`.

### Ollama Base URL Resolution

Ollama does not use an API key. Instead, it requires a `base_url` pointing to the Ollama server. The base URL is resolved in the following priority order:

1. **Config file** — `ollama.base_url` in the yali config file
2. **Environment variable** — `OLLAMA_BASE_URL` (useful for CI, Docker, and headless environments where editing the config file is not practical)
3. **Default** — `http://localhost:11434/v1`

> **Note:** `OLLAMA_BASE_URL` is the only environment variable consulted by yali. All other provider credentials are resolved exclusively from the config file.

### Module Structure

```
src/config/
  schema.ts    — zod schema for YaliConfig type
  paths.ts     — OS-native config file path resolution
  store.ts     — readConfig / writeConfig / getNestedValue / setNestedValue / unsetNestedValue
  manager.ts   — handleConfigCommand: routes set/get/list/unset subcommands
```

---

## Change Resilience Summary

| Future Change | Affected Layer(s) | Unaffected Layer(s) |
|---|---|---|
| New model types | Executor (add adapter) | Parser, Renderer |
| Adding `steps` | Parser (normalization rule), Renderer (DAG resolution) | Executor |
| MCP integration | Executor (tool calls), YAML schema | Renderer |
| New input source (HTTP, etc.) | Input Resolver | Parser, Renderer, Executor |
| YAML → TOML support | Parser only | All other layers |
| `--dry-run` feature | CLI Layer → stops at Renderer | Executor |
| New LLM provider / API key | `src/config/schema.ts`, Executor adapter | Parser, Renderer, CLI Layer |

---

## Appendix: Internal Type Definitions (Pseudocode)

```
ProviderName = 'openai' | 'anthropic' | 'google' | 'ollama'

ValidatedCommand {
  name?:        string
  version?:     string
  steps:        Step[]          # always normalized to a Step array
  input_spec:   InputSpec
  output_spec:  OutputSpec
  tools?:       ToolSpec[]
}

Step {
  id:           string
  prompt:       string          # raw string before template expansion
  model:        ModelSpec       # always normalized to object form
  depends_on:   string[]
}

ModelSpec {
  name:         string
  provider?:    ProviderName    # defaults to 'openai' when omitted; resolved by the Parser
  temperature?: float
  max_tokens?:  int
}
```

This type serves as the **DMZ (demilitarized zone)** between the YAML schema and the LLM API, isolating changes on either side from affecting the other.
