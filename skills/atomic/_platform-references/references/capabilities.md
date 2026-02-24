# Capability-to-Tool Mapping Reference

When a skill declares `requires_capabilities` in its frontmatter, it signals which tool domains the skill needs at runtime. This document maps each capability to its specific `execute_action` sub-actions.

```yaml
metadata:
  requires_capabilities:
    - crm
    - email
```

The above declaration means the skill can use all tools listed under both the `crm` and `email` capabilities.

---

## Capability Map

### `crm`

CRM data retrieval and updates.

| Tool | Description |
|------|-------------|
| `get_contact` | Get contact details by ID, email, or name |
| `get_lead` | Get lead details |
| `get_deal` | Get deal details with stage, amount, contacts |
| `get_pipeline_summary` | Get pipeline overview with totals by stage |
| `get_pipeline_deals` | Get deals with filters (closing_soon, at_risk, stale) |
| `get_pipeline_forecast` | Get forecast data by stage |
| `get_contacts_needing_attention` | Get contacts with no recent activity |
| `get_company_status` | Get company/account status |
| `update_crm` | Update CRM records (requires confirmation) |

---

### `email`

Email search and drafting.

| Tool | Description |
|------|-------------|
| `search_emails` | Search email threads by contact or query |
| `draft_email` | Draft an email (requires confirmation) |

---

### `calendar`

Meeting data and scheduling insights.

| Tool | Description |
|------|-------------|
| `get_meetings` | Get meetings with filters |
| `get_next_meeting` | Get next upcoming meeting |
| `get_meetings_for_period` | Get meetings for a specific day/week |
| `get_booking_stats` | Get meeting booking statistics |
| `get_meeting_count` | Get meeting count for a period |
| `get_time_breakdown` | Get time allocation breakdown |

---

### `tasks`

Task creation and management.

| Tool | Description |
|------|-------------|
| `create_task` | Create a new task (requires confirmation) |
| `list_tasks` | List tasks with filters |

---

### `enrichment`

Contact and company enrichment from external data sources.

| Tool | Description |
|------|-------------|
| `enrich_contact` | Enrich a contact with external data |
| `enrich_company` | Enrich a company with external data |

---

### `notifications`

Sending notifications to external channels.

| Tool | Description |
|------|-------------|
| `send_notification` | Send notification via Slack or in-app (requires confirmation) |

---

### `ops_tables`

Full ops table management: CRUD, data manipulation, AI features, rules, and integrations.

| Tool | Description |
|------|-------------|
| `list_ops_tables` | List all ops tables |
| `get_ops_table` | Get ops table details and schema |
| `create_ops_table` | Create new ops table (requires confirmation) |
| `delete_ops_table` | Delete an ops table (requires confirmation) |
| `add_ops_column` | Add column to ops table |
| `get_ops_table_data` | Get ops table rows |
| `add_ops_rows` | Add rows to ops table |
| `update_ops_cell` | Update a cell value |
| `ai_query_ops_table` | Ask AI questions about table data |
| `ai_transform_ops_column` | AI-transform column values |
| `get_enrichment_status` | Check enrichment job status |
| `create_ops_rule` | Create automation rule |
| `list_ops_rules` | List rules for a table |
| `sync_ops_hubspot` | Sync with HubSpot |
| `sync_ops_attio` | Sync with Attio |
| `push_ops_to_instantly` | Push to Instantly campaign |
| `get_ops_insights` | Get AI insights about table data |

---

### `skills`

Skill and sequence composition — invoking other skills from within a skill.

| Tool | Description |
|------|-------------|
| `invoke_skill` | Invoke another skill with context passing |
| `run_skill` | Run a skill with AI processing |
| `run_sequence` | Run a multi-step agent sequence |

---

### `web_search`

Web search and research. Not an `execute_action` sub-action — uses the separate `gemini_research` tool.

| Tool | Description |
|------|-------------|
| `gemini_research` | Deep research using Gemini AI with web search |

---

## Usage in Skills

Declare capabilities in your skill's frontmatter to document which tool domains the skill uses:

```yaml
metadata:
  requires_capabilities:
    - crm
    - email
    - tasks
```

This serves as documentation and enables the platform to:
1. Validate that the skill only uses tools from its declared capabilities
2. Show users what data the skill can access
3. Filter skills by capability in management UIs

## Activities

Note: `create_activity` is available to all skills that have CRM access. It falls under the `crm` capability since activities are a core CRM entity.

| Tool | Description |
|------|-------------|
| `create_activity` | Log an activity (requires confirmation) |

## Lead Tables

Lead table operations combine search and ops table functionality:

| Tool | Description |
|------|-------------|
| `search_leads_create_table` | Search leads and create an ops table with results |
| `enrich_table_column` | Enrich a column in an ops table |

These are available when a skill declares either `enrichment` or `ops_tables` capability.
