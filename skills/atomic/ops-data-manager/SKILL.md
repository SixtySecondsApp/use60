---
name: Ops Data Manager
description: |
  View, add, and update data in Ops tables including rows and individual cells.
  Use when a user asks "show my table data", "add leads to table", "update this cell",
  "view rows", "add a row", or needs to work with the actual data inside an ops table.
  Returns table data with pagination, row add confirmations, and cell update confirmations.
metadata:
  author: sixty-ai
  version: "2"
  category: data-access
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - prospecting
  triggers:
    - pattern: "show table data"
      intent: "get_ops_table_data"
      confidence: 0.85
      examples:
        - "show me the data"
        - "show my table data"
        - "view table rows"
        - "what's in this table"
    - pattern: "add leads to table"
      intent: "add_ops_rows"
      confidence: 0.90
      examples:
        - "add these leads"
        - "add rows to the table"
        - "put these contacts in my table"
        - "insert these leads into the table"
    - pattern: "add a row"
      intent: "add_ops_rows"
      confidence: 0.85
      examples:
        - "add a new row"
        - "create a row"
        - "add an entry"
        - "insert a record"
    - pattern: "update cell"
      intent: "update_ops_cell"
      confidence: 0.85
      examples:
        - "update this cell"
        - "change the value"
        - "set the email to"
        - "fix the title for"
    - pattern: "view rows"
      intent: "get_ops_table_data"
      confidence: 0.80
      examples:
        - "show me the rows"
        - "display the data"
        - "let me see the entries"
        - "pull up the records"
  keywords:
    - "data"
    - "rows"
    - "cells"
    - "add"
    - "update"
    - "view"
    - "leads"
    - "records"
    - "entries"
    - "table"
  required_context: []
  optional_context:
    - table_id
    - table_name
  inputs:
    - name: table_id
      type: string
      description: "ID of the ops table to work with"
      required: false
    - name: rows
      type: array
      description: "Array of row objects to add, each with column name-value pairs"
      required: false
    - name: row_id
      type: string
      description: "ID of the row containing the cell to update"
      required: false
    - name: column_id
      type: string
      description: "ID of the column for the cell to update"
      required: false
    - name: value
      type: string
      description: "New value for a cell update"
      required: false
  outputs:
    - name: table_data
      type: object
      description: "Table data with rows, columns, and pagination info"
    - name: added_rows
      type: object
      description: "Confirmation of rows added with count"
    - name: updated_cell
      type: object
      description: "Confirmation of cell update with old and new values"
  requires_capabilities:
    - ops_tables
  execution_mode: sync
  timeout_ms: 30000
  priority: high
  tags:
    - ops
    - data
    - prospecting
    - leads
---

## Available Context
@_platform-references/org-variables.md

# Ops Data Manager

## Goal

Work with the actual data inside Ops tables -- viewing rows, adding new leads or records, and updating individual cell values. This is the data layer that sits on top of table structure (managed by ops-table-manager).

Sales reps spend most of their time interacting with table data, not table structure. They need to quickly view their prospect lists, add new leads from conversations, and fix or update individual data points without leaving the chat.

## Required Capabilities
- **Ops Tables**: Read/write access to ops table data

## Inputs
- `table_id`: ID of the ops table to work with
- `rows`: Array of row objects for bulk adding (each row is a `Record<string, string>` mapping column names to values)
- `row_id`: ID of a specific row (for cell updates)
- `column_id`: ID of a specific column (for cell updates)
- `value`: New value for a cell update
- `limit`: Number of rows to fetch (default 25)
- `offset`: Pagination offset for viewing data
- `filter`: Filter criteria for viewing data

## Instructions

### Viewing Table Data

When the user wants to see data in a table:

1. Identify the target table. If the user says a table name, resolve it to an ID using `list_ops_tables` first.
2. Call `execute_action("get_ops_table_data", { table_id: "<id>", limit: 25, offset: 0 })`
3. Present data in a clean, tabular format showing the most important columns first
4. If there are more rows than the limit, note the total: "Showing 25 of 142 rows. Want me to show more?"
5. If the user asks for filtered data, use the `filter` parameter

### Adding Rows

When the user wants to add data:

1. Identify the target table
2. Parse the data the user wants to add. Supported formats:
   - Explicit structured data: "Add John Smith, VP Sales at Acme Corp, john@acme.com"
   - Multiple leads: "Add these three leads: ..."
   - From conversation context: "Add the leads we just found"
3. Map the data to column names. Use `get_ops_table` to check the table's columns if needed.
4. Call `execute_action("add_ops_rows", { table_id: "<id>", rows: [...] })`
   - Each row is an object with column names as keys: `{ "Name": "John Smith", "Company": "Acme Corp", "Title": "VP Sales", "Email": "john@acme.com" }`
5. Confirm: "Added X rows to [Table Name]."

### Updating a Cell

When the user wants to change a specific value:

1. Identify the row and column. The user might say:
   - "Change John Smith's email to john.smith@newdomain.com"
   - "Update the title for row 3 to Director"
   - "Set the score to 85 for Acme Corp"
2. Resolve the row and column IDs. If the user references by name, fetch the table data to find the matching row_id and column_id.
3. Call `execute_action("update_ops_cell", { row_id: "<row_id>", column_id: "<column_id>", value: "<new_value>" })`
4. Confirm: "Updated [Column Name] for [Row Identifier] from '[old]' to '[new]'."

### Bulk Operations

When adding multiple rows:

1. Parse all the data first before making any calls
2. Validate that the column names match the table structure
3. Add all rows in a single `add_ops_rows` call (the action handles batching internally)
4. Report total rows added and any that failed validation

## Available Actions

| Action | Parameters | Returns |
|--------|-----------|---------|
| `get_ops_table_data` | `{ table_id: string, limit?: number, offset?: number, filter?: object }` | Rows with column values and pagination |
| `add_ops_rows` | `{ table_id: string, rows: Array<Record<string, string>> }` | Count of rows added |
| `update_ops_cell` | `{ row_id: string, column_id: string, value: string }` | Updated cell confirmation |

## Output Format

### View Data Response
```
LEAD PROSPECTS (showing 25 of 142)

Name              Company        Title           Email                  Score
John Smith        Acme Corp      VP Sales        john@acme.com          85
Sarah Chen        TechFlow       Director Eng    sarah@techflow.io      72
Mike Ross         DataBridge     CTO             mike@databridge.com    91
...

Showing rows 1-25. Say "show more" for the next page.
```

### Add Rows Confirmation
```
Added 3 rows to "Lead Prospects":
  - John Smith (Acme Corp)
  - Sarah Chen (TechFlow)
  - Mike Ross (DataBridge)

Table now has 145 rows total.
```

### Update Cell Confirmation
```
Updated Email for John Smith:
  Old: john@oldcompany.com
  New: john@acme.com
```

## Error Handling

### Table has no data
If the table exists but has no rows: "This table is empty. Want me to add some rows, or import data from Apollo/HubSpot?"

### Column name mismatch
If the user provides data with column names that don't match the table: "The table doesn't have a '[column]' column. Available columns are: [list]. Did you mean '[closest match]'?"

### Row not found
If the user references a row that doesn't exist: "I couldn't find a row matching '[identifier]'. Let me show you the current data so we can find the right one."

### Invalid value for column type
If the user tries to set a non-numeric value in a number column or an invalid email in an email column, flag it: "That doesn't look like a valid [type] for the [column] column. Did you mean '[suggestion]'?"

## Guidelines
- When displaying data, prioritize columns: Name/Company first, then email/contact info, then other fields
- For large tables (100+ rows), always paginate -- never dump the entire table
- When adding rows, validate against the table's column structure before calling the action
- Map user-friendly column references to actual column IDs (users say "email", not "col_abc123")
- If the user says "add a lead" (singular), still use `add_ops_rows` with a single-item array
- Preserve existing cell values when updating -- never clear other cells in the same row
