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
  "aiDevHubProjectId": "cae03d2d-74ac-49e6-9da2-aae2440e0c00",
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

### Step 6: Create AI Dev Hub tasks

For each story in `prd.json.userStories`:

1. Call AI Dev Hub MCP to create a task:
   - Project ID: `cae03d2d-74ac-49e6-9da2-aae2440e0c00`
   - Title: `[<runSlug>] US-XXX: <Story Title>`
   - Description: Story description + acceptance criteria
   - Status: `todo`

2. Store the returned `taskId` into `prd.json.userStories[i].aiDevHubTaskId`

3. Write updated `prd.json` back to disk.

### Step 7: Output summary

Print:
```
✅ Feature PRD created successfully!

📄 PRD: tasks/prd-<runSlug>.md
📋 Task list: prd.json (<N> stories)
🎫 AI Dev Hub: <N> tasks created in project "Use60 - go live"

🚀 Next: Run `/continue-feature 10` to start implementing stories.
```

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
