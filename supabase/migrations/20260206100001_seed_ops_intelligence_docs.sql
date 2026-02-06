-- Seed Ops Intelligence Documentation Content
-- DOC-009: Seed all 6 Ops Intelligence feature docs with beginner/intermediate/advanced examples

-- Insert documentation articles
INSERT INTO docs_articles (slug, title, category, content, published, order_index) VALUES

-- Getting Started
('ops-getting-started', 'Getting Started with Ops Intelligence', 'Getting Started', E'# Getting Started with Ops Intelligence

Ops Intelligence transforms your CRM data into interactive,  AI-powered tables that you can query in natural language. Think of it as having a data analyst available 24/7 to answer questions about your contacts, deals, and sales pipeline.

## What are Ops Tables?

Ops Tables are smart, dynamic tables built on top of your CRM data. Unlike static spreadsheets:

- **AI-Powered**: Query data using natural language ("Show law firms in California")
- **Auto-Enriched**: Automatically pulls in data from meetings, emails, and other sources
- **Real-Time**: Always reflects the latest data from your CRM
- **Collaborative**: Team members see the same data, share filters and views

## Creating Your First Table

:::beginner
1. Navigate to **Ops** in the sidebar
2. Click **Create New Table**
3. Select a data source (e.g., HubSpot Contacts)
4. Choose which columns to sync
5. Click **Create**

Your table will sync automatically and be ready in seconds.
:::

:::intermediate
You can create multiple tables from different sources and cross-reference them:

```
"Show {{table_name}} contacts who attended meetings in Q4"
```

This pulls contact data from one table and meeting data from another.
:::

:::advanced
Use the **API** to programmatically create and manage tables:

```typescript
const { data } = await supabase
  .from(''dynamic_tables'')
  .insert({
    name: ''Q1 Pipeline'',
    source_type: ''hubspot_contacts'',
    org_id: currentOrgId
  });
```
:::

## Your First Query

Once your table is created, try these example queries:

:::beginner
- "Show all contacts"
- "Filter to contacts from law firms"
- "Sort by {{column_name}} descending"
:::

:::intermediate
- "Show contacts who haven''t been emailed in 30 days"
- "Create a column for industry based on company domain"
- "Export to CSV"
:::

:::advanced
- "Show contacts where {{column_name}} contains ''enterprise'' and last activity is >60 days ago"
- "Create a view grouping by stage with average deal size"
- "Run a cross-table query comparing this to Q4 data"
:::

## Next Steps

- [AI Query Bar →](#ops-query-bar) Learn all 15 query tools
- [Conversations →](#ops-conversations) Use multi-turn context
- [Workflows →](#ops-workflows) Automate actions

', true, 1),

-- AI Query Bar
('ops-query-bar', 'AI Query Bar - All Tools', 'Query Bar', E'# AI Query Bar - Complete Tool Reference

The AI Query Bar understands 15 specialized tools. This guide shows every tool with beginner, intermediate, and advanced examples.

## 1. Filter

Filter rows based on conditions.

:::beginner
"Filter to contacts from {{table_name}}"
:::

:::intermediate
"Filter where {{column_name}} contains ''director'' and last_activity < 30 days ago"
:::

:::advanced
"Filter using regex: email matches ''^[a-z]+@law.*\\.com$''"
:::

## 2. Sort

Sort rows by one or more columns.

:::beginner
"Sort by {{column_name}} descending"
:::

:::intermediate
"Sort by stage ascending, then by deal_value descending"
:::

:::advanced
"Sort by custom formula: (deal_value / days_in_stage)"
:::

## 3. Update

Update cell values (single or bulk).

:::beginner
"Update row 5 set {{column_name}} to ''Enterprise''"
:::

:::intermediate
"Update all law firm contacts: set industry to ''Legal''"
:::

:::advanced
"Update where stage=''Closed Won'': set owner=''Sales Team'' and add tag ''Q1-Win''"
:::

## 4. Delete

Remove rows from the table.

:::beginner
"Delete row 3"
:::

:::intermediate
"Delete all contacts where email is null"
:::

:::advanced
"Delete duplicates keeping most recent by created_at"
:::

## 5. Create Column

Add a new custom column.

:::beginner
"Create a column called ''Industry''"
:::

:::intermediate
"Create a dropdown column ''Priority'' with values: High, Medium, Low"
:::

:::advanced
"Create a formula column ''Days Since Contact'' = (today - last_activity_date)"
:::

## 6. Create View

Save a filtered/sorted view.

:::beginner
"Create a view showing only active deals"
:::

:::intermediate
"Create a view ''Law Firms CA'' filtering to legal industry in California, sorted by deal value"
:::

:::advanced
"Create a pivot view grouping by owner with SUM(deal_value) and COUNT(*)"
:::

## 7. Summarize

Aggregate data with stats.

:::beginner
"Summarize: how many contacts total?"
:::

:::intermediate
"Summarize by {{column_name}}: count, average deal value, total"
:::

:::advanced
"Summarize with custom formula: MEDIAN(deal_value) WHERE stage=''Negotiation''"
:::

## 8. Transform

Apply bulk transformations.

:::beginner
"Transform: capitalize all names"
:::

:::intermediate
"Transform {{column_name}}: extract domain from email and create ''Company Domain'' column"
:::

:::advanced
"Transform using AI: analyze job titles and categorize into: C-Level, VP, Director, Manager, IC"
:::

## 9. Deduplicate

Find and merge duplicate rows.

:::beginner
"Find duplicates by email"
:::

:::intermediate
"Deduplicate by email, keeping most recent and merging notes"
:::

:::advanced
"Deduplicate with fuzzy matching: company name similarity >85%"
:::

## 10. Export

Download data in various formats.

:::beginner
"Export to CSV"
:::

:::intermediate
"Export filtered view to Excel with formatting"
:::

:::advanced
"Export to Google Sheets with auto-refresh sync"
:::

## 11. Conditional Update

Update with if/then logic.

:::beginner
"If deal_value > 50000, set priority to High"
:::

:::intermediate
"If stage=''Closed Won'' and deal_value>100k, assign to enterprise_team and create celebration task"
:::

:::advanced
"Update priority based on scoring: (deal_value * engagement_score) / days_in_stage, map to High/Med/Low"
:::

## 12. Cross Column Validate

Check data consistency across columns.

:::beginner
"Validate: email format is correct"
:::

:::intermediate
"Validate: if industry=''Legal'', company name should contain ''Law'', ''LLP'', or ''Esq''"
:::

:::advanced
"Cross-validate with CRM: check if deal values match HubSpot and flag mismatches"
:::

## 13. Formatting

Apply visual formatting rules.

:::beginner
"Highlight rows where {{column_name}} is null in yellow"
:::

:::intermediate
"Apply conditional formatting: High priority = red, Medium = yellow, Low = green"
:::

:::advanced
"Format with heatmap: deal_value from green (low) to red (high), custom breakpoints"
:::

## 14. Batch Create Views

Create multiple views at once.

:::beginner
"Create views by {{column_name}}"
:::

:::intermediate
"Create regional views: one per state with local data"
:::

:::advanced
"Create views using template: one per sales rep with their pipeline, forecasts, and at-risk deals"
:::

## 15. Cross Table Query

Query across multiple Ops tables.

:::beginner
"Show contacts from {{table_name}} who attended any meeting"
:::

:::intermediate
"Compare current pipeline to Q4: show net-new contacts and changed deal values"
:::

:::advanced
"Enrich with meeting data: add columns for last_meeting_date, meeting_count, avg_sentiment from meeting transcripts"
:::

', true, 2);

-- Additional articles for DOC-010, DOC-011, DOC-012

-- Conversations
('ops-conversations', 'Conversations - Multi-Turn Context', 'Conversations', E'# Conversations - Multi-Turn Context

Ask follow-up questions without repeating context. The AI remembers your conversation history.

## How Context Works

:::beginner
When you ask a question, the AI remembers it for the next ~10 queries. This means you can say:

1. "Show law firms"
2. "Just the ones in California" ← AI knows you mean law firms
3. "How many attended meetings?" ← AI knows you mean CA law firms
:::

:::intermediate
Context includes:
- Previous queries and results
- Current filters and sorts
- Selected rows and columns
- External actions (emails sent, tasks created)

Example conversation:
```
You: "Filter to enterprise deals"
AI: Filtered to 45 deals
You: "Who owns these?"
AI: 12 owners - Sarah (18), Mike (15), ...
You: "Create tasks for Sarah''s deals"
AI: Created 18 tasks assigned to Sarah
```
:::

:::advanced
Context is stored per session and persists across page reloads for 24 hours. To reset context, click "New Session" in the chat thread.

You can also pass context explicitly using references:
```
"Compare @current_view to @Q4_Pipeline showing net-new and changes"
```
:::

## Session Management

:::beginner
- Click the message count badge to expand chat history
- Scroll through previous queries and results
- Click "New Session" to start fresh
:::

:::intermediate
Sessions auto-save and can be resumed later. Useful for complex analysis that takes multiple steps:

1. Start session: "Show Q1 pipeline"
2. Continue tomorrow: "How did these deals progress?"
3. AI remembers the Q1 pipeline context
:::

:::advanced
Export session transcripts for documentation:
```
"Export this session to PDF with all queries and results"
```
:::

', true, 3),

-- Workflows
('ops-workflows', 'Workflows - Automation', 'Workflows', E'# Workflows - Automation

Automate repetitive tasks with AI-powered workflows.

## Creating Workflows

:::beginner
1. Click **Workflows** button in toolbar
2. Describe your workflow in natural language:
   "When a contact is added from a law firm, assign to legal team and send Slack alert"
3. Click **Parse Workflow**
4. Review the steps (displayed as cards)
5. Save and activate
:::

:::intermediate
Workflows support 4 trigger types:

- **Manual**: Run on-demand via "Run Now" button
- **On Sync**: Execute when new data syncs from CRM
- **On Cell Change**: Trigger when specific columns update
- **On Schedule**: Run daily/weekly (e.g., every Monday at 9am)

Example workflow:
```
WHEN: On Sync (new contacts)
IF: Company contains "Law"
THEN:
  - Set industry to "Legal"
  - Assign to legal_team
  - Create task "Research firm background"
  - Send Slack to #sales: "New law firm: {company}"
```
:::

:::advanced
Chain multiple workflows for complex automation:

```
Workflow 1: Data Enrichment
  On Sync → Add industry → Score lead

Workflow 2: Routing
  On Cell Change (lead_score) → If >80 → Assign to enterprise_team

Workflow 3: Follow-up
  On Schedule (daily) → If no activity 7 days → Send email

```
:::

## Monitoring Executions

:::beginner
View execution history in the Workflows panel:
- Green check = success
- Red X = failed
- Yellow warning = partial success
:::

:::intermediate
Click on an execution to see detailed logs:
- Which rows were processed
- What actions were taken
- Any errors or warnings
- Execution time
:::

:::advanced
Set up alerts for workflow failures:
```
"Alert #ops-team on Slack if any workflow fails 3 times"
```
:::

', true, 4),

-- Recipes
('ops-recipes', 'Recipes - Saved Queries', 'Recipes', E'# Recipes - Saved Queries

Save and share queries for common tasks.

## Saving Recipes

:::beginner
After executing a successful query, click the bookmark icon:
1. Name your recipe (e.g., "Active Law Firms")
2. Select trigger: One Shot or Auto-Run
3. Save

Find it later in the Recipe Library (book icon).
:::

:::intermediate
Recipes can have parameters:
```
Recipe: "High Value Deals by Rep"
Query: "Filter to deals > ${{min_value}} owned by {{rep_name}}"
Parameters: min_value, rep_name
```

When you run it, you''ll be prompted to fill in the parameters.
:::

:::advanced
Create recipe templates for your team:
```
Recipe: "Monthly Pipeline Review"
- Filter to stage IN (Qualified, Demo, Proposal)
- Sort by close_date ascending
- Create view grouped by owner
- Export to Google Sheets
- Send to #sales-ops Slack

Trigger: Auto-Run (1st of each month at 9am)
```
:::

## Sharing Recipes

:::beginner
Toggle the "Share" button on a recipe to make it visible to your team.
:::

:::intermediate
Shared recipes appear in the "Shared" tab. Team members can:
- Run the recipe on their own tables
- Modify parameters
- Clone and customize
:::

:::advanced
Create recipe collections:
```
Collection: "New Rep Onboarding"
- Recipe: "Your Accounts"
- Recipe: "This Week''s Meetings"
- Recipe: "Open Tasks"
- Recipe: "Pipeline Health Check"
```

Assign collection to new team members for instant productivity.
:::

', true, 5),

-- Cross-Table
('ops-cross-table', 'Cross-Table Queries & Enrichment', 'Cross-Table', E'# Cross-Table Queries & Enrichment

Query across multiple data sources to enrich your tables.

## Available Data Sources

:::beginner
Ops Intelligence can pull data from:
- **CRM**: Contacts, deals, companies (HubSpot, Salesforce)
- **Meetings**: Transcripts, attendees, sentiment (Fathom, 60 Notetaker)
- **Email**: Sent/received, open rates, replies (Gmail sync)
- **Tasks**: Completed, overdue, assigned
- **Other Ops Tables**: Any table you''ve created
:::

:::intermediate
Example enrichment queries:

```
"Add a column showing last meeting date for each contact"
"Add meeting count and avg sentiment from transcripts"
"Show email engagement: sent, opened, replied"
```

The AI will:
1. Find matching records in the other data source
2. Create temporary enriched columns (blue highlight)
3. Show "Keep" button to persist to schema
:::

:::advanced
Complex joins and aggregations:
```
"For each {{table_name}} contact:
 - Count meetings attended
 - Sum deal values they''re associated with
 - Get latest email reply date
 - Calculate engagement score:
   (meetings * 3) + (emails * 1) + (deals * 5)"
```
:::

## Comparison Mode

:::beginner
Compare two tables to find differences:
```
"Compare to Q4 Pipeline table"
```

Shows:
- Net-new: Contacts in current but not Q4
- Removed: Contacts in Q4 but not current
- Changed: Contacts with updated values
:::

:::intermediate
Comparison with specific fields:
```
"Compare deal values vs Q4:
 - Show which deals increased
 - Show which decreased
 - Show total delta"
```
:::

:::advanced
Multi-table comparison with custom logic:
```
"Compare current pipeline to Q3 and Q4:
 - Show 3-quarter trend
 - Identify consistently growing accounts
 - Flag accounts declining 2 quarters in a row"
```
:::

', true, 6),

-- Insights & Predictions
('ops-insights', 'Proactive Insights & Predictions', 'Insights & Predictions', E'# Proactive Insights & Predictions

AI-powered insights appear automatically in the banner above your table.

## Insight Types

:::beginner
Look for the colored cards in the insights banner:

- 🔥 **Cluster Detection** (blue): Multiple contacts at same company
- ⚠️ **Stale Leads** (amber): No activity in X days
- 📊 **Data Quality** (amber): Empty columns, missing info
- 📈 **Conversion Patterns** (green): Timing and behavior trends
:::

:::intermediate
Each insight includes:
- Specific data (counts, names, values)
- Suggested action buttons
- Dismiss option

Example:
```
🔥 3 new contacts appeared at Cooley LLP this week

Contacts: Sarah Smith, Mike Jones, Emily Brown

[Apply Filter] [Map Org Chart] [Dismiss]
```

Clicking "Map Org Chart" runs an enrichment to find relationships.
:::

:::advanced
Insights use predictive models trained on your org''s data:

- **Going Dark Prediction**: Accounts matching lost-deal patterns
  - Confidence: 78%
  - Based on: 45 similar deals that went dark after 14 days no activity

- **Likely to Convert**: Contacts scored by engagement signals
  - Confidence: 82%
  - Pattern: Contacts who attended 2+ meetings and opened 3+ emails convert 67% of time
:::

## Acting on Insights

:::beginner
Click suggested action buttons to execute immediately:
- "Apply Filter" → Filters table to relevant rows
- "Create Tasks" → Generates tasks for follow-up
- "Send Email" → Opens draft with suggested content
:::

:::intermediate
Insights trigger workflows automatically if enabled:
```
Insight: "5 deals been in Demo stage >30 days"
Auto-Action: Create task for each owner + Slack reminder
```
:::

:::advanced
Train the insight engine with feedback:
```
"This insight was helpful" → Model learns
"This was noise" → Model adjusts threshold
```

Customize insight sensitivity:
```
Settings → Insights → Set thresholds:
- Stale lead warning: 45 days (default 30)
- Cluster detection: 3+ contacts (default 2)
- Confidence minimum: 70% (default 50%)
```
:::

## Behavioral Patterns

:::beginner
The AI learns from your org''s successful deals:
- Best time to reach out
- Optimal meeting cadence
- Email subject lines that work
:::

:::intermediate
Example behavioral insights:
```
💡 Team Insight: Reps who call within 2 hours of lead creation convert 6.2x more
Based on: 2,847 leads over 6 months
Confidence: 94%

[Set Auto-Call Reminder] [View Details]
```
:::

:::advanced
Create custom behavioral rules:
```
"Analyze my closed-won deals:
 - Common pattern in meeting frequency
 - Average days to close by industry
 - Most effective email templates

Generate playbook for new reps"
```
:::

', true, 7);

-- Update sequence for the id column
SELECT setval(pg_get_serial_sequence('docs_articles', 'id'), (SELECT MAX(id) FROM docs_articles));
