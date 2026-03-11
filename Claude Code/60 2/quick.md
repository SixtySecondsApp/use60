---
name: 60-quick
invoke: /60/quick
description: Fast-path for bug fixes, small changes, and ad-hoc tasks — skips discovery, PRD, and planning phases
---

# /60/quick — Fast-Path Execution

**Purpose**: Fix a bug, make a small change, or handle an ad-hoc task without spinning up the full pipeline. Straight to implement, quality gates, commit.

**Input**: $ARGUMENTS

---

## WHEN TO USE

- Bug fixes
- Copy/text changes
- Config tweaks
- Single-file refactors
- Small feature additions (1-3 files)
- "Just do this one thing"

**When NOT to use** (use `/60/ship` instead):
- New features touching 5+ files
- Schema changes that need migration planning
- Anything requiring research or cross-cutting concerns

---

## EXECUTION FLOW

```
/60/quick "Fix the date format on invoice list"
  |
  1. UNDERSTAND — Read relevant files, understand the change
  2. IMPLEMENT — Make the change
  3. GATE — Lint + test changed files
  4. COMMIT — Atomic commit with descriptive message
  5. LOG — Append to .sixty/progress.md
  Done.
```

No pipeline.json. No DISCOVER. No PRD. No planning. No Slack. No Dev Hub sync.

---

## STEP 1: UNDERSTAND

Read the relevant code. If the user provided a file path, start there. If they described a problem, use Grep/Glob to find the relevant code.

Spend no more than 2 minutes understanding. If the change turns out to be complex (5+ files, schema changes, unclear scope), say so and recommend `/60/ship` instead:

```
This looks bigger than a quick fix — it touches the schema, 3 services, and 2 components.
Recommend: /60/ship "Fix invoice date format across all views"
Continue anyway? [y/N]
```

---

## STEP 2: IMPLEMENT

Make the change. Follow existing patterns (check nearby code for conventions).

Rules:
- Read before editing. Always.
- Match existing code style exactly.
- No drive-by refactors. Fix the thing, nothing else.

---

## STEP 3: QUALITY GATES

```bash
# Only lint changed files
CHANGED=$(git diff --name-only HEAD -- '*.ts' '*.tsx')
[ -n "$CHANGED" ] && npx eslint $CHANGED --max-warnings 0 --quiet

# Only test changed files
npx vitest run --changed HEAD --passWithNoTests
```

If gates fail:
1. Fix the issue
2. Re-run gates
3. If still failing after 2 attempts, report the failure and stop

---

## STEP 4: COMMIT

```bash
git add -A
git commit -m "<type>: <concise description>"
```

Type: `fix` for bugs, `feat` for additions, `chore` for config, `docs` for documentation.

---

## STEP 5: LOG

Append to `.sixty/progress.md` (create if it doesn't exist):

```markdown
### <timestamp> -- QUICK FIX
**Task**: <what was asked>
**Files**: <files changed>
**Gates**: lint <pass/fail> | test <pass/fail>
```

---

## OPTIONS

| Flag | Effect |
|------|--------|
| `--no-commit` | Skip auto-commit |
| `--no-gate` | Skip quality gates (use sparingly) |
| `--dry-run` | Show what would change without modifying files |

---

## EXAMPLES

```bash
/60/quick "Fix the date format on the invoice list page"
/60/quick "Add loading spinner to contacts table"
/60/quick "Update the Stripe webhook URL in env config"
/60/quick "Remove the deprecated clerk_org_id filter from deals query"
/60/quick --dry-run "What would need to change to support dark mode toggle?"
```

---

## ERROR HANDLING

| Error | Action |
|-------|--------|
| Can't find relevant code | Ask user for file path or more context |
| Change is too complex | Recommend `/60/ship`, offer to continue anyway |
| Gates fail twice | Report failure, stop, suggest manual review |
| No .sixty/ directory | Create just progress.md, skip config |
