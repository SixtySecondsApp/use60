# Progress Log — Slack Debrief Fixes

## Codebase Patterns
- Slack uses `mrkdwn` (not standard markdown) — `*bold*` not `**bold**`
- Tasks table uses `assigned_to`/`created_by`/`clerk_org_id` — NOT `user_id`/`org_id`
- Coaching `overall_score` returns 0-1 decimal, not 0-100
- Deploy to staging (`caerqjzvuerejfrdtygb`) with `--no-verify-jwt`

---

## Session Log

### 2026-02-14 21:35 — SDF-001 + SDF-002 (parallel)
**Stories**: Fix sentiment score + Fix markdown bold
**Files**: supabase/functions/_shared/orchestrator/adapters/notifySlackSummary.ts
**Time**: 2 min
**Changes**:
- Normalize `overall_score`: `raw <= 1 ? Math.round(raw * 100) : Math.round(raw)`
- Use `!= null` instead of truthful check (handles score of 0)
- Added `.replace(/\*\*(.+?)\*\*/g, '*$1*')` to cleanMarkdownForSlack()

---

### 2026-02-14 21:36 — SDF-003
**Story**: Fix task creation column names
**Files**: supabase/functions/slack-interactive/index.ts
**Time**: 2 min
**Changes**:
- `handleDebriefAddTask` (line ~6499): `user_id` → `assigned_to`/`created_by`, `org_id` → `clerk_org_id`, `status: 'todo'` → `'pending'`
- `handleDebriefAddAllTasks` (line ~6629): same column fixes in bulk insert map()

---

### 2026-02-14 21:37 — Deployment
- `agent-orchestrator` → staging (caerqjzvuerejfrdtygb) ✅
- `slack-interactive` → staging (caerqjzvuerejfrdtygb) ✅
