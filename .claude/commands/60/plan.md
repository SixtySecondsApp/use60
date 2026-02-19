# 60/plan — Generate Execution Plan

**Purpose**: Create or extend the execution plan from requirements. Handles both new projects and features within existing projects.

---

## Usage Modes

| Mode | Command | When to Use |
|------|---------|-------------|
| New Project | `60/plan --project "name" --template <url>` | Starting from scratch |
| Add Feature | `60/plan --feature "name"` | Adding to existing project |
| Quick Feature | `60/plan --feature "name" --describe "..."` | Small feature, no PRD file |
| From Consult | `60/consult "..." --output plan` | After discovery session |
| Edit Existing | `60/plan --edit` | Modify current plan |
| Interactive | `60/plan` | Prompts for missing info |

---

## Interactive Mode (No Flags)

When you run `60/plan` without flags, it intelligently prompts for what's needed:

### First Time (No .sixty/ folder)

```
$ 60/plan

No existing project found. What would you like to do?

  ❯ Create new project
    Initialize 60/ workflow in existing codebase

Selected: Create new project

? Project name: MyApp
? Template (or 'skip' to use current directory):
  ❯ template-react-supabase (React + Vite + Supabase)
    template-nextjs-full-stack (Next.js + Prisma)
    Custom URL...
    Skip (use current directory)

Selected: template-react-supabase

? Do you have a PRD document?
  ❯ Yes, let me provide the path
    No, I'll describe the feature
    Run 60/consult first (recommended)

...
```

### Existing Project (Has .sixty/ folder)

```
$ 60/plan

Project: MyApp (3 features, 15 stories)
Current: dark-mode (2/7 complete)

What would you like to do?

  ❯ Add new feature
    Edit existing plan
    View current plan
    Re-run consult for new feature

Selected: Add new feature

? Feature name: billing
? How would you like to define it?
  ❯ Run 60/consult (recommended - analyzes codebase)
    Provide PRD file
    Describe inline

...
```

### After 60/consult

If you just ran consult, plan knows the context:

```
$ 60/consult "Add Stripe billing"
...analysis complete...

$ 60/plan

I see you just ran consult for "Stripe billing".

? Generate plan from that analysis? [Y/n]

Creating plan...
✓ 12 stories generated
✓ Dependencies mapped
✓ Parallel groups identified
```

---

## Verification Prompts

The plan command verifies important decisions:

### Story Count Verification

```
Generated 15 stories for feature: billing

? This seems like a lot. Would you like to:
  ❯ Continue with all 15 stories
    Split into smaller features (recommended for >10 stories)
    Review and remove some stories
```

### Large Story Warning

```
⚠️ Story BILL-005 may be too large:

  Title: "Implement complete checkout flow"
  Files: 24 (max recommended: 20)
  Acceptance criteria: 8 (max recommended: 5)

? Would you like to:
  ❯ Auto-split into smaller stories
    Keep as-is (not recommended)
    Edit manually
```

### Dependency Verification

```
Dependency analysis complete:

  BILL-001 (schema) → BILL-002, BILL-003
  BILL-002 (API) → BILL-004, BILL-005
  BILL-003 (API) → BILL-004, BILL-005

Parallel opportunities:
  • BILL-002 + BILL-003 (after BILL-001)
  • BILL-004 + BILL-005 (after BILL-002, BILL-003)

? Does this dependency graph look correct? [Y/n]
```

---

## New Project Setup

### Command

```bash
60/plan --project "MyApp" \
  --template https://github.com/org/template-react-supabase \
  --prd ./requirements.md \
  --design ./design/
```

### Process

#### Step 1: Clone Template (~2 min)

```bash
git clone [TEMPLATE_URL] [PROJECT_NAME]
cd [PROJECT_NAME]
npm install
```

**Supported Templates**:
- `template-react-supabase` — React + Vite + Supabase (use60 stack)
- `template-nextjs-full-stack` — Next.js 14 + Prisma + Clerk
- Custom template — Auto-detect stack from package.json

#### Step 2: Detect Stack

```json
{
  "stack": {
    "framework": "react-vite",
    "database": "supabase",
    "auth": "supabase-auth",
    "styling": "tailwind",
    "testing": "vitest"
  }
}
```

#### Step 3: Analyze PRD (~3 min)

Extract from PRD document:
- **Epics**: High-level feature groups
- **User Stories**: Individual deliverables
- **Acceptance Criteria**: Verifiable conditions
- **Technical Requirements**: API specs, integrations

#### Step 4: Analyze Design (~2 min)

If design files provided:

**HTML/React files**:
- Extract component structure
- Identify reusable patterns
- Extract design tokens (colors, spacing, typography)

**Output**: `design/inventory.json`

```json
{
  "components": [
    {
      "name": "ProjectCard",
      "source": "design/components/ProjectCard.html",
      "props": ["title", "description", "status"],
      "variants": ["default", "compact"],
      "tailwindClasses": "rounded-lg border bg-card p-4"
    }
  ],
  "tokens": {
    "colors": { "primary": "hsl(var(--primary))" },
    "spacing": { "sm": "0.5rem", "md": "1rem" }
  }
}
```

#### Step 5: Generate Stories

Apply story sizing rules:

**Must Pass**:
- [ ] Touches ≤20 files
- [ ] Estimated ≤30 minutes
- [ ] Single responsibility
- [ ] Verifiable acceptance criteria

**Auto-Split Triggers**:
- "and" in title → probably two stories
- >5 acceptance criteria → probably two stories
- Touches schema AND frontend → split into separate stories
- Multiple API endpoints → one story per endpoint

#### Step 6: Create Plan Structure

```bash
.sixty/
├── config.json           # Project settings
├── plan.json             # Execution plan
├── progress.md           # Tracking log
└── hooks.json            # Automation config (optional)
```

---

## Add Feature to Existing Project

### Command

```bash
# With PRD file
60/plan --feature "user-auth" --prd ./docs/auth-requirements.md

# Quick description (no file)
60/plan --feature "dark-mode" --describe "Add dark mode toggle with user preference sync"

# After running 60/consult
60/consult "Add dark mode" --output plan
```

### Process

1. **Load existing plan** from `.sixty/plan.json`
2. **Detect feature prefix** (AUTH-, DARK-, etc.)
3. **Analyze requirements** (from PRD or description)
4. **Generate stories** with proper dependencies
5. **Merge into plan** maintaining dependency order
6. **Sync with Dev Hub** (see Dev Hub Integration below)

### Feature Story IDs

Stories are prefixed by feature:

```
AUTH-001: Setup auth schema
AUTH-002: Create login endpoint
AUTH-003: Build login form
DARK-001: Add preferences table
DARK-002: Build theme provider
```

This allows features to be developed in parallel by different team members.

---

## Plan Structure

### `.sixty/plan.json`

```json
{
  "project": {
    "name": "MyApp",
    "template": "template-react-supabase",
    "stack": {
      "framework": "react-vite",
      "database": "supabase",
      "auth": "supabase-auth"
    },
    "createdAt": "2025-01-14T10:00:00Z"
  },

  "features": [
    {
      "id": "auth",
      "name": "User Authentication",
      "status": "complete",
      "prd": "docs/auth-requirements.md",
      "createdAt": "2025-01-14T10:00:00Z"
    },
    {
      "id": "dark-mode",
      "name": "Dark Mode",
      "status": "in_progress",
      "prd": null,
      "consultReport": ".sixty/consult/dark-mode.md",
      "createdAt": "2025-01-15T09:00:00Z"
    }
  ],

  "aiDevHubProjectId": null,

  "stories": [
    {
      "id": "AUTH-001",
      "feature": "auth",
      "title": "Setup user schema in Supabase",
      "type": "schema",
      "status": "complete",
      "priority": 1,

      "dependencies": {
        "stories": [],
        "files": [],
        "schema": []
      },
      "blocks": ["AUTH-002", "AUTH-003"],
      "parallelWith": [],

      "acceptance": [
        "users table created with id, email, created_at",
        "RLS policies for user access",
        "Migration runs without errors"
      ],

      "estimatedMinutes": 15,
      "actualMinutes": 12,

      "files": [
        "supabase/migrations/001_users.sql"
      ],

      "designRef": null,
      "aiDevHubTaskId": null,

      "startedAt": "2025-01-14T10:05:00Z",
      "completedAt": "2025-01-14T10:17:00Z"
    },
    {
      "id": "DARK-001",
      "feature": "dark-mode",
      "title": "Add user_preferences table",
      "type": "schema",
      "status": "pending",
      "priority": 10,

      "dependencies": {
        "stories": ["AUTH-001"],
        "files": [],
        "schema": ["users"]
      },
      "blocks": ["DARK-002"],
      "parallelWith": [],

      "acceptance": [
        "user_preferences table with user_id, theme columns",
        "Foreign key to users table",
        "RLS policies matching user patterns"
      ],

      "estimatedMinutes": 15,
      "actualMinutes": null,

      "files": [
        "supabase/migrations/010_preferences.sql"
      ],

      "designRef": null,
      "aiDevHubTaskId": null,

      "startedAt": null,
      "completedAt": null
    }
  ],

  "execution": {
    "totalStories": 15,
    "completedStories": 8,
    "currentFeature": "dark-mode",
    "lastUpdated": "2025-01-15T09:30:00Z"
  }
}
```

### `.sixty/config.json`

```json
{
  "project": {
    "name": "MyApp",
    "createdAt": "2025-01-14T10:00:00Z"
  },

  "devHub": {
    "aiDevHubProjectId": null,
    "syncEnabled": true,
    "autoCreateTickets": true
  },

  "qualityGates": {
    "lint": { "enabled": true, "changedOnly": true },
    "test": { "enabled": true, "changedOnly": true },
    "typecheck": { "enabled": true, "finalOnly": true },
    "build": { "enabled": false }
  },

  "parallel": {
    "enabled": true,
    "maxConcurrent": 2
  },

  "notifications": {
    "slack": {
      "enabled": false,
      "webhook": "${SLACK_WEBHOOK_URL}"
    }
  }
}
```

### `.sixty/progress.md`

```markdown
# Progress Log — MyApp

## Codebase Patterns
<!-- Reusable learnings across all features -->

- React Query hooks go in `src/hooks/queries/`
- Zustand stores go in `src/stores/`
- Edge functions use explicit column selection (avoid `select('*')`)
- Use `maybeSingle()` when record might not exist

---

## Session Log

### 2025-01-14 10:17 — AUTH-001 ✅
**Story**: Setup user schema in Supabase
**Files**: supabase/migrations/001_users.sql
**Time**: 12 min (est: 15 min)
**Gates**: lint ✅ | test ✅ | types: skipped
**Learnings**: RLS policy pattern - copy from this migration

---

### 2025-01-14 10:45 — AUTH-002 ✅
**Story**: Create auth edge functions
**Files**: supabase/functions/auth/*
**Time**: 22 min (est: 20 min)
**Gates**: lint ✅ | test ✅ | types: skipped
**Learnings**: Edge functions need explicit CORS headers

---
```

---

## Dependency Management

### Declaring Dependencies

Each story explicitly declares what it depends on and what it blocks:

```json
{
  "id": "DARK-003",
  "dependencies": {
    "stories": ["DARK-001", "DARK-002"],
    "files": ["src/lib/supabase.ts"],
    "schema": ["user_preferences"]
  },
  "blocks": ["DARK-004", "DARK-005"],
  "parallelWith": ["DARK-002b"]
}
```

### Dependency Types

| Type | Meaning |
|------|---------|
| `stories` | These story IDs must be complete |
| `files` | These files must exist and be stable |
| `schema` | These database tables must exist |

### Blocking Logic

A story is **blocked** if:
1. Any `dependencies.stories` is not complete
2. Any `dependencies.schema` table doesn't exist
3. Another in-progress story touches the same files

A story **can execute** when:
1. All dependencies are satisfied
2. No file conflicts with in-progress stories

### Cross-Feature Dependencies

Features can depend on each other:

```json
{
  "id": "DASH-001",
  "feature": "dashboard",
  "dependencies": {
    "stories": ["AUTH-002"],
    "files": [],
    "schema": ["users"]
  }
}
```

---

## Story Sizing Validation

Before adding any story, validate:

### Size Checks

```javascript
function validateStorySize(story) {
  const errors = [];

  // File count
  if (story.files.length > 20) {
    errors.push(`Too many files (${story.files.length}). Max: 20`);
  }

  // Time estimate
  if (story.estimatedMinutes > 30) {
    errors.push(`Estimate too high (${story.estimatedMinutes}m). Max: 30m`);
  }

  // Acceptance criteria count
  if (story.acceptance.length > 5) {
    errors.push(`Too many acceptance criteria (${story.acceptance.length}). Max: 5`);
  }

  // Single responsibility
  if (story.title.includes(' and ')) {
    errors.push('Title contains "and" - consider splitting');
  }

  // Type mixing
  const types = detectTypes(story);
  if (types.length > 1) {
    errors.push(`Mixed types (${types.join(', ')}). Split by type.`);
  }

  return { valid: errors.length === 0, errors };
}
```

### Auto-Split Rules

```javascript
function shouldSplit(story) {
  // Rule 1: Title contains "and"
  if (story.title.includes(' and ')) {
    return { split: true, reason: 'Multiple responsibilities' };
  }

  // Rule 2: Too many acceptance criteria
  if (story.acceptance.length > 5) {
    return { split: true, reason: 'Too many acceptance criteria' };
  }

  // Rule 3: Mixed schema + frontend
  if (story.files.some(f => f.includes('migration')) &&
      story.files.some(f => f.includes('components'))) {
    return { split: true, reason: 'Schema and frontend should be separate' };
  }

  // Rule 4: Multiple API endpoints
  const endpoints = story.acceptance.filter(a =>
    a.match(/endpoint|route|api/i)
  );
  if (endpoints.length > 1) {
    return { split: true, reason: 'One story per endpoint' };
  }

  return { split: false };
}
```

---

## Dev Hub Integration

Dev Hub integration uses **AI Dev Hub MCP tools** for task tracking. All Dev Hub operations are **non-blocking** — failures log warnings but never stop plan generation or execution.

### Project Selection

When creating a plan or adding a feature, select a Dev Hub project:

1. Check if `plan.json.aiDevHubProjectId` already has a value — if so, reuse it
2. If null, check if AI Dev Hub MCP tools are available (call `search_projects` with keyword from feature/project name or "use60")
3. If MCP unavailable, log `⚠️ AI Dev Hub MCP unavailable — skipping Dev Hub sync.` and continue
4. Present discovered projects to user as numbered list using `AskUserQuestion`:
   - `1. <Project Name> (id: <id>)`
   - `2. <Project Name> (id: <id>)`
   - `[Skip] No Dev Hub sync`
5. Store selected project ID in `plan.json.aiDevHubProjectId` (or leave `null` if skipped)

### Task Creation

**Skip entirely if `aiDevHubProjectId` is `null`.**

For each new story generated:

1. Call `create_task` with:
   - `projectId`: from `plan.json.aiDevHubProjectId`
   - `title`: `[<storyId>] <Story Title>`
   - `description`: Story description + acceptance criteria formatted as checklist
   - `type`: `"feature"`
   - `status`: `"todo"`
   - `priority`: mapped from story priority (1-3 → `"high"`, 4-7 → `"medium"`, 8+ → `"low"`)
2. Store returned task ID in `story.aiDevHubTaskId`
3. If individual task creation fails, set `aiDevHubTaskId: null`, log warning, and continue

### Status Transition Map

| Event | Target Status | Fallback |
|-------|--------------|----------|
| Story picked by `60/run` | `"in_progress"` | Works reliably |
| Story passes gates | `"in review"` | Keep status + comment `[STATUS] Ready for review` |
| Story done | `"done"` | Keep status + comment `[STATUS] Completed` |
| Story blocked | `"blocked"` | Works reliably |

**Known API bugs**: `"in review"` and `"done"` status transitions may fail. When they do, keep the current status and add a `[STATUS]` comment via `create_comment` as a fallback. Log: `Dev Hub: status update failed (known API bug) — added comment instead`

### Priority Mapping

| Story Priority | Dev Hub Priority |
|---------------|-----------------|
| 1-3 | `"high"` |
| 4-7 | `"medium"` |
| 8+ | `"low"` |

### Re-Sync on Plan Edit

When running `60/plan --edit` and stories are added or split:
1. New stories: create tasks (same flow as above)
2. Removed stories: add comment `[STATUS] Story removed from plan` (do not delete tasks)
3. Modified stories: update task title/description via `update_task`

---

## Commands Reference

### Create New Project

```bash
60/plan --project "MyApp" \
  --template https://github.com/org/template \
  --prd ./requirements.md \
  --design ./design/
```

### Add Feature

```bash
# With PRD file
60/plan --feature "billing" --prd ./docs/billing.md

# Quick description
60/plan --feature "dark-mode" --describe "Add theme toggle"

# After consult
60/consult "Add dark mode" --output plan
```

### Modify Plan

```bash
# Edit interactively
60/plan --edit

# Split a story
60/plan --split DARK-003

# Re-prioritize
60/plan --reprioritize

# Add single story manually
60/plan --add-story
```

### View Plan

```bash
# Summary
60/plan --show

# Full detail
60/plan --show --detail

# Specific feature
60/plan --show --feature dark-mode

# Export
60/plan --export csv
```

---

## Output Summary

After `60/plan` completes:

```
✅ Plan Updated

📁 Files:
   .sixty/plan.json (7 new stories)
   .sixty/progress.md (initialized)
   .sixty/config.json (updated)

🎫 Dev Hub: <7 tasks created in "<project name>" | skipped (no project selected) | unavailable>

📊 Execution Plan:
   Feature: dark-mode
   Stories: 7
   Estimated: 2-3 hours (with parallel)
   Parallel groups: 2

🚀 Next:
   Run `60/run` to begin execution
   Run `60/status` to see full breakdown
```

---

## Error Handling

| Error | Action |
|-------|--------|
| PRD parse fails | Ask user to clarify format |
| Design parse fails | Continue without design refs |
| Story too large | Auto-split or prompt user |
| Dependency cycle | Report and ask for resolution |
| Dev Hub MCP unavailable | Continue without sync, log warning |
| Dev Hub task creation fails | Set `aiDevHubTaskId: null`, log warning, continue |
| Dev Hub status update fails | Keep current status, add `[STATUS]` comment as fallback |

---

## Next Command

After planning:

```bash
# Start execution
60/run

# Check the plan
60/status --detail

# Make changes
60/plan --edit
```
