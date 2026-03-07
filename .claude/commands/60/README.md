# 60 Pipeline Pack

The `/60/*` command suite is an end-to-end project pipeline for Claude Code. One command takes you from idea (or meeting transcript) to deployed, documented, PR-ready code.

## Commands

| Command | Phase | Purpose |
|---------|-------|---------|
| `/60/go` | **Entry point** | Smart router — analyzes your input and picks the right command automatically |
| `/60/ship` | Orchestrator | End-to-end pipeline — auto-detects input, runs all phases, single human gate at DELIVER |
| `/60/launch` | 0 | New project setup — template clone, Railway, auth, secrets, CLAUDE.md generation |
| `/60/discover` | 1 | Research-first requirements discovery — deploys 5 parallel agents to analyze codebase, find patterns, scan risks, and size scope |
| `/60/prd` | 2 | Generate a Product Requirements Document with user stories, acceptance criteria, and prd.json |
| `/60/plan` | 3 | Execution planning — story breakdown, dependency graphs, parallel groups, TDD test stubs |
| `/60/sync` | 4 | Dev Hub ticket sync + git branch creation + Slack war room posting |
| `/60/run` | 5 | Story execution engine — implements code, runs quality gates, updates tracking |
| `/60/deliver` | 6 | Quality gate — regression testing, docs generation, PR creation, staging deploy |
| `/60/housekeeping` | 7 | Proactive cleanup — archive orphans, docs audit, maintenance proposals, Dev Bot queue |
| `/60/hooks` | Utility | Configure automation hooks and safety rails — checkpoints, error recovery, notifications, presets |
| `/60/quick` | Utility | Fast-path for bug fixes, small changes, ad-hoc tasks — skips discovery, PRD, and planning |
| `/60/audit` | Utility | Full codebase and database audit — 5 specialist agents, leader review, user approval before changes |

## Pipeline Flow

```
/60/ship "Build invoice management"
  |
  LAUNCH -----> Clone template, Railway, auth, secrets (new projects only)
  DISCOVER ---> 5 parallel research agents + gap questions + team scoring
  DEFINE -----> PRD generation grounded in research findings
  PLAN -------> Stories + dependencies + TDD stubs + team composition
  SYNC -------> Dev Hub tickets + git branch + Slack
  BUILD ------> Workers execute all stories (heartbeat after each)
  DELIVER ----> Regression tests, docs, PR, staging deploy
                >>> HUMAN GATE: review and approve <<<
  HOUSEKEEPING> Archive, docs audit, maintenance proposals
```

## Key Concepts

### Team Tiers (Auto-Selected)

Complexity is scored from DISCOVER findings and maps to a team:

| Tier | Complexity | Workers | Reviewer | Use Case |
|------|-----------|---------|----------|----------|
| 1 | 0-1 | Haiku | Sonnet | Bug fixes, single-file changes |
| 2 | 2-4 | Sonnet x2 | Sonnet | Typical features, 4-10 stories |
| 3 | 5-7 | Sonnet x3 | Opus | Multi-system, integrations, 10+ stories |
| 4 | 8+ | Opus x2 | Opus | Security, payments, data migrations |

### Heartbeat System

Fires after every story completion during BUILD:

1. **OBSERVE** — scan for missing error handling, security issues, performance gaps
2. **CLASSIFY** — HIGH (Slack immediately) / MEDIUM (daily digest) / LOW (backlog)
3. **PROPOSE** — draft a Dev Hub ticket for each observation
4. **ROUTE** — deliver via Slack or queue for Dev Bot

### Scheduled Tasks (Background Crons)

When `/60/run --auto` is active, Claude Code's native `CronCreate` schedules background monitors:

| Task | Default Interval | Purpose |
|------|-----------------|---------|
| Health Check | 15m | Progress report + stuck story detection |
| Checkpoint | 30m | Snapshot pipeline state + git SHA for recovery |
| Session Timeout | Once (after 4h) | Remind to check progress and decide to continue |

Crons fire between turns (not mid-story), are session-scoped, and auto-cleanup on pipeline completion. Configure via `scheduled` section in `.sixty/hooks.json`. See `/60/hooks` for details.

### Pipeline State

All state lives in `.sixty/pipeline.json`. Every phase reads and writes to it. Resume any pipeline with `/60/ship --resume`.

### Story Sizing

Stories must be completable in one iteration:
- Max 20 files touched
- Max 30 minutes estimated
- Max 5 acceptance criteria
- Single responsibility (no "and" in the title)

### Learning Loop

After every DELIVER phase, learnings are extracted to `.sixty/learnings.json`:
- Estimate accuracy by story type (calibrates future estimates)
- Common gate failures and their fixes
- Recurring heartbeat observations
- Stories that needed splitting
- Blockers and their resolution times

Future runs read this file to calibrate estimates, pre-load risk patterns, and warn about common blockers.

### Brief Improvement Suggestions

During DISCOVER, after research agents return but before gap questions, the pipeline offers 5 proactive improvements to the brief. Presented as numbered multiple-choice (e.g. "1, 3, 5" to select, "0" to skip). Categories: SCOPE, UX, SECURITY, PERF, EDGE, COMPAT, OPS, DATA.

### Preview Mode

`/60/ship --preview` runs DISCOVER + DEFINE + PLAN but stops before BUILD. Shows team, stories, estimates, and risks. Choose to proceed, edit the plan, or cancel.

### Cross-Run Awareness

At PLAN phase, the pipeline checks for other active runs (git branches, Dev Hub jobs) and flags file/migration/schema conflicts before they cause merge issues.

### Smart Routing with Confidence

`/60/go` scores routing confidence. High confidence (80%+) routes silently. Low confidence shows top 2 options with reasoning and lets you pick.

## Standalone Usage

Every command works independently outside of `/60/ship`:

```bash
/60/discover "Add Stripe billing"     # Research only
/60/prd "Notification center"         # Generate PRD only
/60/plan --feature "dark-mode"        # Plan only
/60/run --all                         # Execute all stories
/60/run --story US-003                # Execute one story
/60/deliver                           # Quality gate + PR
/60/housekeeping --docs-only          # Docs audit only
/60/hooks --init                     # Setup automation hooks
/60/hooks --init --full-auto         # Full automation preset
/60/quick "Fix date format on invoices" # Fast-path, no pipeline
/60/audit                            # Full codebase audit
/60/audit --focus database           # Database-only audit
```

## Integrations

- **AI Dev Hub** — ticket creation, subtask tracking, job queue (all non-blocking)
- **Slack** — war room thread for real-time progress, proposals, blockers
- **Git** — branch creation, commits, PR generation
- **Supabase** — migration dry-runs, edge function deploys
- **Railway** — project provisioning, staging deploys (new projects)

All integrations degrade gracefully — if a tool is unavailable, the pipeline logs a warning and continues.
