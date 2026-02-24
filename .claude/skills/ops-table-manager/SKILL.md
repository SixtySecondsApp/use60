---
name: Ops Table Manager
description: |
  Create, list, view, and manage Ops tables and their columns.
  Use when a user asks "create a table", "list my tables", "show table details",
  "add a column", "delete this table", or needs to manage table structure.
  Returns table metadata, column definitions, and confirmation of structural changes.
metadata:
  author: sixty-ai
  version: "2"
  category: data-access
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - prospecting
    - crm_ops
  triggers:
    - pattern: "create a table"
      intent: "create_ops_table"
      confidence: 0.90
      examples:
        - "create a new table"
        - "make me a table"
        - "set up a new ops table"
        - "I need a new table for leads"
    - pattern: "list my tables"
      intent: "list_ops_tables"
      confidence: 0.85
      examples:
        - "show my tables"
        - "what tables do I have"
        - "list all tables"
        - "show ops tables"
    - pattern: "show table details"
      intent: "get_ops_table"
      confidence: 0.85
      examples:
        - "show me this table"
        - "table details"
        - "what columns does this table have"
        - "describe this table"
    - pattern: "add a column"
      intent: "add_ops_column"
      confidence: 0.85
      examples:
        - "add column to table"
        - "I need a new column"
        - "add a field for email"
        - "create a column called company"
    - pattern: "delete this table"
      intent: "delete_ops_table"
      confidence: 0.90
      examples:
        - "remove this table"
        - "delete the table"
        - "get rid of this table"
  keywords:
    - "table"
    - "create"
    - "list"
    - "column"
    - "delete"
    - "ops"
    - "manage"
    - "structure"
    - "schema"
    - "field"
  required_context: []
  optional_context:
    - table_name
    - table_id
  inputs:
    - name: table_id
      type: string
      description: "ID of the table to view, modify, or delete"
      required: false
    - name: table_name
      type: string
      description: "Name for a new table"
      required: false
    - name: column_name
      type: string
      description: "Name for a new column"
      required: false
    - name: column_type
      type: string
      description: "Type of column to add (text, number, url, email, date, select, ai_generate)"
      required: false
  outputs:
    - name: tables
      type: array
      description: "List of ops tables with id, name, row_count, and source_type"
    - name: table
      type: object
      description: "Single table with columns array and enrichment stats"
    - name: confirmation
      type: object
      description: "Confirmation of create, delete, or column add operation"
  requires_capabilities:
    - ops_tables
  execution_mode: sync
  timeout_ms: 30000
  priority: high
  tags:
    - ops
    - tables
    - prospecting
    - data-management
---

## Available Context
@_platform-references/org-variables.md

# Ops Table Manager

## Goal

Manage the lifecycle and structure of Ops tables -- the flexible, spreadsheet-like data stores that power prospecting workflows. This skill handles creating tables, listing existing tables, viewing table details and columns, adding columns, and deleting tables.

Ops tables are the foundation of the prospecting system. Every enrichment, AI query, and data import flows through them. Getting the structure right upfront saves reps from painful restructuring later.

## Required Capabilities
- **Ops Tables**: CRUD access to ops tables and column management

## Inputs
- `table_id`: ID of an existing table (for view, modify, or delete operations)
- `table_name`: Name for a new table (for create operations)
- `column_name`: Name for a new column (for add column operations)
- `column_type`: Type of column -- one of: `text`, `number`, `url`, `email`, `date`, `select`, `ai_generate`
- `description`: Optional description for a new table
- `columns`: Optional array of initial columns when creating a table (each with `name` and `type`)

## Instructions

### Listing Tables

When the user wants to see their tables:

1. Call `execute_action("list_ops_tables", { limit: 50 })`
2. Present the results as a scannable list showing:
   - Table name
   - Row count
   - Source type (manual, import, apollo, hubspot, etc.)
3. If no tables exist, suggest creating one: "You don't have any ops tables yet. Want me to create one?"

### Viewing Table Details

When the user asks about a specific table:

1. Identify the table -- if the user gives a name, first call `list_ops_tables` to find the matching ID
2. Call `execute_action("get_ops_table", { table_id: "<id>" })`
3. Present:
   - Table name and description
   - Column list with types
   - Row count
   - Enrichment stats (if any columns have been enriched)

### Creating a Table

When the user wants a new table:

1. Confirm the table name. If not provided, ask: "What would you like to name the table?"
2. Ask about initial columns if not specified. Suggest sensible defaults based on context:
   - For a leads table: Name, Company, Title, Email, LinkedIn URL, Phone
   - For a companies table: Company Name, Domain, Industry, Size, Location
3. Call `execute_action("create_ops_table", { name: "<name>", description: "<desc>", columns: [...] })`
4. Confirm creation with the table name and column count

### Adding a Column

When the user wants to add a column:

1. Identify the target table (by name or ID)
2. Determine column name and type. If type is not specified, infer from the name:
   - "email" -> `email`
   - "website", "url", "linkedin" -> `url`
   - "revenue", "count", "size", "score" -> `number`
   - "date", "founded", "created" -> `date`
   - Otherwise -> `text`
3. Call `execute_action("add_ops_column", { table_id: "<id>", name: "<name>", column_type: "<type>" })`
4. For `ai_generate` type columns, ask for the generation prompt: "What should the AI generate for this column?"
5. Confirm the column was added

### Deleting a Table

When the user wants to delete a table:

1. **Always confirm before deleting.** Show the table name and row count: "This will permanently delete '[Table Name]' with X rows. Are you sure?"
2. Only proceed after explicit confirmation
3. Call `execute_action("delete_ops_table", { table_id: "<id>", confirm: true })`
4. Confirm deletion

## Available Actions

| Action | Parameters | Returns |
|--------|-----------|---------|
| `list_ops_tables` | `{ limit?: number }` | Array of tables with id, name, row_count, source_type |
| `get_ops_table` | `{ table_id: string }` | Table with columns array and enrichment stats |
| `create_ops_table` | `{ name: string, description?: string, columns?: Array<{name, type}> }` | New table object |
| `delete_ops_table` | `{ table_id: string, confirm: true }` | Deletion confirmation |
| `add_ops_column` | `{ table_id: string, name: string, column_type: string, config?: object }` | New column object |

## Output Format

### List Tables Response
```
YOUR OPS TABLES (X tables)
  Lead Prospects    142 rows   Source: apollo
  Target Companies   38 rows   Source: manual
  HubSpot Import     95 rows   Source: hubspot
```

### Table Details Response
```
TABLE: Lead Prospects (142 rows)
Source: apollo | Created: Jan 15, 2026

COLUMNS (8)
  Name         text
  Company      text
  Title        text
  Email        email
  LinkedIn     url
  Phone        text
  Score        number
  Notes        ai_generate (enriched: 89%)
```

### Create Confirmation
```
Table "[Name]" created with X columns.
Ready to add data -- you can import from Apollo, HubSpot, or add rows manually.
```

## Error Handling

### Table not found
If a table name doesn't match any existing table, list available tables and ask: "I couldn't find a table called '[name]'. Here are your tables -- which one did you mean?"

### Duplicate table name
If the user tries to create a table with a name that already exists, inform them and suggest alternatives: "A table called '[name]' already exists. Want me to use a different name, or did you mean to open the existing one?"

### Delete confirmation not given
If the user says "delete table" but does not explicitly confirm after the warning, do NOT proceed. Respond: "No problem, the table is safe. Let me know if you change your mind."

### Invalid column type
If an unrecognized column type is requested, suggest the closest valid type and confirm before proceeding.

## Guidelines
- Always use table IDs (not names) when calling actions -- names are for display only
- When creating tables for prospecting, suggest the standard lead columns (Name, Company, Title, Email, LinkedIn)
- Column names should be human-readable (use "Company Name" not "company_name")
- Suggest `ai_generate` column type when the user wants AI-derived data (e.g., "company summary", "personalized intro")
- Never delete a table without explicit user confirmation
