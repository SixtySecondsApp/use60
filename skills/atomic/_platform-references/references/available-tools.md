# Available Tools Reference

Complete catalog of tools available to skills at runtime. All `execute_action` sub-actions are invoked via the copilot's `execute_action` tool. Additional tools (`gemini_research`, `resolve_entity`) are separate top-level tools.

---

## CRM Data Retrieval

### `get_contact`
Get contact details by ID, email, or name.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | no | Contact ID |
| `email` | string | no | Contact email |
| `name` | string | no | Contact name (fuzzy match) |

Returns: Contact object with name, email, company, deal associations, activity history.

---

### `get_lead`
Get lead details by ID or name.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `lead_id` | string | no | Lead ID |
| `name` | string | no | Lead name |

Returns: Lead object.

---

### `get_deal`
Get deal details with stage, amount, contacts, and optional health score.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | no | Deal ID |
| `name` | string | no | Deal name (fuzzy match) |
| `close_date_from` | string | no | ISO date — filter deals closing after this date |
| `close_date_to` | string | no | ISO date — filter deals closing before this date |
| `status` | string | no | Deal status filter |
| `stage_id` | string | no | Pipeline stage filter |
| `include_health` | boolean | no | Include relationship health score |
| `limit` | number | no | Max results |

Returns: Deal object with stage, amount, contacts, close date. Optionally includes health score.

---

### `get_pipeline_summary`
Get pipeline overview with totals by stage.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| (none) | | | No parameters required |

Returns: Summary with total deals, total value, breakdown by stage.

---

### `get_pipeline_deals`
Get deals in pipeline with optional filters.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `filter` | string | no | One of: `closing_soon`, `at_risk`, `stale`, `needs_attention` |
| `days` | number | no | Days threshold for filter |
| `period` | string | no | Time period |
| `include_health` | boolean | no | Include relationship health scores |
| `limit` | number | no | Max results |

Returns: List of deals matching filter criteria.

---

### `get_pipeline_forecast`
Get forecast data by stage.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `period` | string | no | Forecast period |

Returns: Forecast with weighted and unweighted totals by stage.

---

### `get_contacts_needing_attention`
Get contacts with no recent activity.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `days_since_contact` | number | no | Days since last activity (default varies) |
| `filter` | string | no | One of: `at_risk`, `ghost`, `all` |
| `limit` | number | no | Max results |

Returns: Contact list sorted by days since last contact.

---

### `get_company_status`
Get company/account status and details.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `company_id` | string | no | Company ID |
| `company_name` | string | no | Company name (fuzzy match) |
| `domain` | string | no | Company domain |

Returns: Company details including contacts, deals, and activity summary.

---

## Meetings

### `get_meetings`
Get meetings with optional filters.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `meeting_id` | string | no | Specific meeting ID |
| `contactEmail` | string | no | Filter by attendee email |
| `contactId` | string | no | Filter by contact ID |
| `limit` | number | no | Max results |

Returns: List of meetings with attendees, time, and notes.

---

### `get_booking_stats`
Get meeting booking statistics.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `period` | string | no | Time period |
| `filter_by` | string | no | Filter dimension |
| `source` | string | no | Meeting source |
| `org_wide` | boolean | no | Include org-wide stats (admin only) |

Returns: Booking statistics with counts and trends.

---

### `get_meeting_count`
Get meeting count for a specific period.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `period` | string | **yes** | One of: `today`, `tomorrow`, `this_week`, `next_week`, `this_month` |
| `timezone` | string | no | IANA timezone |
| `weekStartsOn` | number | no | 0 (Sunday) or 1 (Monday) |

Returns: Integer count.

---

### `get_next_meeting`
Get the next upcoming meeting.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `includeContext` | boolean | no | Include CRM context (contact, deal info) |
| `timezone` | string | no | IANA timezone |

Returns: Next meeting object with time, attendees, and optionally CRM context.

---

### `get_meetings_for_period`
Get meetings for a specific period.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `period` | string | **yes** | `today`, `tomorrow`, `monday`-`sunday`, `this_week`, `next_week` |
| `timezone` | string | no | IANA timezone |
| `weekStartsOn` | number | no | 0 (Sunday) or 1 (Monday) |
| `includeContext` | boolean | no | Include CRM context |
| `limit` | number | no | Max results |

Returns: List of meetings for the specified period.

---

### `get_time_breakdown`
Get time allocation breakdown.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `period` | string | **yes** | One of: `this_week`, `last_week`, `this_month`, `last_month` |
| `timezone` | string | no | IANA timezone |
| `weekStartsOn` | number | no | 0 (Sunday) or 1 (Monday) |

Returns: Time breakdown with hours by meeting type and category.

---

## Email

### `search_emails`
Search email threads.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `contact_email` | string | no | Filter by contact email |
| `contact_id` | string | no | Filter by contact ID |
| `contact_name` | string | no | Filter by contact name |
| `query` | string | no | Search query |
| `limit` | number | no | Max results |

Returns: Email threads with subject, snippet, dates.

---

### `draft_email`
Draft an email. **Requires user confirmation.**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `to` | string | no | Recipient email |
| `subject` | string | no | Email subject |
| `context` | string | no | Context for AI-generated draft |
| `tone` | string | no | Tone (professional, friendly, etc.) |

Returns: Draft email for user review. Requires confirmation before sending.

---

## CRM Updates

### `update_crm`
Update a CRM record (deal, contact, task, or activity). **Requires user confirmation.**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `entity` | string | **yes** | One of: `deal`, `contact`, `task`, `activity` |
| `id` | string | **yes** | Entity ID |
| `updates` | object | **yes** | Fields to update |

Returns: Updated record. Shows preview first, requires confirmation to apply.

---

### `send_notification`
Send a notification via Slack or in-app. **Requires user confirmation.**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `channel` | string | no | Notification channel (e.g., `slack`) |
| `message` | string | **yes** | Message content |
| `blocks` | array | no | Slack Block Kit blocks |
| `meta` | object | no | Additional metadata |

Returns: Sent status. Requires confirmation.

---

## Enrichment

### `enrich_contact`
Enrich a contact with external data sources.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | **yes** | Contact email |
| `name` | string | no | Contact name |
| `title` | string | no | Job title |
| `company_name` | string | no | Company name |

Returns: Enriched contact data (social profiles, company info, etc.).

---

### `enrich_company`
Enrich a company with external data sources.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | **yes** | Company name |
| `domain` | string | no | Company domain |
| `website` | string | no | Company website URL |

Returns: Enriched company data (size, industry, tech stack, etc.).

---

## Skill & Sequence Execution

### `invoke_skill`
Invoke another skill for composition. Enables skills to call other skills.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `skill_key` | string | **yes** | Target skill to invoke |
| `context` | object | no | Context to pass to the skill |
| `merge_parent_context` | boolean | no | Merge parent context (default: true) |
| `timeout_ms` | number | no | Max execution time (default: 30000) |
| `return_format` | string | no | `full` or `data_only` (default: `data_only`) |

Returns: Skill output.

---

### `run_skill`
Run a skill with AI processing. Alias for invoke_skill with simpler interface.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `skill_key` | string | **yes** | Skill to execute |
| `context` | object | no | Context variables (domain, company_name, etc.) |

Returns: Skill output.

---

### `run_sequence`
Run a multi-step agent sequence.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `sequence_key` | string | **yes** | Sequence to execute |
| `sequence_context` | object | no | Context for the sequence |
| `is_simulation` | boolean | no | Run as simulation/preview (default: false) |

Returns: Sequence output. When `is_simulation: true`, returns a preview for user confirmation.

---

## Tasks

### `create_task`
Create a new task. **Requires user confirmation.**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | **yes** | Task title |
| `description` | string | no | Task description |
| `due_date` | string | no | ISO date string |
| `contact_id` | string | no | Associated contact |
| `deal_id` | string | no | Associated deal |
| `priority` | string | no | `low`, `medium`, or `high` |
| `assignee_id` | string | no | Assigned user ID |

Returns: Created task. Requires confirmation.

---

### `list_tasks`
List tasks with filters.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | no | `pending`, `in_progress`, `completed`, `cancelled`, `overdue` |
| `priority` | string | no | `low`, `medium`, `high`, `urgent` |
| `contact_id` | string | no | Filter by contact |
| `deal_id` | string | no | Filter by deal |
| `company_id` | string | no | Filter by company |
| `due_before` | string | no | ISO date — tasks due before |
| `due_after` | string | no | ISO date — tasks due after |
| `limit` | number | no | Max results (default: 20) |

Returns: Task list.

---

## Activities

### `create_activity`
Log an activity. **Requires user confirmation.**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | **yes** | One of: `outbound`, `meeting`, `proposal`, `sale` |
| `client_name` | string | **yes** | Client/company name |
| `details` | string | no | Activity details |
| `amount` | number | no | Amount (for proposals/sales) |
| `date` | string | no | ISO date (default: now) |
| `status` | string | no | `pending`, `completed`, `cancelled` |
| `priority` | string | no | `low`, `medium`, `high` |
| `contact_id` | string | no | Associated contact |
| `deal_id` | string | no | Associated deal |
| `company_id` | string | no | Associated company |

Returns: Created activity. Requires confirmation.

---

## Lead Tables

### `search_leads_create_table`
Search for leads and create an ops table with results.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| (search criteria) | object | **yes** | Search parameters (titles, industries, locations, etc.) |

Returns: Ops table populated with matching leads.

---

### `enrich_table_column`
Enrich a column in an ops table with external data.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `table_id` | string | **yes** | Ops table ID |
| `column` | string | **yes** | Column to enrich |
| `enrichment_type` | string | **yes** | Type of enrichment |

Returns: Enrichment job status.

---

## Ops Tables CRUD

### `list_ops_tables`
List all ops tables.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `limit` | number | no | Max results |
| `source_type` | string | no | Filter by source type |

Returns: List of ops tables with name, column count, row count.

---

### `get_ops_table`
Get ops table details and schema.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `table_id` | string | **yes** | Ops table ID |

Returns: Table metadata with column definitions.

---

### `create_ops_table`
Create a new ops table. **Requires user confirmation.**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | **yes** | Table name |
| `description` | string | no | Table description |
| `columns` | array | no | Column definitions: `{ name, column_type, config? }` |

Returns: Created table.

---

### `delete_ops_table`
Delete an ops table. **Requires user confirmation.**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `table_id` | string | **yes** | Ops table ID |

Returns: Deletion status.

---

## Ops Data

### `add_ops_column`
Add a column to an ops table.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `table_id` | string | **yes** | Ops table ID |
| `name` | string | **yes** | Column name |
| `column_type` | string | **yes** | Column type |
| `config` | object | no | Column configuration |

Returns: Created column.

---

### `get_ops_table_data`
Get ops table data (rows).

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `table_id` | string | **yes** | Ops table ID |
| `limit` | number | no | Max rows |
| `offset` | number | no | Row offset for pagination |

Returns: Rows with cell values.

---

### `add_ops_rows`
Add rows to an ops table.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `table_id` | string | **yes** | Ops table ID |
| `rows` | array | **yes** | Array of row objects (column_name: value) |

Returns: Added rows.

---

### `update_ops_cell`
Update a single cell value.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `row_id` | string | **yes** | Row ID |
| `column_id` | string | **yes** | Column ID |
| `value` | any | **yes** | New cell value |

Returns: Updated cell.

---

## Ops AI

### `ai_query_ops_table`
Ask AI questions about ops table data.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `table_id` | string | **yes** | Ops table ID |
| `query` | string | **yes** | Natural language question |

Returns: AI-generated answer based on table data.

---

### `ai_transform_ops_column`
AI-transform values in a column.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `table_id` | string | **yes** | Ops table ID |
| `column_id` | string | **yes** | Column to transform |
| `prompt` | string | **yes** | Transformation instruction |
| `row_ids` | array | no | Specific rows to transform (all if omitted) |

Returns: Transformation status.

---

### `get_enrichment_status`
Check enrichment job status.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `table_id` | string | **yes** | Ops table ID |
| `column_id` | string | no | Specific column (all columns if omitted) |

Returns: Enrichment progress and status.

---

## Ops Rules

### `create_ops_rule`
Create an automation rule for an ops table.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `table_id` | string | **yes** | Ops table ID |
| `name` | string | **yes** | Rule name |
| `trigger_type` | string | **yes** | Trigger type |
| `condition` | object | **yes** | Trigger condition |
| `action_type` | string | **yes** | Action to perform |
| `action_config` | object | **yes** | Action configuration |

Returns: Created rule.

---

### `list_ops_rules`
List automation rules for a table.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `table_id` | string | **yes** | Ops table ID |

Returns: List of rules with trigger and action details.

---

## Ops Integrations

### `sync_ops_hubspot`
Sync ops table with HubSpot.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `table_id` | string | **yes** | Ops table ID |
| `list_id` | string | no | HubSpot list ID |
| `field_mapping` | object | no | Column-to-HubSpot field mapping |

Returns: Sync status.

---

### `sync_ops_attio`
Sync ops table with Attio.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `table_id` | string | **yes** | Ops table ID |
| `list_id` | string | no | Attio list ID |
| `field_mapping` | object | no | Column-to-Attio field mapping |

Returns: Sync status.

---

### `push_ops_to_instantly`
Push ops table data to Instantly campaign.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `table_id` | string | **yes** | Ops table ID |
| `campaign_id` | string | no | Instantly campaign ID |
| `row_ids` | array | no | Specific rows to push (all if omitted) |

Returns: Push status.

---

## Ops Insights

### `get_ops_insights`
Get AI-generated insights about ops table data.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `table_id` | string | **yes** | Ops table ID |
| `insight_type` | string | no | Type of insight to generate |

Returns: AI insights about patterns, trends, and recommendations.

---

## Additional Tools (not execute_action)

These are separate top-level tools, not sub-actions of `execute_action`.

### `gemini_research`
Deep research using Gemini AI. For complex research queries requiring multi-step web search and synthesis.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | **yes** | Research query |
| `context` | string | no | Additional context to guide research |

Returns: Research findings with sources.

---

### `resolve_entity`
Resolve ambiguous person references (e.g., first-name-only to full contact record).

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | **yes** | Name to resolve |
| `context` | string | no | Additional context (company, role) |

Returns: Resolved entity with full details and confidence score.

---

## Confirmation Pattern

Tools marked **"Requires user confirmation"** use the preview-confirm HITL pattern:

1. First call with `is_simulation: true` returns a preview
2. The copilot presents the preview to the user
3. User replies "confirm" / "yes" / "go ahead"
4. Second call with `is_simulation: false` executes the action

This applies to: `draft_email`, `update_crm`, `send_notification`, `create_task`, `create_activity`, `create_ops_table`, `delete_ops_table`.
