# Brief: Dev Bot + Heartbeat System for AI Dev Hub

**Date**: 2026-03-07
**Author**: Auto-generated from /60/ship pipeline design session
**Status**: PROPOSAL — Ready for review

---

## Executive Summary

Build two interconnected systems in the AI Dev Hub:

1. **Heartbeat Engine** — A proactive observation system that runs during and between pipeline executions, detects issues/opportunities, creates tickets automatically, and routes them to the right person via Slack.

2. **Dev Bot** — A 24/7 autonomous coding agent that picks up tickets from the job queue, runs them through the `/60/ship` pipeline (at appropriate tier), creates PRs, and posts results for morning review.

Together they create a **self-improving loop**: pipelines run, heartbeat spots gaps, tickets are created, Dev Bot fixes them overnight, team reviews PRs in the morning.

---

## What Already Exists in AI Dev Hub

The job queue infrastructure is **already built**:

| Tool | What It Does | Status |
|------|-------------|--------|
| `get_next_pending_job` | Fetch highest-priority actionable job (paused first, then pending) | Available |
| `update_job_status` | Update job status + auto-sync task status | Available |
| `update_job_plan` | Save execution plan with quality score, steps, risks | Available |
| `update_job_pr` | Link PR URL, branch, review status to job | Available |
| `update_job_stats` | Record files changed, lines added/removed | Available |
| `get_job_details` | Full job info with task details, PR, errors | Available |
| `create_task` | Create tickets with type, priority, assignees | Available |
| `create_subtask` | Create subtasks under parent tickets | Available |
| `create_comment` | Comment on tasks with @mentions + notifications | Available |
| `search_users` | Find users for assignment | Available |

**Key insight**: The job queue already supports `pending -> processing -> completed/failed` with automatic task status syncing. Dev Bot just needs to poll `get_next_pending_job` and work through the queue.

---

## Part 1: Heartbeat Engine

### What It Does

The heartbeat is NOT a separate service — it's a **checkpoint function** that fires at natural breakpoints during pipeline execution and during scheduled scans.

### Trigger Points

```
DURING PIPELINE (/60/ship):
  - After each story completion (BUILD phase)
  - After each phase gate transition
  - During HOUSEKEEPING phase

SCHEDULED (independent):
  - Morning brief (configurable, default 09:00)
  - Post-deploy scan (after any Railway/Supabase deploy)
  - Weekly deep scan (full codebase + docs audit)

ON DEMAND:
  - Team member asks in Slack: "anything need attention?"
  - Manual trigger: /60/housekeeping
```

### Observation Categories

```
CODE QUALITY
  - Missing error handling on API endpoints
  - Copy-paste duplication (3+ identical blocks)
  - No loading/error/empty states on UI components
  - Console.log left in production code
  - Unused imports/exports

SECURITY
  - Hardcoded API keys or secrets
  - Missing RLS policies on new tables
  - CORS set to * on sensitive endpoints
  - Unvalidated user input
  - Service role key exposed to frontend

PERFORMANCE
  - Database queries without pagination
  - Missing indexes on filtered columns
  - N+1 query patterns
  - Large bundle imports (could be tree-shaken)

USER EXPERIENCE
  - Forms without validation feedback
  - Buttons without loading states
  - Raw error messages shown to users
  - Missing empty states
  - No confirmation on destructive actions

DOCUMENTATION
  - External features with no user docs
  - Stale docs referencing deleted code
  - New edge functions without API docs
  - Missing CLAUDE.md updates after architecture changes

CROSS-PROJECT
  - Pattern done better in another project
  - Duplicate utility across projects (should be shared)
  - Template improvements worth backporting
```

### Severity Classification + Routing

| Severity | Examples | Routing | Dev Bot Eligible |
|----------|----------|---------|-----------------|
| HIGH | Missing RLS, hardcoded keys, data loss risk | Slack DM immediately | Yes (Tier 1-2) |
| MEDIUM | Missing docs, no pagination, no empty states | Slack daily digest | Yes (Tier 1-2) |
| LOW | Code style, dead code, TODOs | Dev Hub backlog only | Yes (Tier 1) |

### Ticket Creation Flow

```
1. OBSERVE: Heartbeat detects issue during story completion
   "Invoice table has no RLS policy — any authenticated user can read all rows"

2. CLASSIFY: Severity = HIGH, Category = SECURITY, Effort = Tier 1 (~15 min)

3. CREATE TICKET: Via create_task MCP tool
   Title: "Add RLS policy to invoices table — restrict to org-scoped access"
   Description: [human-readable explanation + proposed fix + affected files]
   Type: "bug"
   Priority: "high"
   Status: "backlog"
   Project: [current project]

4. ROUTE TO SLACK: Post to war room thread (or DM for HIGH)
   "I noticed the invoices table has no RLS policy. Any authenticated
    user can currently read all invoices across all orgs.

    Created ticket: TSK-0620
    Effort: ~15 min (Tier 1)

    > Assign to Dev Bot now?
    > Add to backlog
    > Dismiss"

5. ON APPROVAL:
   - Update task assignee to Dev Bot user
   - Update task status to "todo"
   - Job queue picks it up automatically
```

### AI Dev Hub Implementation Requirements

**New features needed:**

1. **Heartbeat observation log table**
   ```sql
   CREATE TABLE heartbeat_observations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id TEXT NOT NULL,
     pipeline_run_slug TEXT,
     category TEXT NOT NULL, -- security, performance, docs, etc.
     severity TEXT NOT NULL, -- high, medium, low
     title TEXT NOT NULL,
     description TEXT NOT NULL,
     affected_files TEXT[],
     proposed_fix TEXT,
     ticket_id TEXT, -- links to created task
     status TEXT DEFAULT 'proposed', -- proposed, accepted, dismissed, completed
     detected_at TIMESTAMPTZ DEFAULT now(),
     detected_by TEXT DEFAULT 'heartbeat', -- heartbeat, housekeeping, manual
     resolved_at TIMESTAMPTZ
   );
   ```

2. **Observation-to-ticket pipeline**
   - API endpoint: `POST /api/heartbeat/observe` — creates observation + optionally creates ticket
   - API endpoint: `POST /api/heartbeat/route` — routes observation to Slack based on severity
   - API endpoint: `GET /api/heartbeat/digest` — returns daily digest of observations

3. **Slack webhook integration** (see Part 3 below)

4. **Dashboard widget**
   - Show recent observations by severity
   - Show conversion rate (observed → ticketed → completed)
   - Show top categories (what type of issues are most common)

---

## Part 2: Dev Bot — 24/7 Autonomous Coding Agent

### What It Does

Dev Bot is a Claude Code instance that runs continuously (or on schedule), polling the AI Dev Hub job queue for work. When it finds a job, it runs a mini `/60/ship` pipeline, creates a PR, and posts results.

### Architecture

```
DEV BOT LOOP:
  1. Poll: get_next_pending_job()
  2. If job found:
     a. update_job_status(jobId, "processing")
     b. Read task details (title, description, context)
     c. Score complexity → select team tier
     d. Run mini /60/ship pipeline:
        - DISCOVER (codebase scan, no human questions)
        - PLAN (story breakdown, TDD stubs)
        - BUILD (execute all stories)
        - TEST (full test suite)
     e. Create PR:
        - git checkout -b auto/<task-code>
        - Implement changes
        - git push
        - gh pr create
     f. update_job_pr(jobId, prUrl, branchName)
     g. update_job_stats(jobId, filesChanged, linesAdded, linesRemoved)
     h. update_job_status(jobId, "completed")
     i. Post to Slack: "PR ready for review"
  3. If job fails:
     a. update_job_status(jobId, "failed", error)
     b. Post to Slack: "Job failed — needs human attention"
  4. Sleep 60s, repeat
```

### Complexity-Based Execution

Dev Bot uses the same tier system as `/60/ship`:

```
TICKET ANALYSIS:
  Read task title, description, subtasks
  Score complexity (same algorithm as /60/ship)

  Tier 1 (simple): Run inline, no team needed
    - Bug fixes, copy changes, single-file edits
    - Documentation generation
    - Missing test additions

  Tier 2 (standard): Create Sonnet worker team
    - Small features (1-5 stories)
    - Pattern-following implementations

  Tier 3+ (complex): Flag for human
    - Don't attempt overnight
    - Post to Slack: "This ticket is too complex for autonomous execution.
      Recommend running /60/ship interactively."
```

### Safety Rails

```
DEV BOT MUST NEVER:
  - Push to main/master directly
  - Delete data or drop tables without explicit instruction
  - Modify auth/security configuration
  - Deploy to production
  - Merge its own PRs
  - Ignore failing tests
  - Work on Tier 3+ tickets without human approval

DEV BOT MUST ALWAYS:
  - Create PRs to feature branches (auto/<task-code>)
  - Run full test suite before PR
  - Include test coverage in PR description
  - Post results to Slack
  - Timeout after 2 hours per ticket
  - Log everything to job details
```

### AI Dev Hub Implementation Requirements

**Mostly already built!** The job queue handles the core workflow. Additional needs:

1. **Dev Bot user account**
   - Create a system user: "Dev Bot" with email `devbot@use60.com`
   - Assignable to tasks like any team member
   - Recognizable in Slack notifications

2. **Job queue enhancements**
   ```
   New fields on automation_jobs:
     - complexity_tier: INTEGER (1-4)
     - complexity_reason: TEXT
     - execution_timeout_minutes: INTEGER DEFAULT 120
     - branch_name: TEXT (auto/<task-code>)
     - team_composition: JSONB
   ```

3. **Batch job creation endpoint**
   - Allow heartbeat to create multiple tickets + jobs in one call
   - Useful for housekeeping scans that find 10+ items

4. **Job priority rules**
   - HIGH severity heartbeat observations → priority: urgent
   - MEDIUM → priority: high
   - LOW → priority: medium
   - Human-created tickets always take priority over heartbeat tickets

5. **Job execution logging**
   - Stream execution logs to job record (update_job_plan already stores this)
   - Viewable in Dev Hub UI for debugging

6. **PR Review integration**
   - Dev Hub already has `update_job_pr` with review status
   - Add: webhook from GitHub to update review status when PR is reviewed/merged
   - Dashboard: "Dev Bot PRs awaiting review" widget

---

## Part 3: Slack Integration Assessment

### Current State

Based on the codebase analysis, Slack integration exists through:

1. **Slack bots already deployed:**
   - `Intake-bot` — on AI Dev Hub (intake/triage)
   - `60-Hub-Bot` — on AI Dev Hub (project updates)
   - `Agent` — on Use60 (sales bot)

2. **No direct Slack MCP** in Claude Code — there's no `mcp__slack__send_message` tool.

3. **Slack communication paths available:**
   - AI Dev Hub has Slack webhooks configured for notifications
   - Task comments with @mentions trigger Slack notifications via Dev Hub
   - Edge functions can call Slack webhook URLs

### Recommended Slack Architecture

Since there's no direct Slack MCP, route all Slack messages through AI Dev Hub:

```
PIPELINE → AI Dev Hub create_comment (with @mentions)
                  ↓
         AI Dev Hub webhook → Slack channel
                  ↓
         Team sees notification in Slack
```

**For pipeline progress updates:**
```
After each story: create_comment on parent ticket
  "US-003 complete — Webhook receiver + 4 tests passing"
  → Dev Hub webhook fires → appears in Slack
```

**For heartbeat proposals:**
```
Create ticket → create_comment with @mention
  "@andrew — heartbeat detected missing RLS on invoices table.
   Ticket TSK-0620 created. Reply 'assign devbot' to fix overnight."
  → Dev Hub notification → Slack DM to andrew
```

**For Dev Bot results:**
```
Job completes → create_comment on task
  "Dev Bot completed TSK-0620. PR #148 ready for review.
   +47 lines, 3 files changed, 4 tests added, all passing."
  → Dev Hub webhook → Slack channel
```

### What Needs Building in Dev Hub

1. **Outbound Slack webhook for task events**
   - On task status change → post to configured Slack channel via `send-slack-message` edge function
   - On comment with @mention → DM the mentioned user via `sendSlackDM()`
   - On job completion → post PR summary to channel
   - Use existing `slackBlocks.ts` patterns for formatting

2. **Inbound Slack command handler (via Spacebot)**
   - Deploy Spacebot (https://github.com/spacedriveapp/spacebot) as 60-Hub-Bot runtime on Railway
   - Spacebot handles persistent listening, natural language parsing, conversation context
   - Workers call Dev Hub MCP tools to execute commands:
     - "assign devbot" → update task assignee + create job
     - "status" → query active pipelines + jobs
     - "pause" → update job status to paused
     - "resume" → update job status to pending
     - "what's blocking" → query blocked tasks
   - See `docs/briefs/slack-feasibility.md` Phase 3 for full Spacebot architecture

3. **Slack Block Kit messages**
   - Rich formatted messages with action buttons
   - "Assign to Dev Bot" / "Add to backlog" / "Dismiss" buttons
   - Buttons trigger Dev Hub API calls via existing `slack-interactive/` handlers
   - Extend `slack-interactive` with pipeline-specific action handlers

### Implementation Priority

```
Phase 1 (use what exists):
  - Route all notifications through create_comment with @mentions
  - Dev Hub's existing Slack integration handles delivery
  - Works TODAY with no new code

Phase 2 (enhance):
  - Add Slack webhook for job completion events
  - Add "Assign to Dev Bot" button in Slack messages
  - Add inbound command parsing for 60-Hub-Bot

Phase 3 (full control):
  - Add Slack MCP to Claude Code for direct messaging
  - Real-time pipeline progress in Slack threads
  - Natural language Slack commands
```

---

## Part 4: Dev Bot Deployment

### How Dev Bot Runs

Dev Bot is a **Claude Code CLI process** running on a server/CI environment:

```bash
# Dev Bot startup script
while true; do
  claude-code --command "/60/ship --dev-bot-mode" \
    --project /path/to/repos \
    --non-interactive
  sleep 60
done
```

Or as a **scheduled job**:
```yaml
# GitHub Actions / Railway cron
schedule:
  - cron: '0 22 * * *'  # Run at 10pm daily
jobs:
  dev-bot:
    runs-on: ubuntu-latest
    steps:
      - run: claude-code --command "/60/ship --dev-bot-mode"
        timeout-minutes: 480  # 8 hour max
```

### Dev Bot Mode Differences

When `/60/ship` runs in `--dev-bot-mode`:
- **No human gates** — fully autonomous
- **No LAUNCH phase** — works in existing repos only
- **No gap questions** — uses ticket description as-is
- **Tier cap at 2** — refuses Tier 3+ tickets, marks as "needs human"
- **Timeout: 2 hours per ticket** — moves on if stuck
- **All results via Dev Hub** — update_job_pr, update_job_stats, create_comment
- **Slack notifications via Dev Hub comments** — not direct Slack

---

## Part 5: Morning Brief

Every morning at configured time, the system generates a digest:

```
Morning Brief — March 8, 2026

OVERNIGHT DEV BOT ACTIVITY:
  Completed: 3 tickets
    TSK-0620: Add RLS to invoices (PR #148 — ready for review)
    TSK-0621: User docs for Meeting Prep (PR #149 — ready for review)
    TSK-0622: Remove console.logs from services (PR #150 — ready for review)

  Failed: 1 ticket
    TSK-0623: Add pagination to contacts query
    Error: Test failure — contacts.test.ts expects unpaginated response
    Needs: Update test expectations, then re-run

  Skipped: 1 ticket (Tier 3 — too complex)
    TSK-0624: Refactor auth middleware for multi-tenant
    Recommendation: Run /60/ship interactively

ACTIVE PIPELINES:
  acme-billing: BUILD phase, 8/11 stories complete
  client-portal: waiting for owner interview

HEARTBEAT OBSERVATIONS (last 24h):
  2 HIGH (both ticketed + assigned to Dev Bot)
  4 MEDIUM (in daily digest)
  3 LOW (in backlog)

ACTION ITEMS:
  1. Review Dev Bot PRs: #148, #149, #150
  2. Fix test in TSK-0623 (or assign back to Dev Bot)
  3. Schedule owner interview for client-portal
  4. Unblock acme-billing US-009 (missing Stripe secret)
```

This is posted to Slack via Dev Hub comment on a "Daily Brief" task.

---

## Implementation Roadmap

### Week 1: Foundation
- [ ] Create Dev Bot user account in Dev Hub
- [ ] Add heartbeat_observations table
- [ ] Create `/60/ship --dev-bot-mode` flag
- [ ] Test: Dev Bot picks up one ticket, creates PR

### Week 2: Heartbeat
- [ ] Implement heartbeat checkpoint in `/60/run` (after each story)
- [ ] Implement observation → ticket creation flow
- [ ] Add severity routing logic
- [ ] Test: Heartbeat detects missing RLS, creates ticket

### Week 3: Slack Integration
- [ ] Route notifications through Dev Hub comments with @mentions
- [ ] Add Slack webhook for job completion events
- [ ] Create morning brief generator
- [ ] Test: Team receives Slack notification when Dev Bot completes PR

### Week 4: Polish
- [ ] Dev Hub dashboard: heartbeat observations widget
- [ ] Dev Hub dashboard: Dev Bot PR review queue
- [ ] Add "Assign to Dev Bot" action in Dev Hub UI
- [ ] Cross-project pattern deposit after pipeline completion
- [ ] Full end-to-end test: heartbeat → ticket → Dev Bot → PR → Slack

---

## Success Criteria

1. **Dev Bot completes 3+ Tier 1 tickets per night** without human intervention
2. **Heartbeat catches 80%+ of missing RLS/docs** before they reach production
3. **Morning brief saves 15+ min** of daily standup time
4. **Zero false-positive HIGH severity observations** per week (tuned over time)
5. **PR merge rate for Dev Bot PRs > 90%** (quality is high enough to merge)
