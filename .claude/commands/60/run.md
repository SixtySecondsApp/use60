---
name: 60-run
invoke: /60/run
description: Story execution engine — agent teams implement code, run quality gates, parallel lock system, hooks integration
---

# 60/run — Execute Stories

**Phase 5 of `/60/ship` pipeline. Also works standalone.**

**Purpose**: The main execution engine. Picks next available story (or parallel group), implements it, runs quality gates, updates tracking, and optionally continues until complete.

---

## PIPELINE INTEGRATION

When called from `/60/ship`:
1. Read `.sixty/pipeline.json` for stories, team composition, and test stubs
2. Use auto-composed team (workers, reviewer, architect from pipeline.json.team)
3. Run TDD: each story must make its pre-generated test stubs pass
4. Fire heartbeat after each story completion (observe, think, propose)
5. Background agents run concurrently:
   - Architecture Validator: watches for pattern drift between stories
   - Doc Drafter: writes dev + user docs as code lands
   - Test Oracle: validates test coverage per story
   - CI Monitor: watches GitHub Actions workflow status after each push, alerts if checks fail
6. Post progress to Slack war room via `send-slack-message` edge function
7. Update `pipeline.json.stories[].status` and `pipeline.json.execution` counters
8. Set `pipeline.json.phaseGates.build.status = "complete"` when all stories done

When called standalone:
1. Falls back to `.sixty/plan.json` or legacy `prd.json`
2. No heartbeat, no background agents, no Slack (standard behavior)

### Heartbeat Checkpoint (after each story)

```
1. OBSERVE: Scan the story's changes for:
   - Missing error handling, loading states, empty states
   - Security issues (hardcoded keys, missing RLS)
   - Performance concerns (no pagination, missing indexes)
   - Documentation gaps

2. CLASSIFY: HIGH / MEDIUM / LOW severity

3. PROPOSE: Draft Dev Hub ticket via create_task if warranted

4. ROUTE: HIGH → Slack immediately | MEDIUM → daily digest | LOW → backlog
```

---

## CRITICAL: --all Execution Rules

**When `--all` flag is used, you MUST:**
- Execute ALL remaining stories without pause
- DO NOT stop for progress updates or summaries
- DO NOT ask for confirmation between stories
- DO NOT provide mid-execution status reports
- ONLY stop if: blocked by unresolvable dependency, unrecoverable error, or ALL stories complete
- Execute stories sequentially without interruption
- Provide summary ONLY after all stories are complete or execution is blocked

**Violation of these rules defeats the purpose of --all automation.**

---

## Execution Modes

| Mode | Command | Description |
|------|---------|-------------|
| Single | `60/run` | Execute one story, then stop |
| Count | `60/run --count 5` | Execute exactly 5 stories |
| All | `60/run --all` | Execute ALL remaining stories without stopping |
| Loop | `60/run --loop` | Execute until feature complete |
| Parallel | `60/run --parallel` | Execute parallel groups for speed |
| Specific | `60/run --story DARK-003` | Execute specific story |
| Feature | `60/run --feature auth` | Execute all stories in feature |

---

## Core Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      60/run EXECUTION FLOW                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐                                              │
│  │  Load State  │ plan.json, progress.md                       │
│  └──────┬───────┘                                              │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐     blocked     ┌──────────────┐             │
│  │ Find Next    │────────────────▶│ Report block │             │
│  │ Executable   │                 │ (only if all │             │
│  └──────┬───────┘                 │  blocked)    │             │
│         │ found                   └──────────────┘             │
│         ▼                                                       │
│  ┌──────────────┐                                              │
│  │  Implement   │ Based on story type + patterns               │
│  │    Story     │                                              │
│  └──────┬───────┘                                              │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐     fail        ┌──────────────┐             │
│  │   Quality    │────────────────▶│ Fix and      │             │
│  │    Gates     │                 │ retry        │             │
│  └──────┬───────┘                 └──────────────┘             │
│         │ pass                                                  │
│         ▼                                                       │
│  ┌──────────────┐                                              │
│  │   Update     │ plan.json, progress.md                       │
│  │  Tracking    │                                              │
│  └──────┬───────┘                                              │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐     --all       ┌──────────────┐             │
│  │   Complete   │────────────────▶│ CONTINUE     │             │
│  │   Story      │  (more left)    │ IMMEDIATELY  │             │
│  └──────────────┘                 └──────────────┘             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Story Execution Steps

### 1. Find Next Executable Story

**Load stories from the correct source.** Check each feature in `.sixty/plan.json`:
- If the feature has a `planFile` field → load stories from that separate file (e.g. `.sixty/plan-methodology-settings.json`)
- If no `planFile` → stories are inline in the main `plan.json` `stories[]` array
- Only consider features with `status: "pending"` or `status: "in_progress"`

```javascript
// Priority order:
// 1. Stories with all dependencies complete
// 2. Lower priority number first
// 3. No file conflicts with in-progress work

function canExecute(story, allStories) {
  // All dependency stories must be complete (check across ALL plan files)
  for (const depId of story.dependencies.stories) {
    const dep = allStories.find(s => s.id === depId);
    if (!dep || dep.status !== 'complete') return false;
  }
  return true;
}
```

### 1a. Load Dev Hub Context (optional)

If `prd.json` has a non-null `aiDevHubProjectId`, Dev Hub sync is active for this run. All Dev Hub operations in subsequent steps are **non-blocking** — log warnings on failure, never errors.

If Dev Hub MCP tools are unavailable, log `⚠️ Dev Hub MCP unavailable — continuing without task sync.` and skip all Dev Hub steps.

### 1b. Update Dev Hub Status → in_progress

**Skip if Dev Hub sync is not active.**

Stories are tracked as **subtasks** of the parent PRD ticket (see `/dev-hub-sync`).
- If `prd.json.aiDevHubTaskId` exists (parent ticket), update its status to `"in_progress"` if not already
- Subtasks (`aiDevHubSubtaskId`) don't have independent status — no action needed per-story
- If update fails, log warning and continue

### 2. Implement Story

Based on story type:
- **schema**: Create SQL migration
- **types**: Create/update TypeScript interfaces
- **service**: Create service functions
- **component**: Create React component
- **api**: Create/update edge function
- **integration**: Wire components together

### 3. Quality Gates (Fast Path)

```bash
# Only lint changed files (~5-15s)
CHANGED=$(git diff --name-only HEAD -- '*.ts' '*.tsx')
[ -n "$CHANGED" ] && npx eslint $CHANGED --max-warnings 0 --quiet

# Only test changed files (~5-30s)
npx vitest run --changed HEAD --passWithNoTests
```

**Note:** Full E2E tests (Playwright) are NOT run per-story — they run in DELIVER phase and in CI via `pr-e2e.yml`. Per-story gates stay fast (lint + unit only). The CI Monitor background agent watches GitHub Actions for E2E failures after each push and alerts if something breaks.

### 3a. Commit (Default Behavior)

**Per-story atomic commits are the default.** After quality gates pass, immediately commit:

```bash
git add -A
git commit -m "<type>(<story-id>): <story title>"
# Example: feat(DARK-003): Add theme provider with system preference detection
```

Commit type mapping:
- `schema` -> `feat`
- `types` -> `feat`
- `service` -> `feat`
- `component` -> `feat`
- `api` -> `feat`
- `integration` -> `feat`
- `fix` -> `fix`
- `docs` -> `docs`
- `test` -> `test`

This enables `git bisect` to find exact failing stories and independent reverts per story.

**Opt out**: Use `--no-commit` flag to skip auto-commits (e.g., when you want a single squash commit at the end).

### 4. Update Tracking

**You MUST update ALL of the following after each story completes:**

#### 4.1 Update the story status in the correct plan file

Stories live in one of two places — check the feature entry in `.sixty/plan.json`:

- **If the feature has a `planFile` field** (e.g. `"planFile": ".sixty/plan-methodology-settings.json"`):
  - Open that separate plan file and set the story's `status` to `"complete"`, add `completedAt` timestamp
  - **Also** check if ALL stories in that plan file are now complete. If yes, update the feature's `status` to `"complete"` in the **main** `.sixty/plan.json` `features[]` array

- **If the feature has NO `planFile` field** (stories are inline in `plan.json`):
  - Update the story's `status` to `"complete"` directly in `.sixty/plan.json` `stories[]`
  - **Also** check if ALL stories for that feature are now complete. If yes, update the feature's `status` to `"complete"` in the `features[]` array

#### 4.2 Update execution counters in `.sixty/plan.json`

```json
{
  "execution": {
    "completedStories": <increment by 1>,
    "lastUpdated": "<current ISO timestamp>"
  }
}
```

#### 4.3 Update feature status when all stories are done

When every story in a feature has `status: "complete"`:
- Set `features[].status` to `"complete"` in `.sixty/plan.json`
- If feature had `"in_progress"` status, this means the feature is now done

#### 4.4 Append to progress.md

Add a brief entry to `.sixty/progress.md` with story ID, title, files changed, and gate results.

### 4a. Update Dev Hub (post-completion)

**Skip if Dev Hub sync is not active or story has no `aiDevHubSubtaskId`.**

Stories are subtasks of the parent PRD ticket. On completion:

**On story success (all gates pass):**
1. Mark the subtask as done (if `aiDevHubSubtaskId` exists)
2. Add completion comment on the parent ticket (`prd.json.aiDevHubTaskId`) via `create_comment`

**On story failure (gates fail):**
1. Add comment on parent ticket with error details and what needs fixing

**All Dev Hub operations are non-blocking** — log warnings, never stop execution.

### 5. Continue (--all mode)

**IMMEDIATELY proceed to next story. No pause. No summary.**

---

## Parallel Execution with Lock System

When using `--parallel` or when the pipeline detects parallelizable stories, the orchestrator manages concurrent agent teams via a lock system.

### Lock Protocol

Before starting any story, acquire a lock:

```
.sixty/locks/
  DARK-003.lock    # { "agentId": "agent_001", "startedAt": "...", "heartbeat": "..." }
  DARK-004.lock    # { "agentId": "agent_002", "startedAt": "...", "heartbeat": "..." }
```

**Rules:**
1. Check for lock file before starting a story — if exists and heartbeat < 5 min old, story is taken
2. Write lock file with agent ID + timestamp when starting
3. Update heartbeat timestamp every 30 seconds during execution
4. Delete lock file on completion (success or failure)
5. Stale locks (heartbeat > 5 min old) can be claimed by another agent

### State Synchronization

All parallel agents sync through `.sixty/state.json`:

```json
{
  "execution": {
    "storiesInProgress": ["DARK-003", "DARK-004"],
    "storiesReady": ["DARK-005", "DARK-006"],
    "storiesBlocked": []
  },
  "agents": [
    { "id": "agent_001", "currentStory": "DARK-003", "status": "working" },
    { "id": "agent_002", "currentStory": "DARK-004", "status": "working" }
  ],
  "locks": {
    "DARK-003": { "agentId": "agent_001" },
    "DARK-004": { "agentId": "agent_002" }
  }
}
```

### Parallel Execution Flow

```
Orchestrator
  |
  +-- Find parallel group (no file overlap, deps met)
  +-- Spawn Agent teams in parallel via Agent tool
  |     |
  |     +-- Agent 1: Lock DARK-003 -> Implement -> Review -> Test -> Unlock
  |     +-- Agent 2: Lock DARK-004 -> Implement -> Review -> Test -> Unlock
  |
  +-- Wait for all agents to complete
  +-- Run combined quality gates
  +-- Single grouped commit
  +-- Update state.json + plan.json
  +-- Check if new stories are unblocked -> continue
```

### Commands

```bash
60/run --parallel              # Auto-detect parallel groups
60/run --parallel --agents 2   # Run 2 parallel agent teams
60/run --parallel --agents 3   # Run 3 parallel agent teams (max)
```

---

## Hooks Integration (--auto mode)

When `--auto` mode is enabled, hooks from `.sixty/hooks.json` are applied. See `/60/hooks` for full configuration.

**Key behaviors with hooks:**
- `onStoryComplete.continue: true` — auto-advance to next story
- `onStoryComplete.commit: true` — auto-commit after each story
- `onFeatureComplete.notify: true` — Slack notification on feature done
- `onQualityGateFail.action: "retry"` — auto-retry with fix on gate failures
- `onBlocked.action: "switchStory"` — skip to next executable story
- `session.maxHours` — pause after N hours
- `session.checkpointInterval` — checkpoint every N minutes
- `safety.requireApprovalFor` — always pause for migrations, breaking changes

```bash
60/run --auto                  # Full automation with hooks + crons
60/run --auto --max-hours 4    # Override session limit
60/run --auto --max-stories 10 # Override story limit
60/run --auto --no-crons       # Skip scheduled task creation
```

### Scheduled Cron Lifecycle

When `--auto` starts and `.sixty/hooks.json` has a `scheduled` section, the runner manages background crons:

#### On Startup

```
1. Read hooks.json → scheduled config
2. For each enabled task:
   - Convert interval to cron expression (e.g. "15m" → "*/15 * * * *")
   - For "once" tasks: calculate fire time from now + after duration
   - Call CronCreate with the prompt and expression
3. Write cron IDs to .sixty/active-crons.json:
   {
     "sessionStart": "<ISO>",
     "crons": [
       { "id": "abc12345", "name": "healthCheck", "schedule": "*/15 * * * *" },
       { "id": "def67890", "name": "checkpoint", "schedule": "*/30 * * * *" },
       { "id": "ghi24680", "name": "sessionTimeout", "schedule": "0 17 * * *", "once": true }
     ]
   }
```

#### During Execution

Crons fire **between turns** — they queue while a story is being implemented and execute when Claude is idle between stories. This means:
- Health checks report progress at natural pause points
- Checkpoints capture state between stories, not mid-implementation
- The session timeout fires even if a story is taking longer than expected

#### On Completion

```
1. Read .sixty/active-crons.json
2. Call CronDelete for each stored cron ID
3. Delete .sixty/active-crons.json
4. Log: "Scheduled tasks cleaned up (N crons removed)"
```

This cleanup runs on:
- All stories complete (normal exit)
- Pipeline paused by session limit
- Unrecoverable error / all stories blocked
- Manual `60/hooks --crons-stop`

---

## Handling Blocked Stories

If a story is blocked:
1. Check if other stories can execute
2. If yes, switch to executable story
3. If all blocked, THEN report the block

---

## Story Rollback

Use `--revert <story-id>` to surgically undo a completed story.

### Command

```bash
60/run --revert DARK-003
```

### Rollback Flow

```
1. Find the commit by conventional message pattern:
   git log --oneline --grep="(DARK-003):" -1

2. Run git revert:
   git revert <sha> --no-edit

3. Update plan.json:
   - Set story status to "reverted"
   - Set completedAt to null
   - Decrement execution.completedStories

4. Check downstream impact:
   - Find all stories where dependencies.stories includes "DARK-003"
   - Set their status to "blocked" if they were pending/in_progress
   - Report: "Reverted DARK-003. DARK-005, DARK-006 now blocked (dependency)."

5. Update progress.md:
   ### <timestamp> -- REVERTED DARK-003
   **Reason**: <from user or auto-detected>
   **Impact**: N downstream stories blocked
```

### Rules

- Only reverts stories with atomic commits (the default behavior)
- If the commit can't be found (squashed or `--no-commit` was used), report and suggest manual fix
- If the revert creates merge conflicts, report them instead of force-resolving
- After revert, re-run quality gates on the resulting state

---

## Error Handling

| Error | Action |
|-------|--------|
| Lint fails | Auto-fix and retry |
| Test fails | Fix code and retry |
| Dependency missing | Skip to next executable story |
| All stories blocked | Report block and stop |

---

## Output

### During Execution (--all mode)
Minimal output per story:
```
▶️ SKILL-001: Create skill_folders table
✅ SKILL-001 complete (12m)
▶️ SKILL-002: Create skill_documents table
...
```

### Final Summary (ONLY when complete)
```
═══════════════════════════════════════════════════════════════
  ✅ FEATURE COMPLETE: skills-remap
═══════════════════════════════════════════════════════════════

Stories: 14/14 complete
Time: 2h 10m

Files created/modified:
  - supabase/migrations/20260130000001_skill_folders_structure.sql
  - src/lib/types/skills.ts
  - src/lib/services/skillFolderService.ts
  - ...
═══════════════════════════════════════════════════════════════
```

---

## Commands Reference

```bash
60/run                        # Execute one story
60/run --count 5              # Execute 5 stories
60/run --all                  # Execute ALL stories (no stopping!)
60/run --story SKILL-003      # Execute specific story
60/run --feature skills-remap # All stories in feature
60/run --revert SKILL-003     # Surgically undo a story
```
