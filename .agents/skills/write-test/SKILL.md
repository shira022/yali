---
name: write-test
description: Guides test creation strategy per architectural layer. Use when adding or reviewing tests.
---

# write-test

## When to Use

Invoke this skill when:
- Adding tests for a new feature.
- Reviewing existing tests for completeness.
- Determining what kind of test (unit/integration/mock) is appropriate for a layer.

## General Rules

- **Renderer tests must never require mocks.** The Renderer is a pure function; all inputs are passed as arguments and all outputs are return values.
- Test files should be co-located with source files or placed in a `__tests__/` directory, following the existing project convention.
- Use [Vitest](https://vitest.dev/) as the test framework (already configured in the project).
- Aim for tests that are fast, deterministic, and isolated.

---

## Per-Layer Test Strategy

### Parser

**Goal**: Verify that raw YAML input is correctly normalized and validated into a `ValidatedCommand`.

| Test Type | What to Test |
|---|---|
| Schema validation | Valid YAML passes without errors; invalid YAML throws a descriptive error |
| Normalization — string→object | `model: gpt-4o` (string) → `model: { name: "gpt-4o" }` (object) |
| Normalization — prompt→steps promotion | `prompt: "..."` alone → `steps: [{ prompt: "..." }]` |
| Extended config | `steps[]` with `depends_on` parses correctly |
| Error cases | Missing required fields, unknown keys, wrong types each produce clear errors |
| Edge cases | Empty file, file not found, malformed YAML |

**Example structure:**
```typescript
describe('Parser', () => {
  it('normalizes model string to object form', () => { ... });
  it('promotes standalone prompt to steps[0]', () => { ... });
  it('throws on missing model field', () => { ... });
});
```

---

### Renderer

**Goal**: Verify pure-function behavior — given inputs, always produces the correct output. No mocks needed.

| Test Type | What to Test |
|---|---|
| Template expansion | `{{input}}` is replaced with the provided variable value |
| Multi-variable expansion | Multiple `{{var}}` references in one template |
| Missing variable handling | Throws or returns a descriptive error when a variable is undefined |
| Dependency graph — multi-step | Steps with `depends_on` are ordered correctly |
| Dependency graph — cycle detection | Circular `depends_on` references are detected and rejected |
| Output type | Returns a `string` (single-step) or ordered `Step[]` (multi-step) |

**Example structure:**
```typescript
describe('Renderer', () => {
  it('expands {{input}} with provided variable', () => {
    const result = render(validatedCommand, { input: 'hello' });
    expect(result).toBe('Translate the following: hello');
  });
  it('throws when a required variable is missing', () => { ... });
  it('orders multi-step steps by dependency graph', () => { ... });
});
```

> ✅ No `vi.mock()` or any mock setup should appear in Renderer tests.

---

### Executor

**Goal**: Verify integration behavior with the LLM API mocked — test orchestration, output formatting, and error handling.

| Test Type | What to Test |
|---|---|
| LLM API call | API client is called with the correct prompt and model parameters |
| Streaming response | Streamed chunks are accumulated correctly into the final output |
| Output format — text | Plain text output matches LLM response |
| Output format — json | JSON output is valid and matches expected schema |
| Output format — markdown | Markdown output is correctly formatted |
| Error handling | API errors trigger retry logic; non-retryable errors propagate with correct exit code |
| Retry logic | Transient failures are retried the expected number of times |
| Multi-step dispatch | Steps are dispatched in dependency order; step outputs are available to subsequent steps |

**Example structure:**
```typescript
describe('Executor', () => {
  it('calls LLM API with correct prompt and model', async () => {
    const mockClient = vi.fn().mockResolvedValue({ content: 'response' });
    const result = await execute(expandedSteps, mockClient);
    expect(mockClient).toHaveBeenCalledWith({ prompt: '...', model: 'gpt-4o' });
  });
  it('retries on transient API error', async () => { ... });
  it('formats output as JSON when output.format is json', async () => { ... });
});
```
