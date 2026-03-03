-- Migration: Fix Support Documentation — remove duplicates, rewrite onboarding guide
-- US-019: Fix Support Docs

-- ============================================================
-- 1. Remove duplicate "Welcome to 60" articles — keep lowest order_index
-- ============================================================
DELETE FROM public.docs_articles
WHERE slug IN (
  SELECT slug
  FROM (
    SELECT
      slug,
      id,
      order_index,
      ROW_NUMBER() OVER (PARTITION BY slug ORDER BY order_index ASC, created_at ASC) AS rn
    FROM public.docs_articles
    WHERE slug LIKE '%welcome%' OR title ILIKE '%welcome to 60%'
  ) ranked
  WHERE rn > 1
);

-- Also remove by title duplicates (in case slugs differ)
DELETE FROM public.docs_articles
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      title,
      ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(title)) ORDER BY order_index ASC, created_at ASC) AS rn
    FROM public.docs_articles
    WHERE title ILIKE '%welcome to 60%'
  ) ranked
  WHERE rn > 1
);

-- ============================================================
-- 2. Remove duplicate "Meetings Intelligence" articles — keep lowest order_index
-- ============================================================
DELETE FROM public.docs_articles
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      title,
      ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(title)) ORDER BY order_index ASC, created_at ASC) AS rn
    FROM public.docs_articles
    WHERE title ILIKE '%meetings intelligence%'
  ) ranked
  WHERE rn > 1
);

-- ============================================================
-- 3. Rewrite onboarding guide to be user-facing
--    (Replace technical/internal description with actionable user steps)
-- ============================================================
UPDATE public.docs_articles
SET
  content = '# Getting Started with 60

Welcome to 60 — your AI command center for sales. This guide walks you through setting up 60 and getting your first AI-powered insight.

## Step 1: Connect Your Google Account

60 works best when connected to your Google Calendar and Gmail. This lets 60 automatically detect your meetings, prepare briefings, and draft follow-ups.

1. Go to **Settings > Integrations**
2. Click **Connect Google**
3. Sign in with your Google account and grant the requested permissions
4. You should see a green "Connected" status

**Why this matters:** Without a Google connection, 60 cannot monitor your calendar or send emails on your behalf.

## Step 2: Set Up Your Organization

Your organization profile helps 60 understand your company and write in your brand voice.

1. Go through the **Setup Wizard** (shown on first login)
2. Enter your company website — 60 will automatically research your company
3. Review the AI-generated profile and correct any inaccuracies
4. Save your configuration

## Step 3: Add Your First Meeting

Once Google Calendar is connected, 60 will automatically sync upcoming meetings. You can also add meetings manually.

1. Go to **Meetings** in the left sidebar
2. You will see meetings pulled from your calendar
3. Click any meeting to see the AI briefing — contact history, deal context, suggested talking points

## Step 4: Enable the AI Notetaker

The 60 Notetaker bot joins your video calls to record and transcribe automatically.

1. Go to **Settings > Notetaker**
2. Ensure Google Calendar is connected (Step 1)
3. Click **Connect Calendar for Bot Deployment**
4. The bot will automatically join future meetings from your calendar

## Step 5: Explore the Pipeline

60 tracks your deals and contacts in one place.

1. Go to **Pipeline** to see your deals
2. Go to **Contacts** to see your CRM contacts
3. Use the AI Copilot (chat icon, bottom right) to ask questions about your pipeline

## Credits

60 uses AI credits for intelligence features like meeting briefings, follow-up drafts, and contact enrichment. New accounts receive **100 free credits** to get started.

Check your credit balance at any time by going to **Settings > Credits**.

## Get Help

- **Search docs:** Use the search bar above to find answers
- **Ask the AI:** Click "Ask AI" in Support and ask any question
- **Open a ticket:** Click "New Ticket" if you need human help
',
  updated_at = NOW()
WHERE (slug ILIKE '%onboarding%' OR title ILIKE '%onboarding guide%' OR title ILIKE '%getting started%')
  AND category = 'Getting Started'
LIMIT 1;

-- ============================================================
-- 4. Ensure minimum required articles exist
--    Insert if missing (ON CONFLICT DO NOTHING)
-- ============================================================

-- Getting Started (base article — if none exists)
INSERT INTO public.docs_articles (slug, title, category, content, published, order_index)
VALUES (
  'getting-started',
  'Getting Started with 60',
  'Getting Started',
  '# Getting Started with 60

Welcome to 60. Follow the steps in the onboarding guide to connect your Google account, set up your organization, and start using the AI Notetaker.',
  true,
  1
)
ON CONFLICT (slug) DO NOTHING;

-- Meetings guide
INSERT INTO public.docs_articles (slug, title, category, content, published, order_index)
VALUES (
  'meetings-overview',
  'Meetings & AI Notetaker',
  'Meetings',
  '# Meetings & AI Notetaker

## How Meetings Work

60 automatically syncs meetings from your Google Calendar. For each meeting, the AI generates:

- **Briefing:** Who you are meeting, their company, recent activity, open deals
- **Talking points:** Suggested topics based on deal stage and contact history
- **Follow-up draft:** A ready-to-send email after the call

## AI Notetaker

The 60 Notetaker bot joins your video calls (Zoom, Google Meet, Teams) to record and transcribe automatically.

**Setup:**
1. Go to Settings > Notetaker
2. Click Connect Calendar for Bot Deployment
3. Future meetings will have the bot auto-join

**Bot behaviour:**
- Joins 2 minutes before the meeting starts
- Records audio and generates a full transcript
- Transcript appears in the meeting detail within minutes of the call ending

## Meeting Intelligence

After a call, 60 analyses the transcript and generates:
- Action items with suggested owners
- Risk signals (objections, competitor mentions, stalled timelines)
- Deal context updates
- A follow-up email draft in your tone
',
  true,
  10
)
ON CONFLICT (slug) DO NOTHING;

-- Pipeline guide
INSERT INTO public.docs_articles (slug, title, category, content, published, order_index)
VALUES (
  'pipeline-overview',
  'Pipeline & Deals',
  'Pipeline & Deals',
  '# Pipeline & Deals

## Your Sales Pipeline

60 tracks every deal from first contact to close. The Pipeline view shows all active deals organised by stage.

**Deal stages:** Prospect → Qualified → Proposal → Negotiation → Closed Won / Closed Lost

## Adding Deals

1. Go to **Pipeline** in the sidebar
2. Click **New Deal**
3. Enter deal name, value, and associated contact/company
4. Select the current stage

## AI Deal Intelligence

For each deal, 60 analyses all available context (meetings, emails, notes) and surfaces:
- **Risk signals:** Signs the deal may be at risk
- **Next best action:** The most impactful thing to do right now
- **Engagement score:** How engaged the prospect has been recently
',
  true,
  20
)
ON CONFLICT (slug) DO NOTHING;

-- Settings guide
INSERT INTO public.docs_articles (slug, title, category, content, published, order_index)
VALUES (
  'settings-overview',
  'Settings & Configuration',
  'Admin & Settings',
  '# Settings & Configuration

## Account Settings

Go to **Settings > Account** to update your name, email, and profile picture.

## Integrations

Connect external tools at **Settings > Integrations**:
- **Google:** Calendar, Gmail, Google Drive
- **JustCall:** Call recording and logs
- **Slack:** Notifications and Copilot

## Notetaker Settings

Configure bot behaviour at **Settings > Notetaker**:
- Bot name (shown to meeting participants)
- Entry message
- Auto-record rules (by attendee count, domain, keyword)

## AI & Credits

View your credit balance and usage at **Settings > Credits**.

Credits are consumed by AI intelligence features. You can purchase top-up packs from the Credits page.

## Team Management

Invite team members at **Settings > Team**. Each invite counts against your plan seat limit.
',
  true,
  30
)
ON CONFLICT (slug) DO NOTHING;

-- Credits guide
INSERT INTO public.docs_articles (slug, title, category, content, published, order_index)
VALUES (
  'credits-overview',
  'AI Credits',
  'Admin & Settings',
  '# AI Credits

## What Are Credits?

60 uses AI credits to power intelligence features. Each action costs a small number of credits depending on the complexity of the AI work involved.

**Common credit costs:**
- Meeting briefing: ~2 credits
- Follow-up email draft: ~3 credits
- Contact enrichment: ~5 credits
- Full deal analysis: ~8 credits

## Free Credits

New accounts receive **100 free AI credits** to explore all features.

## Checking Your Balance

Go to **Settings > Credits** to see:
- Current balance
- Recent usage history
- Available credit packs

## Running Low?

When your balance drops below 20 credits, a warning banner appears. You can purchase additional credits from the Credits page at any time.
',
  true,
  40
)
ON CONFLICT (slug) DO NOTHING;
