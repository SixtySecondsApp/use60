---
name: 60-run
invoke: /60-run
description: Execute planned stories with quality gates and progress tracking. Defaults to --all mode with model profile selection.
---

# 60/run — Execute Stories

**Purpose**: The main execution engine. Picks next available story (or parallel group), implements it, runs quality gates, updates tracking, and optionally continues until complete.

---

## Cross-Platform Compatibility

- Works on **Windows**, **macOS**, and **Linux**
- All file paths use forward slashes (`/`)
- Shell commands (quality gates, git) run via Claude's Bash tool (bash on all platforms)
- Uses Claude's built-in tools (Glob, Grep, Read, Edit) for file operations
- No OS-specific commands — `npx`, `npm`, `git` work on all platforms

---

## CRITICAL: DEFAULT BEHAVIOR

**60/run defaults to `--all` — it executes ALL remaining stories, not just one.**

**60/run ALWAYS deploys agent teams for every story. This is NOT optional.**

Every story is executed by a team of specialized sub-agents:
1. **Implementer agent** — writes the code to meet acceptance criteria
2. **Reviewer agent** — checks the implementation for bugs, security issues, and pattern violations
3. **Tester agent** — writes and runs tests for the implementation

If the reviewer finds issues, the implementer agent fixes them before proceeding. This loop continues until the reviewer approves. **You MUST use the Agent tool to spawn these sub-agents. Do NOT implement stories yourself directly — delegate to agent teams.**

When invoked from a chain (consult → plan → run), it inherits the model profile and starts immediately. When invoked standalone, it asks for a profile first.

**If invoked as part of a chain (from 60/consult or 60/plan): inherit the already-selected profile, skip the prompt below, and begin executing ALL stories immediately.**

---

## Step 0: Model Profile Selection (FIRST STEP — standalone only)

**Skip this if invoked from a chain.** Only prompt when run standalone.

[Uses AskUserQuestion tool:]

Question: "Select your model profile for execution:"
Options:
  - Economy — Fastest, lowest cost. Sonnet leader, Haiku agents. Best for routine work.
  - Balanced (Recommended) — Opus leader, Sonnet agents. Best balance of speed & quality.
  - Thorough — Opus leader, Opus agents. Maximum quality for critical features.

Skip with `--profile <name>`.

### Model Assignments by Profile

| Agent Role | Economy | Balanced | Thorough |
|------------|---------|----------|----------|
| Leader/Orchestrator | Sonnet | Opus | Opus |
| Implementer agents | Haiku | Sonnet | Opus |
| Reviewer agents | Haiku | Sonnet | Opus |
| Tester agents | Haiku | Sonnet | Opus |

---

## Execution Modes

| Mode | Command | Description |
|------|---------|-------------|
| **Default** | `60/run` | **Execute ALL remaining stories (default)** |
| Single | `60/run --single` | Execute one story, then stop |
| Count | `60/run --count 5` | Execute exactly 5 stories |
| All | `60/run --all` | Execute all remaining stories |
| Loop | `60/run --loop` | Execute until feature complete |
| Parallel | `60/run --parallel` | Execute parallel groups for speed |
| Auto | `60/run --auto` | Full automation with hooks (hours) |
| Specific | `60/run --story DARK-003` | Execute specific story |
| Until | `60/run --until DARK-005` | Execute until specific story complete |
| Feature | `60/run --feature auth` | Execute all stories in feature |
| Retry | `60/run --retry` | Retry last failed story |
| Profile | `60/run --profile <name>` | Use specific model profile |

---

## Interactive Mode (No Flags)

When you run `60/run` without specifying what to execute, it prompts:

```
$ 60/run

? How many stories would you like to execute?

  ❯ 1 - Just the next story (DARK-003)
    5 - Next 5 stories
    All remaining (5 stories in dark-mode)
    Until specific story...
    Custom count...

Selected: 1

📋 Next Story: DARK-003 - Build ThemeContext provider
...
```

### Smart Defaults

If context is clear, it suggests the most likely option:

```
$ 60/run

Current feature: dark-mode (2/7 complete)
5 stories remaining, ~1.5 hours estimated

? Execute all 5 remaining stories in dark-mode? [Y/n]
```

### Model Profile Selection

The model profile determines which models your agent teams use. This is selected in Step 0 above (or inherited from the chain).

Skip the prompt with `--profile`:
```bash
60/run --profile balanced
60/run --profile thorough
```

---

## Core Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      60/run EXECUTION FLOW                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐                                              │
│  │  Load State  │ plan.json, config.json, progress.md          │
│  └──────┬───────┘                                              │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐     blocked     ┌──────────────┐             │
│  │ Find Next    │────────────────▶│ Switch Story │             │
│  │ Executable   │                 │ or Pause     │             │
│  └──────┬───────┘                 └──────────────┘             │
│         │ found                                                 │
│         ▼                                                       │
│  ┌──────────────┐                                              │
│  │ Show Summary │ Story details, acceptance criteria           │
│  │ (if not auto)│                                              │
│  └──────┬───────┘                                              │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐                                              │
│  │  Implement   │ Based on story type + patterns               │
│  │    Story     │                                              │
│  └──────┬───────┘                                              │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐     fail        ┌──────────────┐             │
│  │   Quality    │────────────────▶│ Retry/Fix or │             │
│  │    Gates     │                 │ Mark Blocked │             │
│  └──────┬───────┘                 └──────────────┘             │
│         │ pass                                                  │
│         ▼                                                       │
│  ┌──────────────┐                                              │
│  │   Update     │ plan.json, progress.md, Dev Hub              │
│  │  Tracking    │                                              │
│  └──────┬───────┘                                              │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐                                              │
│  │    Commit    │ feat: DARK-003 - Build ThemeContext          │
│  └──────┬───────┘                                              │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐     --loop/     ┌──────────────┐             │
│  │   Complete   │────--auto──────▶│   Continue   │             │
│  └──────────────┘                 └──────────────┘             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Load State & Find Next Work

```javascript
// Load execution state
const plan = await readJSON('.sixty/plan.json');
const config = await readJSON('.sixty/config.json');
const progress = await readFile('.sixty/progress.md');

// Find what can execute
const nextWork = findNextExecutableWork(plan, config);
```

### Finding Next Executable Story

```javascript
function findNextExecutableWork(plan, config) {
  // Get all pending stories
  const pending = plan.stories.filter(s => s.status === 'pending');
  
  if (pending.length === 0) {
    return { type: 'complete', message: 'All stories done! 🎉' };
  }
  
  // Get in-progress stories (for file conflict detection)
  const inProgress = plan.stories.filter(s => s.status === 'in_progress');
  
  // Find stories with all dependencies met
  const ready = pending.filter(story => canExecute(story, plan, inProgress));
  
  if (ready.length === 0) {
    return { 
      type: 'blocked', 
      message: 'All remaining stories are blocked',
      blockedStories: pending.map(s => ({
        id: s.id,
        reason: getBlockReason(s, plan, inProgress)
      }))
    };
  }
  
  // Check for parallel opportunities
  if (config.parallel?.enabled && ready.length > 1) {
    const parallelGroup = findParallelGroup(ready);
    if (parallelGroup.length > 1) {
      return { type: 'parallel', stories: parallelGroup };
    }
  }
  
  // Return highest priority ready story
  const next = ready.sort((a, b) => a.priority - b.priority)[0];
  return { type: 'single', story: next };
}

function canExecute(story, plan, inProgress) {
  // Check 1: All dependency stories complete
  for (const depId of story.dependencies.stories) {
    const dep = plan.stories.find(s => s.id === depId);
    if (!dep || dep.status !== 'complete') {
      return false;
    }
  }
  
  // Check 2: No file conflicts with in-progress stories
  for (const active of inProgress) {
    const overlap = story.files.filter(f => active.files.includes(f));
    if (overlap.length > 0) {
      return false;
    }
  }
  
  // Check 3: Schema dependencies exist (for backend/frontend stories)
  // This would check actual database state
  
  return true;
}

function getBlockReason(story, plan, inProgress) {
  // Check dependencies
  for (const depId of story.dependencies.stories) {
    const dep = plan.stories.find(s => s.id === depId);
    if (!dep) return `Missing dependency: ${depId}`;
    if (dep.status !== 'complete') return `Waiting on: ${depId} (${dep.status})`;
  }
  
  // Check file conflicts
  for (const active of inProgress) {
    const overlap = story.files.filter(f => active.files.includes(f));
    if (overlap.length > 0) {
      return `File conflict with ${active.id}: ${overlap.join(', ')}`;
    }
  }
  
  return 'Unknown';
}
```

---

## Step 2: Display Work Summary

### Single Story Mode

```
📋 Next Story: DARK-003 - Build ThemeContext provider

Feature: dark-mode
Type: frontend
Priority: 12
Estimated: ~25 minutes

Dependencies: 
  ✅ DARK-001 (schema)
  ✅ DARK-002 (API)

Parallel with: DARK-004 (no file overlap)

Acceptance Criteria:
  □ ThemeContext provides current theme value
  □ useTheme hook returns { theme, setTheme, toggleTheme }
  □ Theme persists to user_preferences via API
  □ Respects system preference on first load

Files to create/modify:
  - src/contexts/ThemeContext.tsx
  - src/hooks/useTheme.ts
  - src/providers/index.tsx (add provider)

Design Reference: None (logic-only component)

Proceed? [Y/n/parallel]
```

### Parallel Group Mode

```
⚡ Parallel Group Available

Stories that can run together (no conflicts):

  DARK-003: Build ThemeContext provider (~25 min)
    Files: src/contexts/ThemeContext.tsx, src/hooks/useTheme.ts
    
  DARK-004: Add theme toggle to settings (~20 min)
    Files: src/components/settings/ThemeToggle.tsx

No file overlap detected.
Combined estimate: ~25 min (parallel) vs ~45 min (sequential)
Time savings: ~44%

Execute in parallel? [Y/n/sequential]
```

---

## Step 3: Implement Story (MUST USE AGENT TEAMS)

**REMINDER: You MUST deploy agent teams (Implementer → Reviewer → Tester) using the Agent tool. Do NOT implement code yourself. See the "MANDATORY: Agent Team Execution" section above.**

### Update Status

```javascript
// Mark as in-progress
story.status = 'in_progress';
story.startedAt = new Date().toISOString();
await writeJSON('.sixty/plan.json', plan);

// Update Dev Hub ticket (if configured)
if (config.devHub?.syncEnabled && story.ticketId) {
  await devHub.updateTicket(story.ticketId, {
    status: 'in_progress',
    started_at: story.startedAt
  });
}
```

### Load Context

Before implementing, gather relevant context:

```javascript
const context = {
  // Patterns from progress.md
  patterns: extractPatterns(progress),
  
  // Related completed stories for reference
  relatedStories: plan.stories
    .filter(s => s.status === 'complete' && s.type === story.type)
    .slice(-3),
  
  // Design reference (if specified)
  design: story.designRef ? await loadDesign(story.designRef) : null,
  
  // Stack-specific guidelines
  stack: plan.project.stack
};
```

### Implementation by Story Type

#### Schema Stories (Supabase)

```sql
-- Follow existing migration patterns
-- File: supabase/migrations/XXX_[story-name].sql

-- Create table
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies (copy pattern from existing)
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own preferences"
  ON user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON user_preferences FOR UPDATE
  USING (auth.uid() = user_id);
```

#### Backend Stories (Edge Functions)

```typescript
// supabase/functions/preferences/index.ts
// Follow existing edge function patterns

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from '@supabase/supabase-js'

serve(async (req) => {
  // CORS headers (copy from existing)
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  }
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    
    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Unauthorized')
    
    // Handle request...
    // Use explicit columns (avoid select('*'))
    const { data, error } = await supabase
      .from('user_preferences')
      .select('id, theme, updated_at')
      .eq('user_id', user.id)
      .maybeSingle()  // Use maybeSingle when record might not exist
    
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
```

#### Frontend Stories (React)

```typescript
// src/contexts/ThemeContext.tsx
// Follow existing context patterns

import { createContext, useContext, useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

type Theme = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  
  // Server state via React Query
  const { data: preferences } = useQuery({
    queryKey: ['preferences'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('preferences')
      if (error) throw error
      return data
    }
  })
  
  // ... implementation
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
```

---

## Step 4: Quality Gates

### Ultra-Fast Path (Every Story, ~15-30s)

**CRITICAL**: For rapid iteration, only run gates that complete quickly.

#### Gate 1: Lint Changed Files (~5-15s) — ALWAYS RUN

```bash
# Cross-platform: runs via Claude's Bash tool
npx eslint $(git diff --name-only HEAD~1 -- '*.ts' '*.tsx') --max-warnings 0 --quiet
```

**Note**: `--quiet` shows only errors. Pre-existing warnings are OK.

#### Gate 2: Test Changed Files (~5-30s) — ALWAYS RUN

```bash
npx vitest run --changed HEAD~1 --passWithNoTests
```

#### Gate 3: Type Check — SKIP (Trust IDE)

**DO NOT** run `tsc --noEmit` on every story. It takes 3+ minutes on large codebases.

Instead:
- Trust IDE real-time TypeScript errors (red squiggles)
- If IDE shows no type errors in changed files, gate passes
- Only run full typecheck on **final story** of a feature

#### Browser Verification (UI Stories)

Quick spot-check (~30 seconds):
```
✓ Component renders correctly
✓ Basic interaction works
✓ No console errors
```

### Full Validation (Final Story Only)

Run comprehensive checks when completing a feature:

```bash
npm run typecheck        # Full TypeScript (~3-5 min)
npm run lint             # Full ESLint
npm run test:run         # All unit tests
npm run build            # Production build
```

### Gate Results Display

```
Quality Gates (Ultra-Fast):
  ✅ lint (changed): 8 files, passed (6s)
  ✅ test (changed): 2 tests, passed (4s)
  ⏭️ typecheck: skipped (IDE shows no errors)
  ✅ browser: spot-checked

Total: 12 seconds

All gates passed!
```

### Time Budget

| Path | Duration | When |
|------|----------|------|
| Ultra-fast (Gates 1-2) | ~15-30s | Every story |
| Full validation | ~5-8 min | Final story only |

---

## Step 5: Update Tracking

### Update plan.json

```javascript
story.status = 'complete';
story.completedAt = new Date().toISOString();
story.actualMinutes = calculateDuration(story.startedAt, story.completedAt);

// Update execution stats
plan.execution.completedStories++;
plan.execution.lastUpdated = new Date().toISOString();

// Check if feature is complete
const featureStories = plan.stories.filter(s => s.feature === story.feature);
const featureComplete = featureStories.every(s => s.status === 'complete');
if (featureComplete) {
  const feature = plan.features.find(f => f.id === story.feature);
  feature.status = 'complete';
}

await writeJSON('.sixty/plan.json', plan);
```

### Update Dev Hub Ticket

```javascript
if (config.devHub?.syncEnabled && story.ticketId) {
  await devHub.updateTicket(story.ticketId, {
    status: 'done',
    completed_at: story.completedAt,
    actual_minutes: story.actualMinutes
  });
}
```

### Append to progress.md

```javascript
const entry = `
### ${formatDate(story.completedAt)} — ${story.id} ✅
**Story**: ${story.title}
**Files**: ${story.files.join(', ')}
**Time**: ${story.actualMinutes} min (est: ${story.estimatedMinutes} min)
**Gates**: lint ✅ | test ✅ | types: skipped
**Learnings**: ${learnings || 'None'}

---
`;

await appendFile('.sixty/progress.md', entry);
```

---

## Step 6: Commit

### Commit Message Format

```bash
git add .
git commit -m "feat: ${story.id} - ${story.title}"
```

Examples:
- `feat: DARK-001 - Add user_preferences table`
- `feat: DARK-003 - Build ThemeContext provider`
- `fix: AUTH-002 - Handle edge case in login flow`

### When to Commit

| Mode | Commit Behavior |
|------|-----------------|
| Single | Ask before committing |
| Loop | Auto-commit each story |
| Parallel | Commit after group complete |
| Auto | Auto-commit always |

---

## Parallel Execution

### Finding Parallel Groups

```javascript
function findParallelGroup(readyStories) {
  const groups = [];
  const used = new Set();
  
  for (const story of readyStories) {
    if (used.has(story.id)) continue;
    
    // Find stories that can run with this one
    const group = [story];
    
    for (const other of readyStories) {
      if (other.id === story.id || used.has(other.id)) continue;
      
      // Check if they can run together
      if (canRunTogether(story, other, group)) {
        group.push(other);
      }
    }
    
    if (group.length > 1) {
      group.forEach(s => used.add(s.id));
      groups.push(group);
    }
  }
  
  return groups[0] || []; // Return first viable group
}

function canRunTogether(story, other, group) {
  // No file overlap
  const allFiles = [...group.flatMap(s => s.files), ...story.files];
  const overlap = other.files.filter(f => allFiles.includes(f));
  if (overlap.length > 0) return false;
  
  // Explicitly marked as parallel
  if (story.parallelWith?.includes(other.id)) return true;
  if (other.parallelWith?.includes(story.id)) return true;
  
  // Same type, no shared dependencies
  if (story.type === other.type) {
    const sharedDeps = story.dependencies.stories.filter(
      d => other.dependencies.stories.includes(d)
    );
    // Having shared deps is OK, they're already complete
    return true;
  }
  
  return false;
}
```

### Parallel Execution Flow

```
┌─────────────────────────────────────────────┐
│  Parallel Group: DARK-003, DARK-004         │
├─────────────────────────────────────────────┤
│                                             │
│  ┌───────────┐       ┌───────────┐         │
│  │ DARK-003  │       │ DARK-004  │         │
│  │ Implement │       │ Implement │         │
│  └─────┬─────┘       └─────┬─────┘         │
│        │                   │                │
│        └─────────┬─────────┘                │
│                  ▼                          │
│         ┌───────────────┐                   │
│         │ Quality Gates │ Run once for all  │
│         │ (combined)    │                   │
│         └───────┬───────┘                   │
│                 ▼                           │
│         ┌───────────────┐                   │
│         │    Commit     │ Single commit     │
│         │  (grouped)    │                   │
│         └───────────────┘                   │
│                                             │
└─────────────────────────────────────────────┘
```

### Parallel Quality Gates

```bash
# Run once for entire group
CHANGED=$(git diff --name-only HEAD~1 -- '*.ts' '*.tsx' | tr '\n' ' ')
[ -n "$CHANGED" ] && npx eslint $CHANGED --max-warnings 0 --quiet
npx vitest run --changed HEAD~1 --passWithNoTests
```

### Parallel Commit

```bash
git commit -m "feat: DARK-003, DARK-004 - Theme context and toggle

- DARK-003: Build ThemeContext provider
- DARK-004: Add theme toggle to settings"
```

---

## Error Handling

### Quality Gate Failure

```
❌ Quality Gate Failed: lint

Error in src/contexts/ThemeContext.tsx:
  Line 45: 'unusedVar' is defined but never used (@typescript-eslint/no-unused-vars)

Options:
  [F] Fix automatically and retry
  [M] Fix manually (opens file)
  [S] Skip this gate (not recommended)
  [B] Mark blocked and switch to next story

Choice: F

Attempting auto-fix...
✅ Fixed 1 issue
Retrying quality gates...
✅ All gates passed
```

### Implementation Error

```
❌ Implementation Error

Error: Cannot find module '@/lib/supabase'

Possible causes:
  1. File doesn't exist
  2. Path alias not configured
  3. Missing export

Options:
  [D] Debug (show more context)
  [F] Fix (create missing file)
  [B] Mark blocked

Choice: D

Context:
  - @/ alias configured in tsconfig.json ✅
  - src/lib/supabase.ts exists ✅
  - File exports 'supabase' ❌ (exports 'supabaseClient')

Suggested fix: Update import to use 'supabaseClient'
Apply? [Y/n]
```

### Story Blocked

```
⚠️ Story Blocked: DARK-005

Cannot execute because:
  - Dependency DARK-003 is still in_progress

Options:
  [W] Wait (check every 30s)
  [S] Switch to different story
  [P] Pause execution

Choice: S

Finding alternative stories...
Found: DARK-006 - Add system preference detection
  Dependencies: ✅ All met
  No file conflicts

Switch to DARK-006? [Y/n]
```

### Rollback Procedure

```javascript
async function rollbackStory(story, error) {
  // 1. Git reset
  await exec(`git checkout -- .`);
  await exec(`git clean -fd`);
  
  // 2. Update plan
  story.status = 'blocked';
  story.blockedReason = error.message;
  story.attempts = (story.attempts || 0) + 1;
  await writeJSON('.sixty/plan.json', plan);
  
  // 3. Update ticket
  if (story.ticketId) {
    await devHub.updateTicket(story.ticketId, {
      status: 'blocked',
      blocked_reason: error.message
    });
  }
  
  // 4. Log
  await appendProgress(`
### ${timestamp} — ${story.id} ❌ BLOCKED
**Reason**: ${error.message}
**Attempts**: ${story.attempts}
**Action**: Manual review required
  `);
}
```

---

## Auto Mode (--auto)

For hours of unattended execution with hooks:

```bash
60/run --auto
```

### Auto Mode Behavior

1. **No confirmations** — Proceeds automatically
2. **Auto-retry** — Retries failures up to 2x
3. **Auto-switch** — Switches to next story when blocked
4. **Auto-commit** — Commits after each story
5. **Notifications** — Sends updates on phase completion
6. **Checkpoints** — Creates recovery points every 30 min

### Safety Rails

```javascript
const safetyLimits = {
  maxStoriesPerSession: 50,
  maxHoursPerSession: 8,
  maxConsecutiveErrors: 3,
  requireApprovalFor: ['migration', 'breaking-change', 'deployment']
};
```

### Auto Mode Output

```
═══════════════════════════════════════════════════════
  60/run --auto SESSION
  Started: 2025-01-15 09:00
═══════════════════════════════════════════════════════

09:00 ▶️ Starting DARK-001: Add user_preferences table
09:12 ✅ DARK-001 complete (12m)
09:12 ▶️ Starting DARK-002: Create preferences edge function
09:35 ✅ DARK-002 complete (23m)
09:35 ⚡ Parallel group: DARK-003, DARK-004
09:58 ✅ Parallel group complete (23m)
09:58 ▶️ Starting DARK-005: Hydrate theme on auth load
...

═══════════════════════════════════════════════════════
  SESSION COMPLETE
  Duration: 2h 15m
  Stories: 7/7 ✅
  Feature: dark-mode COMPLETE
═══════════════════════════════════════════════════════
```

---

## Session Management

### Progress Display

After each story:

```
✅ DARK-003 Complete | ⏱️ 23m | 📊 10/15 (67%)

Next: DARK-005 - Hydrate theme on auth load
      Dependencies: ✅ | Est: 15m
```

### Feature Complete

```
═══════════════════════════════════════════════════════
  ✅ FEATURE COMPLETE: dark-mode
═══════════════════════════════════════════════════════

Stories: 7/7 complete
Time: 2h 10m (estimated: 2h 30m)
Efficiency: 115%

Quality Summary:
  - Tests added: 12
  - Files changed: 14
  - Lint issues: 0

Commits:
  - feat: DARK-001 - Add user_preferences table
  - feat: DARK-002 - Create preferences edge function
  - feat: DARK-003, DARK-004 - Theme context and toggle
  - feat: DARK-005 - Hydrate theme on auth load
  - feat: DARK-006 - Add system preference detection
  - feat: DARK-007 - Write theme tests

Dev Hub: All tickets marked complete
         https://devhub.app/projects/proj_abc123

═══════════════════════════════════════════════════════
```

---

## Commands Reference

```bash
# Basic execution
60/run                        # Interactive - asks what to do
60/run --count 5              # Execute exactly 5 stories
60/run --all                  # Execute all remaining stories
60/run --loop                 # Execute until feature complete
60/run --parallel             # Use parallel execution
60/run --auto                 # Full automation

# Targeting
60/run --story DARK-003       # Execute specific story
60/run --until DARK-005       # Execute until story complete
60/run --feature dark-mode    # All stories in feature
60/run --retry                # Retry last failed story
60/run --skip DARK-003        # Skip story (not recommended)

# Parallel with multiple agent teams
60/run --parallel --agents 2  # Run 2 parallel agent teams
60/run --parallel --agents 3 --count 10  # 3 agent teams, 10 stories

# Control
60/run --dry-run              # Show what would execute
60/run --resume               # Resume from checkpoint

# Debugging
60/run --verbose              # Show detailed output
60/run --step                 # Pause after each step
```

---

## Multi-Agent Parallel Execution

When using `--parallel --agents N`, multiple AI agents work simultaneously:

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                  ORCHESTRATED PARALLEL EXECUTION                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   ORCHESTRATOR                           │   │
│  │  • Maintains shared state (.sixty/state.json)           │   │
│  │  • Manages locks (prevents conflicts)                    │   │
│  │  • Assigns stories to available agents                   │   │
│  │  • Syncs results and updates plan.json                   │   │
│  └─────────────────────┬───────────────────────────────────┘   │
│                        │                                        │
│          ┌─────────────┼─────────────┐                         │
│          ▼             ▼             ▼                         │
│     ┌─────────┐   ┌─────────┐   ┌─────────┐                   │
│     │ Agent 1 │   │ Agent 2 │   │ Agent 3 │                   │
│     │DARK-003 │   │DARK-004 │   │  idle   │                   │
│     │working  │   │working  │   │         │                   │
│     └────┬────┘   └────┬────┘   └─────────┘                   │
│          │             │                                       │
│          ▼             ▼                                       │
│     ┌─────────────────────────────────┐                       │
│     │         SHARED STATE            │                       │
│     │  .sixty/state.json              │                       │
│     │  .sixty/locks/DARK-003.lock     │                       │
│     │  .sixty/locks/DARK-004.lock     │                       │
│     └─────────────────────────────────┘                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Lock System

Before starting any story, an agent must acquire a lock:

```javascript
// Agent checks for lock before starting
const lock = await acquireLock('DARK-003', agentId);
if (!lock.success) {
  // Story already being worked on, get different assignment
  continue;
}

// Work on story...

// Release lock when done
await releaseLock('DARK-003', agentId);
```

Locks prevent:
- Two agents working on same story
- File conflicts from overlapping work
- Race conditions in state updates

### State Synchronization

All agents sync through `.sixty/state.json`:

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

### Agent Heartbeats

Agents send heartbeats every 30 seconds. If no heartbeat for 5 minutes, the lock is considered stale and can be taken by another agent.

### Starting Multi-Agent Execution

```bash
$ 60/run --parallel --agents 2 --all

🚀 Starting parallel execution with 2 agents

Initializing orchestrator...
✓ State file created: .sixty/state.json
✓ Lock directory ready: .sixty/locks/

Finding parallel work...
✓ DARK-003 and DARK-004 can run together (no file overlap)

Spawning agents...
✓ Agent 001: Assigned DARK-003
✓ Agent 002: Assigned DARK-004

═══════════════════════════════════════════════════════
  PARALLEL EXECUTION IN PROGRESS
  Agents: 2 | Stories: 0/5 | Elapsed: 0:00
═══════════════════════════════════════════════════════

10:25:00 [Agent 001] ▶️ Starting DARK-003
10:25:00 [Agent 002] ▶️ Starting DARK-004
10:25:30 [Agent 001] 💓 Heartbeat DARK-003
10:25:30 [Agent 002] 💓 Heartbeat DARK-004
10:48:00 [Agent 002] ✅ DARK-004 complete (23m)
10:48:00 [Agent 002] ▶️ Starting DARK-006 (DARK-005 blocked)
10:52:00 [Agent 001] ✅ DARK-003 complete (27m)
10:52:00 [Orchestrator] 🔓 DARK-005 unblocked
10:52:00 [Agent 001] ▶️ Starting DARK-005

...
```

---

## MANDATORY: Agent Team Execution

**Every story MUST be executed by an agent team. This is the default and CANNOT be skipped.**

You MUST use the Agent tool to deploy sub-agents for each story. Do NOT write code yourself — you are the orchestrator. Your job is to:
1. Load context (story details, relevant files, patterns)
2. Deploy the agent team
3. Verify results
4. Run quality gates

### Agent Team Flow (EVERY STORY)

```
┌─────────────────────────────────────────────────────────────────┐
│                STORY EXECUTION (DARK-003)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  YOU (Orchestrator):                                            │
│  • Load story context, acceptance criteria, related files       │
│  • Identify patterns from completed stories                     │
│                                                                 │
│  THEN deploy agents using the Agent tool:                       │
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │ IMPLEMENTER │───▶│  REVIEWER   │───▶│   TESTER    │        │
│  │   (Agent)   │    │   (Agent)   │    │   (Agent)   │        │
│  │             │    │             │    │             │        │
│  │ Write code  │    │ Check code  │    │ Write tests │        │
│  │ for story   │    │ for issues  │    │ Run tests   │        │
│  └─────────────┘    └──────┬──────┘    └─────────────┘        │
│                            │                                   │
│                     Issues found?                              │
│                       Yes │                                    │
│                     ┌──────▼──────┐                           │
│                     │ IMPLEMENTER │  ← Re-deploy agent        │
│                     │  Fix issues │    to address feedback     │
│                     └─────────────┘                           │
│                                                                │
│  YOU (Orchestrator):                                            │
│  • Verify all acceptance criteria met                           │
│  • Run quality gates                                            │
│  • Update tracking                                              │
│  • Commit changes                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Agent Roles (Deployed via Agent tool)

| Agent | Task | What to Include in Agent Prompt |
|-------|------|-------------------------------|
| **Implementer** | Write code meeting acceptance criteria | Story details, acceptance criteria, file paths, existing patterns from codebase, related completed stories |
| **Reviewer** | Check implementation for bugs, security issues, pattern violations | The files changed by implementer, codebase conventions, common pitfalls |
| **Tester** | Write and run tests for the implementation | Implementation files, test patterns from codebase, acceptance criteria to validate |

### How to Deploy Agents

For EACH story, you MUST call the Agent tool like this:

**Step 1 — Implementer Agent:**
Deploy an Agent with a prompt containing:
- The story ID, title, and acceptance criteria
- The files to create/modify (from plan.json)
- Relevant existing code patterns (from completed stories or codebase analysis)
- Specific instructions: "Implement this story. Create/modify the listed files to meet all acceptance criteria."

**Step 2 — Reviewer Agent:**
Deploy an Agent with a prompt containing:
- The story details and acceptance criteria
- Instructions to read all files changed by the implementer
- "Review this implementation. Check for: bugs, security issues, pattern violations, missing edge cases. List any issues found."

**Step 3 — If reviewer found issues, re-deploy Implementer Agent:**
Deploy an Agent with:
- The reviewer's feedback
- "Fix these issues in the implementation: [reviewer feedback]"
- Then re-deploy reviewer to verify fixes

**Step 4 — Tester Agent:**
Deploy an Agent with:
- The implementation files
- Test patterns from the codebase
- "Write tests for this implementation covering all acceptance criteria. Run the tests and report results."

### What MUST NOT Happen

- **DO NOT skip agents and implement the story yourself** — you are the orchestrator
- **DO NOT skip the reviewer** — every implementation gets reviewed
- **DO NOT skip the tester** — every implementation gets tested
- **DO NOT use a single agent for everything** — separate agents ensure focused, high-quality work
- **DO NOT ask "would you like to use agent teams?"** — agent teams are mandatory, not optional

---

## Integration with Hooks

When `--auto` mode is enabled, hooks from `.sixty/hooks.json` are applied:

```json
{
  "lifecycle": {
    "onStoryComplete": {
      "continue": true,
      "commit": true
    },
    "onFeatureComplete": {
      "notify": true,
      "channel": "slack"
    }
  },
  "errorHandling": {
    "onQualityGateFail": {
      "action": "retry",
      "maxRetries": 2
    }
  }
}
```

See `60/hooks` documentation for full configuration.

---

## Next Steps

After execution:

```bash
# Check overall progress
60/status

# See what's blocked
60/status --blocked

# Continue with next feature
60/plan --feature "next-feature"
60/run
```
