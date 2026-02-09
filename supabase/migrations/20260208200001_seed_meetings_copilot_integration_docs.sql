-- Seed Meetings, Copilot, Integration & Admin Documentation Content
-- 16 articles covering: Meetings (3), AI Copilot (3), Integrations (8), Admin & Settings (2)

INSERT INTO docs_articles (slug, title, category, content, published, order_index, metadata) VALUES

-- ============================================================================
-- MEETINGS
-- ============================================================================

('meetings-guide', 'Meeting Intelligence', 'Meetings', E'# Meeting Intelligence

Meeting Intelligence is the heart of 60''s pre- and post-meeting workflow. Every meeting your team takes is automatically captured, transcribed, and analysed so you never miss an insight.

## How It Works

When a meeting is recorded (via Fathom, 60 Notetaker, or Fireflies), 60 automatically:

1. **Transcribes** the full conversation
2. **Generates AI summaries** with key takeaways
3. **Extracts action items** and follow-up tasks
4. **Links to contacts** and deals in your CRM
5. **Indexes everything** for semantic search

## Searching Your Meetings

The Meeting Intelligence page lets you search across all your team''s conversations using natural language.

:::beginner
### Your First Search

Navigate to **Meeting Intelligence** in the sidebar and try a search like:

- "What did {{contact_name}} say about pricing?"
- "Show meetings about {{deal_name}}"
- "Conversations about budget concerns"

The AI will search across all indexed transcripts and return relevant excerpts with timestamps.
:::

:::intermediate
### Advanced Search Filters

Narrow your search using filters:

- **Date Range**: Search within a specific time period
- **Team Member**: Filter by who attended the meeting
- **Source**: Filter by recording provider (Fathom, 60 Notetaker, Fireflies)
- **Meeting Type**: Internal vs external meetings

You can also search across JustCall recordings if that integration is enabled.
:::

## AI Summaries

Every meeting gets an automatic AI summary containing:

- **Key Discussion Points**: The main topics covered
- **Decisions Made**: Any commitments or agreements
- **Action Items**: Tasks that need follow-up
- **Sentiment Analysis**: Overall tone of the meeting

:::tip
Click on any action item in a summary to automatically create a task in 60. The task will be pre-filled with context from the meeting.
:::

## Viewing Transcripts

Click any meeting to view the full transcript. Transcripts are:

- **Timestamped**: Jump to any point in the conversation
- **Speaker-labelled**: Each speaker is identified
- **Searchable**: Find specific topics within a transcript
- **Linked**: Mentions of contacts and deals are highlighted

:::info
Transcripts are stored securely and only visible to team members in your organisation. Meeting recordings use S3 storage with permanent URLs, so they never expire.
:::
', true, 20, '{}'),

-- ============================================================================

('meeting-recording-setup', 'Meeting Recording Setup', 'Meetings', E'# Meeting Recording Setup

60 supports three recording providers. You can use one or multiple depending on your team''s preferences.

{{#if fathom_enabled}}
## Fathom Integration

Your organisation has **Fathom** connected. Fathom automatically records and transcribes your meetings.

### How It Works

1. Fathom records your Zoom/Meet/Teams calls
2. Transcripts are automatically synced to 60
3. AI generates summaries and action items
4. Everything is indexed for Meeting Intelligence search

### User Mapping

Each team member needs to connect their Fathom account:

1. Go to **Integrations > Fathom**
2. Click **Connect Account**
3. Authorise the Fathom connection
4. Your future meetings will sync automatically

:::tip
Historical transcripts from before connecting are also imported during the initial sync.
:::
{{/if}}

{{#if meetingbaas_enabled}}
## 60 Notetaker

Your organisation has the **60 Notetaker** enabled. This is our built-in meeting recording bot that joins your calls automatically.

### Auto-Join Setup

The 60 Notetaker can automatically join your meetings:

1. Go to **Integrations > 60 Notetaker**
2. Enable **Auto-Join** for your calendar
3. Set preferences:
   - Which meeting types to join (external only, all meetings, etc.)
   - Minimum attendee count
   - Calendar event keywords to include/exclude

:::info
The bot joins 1-2 minutes before the scheduled start time and announces itself in the meeting chat.
:::

### Recording Storage

All recordings are stored permanently on AWS S3:

- **Video**: Full meeting video recording
- **Audio**: Separate audio track
- **Thumbnails**: Auto-generated preview thumbnails

Unlike other providers, S3 URLs never expire — your recordings are available forever.

### Transcription

Transcription happens automatically after the meeting ends:

- **Gladia**: Primary transcription engine (async, high accuracy)
- **MeetingBaaS**: Fallback transcription

:::tip
Transcripts are typically available within 5-10 minutes of the meeting ending.
:::
{{/if}}

{{#if fireflies_enabled}}
## Fireflies Integration

Your organisation has **Fireflies** connected. Fireflies records, transcribes, and provides AI-powered summaries.

### Setup

1. Go to **Integrations > Fireflies**
2. Click **Connect Account**
3. Map your team members to their Fireflies accounts
4. Future meeting transcripts will sync automatically

### What Syncs

- Full meeting transcripts with speaker labels
- AI-generated summaries
- Action items and key topics
- Meeting metadata (duration, attendees, etc.)
{{/if}}

## Choosing a Provider

| Feature | Fathom | 60 Notetaker | Fireflies |
|---------|--------|--------------|-----------|
| Auto-join | Yes | Yes | Yes |
| Permanent storage | Provider-hosted | S3 (permanent) | Provider-hosted |
| Video recording | Yes | Yes | Yes |
| AI summaries | Yes | Yes | Yes |
| Speaker labels | Yes | Yes | Yes |

:::note
You can use multiple providers simultaneously. 60 will deduplicate transcripts from the same meeting.
:::
', true, 21, '{"required_integrations": ["fathom", "meetingbaas", "fireflies"]}'),

-- ============================================================================

('meeting-command-centre', 'Meeting Command Centre', 'Meetings', E'# Meeting Command Centre

The Meeting Command Centre prepares you for every meeting with a comprehensive brief and helps you follow up effectively afterwards.

## Pre-Meeting Preparation

Before any meeting, 60 automatically assembles a brief containing:

### Contact Intelligence

For every attendee, you''ll see:

- **Contact profile**: Role, company, recent activity
- **Relationship history**: Past meetings, emails, notes
- **Deal context**: Active deals with {{company_name}}, current stage, health score
- **Recent mentions**: What was said about this contact in recent meetings

:::beginner
### Using the Meeting Brief

1. Open your upcoming meeting from the **Dashboard** or **Meetings** page
2. The brief loads automatically with all attendees'' information
3. Review the **Talking Points** section for AI-suggested topics
4. Check **Last Meeting Summary** to pick up where you left off
:::

### Talking Points

The AI generates talking points based on:

- Open action items from previous meetings with these contacts
- Deal stage and next steps for active deals
- Recent activity (emails sent, tasks completed)
- Any stalled deals or at-risk indicators

:::tip
You can edit or add your own talking points before the meeting. They''ll be saved and visible in the post-meeting review.
:::

## Post-Meeting Follow-Up

After a meeting, the Command Centre helps you:

### Auto-Generated Follow-Ups

Based on the meeting transcript, 60 suggests:

- **Follow-up emails**: Drafted and ready to personalise
- **Tasks**: Action items assigned to the right team members
- **Deal updates**: Suggested stage changes or health score adjustments
- **Notes**: Key points to log against contact or deal records

:::intermediate
### The Follow-Up Pack

Use the **"Create Follow-Ups"** button to generate a complete follow-up pack:

1. **Summary email** to attendees
2. **Internal notes** for your team
3. **Tasks** for each action item
4. **CRM updates** for relevant deals

Each item can be reviewed, edited, and approved before sending.
:::

:::advanced
### Automating Follow-Ups

Set up rules to automatically create follow-ups:

- Auto-create tasks for action items detected in meetings
- Auto-draft follow-up emails (saved as drafts for review)
- Auto-update deal stages based on meeting outcomes
- Auto-log meeting notes to contact records

Configure these in **Settings > Automation > Meeting Follow-Ups**.
:::

## Meeting Timeline

Every meeting has a timeline view showing:

- Pre-meeting brief generated
- Meeting recording started/ended
- Transcript processed
- AI summary generated
- Follow-up tasks created
- Emails sent
', true, 22, '{}'),

-- ============================================================================
-- AI COPILOT
-- ============================================================================

('copilot-guide', 'AI Copilot Overview', 'AI Copilot', E'# Your AI Sales Teammate

The 60 Copilot is more than a chatbot — it''s a dedicated AI team member that knows your company, your deals, and your contacts. Think of it as a brilliant junior colleague with superpowers.

## What Can the Copilot Do?

:::beginner
### Getting Started with the Copilot

Open the Copilot panel from the right side of any page. Try these conversation starters:

- **"What''s on my plate today?"** — Get a summary of upcoming meetings and overdue tasks
- **"Prep me for my next meeting"** — Get a comprehensive meeting brief
- **"How is {{deal_name}} doing?"** — Get a deal health assessment
- **"Draft a follow-up email to {{contact_name}}"** — Generate a personalised email

The Copilot understands context — it knows who you are, what deals you''re working on, and what meetings you have coming up.
:::

## Natural Conversation

The Copilot speaks like a colleague, not a robot:

> **You**: "Hey, what''s happening with the {{company_name}} deal?"
>
> **Copilot**: "Hi {{user_first_name}}! The {{deal_name}} deal is currently in the Opportunity stage at $45K. Last activity was 3 days ago when you sent a pricing proposal to {{contact_name}}. The deal health score is 72/100 — looking solid but I''d suggest a check-in call this week since they''ve gone quiet. Want me to draft an email?"

## Key Capabilities

| Capability | Example |
|-----------|---------|
| **Meeting prep** | "Prepare a brief for my 2pm call" |
| **Deal analysis** | "Which deals are at risk this quarter?" |
| **Email drafting** | "Write a follow-up to {{contact_name}} about pricing" |
| **Task management** | "What tasks are overdue?" |
| **Contact lookup** | "Tell me about {{contact_name}}" |
| **Pipeline review** | "How''s my pipeline looking?" |
| **Research** | "What do we know about {{company_name}}?" |

:::intermediate
### Skills and Sequences

The Copilot has specialised **skills** — predefined workflows for common sales tasks:

- **Meeting Prep Brief**: Assembles attendee profiles, deal context, talking points
- **Deal Rescue Plan**: Analyses at-risk deals and suggests recovery actions
- **Follow-Up Pack**: Generates post-meeting follow-up emails, tasks, and notes
- **Pipeline Forecast**: Provides weighted pipeline analysis with probability scoring

You can trigger these by asking naturally or by name: "Run the meeting prep skill for my next meeting."
:::

:::advanced
### Sequences (Multi-Step Workflows)

Sequences chain multiple skills together for complex workflows:

- **Next Meeting Command Centre**: Research → Prep brief → Talking points → Action plan
- **Post-Meeting Follow-Up**: Transcript analysis → Summary → Email draft → Task creation
- **Deal Review**: Health check → Competitor analysis → Recommendations → MAP generation

Sequences can run in parallel for speed and include human-in-the-loop approval gates for external actions.
:::

## Confirmation Pattern

For any external action (sending emails, creating tasks, posting to Slack), the Copilot always shows a preview first:

1. **Preview**: See exactly what will be sent/created
2. **Edit**: Make changes if needed
3. **Confirm**: Approve to execute
4. **Done**: Action completed with confirmation

:::warning
The Copilot will never send an email or post a message without your explicit confirmation. All external actions require approval.
:::
', true, 50, '{}'),

-- ============================================================================

('copilot-skills', 'Copilot Skills Reference', 'AI Copilot', E'# Copilot Skills Reference

Skills are the Copilot''s specialised capabilities. Each skill is a predefined workflow that the Copilot can execute when you ask.

## How Skills Work

When you ask the Copilot something, it:

1. **Routes** your request to the best matching skill (using AI intent detection)
2. **Gathers** the required context (CRM data, meeting history, etc.)
3. **Executes** the skill workflow
4. **Returns** structured results in a formatted card

## Skill Categories

### Sales AI Skills

| Skill | Trigger Phrases | What It Does |
|-------|----------------|--------------|
| Meeting Prep Brief | "Prep me for...", "Meeting brief" | Assembles comprehensive pre-meeting brief |
| Deal Rescue Plan | "Help with at-risk deal", "Rescue plan" | Diagnoses issues and suggests recovery actions |
| Pipeline Forecast | "Pipeline forecast", "How''s my pipeline?" | Weighted analysis with probability scoring |
| Deal Review | "Review deal", "Deal health" | Comprehensive deal assessment |

### Writing Skills

| Skill | Trigger Phrases | What It Does |
|-------|----------------|--------------|
| Draft Email | "Draft email to...", "Write a follow-up" | Generates personalised email drafts |
| Meeting Follow-Up | "Follow-up from meeting" | Post-meeting summary and action items |
| Proposal Helper | "Help with proposal" | Drafts proposal sections with context |

### Enrichment Skills

| Skill | Trigger Phrases | What It Does |
|-------|----------------|--------------|
| Contact Research | "Research {{contact_name}}", "Look up..." | Pulls enrichment data from available sources |
| Company Research | "Tell me about {{company_name}}" | Company overview, recent news, key contacts |

### Data Access Skills

| Skill | Trigger Phrases | What It Does |
|-------|----------------|--------------|
| Get Meetings | "My meetings today", "Upcoming meetings" | Lists calendar events |
| Get Deals | "Show my deals", "Active deals" | Lists pipeline deals |
| Get Contacts | "Find contact", "Who is..." | Searches contacts |
| Get Tasks | "My tasks", "Overdue tasks" | Lists assigned tasks |

:::tip
You don''t need to remember exact trigger phrases. The Copilot uses AI to understand your intent and route to the right skill. Just ask naturally!
:::

## Sequence Skills (Multi-Step)

Sequences chain multiple skills together:

### Next Meeting Command Centre
**Trigger**: "Prep for next meeting", "Meeting command centre"

1. Finds your next meeting with external attendees
2. Researches all attendees (profiles, history)
3. Generates meeting brief with talking points
4. Creates action plan with pre-meeting tasks

### Post-Meeting Follow-Up Pack
**Trigger**: "Follow up from meeting", "Create follow-ups"

1. Retrieves meeting transcript and AI summary
2. Extracts action items and key decisions
3. Drafts follow-up email to attendees
4. Creates tasks for action items
5. Suggests deal/contact updates

:::info
Sequences show a step-by-step progress indicator while running. Each step can take 5-15 seconds depending on the amount of data being processed.
:::
', true, 51, '{}'),

-- ============================================================================

('copilot-memory', 'Copilot Memory System', 'AI Copilot', E'# How the Copilot Remembers

The 60 Copilot has a persistent memory system that helps it understand your work context over time. The more you use it, the smarter it gets.

## What Gets Remembered

The Copilot automatically stores memories in these categories:

| Category | Examples |
|----------|---------|
| **Deal context** | "{{deal_name}} budget is $50K", "Decision maker is the VP of Sales" |
| **Relationships** | "{{contact_name}} prefers email over phone", "Strong champion at {{company_name}}" |
| **Preferences** | "{{user_first_name}} likes bullet-point summaries", "Prefers formal email tone" |
| **Commitments** | "Promised to send proposal by Friday", "Agreed to quarterly check-ins" |
| **Facts** | "{{company_name}} has 200 employees", "Using competitor WidgetCo currently" |

## How Memories Are Created

Memories are created automatically in three ways:

### 1. Session Compaction

When your conversation gets long (approaching 80,000 tokens), the Copilot:
1. Summarises the conversation so far
2. Extracts key facts, commitments, and preferences
3. Stores them as tagged memories
4. Continues with a compact context

:::info
You''ll never notice compaction happening — the conversation continues seamlessly. The Copilot retains the last 10 messages in full detail plus all extracted memories.
:::

### 2. CRM Events

Database triggers automatically create memories when:

- A deal changes stage → "{{deal_name}} moved from SQL to Opportunity"
- A deal value changes → "{{deal_name}} value updated to $75K"
- A task is completed → "Follow-up call with {{contact_name}} completed"
- An activity is logged → "Email sent to {{contact_name}} about pricing"

### 3. Meeting Intelligence

After each meeting, memories are created for:

- Key decisions made during the meeting
- Action items and commitments
- Important quotes or concerns raised
- Changes in stakeholder sentiment

## Memory Relevance

When you start a new conversation, the Copilot retrieves relevant memories using:

- **Keyword matching**: Mentions of specific deals, contacts, or companies
- **Confidence scoring**: Higher-confidence memories are prioritised
- **Recency weighting**: Recent memories rank higher
- **Access frequency**: Frequently-used memories are boosted

:::tip
You can ask the Copilot "What do you remember about {{deal_name}}?" to see what context it has stored. This is useful for verifying information before important meetings.
:::

## Privacy

- Memories are **private to each user** — other team members cannot see your Copilot''s memories
- Memories are **organisation-scoped** — they don''t leak between organisations
- You can **delete memories** by asking: "Forget what you know about [topic]"
- Automatic **retention policies** archive memories after 365 days

:::warning
Copilot conversations and memories are always private. Even organisation admins cannot read other users'' conversations. This is enforced at the database level and cannot be overridden.
:::
', true, 52, '{}'),

-- ============================================================================
-- INTEGRATIONS
-- ============================================================================

('integration-hubspot', 'HubSpot Integration', 'Integrations', E'# HubSpot Integration

Connect HubSpot to sync your contacts, companies, and deals bidirectionally with 60.

## Setup

:::beginner
### Connecting HubSpot

1. Go to **Integrations > HubSpot**
2. Click **Connect HubSpot**
3. Sign in to your HubSpot account and authorise the connection
4. Select which objects to sync (Contacts, Companies, Deals)
5. Click **Save**

The initial sync will import your existing HubSpot data. This may take a few minutes depending on the volume.
:::

## Sync Configuration

### Sync Direction

Choose how data flows between 60 and HubSpot:

| Direction | What Happens |
|-----------|-------------|
| **HubSpot → 60** | HubSpot is the source of truth. Changes in HubSpot sync to 60. |
| **60 → HubSpot** | 60 is the source of truth. Changes in 60 sync back to HubSpot. |
| **Bidirectional** | Changes in either system sync to the other. Last write wins. |

:::warning
Bidirectional sync uses a "last write wins" conflict resolution strategy. If the same field is updated in both systems simultaneously, the most recent change will be kept.
:::

### Field Mapping

Map HubSpot properties to 60 fields:

:::intermediate
#### Default Mappings

| HubSpot Property | 60 Field | Sync |
|-----------------|----------|------|
| First Name | first_name | Bi-directional |
| Last Name | last_name | Bi-directional |
| Email | email | Bi-directional |
| Company | company_name | Bi-directional |
| Phone | phone | Bi-directional |
| Deal Name | name | Bi-directional |
| Deal Amount | value | Bi-directional |
| Deal Stage | stage | Bi-directional |

You can customise these mappings in **Integrations > HubSpot > Field Mapping**.
:::

## Ops Integration

With HubSpot connected, you can create Ops Tables directly from HubSpot data:

1. Go to **Ops**
2. Click **Create Table > HubSpot Source**
3. Select the object type (Contacts, Companies, Deals)
4. Choose a HubSpot list or filter to import
5. Map columns and start querying with AI

:::tip
Use HubSpot lists to create focused Ops Tables. For example, create a table from your "Enterprise Prospects" list and query it with AI: "Which enterprise prospects haven''t been contacted in 30 days?"
:::

## Troubleshooting

### Sync Errors

If you see sync errors:

1. Check your HubSpot API limits (most plans allow 100 requests per 10 seconds)
2. Verify field mapping — ensure required fields are mapped
3. Check for data validation errors (e.g., invalid email formats)
4. Review the sync log in **Integrations > HubSpot > Sync History**

:::note
Sync runs every 15 minutes by default. You can trigger a manual sync from the integration settings page.
:::
', true, 60, '{"required_integrations": ["hubspot"]}'),

-- ============================================================================

('integration-slack', 'Slack Integration', 'Integrations', E'# Slack Integration

Connect Slack to receive pipeline alerts, meeting briefs, task reminders, and interact with the Copilot directly from Slack.

## Setup

1. Go to **Integrations > Slack**
2. Click **Connect Workspace**
3. Select the Slack workspace to connect
4. Choose a default notification channel
5. Authorise the connection

## Notifications

### Pipeline Alerts

Get notified in Slack when:

| Event | Default Channel | Customisable |
|-------|----------------|-------------|
| Deal won | #wins | Yes |
| Deal lost | #pipeline | Yes |
| Deal stage change | #pipeline | Yes |
| Deal stalled (7+ days) | #pipeline | Yes |
| New deal created | #pipeline | Yes |

:::tip
Create a dedicated #wins channel and celebrate every closed deal with your team. Win notifications include deal value, owner, and key contacts.
:::

### Meeting Notifications

- **Pre-meeting briefs**: Sent 2 hours before external meetings
- **Post-meeting summaries**: Sent after transcript processing
- **Action item reminders**: Daily digest of outstanding items

### Task Reminders

- **Overdue tasks**: Daily notification of past-due tasks
- **Due today**: Morning summary of today''s tasks
- **Assigned to you**: Instant notification when tasks are assigned

## Copilot in Slack

Use the Copilot directly in Slack:

```
/60 prep for my next meeting
/60 how is the Acme deal doing?
/60 what tasks are overdue?
```

:::info
Slack commands use the same Copilot skills as the in-app experience. The Copilot remembers context across both Slack and the web app.
:::

## Deal Rooms

Create dedicated Slack channels for important deals:

1. Open a deal in 60
2. Click **Create Deal Room**
3. A new Slack channel is created with relevant team members
4. All deal updates are posted automatically

:::intermediate
### Deal Room Notifications

Deal rooms receive automatic updates for:

- Meeting summaries involving deal contacts
- Task completions related to the deal
- Stage changes and health score updates
- Email activity with deal contacts
:::
', true, 61, '{"required_integrations": ["slack"]}'),

-- ============================================================================

('integration-fathom', 'Fathom Integration', 'Integrations', E'# Fathom Integration

Fathom automatically records and transcribes your meetings, with full integration into 60''s Meeting Intelligence.

## Setup

1. Go to **Integrations > Fathom**
2. Click **Connect Fathom**
3. Sign in with your Fathom credentials
4. Map team members to their Fathom accounts

## How It Works

1. Fathom records your Zoom, Google Meet, or Teams calls
2. Transcripts and AI summaries sync to 60 automatically
3. Meeting Intelligence indexes the content for search
4. Action items are extracted and available for task creation

## User Mapping

Each team member needs to be mapped to their Fathom account:

1. Go to **Integrations > Fathom > User Mapping**
2. For each team member, select their corresponding Fathom user
3. Only mapped users'' meetings will sync

:::tip
If a team member joins later, just add their mapping — historical transcripts from their Fathom account will be imported during the next sync.
:::

## What Syncs

| Data | Description |
|------|------------|
| Transcripts | Full meeting transcripts with speaker labels |
| AI Summaries | Fathom-generated meeting summaries |
| Action Items | Detected action items and follow-ups |
| Recording URLs | Links to video recordings in Fathom |
| Meeting Metadata | Duration, attendees, date/time |

:::note
Video recordings remain hosted by Fathom. 60 stores transcript text and metadata locally for fast search and AI analysis.
:::
', true, 62, '{"required_integrations": ["fathom"]}'),

-- ============================================================================

('integration-60-notetaker', '60 Notetaker', 'Integrations', E'# 60 Notetaker

The 60 Notetaker is our built-in meeting recording bot. It joins your meetings automatically, records the conversation, and stores everything permanently on S3.

## Key Advantages

- **Permanent storage**: Recordings stored on S3, URLs never expire
- **Auto-join**: Automatically joins scheduled meetings
- **Full transcription**: High-accuracy transcription via Gladia
- **No external accounts**: Works directly with your 60 subscription

## Setup

1. Go to **Integrations > 60 Notetaker**
2. Enable **Auto-Join**
3. Configure which meetings to join:
   - External meetings only (recommended)
   - All meetings
   - Meetings matching specific keywords
4. Set minimum attendee count (default: 2)

:::warning
The bot will appear as "60 Notetaker" in the meeting. It announces itself in the meeting chat. Make sure meeting participants are aware of recording.
:::

## How Recording Works

1. **Scheduling**: The auto-join scheduler checks your calendar every 2 minutes
2. **Joining**: Bot joins 1-2 minutes before the meeting start time
3. **Recording**: Full audio and video are captured
4. **Upload**: After the meeting, recording is uploaded to S3 (streaming, no buffering)
5. **Transcription**: Sent to Gladia for high-accuracy async transcription
6. **Processing**: Transcript processed, AI summary generated, indexed for search

:::info
Recordings are typically available within 5-10 minutes of the meeting ending. Transcription may take slightly longer for very long meetings.
:::

## Storage

All recordings are stored on AWS S3:

- **Path**: `meeting-recordings/{org_id}/{user_id}/{recording_id}/`
- **Formats**: Video (MP4) and Audio (M4A)
- **Thumbnails**: Auto-generated from the video
- **Retention**: Permanent (no auto-deletion)

:::tip
You can monitor storage usage and costs in **Settings > Platform > S3 Storage**. The admin dashboard shows total storage, monthly costs, and projections.
:::
', true, 63, '{"required_integrations": ["meetingbaas"]}'),

-- ============================================================================

('integration-fireflies', 'Fireflies Integration', 'Integrations', E'# Fireflies Integration

Connect Fireflies to sync meeting transcripts and AI-generated summaries into 60.

## Setup

1. Go to **Integrations > Fireflies**
2. Click **Connect Fireflies**
3. Authorise with your Fireflies account
4. Map team members to their Fireflies accounts

## What Syncs

| Data | Description |
|------|------------|
| Transcripts | Full meeting transcripts with speaker identification |
| AI Summaries | Fireflies-generated meeting summaries |
| Action Items | Detected follow-up items |
| Key Topics | Main discussion themes |
| Meeting Metadata | Duration, participants, recording date |

## User Mapping

1. Navigate to **Integrations > Fireflies > User Mapping**
2. Match each 60 team member to their Fireflies account
3. Save the mapping

:::info
Only mapped users'' meetings will sync. Unmapped Fireflies users'' meetings are ignored to prevent unwanted data in your workspace.
:::

## Meeting Intelligence

Once connected, all Fireflies transcripts are:

- Indexed for **semantic search** in Meeting Intelligence
- Linked to **contacts** and **deals** in your CRM
- Available for the **Copilot** to reference during conversations
- Included in **pre-meeting briefs** for relevant attendees

:::tip
Fireflies transcripts work seamlessly alongside Fathom and 60 Notetaker transcripts. You can search across all providers in a single query.
:::
', true, 64, '{"required_integrations": ["fireflies"]}'),

-- ============================================================================

('integration-apollo', 'Apollo Integration', 'Integrations', E'# Apollo Integration

Use Apollo to search for leads and enrich your contact data directly within 60.

## What You Can Do

- **Search for leads** using Apollo''s 275M+ contact database
- **Enrich contacts** with verified emails, phone numbers, and company data
- **Create Ops Tables** from Apollo search results
- **Push leads** to outreach campaigns

## Searching for Leads

### From the Search Page

1. Navigate to **Apollo Search** in the sidebar
2. Enter your search criteria:
   - Job titles (e.g., "VP of Sales", "CTO")
   - Company size, industry, location
   - Technologies used
   - Revenue range
3. Click **Search**
4. Browse results and import contacts

### From the Copilot

Ask the Copilot to search Apollo:

> "Find CTOs at SaaS companies in London with 50-200 employees"

The Copilot will run the Apollo search and present results in a formatted card.

## Creating Ops Tables from Apollo

Turn any Apollo search into a dynamic Ops Table:

1. Run your Apollo search
2. Click **Create Table from Results**
3. Choose which fields to include as columns
4. The table is created with all matching contacts
5. Query with AI: "Which of these contacts have the highest engagement scores?"

:::tip
Apollo-powered Ops Tables combine Apollo''s enrichment data with 60''s AI query engine. Ask questions like "Show me VP-level contacts at companies using Salesforce with more than 100 employees."
:::

:::warning
Apollo searches consume API credits. Check your Apollo plan''s credit balance at apollo.io before running large searches.
:::
', true, 65, '{"required_integrations": ["apollo"]}'),

-- ============================================================================

('integration-instantly', 'Instantly Integration', 'Integrations', E'# Instantly Integration

Connect Instantly to manage cold email campaigns directly from 60. Push leads from Apollo searches or Ops Tables into Instantly campaigns.

## Setup

1. Go to **Integrations > Instantly**
2. Enter your Instantly API key
3. Click **Connect**

## Creating Campaigns

### From 60

1. Select contacts from an Ops Table or Apollo search
2. Click **Push to Instantly**
3. Choose an existing campaign or create a new one
4. Configure sending settings:
   - **Sending accounts**: Select which email accounts to use
   - **Daily send limit**: Maximum emails per day per account
   - **Schedule**: Days and hours to send

:::intermediate
### Campaign Schedule Configuration

When creating a campaign, you need to set a schedule:

- **Days**: Which days of the week to send (e.g., Monday-Friday)
- **Hours**: Start time and end time (e.g., 9am - 5pm)
- **Timezone**: The timezone for sending

:::warning
**Important**: Instantly uses a restricted timezone list. Not all IANA timezone names are valid.

**Valid timezones include**: America/Chicago, America/Detroit, America/Anchorage, Europe/Belgrade, Europe/Helsinki, Europe/Istanbul, Asia/Kolkata, Asia/Hong_Kong, Australia/Melbourne, Pacific/Auckland

**Invalid timezones** (will cause errors): America/New_York, America/Los_Angeles, Europe/London, Europe/Paris, UTC

The default timezone in 60 is set to America/Chicago. Change this in campaign settings if needed.
:::
:::

## Pushing Leads

### From Ops Tables

1. Open an Ops Table with contact data
2. Select rows (or select all)
3. Click **Actions > Push to Instantly**
4. Choose a campaign
5. Map columns to Instantly fields (email, first name, last name, company)
6. Confirm and push

### From Apollo Search

After running an Apollo search:

1. Select contacts from results
2. Click **Push to Instantly**
3. Follow the same campaign selection flow

:::tip
Always verify email addresses before pushing to Instantly. Apollo''s verified emails have the highest deliverability. Look for the "verified" badge on contacts.
:::

## Monitoring Campaigns

View campaign status from 60:

- **Active campaigns**: See running campaigns and their stats
- **Lead status**: Track which leads have been contacted
- **Reply detection**: See who has replied (syncs from Instantly)
', true, 66, '{"required_integrations": ["instantly"]}'),

-- ============================================================================

('integration-justcall', 'JustCall Integration', 'Integrations', E'# JustCall Integration

Connect JustCall to sync call recordings, transcripts, and activity data into 60.

## Setup

1. Go to **Integrations > JustCall**
2. Click **Connect JustCall**
3. Authorise with your JustCall account
4. Map team members to their JustCall users

## What Syncs

| Data | Description |
|------|------------|
| Call recordings | Audio recordings of calls |
| Transcripts | AI-transcribed call content |
| Call metadata | Duration, direction (inbound/outbound), result |
| Contact matching | Calls matched to 60 contacts by phone number |

## Meeting Intelligence

JustCall calls appear alongside meeting transcripts in Meeting Intelligence:

- Search across both meetings and calls in one query
- Filter by source type (Meeting vs Call)
- AI summaries generated for calls just like meetings

:::tip
Enable "Auto-log calls" to automatically create activity records in 60 when calls are made or received through JustCall.
:::

## Activity Logging

All JustCall calls are automatically logged to the contact''s activity timeline:

- **Outbound calls**: "Called {{contact_name}} via JustCall (5 min)"
- **Inbound calls**: "Received call from {{contact_name}} via JustCall (3 min)"
- **Missed calls**: "Missed call from {{contact_name}}"

These activities count towards contact engagement scoring and deal health calculations.

:::info
Call transcripts from JustCall are available in the Copilot''s context. Ask "What did {{contact_name}} say on our last call?" to get a summary.
:::
', true, 67, '{"required_integrations": ["justcall"]}'),

-- ============================================================================
-- ADMIN & SETTINGS
-- ============================================================================

('admin-settings', 'Admin Settings Overview', 'Admin & Settings', E'# Admin Settings

This guide covers all the configuration options available to organisation administrators.

## Organisation Settings

### General

- **Organisation name**: Displayed across the platform
- **Default timezone**: Used for scheduling and notifications
- **Default currency**: Used for deal values and pipeline metrics

### Data Sharing

Control what data is shared within your organisation:

| Setting | Default | Description |
|---------|---------|------------|
| CRM sharing | Enabled | Team members can see each other''s contacts and deals |
| Meeting sharing | Enabled | Team members can see each other''s meeting transcripts |
| Task sharing | Disabled | Tasks are private to the assigned user |
| Email sharing | Disabled | Email activity is private to each user |
| Copilot sharing | **Always off** | Conversations are always private (enforced) |

:::warning
Copilot conversation privacy is enforced at the database level. Even admin users cannot view other team members'' Copilot conversations. This protects sensitive strategic discussions.
:::

### Security

- **Audit logging**: All actions are logged for security review
- **Rate limiting**: Automatic protection against unusual activity patterns
- **API key rotation**: Rotate service keys on a quarterly schedule

## Integration Management

All integrations are managed from **Integrations**:

- View connected integrations and their status
- Configure sync settings per integration
- View sync history and error logs
- Disconnect integrations when needed

:::tip
Review integration sync logs weekly to catch and resolve any mapping or data quality issues early.
:::

## Pipeline Configuration

### Stages

Customise your deal pipeline stages:

1. Go to **Settings > Pipeline**
2. Add, remove, or reorder stages
3. Set probability percentages for each stage
4. Configure automation rules per stage

### Default Stages

| Stage | Probability | Description |
|-------|------------|------------|
| SQL | 20% | Sales Qualified Lead |
| Opportunity | 50% | Active opportunity, in discussions |
| Verbal | 80% | Verbal commitment received |
| Signed | 100% | Contract signed, deal won |

:::info
The weighted pipeline value is calculated by multiplying each deal''s value by its stage probability. This gives a more realistic forecast than raw pipeline value.
:::

## AI Configuration

### Copilot Settings

- **AI Provider**: Choose between Google Gemini and Anthropic Claude
- **Model Selection**: Select the specific model version
- **Custom Prompts**: Add organisation-specific instructions to the Copilot
- **Skill Management**: Enable/disable specific Copilot skills

### Onboarding Data

The Copilot''s persona is built from your onboarding data:

- Company information (products, competitors, value propositions)
- Brand voice and tone preferences
- Industry-specific terminology
- Key differentiators and positioning

:::note
You can update onboarding data at any time from **Settings > AI > Company Profile**. Changes will be reflected in the Copilot''s next conversation.
:::
', true, 70, '{"target_roles": ["admin"]}'),

-- ============================================================================

('team-management', 'Team Management', 'Admin & Settings', E'# Team Management

Manage your team members, roles, and permissions within 60.

## Inviting Team Members

1. Go to **Settings > Team**
2. Click **Invite Member**
3. Enter their email address
4. Select a role (Admin or Member)
5. Click **Send Invite**

The invited user will receive an email with a link to join your organisation.

:::tip
Invite your entire sales team at once — there''s no limit on team size. The more team members using 60, the richer the collective intelligence.
:::

## Roles and Permissions

| Permission | Admin | Member | Viewer |
|-----------|-------|--------|--------|
| View own data | Yes | Yes | Yes |
| View team data (if sharing enabled) | Yes | Yes | Yes |
| Create/edit deals | Yes | Yes | No |
| Create/edit contacts | Yes | Yes | No |
| Manage integrations | Yes | No | No |
| Invite/remove members | Yes | No | No |
| Configure pipeline | Yes | No | No |
| Access admin settings | Yes | No | No |
| View platform analytics | Yes | No | No |
| Use Copilot | Yes | Yes | Yes |
| View documentation | Yes | Yes | Yes |

:::info
Every organisation has at least one Admin. The person who creates the organisation is automatically assigned the Admin role.
:::

## Managing Existing Members

### Changing Roles

1. Go to **Settings > Team**
2. Find the team member
3. Click the role dropdown
4. Select the new role
5. Changes take effect immediately

### Removing Members

1. Go to **Settings > Team**
2. Find the team member
3. Click **Remove**
4. Confirm the removal

:::warning
Removing a team member does **not** delete their data. Their contacts, deals, and activities remain in the system and can be reassigned to another team member.
:::

## Best Practices

:::beginner
### Getting Your Team Started

1. **Admin setup first**: Configure integrations and pipeline before inviting the team
2. **Invite in batches**: Send invites to your sales team together
3. **Onboarding session**: Walk through the key features as a team
4. **Enable sharing**: Turn on CRM and meeting sharing so the team benefits from collective data
:::

:::intermediate
### Optimising Team Usage

- **Assign deal owners**: Ensure every deal has a clear owner
- **Configure notifications**: Help each member set up their preferred Slack notifications
- **Review pipeline weekly**: Use the admin pipeline view for team standups
- **Monitor adoption**: Check which team members are using the platform regularly
:::
', true, 71, '{"target_roles": ["admin"]}');
