---
name: 60-ship
invoke: /60/ship
description: End-to-end project pipeline — auto-detects input, composes team, runs all 8 phases with single human gate at DELIVER
---

# /60/ship — End-to-End Project Pipeline

**Purpose**: One command from idea/transcript to deployed MVP. Auto-detects input, composes the right team, runs all phases, human gate at the end.

**Input**: $ARGUMENTS

---

## CRITICAL RULES

1. **Flow, don't gate.** Phases advance automatically unless blocked. Human gate at DELIVER only.
2. **Auto-detect everything.** Input type, complexity tier, team composition — never ask what you can infer.
3. **Heartbeat always running.** After every story, every phase — observe, think, propose.
4. **Slack is the control plane.** All progress, proposals, and blockers go to the war room thread.
5. **Dev Hub is the record.** Every observation becomes a ticket proposal. Every completion updates the parent.
6. **Never block on tooling.** If Railway MCP, Slack, Dev Hub, or Playwriter MCP is unavailable — log warning, continue, degrade gracefully.

---

## PREVIEW MODE

Use `--preview` to see the full plan before committing to a build.

```bash
/60/ship --preview "Add Stripe billing"
```

Runs DISCOVER + DEFINE + PLAN but stops before SYNC/BUILD. Presents a summary:

```
PREVIEW: "Add Stripe billing"

  Team: Tier 3 (Sonnet x3, Opus reviewer)
  Stories: 11 (3 schema, 4 service, 2 component, 2 integration)
  Estimate: 3-4 hours
  Risks: 2 HIGH (webhook security, PII in payment data)
  Parallel groups: 3
  Learnings applied: schema estimates calibrated +20% from past runs

  [P]roceed to build  [E]dit plan  [C]ancel
```

- **Proceed**: Continues to SYNC + BUILD + DELIVER as normal
- **Edit**: Opens interactive plan editing (`/60/plan --edit`)
- **Cancel**: Stops. Pipeline state saved — resume later with `/60/ship --resume`

Preview mode sets `pipeline.json.phase = "preview"` and `phaseGates.plan.status = "complete"`.

---

## CROSS-RUN AWARENESS

At the start of PLAN phase, check for other active work:

### Detection

```
1. Check .sixty/pipeline.json for in-progress runs (this project)
2. Check Dev Hub for in-progress jobs assigned to this project
3. Check git branches for other active feature/* branches with recent commits
```

### Conflict Detection

For each active run, compare:
- **File overlap**: Do planned stories touch files that another run is modifying?
- **Migration conflicts**: Are both runs adding migrations to the same tables?
- **Schema contention**: Do both runs ALTER the same tables?

### Output (if conflicts found)

```
Cross-run awareness:
  Active: "notifications" (BUILD phase, 5/9 stories done)
    File overlap: src/lib/services/userService.ts (MEDIUM risk)
    Migration: both touch `users` table (HIGH risk)

  Recommendation: Sequence this run AFTER "notifications" merges,
  or exclude userService.ts changes and handle in integration story.

  [C]ontinue anyway  [W]ait  [A]djust plan
```

If no conflicts found, proceed silently.

---

## PRE-FLIGHT: Branch & Pipeline Check

**Run this BEFORE anything else, even before input detection.**

```bash
CURRENT_BRANCH=$(git branch --show-current)
```

### If on a `feature/*` branch:

1. Check if `.sixty/pipeline.json` exists with `phase != "complete"`
2. If YES → **This is an active pipeline.** Auto-switch to `--resume` mode unless:
   - User explicitly said "new feature", "start fresh", "different project"
   - User provided input about a completely unrelated feature
3. If pipeline.json exists but is stale/complete → Safe to start new, but WARN:
   ```
   You're on branch feature/<name> with a completed pipeline.
   Starting a new pipeline will create a new branch.
   Switch to main first? [Y]es / [N]o, continue here
   ```

### If on `main`/`master` with no active pipeline:
→ Safe to proceed normally.

### If there are uncommitted changes:
→ ALWAYS warn before any branch operation. Never silently stash or lose work.

---

## INPUT AUTO-DETECTION

Determine what the user gave you:

```
FILE PATH provided → Read the file, classify by content:
  - Timestamps + speaker labels + conversational tone → TRANSCRIPT
  - User stories / acceptance criteria / requirements → PRD DOCUMENT
  - Otherwise → REFERENCE DOCUMENT (context, not requirements)

STRING provided → DESCRIPTION (go to DISCOVER with questions)

NOTHING provided → INTERACTIVE MODE (ask "What are we building?")

--resume flag → Read .sixty/pipeline.json, continue from current phase
```

---

## PIPELINE STATE: .sixty/pipeline.json

All state lives in one file. Every phase reads and writes to it. Resume works by reading the current phase.

```json
{
  "version": 2,
  "runSlug": "<kebab-case>",
  "project": "<Feature/Project Title>",
  "description": "<one-liner>",
  "phase": "build",
  "startedAt": "<ISO>",
  "lastUpdatedAt": "<ISO>",
  "lastActiveAt": "<ISO>",

  "input": {
    "type": "transcript|description|prd|interactive",
    "source": "./calls/acme-scoping.txt",
    "extractedRequirements": [],
    "extractedConstraints": [],
    "openQuestions": [],
    "answeredQuestions": []
  },

  "phaseGates": {
    "launch":    { "status": "complete|skipped", "completedAt": null },
    "discover":  { "status": "complete", "completedAt": "..." },
    "define":    { "status": "complete", "completedAt": "..." },
    "plan":      { "status": "complete", "completedAt": "..." },
    "sync":      { "status": "complete", "completedAt": "..." },
    "build":     { "status": "in_progress", "completedAt": null },
    "deliver":   { "status": "pending", "completedAt": null },
    "housekeeping": { "status": "pending", "completedAt": null }
  },

  "team": {
    "tier": 2,
    "tierReason": "7 stories, 1 schema change, familiar patterns",
    "workers": { "model": "sonnet", "count": 2 },
    "reviewer": { "model": "sonnet" },
    "architect": { "model": "opus", "phaseOnly": "plan" },
    "manager": { "model": "opus" }
  },

  "infrastructure": {
    "railway": {
      "projectId": null,
      "projectName": null,
      "services": [],
      "environments": ["staging", "production"]
    },
    "clerk": {
      "configured": false,
      "testUserCreated": false
    },
    "secrets": {
      "collected": [],
      "missing": [],
      "testMode": []
    }
  },

  "prdFile": "tasks/prd-<runSlug>.md",
  "branch": "feature/<runSlug>",

  "stories": [
    {
      "id": "INV-001",
      "title": "Create invoices table + migration",
      "type": "schema",
      "status": "complete|in_progress|pending|blocked|skipped",
      "priority": 1,
      "dependencies": { "stories": [], "schema": [] },
      "parallelWith": [],
      "acceptance": [],
      "testFiles": [],
      "estimatedMinutes": 15,
      "actualMinutes": null,
      "visibility": "external|internal|unreleased",
      "completedAt": null,
      "aiDevHubSubtaskId": null
    }
  ],

  "devHub": {
    "projectId": null,
    "taskId": null,
    "taskCode": null
  },

  "slack": {
    "warRoomChannel": null,
    "warRoomThreadTs": null
  },

  "heartbeat": {
    "observations": [],
    "proposedTickets": [],
    "routing": {
      "high": "slack_immediate",
      "medium": "slack_daily_digest",
      "low": "dev_hub_backlog"
    }
  },

  "testing": {
    "strategy": "tdd",
    "tiers": {
      "unit": true,
      "component": true,
      "playwriterMcp": false,
      "headlessE2e": true
    },
    "testCredentials": {
      "stored": false,
      "location": null
    }
  },

  "documentation": {
    "devDocs": [],
    "userDocs": [],
    "visibility": {}
  },

  "execution": {
    "totalStories": 0,
    "completedStories": 0,
    "lastUpdated": null
  },

  "learnings": {
    "file": ".sixty/learnings.json",
    "calibrationApplied": false,
    "recurringIssuesLoaded": []
  },

  "crossRunConflicts": []
}
```

---

## TEAM COMPOSITION (Auto-Selected)

Score complexity from the DISCOVER phase findings, then compose the team.

### Complexity Scoring

```
INPUTS:
  storyCount         → 1-3: +0 | 4-10: +1 | 11+: +2
  schemaChanges      → none: +0 | yes: +1
  externalAPIs       → none: +0 | 1: +1 | 2+: +2
  crossFeatureDeps   → none: +0 | yes: +1
  securitySurface    → none: +0 | auth/payments/PII: +2
  novelArchitecture  → existing patterns: +0 | new patterns: +1 | greenfield: +2

TOTAL:
  0-1 → Tier 1 (simple)
  2-4 → Tier 2 (standard)
  5-7 → Tier 3 (complex)
  8+  → Tier 4 (critical)
```

### Team Tiers

| Tier | Workers | Reviewer | Architect | Manager | Use Case |
|------|---------|----------|-----------|---------|----------|
| 1 | Haiku | Sonnet | none | none | Bug fixes, copy, single-file |
| 2 | Sonnet x2 | Sonnet | Opus (plan only) | none | Typical features, 4-10 stories |
| 3 | Sonnet x3 | Opus | Opus | Opus | Multi-system, integrations, 10+ |
| 4 | Opus x2 | Opus | Opus | Opus | Security, payments, data migrations |

The team is created using the `TeamCreate` tool at the start of BUILD phase. Workers execute stories, reviewer validates quality gates, architect designs in PLAN phase, manager resolves blockers.

---

## HEARTBEAT SYSTEM

The heartbeat runs at natural breakpoints throughout the pipeline. It is NOT a separate process — it's a checkpoint that fires after key events.

### When It Fires

- After every story completion (BUILD phase)
- After every phase gate transition
- During HOUSEKEEPING phase (final scan)

### What It Does

```
1. OBSERVE — Scan recent changes for:
   - Code quality: missing error handling, copy-paste duplication, no loading states
   - Security: hardcoded keys, missing RLS, open CORS
   - Performance: no pagination, missing indexes, N+1 queries
   - UX: no empty states, raw error messages, no loading indicators
   - Documentation: undocumented features, stale docs
   - Cross-project: patterns done better elsewhere

2. THINK — Severity classification:
   - HIGH: security, data loss, broken functionality → Slack immediately
   - MEDIUM: missing patterns, performance, UX gaps → daily digest
   - LOW: code style, nice-to-haves, docs → backlog

3. PROPOSE — For each observation:
   - Draft an AI Dev Hub ticket (title, description, priority, effort estimate)
   - Add to pipeline.json heartbeat.proposedTickets[]

4. ROUTE — Based on severity:
   - HIGH: Slack message to project owner immediately
     "I noticed X which could cause Y. Here's a ticket — assign to Dev Bot now?"
   - MEDIUM: Batch into daily Slack digest
   - LOW: Auto-create in Dev Hub backlog, no Slack notification
```

### Proposal Format (Slack)

```
Observation: [what was noticed]
Risk: HIGH|MEDIUM|LOW — [why it matters]
Effort: Tier N (~Xmin)
Draft ticket: TSK-XXXX (or "ready to create")

> Assign to Dev Bot now?
> Add to backlog
> Dismiss
```

---

## AUTOMATIC SAFEGUARDS (Run After Every Phase)

These two systems fire automatically after every phase gate transition. They are NOT optional.

### Safeguard 1: Pipeline State Snapshots

After every phase completes, snapshot the entire `pipeline.json` before advancing:

```bash
mkdir -p .sixty/snapshots
cp .sixty/pipeline.json .sixty/snapshots/<phase>-$(date -u +%Y%m%dT%H%M%SZ).json
```

**Example:**
```
.sixty/snapshots/
  discover-20260310T091500Z.json
  define-20260310T093000Z.json
  plan-20260310T100000Z.json
  sync-20260310T101500Z.json
  build-20260310T140000Z.json
```

**Recovery**: If `pipeline.json` gets corrupted or a phase goes wrong:
```bash
# List available snapshots
ls .sixty/snapshots/

# Restore to a specific phase
cp .sixty/snapshots/plan-20260310T100000Z.json .sixty/pipeline.json
```

**Cleanup**: Snapshots are deleted during HOUSEKEEPING phase after successful DELIVER.

### Safeguard 2: Session Handoff Brief

After every phase gate transition, auto-generate `.sixty/handoff.md`. This ensures the NEXT Claude session (which loses all conversational context) can pick up exactly where the last one left off.

**Write to `.sixty/handoff.md`** (overwrite each time — this is a living document, not a log):

```markdown
# Handoff Brief — <project name>
Generated: <ISO timestamp>

## Current State
- Phase: <current phase>
- Branch: <current branch>
- Stories: X/Y complete
- Last completed: <last story ID + title>

## Key Decisions Made
<!-- Why things were built this way, not just what was built -->
- <Decision 1>: <reasoning>
- <Decision 2>: <reasoning>

## Patterns Discovered
<!-- Reusable patterns found during DISCOVER/BUILD that future stories should follow -->
- <Pattern>: <where it lives, how to reuse>

## What Didn't Work
<!-- Failed approaches, so the next session doesn't retry them -->
- <Approach>: <why it failed>

## What To Do Next
<!-- Explicit next action, not "continue" -->
- Next story: <ID> — <title>
- Watch out for: <known risk or blocker>
- Dependencies needed: <anything unresolved>

## Open Questions
<!-- Things that need human input or investigation -->
- <Question 1>
```

**Resume protocol**: When `--resume` is used, read `.sixty/handoff.md` BEFORE reading `pipeline.json`. The handoff has the context; pipeline.json has the data.

---

### Safeguard 3: Activity Timestamp

Every time ANY phase step runs, update `pipeline.json.lastActiveAt`:

```json
{
  "lastActiveAt": "<ISO timestamp>"
}
```

This field is used by staleness detection in `/60/go` (see go.md).

---

## PHASE EXECUTION

### Phase 0: LAUNCH (new projects only)

**Skip if**: Working within an existing codebase (e.g., use60 features).
**Trigger if**: No existing project structure, or user says "new project/app."

Run `/60/launch` — see `.claude/commands/60/launch.md`

Handles: template clone, Railway setup, Clerk auth, secrets collection, CLAUDE.md interview, Slack war room creation.

---

### Phase 1: DISCOVER

Run `/60/discover` — see `.claude/commands/60/discover.md`

Handles: input parsing, parallel research agents (Codebase Scout, Patterns Analyst, Risk Scanner, GitHub Scout, Scope Sizer), cross-project pattern lookup, gap questions, team composition scoring.

**Output**: Populated `input`, `team`, and initial `stories` outline in pipeline.json.

---

### Phase 2: DEFINE

Run `/60/prd` with context from DISCOVER phase — see `.claude/commands/60/prd.md`

Handles: PRD markdown generation, grounded in research agent findings. Stories reference actual code paths, existing components, and patterns found by scouts.

**Output**: `tasks/prd-<runSlug>.md` written, stories array populated in pipeline.json.

---

### Phase 3: PLAN

Run `/60/plan` with context from DEFINE phase — see `.claude/commands/60/plan.md`

Handles: story breakdown, dependency graph, parallel group identification, TDD test stub generation (Test Oracle), dependency optimization (Forecaster).

**Output**: Stories finalized with dependencies, test stubs created, execution order optimized.

---

### Phase 4: SYNC

Run `/60/sync` — see `.claude/commands/60/sync.md`

Handles: Dev Hub parent ticket + subtasks, duplicate checking, git branch creation, Slack plan posting to war room.

**Output**: Dev Hub IDs written to pipeline.json, branch created, team notified.

---

### Phase 5: BUILD

Run `/60/run --all` with team from pipeline.json — see `.claude/commands/60/run.md`

Handles: story execution loop with auto-tiered workers, Architecture Validator (background), Doc Drafter (background), Test Oracle (per-story validation), Slack real-time progress, heartbeat observations.

**Execution rules**:
- Workers execute stories in parallel where dependencies allow
- Each story: implement -> run tests (TDD stubs must pass) -> quality gates -> commit
- Architecture Validator catches pattern drift between stories
- Doc Drafter writes docs concurrently (dev + user)
- Heartbeat fires after each story completion
- Secret requests routed via Slack DM if missing
- NO human interruption — flow straight through all stories

**Output**: All stories complete, docs drafted, observations collected.

---

### Phase 6: DELIVER

Run `/60/deliver` — see `.claude/commands/60/deliver.md`

Handles: Regression Sentinel, full test suite (4 tiers), documentation finalization, PR creation, Railway staging deploy, Dev Hub status update, Slack ship summary, cross-project pattern deposit, retrospective.

**THIS IS THE HUMAN GATE.** Present the complete DELIVER report and wait for approval:

```
DELIVER REPORT
==============

Project: <name>
Stories: X/X complete
Tests: Y new (all passing), +Z% coverage
Docs: N dev docs, M user docs generated
PR: #NNN ready for review
Staging: <url>

Heartbeat observations: P proposals (H high, M medium, L low)

Review the PR and approve to merge, or request changes.
```

---

### Phase 7: HOUSEKEEPING

Run `/60/housekeeping` — see `.claude/commands/60/housekeeping.md`

Handles: archive orphaned .sixty/ files, scan for missing docs, propose maintenance tickets, feed Dev Bot queue, proactive observations.

Runs automatically after DELIVER. No human gate needed.

---

## RESUME SUPPORT

```bash
/60/ship --resume
```

1. **Read `.sixty/handoff.md` FIRST** — this has the context the previous session captured (decisions, patterns, what didn't work, what to do next). Internalize it before proceeding.
2. Read `.sixty/pipeline.json` for structured state data
3. Print summary:
   ```
   Resuming: "<project>" (started Xh ago)
   Phase: BUILD (5/9 stories complete)
   Last: US-005 — Webhook signature verification
   Next: US-006 — <from handoff.md>
   Watch out: <risks from handoff.md>
   ```
4. Continue from current phase

If BUILD phase: pick next incomplete story and continue the loop.
If any earlier phase: re-run that phase (they're idempotent).

**If handoff.md is missing**: Fall back to pipeline.json only, but log a warning. This means state was likely lost or the pipeline was started before handoff briefs were implemented.

---

## SLACK WAR ROOM PROTOCOL

Use60 has extensive Slack infrastructure already built. The pipeline sends messages via existing edge functions.

**Primary path**: Call `send-slack-message` edge function (supports service role auth, Block Kit, threads).
**Fallback path**: Post via AI Dev Hub `create_comment` with @mentions (Dev Hub delivers to Slack).
**Templates**: Use `slackBlocks.ts` patterns for rich formatting. See `docs/briefs/slack-feasibility.md` for full details.

The pipeline maintains a war room thread throughout:

### Messages Posted Automatically

| Event | Message |
|-------|---------|
| Pipeline start | "New pipeline: <project> — <description>" |
| Phase transition | "DISCOVER complete -> DEFINE" |
| Story complete | "US-003 complete (Worker 2) — 4 tests passing" |
| Story blocked | "US-007 blocked — missing STRIPE_WEBHOOK_SECRET. @owner needed" |
| Heartbeat HIGH | "I noticed X — draft ticket ready. Assign to Dev Bot?" |
| Pipeline complete | Full DELIVER summary |
| Daily brief | Morning standup synthesis (if pipeline runs overnight) |

### Commands Accepted From Slack

| Command | Action |
|---------|--------|
| "status" | Current phase, story progress, ETA |
| "pause" | Pause after current story |
| "resume" | Resume paused pipeline |
| "skip US-XXX" | Skip a story |
| "add story: <description>" | Draft new story, propose adding |
| "ship it" | Trigger DELIVER phase |
| "assign to Dev Bot" | Route a proposal to Dev Bot |
| "what's blocking?" | List all blockers |

---

## ERROR HANDLING

| Error | Action |
|-------|--------|
| Railway MCP unavailable | Skip infra provisioning, log warning, manual setup needed |
| Slack MCP unavailable | All updates go to terminal only, pipeline continues |
| Dev Hub MCP unavailable | Skip ticket sync, local tracking only |
| Playwriter MCP unavailable | Fall back to headless E2E with test creds, then to component tests |
| Secret missing mid-pipeline | Slack DM owner, pause affected story, continue others |
| Story fails quality gates | Auto-fix + retry once, then skip and continue |
| All stories blocked | Stop BUILD, report blockers, wait for human |
| Pipeline.json missing on --resume | Error: "No active pipeline. Start with /60/ship" |
| Template clone fails | Ask for manual repo URL or skip to existing directory |

---

## FULL FLOW SUMMARY

```
/60/ship "Build invoice management for Acme Corp"
  |
  v
LAUNCH (new projects)
  Clone template -> Railway -> Clerk -> Secrets -> CLAUDE.md -> Slack
  |
  v
DISCOVER
  Auto-detect input -> 5 parallel research agents -> gap questions -> team scoring
  |
  v (auto-advance)
DEFINE
  PRD generation grounded in research findings
  |
  v (auto-advance)
PLAN
  Stories + deps + TDD stubs + Dependency Forecaster + team composition
  |
  v (auto-advance)
SYNC
  Dev Hub ticket + subtasks + git branch + Slack post
  |
  v (auto-advance)
BUILD
  Workers execute all stories -> Validator + Doc Drafter + Test Oracle (background)
  Heartbeat fires after each story -> proposals to Slack/Dev Hub
  |
  v (auto-advance)
DELIVER
  Regression Sentinel -> full tests -> docs -> PR -> staging -> Slack summary
  >>> HUMAN GATE: Review and approve <<<
  |
  v (auto after approval)
HOUSEKEEPING
  Archive -> missing docs scan -> maintenance proposals -> Dev Bot queue
```

---

## NEXT STEPS AFTER SHIP

```
After /60/ship completes:

  - PR is ready for review
  - Staging is deployed
  - Docs are generated
  - Dev Hub tickets updated
  - Heartbeat proposals queued for Dev Bot

  The pipeline is done. Dev Bot picks up maintenance tickets overnight.
  Morning brief in Slack summarizes what happened.
```
