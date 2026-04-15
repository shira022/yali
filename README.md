# yali

[![CI](https://img.shields.io/github/actions/workflow/status/your-org/yali/ci.yml?label=CI&style=flat-square)](https://github.com/your-org/yali/actions)
[![npm](https://img.shields.io/npm/v/yali?style=flat-square)](https://www.npmjs.com/package/yali)
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
git clone https://github.com/your-org/yali.git
cd yali
npm install
npm run build
npm link          # makes `yali` available globally
```

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

## Documentation

Full usage guide, YAML schema reference, and advanced examples:

📖 **[docs/user-guide.md](docs/user-guide.md)**

---

## Contributing

Contributions are welcome! Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** for branch naming conventions, commit style, and the pull-request workflow.

---

## License

MIT — see [LICENSE](LICENSE) for details.
