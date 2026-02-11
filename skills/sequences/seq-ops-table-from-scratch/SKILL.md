---
name: Ops Table from Scratch
description: |
  Build a complete ops table from a description: create the table, add columns for the
  desired data points, run AI transforms to populate calculated fields, and enrich with
  external data sources. Use when a user says "build me a table for", "create a prospecting
  table from scratch", "set up a table with these columns", "make me a lead table",
  or wants to go from zero to a fully structured and populated ops table in one workflow.
  Handles table creation, column configuration, AI-powered data transforms, and enrichment.
metadata:
  author: sixty-ai
  version: "1"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: "build me a table for"
      intent: "table_from_scratch"
      confidence: 0.95
      examples:
        - "build me a table for tracking SaaS prospects"
        - "build me a lead table"
        - "build me a table for competitor analysis"
    - pattern: "create a prospecting table from scratch"
      intent: "prospecting_table_scratch"
      confidence: 0.95
      examples:
        - "create a table from scratch"
        - "start a new prospecting table"
        - "set up a fresh prospect table"
    - pattern: "set up a table with columns"
      intent: "table_with_columns"
      confidence: 0.90
      examples:
        - "set up a table with these columns"
        - "create a table with name, email, company, score"
        - "make a table with the right columns for outbound"
    - pattern: "make me a lead table"
      intent: "lead_table_creation"
      confidence: 0.90
      examples:
        - "make me a prospect table"
        - "make a contact list table"
        - "create an accounts table"
    - pattern: "table from description"
      intent: "table_from_description"
      confidence: 0.85
      examples:
        - "create a table based on this description"
        - "generate a table for this use case"
        - "I need a table that tracks"
  keywords:
    - "table"
    - "create"
    - "build"
    - "from scratch"
    - "columns"
    - "set up"
    - "prospecting"
    - "lead table"
    - "new table"
  required_context: []
  inputs:
    - name: table_name
      type: string
      description: "Name for the new table"
      required: true
    - name: table_description
      type: string
      description: "Description of what the table is for and what data it should hold"
      required: false
    - name: columns
      type: array
      description: "Array of column definitions (name, type, enrichment_type if applicable)"
      required: false
    - name: ai_transform_prompt
      type: string
      description: "AI transform prompt for generating calculated/derived columns"
      required: false
    - name: enrichment_types
      type: array
      description: "Enrichment types to add and run (company_research, email_finder, etc.)"
      required: false
  outputs:
    - name: table_id
      type: string
      description: "ID of the created table"
    - name: columns_added
      type: array
      description: "List of columns added to the table"
    - name: transform_result
      type: object
      description: "AI transform execution result"
    - name: enrichment_status
      type: object
      description: "Enrichment job status"
  requires_capabilities:
    - enrichment
  priority: high
  workflow:
    - order: 1
      action: create_ops_table
      input_mapping:
        name: "${trigger.params.table_name}"
        description: "${trigger.params.table_description}"
      output_key: table_created
      on_failure: stop

    - order: 2
      action: add_ops_column
      input_mapping:
        table_id: "${outputs.table_created.table_id}"
        columns: "${trigger.params.columns}"
      output_key: columns_added
      on_failure: stop

    - order: 3
      action: ai_transform_ops_column
      input_mapping:
        table_id: "${outputs.table_created.table_id}"
        prompt: "${trigger.params.ai_transform_prompt}"
      output_key: transform_result
      on_failure: continue

    - order: 4
      action: enrich_table_column
      input_mapping:
        table_id: "${outputs.table_created.table_id}"
        enrichment_types: "${trigger.params.enrichment_types}"
      output_key: enrichment_status
      on_failure: continue

  linked_skills:
    - ops-data-manager
    - ops-ai-transform
    - ops-enrichment-manager
  tags:
    - agent-sequence
    - ops-tables
    - table-creation
    - enrichment
    - ai-transform
---

## Available Context
@_platform-references/org-variables.md

# Ops Table from Scratch Sequence

## Overview

Build a complete, structured ops table from a user's description. This sequence takes a natural language description of what the user needs and creates a table with the right columns, AI-generated data in calculated fields, and enrichment for external data. Goes from zero to a fully populated table in one workflow.

## Steps

### Step 1: Create the Table
- Create a new ops table with the user-provided name
- If no name is provided, generate one from the description (e.g., "SaaS VP Sales Prospects")
- Confirm table creation with the user

### Step 2: Add Columns
- Add columns based on user requirements
- If the user provided explicit column definitions, use those
- If the user gave a description, infer the right columns:
  - **Prospecting table**: name, email, company, title, linkedin_url, company_size, industry, status
  - **Competitor analysis**: company_name, domain, industry, employee_count, funding, key_products, strengths, weaknesses
  - **Account tracking**: company_name, domain, owner, stage, last_contact, next_step, deal_value
- Include enrichment columns if enrichment types were requested
- Show the user the column structure before proceeding

### Step 3: AI Transform (Optional)
- If the user requested AI-generated columns (scoring, categorization, summarization), run AI transforms
- The `ai_transform_prompt` controls what the AI generates per row
- Common transforms:
  - Lead scoring: "Score this lead 1-100 based on company size, industry fit, and title seniority"
  - Categorization: "Categorize this company as SMB, Mid-Market, or Enterprise based on employee count"
  - Personalization hooks: "Write a one-line personalization opener for cold outreach based on this lead's data"
- If no AI transform was requested, this step is skipped

### Step 4: Enrichment (Optional)
- If enrichment types were requested, add enrichment columns and start enrichment
- Common enrichment types: `company_research`, `email_finder`, `phone_finder`
- Enrichment runs asynchronously and may take several minutes for large tables
- Report progress to user

## Flow Control

- Step 1 failure -> **stop** (can't do anything without a table)
- Step 2 failure -> **stop** (empty table is not useful)
- Step 3 failure -> **continue** (AI transform is optional -- table and columns are still valuable)
- Step 4 failure -> **continue** (enrichment is optional -- table structure and transforms are still valuable)

## Smart Column Inference

When the user describes what they need rather than listing specific columns, infer the right structure:

| User Description | Inferred Columns |
|-----------------|-----------------|
| "prospecting table for SaaS" | name, email, company, title, linkedin_url, company_size, industry, location, status |
| "competitor tracking" | company_name, domain, industry, employee_count, funding_total, products, strengths, weaknesses, last_updated |
| "event follow-up list" | name, email, company, title, event_name, conversation_notes, follow_up_status, priority |
| "partner pipeline" | company_name, domain, contact_name, contact_email, partner_type, stage, revenue_potential, next_step |

Always confirm the inferred columns with the user before creating them.

## Conversation Example

```
User: "Build me a table for tracking AI startup prospects in the Bay Area"
```
