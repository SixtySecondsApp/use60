---
name: Explorium Enrichment
description: |
  Enrich an Ops table with Explorium data. Supports firmographics, financial metrics,
  funding history, technographics, Bombora intent signals, website traffic, workforce
  trends, contact details, lookalike companies, and custom AI enrichment. Uses cache —
  subsequent enrichments of the same type are free. Credit cost varies by type.
  Use when a user asks "enrich with explorium", "add contact details", "add intent signals",
  "enrich with firmographics", or wants to layer additional data onto an existing Ops table.
  Enrichment types: firmographics, financials, funding, technographics, intent, traffic,
  workforce, contact_details, lookalikes, custom.
metadata:
  author: sixty-ai
  version: "2"
  category: enrichment
  skill_type: atomic
  is_active: true
  agent_affinity:
    - prospecting
    - research

  triggers:
    - pattern: "enrich with explorium"
      intent: "explorium_enrich"
      confidence: 0.90
      examples:
        - "enrich this table with explorium"
        - "run explorium enrichment on my ops table"
        - "add explorium data to this table"
    - pattern: "add explorium enrichment"
      intent: "explorium_enrich"
      confidence: 0.90
      examples:
        - "add explorium enrichment to these companies"
        - "use explorium to enrich this list"
        - "enrich with explorium firmographics"
    - pattern: "get contact details from explorium"
      intent: "explorium_contact_details"
      confidence: 0.85
      examples:
        - "get emails and phone numbers from explorium"
        - "enrich with contact details using explorium"
        - "add verified emails from explorium"
        - "get phone numbers for these contacts via explorium"
    - pattern: "add intent signals"
      intent: "explorium_intent_enrich"
      confidence: 0.70
      examples:
        - "add bombora intent signals to this table"
        - "enrich with intent data"
        - "show me intent scores for these companies"
        - "add buying intent signals to my prospect list"
    - pattern: "enrich with firmographics"
      intent: "explorium_firmographic_enrich"
      confidence: 0.70
      examples:
        - "add firmographic data to these companies"
        - "enrich with company size and revenue"
        - "add employee count and industry data"
    - pattern: "add technographics"
      intent: "explorium_technographic_enrich"
      confidence: 0.65
      examples:
        - "add technology stack data"
        - "enrich with technographics from explorium"
        - "show what tech these companies use"

  keywords:
    - "explorium"
    - "enrich"
    - "enrichment"
    - "firmographics"
    - "technographics"
    - "intent"
    - "contact details"
    - "bombora"
    - "lookalikes"
    - "funding"
    - "traffic"
    - "workforce"

  required_context: []
  optional_context:
    - table_id
    - column_id

  inputs:
    - name: table_id
      type: string
      description: "ID of the Ops table to enrich"
      required: true
    - name: enrich_type
      type: string
      description: |
        Enrichment type — one of:
        'firmographics' (company size, industry, description),
        'financials' (revenue, growth metrics),
        'funding' (funding rounds, investors, total raised),
        'technographics' (technology stack),
        'intent' (Bombora intent topics and scores),
        'traffic' (website traffic and engagement metrics),
        'workforce' (headcount trends, hiring signals),
        'contact_details' (verified email and phone for contacts),
        'lookalikes' (similar companies based on profile),
        'custom' (AI-powered custom enrichment with a prompt)
      required: true
    - name: column_id
      type: string
      description: "Target column ID in the Ops table to write enrichment results into. If omitted, a new column is created."
      required: false
    - name: force_refresh
      type: boolean
      description: "Bypass cache and re-fetch fresh data even if enrichment was previously run. Default false."
      required: false

  outputs:
    - name: enriched_count
      type: number
      description: "Number of rows successfully enriched"
    - name: cached_count
      type: number
      description: "Number of rows served from cache (no credits consumed)"
    - name: failed_count
      type: number
      description: "Number of rows that could not be enriched (missing match data)"
    - name: credits_consumed
      type: number
      description: "Total platform credits consumed by this enrichment run"

  requires_capabilities:
    - explorium_api
    - ops_tables

  priority: medium

  tags:
    - enrichment
    - explorium
    - prospecting
    - firmographic
    - contact-details
---

## Available Context
@_platform-references/org-variables.md

# Explorium Enrichment

## Goal
Layer Explorium data onto an existing Ops table. Enrichment turns a raw list of companies or contacts into an actionable, data-rich prospect database — adding financials, intent signals, contact details, technographics, and more.

## Credit Cost

| Enrichment Type | Platform Credits |
|----------------|-----------------|
| `firmographics` | 2 / row |
| `financials` | 2 / row |
| `funding` | 2 / row |
| `technographics` | 2 / row |
| `intent` (Bombora) | 4 / row |
| `traffic` | 4 / row |
| `workforce` | 4 / row |
| `contact_details` | 10 / row |
| `lookalikes` | 10 / row |

Cache is used automatically — if a row was previously enriched with the same type, no credits are consumed. Use `force_refresh: true` to bypass cache.

Always confirm the estimated cost (row count × credit cost per type) before executing.

## Required Capabilities
- **Explorium API**: Enrichment endpoints via `explorium-enrich` edge function
- **Ops Tables**: Read and write access to the target Ops table

## Inputs
- `table_id`: ID of the Ops table to enrich (required)
- `enrich_type`: One of `firmographics`, `financials`, `funding`, `technographics`, `intent`, `traffic`, `workforce`, `contact_details`, `lookalikes`, `custom`
- `column_id`: Target column to write into (optional — new column created if omitted)
- `force_refresh`: Bypass cache for fresh data (default false)

## Execution
1. Identify the table and enrichment type. If not specified, ask which type to run.
2. Calculate estimated cost: `row_count × credit_cost_per_type`
3. Warn the user: "Enriching X rows with [type] will cost ~Y platform credits. Proceed?"
4. On confirmation, call `explorium-enrich` edge function with provided parameters
5. Report results: enriched count, cached rows, any failures

## Enrichment Types — Details

### firmographics
Adds company size, industry classification, founding year, headquarters, employee count, and company description. Ideal for companies missing CRM data.

### financials
Adds estimated annual revenue, revenue growth rates, and financial health signals.

### funding
Adds total funding raised, latest funding round (Series A/B/C etc.), key investors, and funding date. Best for identifying well-funded targets.

### technographics
Adds the company's technology stack — CRM, marketing automation, data tools, cloud provider, etc. Useful for competitive displacement campaigns.

### intent (Bombora)
Adds active Bombora intent topics and scores for each company — shows what subjects the company is actively researching. High-value signal for timing outreach.

### traffic
Adds website traffic metrics — monthly visits, traffic sources, engagement rates, and growth trends.

### workforce
Adds headcount trends, recent hiring signals, and department-level growth rates. Useful for identifying companies in a growth phase.

### contact_details
Adds verified email addresses and direct phone numbers for each contact row. Highest credit cost — use selectively on best-fit prospects.

### lookalikes
Finds companies similar to each row company based on their Explorium profile. Useful for expanding a target list from confirmed good-fit accounts.

### custom
AI-powered enrichment with a custom prompt. Generates a column based on existing row data and your instructions.

## Output Format

```
ENRICHMENT COMPLETE
  Table: ICP Prospects — Q1
  Type: contact_details
  Rows processed: 25
  Successfully enriched: 23
  Served from cache: 0
  Failed (no match): 2
  Credits consumed: 230
```

## Error Handling
- If `table_id` is missing, ask the user which table to enrich
- If a row fails to match Explorium records, mark as "Not found" and skip — do not block the rest
- If credits would exceed a large threshold (e.g. >500 credits), recommend enriching a filtered subset first
- If enrichment is already running on the table, report current progress rather than starting again

## Chaining
- Typically used after `explorium-company-search` or `explorium-people-search`
- Part of the `seq-explorium-icp-discovery` sequence — step 3 enriches contact details
- For intent-based enrichment, `explorium-intent-signals` is a faster alternative for company search with intent pre-filtered
