# Copilot Skills Testing Plan (Frontend)

This plan validates the new **Copilot Skills Router** (3-tool surface) and the **Skill Test Console** UI on the frontend.

## Preconditions
- Migrations applied:
  - `supabase/migrations/20251231000001_expand_platform_skill_categories.sql`
  - `supabase/migrations/20251231000002_seed_copilot_skill_categories.sql`
- Supabase Edge Functions deployed (or running locally via your existing workflow):
  - `api-copilot`
  - `get-agent-skills`
  - `compile-organization-skills` (if your environment requires compilation after seeding)
- You are logged in as a user who is a member of an org in `organization_memberships`.

## What “success” looks like
- Copilot backend exposes **only 3 tools** to Claude: `list_skills`, `get_skill`, `execute_action`.
- Copilot responses return a `tool_executions` trace (already present in `api-copilot`) and it updates correctly as tool calls happen.
- Platform skills admin UI shows the new categories:
  - `data-access`
  - `output-format`
- Seeded skills exist and are retrievable:
  - `get-contact-context`
  - `slack-briefing-format`
- The Skill Test Console can run a test and display:
  - model output
  - tool execution log

## Part A — Platform Skills Admin UI (Categories + Preview/Test)

### A1) Verify category tabs include new categories
1. Navigate to the Platform Skills admin page (existing route).
2. Confirm category tabs include:
   - Sales AI
   - Writing
   - Enrichment
   - Workflows
   - Data Access
   - Output Format

Expected:
- Selecting **Data Access** shows `get-contact-context` (seeded).
- Selecting **Output Format** shows `slack-briefing-format` (seeded).

### A2) Preview seeded skills
1. Click the eye icon to preview `get-contact-context`.
2. Confirm Template/Compiled views render (no UI crash).
3. Repeat for `slack-briefing-format`.

Expected:
- Compiled view interpolates variables (with sample context) and renders markdown.

### A3) Skill Test Console (per skill)
1. Open preview for `get-contact-context`.
2. Switch to the **Test** tab.
3. Use Test input: “Prepare a call brief for Jane Doe at Acme. Fetch context first.”
4. Click **Run**.

Expected:
- Output is returned.
- Tool executions list shows calls like:
  - `get_skill` (for the skill itself)
  - `execute_action` (e.g., `get_contact`, `get_meetings`, `search_emails`) depending on available data
- If there is no data available, output should explicitly say what was missing.

Repeat for `slack-briefing-format`:
- Test input: “Format a Slack briefing for Jane Doe @ Acme using the Slack Briefing Format skill.”

Expected:
- Output resembles Slack Block Kit JSON (or explicitly calls out that it is a Block Kit payload).

## Part B — Copilot Chat UX (Skills Router)

### B1) Basic conversation
1. Open Copilot UI.
2. Prompt: “Prepare me for my call with Jane Doe at Acme tomorrow.”

Expected:
- Copilot calls `list_skills` or directly `get_skill` for a relevant skill.
- Copilot calls `execute_action` to fetch CRM/meetings/emails (if present).
- Final answer is a call brief (talking points, risks, next actions).

### B2) Confirmation gating for writes
1. Prompt: “Update the deal ‘Acme Renewal’ to Closed Won.”

Expected:
- Copilot should not write unless confirmation is present.
- It should respond asking for confirmation (or provide a preview) because `execute_action` write operations require `params.confirm=true`.

### B3) Skill category filtering
1. Prompt: “Show me what skills are available for data access.”

Expected:
- Copilot uses `list_skills({ category: "data-access" })`.
- Returns the list of skills in that category.

## Part C — Negative/Edge Cases

### C1) No org membership
Test with a user not in `organization_memberships`.

Expected:
- Tool calls fail with a clear error: “No organization found for user”.
- Copilot should surface a friendly message to the user (no stack traces).

### C2) Disabled skill retrieval
Disable a compiled skill in onboarding/platform config (existing UI).

Expected:
- `list_skills` with `enabled_only=true` should omit it.
- `get_skill` for that skill should return `null` unless using a mode that allows disabled retrieval.

## Notes for Debugging
- Use the Skill Test Console first; it provides the fastest feedback loop.
- If tool executions aren’t showing, verify the `api-copilot` response includes `tool_executions`.
- If seeded skills don’t appear:
  - confirm migration ran
  - run `compile-organization-skills` for the org (if required in your deployment)

