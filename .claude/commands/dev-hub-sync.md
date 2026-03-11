# /dev-hub-sync — Sync PRD to AI Dev Hub as one ticket with subtasks

> **DEPRECATED**: Use `/60/sync` instead. Same functionality, integrates with pipeline.json, creates git branch, posts to Slack war room. This command still works but will be removed in a future update.

Sync the current `prd.json` to AI Dev Hub. $ARGUMENTS

---

## PHILOSOPHY

Tickets are for humans. Every ticket should read like a brief written by a sharp PM — not an auto-generated dump. One parent ticket tells the story. Subtasks break down the work. Duplicates get caught before they pollute the board.

---

## RULES

1. **One parent ticket per PRD.** Never create individual tickets per story. The parent ticket IS the PRD — it has the context, the scope, the why.
2. **Stories become subtasks.** Each user story is a subtask of the parent ticket. Short, scannable, human-written.
3. **Deduplicate before creating.** Always search existing tasks in the target project first. Flag overlaps. Never create duplicates.
4. **Write for humans.** No `[runSlug] US-001:` prefixes. No copy-pasted acceptance criteria walls. Write titles a PM would write. Add context a dev would need.
5. **Link, don't duplicate.** If a story overlaps with an existing ticket, mark it `deduped` in prd.json and reference the existing ticket ID.

---

## EXECUTION

### Step 1: Validate prd.json exists

Read `prd.json` from repo root. If missing, stop and tell the user to run `/build-feature` or `/60/prd` first.

Confirm:
- `project` (feature name)
- `runSlug`
- `userStories[]` array with at least 1 story

### Step 2: Select Dev Hub Project

If `prd.json.aiDevHubProjectId` is already set, use it. Otherwise:

1. Call `search_projects` with keywords from the feature name
2. Present matches to the user via `AskUserQuestion`:
   - `1. <Project Name> (<code>) — <health status>`
   - `2. <Project Name> (<code>) — <health status>`
   - `[Skip] No Dev Hub sync`
3. Store selected project ID in `prd.json.aiDevHubProjectId`
4. If skipped, stop here with message: "Skipped Dev Hub sync. prd.json is ready for local use."

### Step 3: Duplicate Check

Search existing tasks in the selected project:

1. Call `search_tasks` with `projectId` and keywords from each story title
2. Build a duplicate map — for each story, check if an existing task covers the same scope
3. Present findings to the user:

```
Duplicate Check Results:

  US-001: Nylas Health Check Edge Function
    -> No existing match. Will create.

  US-004: Nylas Message List & Get
    -> OVERLAP with TSK-0534: Nylas Routing in Centralized Client
    -> Recommend: Skip (mark deduped, link to TSK-0534)

  US-007: Webhook Receiver
    -> No existing match. Will create.
```

4. Ask user to confirm which stories to create vs. skip
5. For skipped stories, set in prd.json:
   - `"deduped": true`
   - `"notes": "Covered by <existing ticket code>"`
   - `"aiDevHubTaskId": "<existing task id>"`

### Step 4: Create Parent Ticket

Create ONE task in Dev Hub as the parent:

**Title format:** `PRD: <Feature Title>`

**Description format — write it like a human PM would:**
```
<2-3 sentence summary of what this PRD covers and why it matters>

## Scope
<Bulleted list of what's IN scope — plain English, not acceptance criteria>

## Stories
<Numbered list of stories with one-line descriptions>
- US-001: <plain English summary>
- US-002: <plain English summary>
- ...

## Out of Scope
<What this PRD explicitly does NOT cover>

## Deduped
<Stories skipped because existing tickets cover them, with ticket references>

## Links
- PRD: tasks/prd-<runSlug>.md
- Branch: feature/<runSlug>
```

**Fields:**
- `type`: "feature"
- `status`: "todo"
- `priority`: highest priority from any included story (1-3 = high, 4-7 = medium, 8+ = low)

Store returned task ID in `prd.json.aiDevHubTaskId` and code in `prd.json.aiDevHubTaskCode`.

### Step 5: Create Subtasks

For each NON-deduped story, create a subtask under the parent ticket.

**Subtask title format — write like a human:**

DO NOT write: `[nylas-integration-verification] US-001: Nylas Health Check Edge Function`

DO write: `US-001: Health check edge function — run diagnostic Nylas API calls, return structured pass/fail results`

**Rules for subtask titles:**
- Start with the story ID (US-001, US-002, etc.)
- Follow with a plain English summary of the deliverable
- Include the key technical detail after a dash
- Keep under 150 characters
- No brackets, no slugs, no robotic prefixes

Store returned subtask IDs in `prd.json.userStories[i].aiDevHubSubtaskId`.

### Step 6: Update prd.json

Write the updated prd.json with:
- `aiDevHubProjectId` (if newly selected)
- `aiDevHubTaskId` (parent ticket ID)
- `aiDevHubTaskCode` (parent ticket code, e.g., TSK-0568)
- Each story gets either `aiDevHubSubtaskId` (if created) or `deduped: true` + `aiDevHubTaskId` pointing to the existing ticket

Remove any old `aiDevHubTaskId` fields from individual stories that were migrated to subtasks.

### Step 7: Summary

```
Dev Hub synced successfully!

Parent: TSK-XXXX — PRD: <Feature Title>
Project: <Project Name> (<code>)

Subtasks created (N):
  US-001: <title>
  US-003: <title>
  US-007: <title>
  ...

Deduped (N):
  US-004 -> TSK-0534 (existing coverage)
  US-005 -> TSK-0534 (existing coverage)

prd.json updated with all task references.
```

---

## QUALITY CHECKLIST

Before creating any ticket, mentally verify:

- [ ] Would a PM be happy reading this ticket title in a standup?
- [ ] Does the parent description tell the full story without needing to read subtasks?
- [ ] Are subtask titles scannable in a list view (no walls of text)?
- [ ] Did we check for duplicates and link rather than recreate?
- [ ] Is every ticket traceable back to prd.json?

---

## ANTI-PATTERNS (never do these)

- Creating one ticket per user story as a top-level task
- Copy-pasting full acceptance criteria into ticket titles
- Using `[slug] US-XXX:` robot prefixes in titles
- Creating tickets without searching for existing overlapping work
- Leaving `aiDevHubTaskId: null` on stories that have existing coverage
- Creating tickets with descriptions that are just the acceptance criteria checklist and nothing else
