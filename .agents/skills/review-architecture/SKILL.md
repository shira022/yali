---
name: review-architecture
description: Reviews a PR diff for architecture boundary violations in the Parser/Renderer/Executor 3-layer model. Use when performing automated PR review for architecture compliance.
---

# review-architecture

## When to Use

Invoke this skill when you need to review a pull request for architecture boundary violations in the yali 3-layer model (`CLI Layer → Parser → Renderer → Executor`).

## Step-by-Step Procedure

1. **Read the PR diff**
   ```bash
   gh pr diff {PR_NUMBER}
   ```

2. **Load the layer-guard skill**
   Read `.agents/skills/layer-guard/SKILL.md` for the full layer checklist and violation criteria.

3. **Apply layer-guard criteria to the diff**

   For each changed file in the diff, identify its layer (by path: `src/parser/`, `src/renderer/`, `src/executor/`, `src/cli/`) and check:

   ### Parser Layer
   - ✅ Reads YAML files and normalizes them
   - ✅ Returns `ValidatedCommand`
   - ❌ Must NOT call the LLM API
   - ❌ Must NOT expand `{{variable}}` templates
   - ❌ Must NOT write to stdout or files

   ### Renderer Layer
   - ✅ Accepts `ValidatedCommand` + variable map as input
   - ✅ Returns expanded prompt string(s)
   - ❌ Must NOT perform any file I/O
   - ❌ Must NOT make network calls
   - ❌ Must NOT call the LLM API
   - ❌ Must NOT read environment variables or use randomness

   ### Executor Layer
   - ✅ The ONLY layer allowed to call the LLM API
   - ✅ The ONLY layer allowed to perform I/O
   - ❌ Must NOT parse YAML directly
   - ❌ Must NOT expand templates directly (must delegate to Renderer)

   ### Cross-Layer Import Check
   - Imports must flow in one direction: `CLI → Parser → Renderer → Executor`
   - No reverse imports (e.g., Parser importing from Executor)
   - No layer-skipping imports

   ### ValidatedCommand Boundary
   - Raw YAML must not cross the Parser boundary
   - Renderer and Executor must consume `ValidatedCommand`, not raw YAML

4. **Post the review comment**
   ```bash
   gh pr review {PR_NUMBER} --comment -b "🏗️ Architecture Review\n\n{findings}"
   ```

   Format the `{findings}` using the template below.

## Review Comment Format

```
🏗️ Architecture Review

## Summary
{PASS ✅ / ISSUES FOUND ❌}

## Findings
{list of violations with file:line references, or "No violations found"}

## Recommendation
{approve / request changes}
```

## Pass / Fail Criteria

- **PASS ✅**: All changed files comply with their layer's invariants; no cross-layer import violations; `ValidatedCommand` boundary respected.
- **ISSUES FOUND ❌**: Any forbidden action is present in a layer, cross-layer imports violate the dependency direction, or raw YAML crosses the Parser boundary.

If no violations are found, explicitly state "No violations found" in the Findings section and recommend approval.
