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

## LOOP WORKFLOW

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

If `aiDevHubTaskId` is null, create the task first:
- Project ID: from `prd.json.aiDevHubProjectId` (or `cae03d2d-74ac-49e6-9da2-aae2440e0c00`)
- Title: `[<runSlug>] <storyId>: <title>`
- Status: `in_progress`
- Store the returned taskId in `prd.json`

If `aiDevHubTaskId` exists, update status to `in_progress`.

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

### Step 6: Run quality gates

Run these commands (all must pass):

```bash
npm run build:check:strict
npm run lint
npm run test:run
```

**For UI stories:**
- Verify in browser on `localhost:5175`
- Run Playwright tests if relevant: `npm run test:e2e`

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
5. Update AI Dev Hub task:
   - Status: `in_review`
   - Add comment: Summary of implementation + files changed + gates passed
6. **Auto-commit** with message: `feat: <storyId> - <Story Title>`

**If gates FAIL:**

1. Keep `passes: false`
2. Update AI Dev Hub task:
   - Status: `blocked`
   - Add comment: Error details + what needs to be fixed
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

After the loop ends (or all stories complete), print:

```
📊 Progress Report
━━━━━━━━━━━━━━━━━━

Stories completed this run: X
Total stories: Y
Remaining: Z

Commits made: N

🎫 AI Dev Hub tasks updated

Next steps:
- Run `/continue-feature <N>` to continue
- Or review and merge the changes
```

---

## COMMIT FORMAT

Auto-commits use this format:
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

```bash
# TypeScript strict check + build
npm run build:check:strict

# ESLint (must be 0 warnings)
npm run lint

# Unit tests
npm run test:run

# E2E tests (for UI stories)
npm run test:e2e
```

---

## FILES MODIFIED EACH ITERATION

- `prd.json` — update story status + notes + aiDevHubTaskId
- `progress.txt` — append completion log + update patterns
- Source files — the actual implementation
- Git — auto-commit on success
