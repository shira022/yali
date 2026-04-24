# yali — YAML LLM Interface

[![CI](https://github.com/shira022/yali/actions/workflows/ci.yml/badge.svg)](https://github.com/shira022/yali/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)

> YAMLでLLMコマンドを定義して、ターミナルから一発で実行できるオープンソースCLIツール。

---

## 特徴

- **シンプルなYAML定義** — `prompt` と `model` の2行から始められる最小構成
- **マルチステップパイプライン** — `steps[]` と `depends_on` で複数のLLM呼び出しを連鎖
- **柔軟な入力ソース** — `stdin`・コマンドライン引数・ファイルに対応
- **出力フォーマット制御** — `text` / `markdown` / `json` を選択、`stdout` またはファイルへ出力
- **ドライランモード** — `--dry-run` でLLMを呼び出さずにプロンプトを確認
- **テンプレート変数** — `{{variable}}` 構文で任意の変数を埋め込み

---

## クイックスタート

### 前提条件

- Node.js 20 以上
- OpenAI API キー（環境変数 `OPENAI_API_KEY` に設定）

### インストール

```bash
# 推奨: npm からインストール
npm install -g @shira022/yali
```

インストールせずに実行する場合:
```bash
npx @shira022/yali --help
```

<details>
<summary>ソースからビルドする場合</summary>

```bash
git clone https://github.com/shira022/yali.git
cd yali
npm install
npm run build
npm link
```
</details>

### 30秒サンプル

以下のYAMLファイルを作成します。

```yaml
# translate.yaml
name: translate
model:
  name: gpt-4o-mini
  temperature: 0.3
input:
  from: args
  var: input
prompt: |
  Translate the following text into Japanese.

  Text: {{input}}
output:
  format: text
  target: stdout
```

実行：

```bash
export OPENAI_API_KEY=sk-...
yali run translate.yaml --input "Hello, world"
```

出力例：

```
こんにちは、世界
```

---

## コスト・レート制限の保護

yali は意図しない高コストを防ぐための安全機能を内蔵しています。

- **タイムアウト** — 各 API 呼び出しはデフォルトで **60秒** でキャンセルされます。コマンドごとに上書き可能：
  ```yaml
  model:
    name: gpt-4o
    timeout_ms: 30000   # 30秒
  ```
- **リトライ制限** — レート制限・サーバーエラーなどは最大 **3回** まで指数バックオフで再試行します。コマンドごとに上書き可能：
  ```yaml
  model:
    name: gpt-4o
    max_retries: 1   # 最大1回まで
  ```
- **同時実行制限** — 同一マシン上で同時に起動できる `yali run` プロセスは最大 **3つ** です。上限を超えた場合、新しい起動はエラーで即終了します。設定変更は以下のコマンドで：
  ```bash
  yali config set concurrency.max 5   # 同時実行上限を5に変更
  yali config get concurrency.max     # 現在の設定を確認
  ```

---

## CLIリファレンス（概要）

```
yali run <command.yaml> [options]

Options:
  --input <value|path>   プライマリ入力変数（input.from が "file" の場合はファイルパス）
  --var <key=value>      テンプレート変数を追加設定（繰り返し指定可）
  --dry-run              LLMを呼び出さずにプロンプトをレンダリングして確認
  --format <text|json>   --dry-run 時の出力フォーマット（デフォルト: text）
  --help                 ヘルプを表示
```

---

## ドキュメント

詳細なYAMLスキーマ、マルチステップパイプライン、入出力設定などの使い方は、日本語ユーザーガイドを参照してください。

📖 **[docs/user-guide.ja.md](docs/user-guide.ja.md)**

---

## コントリビューション

バグ報告・機能提案・プルリクエストを歓迎します。
コントリビューション前に必ずご確認ください。

📋 **[CONTRIBUTING.md](CONTRIBUTING.md)**

---

## ライセンス

[MIT](LICENSE)

サードパーティライブラリのライセンス表示は [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES) を参照してください。
