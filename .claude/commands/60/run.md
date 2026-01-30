# 60/run — Execute Stories

**Purpose**: The main execution engine. Picks next available story (or parallel group), implements it, runs quality gates, updates tracking, and optionally continues until complete.

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

```javascript
// Priority order:
// 1. Stories with all dependencies complete
// 2. Lower priority number first
// 3. No file conflicts with in-progress work

function canExecute(story, plan) {
  // All dependency stories must be complete
  for (const depId of story.dependencies.stories) {
    const dep = plan.stories.find(s => s.id === depId);
    if (!dep || dep.status !== 'complete') return false;
  }
  return true;
}
```

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

### 4. Update Tracking

- Mark story as complete in plan.json
- Append to progress.md
- Increment completed count

### 5. Continue (--all mode)

**IMMEDIATELY proceed to next story. No pause. No summary.**

---

## Handling Blocked Stories

If a story is blocked:
1. Check if other stories can execute
2. If yes, switch to executable story
3. If all blocked, THEN report the block

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
```
