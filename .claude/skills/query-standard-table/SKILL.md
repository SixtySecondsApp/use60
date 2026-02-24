---
name: Query Standard Table
description: Query data from standard ops tables (Leads, Meetings, All Contacts, All Companies). Use when users ask to show, find, list, or filter records from their CRM-synced standard tables.
version: "1.0"
category: ops
triggers:
  - "show me leads"
  - "show my leads"
  - "list contacts"
  - "find companies"
  - "show meetings"
  - "query leads where"
  - "how many contacts"
  - "top leads"
  - "recent meetings"
  - "companies in"
  - "contacts at"
  - "show all companies"
  - "leads from"
  - "meetings this week"
  - "active contacts"
input_schema:
  type: object
  properties:
    table_name:
      type: string
      enum: ["Leads", "Meetings", "All Contacts", "All Companies"]
      description: "Which standard table to query"
    filters:
      type: array
      items:
        type: object
        properties:
          column:
            type: string
          operator:
            type: string
            enum: ["equals", "not_equals", "contains", "greater_than", "less_than", "is_empty", "is_not_empty", "in"]
          value:
            type: string
      description: "Optional filters to apply"
    sort_by:
      type: string
      description: "Column key to sort by"
    sort_direction:
      type: string
      enum: ["asc", "desc"]
      default: "desc"
    limit:
      type: number
      default: 20
      description: "Max rows to return"
  required: ["table_name"]
output_schema:
  type: object
  properties:
    rows:
      type: array
      description: "Matching rows with cell values"
    total_count:
      type: number
    table_id:
      type: string
actions:
  - execute_action
linked_skills: []
---

# Query Standard Table

Query data from the user's standard ops tables. These tables are automatically provisioned and synced with their CRM.

## Available Tables

| Table | Key | Description |
|-------|-----|-------------|
| Leads | standard_leads | Lead pipeline from contacts + CRM |
| Meetings | standard_meetings | Meeting history with recordings |
| All Contacts | standard_all_contacts | Universal CRM contacts mirror |
| All Companies | standard_all_companies | Unified company data |

## Intent Detection

Map user intent to table:
- "leads", "prospects", "pipeline" → Leads
- "meetings", "calls", "conversations" → Meetings
- "contacts", "people" → All Contacts
- "companies", "accounts", "organizations" → All Companies

## Filter Examples

- "hot leads" → Leads WHERE engagement_level IN (hot, engaged)
- "meetings this week" → Meetings WHERE meeting_date within_last_days 7
- "contacts at Acme" → All Contacts WHERE company_name contains "Acme"
- "companies with revenue > 1M" → All Companies WHERE revenue greater_than 1000000

## Response Format

Return results as a structured table with column headers and row data. Include total count and a link to view the full table in the Ops UI.
