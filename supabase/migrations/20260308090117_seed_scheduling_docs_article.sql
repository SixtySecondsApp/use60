-- Migration: seed_scheduling_docs_article
-- Date: 20260308090117
--
-- What this migration does:
--   Seeds a docs_articles row for the Agent Scheduling feature
--   so the in-app /docs page and HelpPanel display user documentation.
--
-- Rollback strategy:
--   DELETE FROM docs_articles WHERE slug = 'scheduling-overview';

INSERT INTO docs_articles (slug, title, category, content, published, metadata, order_index)
VALUES (
  'scheduling-overview',
  'Agent Scheduling',
  'Core Features',
  $DOC$# Agent Scheduling

Set up recurring AI agent jobs that run on autopilot — pipeline briefs every morning, follow-up checks every afternoon, weekly reviews on Monday. You focus on selling; 60 handles the admin.

## Quick Start

1. Go to **Platform → Agent Team Settings → Schedules** tab.
2. Click one of the **Quick Add** templates (Morning Pipeline Brief, Afternoon Follow-up Check, or Weekly Pipeline Review).
3. Toggle the schedule **Active** — it starts running automatically.

That's it. Results are delivered to your chosen channel (in-app notification or Slack).

:::tip
Start with the Morning Pipeline Brief. It gives you a 2-minute summary of your top deals, at-risk opportunities, and follow-ups due today — delivered before your first coffee.
:::

## Creating a Custom Schedule

1. Pick the **Agent** you want to run (Pipeline Manager, Outreach, Research, etc.).
2. Set the **Frequency** — choose a preset (Hourly, Daily, Weekdays, Weekly) or write a custom cron expression.
3. Set the **Time** — this is in your local timezone. The system converts it to UTC automatically.
4. Choose a **Delivery Channel** — In-App Notification or Slack.
5. Set the **Autonomy Level** (see below).
6. Write a **Prompt Template** — tell the agent exactly what you want.
7. Click **Add Schedule**.

## Autonomy Levels

Every schedule has a permission mode that controls how much the agent can do on its own:

| Mode | What happens |
|------|-------------|
| **Suggest** | The agent runs and prepares results, but does NOT deliver them automatically. You'll get a notification to review and approve before anything is sent. Best for new schedules you want to validate first. |
| **Approve** | Results are delivered to you, but the agent cannot take external actions (send emails, update CRM) without your approval. Good for agents you trust to generate content but want to gate actions. |
| **Auto** | Full autonomous execution. The agent runs, delivers results, and can take actions without asking. Use this for schedules you've validated and trust completely. |

:::info
We recommend starting with **Suggest** mode for any new schedule. Once you've reviewed a few runs and are happy with the quality, upgrade to **Approve** or **Auto**.
:::

## Editing a Schedule

Click the **pencil icon** on any schedule row to edit its agent, frequency, prompt, delivery channel, or autonomy level. Changes take effect on the next run.

## Run History

The **Run History** tab shows every execution with:

- **Status** — Success, Failed, Skipped, or Catch-up
- **Duration** — How long the agent took
- **Delivery** — Whether the result was delivered and via which channel
- **Response** — Click any row to expand and read the full agent response

Use the filter dropdown to view history for a specific schedule.

## Catch-Up Runs

If the system was temporarily unavailable and a schedule was missed, 60 automatically runs a **catch-up** within 7 days. Catch-up runs are tagged in the history so you can tell them apart from regular runs.

## Frequency Presets

| Preset | Runs at |
|--------|---------|
| Manual | Only when you click "Run Now" |
| Hourly | Every hour at the minute you choose |
| Daily | Once per day at your chosen time |
| Weekdays | Monday–Friday at your chosen time |
| Weekly | Once per week on your chosen day and time |
| Custom cron | Any schedule using a 5-field cron expression |

:::tip
Not sure about cron syntax? Use the preset dropdowns — they build the cron expression for you. You'll see a plain-English summary below the picker (e.g., "Weekdays at 9:00 AM EST").
:::

## Running a Schedule Manually

Click the **play button** on any schedule to run it immediately, regardless of its cron timing. This is useful for testing a new schedule or getting an instant report.

## Templates

Three pre-built templates are available via Quick Add:

- **Morning Pipeline Brief** — Pipeline agent summarises your top deals, at-risk opportunities, and today's follow-ups. Runs weekdays at 9am.
- **Afternoon Follow-up Check** — Outreach agent identifies contacts who haven't been contacted in 7+ days and drafts follow-up suggestions. Runs weekdays at 2pm.
- **Weekly Pipeline Review** — Pipeline agent prepares a comprehensive weekly review with stage movements, stale deals, and recommended actions. Runs Monday at 9am.

## Troubleshooting

**Schedule isn't running?**
- Check the schedule is toggled **Active** (green switch).
- Verify the agent is **enabled** in the Configuration tab.
- Check the **Run History** tab for error messages.
- If using a custom cron, make sure it's a valid 5-field expression.

**Results not being delivered?**
- If the autonomy level is **Suggest**, results are held for review — check your notifications.
- For Slack delivery, verify your Slack integration is connected in **Integrations**.
- Check Run History — the "Delivered" column shows whether delivery succeeded.

**Getting duplicate runs?**
- This can happen if the same schedule is added twice. Check your schedules list for duplicates.
$DOC$,
  true,
  jsonb_build_object(
    'target_roles', '["admin", "member", "owner"]'::jsonb,
    'target_audience', '["internal", "external"]'::jsonb,
    'required_integrations', ARRAY[]::text[]
  ),
  50
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  metadata = EXCLUDED.metadata,
  published = EXCLUDED.published,
  updated_at = now();
