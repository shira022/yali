---
name: review-tests
description: Reviews a PR diff for test quality and coverage per architectural layer. Use when performing automated PR review for test adequacy.
---

# review-tests

## When to Use

Invoke this skill when you need to review a pull request for test quality and coverage across the yali 3-layer architecture.

## Step-by-Step Procedure

1. **Read the PR diff**
   ```bash
   gh pr diff {PR_NUMBER}
   ```

2. **Load the write-test skill**
   Read `.agents/skills/write-test/SKILL.md` for the full test strategy per architectural layer.

3. **Apply test quality checks to the diff**

   For each new or modified source file, verify that a corresponding test file exists or is updated in the diff.

   ### Renderer Layer Tests
   - ✅ Must be pure function tests — given the same input, always the same output
   - ✅ No mocks needed (Renderer has zero side effects)
   - ✅ Test all `{{variable}}` expansion cases including missing variables and edge cases
   - ❌ Must NOT mock file I/O or network calls (if mocks are present, Renderer has a side effect violation)

   ### Executor Layer Tests
   - ✅ Must mock the LLM API (e.g., using `vi.mock` or a stub client)
   - ✅ Test both success and failure paths (API errors, rate limits, malformed responses)
   - ✅ Test output formatting for each supported format (text, json, markdown)
   - ❌ Must NOT make real LLM API calls in tests

   ### Parser Layer Tests
   - ✅ Test schema normalization (`model: string` → `model: { name: string }`)
   - ✅ Test shorthand promotion (`prompt: "..."` → `steps: [...]`)
   - ✅ Test validation errors for invalid YAML input
   - ✅ Test that `ValidatedCommand` output matches the expected shape

   ### CLI Layer Tests
   - ✅ Test argument parsing and flag behavior
   - ✅ Test stdin detection
   - ✅ Test exit codes for success and error cases

   ### General Test Quality
   - ✅ Boundary value tests present for edge cases (empty input, null values, max lengths)
   - ✅ New functions/features have corresponding test files in the diff
   - ✅ Test descriptions are clear, meaningful, and describe the expected behavior
   - ✅ Tests follow the Vitest conventions used in this project
   - ❌ No commented-out tests or skipped test blocks without justification

4. **Post the review comment**
   ```bash
   gh pr review {PR_NUMBER} --comment -b "🧪 Test Quality Review\n\n{findings}"
   ```

   Format the `{findings}` using the template below.

## Review Comment Format

```
🧪 Test Quality Review

## Summary
{PASS ✅ / ISSUES FOUND ❌}

## Findings
{list of test issues or missing coverage, or "No issues found"}

## Recommendation
{approve / request changes}
```

## Pass / Fail Criteria

- **PASS ✅**: All new/modified source files have corresponding tests; tests follow per-layer strategy; descriptions are clear; no real LLM API calls in tests.
- **ISSUES FOUND ❌**: Missing test files for new features, Renderer tests that use mocks, Executor tests that call the real LLM API, or unclear test descriptions.

If no issues are found, explicitly state "No issues found" in the Findings section and recommend approval.
