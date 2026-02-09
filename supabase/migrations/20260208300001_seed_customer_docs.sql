-- Customer-facing documentation articles
-- These are shown to external (customer) users with target_audience: ["external", "internal"]

-- DOCS-204: Customer Getting Started
INSERT INTO docs_articles (slug, title, category, content, published, order_index, metadata)
VALUES (
  'customer-getting-started',
  'Welcome to 60',
  'Getting Started',
  '# Welcome to 60

Welcome{{#if user_first_name}}, {{user_first_name}}{{/if}}! 60 is your meeting intelligence platform — helping you get more from every conversation.

## What You Can Do

60 gives you powerful tools to understand and improve your meetings:

- **Meeting Intelligence** — Search across all your meeting transcripts with AI-powered semantic search
- **Team Analytics** — See how your team performs across meetings with detailed metrics
- **Dashboard** — Get a quick overview of your recent activity and upcoming meetings
- **Integrations** — Connect your calendar, recording tools, and communication platforms

## Getting Started

### 1. Connect Your Calendar

Head to **Integrations** and connect your Google Calendar. This lets 60 automatically track your meetings and schedule recording bots.

### 2. Set Up Meeting Recording

Choose a recording provider to capture your meetings:

- **60 Notetaker** — Our built-in bot joins your meetings automatically
- **Fathom** — If you already use Fathom, connect it to sync transcripts
- **Fireflies** — Connect Fireflies for automatic transcript sync

Go to **Integrations** to set up your preferred recorder.

### 3. Review Your First Meeting

After your next recorded meeting, head to **Meetings** to see:

- Full transcript with speaker identification
- AI-generated summary and key topics
- Action items extracted from the conversation
- Sentiment analysis

### 4. Explore Meeting Intelligence

Use **Intelligence** to search across all your meetings. Ask questions like:

- "What did we discuss about pricing?"
- "When was the product roadmap mentioned?"
- "What commitments were made last week?"

## Need Help?

- Browse the docs in the sidebar for detailed guides
- Click the help icon on any page for contextual assistance
- Contact your admin if you need access to additional features',
  true,
  0,
  '{"target_audience": ["external", "internal"]}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  content = EXCLUDED.content,
  published = EXCLUDED.published,
  order_index = EXCLUDED.order_index,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- DOCS-205a: Customer Meeting Intelligence
INSERT INTO docs_articles (slug, title, category, content, published, order_index, metadata)
VALUES (
  'customer-meeting-intelligence',
  'Meeting Intelligence',
  'Meetings',
  '# Meeting Intelligence

Meeting Intelligence lets you search across all your meeting transcripts using AI-powered semantic search. Instead of scrubbing through recordings, just ask a question and get instant answers.

## Searching Your Meetings

### Basic Search

Navigate to **Intelligence** in the sidebar. Type a question or keyword in the search bar:

- **Keyword search**: "pricing", "timeline", "budget"
- **Question search**: "What did Sarah say about the launch date?"
- **Topic search**: "product roadmap discussion"

The AI finds relevant moments across all your meetings, showing you the exact transcript segments with context.

### Search Tips

:::tip
Use natural language questions for best results. Instead of searching "Q4 revenue", try "What was discussed about Q4 revenue targets?" — the AI understands context and meaning.
:::

- **Be specific** — "What did the client say about pricing concerns?" works better than just "pricing"
- **Use time filters** — Narrow results to a specific date range
- **Try different phrasings** — If one search doesn''t find what you need, rephrase your question

## Meeting Details

Click on any meeting to see its full details:

### Transcript
The complete meeting transcript with speaker labels. You can:
- Read through the full conversation
- Jump to specific moments
- See who said what

### AI Summary
An automatically generated summary covering:
- Key discussion points
- Decisions made
- Follow-up items

### Action Items
Tasks and commitments extracted from the conversation. These help you track what was agreed upon and ensure nothing falls through the cracks.

### Sentiment Analysis
Understand the tone of your meetings with sentiment scoring. See whether conversations were positive, neutral, or needed attention.

## Recording Setup

To use Meeting Intelligence, you need meeting recordings. Set up one of these in **Integrations**:

- **60 Notetaker** — Automatically joins and records your meetings
- **Fathom** — Syncs transcripts from your Fathom account
- **Fireflies** — Imports recordings from Fireflies

:::info
Transcripts are typically available within a few minutes after your meeting ends. The AI needs the transcript to power search and analysis features.
:::',
  true,
  1,
  '{"target_audience": ["external", "internal"]}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  content = EXCLUDED.content,
  published = EXCLUDED.published,
  order_index = EXCLUDED.order_index,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- DOCS-205b: Customer Team Analytics
INSERT INTO docs_articles (slug, title, category, content, published, order_index, metadata)
VALUES (
  'customer-team-analytics',
  'Team Analytics',
  'Core Features',
  '# Team Analytics

Team Analytics gives you visibility into meeting performance across your team. Understand patterns, identify coaching opportunities, and track engagement over time.

## Accessing Team Analytics

Navigate to **Team Analytics** in the sidebar. You''ll see an overview dashboard with key metrics.

## Key Metrics

### Meeting Activity
- **Total meetings** — How many meetings your team has had
- **Average duration** — Typical meeting length
- **Meeting frequency** — How often team members are meeting

### Talk Ratio
See the balance between talking and listening in meetings. A healthy talk ratio helps ensure productive conversations where both sides are engaged.

:::tip
A good benchmark for customer-facing meetings is a 40-60% talk ratio (you talk 40%, they talk 60%). This means you''re listening more than talking, which typically leads to better outcomes.
:::

### Sentiment Trends
Track the overall tone of meetings over time. This helps identify:
- Meetings that went particularly well
- Conversations that may need follow-up attention
- Trends in team communication quality

## Filtering & Date Ranges

Use the date picker to focus on specific time periods:
- **Last 7 days** — Recent activity snapshot
- **Last 30 days** — Monthly trends
- **Custom range** — Compare any two periods

## Using Insights

Team Analytics helps you:

1. **Identify patterns** — See which meeting types are most productive
2. **Coach effectively** — Use talk ratios and sentiment data for feedback
3. **Track improvement** — Monitor how metrics change over time
4. **Optimize scheduling** — Understand the best times and formats for meetings',
  true,
  2,
  '{"target_audience": ["external", "internal"]}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  content = EXCLUDED.content,
  published = EXCLUDED.published,
  order_index = EXCLUDED.order_index,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- DOCS-206a: Customer Dashboard
INSERT INTO docs_articles (slug, title, category, content, published, order_index, metadata)
VALUES (
  'customer-dashboard',
  'Dashboard Overview',
  'Core Features',
  '# Dashboard Overview

The Dashboard is your home screen — a quick snapshot of your recent activity, upcoming meetings, and key metrics.

## What You''ll See

### Upcoming Meetings
Your next scheduled meetings are displayed front and center. Each shows:
- Meeting title and time
- Attendees
- Recording status (whether a bot will join)

### Recent Activity
A timeline of your recent meeting-related activity:
- Completed meetings with transcript availability
- New recordings processed
- Action items from recent conversations

### Quick Stats
At-a-glance metrics for the current period:
- Meetings this week
- Total recording hours
- Action items pending

## Navigation

From the Dashboard, you can quickly jump to:
- **Meetings** — View all your meetings and recordings
- **Intelligence** — Search across your transcripts
- **Team Analytics** — Review team performance metrics
- **Integrations** — Manage your connected services

:::tip
Use the sidebar to navigate between sections. The Dashboard is always accessible as your starting point.
:::',
  true,
  1,
  '{"target_audience": ["external", "internal"]}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  content = EXCLUDED.content,
  published = EXCLUDED.published,
  order_index = EXCLUDED.order_index,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- DOCS-206b: Customer Settings
INSERT INTO docs_articles (slug, title, category, content, published, order_index, metadata)
VALUES (
  'customer-settings',
  'Account Settings',
  'Admin & Settings',
  '# Account Settings

Manage your account preferences, notifications, and profile settings.

## Profile

Update your personal information:
- **Name** — Your display name shown in meetings and activity
- **Email** — Your account email (used for login)
- **Avatar** — Your profile picture

## Notifications

Control what notifications you receive:

### Email Notifications
- **Meeting summaries** — Receive AI summaries after each meeting
- **Action item reminders** — Get reminded about pending follow-ups
- **Weekly digest** — A summary of your meeting activity for the week

### In-App Notifications
- **Recording complete** — When a meeting recording is ready to review
- **New transcript** — When a transcript has been processed

## Connected Accounts

View and manage your connected services:
- **Google Calendar** — Calendar sync status
- **Recording provider** — Fathom, 60 Notetaker, or Fireflies connection status
- **Slack** — Notification channel setup

:::info
To connect or disconnect integrations, visit the **Integrations** page from the sidebar.
:::

## Security

- **Password** — Change your account password
- **Sessions** — View active sessions and sign out of other devices

## Need Help?

If you need changes to your account that aren''t available here (like changing your role or organization), contact your team admin.',
  true,
  10,
  '{"target_audience": ["external", "internal"]}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  content = EXCLUDED.content,
  published = EXCLUDED.published,
  order_index = EXCLUDED.order_index,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();
