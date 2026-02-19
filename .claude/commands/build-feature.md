---
requires-profile: true
---

# /build-feature — Generate a PRD, create prd.json, and sync to AI Dev Hub

I want to build: $ARGUMENTS

---

## STEP 0: Select Model Profile

Before proceeding, ask the user to select which model profile to use:
- **Economy** — Fastest, lowest cost
- **Balanced** — Good balance of speed & accuracy
- **Thorough** — Most accurate, highest cost

Use the `AskUserQuestion` tool with these options.

**Note**: Based on selection, appropriate models will be assigned:
- Economy: Fast iteration, familiar patterns
- Balanced: Regular PRD development
- Thorough: Complex features, strategic decisions

---

Act as an expert product consultant helping define a feature. Ask me meaningful questions, one by one, until you have enough information to create a complete PRD. Then execute the full workflow.

---

## RULES (Consult-style)

1. Ask **ONE focused question** at a time
2. Wait for my answer before asking the next question
3. Keep questions relevant and purposeful — don't ask what you can infer
4. Stop asking when you have sufficient context (typically 3–7 questions)
5. Before executing, briefly **confirm your understanding** of the goal
6. Execute with precision based on gathered context

---

## HOOKS (Claude-level configuration)

This command is hook-aware. Hooks are configured at the Claude settings level (not in a repo file).

**Preflight behavior:**
- At command start, check if hook configuration is available.
- If hooks are unavailable or fail to load, log a warning and continue.
- Hook failures are **never blocking** — the command always proceeds.

**Build hook events emitted:**
| Event | Payload | When |
|-------|---------|------|
| `build.onStart` | `{ timestamp }` | Command begins |
| `build.onQuestionsComplete` | `{ runSlug, storyCount }` | After questions answered |
| `build.onPrdCreated` | `{ runSlug, prdPath, storyCount }` | After PRD + prd.json written |
| `build.onDevHubSynced` | `{ runSlug, createdTaskCount }` | After AI Dev Hub tasks created |
| `build.onComplete` | `{ runSlug, storyCount }` | Command finishes successfully |
| `build.onFailed` | `{ error }` | Command fails |

---

## Questions to consider asking (pick the most relevant)

- What problem does this feature solve?
- Who is the primary user?
- What are the key user actions / flows?
- What is the scope boundary (what should it NOT do)?
- Are there existing patterns/components to reuse?
- Any hard technical constraints (integrations, schema changes)?
- How will we know it's done (success criteria)?

---

## EXECUTION (after questions answered)

### Step 0: Hook preflight

1. Emit `build.onStart` event with timestamp.
2. If hook system is unavailable, log: `⚠️ Hooks unavailable — continuing without hook events.`
3. Continue to Step 1 regardless of hook status.

### Step 1: Archive previous run (if exists)

Check if repo-root `prd.json` and `progress.txt` exist from a prior run.

If they exist:
1. Derive `previousRunSlug` from the existing `prd.json.project` or `prd.json.branchName` (kebab-case).
2. Create archive folder: `archive/YYYY-MM-DD-<previousRunSlug>/`
3. Copy `prd.json`, `progress.txt`, and any matching `tasks/prd-*.md` into the archive.
4. Log: "Archived previous run to archive/..."

### Step 2: Derive runSlug for new run

From the feature name/title discussed, derive a `runSlug` (kebab-case, e.g., `notification-center`).

### Step 3: Generate PRD markdown

Write the PRD to: `tasks/prd-<runSlug>.md`

**PRD Structure:**
```markdown
# PRD: <Feature Title>

## Introduction
Brief description of the feature and the problem it solves.

## Goals
- Specific, measurable objectives (bullet list)

## User Stories

### US-001: <Title>
**Description:** As a [user], I want [feature] so that [benefit].

**Acceptance Criteria:**
- [ ] Specific verifiable criterion
- [ ] Another criterion
- [ ] Typecheck passes
- [ ] **[UI stories only]** Verify in browser on localhost:5175

(Repeat for each story)

## Functional Requirements
- FR-1: The system must...
- FR-2: When a user clicks X...

## Non-Goals (Out of Scope)
- What this feature will NOT include

## Technical Considerations
- Schema changes needed
- Integrations affected
- Performance requirements

## Success Metrics
- How success will be measured
```

**Critical PRD rules:**
- Each story must be **completable in one iteration** (small scope)
- Acceptance criteria must be **verifiable** (not vague)
- Every story ends with: `Typecheck passes`
- UI stories include: `Verify in browser on localhost:5175`

### Step 4: Generate prd.json

Write to repo-root `prd.json`:

```json
{
  "project": "<Feature Title>",
  "runSlug": "<runSlug>",
  "branchName": "feature/<runSlug>",
  "description": "<Brief description>",
  "aiDevHubProjectId": null,
  "createdAt": "<ISO timestamp>",
  "userStories": [
    {
      "id": "US-001",
      "title": "<Story title>",
      "description": "As a [user], I want [feature] so that [benefit]",
      "acceptanceCriteria": [
        "Criterion 1",
        "Criterion 2",
        "Typecheck passes"
      ],
      "priority": 1,
      "passes": false,
      "notes": "",
      "aiDevHubTaskId": null
    }
  ]
}
```

### Step 5: Initialize/reset progress.txt

Write to repo-root `progress.txt`:

```
# Progress Log
Run: <runSlug>
Started: <timestamp>

## Codebase Patterns
(Add reusable patterns/gotchas discovered during implementation)

---
```

### Step 6: Select Dev Hub Project + Create Tasks

#### Step 6a: Select Dev Hub Project

If `prd.json.aiDevHubProjectId` is `null`:
1. Check if AI Dev Hub MCP tools are available (call `search_projects` with keyword from feature name or "use60")
2. If MCP unavailable, log `⚠️ AI Dev Hub MCP unavailable — skipping Dev Hub sync.` and continue to Step 7
3. Present discovered projects to user as numbered list using `AskUserQuestion`:
   - `1. <Project Name> (id: <id>)`
   - `2. <Project Name> (id: <id>)`
   - `[Skip] No Dev Hub sync`
4. Store selected project ID in `prd.json.aiDevHubProjectId` (or leave `null` if skipped)

#### Step 6b: Create Tasks

**Skip entirely if `aiDevHubProjectId` is `null`.**

For each story in `prd.json.userStories`:

1. Call AI Dev Hub MCP to create a task:
   - Project ID: from `prd.json.aiDevHubProjectId`
   - Title: `[<runSlug>] <storyId>: <Story Title>`
   - Description: Story description + acceptance criteria formatted as checklist
   - Type: `"feature"`
   - Status: `"todo"`
   - Priority: mapped from story priority (1-3 → `"high"`, 4-7 → `"medium"`, 8+ → `"low"`)

2. Store the returned `taskId` into `prd.json.userStories[i].aiDevHubTaskId`

3. If individual task creation fails, set `aiDevHubTaskId: null`, log warning, and continue (never block)

4. Write updated `prd.json` back to disk after all tasks processed.

### Step 7: Output summary

Emit `build.onComplete` event with `{ runSlug, storyCount }`.

Print:
```
✅ Feature PRD created successfully!

📄 PRD: tasks/prd-<runSlug>.md
📋 Task list: prd.json (<N> stories)
🎫 Dev Hub: <N tasks created in "<project name>" | skipped (no project selected) | unavailable>
🔗 Hooks: <executed | unavailable>

🚀 Next: Run `/continue-feature 10` to start implementing stories.
```

If any step failed, emit `build.onFailed` event with `{ error }` instead.

---

## use60 Tech Stack Reference

When generating stories, remember this project uses:
- **Frontend**: React 18 + Vite (localhost:5175)
- **Backend**: Supabase (Postgres + Edge Functions in Deno)
- **State**: React Query (server) + Zustand (client)
- **UI**: Radix primitives in `src/components/ui/`
- **Auth**: Supabase Auth or Clerk (dual support)
- **Quality gates**: `npm run build:check:strict`, `npm run lint`, `npm run test:run`

**Database gotchas:**
- `meetings` uses `owner_user_id` (not `user_id`)
- Use `maybeSingle()` when record might not exist
- Edge functions: explicit column selection (no `select('*')`)
