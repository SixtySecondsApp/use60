# Ralph-Style Feature Development Workflow Commands

A Ralph-inspired autonomous development loop for use60, integrated with AI Dev Hub task tracking.

**Based on:** [snarktank/ralph](https://github.com/snarktank/ralph)

---

## 📁 File Locations

All commands are stored **project-locally** in this repo:

```
.claude/commands/
├── build-feature.md      # Main entrypoint: Generate PRD + create tasks
├── continue-feature.md   # Execute stories in a loop
├── archive-run.md        # Archive current run
└── 60/
    └── prd.md            # PRD generator (used by build-feature)
```

**Tracking files** (repo root):
- `prd.json` - Active task list (user stories with status)
- `progress.txt` - Append-only learnings log
- `tasks/prd-<runSlug>.md` - Human-readable PRD
- `archive/YYYY-MM-DD-<runSlug>/` - Archived runs

---

## 🚀 Quick Start

### 1. Start a new feature

```bash
/build-feature <feature description>
```

**Example:**
```
/build-feature notification center for sales reps
```

This will:
- Ask 3-7 focused questions (consult-style)
- Generate `tasks/prd-<runSlug>.md`
- Create `prd.json` with user stories
- Create AI Dev Hub tasks in project "Use60 - go live"
- Archive any previous run automatically

### 2. Execute stories

```bash
/continue-feature 10
```

**Example:**
```
/continue-feature 25
```

This will:
- Loop up to N iterations (default: 10)
- Complete one story per iteration
- Run quality gates (typecheck, lint, tests)
- Auto-commit: `feat: US-XXX - <title>`
- Update AI Dev Hub task status + comments

### 3. Archive manually (optional)

```bash
/archive-run
```

Archives current `prd.json` + `progress.txt` to `archive/` folder.

---

## 📋 Command Reference

### `/build-feature`

**Purpose:** Generate a PRD, create `prd.json`, and sync to AI Dev Hub.

**Usage:**
```
/build-feature <feature description>
```

**What it does:**
1. Asks 3-7 focused questions (one at a time, consult-style)
2. Archives previous run if `prd.json` exists
3. Generates `tasks/prd-<runSlug>.md`
4. Creates `prd.json` with user stories
5. Initializes `progress.txt` with Codebase Patterns section
6. Creates AI Dev Hub tasks for each story
7. Stores `aiDevHubTaskId` in `prd.json`

**Output:**
- `tasks/prd-<runSlug>.md` - Human-readable PRD
- `prd.json` - Machine-readable task list
- `progress.txt` - Learnings log
- AI Dev Hub tasks created in project `cae03d2d-74ac-49e6-9da2-aae2440e0c00`

**Example questions it might ask:**
- What problem does this feature solve?
- Who is the primary user?
- What are the key user actions?
- What should it NOT do? (scope boundaries)
- How will we know it's done?

---

### `/continue-feature <iterations>`

**Purpose:** Execute stories from `prd.json` in a Ralph-style loop.

**Usage:**
```
/continue-feature 10    # Run 10 iterations
/continue-feature 25    # Run 25 iterations
/continue-feature       # Default: 10 iterations
```

**What it does (per iteration):**
1. Loads `prd.json` and reads `progress.txt` patterns
2. Picks lowest `priority` story where `passes: false`
3. Updates AI Dev Hub task → `in_progress`
4. Implements the story (following use60 patterns)
5. Runs quality gates:
   - `npm run build:check:strict`
   - `npm run lint`
   - `npm run test:run`
   - Browser verification (for UI stories)
6. On success:
   - Sets `passes: true` in `prd.json`
   - Appends to `progress.txt`
   - Updates AI Dev Hub task → `in_review` + comment
   - Auto-commits: `feat: US-XXX - <title>`
7. On failure:
   - Keeps `passes: false`
   - Updates AI Dev Hub task → `blocked` + error comment
   - Stops loop

**Stop conditions:**
- All stories have `passes: true` ✅
- Quality gates fail ❌
- Max iterations reached

---

### `/archive-run`

**Purpose:** Archive the current PRD run to make way for a new feature.

**Usage:**
```
/archive-run
```

**What it does:**
1. Checks if `prd.json` exists
2. Derives archive folder: `archive/YYYY-MM-DD-<runSlug>/`
3. Copies `prd.json`, `progress.txt`, and PRD markdown to archive
4. Optionally deletes active run files (asks for confirmation)

**Note:** This is automatically called by `/build-feature` when starting a new run.

---

### `/60/prd`

**Purpose:** Standalone PRD generator (used internally by `/build-feature`).

**Usage:**
```
/60/prd <feature description>
```

**What it does:**
- Same consult-style Q&A as `/build-feature`
- Generates `tasks/prd-<runSlug>.md` and `prd.json`
- Does NOT create AI Dev Hub tasks (use `/build-feature` for that)

---

## 📊 Workflow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  /build-feature <description>                              │
│  └─> Consult-style Q&A (3-7 questions)                     │
│      └─> Generate PRD + prd.json                            │
│          └─> Create AI Dev Hub tasks                        │
│              └─> Ready to execute                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  /continue-feature 10                                       │
│  └─> Loop (up to 10 iterations):                           │
│      ├─> Pick next story (passes: false)                    │
│      ├─> Update AI Dev Hub → in_progress                    │
│      ├─> Implement story                                    │
│      ├─> Run quality gates                                  │
│      ├─> ✅ Pass:                                           │
│      │   ├─> Set passes: true                               │
│      │   ├─> Append to progress.txt                         │
│      │   ├─> Update AI Dev Hub → in_review                  │
│      │   └─> Auto-commit: feat: US-XXX - <title>           │
│      └─> ❌ Fail:                                           │
│          ├─> Keep passes: false                             │
│          └─> Update AI Dev Hub → blocked                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 📝 File Formats

### `prd.json` Structure

```json
{
  "project": "Feature Title",
  "runSlug": "feature-slug",
  "branchName": "feature/feature-slug",
  "description": "Brief description",
  "aiDevHubProjectId": "cae03d2d-74ac-49e6-9da2-aae2440e0c00",
  "createdAt": "2026-01-08T22:00:00Z",
  "userStories": [
    {
      "id": "US-001",
      "title": "Story title",
      "description": "As a [user], I want [feature] so that [benefit]",
      "acceptanceCriteria": [
        "Criterion 1",
        "Criterion 2",
        "Typecheck passes"
      ],
      "priority": 1,
      "passes": false,
      "notes": "",
      "aiDevHubTaskId": "task-123"
    }
  ]
}
```

### `progress.txt` Structure

```
# Progress Log
Run: feature-slug
Started: 2026-01-08T22:00:00Z

## Codebase Patterns
- Pattern 1: Use Service Locator for all services
- Pattern 2: Always use maybeSingle() when record might not exist
- Gotcha: meetings table uses owner_user_id, not user_id

---

## 2026-01-08 22:15:00 - US-001
- What was implemented: Added priority field to database
- Files changed: supabase/migrations/..., src/types/...
- Quality gates:
  - build:check:strict: PASS
  - lint: PASS
  - tests: PASS
- Learnings:
  - Remember to add index on priority column
---
```

---

## 🎯 Story Sizing Rules

**Right-sized stories** (completable in one iteration):
- Add a database column and migration
- Add a UI component to an existing page
- Update a service with new logic
- Add a filter dropdown to a list

**Too big** (split these):
- "Build the entire dashboard"
- "Add authentication"
- "Refactor the API"

**Rule of thumb:** If you can't describe the change in 2-3 sentences, it's too big.

---

## ✅ Quality Gates

Every story must pass these before marking `passes: true`:

1. **TypeScript strict check + build**
   ```bash
   npm run build:check:strict
   ```

2. **ESLint** (must be 0 warnings)
   ```bash
   npm run lint
   ```

3. **Unit tests**
   ```bash
   npm run test:run
   ```

4. **Browser verification** (UI stories only)
   - Manual check on `localhost:5175`
   - Or Playwright: `npm run test:e2e`

---

## 🔗 AI Dev Hub Integration

**Project:** Use60 - go live (`cae03d2d-74ac-49e6-9da2-aae2440e0c00`)

**Status Mapping:**
- Story selected → `in_progress`
- Story passes gates → `in_review`
- Story fails gates → `blocked`
- Story complete → `done` (optional, stays `in_review` by default)

**Task Title Format:**
```
[<runSlug>] US-XXX: <Story Title>
```

**Comments:** Each iteration adds a comment with:
- Implementation summary
- Files changed
- Quality gate results
- Any learnings

---

## 🛠️ use60 Tech Stack Reference

When implementing stories, remember:

- **Frontend:** React 18 + Vite (`localhost:5175`)
- **Backend:** Supabase (Postgres + Edge Functions in Deno)
- **State:** React Query (server) + Zustand (client)
- **UI:** Radix primitives in `src/components/ui/`
- **Auth:** Supabase Auth or Clerk (dual support)

**Database Gotchas:**
- `meetings` uses `owner_user_id` (NOT `user_id`)
- Use `maybeSingle()` when record might not exist
- Edge functions: explicit column selection (no `select('*')`)

**Service Locator Pattern:**
```typescript
const { dealService, activityService } = useServices();
```

---

## 🔒 MCP Configuration

**Repo files:**
- `.mcp.json` - Token-free placeholder (safe to commit)
- `.mcp.local.json` - Contains auth header (ignored by git)

**Global config:**
- `~/.cursor/mcp.json` - Contains Bearer token for AI Dev Hub

The workflow uses the global MCP config for AI Dev Hub API calls.

---

## 📚 Example Workflow

```bash
# 1. Start a new feature
/build-feature notification center for sales reps

# Answer questions:
# Q: What problem does this solve?
# A: Sales reps miss important notifications scattered across different tools
# Q: Who is the primary user?
# A: Sales reps (internal users)
# Q: What are the key actions?
# A: View notifications, mark as read, filter by type, take action
# ...

# Output: PRD created, prd.json with 8 stories, AI Dev Hub tasks created

# 2. Execute stories
/continue-feature 25

# Loop runs:
# Iteration 1: US-001 - Add notifications table → ✅ PASS → committed
# Iteration 2: US-002 - Create notification service → ✅ PASS → committed
# Iteration 3: US-003 - Add notification bell icon → ✅ PASS → committed
# ...
# Iteration 8: US-008 - Add notification filters → ✅ PASS → committed
# All stories complete! ✅

# 3. Review and merge
git log --oneline -8
# feat: US-001 - Add notifications table
# feat: US-002 - Create notification service
# ...
```

---

## 🐛 Troubleshooting

**"No prd.json found"**
- Run `/build-feature` first to create a PRD

**"AI Dev Hub MCP fails"**
- Check `~/.cursor/mcp.json` has valid Bearer token
- Reload MCP servers / restart Cursor
- Workflow continues locally if MCP fails (tasks marked `sync_failed`)

**"Quality gates fail"**
- Fix the issue manually
- Re-run `/continue-feature` to retry the story

**"Story too big"**
- Split it into smaller stories in `prd.json`
- Create new AI Dev Hub tasks for split stories
- Re-run `/continue-feature`

---

## 📖 References

- **Ralph pattern:** [snarktank/ralph](https://github.com/snarktank/ralph)
- **use60 rules:** `.cursor/rules/` directory
- **Project docs:** `docs/` directory

---

## 👥 Team Sharing

**To use these commands:**
1. Pull the latest code (commands are in `.claude/commands/`)
2. Ensure `~/.cursor/mcp.json` has AI Dev Hub auth configured
3. Run `/build-feature` to start a new feature

**Commands are project-local** - they only work in this repo and don't affect other projects.

---

*Last updated: 2026-01-08*
