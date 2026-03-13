---
name: 60-deliver
invoke: /60/deliver
description: Quality gate — regression testing, docs generation, PR creation, staging deploy, human approval
---

# /60/deliver — Quality, Docs, PR, Deploy, Ship

**Purpose**: Final phase — run full test suite, finalize documentation (dev + user), create PR, deploy to staging, post summary. Phase 6 of `/60/ship`. The one human gate in the pipeline.

**Input**: $ARGUMENTS

---

## OVERVIEW

DELIVER is the quality gate between "code written" and "code shipped." It runs the Regression Sentinel, validates all TDD tests pass, finalizes documentation for both developers and users, creates a PR with full context, deploys to staging, and presents everything for human review.

```
BUILD complete (all stories done)
  |
  v
REGRESSION SENTINEL — compare feature branch vs main
  |
  v
FULL TEST SUITE — all 4 tiers
  |
  v
CI WORKFLOW VERIFICATION — check all GitHub Actions checks pass
  |
  v
DOCUMENTATION — dev docs + user docs + visibility tagging
  |
  v
PR CREATION — auto-generated from pipeline context
  |
  v
STAGING DEPLOY — Railway (or dry-run for use60/Supabase)
  |
  v
DELIVER REPORT — presented to human for approval
```

---

## STEP 1: Regression Sentinel

Run in an isolated worktree to avoid disrupting the working directory.

### 1a. Baseline (main branch)
```bash
# In worktree
git checkout main
npm install
npm run test:run 2>&1 | tee /tmp/baseline-tests.txt
```
Record: total tests, passing, failing, coverage %.

### 1b. Feature Branch
```bash
git checkout feature/<runSlug>
npm install
npm run test:run 2>&1 | tee /tmp/feature-tests.txt
```
Record: total tests, passing, failing, coverage %.

### 1c. Compare
```
Regression check:
  Baseline (main): 142 tests, 140 passing, 2 skipped, 68.2% coverage
  Feature branch:  189 tests, 189 passing, 0 skipped, 74.1% coverage

  New tests: +47
  Regressions: 0
  Coverage delta: +5.9%
```

If regressions found:
1. List each failing test with file + line number
2. Route back to a worker agent for fix
3. Re-run sentinel after fix
4. Repeat until clean (max 3 attempts)
5. If still failing after 3 attempts, flag for human in DELIVER report

---

## STEP 2: Full Test Suite (4 Tiers)

### Tier 1: Unit Tests (always run)
```bash
npm run test:run
```

### Tier 2: Component Tests (always run)
```bash
npx vitest run --project component 2>/dev/null || npx vitest run
```

### Tier 3: Playwriter MCP (preferred E2E)
Check if Playwriter MCP is available:
- YES: Run E2E tests against localhost or staging
  - Use test credentials from secrets manager
  - Test critical user flows (auth, core feature, happy path)
- NO: Post to Slack: "Enable Playwriter MCP for E2E testing. Falling back to Tier 4."

**Important**: This is Playwriter MCP — NOT standard Playwright. Playwriter MCP has access to the user's browser session and handles auth flows that standard Playwright cannot. If Playwriter MCP is unavailable, fall back to Tier 4.

### Tier 4: Headless E2E with Test Credentials (fallback)
If Playwriter MCP unavailable and test credentials are stored:
```bash
# Use stored test credentials for auth
npx playwright test --project=chromium
```

If no test credentials exist:
```
No E2E testing possible — no Playwriter MCP and no test credentials.
Flagging in DELIVER report.
```

### Test Summary
```
Test Results:
  Tier 1 (unit): 189/189 passing
  Tier 2 (component): 34/34 passing
  Tier 3 (Playwriter MCP): skipped (not available)
  Tier 4 (headless E2E): 8/8 passing (used test creds)

  Total: 231 tests, all passing
  Coverage: 74.1% (+5.9% from baseline)
```

---

## STEP 2b: CI Workflow Verification

After local tests pass, verify all GitHub Actions CI checks are passing on the feature branch. This catches environment-specific issues that local tests miss.

### 2b-1. Push and Check PR Status

If a PR already exists for this branch, poll its check status:

```bash
# Get PR number for current branch
BRANCH=$(git branch --show-current)
PR_JSON=$(gh pr list --head="$BRANCH" --json number,statusCheckRollup --limit 1)

# If no PR yet, one will be created in STEP 4 — skip CI verification for now
# and re-verify after PR creation
```

### 2b-2. Poll GitHub Actions Workflow Status

Wait for all workflows to complete (max 10 minutes):

```bash
gh pr checks <PR_NUMBER> --watch --fail-level all
```

Or poll manually:
```bash
gh pr checks <PR_NUMBER> --json name,state,conclusion
```

### 2b-3. Classify Results

```
CI Workflow Verification:
  BLOCKING (must pass):
    Lint (pr-checks.yml):       success | failure
    Typecheck (pr-checks.yml):  success | failure
    Build (pr-checks.yml):      success | failure

  REPORTING (informational):
    Unit Tests (pr-checks.yml): success | failure
    E2E Tests (pr-e2e.yml):     success | failure | skipped (no creds)
    Migrations (db-migrations): success | failure | skipped (no changes)
    Security (security-scan):   success | failure

  STATUS: ALL BLOCKING CHECKS PASS | BLOCKED
```

### 2b-4. Handle Failures

**If ANY blocking check fails (lint, typecheck, build):**
1. Parse the failure output from GitHub Actions
2. Route back to a worker agent for fix
3. Push fix, wait for CI re-run
4. Max 3 attempts before flagging for human

**If E2E tests fail:**
- Flag in DELIVER report as non-blocking
- Include link to Playwright report artifact
- Recommend investigating before merge

**If E2E tests skipped (no credentials):**
- Note in DELIVER report: "E2E not verified in CI — add TEST_USER_EMAIL, TEST_USER_PASSWORD, STAGING_SUPABASE_ANON_KEY secrets to enable"

**If PR doesn't exist yet:**
- Skip CI verification now
- The self-healing CI loop (Step 4b) will handle verification after PR creation

### 2b-5. Auto-Ticked Test Plans

PRs with edge function changes automatically get test plan checkboxes verified by the `verify-test-plan` CI job in `deploy-functions.yml`. This job:
1. Runs regression tests (`vitest.config.edge.ts`)
2. Parses results per test group
3. Updates PR body checkboxes via GitHub API

When DELIVER polls CI status, it should check that `Verify Test Plan` passed and that test plan checkboxes in the PR body are ticked. If any remain unchecked after CI completes, flag them in the DELIVER report as items needing manual verification.

---

## STEP 3: Documentation Generation

Two streams, generated based on what was built.

### 3a. Developer Documentation

For each significant change in this pipeline run:

**New edge functions / API endpoints:**
- Document request/response format
- Auth requirements
- Rate limiting
- Error codes
- Write to: `docs/api/<function-name>.md` or update existing

**Schema changes:**
- Document new tables, columns, relationships
- RLS policy explanations
- Migration notes
- Write to: `docs/database/` or update `docs/CLAUDE_REFERENCE.md`

**New patterns introduced:**
- Extract from `progress.md` learnings
- Document reusable patterns (hooks, services, components)
- Write to: `docs/patterns/` or update `docs/CLAUDE_REFERENCE.md`

**Architecture decisions:**
- Why certain approaches were chosen (from DISCOVER agent findings)
- Trade-offs considered
- Write to: `docs/decisions/` (ADR format)

### 3b. User Documentation

For each user-facing change:

**New features:**
- Plain English description of what the user can do
- Step-by-step how-to guide
- Screenshots or UI descriptions
- Write to: `docs/user/<feature-name>.md`

**Changed features:**
- What changed from the user's perspective
- Any new UI elements or workflows
- Write to: update existing user doc

### 3c. Visibility Tagging

Every feature/story gets tagged in pipeline.json:

```
visibility: "external"    → Live in customer-facing app
  → User docs go live immediately
  → Added to help center / changelog

visibility: "internal"    → Admin-only, not customer-facing
  → Dev docs only, no user docs
  → Not in changelog

visibility: "unreleased"  → Built but behind feature flag / not yet exposed
  → User docs prepared but marked DRAFT
  → Ready for when feature is released
  → Dev docs are live
```

### 3d. Documentation Inventory Check

Cross-reference existing docs with current features:
- Which existing features have no user docs?
- Which docs reference features that changed?
- Which docs reference deprecated functionality?

Flag gaps in the DELIVER report:
```
Documentation gaps found:
  - Meeting Prep feature: no user docs (external, released)
  - Copilot Agent: user docs marked DRAFT (unreleased)
  - Email Branding: docs reference old template system (stale)
```

---

## STEP 4: Create PR

Generate a PR with comprehensive description:

### PR Title
```
feat: <project name> — <one-line description>
```

### PR Body
```markdown
## Summary

<2-3 sentences from PRD introduction>

## Stories Completed

| Story | Title | Type | Tests |
|-------|-------|------|-------|
| US-001 | Invoice schema + migration | schema | 4 unit |
| US-002 | Stripe webhook receiver | api | 8 unit + 2 E2E |
| ... | ... | ... | ... |

## Test Results

- Unit: X/X passing
- Component: X/X passing
- E2E: X/X passing (Tier N)
- Coverage: X% (+Y% from baseline)
- Regressions: 0

## Documentation Added

### Developer Docs
- `docs/api/stripe-webhooks.md` (new)
- `docs/database/invoices.md` (new)
- `docs/CLAUDE_REFERENCE.md` (updated)

### User Docs
- `docs/user/invoicing.md` (new — external)
- `docs/user/billing-dashboard.md` (new — unreleased/DRAFT)

## Schema Changes

- Migration: `NNNN_create_invoices_table.sql`
- New table: `invoices` (id, stripe_id, amount, status, ...)
- RLS: row-level security for org-scoped access

## Technical Decisions

- Webhook idempotency via invoice_id dedup
- Soft-delete on invoices (preserves audit trail)
- React Query for invoice list with optimistic updates

## Heartbeat Observations

During BUILD, the heartbeat identified:
- N proposals created (H high, M medium, L low)
- See Dev Hub backlog for details

## How to Test

1. `npm run dev` → localhost:3000
2. Login with test credentials (see secrets manager)
3. Navigate to /invoices
4. Create, view, edit, delete invoice
5. Trigger Stripe webhook via CLI: `stripe trigger invoice.paid`
```

### Create the PR

```bash
git add -A
git commit -m "feat: <runSlug> — <project description>"
git push -u origin feature/<runSlug>
# Create PR via gh CLI if available
gh pr create --title "<PR title>" --body "<PR body>" --base main
```

If `gh` CLI not available, provide the PR body for manual creation.

---

## STEP 4b: Start Self-Healing CI Loop

After the PR is created and CI is running, start the self-healing loop:

```
/loop 5m /60/ci-heal
```

This loop will:
1. Poll PR checks every 5 minutes
2. If any check fails, read the error logs, fix the code, push
3. Repeat until all checks pass
4. Auto-tick test plan checkboxes (via `verify-test-plan` CI job)
5. Notify the user when the PR is fully green and ready for review

The loop is the **primary mechanism** for handling CI failures. Instead of blocking DELIVER with synchronous retries, the loop runs in the background and self-heals while the user can continue with other work.

### When to skip the loop
- If all CI checks pass on first run → no loop needed
- If the PR has no CI workflows triggered → skip
- If the user explicitly says to skip CI verification

### Loop guardrails (enforced by `/60/ci-heal`)
- Max 5 fix attempts per check — then escalates to human
- Never force pushes or skips hooks
- Only modifies files in scope of the PR
- Reports infrastructure issues (missing secrets, permission errors) without attempting to fix them

---

## STEP 5: Deploy to Staging

### For Railway Projects (new apps)
If Railway MCP is available:
1. Push triggers auto-deploy to staging environment
2. Wait for deploy to complete
3. Verify health check passes
4. Report staging URL

### For use60 (Supabase)
```bash
# Dry-run migrations first
npx supabase db push --linked --dry-run

# If dry-run passes, report for manual application
# Edge functions: list any new/changed functions
```

### For Both
```
Staging deployment:
  Migrations: dry-run passed (2 migrations)
  Edge functions: 1 new (stripe-webhook), 1 updated (get-invoices)
  Frontend: deployed to <staging-url>
```

---

## STEP 6: Update Dev Hub

If Dev Hub sync is active (`pipeline.json.devHub.taskId` exists):

1. Update parent ticket status to `"review"`
2. Add completion comment:
   ```
   Pipeline complete. PR ready for review.

   Stories: X/X complete
   Tests: Y passing (+Z% coverage)
   Docs: N developer, M user
   PR: #NNN
   Staging: <url>

   Heartbeat observations: P proposals in backlog
   ```
3. Mark remaining subtasks as done

---

## STEP 7: Post to Slack War Room

If Slack MCP available:

```
Pipeline complete: <project-name>

  Stories: X/X complete
  Tests: Y passing, +Z% coverage, 0 regressions
  Docs: N dev docs, M user docs generated
  PR: #NNN — <link>
  Staging: <url>

  Heartbeat: P observations, H high-priority proposals

  @<owner> — review PR and approve to merge.
```

---

## STEP 8: DELIVER Report (Human Gate)

This is the ONE human gate in the entire pipeline. Present everything:

```
================================================================
  DELIVER REPORT: <project-name>
================================================================

  Phase     Status
  -------   ------
  LAUNCH    complete (or skipped)
  DISCOVER  complete — 8 requirements, team Tier 3
  DEFINE    complete — 9 stories in PRD
  PLAN      complete — TDD stubs generated
  SYNC      complete — TSK-XXXX, 9 subtasks
  BUILD     complete — 9/9 stories, 0 failures
  DELIVER   awaiting approval

  TESTS
  -----
  Unit:       189/189 passing
  Component:  34/34 passing
  E2E:        8/8 passing (Tier 4 — Playwriter MCP not available)
  Coverage:   74.1% (+5.9%)
  Regressions: 0

  CI WORKFLOWS (GitHub Actions)
  -----------------------------
  Lint:               success (pr-checks.yml)
  Typecheck:          success (pr-checks.yml)
  Build:              success (pr-checks.yml)
  Unit Tests:         success (pr-checks.yml)
  Playwright E2E:     success (pr-e2e.yml) — 8/8 passing
  Migrations:         skipped (no schema changes)
  Security:           success (security-scan.yml)
  Status:             ALL BLOCKING CHECKS PASS

  DOCUMENTATION
  -------------
  Dev docs:   3 new, 1 updated
  User docs:  2 new (1 external, 1 DRAFT/unreleased)
  Gaps found: 2 (flagged for housekeeping)

  PR
  --
  #NNN: feat: <runSlug> — <description>
  +1,247 / -89 across 34 files

  STAGING
  -------
  <staging-url> — deployed and healthy

  HEARTBEAT OBSERVATIONS
  ----------------------
  3 proposals created during BUILD:
    HIGH: Missing rate limiting on webhook endpoint
    MEDIUM: No empty state for invoice list
    LOW: Console.log left in invoiceService.ts

  Assigned to Dev Bot: 1 (rate limiting)
  In backlog: 2

================================================================
  Review the PR and reply:
    'approve' — merge and continue to HOUSEKEEPING
    'changes' — describe what needs fixing
    'hold'    — pause, resume later with /60/ship --resume
================================================================
```

---

## STEP 9: Post-Approval

After human approves:

1. Update `pipeline.json.phaseGates.deliver.status = "complete"`
2. Log to `.sixty/progress.md`
3. Continue to HOUSEKEEPING phase

---

## STEP 10: Write Learnings (MANDATORY)

**This step runs automatically after DELIVER approval, BEFORE HOUSEKEEPING.** It is NOT optional — the entire learnings feed-forward system depends on this data being written.

### 10a. Collect Run Metrics

For each story in this run, calculate:
- `estimatedMinutes` vs `actualMinutes` (from story start/complete timestamps)
- Gate failures (from progress.md log entries)
- Stories that were split mid-run
- Blockers encountered (secrets, dependencies, tool unavailability)
- Patterns discovered during BUILD

### 10b. Write to `.sixty/learnings.json`

**If file exists**: Append this run to `runs[]` array and recalculate `aggregated` section.
**If file doesn't exist**: Create with this run as the first entry.

**Aggregation rules:**
- `avgEstimateAccuracy` = average of all runs' accuracy scores
- `estimateCalibration[type]` = average(actual/estimated) across all runs for that story type
- `topRecurringIssues` = observations that appear in 3+ runs, sorted by frequency
- `topBlockerTypes` = blockers that appear in 2+ runs, sorted by frequency

### 10c. Report What Was Learned

```
Learnings persisted for future runs:
  Estimate accuracy this run: 84% (avg across 5 runs: 82%)
  Calibration updates: schema +20%, api -37%
  New recurring issues: 1 ("Missing empty states" — now at 8 occurrences)
  Patterns saved: 1 ("Webhook idempotency via dedup key")
```

---

## RETROSPECTIVE + LEARNING LOOP (Auto-Generated)

Post to Slack after DELIVER approval, AND persist learnings for future runs.

### Slack Retro

```
Pipeline retro: <project-name>

  Total time: 4h 12m (estimated: 5h) — 18% faster

  What went well:
  - Test Oracle caught 3 edge cases before they shipped
  - Parallel workers saved ~45min on stories 3+4+5
  - GitHub Scout found webhook pattern from project-B

  What slowed us down:
  - Missing STRIPE_WEBHOOK_SECRET — 40 min blocked
  - US-007 failed quality gates twice (lint issues)
  - Playwriter MCP not available — limited E2E coverage

  Recommendations:
  - Collect ALL external service keys during LAUNCH
  - Add Stripe webhook pattern to cross-project library
  - Keep Playwriter MCP enabled during pipelines

  Saved to cross-project knowledge base.
```

### Learning Loop: .sixty/learnings.json

After DELIVER, auto-extract and persist learnings. This file is **cumulative** — each run appends, never overwrites.

```json
{
  "version": 1,
  "runs": [
    {
      "runSlug": "stripe-billing",
      "completedAt": "<ISO>",
      "estimateAccuracy": {
        "totalEstimatedMinutes": 300,
        "totalActualMinutes": 252,
        "accuracy": 0.84,
        "byType": {
          "schema": { "estimated": 45, "actual": 54, "note": "RLS policies take longer than expected" },
          "service": { "estimated": 80, "actual": 65, "note": "React Query patterns well-established" },
          "component": { "estimated": 100, "actual": 90 },
          "api": { "estimated": 60, "actual": 38, "note": "Edge function boilerplate is fast" },
          "integration": { "estimated": 15, "actual": 5 }
        }
      },
      "gateFailures": [
        { "storyId": "INV-007", "gate": "lint", "cause": "unused import", "fixTime": 2 },
        { "storyId": "INV-007", "gate": "lint", "cause": "missing semicolon", "fixTime": 1 }
      ],
      "storySplits": [
        { "original": "INV-003", "splitInto": ["INV-003a", "INV-003b"], "reason": "Mixed schema + frontend" }
      ],
      "recurringObservations": [
        { "pattern": "Missing empty states on new list views", "count": 3 },
        { "pattern": "RLS policies not tested in unit tests", "count": 2 }
      ],
      "discoveredPatterns": [
        { "pattern": "Webhook idempotency via dedup key", "file": "src/lib/services/stripeWebhookService.ts" }
      ],
      "blockers": [
        { "type": "missing_secret", "key": "STRIPE_WEBHOOK_SECRET", "blockedMinutes": 40 }
      ]
    }
  ],
  "aggregated": {
    "totalRuns": 5,
    "avgEstimateAccuracy": 0.82,
    "estimateCalibration": {
      "schema": 1.2,
      "service": 0.81,
      "component": 0.9,
      "api": 0.63,
      "integration": 0.33
    },
    "topRecurringIssues": [
      { "pattern": "Missing empty states", "frequency": 8 },
      { "pattern": "RLS policy gaps", "frequency": 5 }
    ],
    "topBlockerTypes": [
      { "type": "missing_secret", "frequency": 3, "avgBlockedMinutes": 35 }
    ]
  }
}
```

### How Learnings Feed Forward

**PLAN phase** reads `learnings.json` to:
- Calibrate time estimates: `estimatedMinutes = baseEstimate * estimateCalibration[storyType]`
- Flag recurring issues as automatic acceptance criteria: "If `Missing empty states` recurs, add empty state AC to all list-view stories"
- Warn about common blockers: "Last 3 runs needed STRIPE_WEBHOOK_SECRET — collect secrets early"

**DISCOVER phase** reads `learnings.json` to:
- Feed recurring observations to Risk Scanner agent
- Adjust complexity scoring based on actual vs estimated history
- Inform GitHub Scout about patterns already discovered internally

**BUILD phase** reads `learnings.json` to:
- Pre-configure lint rules that commonly fail
- Remind workers about recurring observation patterns before they code

---

## ERROR HANDLING

| Error | Action |
|-------|--------|
| Regression found | Route to worker for fix, retry up to 3x |
| Tests fail | Route to worker for fix, retry up to 3x |
| Playwriter MCP unavailable | Fall back to Tier 4 headless, then Tier 2 component |
| No test credentials | Flag in report, recommend creating before merge |
| PR creation fails (no gh CLI) | Output PR body for manual creation |
| Railway deploy fails | Log error, provide manual deploy instructions |
| Dev Hub update fails | Log warning, continue |
| Slack unavailable | Terminal output only |
| Human says 'changes' | Parse feedback, route fixes to worker, re-run DELIVER |
| CI blocking check fails (lint/typecheck/build) | Route to worker for fix, push, wait for CI re-run, max 3 attempts |
| CI E2E tests fail but local tests pass | Flag in report, link to Playwright artifacts, non-blocking |
| CI E2E tests skipped (no credentials) | Note in report: add TEST_USER_EMAIL + TEST_USER_PASSWORD secrets |
| CI migration dry-run fails | BLOCK DELIVER — must fix schema before proceeding |
| GitHub Actions unavailable | Log warning, rely on local test results only, flag in report |
| PR checks still running | Wait up to 10 minutes, then proceed with partial results |
