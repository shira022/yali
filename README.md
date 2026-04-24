# yali

[![CI](https://img.shields.io/github/actions/workflow/status/shira022/yali/ci.yml?label=CI&style=flat-square)](https://github.com/shira022/yali/actions)
[![npm](https://img.shields.io/npm/v/%40shira022%2Fyali?style=flat-square)](https://www.npmjs.com/package/@shira022/yali)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

**YAML LLM Interface** — define LLM commands in YAML, run them from the terminal.

---

## Features

- 📄 **YAML-first** — describe prompts, models, and I/O in a single file
- 🔗 **Multi-step pipelines** — chain steps with `depends_on` and pass outputs between them
- 📥 **Flexible input** — read from stdin, CLI args, or a file
- 📤 **Flexible output** — write text, Markdown, or JSON to stdout or a file
- 🔍 **Dry-run mode** — render and inspect prompts without calling the API
- 🧩 **Template variables** — inject dynamic values with `{{variable}}` syntax and `--var`

---

## Quick Start

### Prerequisites

- Node.js 20+
- An OpenAI API key exported as `OPENAI_API_KEY`

### Install

```bash
# Recommended: install from npm
npm install -g @shira022/yali
```

Or run without installing:
```bash
npx @shira022/yali --help
```

<details>
<summary>Build from source</summary>

```bash
git clone https://github.com/shira022/yali.git
cd yali
npm install
npm run build
npm link
```
</details>

### 30-second example

Create `translate.yaml`:

```yaml
name: translate
model:
  name: gpt-4o-mini
  temperature: 0.3
input:
  from: args
  var: input
prompt: |
  Translate the following text into Japanese:

  {{input}}
output:
  format: text
  target: stdout
```

Run it:

```bash
yali run translate.yaml --input "Hello, world"
```

Output:

```
こんにちは、世界
```

#### Other useful flags

```
--var key=value    Set an additional template variable (repeatable)
--dry-run          Print the rendered prompt without calling the LLM
--format json      Output dry-run result as JSON
```

---

## Cost & Rate Limit Protection

yali includes built-in safeguards to prevent runaway API usage:

- **Timeout** — Each API call is cancelled after **60 seconds** by default. Override per command:
  ```yaml
  model:
    name: gpt-4o
    timeout_ms: 30000   # 30 seconds
  ```
- **Retry limit** — Retryable errors (rate limits, server errors) are retried up to **3 times** with exponential backoff. Override per command:
  ```yaml
  model:
    name: gpt-4o
    max_retries: 1   # retry at most once
  ```
- **Concurrency limit** — At most **3** `yali run` processes may run simultaneously on your machine. If you exceed this limit, the new invocation exits immediately with an error. Change the limit via:
  ```bash
  yali config set concurrency.max 5   # allow up to 5 concurrent processes
  yali config get concurrency.max     # check the current limit
  ```

> **⚠️ Cost warning:** Even with these defaults, repeated or parallel invocations of `yali run` can accumulate LLM API charges quickly. Monitor your provider usage dashboards and set appropriate limits in your YAML files for long-running workflows.

---

## Documentation

Full usage guide, YAML schema reference, and advanced examples:

📖 **[docs/user-guide.md](docs/user-guide.md)**

---

## Contributing

Contributions are welcome! Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** for branch naming conventions, commit style, and the pull-request workflow.

---

## License

MIT — see [LICENSE](LICENSE) for details.

Third-party dependency licenses are listed in [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).
