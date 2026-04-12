---
name: review-spec
description: Reviews a PR diff for compliance with docs/spec-draft.md. Use when performing automated PR review for spec conformance.
---

# review-spec

## When to Use

Invoke this skill when you need to review a pull request for compliance with the yali specification (`docs/spec-draft.md`).

## Step-by-Step Procedure

1. **Read the PR diff**
   ```bash
   gh pr diff {PR_NUMBER}
   ```

2. **Load the spec-check skill**
   Read `.agents/skills/spec-check/SKILL.md` for the full spec compliance procedure.

3. **Read the relevant spec sections**
   Based on which files are changed in the diff, read the corresponding sections of `docs/spec-draft.md`:
   - Parser changes → YAML schema and normalization sections
   - Renderer changes → variable interpolation and template sections
   - Executor changes → LLM API, output format, and error handling sections
   - CLI changes → CLI flags, arguments, and exit code sections

4. **Apply spec compliance checks to the diff**

   ### ValidatedCommand Type
   - ✅ Used as the DMZ between Parser and Renderer
   - ✅ Fields match the spec Appendix definition
   - ❌ Must not be bypassed or replaced with raw YAML

   ### YAML Schema Normalization
   - ✅ `model: string` is normalized to `model: { name: string }`
   - ✅ `prompt: "..."` is promoted to `steps: [{ prompt: "..." }]`
   - ✅ Validation follows the JSON Schema defined in spec

   ### Variable Interpolation
   - ✅ Format matches `{{variable}}` (double curly braces)
   - ✅ Expansion occurs only in the Renderer layer
   - ❌ No alternative interpolation syntax (e.g., `${variable}`, `{variable}`)

   ### CLI Flags and Behavior
   - ✅ Flags match those defined in the spec (e.g., `--input`, `--output`)
   - ✅ stdin detection behavior matches spec
   - ✅ Command invocation format matches spec: `yali run <file> [flags]`

   ### Error Handling and Exit Codes
   - ✅ Exit codes match spec definitions (e.g., 0 for success, non-zero for errors)
   - ✅ Error messages follow spec format
   - ✅ Validation errors are surfaced at the appropriate layer

5. **Post the review comment**
   ```bash
   gh pr review {PR_NUMBER} --comment -b "📋 Spec Compliance Review\n\n{findings}"
   ```

   Format the `{findings}` using the template below.

## Review Comment Format

```
📋 Spec Compliance Review

## Summary
{PASS ✅ / ISSUES FOUND ❌}

## Findings
{list of spec violations with reference to spec section, or "No violations found"}

## Recommendation
{approve / request changes}
```

## Pass / Fail Criteria

- **PASS ✅**: All changed code is consistent with the corresponding spec sections; types, formats, and behaviors match the spec.
- **ISSUES FOUND ❌**: Any deviation from the spec is found — wrong type structure, incorrect interpolation syntax, mismatched CLI flags, or wrong exit codes.

If no violations are found, explicitly state "No violations found" in the Findings section and recommend approval.
