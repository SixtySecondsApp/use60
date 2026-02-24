-- PBUG-016: Documentation audit and content update
-- Updates customer-facing docs to reflect current features as of 2026-02-24
--
-- Slugs updated:
--   customer-getting-started      -> activation checklist, current onboarding flow
--   customer-meeting-intelligence -> Meeting Analytics tabs, date filtering, reports
--   customer-team-analytics       -> redirects to meeting-analytics, date range, tabs
--   meeting-command-centre        -> current post-meeting follow-up features
--   integration-fireflies         -> correct setup path (meeting-settings?tab=fireflies)

-- ---------------------------------------------------------------------------
-- customer-getting-started
-- ---------------------------------------------------------------------------
UPDATE docs_articles
SET content = $DOC$
# Welcome to 60

Welcome{{#if user_first_name}}, {{user_first_name}}{{/if}}! 60 is your meeting intelligence platform -- helping you get more from every conversation.

## What You Can Do

- **Meeting Analytics** -- Transcripts, AI insights, team trends, and automated reports
- **Dashboard** -- KPI metrics, activity log, funnel, heatmap, and lead analytics
- **Integrations** -- Connect your calendar, recording tools, and communication platforms

## Getting Started

Your Dashboard shows an **Activation Checklist** when you first log in. It guides you through six setup steps:

1. **Account Created** -- Your account is ready
2. **Complete Your Profile** -- Add your details and preferences in Settings
3. **Sync Your First Meeting** -- Connect your calendar to start capturing insights
4. **Try Meeting Intelligence** -- Experience AI-powered meeting search and analysis
5. **Integrate Your CRM** -- Connect your sales tools for a seamless workflow
6. **Invite Your Team** -- Collaborate with colleagues and share insights

### Connect Your Calendar

Head to **Settings > Integrations** and connect your Google Calendar. This lets 60 automatically track your meetings and schedule recording bots.

### Set Up Meeting Recording

Go to **Settings > Meeting Settings** to connect a recording provider:

- **60 Notetaker** -- Our built-in bot joins your meetings automatically
- **Fathom** -- Connect Fathom to sync transcripts
- **Fireflies** -- Connect Fireflies for automatic transcript sync

### Review Your First Meeting

After your next recorded meeting, head to **Meeting Analytics** to see the full transcript, AI summary, action items, and sentiment analysis.

### Explore Meeting Analytics

The **Meeting Analytics** page has four tabs:

- **Dashboard** -- Team trends, KPIs, and an AI search bar across all transcripts
- **Transcripts** -- Browse and filter all your meeting transcripts
- **Insights** -- AI-generated coaching tips and patterns
- **Reports** -- Generate and send daily or weekly meeting reports

## Need Help?

- Browse the docs in the sidebar for detailed guides
- Click the help icon on any page for contextual assistance
- Contact your admin if you need access to additional features

$DOC$,
    updated_at = now()
WHERE slug = 'customer-getting-started';

-- ---------------------------------------------------------------------------
-- customer-meeting-intelligence
-- ---------------------------------------------------------------------------
UPDATE docs_articles
SET content = $DOC$
# Meeting Analytics

Meeting Analytics is your central hub for everything related to your recorded meetings -- transcripts, AI insights, team trends, and automated reports.

Navigate to **Meeting Analytics** in the sidebar to get started.

## Four Tabs

### Dashboard Tab

The Dashboard tab is your meeting intelligence home screen. It includes:

- **AI Search bar** -- Search across all your meeting transcripts using natural language
- **Team Trends Chart** -- Visualise meeting volume, sentiment, and talk time over time
- **Date range filter** -- Shared across all tabs; focus on any time period

:::tip
Use natural language in the search bar for best results. Instead of searching for a keyword, ask a full question -- the AI understands context and meaning.
:::

### Transcripts Tab

Browse every recorded meeting transcript in one place:

- **Filter by title** -- Type in the search bar to narrow down transcripts
- **Date filtering** -- The shared date range applies here too
- **Click to open** -- Select any transcript to read the full conversation, AI summary, action items, and sentiment score

### Insights Tab

AI-generated coaching insights based on your meeting data:

- Patterns in talk ratios, sentiment trends, and topic frequency
- Personalised coaching tips surfaced from transcript analysis
- Filtered by the shared date range

### Reports Tab

Generate and send formatted meeting reports:

- **Daily report** -- A summary of meetings from a single day
- **Weekly report** -- A week-over-week trend summary
- Click **Generate Preview** to create a report before sending
- Click **Send** to distribute the report to connected Slack channels
- View **Report History** for previously sent reports

## Date Range Filtering

All four tabs share a single date range picker at the top right. Use it to:

- Focus on the last 7 days, 30 days, or a custom range
- Compare activity across different time periods
- Ensure all views (trends, transcripts, insights, reports) are aligned

## Team Trends

The Dashboard tab Team Trends Chart has three sub-tabs:

- **Volume** -- Meeting count over time (area chart)
- **Sentiment** -- Average meeting sentiment score over time
- **Talk Time** -- Average rep talk time percentage over time

:::tip
A good benchmark for customer-facing meetings is a 40-60% talk ratio (you talk 40%, they talk 60%). This means you are listening more than talking, which typically leads to better outcomes.
:::

## Recording Setup

To use Meeting Analytics, you need meeting recordings. Set up one of these in **Settings > Meeting Settings**:

- **60 Notetaker** -- Automatically joins and records your meetings
- **Fathom** -- Syncs transcripts from your Fathom account
- **Fireflies** -- Imports recordings from Fireflies

:::info
Transcripts are typically available within a few minutes after your meeting ends. The AI needs the transcript to power search and analysis features.
:::

$DOC$,
    updated_at = now()
WHERE slug = 'customer-meeting-intelligence';

-- ---------------------------------------------------------------------------
-- customer-team-analytics
-- ---------------------------------------------------------------------------
UPDATE docs_articles
SET content = $DOC$
# Team Analytics

Team Analytics gives you visibility into meeting performance across your team.

:::info
Team Analytics has been integrated into **Meeting Analytics**. Navigate to **Meeting Analytics** in the sidebar to access all analytics features.
:::

## Date Range Filtering

All views share a single **date range picker** at the top of the Meeting Analytics page:

- **Last 7 days** -- Recent activity snapshot
- **Last 30 days** -- Monthly trends
- **Custom range** -- Compare any two periods

The selected date range applies across all four tabs: Dashboard, Transcripts, Insights, and Reports.

## Dashboard Tab -- Team Trends

The Dashboard tab shows a Team Trends Chart with three views:

### Meeting Volume

An area chart showing how many meetings happened each day over your selected date range.

### Sentiment Trends

Track the average sentiment score of meetings over time. This helps identify meetings that went well, conversations that need follow-up, and trends in communication quality.

### Talk Time

See the average rep talk time percentage across your team meetings.

:::tip
A good benchmark for customer-facing meetings is a 40-60% talk ratio (you talk 40%, they talk 60%). This means you are listening more than talking, which typically leads to better outcomes.
:::

## Transcripts Tab

Browse and search all meeting transcripts for your team, filtered by the selected date range.

## Insights Tab

AI-generated coaching insights drawn from your team meeting data -- patterns, coaching tips, and performance signals.

## Reports Tab

Generate daily or weekly summary reports. Reports can be previewed and sent to connected Slack channels.

## Using Analytics for Coaching

1. **Identify patterns** -- See which meeting types are most productive
2. **Coach effectively** -- Use talk ratios and sentiment data for feedback
3. **Track improvement** -- Monitor how metrics change over time
4. **Optimise scheduling** -- Understand the best times and formats for meetings

$DOC$,
    updated_at = now()
WHERE slug = 'customer-team-analytics';

-- ---------------------------------------------------------------------------
-- meeting-command-centre
-- ---------------------------------------------------------------------------
UPDATE docs_articles
SET content = $DOC$
# Meeting Command Centre

The Meeting Command Centre prepares you for every meeting with a comprehensive brief and helps you follow up effectively afterwards.

## Pre-Meeting Preparation

Before any meeting, 60 automatically assembles a brief containing:

### Contact Intelligence

For every attendee, you will see:

- **Contact profile**: Role, company, recent activity
- **Relationship history**: Past meetings, emails, notes
- **Deal context**: Active deals with the company, current stage, health score
- **Recent mentions**: What was said about this contact in recent meetings

:::tip
Open your upcoming meeting from the **Dashboard** or **Meetings** page. The brief loads automatically. Review the Talking Points section for AI-suggested topics and check Last Meeting Summary to pick up where you left off.
:::

### Talking Points

The AI generates talking points based on open action items, deal stage, recent activity, and stalled or at-risk deals. You can edit or add your own talking points before the meeting.

## Post-Meeting Follow-Up

After a meeting, the Command Centre helps you close the loop quickly:

### Auto-Generated Follow-Ups

Based on the meeting transcript, 60 suggests:

- **Follow-up emails**: Drafted and ready to personalise
- **Tasks**: Action items assigned to the right team members
- **Deal updates**: Suggested stage changes or health score adjustments
- **Notes**: Key points to log against contact or deal records

### The Follow-Up Pack

Use the **Create Follow-Ups** button to generate a complete follow-up pack:

1. **Summary email** to attendees
2. **Internal notes** for your team
3. **Tasks** for each action item
4. **CRM updates** for relevant deals

Each item can be reviewed, edited, and approved before sending or saving.

### Automating Follow-Ups

Configure automatic follow-up rules in **Settings > Follow-Ups**:

- Auto-create tasks for action items detected in meetings
- Auto-draft follow-up emails (saved as drafts for review)
- Auto-update deal stages based on meeting outcomes
- Auto-log meeting notes to contact records

## Meeting Timeline

Every meeting has a timeline view showing: pre-meeting brief generated, recording started and ended, transcript processed, AI summary generated, follow-up tasks created, and emails sent.

## Meeting Analytics

For team-wide trends, sentiment tracking, and report generation, use the **Meeting Analytics** page. It provides four tabs -- Dashboard, Transcripts, Insights, and Reports -- with a shared date range filter across all views.

$DOC$,
    updated_at = now()
WHERE slug = 'meeting-command-centre';

-- ---------------------------------------------------------------------------
-- integration-fireflies
-- ---------------------------------------------------------------------------
UPDATE docs_articles
SET content = $DOC$
# Fireflies Integration

Connect Fireflies to sync meeting transcripts and AI-generated summaries into 60.

## Setup

1. Go to **Settings > Meeting Settings**
2. Select the **Fireflies** tab
3. Click **Connect Fireflies**
4. Authorise with your Fireflies account
5. Map team members to their Fireflies accounts

:::info
The Fireflies integration is managed from **Settings > Meeting Settings**. Navigate there and select the Fireflies tab to connect or disconnect the integration.
:::

## What Syncs

| Data | Description |
|------|-------------|
| Transcripts | Full meeting transcripts with speaker identification |
| AI Summaries | Fireflies-generated meeting summaries |
| Action Items | Detected follow-up items |
| Key Topics | Main discussion themes |
| Meeting Metadata | Duration, participants, recording date |

## User Mapping

1. Navigate to **Settings > Meeting Settings > Fireflies**
2. Match each 60 team member to their Fireflies account
3. Save the mapping

:::info
Only mapped users meetings will sync. Unmapped Fireflies users meetings are ignored to prevent unwanted data in your workspace.
:::

## Meeting Analytics

Once connected, all Fireflies transcripts are:

- Indexed for **AI-powered search** in the Meeting Analytics Dashboard tab
- Linked to **contacts** and **deals** in your CRM
- Available for the **Copilot** to reference during conversations
- Included in **pre-meeting briefs** for relevant attendees
- Visible in the **Transcripts tab** alongside recordings from other providers
- Counted in **Team Trends** charts (volume, sentiment, talk time)

:::tip
Fireflies transcripts work seamlessly alongside Fathom and 60 Notetaker transcripts. You can search across all providers in a single query from the Meeting Analytics Dashboard tab.
:::

$DOC$,
    updated_at = now()
WHERE slug = 'integration-fireflies';
