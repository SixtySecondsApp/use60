---
name: 60-sync
invoke: /60/sync
description: Dev Hub ticket sync + git branch creation + Slack war room posting
---

# /60/sync — Dev Hub + Git + Slack Synchronization

**Purpose**: Create Dev Hub parent ticket + subtasks, create git branch, post plan to Slack war room. Phase 4 of `/60/ship`. Replaces `/dev-hub-sync`.

**Input**: $ARGUMENTS

---

## PHILOSOPHY

Tickets are for humans. Every ticket should read like a brief written by a sharp PM — not an auto-generated dump. One parent ticket tells the story. Subtasks break down the work. Duplicates get caught before they pollute the board.

---

## RULES

1. **One parent ticket per pipeline run.** The parent IS the PRD — context, scope, the why.
2. **Stories become subtasks.** Short, scannable, human-written.
3. **Deduplicate before creating.** Search existing tasks first. Link, don't duplicate.
4. **Write for humans.** No `[runSlug] US-001:` prefixes. Titles a PM would write.
5. **Link, don't duplicate.** Overlapping story? Mark `deduped`, reference existing ticket.

---

## STEP 1: Validate Pipeline State

Read `.sixty/pipeline.json`. Confirm:
- `project` (feature name)
- `runSlug`
- `stories[]` array with at least 1 story
- Phase is at least PLAN complete

If pipeline.json missing, check for legacy `prd.json` at repo root and migrate.

---

## STEP 2: Select Dev Hub Project

If `pipeline.json.devHub.projectId` is set, use it. Otherwise:

1. Call `search_projects` with keywords from the project name
2. Present matches to the user via `AskUserQuestion`:
   ```
   1. <Project Name> (<code>) — <health>
   2. <Project Name> (<code>) — <health>
   [Skip] No Dev Hub sync
   ```
3. Store selected ID in `pipeline.json.devHub.projectId`
4. If skipped, log and continue without Dev Hub sync

---

## STEP 3: Duplicate Check

Search existing tasks in the selected project:

1. Call `search_tasks` with keywords from each story title
2. Build duplicate map — does an existing task cover the same scope?
3. If called from `/60/ship` (auto-flow), auto-deduplicate obvious matches:
   - Exact title match → auto-dedup
   - 80%+ overlap in description → flag but auto-dedup
   - Partial overlap → note in subtask description, create anyway
4. For deduped stories, set in pipeline.json:
   - `status: "skipped"`
   - `notes: "Covered by <existing ticket code>"`

---

## STEP 4: Create Parent Ticket

Create ONE task in Dev Hub as the parent:

**Title**: `PRD: <Feature Title>`

**Description** (write like a human PM):
```
<2-3 sentence summary of what this covers and why it matters>

## Scope
<Bulleted list of what's IN scope — plain English>

## Stories
<Numbered list with one-line descriptions>
- US-001: <plain English summary>
- US-002: <plain English summary>

## Out of Scope
<What this explicitly does NOT cover>

## Deduped
<Stories skipped because existing tickets cover them>

## Team
<Auto-composed team tier and reasoning>

## Links
- Pipeline: .sixty/pipeline.json
- PRD: tasks/prd-<runSlug>.md
- Branch: feature/<runSlug>
```

**Fields:**
- `type`: "feature"
- `status`: "todo"
- `priority`: from highest-priority story

Store returned task ID in `pipeline.json.devHub.taskId` and code in `pipeline.json.devHub.taskCode`.

---

## STEP 5: Create Subtasks

For each non-deduped story, create a subtask under the parent ticket.

**Subtask title format — write like a human:**

DO NOT write: `[billing-portal] US-001: Create invoices table migration`

DO write: `US-001: Invoice schema — create table with Stripe refs, amounts, status, and RLS`

**Rules for subtask titles:**
- Start with story ID (US-001, INV-001, etc.)
- Plain English summary of the deliverable
- Key technical detail after a dash
- Under 150 characters
- No brackets, slugs, or robotic prefixes

Store returned subtask IDs in `pipeline.json.stories[i].aiDevHubSubtaskId`.

---

## STEP 6: Create Git Branch

```bash
git checkout -b feature/<runSlug>
```

If branch already exists:
```bash
git checkout feature/<runSlug>
```

Store branch name in `pipeline.json.branch`.

---

## STEP 7: Post to Slack War Room

If Slack MCP is available and `pipeline.json.slack.warRoomThreadTs` exists:

Post to the war room thread:
```
Plan ready for: <project>

Stories: N (M deduped)
Team: Tier X — <tier description>
Estimated: X-Y hours
Branch: feature/<runSlug>

Dev Hub: TSK-XXXX — <parent ticket title>
Subtasks: N created

Starting BUILD phase...
```

---

## STEP 8: Update Pipeline State

Write to `.sixty/pipeline.json`:
- `devHub.taskId`, `devHub.taskCode`, `devHub.projectId`
- Each story's `aiDevHubSubtaskId`
- `branch`
- `phaseGates.sync.status = "complete"`

---

## STEP 9: Output Summary

```
Sync complete

  Dev Hub: TSK-XXXX — PRD: <Feature Title>
  Project: <Project Name> (<code>)

  Subtasks created: N
    US-001: <title>
    US-003: <title>

  Deduped: M
    US-004 -> TSK-0534 (existing coverage)

  Branch: feature/<runSlug>
  Slack: war room updated

  Continuing to BUILD...
```

---

## QUALITY CHECKLIST

Before creating any ticket, verify:
- Would a PM be happy reading this title in a standup?
- Does the parent description tell the full story?
- Are subtask titles scannable in a list view?
- Did we check for duplicates?
- Is every ticket traceable back to pipeline.json?

---

## ERROR HANDLING

| Error | Action |
|-------|--------|
| Dev Hub MCP unavailable | Skip ticket sync, log warning, continue |
| search_tasks fails | Skip dedup check, create all tickets |
| create_task fails | Log warning, continue without parent ticket |
| create_subtask fails | Log warning, note which stories lack subtask IDs |
| Git branch create fails | Log error, ask user to resolve |
| Slack MCP unavailable | Terminal output only |
