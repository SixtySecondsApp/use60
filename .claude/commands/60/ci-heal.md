---
name: 60-ci-heal
invoke: /60/ci-heal
description: Self-healing CI loop — check PR status, fix failures, push, repeat until green
---

# /60/ci-heal — Self-Healing CI Monitor

**Purpose**: Check all CI checks on the current PR. If any are failing, read the error logs, fix the code, push, and report status. Designed to be called by `/loop` for continuous monitoring.

**Input**: $ARGUMENTS

---

## STEP 1: Find the PR

```bash
BRANCH=$(git branch --show-current)
PR_JSON=$(gh pr list --head="$BRANCH" --json number,title,statusCheckRollup --limit 1)
```

If no PR exists, output "No PR found for branch $BRANCH" and exit.

---

## STEP 2: Check CI Status

```bash
gh pr checks <PR_NUMBER>
```

Classify each check:

| Status | Action |
|--------|--------|
| All passing | Report "All CI checks green" and **stop the loop** by telling the user: "CI is all green — PR is ready for review/merge." |
| Still running | Report "CI still running — will check again next cycle" and exit (loop will retry) |
| Any failing | Proceed to STEP 3 |

---

## STEP 3: Diagnose Failures

For each failing check, get the logs:

```bash
# Get the run ID for the failing workflow
gh run list --branch <BRANCH> --status failure --limit 5 --json databaseId,name,conclusion

# Get failure logs
gh run view <RUN_ID> --log-failed
```

### Classify the failure:

**Fixable locally** (fix and push):
- Lint errors → read the error, fix the file, push
- Typecheck errors → read the error, fix the type, push
- Build errors → read the error, fix the import/syntax, push
- Unit test failures → read the test output, fix the code or test, push
- Edge function validation errors → fix imports or syntax
- Migration dry-run errors → fix migration SQL

**CI infrastructure issues** (report, don't fix):
- GitHub Actions permission errors (403) → report: "CI permission issue — needs repo settings update"
- Secret not configured → report: "Missing secret: <NAME>"
- Runner timeout → report: "CI runner timed out — retry manually"
- Supabase Preview failures → report: "Supabase Preview issue — external service"
- Vercel deploy failures → report: "Vercel deploy issue — check Vercel dashboard"

**Flaky / external** (retry once, then report):
- Network timeouts in npm install → re-trigger workflow: `gh run rerun <RUN_ID> --failed`
- Intermittent test failures → re-trigger once, if still failing, investigate

---

## STEP 4: Fix and Push

For each fixable failure:

1. Read the failing file(s)
2. Apply the minimal fix
3. Run the relevant check locally to verify:
   - Lint: `npm run lint`
   - Typecheck: `npm run typecheck`
   - Build: `npm run build`
   - Tests: `npm run test:run`
   - Edge functions: `npx vitest run --config vitest.config.edge.ts`
4. Stage only the fixed files (not `git add -A`)
5. Commit with message: `fix: resolve CI failure — <brief description>`
6. Push

```bash
git add <specific-files>
git commit -m "fix: resolve CI failure — <description>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git push
```

After pushing, exit. The loop will check again on the next cycle to verify the fix worked.

---

## STEP 5: Update PR Test Plan

If test plan checkboxes exist in the PR body and all CI checks are now green:

```bash
# The verify-test-plan CI job handles checkbox updates automatically.
# Just confirm it ran successfully.
gh pr checks <PR_NUMBER> --json name,state | grep "Verify Test Plan"
```

---

## STEP 6: Report Status

Always output a concise status summary:

```
CI Heal: <BRANCH> (PR #<NUMBER>)

  Passing:  Lint, Typecheck, Build, Unit Tests, Deploy
  Failing:  Migration dry-run (fixed — pushed commit abc1234)
  Pending:  Security scan (still running)
  Skipped:  E2E (no credentials)

  Action taken: Fixed migration SQL syntax error
  Next: Waiting for CI re-run — will check again in 5 minutes
```

Or when all green:

```
CI Heal: <BRANCH> (PR #<NUMBER>)

  All 12 checks passing.
  Test plan: 7/7 items verified.

  PR is ready for review and merge.
  Stop the /loop — no further action needed.
```

---

## GUARDRAILS

- **Max 5 fix attempts per check** — if the same check fails 5 times, stop trying and report: "Unable to fix <check> after 5 attempts — needs human review"
- **Never force push** — always create new commits
- **Never modify files outside the PR's scope** — only fix files that are already changed in this PR, or CI config files
- **Never skip hooks** — no `--no-verify`
- **Track attempts** — keep a mental count of fix attempts per check. If approaching limit, be more conservative
- **Don't fight infrastructure** — if it's a CI permissions issue or missing secret, report it and move on. Don't try to work around it.

---

## USAGE

### Standalone (one-shot check)
```
/60/ci-heal
```

### As a loop (continuous monitoring)
```
/loop 5m /60/ci-heal
```

This will check CI every 5 minutes, fix any failures, and stop when all checks pass.

### From /60/deliver
The deliver phase automatically starts this loop after PR creation (Step 4b).
