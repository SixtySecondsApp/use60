---
name: AI Ark Data Enrichment
description: |
  Refresh and augment existing records with the latest information from AI Ark.
  Batch-updates contacts with current job titles, company info, verified emails,
  and phone numbers. Use when a user says "refresh contacts", "update job titles",
  "data hygiene", "enrich with latest job info", or wants to keep their ops data current.
  Runs against existing ops table rows in bulk.
metadata:
  author: sixty-ai
  version: "1"
  category: enrichment
  skill_type: atomic
  is_active: true

  triggers:
    - pattern: "refresh contacts with ai ark"
      intent: "ai_ark_bulk_enrichment"
      confidence: 0.90
      examples:
        - "use ai ark to refresh these contacts"
        - "ai ark data refresh"
    - pattern: "refresh all contacts"
      intent: "data_refresh"
      confidence: 0.70
      examples:
        - "refresh all contacts in this table with their latest job info"
        - "update the job titles for everyone in this op"
    - pattern: "data hygiene"
      intent: "data_hygiene"
      confidence: 0.65
      examples:
        - "run data hygiene on this table"
        - "clean up and refresh this contact list"
        - "verify and update these records"

  keywords:
    - "refresh"
    - "data hygiene"
    - "bulk enrich"
    - "update records"
    - "ai ark"
    - "latest info"

  required_context:
    - table_id

  inputs:
    - name: table_id
      type: string
      description: "ID of the ops table to enrich"
      required: true
    - name: column_id
      type: string
      description: "Specific column to enrich (optional — enriches all enrichable columns if omitted)"
      required: false

  outputs:
    - name: enrichment_summary
      type: object
      description: "Summary with counts: total_rows, enriched, failed, unchanged"

  requires_capabilities:
    - ai_ark_api

  priority: medium

  tags:
    - enrichment
    - data-hygiene
    - bulk
    - ai-ark
---

# AI Ark Data Enrichment

## Goal
Batch refresh existing ops table records with current data from AI Ark's enrichment API.

## Required Capabilities
- **AI Ark API**: Bulk enrichment via `ai-ark-enrich` edge function

## Inputs
- `table_id`: The ops table to enrich (required)
- `column_id`: Specific column to target (optional)

## Credit Cost
Each contact enrichment (reverse lookup) consumes credits individually. Bulk enrichment processes contacts 4 at a time with rate limiting. Warn users about total credit cost before batch operations — estimate as number_of_rows x credits_per_lookup.

## Execution
1. Warn the user: "This will enrich N contacts. Each lookup costs credits. Proceed?"
2. Call `ai-ark-enrich` with `action: 'bulk_enrich'` and `table_id`
3. Function reads all rows, identifies records by email/LinkedIn
4. Calls AI Ark reverse lookup API individually (4 concurrent, 250ms between batches)
5. Caches full responses in `source_data.ai_ark` (enrich-once pattern)
6. Updates cells with refreshed data

## Output Contract
Return summary:
- `total_rows`: Number of rows processed
- `enriched`: Number successfully enriched
- `failed`: Number that failed
- `unchanged`: Number already up to date (from cache)

## Data Hygiene Workflow
After enrichment, the copilot can:
1. Highlight rows where `title` or `company` changed (job change detected)
2. Suggest re-qualification for contacts who changed companies
