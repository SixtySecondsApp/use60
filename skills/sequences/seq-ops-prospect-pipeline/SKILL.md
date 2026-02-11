---
name: Ops Prospect Pipeline
description: |
  End-to-end prospecting pipeline: search for leads via Apollo, create an ops table,
  add enrichment columns, run enrichment to fill in company and contact data, then
  push qualified leads to Instantly for outreach campaigns.
  Use when a user says "build a prospect pipeline", "find and enrich leads then email them",
  "prospect pipeline for [persona]", "find leads and push to instantly", or wants a
  complete flow from lead discovery through campaign launch.
  This is the flagship prospecting sequence -- orchestrates search, table creation,
  enrichment, and campaign push in one workflow.
metadata:
  author: sixty-ai
  version: "1"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: "prospect pipeline"
      intent: "full_prospect_pipeline"
      confidence: 0.95
      examples:
        - "build a prospect pipeline"
        - "run the prospecting pipeline"
        - "prospect pipeline for VP Sales at SaaS companies"
    - pattern: "find and enrich leads"
      intent: "lead_discovery_enrichment"
      confidence: 0.90
      examples:
        - "find leads and enrich them"
        - "search for leads then enrich"
        - "find and enrich prospects for me"
    - pattern: "build prospect list"
      intent: "prospect_list_build"
      confidence: 0.90
      examples:
        - "build a prospect list and email them"
        - "build a list of leads for outreach"
        - "create a prospecting list"
    - pattern: "find leads and push to instantly"
      intent: "leads_to_campaign"
      confidence: 0.90
      examples:
        - "find leads and add to instantly"
        - "prospect and launch campaign"
        - "search leads and start outreach"
    - pattern: "outbound prospecting workflow"
      intent: "outbound_workflow"
      confidence: 0.85
      examples:
        - "set up outbound prospecting"
        - "full outbound workflow"
        - "end to end prospecting"
  keywords:
    - "prospect"
    - "pipeline"
    - "find leads"
    - "enrich"
    - "instantly"
    - "outbound"
    - "campaign"
    - "Apollo"
    - "search"
    - "outreach"
  required_context: []
  inputs:
    - name: search_criteria
      type: object
      description: "Apollo search criteria (job titles, industries, company size, location)"
      required: true
    - name: enrichment_types
      type: array
      description: "Which enrichment columns to add (company_research, email_finder, phone_finder)"
      required: false
    - name: campaign_config
      type: object
      description: "Instantly campaign configuration (optional -- if omitted, adds to existing or creates default)"
      required: false
    - name: table_name
      type: string
      description: "Name for the prospect table (default: auto-generated from search criteria)"
      required: false
  outputs:
    - name: table_id
      type: string
      description: "ID of the created ops table"
    - name: search_results
      type: object
      description: "Apollo search results with lead count"
    - name: enrichment_status
      type: object
      description: "Enrichment job status and progress"
    - name: campaign_id
      type: string
      description: "Instantly campaign ID with leads pushed"
  requires_capabilities:
    - apollo_api
    - enrichment
    - instantly_api
  priority: critical
  workflow:
    - order: 1
      action: search_leads_create_table
      input_mapping:
        search_criteria: "${trigger.params.search_criteria}"
        table_name: "${trigger.params.table_name}"
      output_key: search_results
      on_failure: stop

    - order: 2
      action: add_ops_column
      input_mapping:
        table_id: "${outputs.search_results.table_id}"
        column_name: "Company Research"
        column_type: "enrichment"
        enrichment_type: "company_research"
      output_key: enrichment_column
      on_failure: stop

    - order: 3
      action: enrich_table_column
      input_mapping:
        table_id: "${outputs.search_results.table_id}"
        column_id: "${outputs.enrichment_column.column_id}"
      output_key: enrichment_status
      on_failure: continue

    - order: 4
      action: push_ops_to_instantly
      input_mapping:
        table_id: "${outputs.search_results.table_id}"
        campaign_config: "${trigger.params.campaign_config}"
      output_key: campaign_result
      on_failure: continue
      requires_approval: true

  linked_skills:
    - ops-data-manager
    - ops-enrichment-manager
    - ops-integration-sync
  tags:
    - agent-sequence
    - prospecting
    - pipeline
    - enrichment
    - instantly
    - outbound
---

## Available Context
@_platform-references/org-variables.md

# Ops Prospect Pipeline Sequence

## Overview

The flagship prospecting workflow. Takes a user from "I need leads" to "leads are in my outreach campaign" in a single conversation. Orchestrates four steps: Apollo search with table creation, enrichment column setup, enrichment execution, and Instantly campaign push.

## Steps

### Step 1: Search and Create Table
- Run Apollo search with user-provided criteria (job titles, industries, company size, etc.)
- Automatically create an ops table with the results
- Present search results to user for review -- show lead count and sample rows
- User can refine criteria if results don't look right

### Step 2: Add Enrichment Column
- Add a company research enrichment column to the table
- This column will be populated in the next step
- If the user requested additional enrichment types (email finder, phone finder), add those columns too

### Step 3: Run Enrichment
- Start enrichment on the company research column
- Enrichment runs asynchronously -- may take a few minutes for large tables
- Report progress to user ("Enriching 150 leads... 45% complete")
- If enrichment fails for some rows, continue with the rest

### Step 4: Push to Instantly (Requires Approval)
- Present a summary of qualified leads ready for outreach
- Ask user to confirm before pushing to Instantly
- Can add to existing campaign or create a new one
- Report final count of leads pushed to campaign

## Flow Control

- Step 1 failure -> **stop** (no table means no pipeline)
- Step 2 failure -> **stop** (can't enrich without the column)
- Step 3 failure -> **continue** (partial enrichment is still useful -- push what we have)
- Step 4 failure -> **continue** (table and enrichments are still valuable even if push fails)

## Conversation Example

```
User: "Build me a prospect pipeline for VP of Sales at SaaS companies with 50-200 employees"