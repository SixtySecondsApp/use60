-- Seed Integrations Overview help panel content
-- Used by HelpPanel on the Integrations page (docSlug: 'integrations-overview')

INSERT INTO docs_articles (slug, title, category, content, published, order_index, metadata) VALUES
('integrations-overview', 'Integrations Overview', 'Integrations', E'# Integrations

Connect your favourite tools to 60 and let AI work across your entire sales stack. Each integration feeds context into the platform so your copilot, pipeline, and meeting intelligence get smarter with every connection.

## Available Integrations

### CRM
- **HubSpot** — Bi-directional sync. Deals, contacts, and activities flow both ways so your CRM stays up to date without manual entry.
- **Attio** — Bi-directional CRM sync with AI writeback for enriched contact and company data.

### Meeting Intelligence
- **Fathom** — Automatically sync meeting recordings, transcripts, and AI-generated summaries.
- **Fireflies.ai** — Import meeting notes, transcripts, and action items.
- **JustCall** — Sync call recordings and transcripts from your phone system.
- **60 Notetaker** — 60''s built-in AI meeting recorder. Joins your calls automatically and captures everything.

### Calendar & Scheduling
- **Google Workspace** — Connect Gmail, Calendar, Drive, and Tasks. Powers email sync, meeting prep, and calendar intelligence.
- **SavvyCal** — Instant booking links for frictionless scheduling.

### Outreach & Prospecting
- **Instantly** — Monitor email campaign performance, classify replies, and trigger follow-ups.
- **Apollo.io** — Sales intelligence and lead search. Enrich contacts with verified emails and company data.
- **AI Ark** — B2B data and AI-powered company and people search.

### Automation
- **Apify** — Run web scrapers and automation actors to pull data from any website into your Ops tables.

### Communication
- **Slack** — Get deal alerts, meeting summaries, and AI briefings delivered straight to your channels.

## How Integrations Work

1. **Connect** — Click the integration card and follow the setup steps (usually just an API key or OAuth sign-in).
2. **Configure** — Choose what data to sync and how often.
3. **Use** — Once connected, 60 automatically pulls data into your pipeline, contacts, and meeting intelligence. Your AI Copilot gains access to richer context for better recommendations.

:::tip
Start with Google Workspace and one meeting recorder. These two integrations unlock the most value from 60''s AI features.
:::

## Managing Integrations

- **Active** integrations show a green badge and can be configured or disconnected at any time.
- **Inactive** integrations show a grey badge and are ready to connect.
- Disconnecting an integration does not delete previously synced data.

## Need Help?

Visit [use60.com/support](https://use60.com/support) for detailed setup guides for each integration.', true, 1, ''{"audience": "customer", "feature_area": "integrations"}'')
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  published = EXCLUDED.published,
  updated_at = NOW();
