-- Seed Core Platform Documentation Content
-- 9 articles covering: Getting Started (2), Pipeline & Deals (2), Contacts & CRM (2), Tasks & Activity (3)

INSERT INTO docs_articles (slug, title, category, content, published, order_index, metadata) VALUES

-- ============================================================================
-- GETTING STARTED
-- ============================================================================

('getting-started', 'Welcome to 60', 'Getting Started', E'# Welcome to 60, {{user_first_name}}

60 is your pre- and post-meeting command centre. It brings together pipeline tracking, contact intelligence, meeting preparation, AI-powered insights, and task automation into one platform so your sales team can spend less time on admin and more time closing deals.

This guide walks you through the key areas of the platform and helps you find your footing quickly.

## What 60 Does

At its core, 60 helps you with three things:

1. **Prepare for meetings** -- automatically surface briefs, talking points, deal context, and relationship history before every call.
2. **Act on insights afterwards** -- capture follow-ups, update deal stages, log activities, and keep your pipeline honest.
3. **Stay on top of your pipeline** -- health scoring, stale-deal alerts, and proactive nudges so nothing falls through the cracks.

:::tip
60 works best when your calendar is connected. The platform uses your upcoming meetings to proactively prepare briefs and suggest actions -- no manual effort required.
:::

## Platform Overview

Here is a quick map of the main sections you will use day to day:

### Pipeline

The pipeline is where all of your active deals live. You can view them as a **kanban board** (drag cards between stages) or as a **table** (sort, filter, and bulk-edit). Each deal card shows the health score, next meeting, and days in stage at a glance.

### Contacts

Your contact database with enrichment, activity timelines, and relationship intelligence. Import contacts from your CRM or add them manually. 60 automatically links contacts to deals, meetings, and activity history.

### Meetings

See all upcoming and past meetings in one place. 60 connects to your Google Calendar and can auto-join meetings with the 60 Notetaker to record, transcribe, and analyse conversations. Pre-meeting briefs are generated automatically.

### Tasks

A smart task list that combines manual tasks with AI-generated follow-ups. Tasks can be linked to deals, contacts, and meetings so nothing is orphaned.

### AI Copilot

Your dedicated AI sales teammate. Ask it to prepare meeting briefs, draft follow-up emails, analyse deal health, or research a prospect. It knows your pipeline, your contacts, and your meeting history -- and it gets smarter over time.

### Ops

Interactive, AI-powered tables built on top of your CRM data. Query in natural language, enrich with meeting and email data, and automate workflows.

## Your First Steps

:::beginner
Here is a recommended sequence for getting started:

1. **Connect your calendar** -- Go to **Integrations** in the sidebar and connect Google Calendar. This is the single most impactful action you can take.
2. **Import contacts** -- Head to **Contacts** and import from your CRM or upload a CSV.
3. **Create your first deal** -- Navigate to **Pipeline** and click **+ New Deal**. Give it a name, assign a stage, and link a contact.
4. **Explore the Copilot** -- Open the AI Copilot panel and try asking: "What meetings do I have today?"
5. **Review your task list** -- Check **Tasks** for any AI-generated follow-ups from recent meetings.
:::

:::intermediate
Once you are comfortable with the basics:

- **Set up the 60 Notetaker** to auto-join and record your meetings
- **Customise pipeline stages** to match your sales process
- **Enable Smart Tasks** to auto-generate follow-ups from meeting transcripts
- **Explore Ops** to build dynamic tables and run natural language queries
:::

:::advanced
Power-user features to explore:

- **Copilot Skills & Sequences** -- multi-step AI workflows (meeting prep, deal rescue plans, follow-up packs)
- **Proactive Slack notifications** -- daily pipeline summaries, pre-meeting briefs, stale deal alerts
- **API integrations** -- connect HubSpot, Apollo, Instantly, and more
- **Custom workflows** -- automate data enrichment, routing, and alerting in Ops
:::

## Getting Help

If you get stuck, there are several ways to find answers:

- **These docs** -- browse by category in the sidebar or use search.
- **AI Copilot** -- ask the copilot a question directly. It can explain features, look up data, and walk you through workflows.
- **In-app tooltips** -- hover over icons and labels for quick explanations.
- **Support** -- reach out to our team via the help menu.

:::info
{{org_name}} may have custom workflows and integrations configured. If something looks different from these docs, check with your admin or ask the Copilot for guidance specific to your organisation.
:::

## Next Steps

- [Onboarding Guide](#onboarding-guide) -- understand how the AI personalises to your team
- [Pipeline Guide](#pipeline-guide) -- master deal management
- [Contacts Guide](#contacts-guide) -- import and manage your contacts

Welcome aboard, {{user_first_name}}. Let''s close some deals.
', true, 1, '{}'),


-- ============================================================================

('onboarding-guide', 'Onboarding Guide', 'Getting Started', E'# Onboarding Guide

When your organisation first signs up for 60, the platform runs a structured onboarding process that configures the AI to understand your business. This is not a generic setup wizard -- it is the foundation of everything the Copilot does for you.

## Why Onboarding Matters

The AI Copilot is designed to act like a **dedicated team member**, not a generic chatbot. For it to reference your deals by name, understand your competitive landscape, and speak in your brand voice, it needs to learn about your company first.

After onboarding, the Copilot knows:
- Your company name, products, and value propositions
- Your competitors and how you differentiate
- Your ideal customer profile and pain points you solve
- Your brand tone and communication style
- Your team members and their roles

:::tip
The more detail you provide during onboarding, the more useful the Copilot becomes. Think of it as training a new hire -- the investment pays off quickly.
:::

## What Happens During Onboarding

### Step 1: Company Profile

Your admin provides basic company information:

- **Company name and domain** -- used to identify your brand across integrations
- **Industry and company size** -- helps the AI calibrate advice for your context
- **Products and services** -- the Copilot references these when preparing meeting briefs and drafting emails
- **Value propositions** -- key differentiators the AI highlights in competitive situations

:::beginner
This information is entered in a simple form during the setup wizard. You can update it at any time from **Settings > Organisation > Company Profile**.
:::

### Step 2: Competitive Landscape

You tell 60 about the competitors you encounter most often:

- **Competitor names** -- the AI will flag when prospects mention these in meetings
- **Positioning notes** -- how you differentiate against each competitor
- **Win/loss patterns** -- what tends to tip deals in your favour or against you

:::intermediate
The Copilot uses competitive intelligence in several ways:
- Pre-meeting briefs include relevant competitive positioning when the prospect is evaluating alternatives
- Deal rescue plans reference competitor weaknesses
- Email drafts avoid claims that competitors can easily counter
:::

### Step 3: Sales Process Configuration

Your admin maps the sales process into 60:

- **Pipeline stages** -- define the stages deals move through (e.g., Discovery, Demo, Proposal, Negotiation, Closed Won)
- **Stage criteria** -- what needs to happen before a deal can advance
- **Typical sales cycle** -- average length in days, which helps the AI detect stalled deals
- **Deal size tiers** -- thresholds for categorising deals (e.g., SMB, Mid-Market, Enterprise)

:::info
You can always change your pipeline stages later. The AI adapts automatically when stages are renamed, reordered, or added.
:::

### Step 4: Integration Connections

Connect the tools your team already uses:

- **Google Calendar** -- enables meeting preparation and the 60 Notetaker
- **HubSpot** -- two-way CRM sync for contacts, deals, and companies
- **Slack** -- proactive notifications, pipeline alerts, and HITL confirmations
- **Email** -- activity tracking and follow-up suggestions

:::beginner
You do not need to connect everything on day one. Start with Google Calendar (for meeting prep) and add other integrations as you need them.
:::

:::advanced
For organisations with complex integration needs:
- **Apollo** -- lead enrichment and prospecting data
- **Instantly** -- outbound email campaign integration
- **Custom webhooks** -- trigger 60 workflows from external events
:::

### Step 5: AI Persona Compilation

Once your information is entered, 60 compiles a **specialised persona** for your organisation. This persona is injected into every Copilot interaction and includes:

```
You are {{user_first_name}}''s dedicated sales analyst at {{org_name}}.
Think of yourself as their brilliant junior colleague who has superpowers.

COMPANY KNOWLEDGE:
- Products: [compiled from onboarding]
- Competitors: [compiled from onboarding]
- Pain points: [compiled from onboarding]
- Brand voice: [compiled from onboarding]
```

:::warning
The persona compilation happens automatically. You do not need to write any prompts or configure the AI manually. Just provide accurate company information and the system handles the rest.
:::

## After Onboarding

Once onboarding is complete, the AI is immediately active. Here is what changes:

### Before Onboarding
```
You: "Help me with my meeting"
AI:  "I''d be happy to help! What meeting would you like assistance with?"
```

### After Onboarding
```
AI (proactively, 2 hours before your meeting):
"Hey {{user_first_name}}! Your {{meeting_title}} is in 2 hours.
I''ve prepared a brief with talking points.
They''re evaluating us against [Competitor] -- I have positioning ready."
```

The difference is dramatic. The AI stops being a generic assistant and starts acting like a knowledgeable colleague.

## Updating Your Onboarding Data

Your business evolves, and 60 should evolve with it.

:::beginner
To update your company profile, go to **Settings > Organisation > Company Profile**. Changes take effect immediately -- the persona is recompiled automatically.
:::

:::intermediate
You can update specific sections without re-running the full onboarding:
- **Products** -- add new products or retire old ones
- **Competitors** -- add emerging competitors or update positioning
- **Team members** -- invite new reps, update roles
- **Integrations** -- connect or disconnect tools
:::

:::advanced
60 also learns passively over time through:
- **Meeting transcripts** -- the AI picks up on competitor mentions, product questions, and objections
- **Deal outcomes** -- win/loss patterns refine the competitive intelligence
- **Copilot memory** -- facts, preferences, and commitments from your conversations are automatically stored and recalled

This means the AI gets smarter the more you use it, even without manual updates to the onboarding data.
:::

## Team Onboarding

When new team members join {{org_name}} on 60:

1. They are automatically assigned the organisation''s compiled persona
2. They inherit all company knowledge, competitive intelligence, and process configuration
3. They get access to shared pipeline views, contact data, and meeting history
4. The Copilot immediately knows their name, role, and assigned deals

:::tip
New reps can ask the Copilot: "Give me a summary of my assigned deals" on their very first day. The AI will pull in deal context, meeting history, and next steps -- dramatically reducing ramp-up time.
:::

## Next Steps

- [Pipeline Guide](#pipeline-guide) -- set up and manage your deals
- [Contacts Guide](#contacts-guide) -- import and organise your contact database
- [Tasks Guide](#tasks-guide) -- understand task management and smart automation
', true, 2, '{}'),


-- ============================================================================
-- PIPELINE & DEALS
-- ============================================================================

('pipeline-guide', 'Pipeline & Deal Management', 'Pipeline & Deals', E'# Pipeline & Deal Management

Your pipeline is the heartbeat of your sales operation. 60 gives you two ways to view and manage deals -- a **kanban board** for visual pipeline management and a **table view** for data-heavy analysis -- plus AI-powered insights that surface risks and opportunities automatically.

## Creating Deals

:::beginner
To create a new deal:

1. Navigate to **Pipeline** in the sidebar
2. Click **+ New Deal** in the top-right corner
3. Fill in the essentials:
   - **Deal name** -- a descriptive name (e.g., "{{company_name}} - Enterprise Plan")
   - **Stage** -- where the deal currently sits in your pipeline
   - **Value** -- expected deal value
   - **Close date** -- target close date
   - **Contact** -- primary contact associated with the deal
4. Click **Create**

Your deal appears immediately on the kanban board in the selected stage.
:::

:::tip
Use a consistent naming convention for deals. A good pattern is: **Company Name - Product/Plan**. This makes it easy to search and sort.
:::

## Pipeline Views

### Kanban Board

The kanban board displays deals as cards organised by stage. Each card shows:

- Deal name and value
- Primary contact
- Health score (colour-coded dot)
- Days in current stage
- Next scheduled meeting (if any)

:::beginner
**Moving deals between stages**: Simply drag a deal card from one stage column to another. The stage change is saved automatically and logged in the activity timeline.
:::

:::intermediate
**Kanban customisation**:
- **Column order** -- reflects your pipeline stage configuration (set in Settings)
- **Card fields** -- choose which fields appear on deal cards
- **Filters** -- filter by owner, health score, value range, or close date
- **Sorting** -- within each column, sort by value, close date, or days in stage
:::

### Table View

Switch to table view for a spreadsheet-like interface. This is ideal for:

- Bulk editing deal properties
- Sorting and filtering across the entire pipeline
- Exporting data
- Comparing deals side by side

:::intermediate
**Table view features**:
- Click any cell to edit inline
- Multi-select rows for bulk actions (change stage, assign owner, update close date)
- Column resizing and reordering
- Quick filters in column headers
- Export to CSV
:::

## Deal Detail Page

Click on any deal to open its detail page. Here you will find everything related to {{deal_name}}:

### Overview Tab
- Deal properties (stage, value, close date, probability)
- Health score with breakdown
- Owner and collaborators
- Associated contacts and company

### Activity Tab
- Complete timeline of every interaction: meetings, emails, calls, notes, stage changes
- Linked tasks and their status
- AI-generated insights and suggestions

### Meetings Tab
- All meetings associated with this deal
- Transcripts and recordings (if 60 Notetaker is enabled)
- Pre-meeting briefs and post-meeting summaries

### Tasks Tab
- Tasks linked to this deal
- Completed, in-progress, and upcoming items
- AI-suggested follow-ups

:::beginner
**Quick actions on the deal page**:
- Click the stage badge to move the deal to a different stage
- Click the value to update it
- Use the **+ Add** buttons to create notes, tasks, or log activities directly on the deal
:::

## Stage Workflow

Your pipeline stages define the journey a deal takes from first contact to closed. The default stages are:

| Stage | Description |
|-------|------------|
| **Lead** | Initial interest identified |
| **Qualified** | Budget, authority, need, and timeline confirmed |
| **Discovery** | Deeper needs analysis and solution mapping |
| **Demo** | Product demonstration delivered |
| **Proposal** | Formal proposal or quote sent |
| **Negotiation** | Terms being finalised |
| **Closed Won** | Deal signed and completed |
| **Closed Lost** | Deal did not proceed |

:::intermediate
**Customising stages**:

Your admin can customise pipeline stages in **Settings > Pipeline**:
- Add, rename, or reorder stages
- Set win probability percentages per stage
- Define stage entry criteria (what should be true before a deal enters this stage)
- Mark stages as "closed" (won or lost)

The AI uses stage configuration to calculate forecasts and detect deals that skip steps.
:::

:::advanced
**Stage change triggers**:

When a deal changes stage, 60 can automatically:
- Create follow-up tasks (e.g., "Send proposal" when moving to Proposal stage)
- Send Slack notifications to the team
- Update the Copilot''s memory with the new context
- Recalculate deal health and pipeline forecasts
- Log the change with a timestamp for velocity tracking

These triggers are configurable per stage in the pipeline settings.
:::

## Working with Deals Day to Day

### Updating Deal Properties

:::beginner
On the kanban board, click a deal card to expand it. You can quickly update:
- **Value** -- click the dollar amount
- **Close date** -- click the date
- **Stage** -- drag the card or use the stage dropdown
- **Owner** -- reassign from the detail page
:::

### Searching and Filtering

:::intermediate
Use the filter bar above the pipeline to narrow your view:
- **Owner** -- see only your deals or a specific rep''s pipeline
- **Stage** -- focus on deals in Negotiation or Proposal
- **Health** -- show only at-risk deals (red/amber health scores)
- **Value range** -- filter by minimum or maximum deal value
- **Close date** -- deals closing this week, this month, this quarter

Filters can be combined and saved as views for quick access.
:::

### Pipeline Metrics

At the top of the pipeline page, you will see summary metrics:

- **Total pipeline value** -- sum of all active deals
- **Weighted pipeline** -- value adjusted by stage probability
- **Average deal size** -- mean value across active deals
- **Average days in stage** -- how long deals sit before moving
- **Win rate** -- percentage of deals that close won (trailing 90 days)

:::advanced
**Forecasting**:

60 calculates a weighted forecast based on:
- Deal value multiplied by stage probability
- Health score adjustment (at-risk deals are discounted)
- Historical conversion rates from your pipeline data

The Copilot can generate a forecast summary on demand: just ask "What does our pipeline forecast look like for this quarter?"
:::

## Bulk Operations

:::intermediate
In table view, you can perform bulk operations:

1. Select multiple deals using checkboxes
2. Choose an action from the bulk actions menu:
   - **Move to stage** -- advance or regress selected deals
   - **Assign owner** -- reassign to a different rep
   - **Update close date** -- push or pull close dates
   - **Add tag** -- categorise deals
   - **Delete** -- remove selected deals (with confirmation)
:::

:::warning
Bulk stage changes are logged individually in each deal''s activity timeline. This means your activity history remains accurate even when making mass updates.
:::

## Next Steps

- [Deal Health Scoring](#deal-health-scoring) -- understand how health scores work and how to improve them
- [Tasks Guide](#tasks-guide) -- manage follow-ups associated with your deals
- [Contacts Guide](#contacts-guide) -- link contacts and companies to deals
', true, 10, '{}'),


-- ============================================================================

('deal-health-scoring', 'Deal Health Scoring', 'Pipeline & Deals', E'# Deal Health Scoring

Every deal in your pipeline has a health score -- a dynamic, AI-calculated indicator of how likely the deal is to close successfully. Health scores help you focus your energy where it matters most: on deals that need attention before it is too late.

## How Health Scores Work

Health scores range from **0 to 100** and are colour-coded for quick visual scanning:

| Score Range | Colour | Meaning |
|------------|--------|---------|
| 80-100 | Green | Healthy -- deal is progressing well |
| 60-79 | Yellow | Needs attention -- some risk indicators present |
| 40-59 | Orange | At risk -- multiple warning signs detected |
| 0-39 | Red | Critical -- deal is likely to stall or be lost |

:::beginner
You will see health scores in several places:
- **Kanban board** -- coloured dot on each deal card
- **Table view** -- dedicated health column with score and colour
- **Deal detail page** -- expanded breakdown of all scoring factors
- **Pipeline summary** -- aggregate health across your pipeline
:::

## Scoring Factors

The health score for {{deal_name}} is calculated from multiple signals. Each factor contributes positively or negatively to the overall score.

### Engagement Signals (Weight: 35%)

How actively is the prospect engaged?

| Signal | Positive | Negative |
|--------|----------|----------|
| **Meeting frequency** | Regular meetings scheduled | No meeting in 14+ days |
| **Email activity** | Replies within 48 hours | No replies in 7+ days |
| **Multi-threading** | Multiple contacts engaged | Single-threaded (one contact only) |
| **Inbound interest** | Prospect initiates contact | All outreach is one-directional |

:::intermediate
**Multi-threading** is one of the strongest health indicators. Deals with 3+ contacts engaged close at nearly twice the rate of single-threaded deals. 60 tracks contact engagement automatically and flags single-threaded deals.
:::

### Pipeline Velocity (Weight: 25%)

Is the deal progressing at a healthy pace?

| Signal | Positive | Negative |
|--------|----------|----------|
| **Days in stage** | Within normal range for stage | Exceeds average by 50%+ |
| **Stage progression** | Moving forward steadily | Stalled or regressed |
| **Close date adherence** | On track for target date | Close date pushed 2+ times |
| **Momentum** | Recent stage change | No stage change in 30+ days |

:::tip
The "normal range" for days in stage is calculated from your organisation''s historical data. As you close more deals, the benchmarks become more accurate.
:::

### Data Completeness (Weight: 20%)

Is the deal record well-maintained?

| Signal | Positive | Negative |
|--------|----------|----------|
| **Contact linked** | Primary contact assigned | No contact on deal |
| **Value set** | Realistic value entered | No value or $0 |
| **Close date set** | Target close date defined | No close date |
| **Notes/activity** | Recent notes or activities | No notes in 30+ days |
| **Next steps** | Clear next action documented | No next steps defined |

:::beginner
The easiest way to improve a deal''s health score is to fill in missing data. Check the deal detail page for a "Missing Information" banner that tells you exactly what is incomplete.
:::

### Relationship Quality (Weight: 20%)

How strong is the human connection?

| Signal | Positive | Negative |
|--------|----------|----------|
| **Sentiment** | Positive meeting transcripts | Negative sentiment detected |
| **Responsiveness** | Quick replies from prospect | Delayed or no responses |
| **Champion identified** | Internal advocate known | No champion identified |
| **Decision maker access** | DM involved in meetings | No access to DM |

:::advanced
If you have the 60 Notetaker enabled, sentiment analysis runs automatically on meeting transcripts. The AI detects:
- Positive buying signals (budget discussions, timeline commitments, internal advocacy mentions)
- Risk signals (competitor mentions, objections, timeline pushbacks, ghosting patterns)
- Relationship warmth (tone, engagement level, question quality)

This data feeds directly into the relationship quality component of the health score.
:::

## Understanding the Health Breakdown

On the deal detail page, expand the health score to see the full breakdown:

```
Deal: {{deal_name}}
Overall Health: 72 / 100 (Yellow - Needs Attention)

Engagement:        28/35  (Good)
  Meetings:        8/10   Last meeting 3 days ago
  Email activity:  7/10   Reply rate 65%
  Multi-threading: 8/10   4 contacts engaged
  Inbound:         5/5    Prospect initiated last contact

Velocity:          15/25  (Needs Attention)
  Days in stage:   5/10   32 days (avg: 21)  <-- Flag
  Progression:     5/5    Moved forward last week
  Close date:      3/5    Pushed once
  Momentum:        2/5    Slowing

Completeness:      17/20  (Good)
  Contact:         5/5
  Value:           5/5
  Close date:      5/5
  Notes:           2/5    Last note 18 days ago  <-- Flag

Relationship:      12/20  (Needs Attention)
  Sentiment:       4/5    Positive
  Responsiveness:  3/5    Avg reply: 36 hours
  Champion:        5/5    Sarah identified as champion
  DM access:       0/5    No DM in meetings  <-- Flag
```

:::intermediate
The flagged items are your action priorities. In the example above, the three focus areas are:
1. **Days in stage** -- the deal has been in the current stage 50% longer than average. Consider whether it is genuinely progressing or stalling.
2. **Notes** -- no recent notes suggests the deal may be drifting. Log what you know.
3. **DM access** -- no decision maker in meetings is a classic risk signal. Work with your champion to get a meeting with the DM.
:::

## At-Risk Indicators

60 automatically detects and alerts you to at-risk deals. These are the most common warning patterns:

### Going Dark
The prospect has stopped responding. Signals:
- No email replies in 7+ days
- No meetings scheduled
- Last meeting was 14+ days ago
- Calls going to voicemail

:::warning
"Going dark" is the number one predictor of deal loss. 60 flags these deals early so you can intervene before the relationship goes cold. The Copilot can generate a re-engagement plan: ask "Help me re-engage {{deal_name}}."
:::

### Close Date Slippage
The close date has been pushed multiple times. Signals:
- Close date moved 2+ times
- Each push is further out
- No clear reason documented for the delay

### Single Threading
Only one contact is engaged at the prospect''s organisation. If that contact changes roles, goes on leave, or loses interest, the deal has no backup.

### Competitor Displacement
A competitor has entered the evaluation. Signals:
- Competitor mentioned in meeting transcripts
- Prospect asking comparison questions
- Sudden request for pricing or proposal revisions

## Improving Deal Health

:::beginner
**Quick wins** to boost a deal''s health score:
1. Fill in any missing deal properties (value, close date, contact)
2. Schedule a meeting with the prospect
3. Log recent notes about the deal''s status
4. Create a follow-up task with a specific next action
:::

:::intermediate
**Strategic improvements**:
1. **Multi-thread** -- get introduced to additional contacts at the prospect company
2. **Access the DM** -- ask your champion to include the decision maker in the next meeting
3. **Set clear next steps** -- always end meetings with a defined next action and date
4. **Document objections** -- log competitor mentions and objections so the AI can help you address them
:::

:::advanced
**Using the Copilot for deal health**:

Ask the Copilot for targeted help:
- "Analyse the health of {{deal_name}} and suggest improvements"
- "Create a deal rescue plan for {{deal_name}}"
- "What deals in my pipeline are at risk this week?"
- "Compare my pipeline health to last month"

The Copilot will access the full deal context -- meetings, emails, activity history, contact engagement -- and generate specific, actionable recommendations.
:::

## Pipeline Health Dashboard

Beyond individual deal scores, 60 provides a pipeline-level health view:

- **Average health score** across all active deals
- **Distribution chart** showing how many deals are green, yellow, orange, red
- **Trend line** showing health trajectory over time
- **At-risk deals list** sorted by urgency

:::info
The Copilot sends a daily pipeline health summary to Slack (if enabled). This includes the top 3 deals that need attention and specific recommended actions for each.
:::

## Next Steps

- [Pipeline Guide](#pipeline-guide) -- managing deals and stages
- [Tasks Guide](#tasks-guide) -- acting on health score recommendations
- [Smart Tasks](#smart-tasks) -- automatic task creation from health signals
', true, 11, '{}'),


-- ============================================================================
-- CONTACTS & CRM
-- ============================================================================

('contacts-guide', 'Contacts & CRM', 'Contacts & CRM', E'# Contacts & CRM

Your contact database is the foundation of every relationship in 60. Whether you are importing thousands of records from a CRM or adding contacts one at a time, 60 keeps them enriched, organised, and linked to the deals, meetings, and activities that matter.

## Adding Contacts

There are several ways to add contacts to 60:

### Manual Entry

:::beginner
1. Navigate to **CRM** in the sidebar
2. Click **+ New Contact**
3. Fill in the contact details:
   - **Name** -- first and last name
   - **Email** -- primary email address
   - **Company** -- the organisation they belong to
   - **Title** -- their job title or role
   - **Phone** -- optional phone number
4. Click **Save**

The contact is created immediately and you can start linking it to deals and logging activities.
:::

### CSV Import

:::intermediate
For bulk imports:

1. Go to **Contacts > Import**
2. Select **CSV Upload**
3. Upload your CSV file
4. Map your CSV columns to 60 fields (the system auto-detects common column names)
5. Review the preview -- check for duplicates and formatting issues
6. Click **Import**

**CSV tips**:
- Include at minimum: first name, last name, and email
- Use consistent date formats (YYYY-MM-DD recommended)
- Remove duplicate rows before importing
- The importer will flag potential duplicates based on email address
:::

### CRM Import

{{#if hubspot_enabled}}
#### HubSpot Import

Your HubSpot integration is active. You can import contacts directly:

1. Go to **Contacts > Import > HubSpot**
2. Select a HubSpot list or segment to import from
3. Choose which HubSpot properties to map to 60 fields
4. Set sync preferences:
   - **One-time import** -- import once, no ongoing sync
   - **Continuous sync** -- keep contacts updated as HubSpot data changes
5. Click **Import**

:::tip
Use **Continuous sync** for your active pipeline contacts. This ensures that when a contact''s title or company changes in HubSpot, it is automatically reflected in 60.
:::
{{/if}}

:::beginner
If you do not have a CRM integration set up yet, you can connect one from **Integrations**. 60 supports HubSpot with additional CRM integrations planned.
:::

### From Meetings

Contacts are automatically created when:
- A new attendee appears on a calendar event
- The 60 Notetaker records a meeting with unknown participants
- You receive an email from a new address (if email sync is enabled)

:::info
Auto-created contacts from meetings are marked with a "From Meeting" badge. They have basic information (name and email) and can be enriched with additional data.
:::

## Contact Record

Each contact in 60 has a comprehensive record page. Here is what you will find for {{contact_name}}:

### Profile Section

The top of the contact page shows:
- **Name, title, and company** ({{company_name}})
- **Contact information** -- email, phone, LinkedIn
- **Owner** -- the team member responsible for this relationship
- **Tags** -- custom labels for categorisation
- **Enrichment status** -- whether AI enrichment has been run

### Activity Timeline

The timeline shows every interaction with this contact in chronological order:

| Activity Type | What It Shows |
|--------------|---------------|
| **Meetings** | Scheduled and completed meetings, with links to transcripts |
| **Emails** | Sent and received emails (if email sync is enabled) |
| **Calls** | Logged phone calls with notes |
| **Notes** | Manual notes added by team members |
| **Stage changes** | When deals associated with this contact change stage |
| **Tasks** | Tasks created for or completed about this contact |

:::intermediate
**Filtering the timeline**:
- Use the activity type toggles to show/hide specific types
- Filter by date range to focus on recent activity
- Search within the timeline for specific keywords
- Click any activity to expand its detail
:::

### Associated Deals

See all deals where {{contact_name}} is involved:
- Current active deals with stage and health score
- Historical deals (won and lost)
- Total revenue associated with this contact

:::tip
A contact can be associated with multiple deals. This is common for procurement leads or executives who are involved in several purchases. Linking contacts to all relevant deals gives you a complete relationship view.
:::

### Relationship Health

60 calculates a relationship health indicator for each contact based on:
- **Recency** -- how recently you interacted
- **Frequency** -- how often you interact
- **Depth** -- are interactions substantive (meetings) or superficial (quick emails)?
- **Reciprocity** -- does the contact initiate contact, or is it always one-way?

:::advanced
The relationship health score feeds into deal health calculations. A deal where your primary contact has a "warm" relationship scores higher than one with a "cold" contact.

Ask the Copilot: "Which of my contacts have I not spoken to in over a month?" to proactively re-engage fading relationships.
:::

## Managing Contacts

### Editing Contact Details

:::beginner
Click on any field in the contact profile to edit it inline. Changes are saved automatically. You can update:
- Name, title, and company
- Email and phone
- Owner (reassign to another team member)
- Tags and custom fields
:::

### Merging Duplicates

:::intermediate
When duplicates are detected (matching email addresses), 60 shows a merge suggestion:

1. Go to **Contacts > Duplicates** (badge shows count)
2. Review each pair of potential duplicates
3. Choose which record to keep as the primary
4. Select which fields to preserve from each record
5. Click **Merge**

The merged record retains all activities, deals, and meeting history from both records.
:::

### Bulk Actions

:::intermediate
In the contacts table view, select multiple contacts for bulk operations:
- **Assign owner** -- reassign contacts to a different team member
- **Add tag** -- apply a tag to all selected contacts
- **Export** -- download selected contacts as CSV
- **Enrich** -- run AI enrichment on selected contacts
- **Delete** -- remove contacts (with confirmation)
:::

### Searching and Filtering

The contacts page provides powerful search and filtering:

:::beginner
- **Search bar** -- search by name, email, company, or title
- **Quick filters** -- filter by owner, tag, or company
:::

:::intermediate
- **Advanced filters** -- combine multiple conditions:
  - "Contacts at {{company_name}} with title containing Director"
  - "Contacts with no activity in 30+ days"
  - "Contacts linked to deals over $50,000"
- **Saved views** -- save filter combinations for quick access
:::

## Company Records

Contacts are grouped by company. The company record shows:

- **Company name and domain**
- **All contacts** at that company
- **All deals** associated with the company
- **Meeting history** across all contacts
- **Engagement score** -- aggregate relationship health

:::advanced
Company records are automatically created when contacts share an email domain. You can also create companies manually and link contacts to them.

The Copilot uses company-level data for multi-threading analysis: "You have 4 contacts at {{company_name}}, but only 1 is actively engaged. Consider reaching out to the others."
:::

## Next Steps

- [Contact Enrichment](#contacts-enrichment) -- AI-powered data enrichment
- [Pipeline Guide](#pipeline-guide) -- link contacts to deals
- [Tasks Guide](#tasks-guide) -- create tasks related to contacts
', true, 30, '{}'),


-- ============================================================================

('contacts-enrichment', 'Contact Enrichment', 'Contacts & CRM', E'# Contact Enrichment

60 uses AI-powered enrichment to automatically fill in missing contact data, add professional context, and surface intelligence that helps you prepare for conversations. Enrichment transforms a basic name-and-email record into a comprehensive profile.

## What Gets Enriched

When you enrich a contact, 60 pulls data from multiple sources to fill in or update the following fields:

### Professional Information

| Field | Description | Example |
|-------|-------------|---------|
| **Job title** | Current role and seniority | VP of Sales |
| **Company** | Current employer | {{company_name}} |
| **Industry** | Company industry | SaaS / Technology |
| **Company size** | Employee count range | 51-200 |
| **Location** | City and country | San Francisco, CA |
| **LinkedIn URL** | Professional profile link | linkedin.com/in/... |

### Contextual Intelligence

| Field | Description | How It Helps |
|-------|-------------|-------------|
| **Seniority level** | C-Level, VP, Director, Manager, IC | Tailor your messaging and escalation strategy |
| **Department** | Sales, Marketing, Engineering, etc. | Understand their perspective and priorities |
| **Company revenue** | Estimated annual revenue | Qualify deal size potential |
| **Technologies used** | Tech stack and tools | Find integration angles and pain points |
| **Recent news** | Company announcements, funding, hires | Conversation starters and timing signals |

:::tip
Enrichment data is especially valuable for meeting preparation. When the Copilot generates a pre-meeting brief, it includes enrichment data to give you context on who you are meeting with.
:::

## How to Enrich Contacts

### Single Contact Enrichment

:::beginner
1. Open a contact record
2. Click the **Enrich** button in the top-right corner
3. Wait a few seconds for the AI to process
4. Review the enriched data -- new or updated fields are highlighted in blue
5. Accept or dismiss individual enrichment suggestions

Enrichment is non-destructive: it never overwrites data you have manually entered unless you explicitly accept the update.
:::

### Bulk Enrichment

:::intermediate
To enrich multiple contacts at once:

1. Go to **Contacts** and switch to **Table View**
2. Select the contacts you want to enrich (checkbox selection)
3. Click **Bulk Actions > Enrich**
4. The enrichment runs in the background -- you will see a progress indicator
5. Once complete, review results in the enrichment summary

**Bulk enrichment tips**:
- Start with contacts that have at least an email address (enrichment uses email as the primary lookup key)
- Run enrichment on contacts before important meetings for maximum preparation value
- Enrichment credits may apply depending on your plan
:::

### Automatic Enrichment

:::advanced
You can configure automatic enrichment triggers:

- **On contact creation** -- enrich every new contact automatically
- **Before meetings** -- enrich attendees 24 hours before scheduled meetings
- **On deal association** -- enrich contacts when they are linked to a high-value deal
- **Periodic refresh** -- re-enrich contacts every 90 days to catch job changes and company updates

Configure these in **Settings > Enrichment > Auto-Enrichment Rules**.
:::

## Enrichment Sources

60 pulls enrichment data from multiple sources, cross-referencing to ensure accuracy:

### Primary Sources

- **Professional databases** -- LinkedIn-sourced professional data via Apollo and similar providers
- **Company registries** -- firmographic data from public business databases
- **Web presence** -- company website analysis, social media profiles
- **Email analysis** -- domain-based company identification

### Secondary Sources (Contextual)

- **Meeting transcripts** -- information mentioned during recorded conversations
- **Email threads** -- context from email correspondence
- **CRM data** -- synced fields from connected CRM systems
- **Team notes** -- manually entered information from team members

:::info
Enrichment accuracy varies by source and contact profile. Public-facing roles (executives, sales leaders) tend to have richer data available than technical or operational roles.
:::

## Enrichment Columns in Ops Tables

When you use Ops tables, enrichment data becomes queryable:

:::intermediate
Example queries:
- "Show all VP-level contacts at companies with 200+ employees"
- "Filter to contacts in the technology industry"
- "Find contacts who changed jobs in the last 6 months"
- "Group contacts by seniority level and show count per group"

Enrichment columns appear in Ops tables with a sparkle icon to indicate they were AI-generated rather than manually entered.
:::

:::advanced
You can create **enrichment-driven workflows** in Ops:

```
WHEN: New contact enriched
IF: Seniority = "C-Level" AND Company Size > 500
THEN:
  - Set priority to "High"
  - Assign to enterprise team
  - Create task: "Schedule introductory call within 48 hours"
  - Slack alert to #enterprise-leads
```

This ensures high-value contacts are actioned immediately, without manual triage.
:::

## Data Quality and Accuracy

### Confidence Scores

Each enriched field includes a confidence score:

| Confidence | Meaning | Action |
|-----------|---------|--------|
| **High** (90%+) | Multiple sources confirm this data | Auto-accepted |
| **Medium** (70-89%) | One strong source confirms | Review recommended |
| **Low** (<70%) | Best guess from limited data | Manual verification needed |

:::intermediate
You can configure confidence thresholds in **Settings > Enrichment**:
- **Auto-accept threshold** -- fields above this confidence are applied automatically (default: 90%)
- **Suggest threshold** -- fields above this confidence are shown as suggestions (default: 60%)
- **Reject threshold** -- fields below this confidence are discarded (default: 40%)
:::

### Handling Conflicts

When enrichment data conflicts with existing data:

:::beginner
You will see a "Conflict" badge next to the field. Click it to see:
- **Current value** -- what is in your database now
- **Enriched value** -- what the AI found
- **Source** -- where the enriched value came from
- **Confidence** -- how confident the AI is

Choose to **Keep Current**, **Accept Enrichment**, or **Keep Both** (adds a note).
:::

### Stale Data Detection

:::advanced
60 tracks when enrichment data was last refreshed and flags potentially stale records:

- **Job title** -- flagged after 6 months (people change roles)
- **Company** -- flagged after 12 months
- **Contact details** -- flagged after 3 months
- **Company metrics** -- flagged after 6 months

Stale fields show an amber indicator. Run a re-enrichment to refresh them.
:::

## Privacy and Compliance

:::info
60 only enriches data from publicly available sources and connected integrations. Enrichment complies with data protection regulations:

- No scraping of private profiles or restricted data
- Opt-out mechanisms for contacts who request data removal
- Data retention policies apply to enrichment results
- Enrichment audit trail is available for compliance review
:::

## Next Steps

- [Contacts Guide](#contacts-guide) -- managing your contact database
- [Pipeline Guide](#pipeline-guide) -- linking enriched contacts to deals
- [Smart Tasks](#smart-tasks) -- auto-generate tasks from enrichment signals
', true, 31, '{}'),


-- ============================================================================
-- TASKS & ACTIVITY
-- ============================================================================

('tasks-guide', 'Tasks & Follow-ups', 'Tasks & Activity', E'# Tasks & Follow-ups

Tasks in 60 keep your sales process moving forward. Every deal needs next steps, every meeting needs follow-ups, and every commitment needs tracking. The task system combines manual task creation with AI-powered automation so nothing falls through the cracks.

## Creating Tasks

### Manual Task Creation

:::beginner
To create a task:

1. Navigate to **Tasks** in the sidebar
2. Click **+ New Task**
3. Fill in the details:
   - **Title** -- a clear, actionable description (e.g., "Send proposal to {{contact_name}}")
   - **Due date** -- when the task should be completed
   - **Priority** -- High, Medium, or Low
   - **Assignee** -- who is responsible (defaults to you)
4. Optionally link the task to:
   - A **deal** -- keeps the task visible on the deal page
   - A **contact** -- associates the task with a specific person
   - A **meeting** -- links to a specific meeting for context
5. Click **Create**
:::

:::tip
Write task titles as actions: "Send proposal to {{contact_name}}" is better than "Proposal." Future you (or the AI) will thank you for the clarity.
:::

### Quick Task Creation

:::beginner
You can also create tasks from context:

- **From a deal page** -- click **+ Add Task** in the Tasks tab
- **From a contact page** -- click **+ Task** to create a task linked to that contact
- **From a meeting** -- click **+ Follow-up** to create a post-meeting task
- **From the Copilot** -- tell the AI: "Create a task to follow up with {{contact_name}} by Friday"

Tasks created in context are automatically linked to the relevant deal, contact, or meeting.
:::

## Task Properties

Every task has the following properties:

| Property | Description | Options |
|----------|-------------|---------|
| **Title** | What needs to be done | Free text |
| **Description** | Additional context or instructions | Free text (markdown supported) |
| **Due date** | Deadline for completion | Date picker |
| **Priority** | Urgency level | High, Medium, Low |
| **Status** | Current state | To Do, In Progress, Done |
| **Assignee** | Responsible person | Team member |
| **Type** | Category of task | Follow-up, Call, Email, Meeting, Research, Admin, Other |
| **Deal** | Associated deal | Optional link |
| **Contact** | Associated contact | Optional link |
| **Meeting** | Associated meeting | Optional link |

:::intermediate
**Task types** help you categorise and filter:

- **Follow-up** -- post-meeting or post-email actions
- **Call** -- phone calls to schedule or make
- **Email** -- emails to draft and send
- **Meeting** -- meetings to schedule
- **Research** -- information gathering tasks
- **Admin** -- internal tasks (CRM updates, data entry)
- **Other** -- anything that does not fit the above
:::

## Managing Tasks

### Task List View

The main Tasks page shows all your tasks in a list, sorted by due date by default.

:::beginner
**Quick actions**:
- Click the **checkbox** to mark a task as done
- Click the **title** to edit the task
- Click the **due date** to reschedule
- Click the **priority badge** to change priority
- Use the **filter bar** to narrow by status, priority, type, or association
:::

### Filtering and Sorting

:::intermediate
**Filter options**:
- **Status** -- To Do, In Progress, Done
- **Priority** -- High, Medium, Low
- **Type** -- Follow-up, Call, Email, etc.
- **Assignee** -- filter by team member
- **Due date** -- Overdue, Today, This Week, This Month, No Due Date
- **Deal** -- tasks linked to a specific deal
- **Contact** -- tasks linked to a specific contact

**Sort options**:
- Due date (ascending/descending)
- Priority (high to low)
- Created date
- Status
:::

### Task Views

:::intermediate
Switch between views to see tasks in different layouts:

- **List view** -- all tasks in a flat list (default)
- **Board view** -- kanban-style columns by status (To Do, In Progress, Done)
- **Calendar view** -- tasks plotted on a calendar by due date
- **Grouped view** -- tasks grouped by deal, contact, or type
:::

### Completing Tasks

:::beginner
When you finish a task:

1. Click the checkbox next to the task title
2. The task moves to "Done" status
3. A completion timestamp is recorded
4. The activity is logged on the associated deal and contact timelines

You can also mark a task as done from:
- The deal detail page (Tasks tab)
- The contact detail page
- The Copilot ("Mark the follow-up task for {{contact_name}} as done")
:::

:::info
Completed tasks remain visible in your task list for 7 days, then are archived. You can always find archived tasks by filtering to "Done" status and expanding the date range.
:::

## Task Assignment

### Assigning to Team Members

:::beginner
When creating or editing a task, use the **Assignee** dropdown to assign it to any team member. The assignee will:
- See the task in their personal task list
- Receive a notification (in-app and optionally via Slack)
- Be accountable for completion
:::

:::intermediate
**Reassigning tasks**:
- Open the task and change the assignee
- The previous assignee loses the task from their list
- The new assignee receives a notification with full context
- The reassignment is logged in the activity timeline
:::

### My Tasks vs Team Tasks

:::beginner
The task list defaults to showing **My Tasks** -- tasks assigned to you. Toggle to **Team Tasks** to see all tasks across your organisation (visibility depends on your sharing settings).
:::

## Working with Tasks and Deals

Tasks and deals are closely linked. Here is how they interact:

:::intermediate
**Task-deal relationship**:
- Tasks linked to a deal appear in the deal''s Tasks tab
- Completing deal tasks improves the deal''s health score (data completeness factor)
- Overdue tasks on a deal negatively impact health score
- The Copilot references deal tasks when generating meeting briefs: "Reminder: you had a task to send the proposal to {{contact_name}} -- is it done?"
:::

:::advanced
**Using the Copilot for task management**:
- "What tasks are overdue on my deals?"
- "Create follow-up tasks for all deals in the Proposal stage"
- "Show me tasks linked to {{deal_name}}"
- "What should I focus on today?" (the Copilot prioritises by due date, deal health, and meeting schedule)
:::

## Overdue Task Management

:::warning
Overdue tasks are highlighted in red throughout the platform. They negatively impact deal health scores and may trigger Slack alerts if configured.

To manage overdue tasks:
1. Filter to **Overdue** in the task list
2. For each task, either:
   - **Complete it** -- if it has been done but not marked
   - **Reschedule it** -- set a new due date with a reason
   - **Delete it** -- if it is no longer relevant
   - **Reassign it** -- if someone else should handle it
:::

## Next Steps

- [Smart Tasks](#smart-tasks) -- automatic task creation from meetings and AI analysis
- [Activity Log](#activity-log) -- see all activities including task completions
- [Pipeline Guide](#pipeline-guide) -- manage tasks in the context of deals
', true, 40, '{}'),


-- ============================================================================

('smart-tasks', 'Smart Tasks & Automation', 'Tasks & Activity', E'# Smart Tasks & Automation

Smart Tasks are automatically generated by 60''s AI based on meeting transcripts, deal signals, pipeline events, and Copilot analysis. They remove the burden of manually creating follow-ups and ensure that commitments made in meetings are tracked and acted on.

## How Smart Tasks Work

When certain events occur, 60''s AI analyses the context and creates tasks automatically. You receive a notification with the suggested tasks and can accept, modify, or dismiss them.

:::beginner
**The basic flow**:
1. An event occurs (e.g., a meeting ends and a transcript is processed)
2. The AI analyses the event for actionable items
3. Smart tasks are created in a "Suggested" state
4. You review and accept the tasks you want to keep
5. Accepted tasks appear in your regular task list
:::

:::tip
Smart Tasks are suggestions, not mandates. You always have the final say on which tasks to keep. Over time, the AI learns which types of suggestions you accept and adjusts its recommendations.
:::

## Smart Task Triggers

### Meeting-Based Triggers

The most common source of smart tasks is meeting transcripts. After a recorded meeting, the AI extracts:

| Extracted Item | Example Task Created |
|---------------|---------------------|
| **Action items** | "Send pricing comparison by Friday" |
| **Commitments** | "Follow up with case study as discussed" |
| **Questions to answer** | "Research integration capabilities for {{contact_name}}" |
| **Next meeting** | "Schedule follow-up call for next Tuesday" |
| **Internal actions** | "Loop in engineering for technical requirements" |

:::intermediate
**Meeting task extraction quality**:
The AI is remarkably good at distinguishing between:
- Genuine action items ("I''ll send that over tomorrow")
- Hypothetical discussions ("If we needed to, we could...")
- Historical references ("Last time we sent a proposal...")

Each extracted task includes a **confidence score** and a **transcript excerpt** showing exactly where the commitment was made.
:::

:::advanced
**Customising meeting extraction**:

In **Settings > Smart Tasks > Meeting Rules**, you can configure:
- **Minimum confidence** -- only create tasks above this threshold (default: 70%)
- **Auto-accept threshold** -- tasks above this confidence are accepted automatically (default: 90%)
- **Excluded phrases** -- ignore common false positives (e.g., "we should grab coffee" does not become a task)
- **Team routing** -- route internal action items to the appropriate team member based on content
:::

### Pipeline-Based Triggers

Smart tasks are also created from pipeline events:

| Event | Smart Task |
|-------|-----------|
| **Deal moves to Proposal stage** | "Prepare and send proposal for {{deal_name}}" |
| **Deal stalls for 14+ days** | "Re-engage {{contact_name}} -- deal has been inactive" |
| **Close date approaching** | "Confirm close timeline with {{contact_name}} -- 5 days until target date" |
| **Deal health drops below 40** | "Review and rescue {{deal_name}} -- health score critical" |
| **Competitor mentioned** | "Prepare competitive positioning for {{deal_name}} against [Competitor]" |

:::intermediate
Pipeline triggers are configured per stage. Your admin can customise which triggers are active and what tasks they generate in **Settings > Pipeline > Stage Actions**.
:::

### Activity-Based Triggers

| Event | Smart Task |
|-------|-----------|
| **No activity on deal for 7 days** | "Check in on {{deal_name}} -- no activity this week" |
| **Email not replied in 3 days** | "Follow up with {{contact_name}} -- email awaiting reply" |
| **Task overdue by 2+ days** | "Escalate: overdue task on {{deal_name}}" |
| **Contact enrichment complete** | "Review enrichment data for {{contact_name}}" |

### Copilot-Generated Tasks

The AI Copilot can also create smart tasks during conversations:

:::intermediate
When you interact with the Copilot, it may suggest tasks based on the discussion:

```
You: "How is the TechCorp deal looking?"
Copilot: "{{deal_name}} has been in Proposal for 18 days. Health is at 62
(yellow). I notice no meeting is scheduled and the last email was 5 days ago.

Suggested tasks:
1. Schedule follow-up meeting with {{contact_name}} (Due: Tomorrow)
2. Send check-in email referencing the proposal (Due: Today)
3. Loop in your manager for deal review (Due: This week)

Shall I create these tasks?"
```

Reply "Yes" or "Create all" to accept. You can also say "Create 1 and 2 but skip 3."
:::

## Managing Smart Task Suggestions

### Review Queue

:::beginner
When smart tasks are created, they appear in the **Suggestions** section at the top of your Tasks page. Each suggestion shows:

- The task title and description
- Why it was created (e.g., "From meeting transcript" or "Deal stalled 14 days")
- Confidence score
- Source link (click to see the meeting transcript or deal page)

**Actions**:
- **Accept** -- adds the task to your active task list
- **Modify** -- edit the title, due date, or assignee before accepting
- **Dismiss** -- removes the suggestion (the AI learns from dismissals)
:::

### Bulk Review

:::intermediate
If you have multiple suggestions:
1. Click **Review All** to see them in a dedicated modal
2. Toggle each suggestion on/off
3. Adjust due dates and assignees inline
4. Click **Accept Selected** to create all at once

This is especially useful after a meeting-heavy day when you might have 10-15 suggestions to process.
:::

## Smart Task Templates

:::advanced
Create templates that control how smart tasks are generated for specific scenarios:

**Template example: Post-Demo Follow-up**
```
Trigger: Deal moves to "Post-Demo"
Tasks:
  1. "Send demo recap and next steps to {{contact_name}}" -- Due: +1 day, Priority: High
  2. "Share relevant case study with {{contact_name}}" -- Due: +2 days, Priority: Medium
  3. "Schedule proposal review meeting" -- Due: +5 days, Priority: High
  4. "Update deal notes with demo feedback" -- Due: Today, Priority: Low
```

Templates ensure consistent follow-up processes across your team, regardless of individual habits.

Create templates in **Settings > Smart Tasks > Templates**.
:::

## Notification Settings

:::intermediate
Configure how you are notified about smart task suggestions:

- **In-app** -- badge on the Tasks icon (always on)
- **Slack** -- direct message with suggestion details (configurable)
- **Email digest** -- daily summary of pending suggestions (configurable)

Set your preferences in **Settings > Notifications > Smart Tasks**.
:::

## Measuring Smart Task Impact

:::advanced
60 tracks how smart tasks contribute to your pipeline:

**Metrics available in Settings > Smart Tasks > Analytics**:
- **Suggestion acceptance rate** -- what percentage of suggestions you keep
- **Tasks from transcripts** -- how many follow-ups were caught that you might have missed
- **Deal velocity impact** -- do deals with smart tasks progress faster?
- **Overdue reduction** -- has the percentage of overdue tasks decreased?

These metrics help you fine-tune the sensitivity and types of smart task triggers.
:::

## Next Steps

- [Tasks Guide](#tasks-guide) -- manual task creation and management
- [Activity Log](#activity-log) -- see all activities including smart task completions
- [Deal Health Scoring](#deal-health-scoring) -- how tasks impact deal health
', true, 41, '{}'),


-- ============================================================================

('activity-log', 'Activity Log & Timeline', 'Tasks & Activity', E'# Activity Log & Timeline

The activity log is a chronological record of everything that happens across your pipeline. Every meeting, email, call, note, task completion, deal update, and AI action is captured here, giving you a complete audit trail and a powerful tool for understanding relationship patterns.

## What Gets Logged

60 automatically captures activities from multiple sources:

### Automatic Activity Types

| Activity Type | Source | Example |
|--------------|--------|---------|
| **Meeting** | Calendar sync, 60 Notetaker | "Meeting with {{contact_name}}: Quarterly Review" |
| **Email sent** | Email sync | "Email to {{contact_name}}: Proposal follow-up" |
| **Email received** | Email sync | "Email from {{contact_name}}: RE: Pricing question" |
| **Call** | Manual log, integration | "Call with {{contact_name}} (15 min)" |
| **Stage change** | Pipeline | "{{deal_name}} moved from Demo to Proposal" |
| **Deal created** | Pipeline | "New deal: {{deal_name}} ($50,000)" |
| **Deal value changed** | Pipeline | "{{deal_name}} value updated: $50,000 to $75,000" |
| **Task completed** | Task system | "Task done: Send proposal to {{contact_name}}" |
| **Task created** | Task system, Smart Tasks | "Task created: Follow up with {{contact_name}}" |
| **Contact created** | Import, manual, meeting | "New contact: {{contact_name}} at {{company_name}}" |
| **Contact enriched** | Enrichment | "{{contact_name}} enriched: title, company, LinkedIn added" |
| **Note added** | Manual | "Note on {{deal_name}}: Client confirmed budget" |
| **Copilot action** | AI Copilot | "Copilot: Generated meeting brief for Quarterly Review" |

:::beginner
You do not need to manually log most activities. If your calendar and email are connected, 60 captures meetings and emails automatically. Stage changes, task completions, and contact changes are logged by the system.
:::

### Manual Activity Logging

For activities that are not captured automatically (phone calls, in-person meetings, informal conversations), you can log them manually:

:::beginner
1. Navigate to the relevant deal or contact page
2. Click **+ Log Activity** in the timeline
3. Select the activity type (Call, Note, Meeting, etc.)
4. Add details:
   - **Subject** -- brief description
   - **Date and time** -- when it happened
   - **Duration** -- how long (for calls and meetings)
   - **Notes** -- any relevant context or outcomes
5. Click **Save**

The activity appears in the timeline immediately and counts toward engagement metrics.
:::

:::tip
Logging calls and informal conversations is one of the highest-ROI habits you can build. These interactions often contain crucial context that the AI uses for meeting prep, deal analysis, and relationship scoring.
:::

## Viewing the Activity Log

### Global Activity Feed

The main activity log (accessible from the sidebar) shows all activities across your pipeline in reverse chronological order.

:::beginner
**What you see**:
- Activity icon and type
- Contact and deal association
- Timestamp
- Brief description
- Actor (who performed the activity -- you, a team member, or the AI)
:::

### Deal Timeline

On each deal''s detail page, the Activity tab shows all activities related to that deal:

:::intermediate
This is the most valuable view for meeting preparation. Before a call with {{contact_name}} about {{deal_name}}, open the deal timeline to see:
- When you last spoke and what was discussed
- Recent emails and their content
- Stage changes and when they happened
- Pending tasks and commitments
- Notes from team members

The Copilot uses this exact same timeline when generating meeting briefs, so you can trust that the AI has the same context you do.
:::

### Contact Timeline

Each contact''s page shows their complete interaction history across all deals:

:::intermediate
The contact timeline is useful for:
- Understanding the full history of a relationship before a meeting
- Identifying gaps in communication (no activity for 30+ days)
- Seeing how a contact''s engagement has changed over time
- Finding specific conversations or emails from the past
:::

## Filtering Activities

### Basic Filters

:::beginner
Use the filter bar to narrow the activity log:
- **Activity type** -- show only meetings, emails, calls, etc.
- **Date range** -- today, this week, this month, custom range
- **Person** -- activities involving a specific team member
:::

### Advanced Filters

:::intermediate
Combine filters for targeted searches:
- "All meetings with {{contact_name}} in the last 90 days"
- "Stage changes on deals over $100,000 this quarter"
- "Tasks completed by the team this week"
- "Copilot actions on {{deal_name}}"
- "Notes added to any deal in the Negotiation stage"

:::

### Search Within Activities

:::intermediate
Use the search bar to find specific activities by keyword:
- Search by contact name, deal name, or activity content
- Results highlight the matching text
- Search works across activity descriptions, notes, and email subjects
:::

## Activity Metrics

60 calculates engagement metrics from your activity data:

### Individual Metrics

:::intermediate
Your personal activity dashboard shows:

| Metric | Description |
|--------|-------------|
| **Activities logged** | Total activities this week/month |
| **Meetings held** | Completed meetings |
| **Emails sent** | Outbound emails |
| **Calls made** | Logged calls |
| **Tasks completed** | Tasks marked as done |
| **Response time** | Average time to respond to inbound emails |
| **Active deals touched** | How many deals had activity this week |
:::

### Team Metrics

:::advanced
Managers can view team-wide activity metrics:

| Metric | Description |
|--------|-------------|
| **Team activity volume** | Total activities across the team |
| **Activity distribution** | Which reps are most/least active |
| **Deal coverage** | Percentage of active deals with activity this week |
| **Response time ranking** | Fastest to slowest responders |
| **Meeting density** | Average meetings per rep per week |

These metrics help identify coaching opportunities and process bottlenecks.
:::

## Activity and Deal Health

Activities directly impact deal health scores:

:::intermediate
**Positive impact**:
- Recent meeting logged (+5 engagement points)
- Email replied to within 48 hours (+3 points)
- Note added with next steps (+2 completeness points)
- Task completed on time (+2 velocity points)

**Negative impact**:
- No activity in 7+ days (-5 engagement points per week)
- Email unanswered for 3+ days (-3 points)
- No notes in 30+ days (-5 completeness points)
- Overdue tasks (-3 velocity points per task)

The Copilot highlights these impacts when analysing deal health: "{{deal_name}} health dropped to 58 because there has been no activity for 12 days."
:::

## Exporting Activity Data

:::advanced
Export activity data for reporting or compliance:

1. Apply filters to narrow the activities you want to export
2. Click **Export** in the toolbar
3. Choose format: **CSV** or **PDF**
4. The export includes all visible columns and activity details

Exports respect your organisation''s data sharing settings -- you can only export activities you have permission to view.
:::

## Integration with the Copilot

:::intermediate
The AI Copilot uses the activity log extensively:

- **Meeting prep**: "Based on your last 3 interactions with {{contact_name}}, here are talking points..."
- **Pipeline analysis**: "5 of your deals have had no activity this week. Here they are..."
- **Relationship health**: "Your engagement with {{company_name}} has dropped 40% this month."
- **Pattern detection**: "Deals that close fastest in your pipeline have an average of 2.3 meetings per week."

Ask the Copilot:
- "What did I do today?"
- "Show me all activities on {{deal_name}}"
- "When was my last interaction with {{contact_name}}?"
- "Which deals have I neglected this week?"
:::

## Next Steps

- [Tasks Guide](#tasks-guide) -- manage your task list
- [Smart Tasks](#smart-tasks) -- automatic task generation from activities
- [Deal Health Scoring](#deal-health-scoring) -- how activities impact deal health
- [Pipeline Guide](#pipeline-guide) -- manage your pipeline
', true, 42, '{}');
