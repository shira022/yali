# yali User Guide

**yali** (YAML LLM Interface) is an open-source CLI tool that lets you define LLM commands in YAML and run them from the terminal. You describe your prompt, model, input, and output declaratively — yali handles template rendering, API calls, retries, and output formatting.

→ See the [README](../README.md) for a quick overview and motivation.

---

## Table of Contents

1. [Requirements](#requirements)
2. [Installation](#installation)
3. [CLI Reference](#cli-reference)
4. [YAML Schema Reference](#yaml-schema-reference)
5. [Input Resolution](#input-resolution)
6. [Multi-step Pipelines](#multi-step-pipelines)
7. [Output Formats](#output-formats)
8. [Dry Run](#dry-run)
9. [Examples](#examples)
10. [Environment Variables](#environment-variables)
11. [Error Handling](#error-handling)

---

## Requirements

| Requirement | Details |
|---|---|
| **Node.js** | Version 20 or later |
| **npm** | Bundled with Node.js |
| **OPENAI_API_KEY** | Required environment variable for all LLM calls (see [Environment Variables](#environment-variables)) |

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-org/yali.git
cd yali

# 2. Install dependencies
npm install

# 3. Build the project
npm run build

# 4. (Optional) Link globally so `yali` is available from anywhere
npm link
```

After linking, verify the installation:

```bash
yali --help
```

---

## CLI Reference

### Synopsis

```
yali run <command.yaml> [options]
```

### Options

| Option | Argument | Description |
|---|---|---|
| `--input <value\|path>` | string | Sets the primary input variable. Behavior depends on `input.from` in the YAML: with `from: args`, the value is used directly; with `from: file`, the value is treated as a file path to read. |
| `--input-file <path>` | file path | Reads a file as UTF-8 directly in Node.js and uses the content as the primary input variable. Works regardless of `input.from`. Recommended on Windows to avoid PowerShell pipe encoding issues with non-ASCII text. |
| `--var <key=value>` | `key=value` | Sets an arbitrary template variable. Repeatable — pass multiple `--var` flags for multiple variables. Takes the highest resolution priority (see [Input Resolution](#input-resolution)). |
| `--dry-run` | — | Renders all prompts without calling the LLM API. Useful for inspecting expanded templates before running. |
| `--format <text\|json>` | `text` or `json` | Controls the output format for `--dry-run`. Defaults to `text`. Has no effect without `--dry-run`. |
| `--help` | — | Prints the help message and exits. |

### Basic usage

```bash
# Run with explicit --input value (recommended: avoids pipe encoding issues)
yali run translate.yaml --input "Hello, world"

# Run with a file as input (--input-file reads directly as UTF-8, avoids encoding issues)
yali run summarize.yaml --input-file ./article.txt

# Run a command file with piped stdin (ASCII text only on Windows)
echo "Hello, world" | yali run translate.yaml

# Inject template variables
yali run greet.yaml --var name=Alice --var lang=French

# Preview rendered prompts without calling the LLM
yali run pipeline.yaml --input "some text" --dry-run

# Preview as JSON (machine-readable)
yali run pipeline.yaml --input "some text" --dry-run --format json
```

> **Windows note:** PowerShell's default pipe encoding is ASCII. Piping non-ASCII text (e.g. Japanese) via `echo "..." | yali run ...` or `Get-Content ... | yali run ...` will garble multibyte characters. Use `--input "text"` or `--input-file ./file.txt` instead.

---

## YAML Schema Reference

yali command files are standard YAML documents. All fields are optional unless marked required.

### Top-level fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | No | Human-readable name for the command |
| `version` | string | No | Version string for the command file |
| `prompt` | string | No | Single-step shorthand. Mutually exclusive with `steps`. |
| `model` | string or ModelSpec | No | Model to use with the `prompt` shorthand. Defaults to `gpt-4o`. |
| `steps` | Step[] | No | Multi-step mode. Mutually exclusive with `prompt`. |
| `input` | InputSpec | No | Input configuration. Defaults to `{ from: stdin, var: input }`. |
| `output` | OutputSpec | No | Output configuration. Defaults to `{ format: text, target: stdout }`. |
| `tools` | ToolSpec[] | No | Tool specifications (MCP integration — reserved for future use). |

> **Note:** You must provide either `prompt` or `steps`, but not both.

---

### a. Minimal configuration

The simplest possible command: a single prompt using the default model, reading from stdin.

```yaml
prompt: "Translate the following text to French:\n\n{{input}}"
```

Run it:

```bash
echo "Good morning" | yali run translate.yaml
```

---

### b. Standard configuration

A fully-specified single-step command with explicit name, model parameters, input source, and output destination.

```yaml
name: Article Summarizer
version: "1.0"

model:
  name: gpt-4o
  temperature: 0.3
  max_tokens: 512

prompt: |
  Summarize the following article in 3 bullet points:

  {{input}}

input:
  from: file
  var: input

output:
  format: markdown
  target: stdout
```

Run it:

```bash
yali run summarize.yaml --input ./article.txt
```

---

### c. Multi-step configuration

A pipeline where each step can depend on the outputs of previous steps.

```yaml
name: Summarize and Translate

input:
  from: stdin
  var: article

output:
  format: text
  target: stdout

steps:
  - id: summarize
    model: gpt-4o
    depends_on: []
    prompt: |
      Summarize the following article in 3 sentences:

      {{article}}

  - id: translate
    model: gpt-4o
    depends_on: [summarize]
    prompt: |
      Translate the following summary to Spanish:

      {{steps.summarize.output}}
```

Run it:

```bash
cat article.txt | yali run pipeline.yaml
```

---

### ModelSpec

Used for the top-level `model` field or the `model` field inside each Step.

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | **Yes** | Model identifier (e.g. `gpt-4o`, `gpt-4o-mini`) |
| `temperature` | float | No | Sampling temperature. Higher values produce more varied output. |
| `max_tokens` | int | No | Maximum number of tokens to generate in the response. |

**String shorthand** — you can also write `model: gpt-4o` instead of the full object form:

```yaml
# Shorthand
model: gpt-4o

# Equivalent object form
model:
  name: gpt-4o
```

---

### InputSpec

Controls how the primary `{{input}}` variable (or the variable named in `var`) is sourced.

| Field | Type | Required | Description |
|---|---|---|---|
| `from` | `stdin` \| `args` \| `file` | **Yes** | Input source mode |
| `var` | string | **Yes** | Template variable name to bind the input to (e.g. `input`, `article`) |
| `default` | string | No | Fallback value used when no input is provided from the source |
| `path` | string | No | File path — used when `from: file` and `--input` is not passed on the CLI |

**`from` modes:**

| Mode | Behavior |
|---|---|
| `stdin` | Reads from piped stdin (e.g. `echo "text" \| yali run ...`) |
| `args` | Reads from the `--input <value>` CLI flag directly |
| `file` | Reads a file; path comes from `--input <path>` or `input.path` in YAML |

---

### OutputSpec

Controls how the final step's output is formatted and where it is sent.

| Field | Type | Required | Description |
|---|---|---|---|
| `format` | `text` \| `markdown` \| `json` | **Yes** | Output format |
| `target` | `stdout` \| `file` | **Yes** | Output destination |
| `path` | string | Conditional | Required when `target: file`. Specifies the file path to write to. |

**`format` values:**

| Value | Behavior |
|---|---|
| `text` | Raw LLM response, streamed to stdout as-is |
| `markdown` | Same as `text` — streamed as-is; signals to consumers that the content is Markdown |
| `json` | Extracts JSON from markdown code fences if present, then pretty-prints the JSON |

**Writing to a file:**

```yaml
output:
  format: text
  target: file
  path: ./output/result.txt
```

---

## Input Resolution

When yali resolves a template variable, it follows a strict priority order from highest to lowest:

| Priority | Source | How to use |
|---|---|---|
| **1 (highest)** | `--var key=value` CLI flags | `yali run cmd.yaml --var myvar=hello` |
| **2** | Primary input source (`input.from: args`) | `yali run cmd.yaml --input "hello"` |
| **3** | Primary input source (`input.from: stdin` or `from: file`) | `echo "hello" \| yali run cmd.yaml` or `yali run cmd.yaml --input ./file.txt` |
| **4 (lowest)** | Default value from YAML (`input.default`) | Fallback when no other source provides a value |

### Examples

**Overriding input with `--var`:**

Even if the command reads from stdin, `--var` always wins:

```bash
echo "this is ignored" | yali run cmd.yaml --var input="this is used"
```

**Reading from stdin (`from: stdin`):**

```yaml
input:
  from: stdin
  var: input
```

```bash
echo "Good morning" | yali run translate.yaml
```

**Reading from CLI args (`from: args`):**

```yaml
input:
  from: args
  var: input
```

```bash
yali run translate.yaml --input "Good morning"
```

**Reading from a file (`from: file`):**

```yaml
input:
  from: file
  var: input
  path: ./default-article.txt   # used if --input is not provided
```

```bash
# Use the path from --input
yali run summarize.yaml --input ./my-article.txt

# Fall back to path in YAML (default-article.txt)
yali run summarize.yaml
```

**Using a default value:**

```yaml
input:
  from: args
  var: lang
  default: French
```

```bash
# Uses "French" as the default when --input is omitted
yali run translate.yaml
```

**Injecting multiple variables with `--var`:**

```yaml
prompt: "Write a {{tone}} email to {{recipient}} about {{topic}}."
```

```bash
yali run email.yaml --var tone=formal --var recipient=Alice --var topic="project update"
```

---

## Multi-step Pipelines

Multi-step mode lets you chain LLM calls, where each step can consume the output of earlier steps.

### How it works

1. yali performs a **topological sort** of your steps using Kahn's algorithm, respecting `depends_on` declarations.
2. Steps are **executed sequentially** in topological order.
3. Each step's output is available to subsequent steps as `{{steps.<id>.output}}`.

### `depends_on`

```yaml
steps:
  - id: step_a
    depends_on: []      # no dependencies — runs first
    ...

  - id: step_b
    depends_on: [step_a]   # runs after step_a completes
    prompt: "Process this: {{steps.step_a.output}}"
    ...
```

- `depends_on` accepts a list of step `id` strings.
- Steps with no `depends_on` (or an empty list) are entry points.
- Circular dependencies will cause an error.

### Accessing step outputs

Use `{{steps.<id>.output}}` in any prompt that declares a dependency on that step:

```yaml
steps:
  - id: extract
    model: gpt-4o
    prompt: "Extract key facts from:\n\n{{input}}"

  - id: format
    model: gpt-4o
    depends_on: [extract]
    prompt: |
      Format the following facts as a numbered list:

      {{steps.extract.output}}
```

### Complete multi-step example

```yaml
name: Research Pipeline

input:
  from: stdin
  var: query

output:
  format: markdown
  target: stdout

steps:
  - id: research
    model:
      name: gpt-4o
      temperature: 0.5
    depends_on: []
    prompt: |
      You are a research assistant. Provide a detailed answer to:

      {{query}}

  - id: critique
    model: gpt-4o
    depends_on: [research]
    prompt: |
      Critically evaluate the following research answer and identify any gaps:

      {{steps.research.output}}

  - id: final
    model:
      name: gpt-4o
      temperature: 0.2
    depends_on: [research, critique]
    prompt: |
      Given this research:
      {{steps.research.output}}

      And this critique:
      {{steps.critique.output}}

      Produce a refined, comprehensive answer.
```

```bash
echo "What are the main causes of inflation?" | yali run research.yaml
```

---

## Output Formats

The `output.format` field controls how yali processes and presents the LLM's response.

| Format | Behavior |
|---|---|
| `text` | Streams the raw LLM response to stdout. No post-processing. |
| `markdown` | Streams the raw LLM response to stdout. Semantically indicates Markdown content for downstream consumers. |
| `json` | Extracts JSON from markdown code fences (` ```json ... ``` `) if present, then pretty-prints the JSON. Streaming is disabled in JSON mode. |

### UNIX pipe integration

yali's `json` output format works well with tools like `jq`:

```yaml
# data-extractor.yaml
prompt: |
  Extract the author, title, and publication year from the text below.
  Respond with valid JSON only.

  {{input}}

output:
  format: json
  target: stdout
```

```bash
echo "The Great Gatsby by F. Scott Fitzgerald, published in 1925." \
  | yali run data-extractor.yaml \
  | jq '.author'
```

### Writing output to a file

```yaml
output:
  format: text
  target: file
  path: ./result.txt
```

When `target: file`, streaming is disabled and the complete response is written to the specified path.

---

## Dry Run

The `--dry-run` flag renders all prompts with variables fully expanded, but **does not call the LLM API**. No API key is needed for a dry run.

Use it to:
- Verify that template variables are resolved correctly
- Inspect the final prompts before incurring API costs
- Debug multi-step pipelines

### Text format (default)

Human-readable output — one section per step:

```bash
yali run pipeline.yaml --input "Hello" --dry-run
```

Output:

```
=== Step: step0 (model: gpt-4o) ===
Translate the following text to French:

Hello
```

### JSON format

Machine-readable output — useful for programmatic inspection or CI pipelines:

```bash
yali run pipeline.yaml --input "Hello" --dry-run --format json
```

Output:

```json
{
  "steps": [
    {
      "id": "step0",
      "model": "gpt-4o",
      "depends_on": [],
      "prompt": "Translate the following text to French:\n\nHello"
    }
  ]
}
```

### Multi-step dry run

Dry run renders each step's prompt in topological order. Note that **inter-step output references (`{{steps.<id>.output}}`) are not available** during dry run, since no LLM calls are made. If any step prompt references `{{steps.<id>.output}}`, the dry run will exit with a `RenderError`.

Dry run works well for pipelines where steps only reference `{{input}}` or `--var` variables:

```bash
# Works: single-step or multi-step without inter-step output refs
yali run translate.yaml --input "Hello" --dry-run

# Also works: pre-supply step outputs via --var
yali run pipeline.yaml --input "Hello" \
  --var "steps.step_a.output=simulated output" \
  --dry-run --format json
```

---

## Examples

### a. Simple translation (stdin input)

**`translate.yaml`:**

```yaml
name: Translator
model: gpt-4o

prompt: |
  Translate the following text to French:

  {{input}}

input:
  from: stdin
  var: input

output:
  format: text
  target: stdout
```

**Usage:**

```bash
echo "The weather is beautiful today." | yali run translate.yaml
```

---

### b. Summarization with file input

**`summarize.yaml`:**

```yaml
name: Article Summarizer

model:
  name: gpt-4o
  temperature: 0.2
  max_tokens: 256

prompt: |
  Summarize the following article in 3 concise bullet points:

  {{article}}

input:
  from: file
  var: article

output:
  format: markdown
  target: stdout
```

**Usage:**

```bash
yali run summarize.yaml --input ./news-article.txt
```

---

### c. Variable injection with `--var`

**`email.yaml`:**

```yaml
name: Email Composer

model: gpt-4o-mini

prompt: |
  Write a {{tone}} email to {{recipient}} about: {{topic}}.
  Keep it under 150 words.

output:
  format: text
  target: stdout
```

**Usage:**

```bash
yali run email.yaml \
  --var tone=friendly \
  --var recipient="the team" \
  --var topic="Friday's product launch"
```

---

### d. Multi-step: summarize then translate

**`summarize-and-translate.yaml`:**

```yaml
name: Summarize and Translate

input:
  from: file
  var: article

output:
  format: text
  target: stdout

steps:
  - id: summarize
    model:
      name: gpt-4o
      temperature: 0.2
    depends_on: []
    prompt: |
      Summarize the following article in 2-3 sentences:

      {{article}}

  - id: translate
    model: gpt-4o
    depends_on: [summarize]
    prompt: |
      Translate the following English summary into Japanese:

      {{steps.summarize.output}}
```

**Usage:**

```bash
yali run summarize-and-translate.yaml --input ./report.txt
```

**Dry-run check first:**

```bash
yali run summarize-and-translate.yaml --input ./report.txt --dry-run
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | **Yes** | Your OpenAI API key. Required for all LLM calls. Not needed for `--dry-run`. |

### Setting the API key

```bash
# Inline (current shell only)
export OPENAI_API_KEY=sk-...

# Or add to your shell profile for persistence
echo 'export OPENAI_API_KEY=sk-...' >> ~/.bashrc
source ~/.bashrc
```

> **Security:** Never commit your API key to source control. Use environment variables or a secrets manager.

---

## Error Handling

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Error (parse failure, render failure, API error, etc.) |

### Common errors

| Error | Cause | Resolution |
|---|---|---|
| `OPENAI_API_KEY is not set` | The environment variable is missing | Export `OPENAI_API_KEY` before running |
| `RenderError: variable '{{name}}' not found` | A template references a variable that was not provided | Pass the variable via `--var name=value` or check your `input` spec |
| `YAML parse error` | The command file contains invalid YAML syntax | Validate your YAML with a linter |
| `Circular dependency detected` | A multi-step pipeline has a cycle in `depends_on` | Review and remove the circular reference |
| `step id not found in depends_on` | A step references an undefined step ID | Verify all `depends_on` IDs match existing step `id` values |
| API `429 Too Many Requests` | Rate limit exceeded | yali retries automatically (up to 3 times with exponential backoff); reduce request rate if retries are exhausted |
| API `5xx` errors | Transient server error | yali retries automatically on 500, 502, 503, 504 with exponential backoff |

### Retry behaviour

yali automatically retries failed API calls using exponential backoff:

- **Max retries:** 3
- **Retryable status codes:** 408, 429, 500, 502, 503, 504
- **Also retries on:** network-level errors (connection reset, timeout, etc.)

If all retries are exhausted, yali exits with code `1` and prints the error to stderr.
