---
name: 60-prd
invoke: /60/prd
description: Generate a Product Requirements Document with user stories, acceptance criteria, and prd.json
---

# /60/prd — Generate a Product Requirements Document

**Phase 2 of `/60/ship` pipeline. Also works standalone.**

I want to create a PRD for: $ARGUMENTS

---

## PIPELINE INTEGRATION

When called from `/60/ship`:
1. Read `.sixty/pipeline.json` for DISCOVER phase findings (research agents, gap answers, team composition)
2. Ground the PRD in actual codebase analysis — reference specific files, existing components, patterns found by scouts
3. Write stories to `pipeline.json.stories[]` instead of (or in addition to) legacy `prd.json`
4. Set `pipeline.json.phaseGates.define.status = "complete"` when done

When called standalone:
1. Falls back to legacy behavior — creates `prd.json` at repo root
2. If `.sixty/pipeline.json` exists, also update it
3. If no pipeline.json, works exactly as before

---

Act as an expert product consultant. Ask me meaningful questions, one by one, until you have enough information to create a complete, actionable PRD. Then generate the PRD.

---

## RULES (Consult-style)

1. Ask **ONE focused question** at a time
2. Wait for my answer before asking the next question
3. Keep questions relevant and purposeful — don't ask what you can infer
4. Stop asking when you have sufficient context (typically 3–7 questions)
5. Before executing, briefly **confirm your understanding** of the goal
6. Execute with precision based on gathered context

---

## QUESTION BANK (choose the most relevant)

**Problem & Goal:**
- What problem does this feature solve?
- What is the primary goal or outcome?

**Users:**
- Who is the primary user?
- Are there secondary users or stakeholders?

**Scope:**
- What are the key user actions / flows?
- What should this feature NOT do? (scope boundaries)

**Technical:**
- Are there existing patterns/components to reuse?
- Any schema changes or integrations needed?
- Any hard constraints (performance, security, etc.)?

**Success:**
- How will we know it's done?
- What metrics define success?

---

## EXECUTION (after questions answered)

### Step 1: Derive runSlug

From the feature name/title, derive a `runSlug` (kebab-case).
Example: "Notification Center" → `notification-center`

### Step 2: Generate PRD markdown

Write to: `tasks/prd-<runSlug>.md`

```markdown
# PRD: <Feature Title>

## Introduction

Brief description of the feature and the problem it solves.

## Goals

- Specific, measurable objective 1
- Specific, measurable objective 2
- ...

## User Stories

### US-001: <Title>
**Description:** As a [user], I want [feature] so that [benefit].

**Acceptance Criteria:**
- [ ] Specific verifiable criterion
- [ ] Another criterion
- [ ] Typecheck passes
- [ ] **[UI stories only]** Verify in browser on localhost:5175

### US-002: <Title>
**Description:** As a [user], I want [feature] so that [benefit].

**Acceptance Criteria:**
- [ ] ...
- [ ] Typecheck passes

(Continue for all stories)

## Functional Requirements

- FR-1: The system must...
- FR-2: When a user clicks X, the system must...

## Non-Goals (Out of Scope)

- What this feature will NOT include
- Explicit boundaries

## Technical Considerations

- Schema changes needed (if any)
- Integrations affected
- Performance requirements
- Existing patterns to follow

## Success Metrics

- How success will be measured
- Quantitative targets if applicable

## Open Questions

- Any remaining questions or areas needing clarification
```

### Step 3: Generate prd.json / Update pipeline.json

**If `.sixty/pipeline.json` exists** (called from /60/ship):
- Write stories to `pipeline.json.stories[]` using the pipeline schema (see /60/ship)
- Each story gets: `id`, `title`, `type`, `status`, `priority`, `dependencies`, `acceptance`, `visibility`, `testFiles`
- Set `pipeline.json.prdFile` to the PRD markdown path
- Also write legacy `prd.json` for backwards compatibility

**If no pipeline.json** (standalone):
Write to repo-root `prd.json`:

```json
{
  "project": "<Feature Title>",
  "runSlug": "<runSlug>",
  "branchName": "feature/<runSlug>",
  "description": "<Brief description from PRD intro>",
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
    },
    {
      "id": "US-002",
      "title": "<Story title>",
      "description": "...",
      "acceptanceCriteria": ["..."],
      "priority": 2,
      "passes": false,
      "notes": "",
      "aiDevHubTaskId": null
    }
  ]
}
```

### Step 3.5: Sync to AI Dev Hub

Run `/60/sync` to create ONE parent ticket with subtasks in Dev Hub.
Handles project selection, duplicate checking, and human-readable ticket creation.

See `.claude/commands/60/sync.md` for the full protocol.

**Key rules (enforced by /60/sync):**
- ONE parent ticket per PRD, stories become subtasks
- Always deduplicate against existing project tasks first
- Write titles a PM would write, not robotic prefixes
- Link to existing tickets instead of creating duplicates

### Step 4: Initialize progress.txt (if missing)

If repo-root `progress.txt` doesn't exist, create it:

```
# Progress Log
Run: <runSlug>
Started: <timestamp>

## Codebase Patterns
(Add reusable patterns/gotchas discovered during implementation)

---
```

### Step 5: Output summary

```
✅ PRD generated successfully!

📄 PRD: tasks/prd-<runSlug>.md
📋 Task list: prd.json (<N> stories)
🎫 Dev Hub: <N tasks created | skipped (no project selected) | unavailable>

Stories created:
- US-001: <title>
- US-002: <title>
- ...

Next steps:
1. Run `/60/ship --resume` to continue the pipeline
2. Or run `/60/run --all` to start implementing stories directly
```

---

## STORY SIZING RULES

Each story must be **completable in one iteration**. Right-sized stories:
- Add a database column and migration
- Add a UI component to an existing page
- Update a service with new logic
- Add a filter dropdown to a list

**Too big (split these):**
- "Build the entire dashboard"
- "Add authentication"
- "Refactor the API"

**Rule of thumb:** If you can't describe the change in 2–3 sentences, it's too big.

---

## STORY ORDERING

Stories must be ordered by dependency:
1. Schema/database changes (migrations)
2. Backend logic (services, edge functions)
3. UI components that use the backend
4. Dashboard/summary views that aggregate data

---

## ACCEPTANCE CRITERIA RULES

Criteria must be **verifiable**, not vague.

**Good:**
- "Add `status` column to tasks table with default 'pending'"
- "Filter dropdown has options: All, Active, Completed"
- "Clicking delete shows confirmation dialog"
- "Typecheck passes"

**Bad:**
- "Works correctly"
- "User can do X easily"
- "Good UX"
- "Handles edge cases"

**Always include:**
- `Typecheck passes` (every story)
- `Verify in browser on localhost:5175` (UI stories)

---

## use60 TECH STACK REFERENCE

- **Frontend**: React 18 + Vite (localhost:5175)
- **Backend**: Supabase (Postgres + Edge Functions in Deno)
- **State**: React Query (server) + Zustand (client)
- **UI**: Radix primitives in `src/components/ui/`
- **Auth**: Supabase Auth or Clerk (dual support)

**Database gotchas:**
- `meetings` uses `owner_user_id` (not `user_id`)
- Use `maybeSingle()` when record might not exist
- Edge functions: explicit column selection (no `select('*')`)
