---
requires-profile: true
---

# /continue-feature — Execute stories from prd.json (Ralph-style loop)

**Iterations requested:** $ARGUMENTS (default: 10)

---

## STEP 0: Select Model Profile

Before proceeding, ask the user to select which model profile to use:
- **Economy** — Fastest, lowest cost
- **Balanced** — Good balance of speed & accuracy
- **Thorough** — Most accurate, highest cost

Use the `AskUserQuestion` tool with these options.

**Note**: Based on selection, appropriate models will be assigned:
- Economy: Quick implementations, small stories
- Balanced: Regular feature development, typical stories
- Thorough: Complex logic, multi-system changes

---

Execute up to N iterations, completing one user story per iteration from `prd.json`.

---

## HOOKS (Claude-level configuration)

This command is hook-aware. Hooks are configured at the Claude settings level (not in a repo file).

**Preflight behavior:**
- At command start, check if hook configuration is available.
- If hooks are unavailable or fail to load, log a warning and continue.
- Hook failures are **never blocking** — the command always proceeds.

**Continue hook events emitted:**
| Event | Payload | When |
|-------|---------|------|
| `continue.onStart` | `{ runSlug, iterationCount }` | Loop begins |
| `story.onStart` | `{ storyId, title }` | Story implementation starts |
| `story.onQualityGatesStart` | `{ storyId }` | Quality gates begin |
| `story.onQualityGatesPass` | `{ storyId }` | All gates pass |
| `story.onQualityGatesFail` | `{ storyId, error, retryCount }` | Gate fails |
| `story.onComplete` | `{ storyId, filesChanged }` | Story done successfully |
| `story.onBlocked` | `{ storyId, reason }` | Story marked blocked |
| `continue.onComplete` | `{ completedCount, remainingCount }` | Loop ends |

**Session limits (hook-configured):**
- `maxStoriesPerSession`: Stop after N stories (default: 10, from $ARGUMENTS).
- `maxHoursPerSession`: Stop after N hours (default: none).

---

## LOOP WORKFLOW

### Step 0: Hook preflight

1. Emit `continue.onStart` event with runSlug (if known) and iterationCount.
2. If hook system is unavailable, log: `⚠️ Hooks unavailable — continuing without hook events.`
3. If session limits are configured, enforce them throughout the loop.
4. Continue to Step 1 regardless of hook status.

For each iteration (up to the requested count):

### Step 1: Load prd.json

Read repo-root `prd.json`. If it doesn't exist, stop with error:
```
❌ No prd.json found. Run /build-feature first to create a PRD.
```

### Step 2: Read progress.txt Codebase Patterns

Read repo-root `progress.txt` and review the `## Codebase Patterns` section before starting. Apply any learned patterns/gotchas.

### Step 3: Pick the next story

Find the **lowest `priority`** story where `passes: false`.

If no stories remain with `passes: false`:
```
✅ All stories complete! Feature implementation finished.
```
Stop the loop.

If the story looks too big to complete in one iteration, **split it**:
1. Break it into 2–3 smaller stories in `prd.json`
2. Create AI Dev Hub tasks for the new stories
3. Re-run this command

### Step 4: Update AI Dev Hub task → in_progress

**Skip entirely if `prd.json.aiDevHubProjectId` is `null` or Dev Hub MCP is unavailable.**

If `aiDevHubTaskId` is null but `aiDevHubProjectId` exists, lazy-create the task:
- Project ID: from `prd.json.aiDevHubProjectId`
- Title: `[<runSlug>] <storyId>: <title>`
- Type: `"feature"`
- Status: `"in_progress"`
- Priority: mapped from story priority (1-3 → `"high"`, 4-7 → `"medium"`, 8+ → `"low"`)
- Store the returned taskId in `prd.json`

If `aiDevHubTaskId` exists, update status to `"in_progress"`.

If create/update fails, log warning and continue (never block execution).

### Step 5: Implement the story

Follow **use60 patterns** while implementing:

**Frontend:**
- React Query for server data, Zustand for UI state
- Prefer existing components in `src/components/ui/`
- Show errors via `toast.error()` (sonner)

**Backend/Supabase:**
- Never expose service role keys to frontend
- Edge functions are **Deno** (`supabase/functions/*`)
- Avoid `select('*')` in edge functions
- Use `maybeSingle()` when record might not exist
- Verify user column names (`meetings.owner_user_id` vs `user_id`)

**Service Locator:**
```typescript
const { dealService, activityService } = useServices();
```

### Step 6: Run quality gates (tiered for speed)

Emit `story.onQualityGatesStart` event.

**CRITICAL:** For rapid iteration, rely on IDE real-time checking. Only run CLI gates that complete in <30 seconds.

#### Gate 1: Lint changed files (~5-15s) — ALWAYS RUN
```bash
CHANGED=$(git diff --name-only HEAD~1 -- '*.ts' '*.tsx' | tr '\n' ' ')
if [ -n "$CHANGED" ]; then
  npx eslint $CHANGED --max-warnings 0 --quiet  # --quiet shows only errors
fi
```
**Note:** Pre-existing warnings are OK. Only fail on NEW errors from this story.

#### Gate 2: Tests for changed files (~5-30s) — ALWAYS RUN
```bash
npx vitest run --changed HEAD~1 --passWithNoTests
```

#### Gate 3: Type check — SKIP (rely on IDE)
**DO NOT RUN** `tsc --noEmit` or `build:check:strict` every story — takes 3+ min on this codebase.

Instead:
- Trust IDE real-time TypeScript errors (red squiggles)
- If IDE shows no errors in changed files, gate passes
- Run full type check only on **final story**

#### Full validation — FINAL STORY ONLY or `fullValidation: true`
```bash
npm run build:check:strict  # Full TypeScript (~3-5 min)
npm run lint                # Full ESLint
npm run test:run            # All unit tests
```

**For UI stories:**
- Quick visual spot-check on `localhost:5175` (30 sec max)
- If it looks right, it passes
- E2E: Skip unless `e2e: true` or final story

**Time budget:**
- Ultra-fast path (Gate 1-2): ~15-30 seconds
- Full validation (final story): ~5 minutes

**Hook-configured retry behavior (if available):**

If quality gates fail and hooks specify retry behavior:
1. Attempt auto-fix if configured (e.g., `npm run lint -- --fix`).
2. Re-run failing gate(s) up to `maxRetries` (default: 1).
3. Emit `story.onQualityGatesFail` with `{ storyId, error, retryCount }` on each failure.
4. If retries exhausted, follow `fallback` action:
   - `"pause"`: Stop the loop and report (default behavior).
   - `"mark-blocked"`: Mark story blocked and continue to next story.

If hooks are unavailable, use default behavior: stop on first failure.

### Step 7: Handle result

**If ALL gates pass:**

1. Set `passes: true` in `prd.json` for this story
2. Add any notes/learnings to `prd.json.userStories[i].notes`
3. Append to `progress.txt`:
   ```
   ## YYYY-MM-DD HH:MM - <storyId>
   - What was implemented: <summary>
   - Files changed: <list>
   - Quality gates:
     - build:check:strict: PASS
     - lint: PASS
     - tests: PASS
     - browser verification: PASS (if UI)
   - Learnings:
     - <any patterns/gotchas discovered>
   ---
   ```
4. If a reusable pattern was discovered, add it to the `## Codebase Patterns` section at the TOP of `progress.txt`
5. Update AI Dev Hub task (if `aiDevHubTaskId` exists and Dev Hub is available):
   - Try `update_task` with status `"in review"`
   - If API error (known bug), keep status as `"in progress"` and add comment via `create_comment`: `"[STATUS] Story completed — ready for review"`
   - Add completion comment via `create_comment`: Summary of implementation + files changed + gates passed
   - Log: `Dev Hub: task updated` or `Dev Hub: status update failed (known API bug) — added comment instead`
   - **Dev Hub failures are non-blocking** — log and continue
6. **Commit** per the commit policy (see COMMIT FORMAT & POLICY section):
   - Unattended: auto-commit with message `feat: <storyId> - <Story Title>`
   - Interactive: ask before committing
7. Emit `story.onComplete` event with `{ storyId, filesChanged }`.

**If gates FAIL:**

1. Keep `passes: false`
2. Update AI Dev Hub task (if `aiDevHubTaskId` exists and Dev Hub is available):
   - Try `update_task` with status `"blocked"`
   - If API error, keep status and add comment via `create_comment`: `"[STATUS] Blocked — <error summary>"`
   - Add comment with error details + what needs to be fixed
   - **Dev Hub failures are non-blocking** — log and continue
3. Append failure note to `progress.txt`
4. Stop the loop and report:
   ```
   ❌ Story <storyId> failed quality gates.
   
   Error: <error details>
   
   Fix the issue and run `/continue-feature` again.
   ```

### Step 8: Continue or stop

After completing a story successfully:
- Decrement remaining iterations
- If iterations remain and stories remain, continue to next iteration
- Otherwise, stop and report progress

---

## END OF LOOP SUMMARY

Emit `continue.onComplete` event with `{ completedCount, remainingCount }`.

After the loop ends (or all stories complete), print:

```
📊 Progress Report
━━━━━━━━━━━━━━━━━━

Stories completed this run: X
Total stories: Y
Remaining: Z

Commits made: N
🔗 Hooks: <executed | unavailable>

🎫 AI Dev Hub tasks updated

Next steps:
- Run `/continue-feature <N>` to continue
- Or review and merge the changes
```

---

## COMMIT FORMAT & POLICY

**Commit policy (hook-aware):**
- **Unattended runs** (e.g., automated loops, background execution): Auto-commit on successful story completion.
- **Interactive runs** (user is present): Ask before committing unless explicitly instructed otherwise.

To determine run mode:
- If the command was invoked with an iteration count > 1 and no user interaction occurred, treat as unattended.
- If hooks indicate `autoConfirm.storyComplete = true`, treat as unattended.
- Otherwise, treat as interactive.

**Commit message format:**
```
feat: <storyId> - <Story Title>
```

Examples:
- `feat: US-001 - Add priority field to database`
- `feat: US-002 - Display priority badge on task cards`

---

## ERROR RECOVERY

**If prd.json is missing:**
- Stop and instruct to run `/build-feature` first

**If AI Dev Hub MCP fails:**
- Log warning but continue with local implementation
- Mark aiDevHubTaskId as `"sync_failed"` in notes

**If git commit fails:**
- Log error and continue (don't block on commit failures)
- Note in progress.txt that commit was skipped

---

## QUALITY GATE COMMANDS

### Fast gates (use for most stories)
```bash
# Tier 1: Quick type check
npx tsc --noEmit --skipLibCheck

# Tier 2: Lint only changed files
CHANGED=$(git diff --name-only HEAD~1 -- '*.ts' '*.tsx' | tr '\n' ' ')
[ -n "$CHANGED" ] && npx eslint $CHANGED --max-warnings 0

# Tier 3: Tests for changed files only
npx vitest run --changed HEAD~1 --passWithNoTests
```

### Full gates (final story or fullValidation: true)
```bash
# TypeScript strict check + build
npm run build:check:strict

# ESLint (must be 0 warnings)
npm run lint

# Unit tests
npm run test:run

# E2E tests (only if e2e: true or final story)
npm run test:e2e
```

---

## FILES MODIFIED EACH ITERATION

- `prd.json` — update story status + notes + aiDevHubTaskId
- `progress.txt` — append completion log + update patterns
- Source files — the actual implementation
- Git — auto-commit on success
