---
name: BetterContact Enrichment
description: |
  Enrich contacts with verified emails and phone numbers via BetterContact's waterfall aggregator.
  Use when a user asks "enrich with bettercontact", "find emails bettercontact", "bettercontact phone numbers",
  "verify emails", or needs to find contact details using BetterContact's 20+ data providers.
  Returns enrichment job status, progress, and verified email/phone results.
metadata:
  author: sixty-ai
  version: "1"
  category: enrichment
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - prospecting
  triggers:
    - pattern: "enrich with bettercontact"
      intent: "bettercontact_enrich"
      confidence: 0.95
      examples:
        - "enrich with bettercontact"
        - "use bettercontact to find emails"
        - "bettercontact enrichment"
        - "run bettercontact on this table"
    - pattern: "bettercontact email"
      intent: "bettercontact_enrich"
      confidence: 0.90
      examples:
        - "find emails with bettercontact"
        - "bettercontact email lookup"
        - "get verified emails bettercontact"
    - pattern: "bettercontact phone"
      intent: "bettercontact_enrich"
      confidence: 0.90
      examples:
        - "find phone numbers bettercontact"
        - "bettercontact phone lookup"
        - "get mobile numbers"
    - pattern: "waterfall enrichment"
      intent: "bettercontact_enrich"
      confidence: 0.80
      examples:
        - "run waterfall enrichment"
        - "waterfall email finder"
        - "cascade email lookup"
    - pattern: "verify email deliverability"
      intent: "bettercontact_enrich"
      confidence: 0.80
      examples:
        - "check email deliverability"
        - "verify these emails"
        - "which emails are catch-all"
  keywords:
    - "bettercontact"
    - "waterfall"
    - "email"
    - "phone"
    - "enrich"
    - "verify"
    - "deliverability"
    - "catch-all"
  required_context: []
  optional_context:
    - table_id
    - column_id
  inputs:
    - name: table_id
      type: string
      description: "ID of the ops table to enrich"
      required: false
    - name: column_id
      type: string
      description: "ID of the column to enrich"
      required: false
    - name: enrich_email
      type: boolean
      description: "Whether to enrich email addresses (default: true)"
      required: false
    - name: enrich_phone
      type: boolean
      description: "Whether to enrich phone numbers (default: false)"
      required: false
    - name: force_refresh
      type: boolean
      description: "Force re-enrichment even for cached rows"
      required: false
  outputs:
    - name: enrichment_result
      type: object
      description: "Enrichment submission result with request_id, submitted count, cached hits"
    - name: enrichment_status
      type: object
      description: "Current enrichment progress with completion percentage and row counts"
  requires_capabilities:
    - ops_tables
  execution_mode: sync
  timeout_ms: 30000
  priority: high
  tags:
    - ops
    - enrichment
    - bettercontact
    - email
    - phone
---

## Available Context
@_platform-references/org-variables.md

# BetterContact Enrichment

## Goal

Find verified email addresses and phone numbers for contacts using BetterContact's waterfall enrichment. BetterContact aggregates 20+ data providers (Hunter, Dropcontact, Lusha, etc.) to maximize find rates and verify deliverability.

Key differentiator: BetterContact checks catch-all domains and verifies email deliverability, protecting sender reputation before outreach.

## Required Capabilities
- **Ops Tables**: Access to enrichment APIs for ops tables

## Inputs
- `table_id`: ID of the ops table containing contacts to enrich
- `column_id`: ID of the target column for enrichment results
- `enrich_email`: Whether to find email addresses (default: true)
- `enrich_phone`: Whether to find phone numbers (default: false)
- `force_refresh`: Force re-enrichment even for previously enriched rows

## Instructions

### Starting Enrichment

When the user wants to enrich contacts with BetterContact:

1. Identify the table and column. Resolve table and column IDs.
2. Check if BetterContact is connected (API key configured in Settings > Integrations).
3. If not connected, tell the user: "BetterContact isn't connected yet. Go to Settings > Integrations to add your API key."
4. Ask what to enrich: emails, phones, or both.
5. Call the bettercontact-enrich edge function with action=submit.
6. Report submission: "BetterContact enrichment submitted for N contacts. Results will appear as they're processed."

### Checking Status

When the user asks about BetterContact enrichment progress:

1. Call bettercontact-enrich with action=status and the request_id.
2. Present status: processing/terminated, contacts processed vs total, credits consumed.
3. If terminated, report final stats: valid emails, catch-all, undeliverable, not found.

### Email Deliverability Status

BetterContact provides email deliverability classification:
- **deliverable**: Safe to send
- **catch_all**: Domain accepts all emails (higher bounce risk)
- **catch_all_safe**: Catch-all but likely valid
- **catch_all_not_safe**: Catch-all and likely invalid
- **undeliverable**: Email will bounce
- **not_found**: No email found

Always explain what catch-all means when users see it for the first time.

## Output Format

### Enrichment Submitted
```
BETTERCONTACT ENRICHMENT SUBMITTED
  Table: Lead Prospects
  Enriching: Email + Phone
  Contacts submitted: 142
  Cached (skipped): 8

  Results will appear automatically. Ask me "bettercontact status" to check progress.
```

### Enrichment Status
```
BETTERCONTACT ENRICHMENT STATUS
  Request: abc123
  Status: Processing...

  [=========>          ] 67% complete
  95 of 142 contacts processed
  Credits consumed: 87

  Summary so far:
    Valid emails: 72
    Catch-all: 12
    Undeliverable: 5
    Not found: 6
```

## Error Handling

### API key not configured
"BetterContact isn't connected. Add your API key in Settings > Integrations > BetterContact."

### Insufficient credits
"Your BetterContact account has insufficient credits. Check your balance at app.bettercontact.rocks."

### Missing required fields
"BetterContact needs at least first name + last name + (company OR company domain) to enrich. Make sure your table has these columns."
