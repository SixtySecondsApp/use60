---
name: Ops HubSpot Enrich and Sync
description: |
  Import contacts from HubSpot into an ops table, enrich them with AI-powered company
  and contact research, then sync the enriched data back to HubSpot.
  Use when a user says "enrich my hubspot contacts", "pull from hubspot enrich and push back",
  "hubspot enrich and sync", "enrich and update hubspot", or wants to enhance their
  existing CRM data with enrichment intelligence and write it back.
  Three-step workflow: HubSpot pull -> enrichment -> HubSpot push.
metadata:
  author: sixty-ai
  version: "1"
  category: agent-sequence
  skill_type: sequence
  is_active: true
  triggers:
    - pattern: "enrich hubspot contacts"
      intent: "hubspot_enrichment"
      confidence: 0.95
      examples:
        - "enrich my hubspot contacts"
        - "enrich contacts from hubspot"
        - "run enrichment on hubspot data"
    - pattern: "hubspot enrich and sync"
      intent: "hubspot_roundtrip"
      confidence: 0.95
      examples:
        - "hubspot enrich and push back"
        - "enrich and sync hubspot"
        - "pull from hubspot, enrich, push back"
    - pattern: "enrich and update hubspot"
      intent: "hubspot_update"
      confidence: 0.90
      examples:
        - "update hubspot with enriched data"
        - "enrich then update hubspot"
        - "fill in missing hubspot fields"
    - pattern: "pull enrich push hubspot"
      intent: "hubspot_roundtrip"
      confidence: 0.85
      examples:
        - "import from hubspot, enrich, and export back"
        - "roundtrip hubspot enrichment"
        - "sync hubspot with enrichment"
  keywords:
    - "hubspot"
    - "enrich"
    - "sync"
    - "contacts"
    - "pull"
    - "push"
    - "update"
    - "CRM"
    - "roundtrip"
  required_context: []
  inputs:
    - name: table_id
      type: string
      description: "Existing ops table to use (optional -- creates new if omitted)"
      required: false
    - name: enrichment_type
      type: string
      description: "Type of enrichment to run (company_research, email_finder, phone_finder)"
      required: false
    - name: field_mapping
      type: object
      description: "Custom field mapping between table columns and HubSpot properties for the push step"
      required: false
    - name: hubspot_filter
      type: object
      description: "Filter criteria for which HubSpot contacts to pull (list ID, tag, etc.)"
      required: false
  outputs:
    - name: table_id
      type: string
      description: "The ops table used for the enrichment roundtrip"
    - name: pull_result
      type: object
      description: "HubSpot pull result with contacts imported count"
    - name: enrichment_status
      type: object
      description: "Enrichment job status and completion stats"
    - name: push_result
      type: object
      description: "HubSpot push result with records updated count"
  requires_capabilities:
    - hubspot_api
    - enrichment
  priority: high
  workflow:
    - order: 1
      action: sync_ops_hubspot
      input_mapping:
        table_id: "${trigger.params.table_id}"
        direction: "pull"
        hubspot_filter: "${trigger.params.hubspot_filter}"
      output_key: pull_result
      on_failure: stop

    - order: 2
      action: enrich_table_column
      input_mapping:
        table_id: "${outputs.pull_result.table_id}"
        enrichment_type: "${trigger.params.enrichment_type}"
      output_key: enrichment_status
      on_failure: stop

    - order: 3
      action: sync_ops_hubspot
      input_mapping:
        table_id: "${outputs.pull_result.table_id}"
        direction: "push"
        field_mapping: "${trigger.params.field_mapping}"
      output_key: push_result
      on_failure: continue
      requires_approval: true

  linked_skills:
    - ops-integration-sync
    - ops-enrichment-manager
  tags:
    - agent-sequence
    - hubspot
    - enrichment
    - sync
    - crm
---

## Available Context
@_platform-references/org-variables.md

# Ops HubSpot Enrich and Sync Sequence

## Overview

A roundtrip enrichment workflow for HubSpot contacts. Pulls contacts from HubSpot into an ops table, runs AI-powered enrichment to fill in missing data (company research, verified emails, phone numbers), then pushes the enriched data back to HubSpot. This is the standard workflow for CRM data hygiene and enrichment.

## Steps

### Step 1: Pull from HubSpot
- Import contacts from HubSpot into an ops table
- If user has a specific HubSpot list or filter, apply it during pull
- If no `table_id` is provided, create a new table named "HubSpot Enrichment - [date]"
- Show the user how many contacts were imported and a sample of the data

### Step 2: Enrich Contacts
- Run enrichment on the imported contacts
- Default enrichment type is `company_research` unless user specifies otherwise
- Enrichment fills in company details, industry, size, tech stack, and other intelligence
- Report progress as enrichment runs ("Enriching 200 contacts... 60% complete")
- If enrichment fails on some rows, report failures but continue

### Step 3: Push Back to HubSpot (Requires Approval)
- Show a summary of enriched data that will be written back to HubSpot
- Ask user to confirm before pushing (this overwrites HubSpot fields)
- Map enriched columns to HubSpot contact properties
- If custom field_mapping is provided, use it; otherwise use default mapping
- Report records updated and any failures

## Flow Control

- Step 1 failure -> **stop** (can't enrich without contacts)
- Step 2 failure -> **stop** (no point pushing un-enriched data back)
- Step 3 failure -> **continue** (enriched table is still valuable locally even if push fails)

## Prerequisites

- HubSpot integration credentials must be configured
- User needs appropriate HubSpot permissions for both read and write operations

## Conversation Example

```
User: "Enrich my HubSpot contacts and push the data back"