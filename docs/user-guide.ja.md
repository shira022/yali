# yali 全機能リファレンス（日本語版）

**yali**（YAML LLM Interface）は、YAMLファイルでLLMコマンドを定義し、ターミナルから実行できるオープンソースCLIツールです。

> 日本語版トップページは [README.ja.md](../README.ja.md) を参照してください。英語版は [README.md](../README.md) と [docs/user-guide.md](./user-guide.md) をご覧ください。

---

## 目次

1. [要件](#要件)
2. [インストール](#インストール)
3. [CLIリファレンス](#cliリファレンス)
4. [YAMLスキーマリファレンス](#yamlスキーマリファレンス)
5. [入力解決](#入力解決)
6. [マルチステップパイプライン](#マルチステップパイプライン)
7. [出力フォーマット](#出力フォーマット)
8. [ドライラン](#ドライラン)
9. [使用例](#使用例)
10. [環境変数](#環境変数)
11. [エラー対処](#エラー対処)

---

## 要件

| 項目 | 要件 |
|---|---|
| Node.js | 20以上 |
| 環境変数 | `OPENAI_API_KEY`（必須） |

```bash
export OPENAI_API_KEY="sk-..."
```

---

## インストール

```bash
# リポジトリをクローン
git clone https://github.com/your-org/yali.git
cd yali

# 依存関係をインストール
npm install

# TypeScriptをビルド
npm run build

# グローバルにリンク（どこからでも yali コマンドを使用可能）
npm link
```

インストール後、以下のコマンドで動作を確認してください。

```bash
yali --help
```

---

## CLIリファレンス

```
Usage: yali run <command.yaml> [options]
```

### オプション一覧

| オプション | 引数 | 説明 |
|---|---|---|
| `--input <value\|path>` | 文字列またはファイルパス | プライマリ入力変数を設定。`input.from` が `file` の場合はファイルパスとして解釈される |
| `--var <key=value>` | `キー=値` 形式 | 任意のテンプレート変数を設定。複数回指定可能 |
| `--dry-run` | なし | LLMを呼び出さずにプロンプトのレンダリングのみ行う |
| `--format <text\|json>` | `text` または `json` | `--dry-run` の出力フォーマット（デフォルト: `text`） |
| `--help` | なし | ヘルプメッセージを表示 |

### 基本的な使い方

```bash
# YAMLコマンドを実行（stdin入力）
echo "Hello, world" | yali run translate.yaml

# --input で値を直接指定
yali run translate.yaml --input "Hello, world"

# 複数の変数を注入
yali run summarize.yaml --input "本文..." --var lang=Japanese --var style=formal

# ドライランでプロンプトを確認
yali run translate.yaml --input "test" --dry-run

# ドライランをJSONで出力
yali run translate.yaml --input "test" --dry-run --format json
```

---

## YAMLスキーマリファレンス

### a. 最小構成（prompt + model文字列）

最もシンプルな形式です。`prompt` と `model` のみを指定します。

```yaml
prompt: "次のテキストを日本語に翻訳してください: {{input}}"
model: gpt-4o
```

- `model` を省略した場合のデフォルトは `gpt-4o` です。
- `input` フィールドを省略した場合、自動的に `{ from: stdin, var: input }` が適用されます。

### b. 標準構成（name, modelオブジェクト, input, output）

```yaml
name: translate
version: "1.0"

model:
  name: gpt-4o
  temperature: 0.3
  max_tokens: 2048

prompt: |
  次のテキストを{{lang}}に翻訳してください。

  テキスト:
  {{input}}

input:
  from: stdin
  var: input
  default: "(入力なし)"

output:
  format: text
  target: stdout
```

### c. マルチステップ構成（steps配列とdepends_on）

```yaml
name: summarize-and-translate

steps:
  - id: summarize
    model: gpt-4o
    prompt: |
      以下のテキストを3文以内で要約してください。

      テキスト:
      {{input}}

  - id: translate
    model: gpt-4o-mini
    depends_on:
      - summarize
    prompt: |
      次の文章を英語に翻訳してください。

      {{steps.summarize.output}}

input:
  from: stdin
  var: input

output:
  format: text
  target: stdout
```

### d. トップレベルフィールド参照表

| フィールド | 型 | 省略可否 | 説明 |
|---|---|---|---|
| `name` | 文字列 | 省略可 | コマンド名 |
| `version` | 文字列 | 省略可 | バージョン文字列 |
| `prompt` | 文字列 | `steps`と排他 | シングルステップ省略記法 |
| `model` | 文字列またはModelSpec | 省略可 | `prompt`省略記法で使用。デフォルト: `gpt-4o` |
| `steps` | Step配列 | `prompt`と排他 | マルチステップモード |
| `input` | InputSpec | 省略可 | 入力設定 |
| `output` | OutputSpec | 省略可 | 出力設定 |
| `tools` | ToolSpec[] | 省略可 | ツール仕様（MCP、将来対応） |

### e. ModelSpecフィールド参照表

`model` フィールドには文字列またはオブジェクト（ModelSpec）を指定できます。

```yaml
# 文字列形式
model: gpt-4o

# オブジェクト形式（ModelSpec）
model:
  name: gpt-4o
  temperature: 0.7
  max_tokens: 1024
```

| フィールド | 型 | 省略可否 | 説明 |
|---|---|---|---|
| `name` | 文字列 | **必須** | モデル名（例: `gpt-4o`, `gpt-4o-mini`） |
| `temperature` | 浮動小数点 | 省略可 | サンプリング温度（0.0〜2.0） |
| `max_tokens` | 整数 | 省略可 | 最大生成トークン数 |

### f. InputSpecフィールド参照表

```yaml
input:
  from: stdin        # stdin | args | file
  var: input         # テンプレート内の変数名
  default: "(なし)"  # 入力がない場合のデフォルト値
  path: ./data.txt   # from: file の場合のパス（省略可）
```

| フィールド | 型 | 省略可否 | 説明 |
|---|---|---|---|
| `from` | `stdin` \| `args` \| `file` | **必須** | 入力ソース |
| `var` | 文字列 | **必須** | プロンプトテンプレート内の変数名 |
| `default` | 文字列 | 省略可 | 入力がない場合のデフォルト値 |
| `path` | 文字列 | 省略可 | `from: file` で `--input` が指定されない場合のファイルパス |

### g. OutputSpecフィールド参照表

```yaml
output:
  format: text       # text | markdown | json
  target: stdout     # stdout | file
  path: ./out.txt    # target: file の場合に必須
```

| フィールド | 型 | 省略可否 | 説明 |
|---|---|---|---|
| `format` | `text` \| `markdown` \| `json` | **必須** | 出力フォーマット |
| `target` | `stdout` \| `file` | **必須** | 出力先 |
| `path` | 文字列 | 条件付き必須 | `target: file` の場合に必須のファイルパス |

### h. Stepフィールド参照表

`steps` 配列の各要素に指定するフィールドです。

| フィールド | 型 | 省略可否 | 説明 |
|---|---|---|---|
| `id` | 文字列 | **必須** | ステップの一意な識別子 |
| `prompt` | 文字列 | **必須** | `{{変数}}`参照を含むプロンプトテンプレート |
| `model` | 文字列またはModelSpec | **必須** | このステップで使用するモデル |
| `depends_on` | 文字列[] | 省略可 | 先行して完了すべきステップのIDリスト（デフォルト: `[]`） |

---

## 入力解決

yaliは以下の優先順位で入力変数を解決します（高い順）。

| 優先順位 | ソース | 方法 |
|---|---|---|
| 1（最高） | `--var key=value` フラグ | 任意の変数を直接指定 |
| 2 | `from: args` | `--input <値>` をそのまま使用 |
| 3 | `from: stdin` | パイプされたstdinテキスト |
| 3 | `from: file` | `--input <パス>` でファイルを読み込み |
| 4（最低） | `input.default` | YAMLに定義されたデフォルト値 |

### 各入力モードの例

#### from: stdin（パイプ入力）

```yaml
input:
  from: stdin
  var: input
```

```bash
echo "翻訳するテキスト" | yali run translate.yaml
cat document.txt | yali run summarize.yaml
```

#### from: args（直接値指定）

```yaml
input:
  from: args
  var: input
```

```bash
yali run translate.yaml --input "翻訳するテキスト"
```

#### from: file（ファイル読み込み）

```yaml
input:
  from: file
  var: content
  path: ./default-input.txt  # --input 未指定時のフォールバック
```

```bash
# ファイルパスを直接指定
yali run summarize.yaml --input ./report.txt

# --input 省略時は YAML の path を使用
yali run summarize.yaml
```

#### --var による変数注入

`--var` は `input` 変数以外の任意の変数を上書き・追加できます。

```bash
yali run translate.yaml --input "Hello" --var lang=French --var style=formal
```

対応するYAML:

```yaml
prompt: |
  次のテキストを{{lang}}に{{style}}なスタイルで翻訳してください。

  テキスト: {{input}}
model: gpt-4o
```

---

## マルチステップパイプライン

### 仕組み

`steps` 配列を使用すると、複数のLLM呼び出しを連鎖させられます。

- **`depends_on`**: 依存するステップのIDを指定します。依存ステップが完了してから当該ステップが実行されます。
- **実行順序**: Kahnのアルゴリズムによるトポロジカルソートで決定されます。依存関係のないステップは先に実行されます。
- **ステップ出力の参照**: 前のステップの出力は `{{steps.<id>.output}}` でアクセスできます。

### 実行フロー

```
step A（depends_on: []）
    ↓ 完了
step B（depends_on: [A]）
    ↓ 完了
step C（depends_on: [A, B]）
```

依存関係のないステップは並列実行ではなく、トポロジカル順で逐次実行されます。

### マルチステップYAML例

```yaml
name: research-and-report

steps:
  - id: extract
    model: gpt-4o
    prompt: |
      以下の文書から重要なキーワードを10個抽出してください。

      文書:
      {{input}}

  - id: summarize
    model: gpt-4o
    depends_on:
      - extract
    prompt: |
      以下のキーワードに基づいて、文書の要旨を200字以内でまとめてください。

      キーワード:
      {{steps.extract.output}}

      元の文書:
      {{input}}

  - id: report
    model: gpt-4o-mini
    depends_on:
      - extract
      - summarize
    prompt: |
      以下の情報を使って、最終レポートを作成してください。

      要旨: {{steps.summarize.output}}
      キーワード: {{steps.extract.output}}

input:
  from: stdin
  var: input

output:
  format: markdown
  target: stdout
```

```bash
cat research-paper.txt | yali run research-and-report.yaml
```

---

## 出力フォーマット

`output.format` で出力形式を制御します。

| フォーマット | 説明 | 用途 |
|---|---|---|
| `text` | プレーンテキスト（デフォルト） | 一般的なテキスト出力 |
| `markdown` | Markdownテキスト | ドキュメント生成 |
| `json` | JSON形式 | プログラムによる後処理 |

`text` と `markdown` の場合、出力はstdoutにストリーミングされます。`json` またはターゲットが `file` の場合はストリーミングされません。

### UNIXパイプ連携例（json + jq）

```yaml
name: analyze
prompt: |
  以下のテキストを分析し、JSON形式で返してください。
  { "sentiment": "positive|negative|neutral", "score": 0.0-1.0, "summary": "..." }

  テキスト: {{input}}
model: gpt-4o
output:
  format: json
  target: stdout
```

```bash
# jq でフィールドを抽出
echo "素晴らしい製品です！" | yali run analyze.yaml | jq '.sentiment'

# 複数ファイルをバッチ処理
for f in reviews/*.txt; do
  cat "$f" | yali run analyze.yaml | jq -c '{file: "'"$f"'", sentiment: .sentiment}'
done
```

### ファイルへの出力

```yaml
output:
  format: markdown
  target: file
  path: ./output/report.md
```

```bash
cat article.txt | yali run summarize.yaml
# 結果は ./output/report.md に保存される
```

---

## ドライラン

`--dry-run` フラグを使うと、LLM APIを呼び出さずにプロンプトのレンダリング結果を確認できます。APIキーを消費しないため、YAMLの検証やデバッグに便利です。

### テキスト形式（デフォルト）

人間が読みやすい形式で出力されます。

```bash
yali run translate.yaml --input "Hello, world" --dry-run
```

出力例:

```
=== Step: step0 (model: gpt-4o) ===
次のテキストを日本語に翻訳してください: Hello, world
```

### マルチステップのドライラン

ドライランでは各ステップのプロンプトをトポロジカル順にレンダリングします。ただし、ドライランではLLMが呼び出されないため、**ステップ間の出力参照（`{{steps.<id>.output}}`）は利用できません**。後続ステップのプロンプトが `{{steps.<id>.output}}` を参照している場合、ドライランは `RenderError` で終了します。

ドライランが有効なのは、各ステップのプロンプトが `{{input}}` や `--var` で提供された変数のみを参照している場合です：

```bash
# 有効: シングルステップ、またはステップ間参照のないマルチステップ
yali run translate.yaml --input "Hello" --dry-run

# --var でステップ出力を模擬することも可能
yali run pipeline.yaml --input "Hello" \
  --var "steps.step_a.output=模擬出力テキスト" \
  --dry-run --format json
```

### JSON形式（機械向け）

```bash
yali run translate.yaml --input "Hello, world" --dry-run --format json
```

出力例:

```json
{
  "steps": [
    {
      "id": "step0",
      "prompt": "次のテキストを日本語に翻訳してください: Hello, world",
      "model": { "name": "gpt-4o" },
      "depends_on": []
    }
  ]
}
```

---

## 使用例

### 例1: シンプルな翻訳（stdin入力）

`translate.yaml`:

```yaml
name: translate
prompt: |
  次のテキストを日本語に翻訳してください。自然な日本語で翻訳し、翻訳結果のみを出力してください。

  テキスト:
  {{input}}
model:
  name: gpt-4o
  temperature: 0.3
input:
  from: stdin
  var: input
output:
  format: text
  target: stdout
```

```bash
echo "The quick brown fox jumps over the lazy dog." | yali run translate.yaml
```

### 例2: ファイル入力での要約

`summarize.yaml`:

```yaml
name: summarize
prompt: |
  以下の文書を読み、3〜5文で簡潔に要約してください。

  文書:
  {{content}}
model:
  name: gpt-4o
  max_tokens: 512
input:
  from: file
  var: content
output:
  format: text
  target: stdout
```

```bash
yali run summarize.yaml --input ./report.pdf.txt
```

### 例3: --varによる変数注入

`translate-custom.yaml`:

```yaml
name: translate-custom
prompt: |
  次のテキストを{{target_lang}}に翻訳してください。
  トーン: {{tone}}
  翻訳結果のみを出力してください。

  テキスト:
  {{input}}
model: gpt-4o
input:
  from: args
  var: input
output:
  format: text
  target: stdout
```

```bash
yali run translate-custom.yaml \
  --input "人工知能は私たちの生活を変えています。" \
  --var target_lang=English \
  --var tone=academic
```

### 例4: マルチステップ — 要約してから翻訳

`summarize-then-translate.yaml`:

```yaml
name: summarize-then-translate

steps:
  - id: summarize
    model:
      name: gpt-4o
      temperature: 0.5
    prompt: |
      以下の長文を200字以内で要約してください。要約のみを出力してください。

      文書:
      {{input}}

  - id: translate
    model:
      name: gpt-4o-mini
      temperature: 0.3
    depends_on:
      - summarize
    prompt: |
      次の日本語テキストを英語に翻訳してください。翻訳結果のみを出力してください。

      {{steps.summarize.output}}

input:
  from: stdin
  var: input

output:
  format: text
  target: stdout
```

```bash
cat long-article.txt | yali run summarize-then-translate.yaml
```

ドライランで確認:

```bash
cat long-article.txt | yali run summarize-then-translate.yaml --dry-run
```

---

## 環境変数

| 変数名 | 必須 | 説明 |
|---|---|---|
| `OPENAI_API_KEY` | **必須** | OpenAI APIキー。未設定の場合はエラーで終了します。 |

```bash
# シェルセッションで設定
export OPENAI_API_KEY="sk-..."

# .env ファイルを使う場合（dotenvなどを使用）
echo 'OPENAI_API_KEY=sk-...' > .env
```

> **セキュリティ上の注意**: APIキーをYAMLファイルやソースコードに直接記載しないでください。必ず環境変数で管理してください。

---

## エラー対処

### 終了コード

| コード | 意味 |
|---|---|
| `0` | 正常終了 |
| `1` | エラー終了（詳細はstderrに出力） |

### よくあるエラーと対処法

#### `OPENAI_API_KEY` が未設定

```
Error: OPENAI_API_KEY environment variable is not set.
```

**対処**: `export OPENAI_API_KEY="sk-..."` を実行してください。

#### YAMLファイルが見つからない

```
Error: Cannot find YAML file: ./translate.yaml
```

**対処**: ファイルパスが正しいか確認してください。

#### テンプレート変数が見つからない（RenderError）

```
RenderError: Variable "lang" is not defined.
```

**対処**: YAMLの `prompt` 内で参照している変数が、`input.var` または `--var` で提供されているか確認してください。

#### レート制限エラー（HTTP 429）

yaliは指数バックオフで最大3回リトライします（HTTP 408/429/500/502/503/504およびネットワークエラー）。リトライ後も失敗した場合:

```
Error: OpenAI API rate limit exceeded after 3 retries.
```

**対処**: しばらく待ってから再試行するか、`model.max_tokens` を削減してリクエストサイズを小さくしてください。

#### `prompt` と `steps` の同時指定

```
Error: Cannot specify both "prompt" and "steps" in the same YAML file.
```

**対処**: シングルステップには `prompt` を、マルチステップには `steps` を使用し、両方を同時に指定しないでください。

#### `target: file` で `path` が未指定

```
Error: output.path is required when output.target is "file".
```

**対処**: YAMLの `output` セクションに `path` フィールドを追加してください。

### デバッグのヒント

1. `--dry-run` でプロンプトのレンダリング結果を確認する。
2. `--dry-run --format json` で機械可読な形式で確認する。
3. シンプルな最小構成のYAMLから始めて、徐々にフィールドを追加する。
4. `--var` で変数を上書きして、テンプレートの動作を確認する。
