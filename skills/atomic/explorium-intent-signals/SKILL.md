---
name: Explorium Intent Signals
description: |
  Find companies showing active buying intent on specific topics using Bombora data via
  Explorium. Filters by intent topic, industry, and company size to surface in-market
  accounts. Costs 2 platform credits per search. Use when a user asks "find companies
  with intent", "bombora intent", "in-market accounts", "companies researching [topic]",
  or "intent signals for [topic]". Results are written to an Ops table ready for
  outreach or further enrichment. CRM accounts are automatically excluded.

  Common Bombora intent topics: CRM Software, Sales Automation, Marketing Automation,
  Cloud Migration, Cybersecurity, Data Analytics, Business Intelligence, ERP Software,
  HR Software, Customer Success, Revenue Operations, Account-Based Marketing, Sales Enablement,
  Digital Transformation, DevOps, Machine Learning, Artificial Intelligence, SaaS Procurement,
  E-commerce Platform, Payroll Software, Recruiting Software, Data Warehouse, API Management.
metadata:
  author: sixty-ai
  version: "2"
  category: prospecting
  skill_type: atomic
  is_active: true
  agent_affinity:
    - prospecting
    - research

  triggers:
    - pattern: "bombora intent"
      intent: "bombora_intent_search"
      confidence: 0.95
      examples:
        - "run a bombora intent search"
        - "use bombora data to find companies"
        - "bombora intent signals for CRM software"
    - pattern: "find companies with intent"
      intent: "intent_company_search"
      confidence: 0.90
      examples:
        - "find companies with active buying intent"
        - "find companies with intent signals for sales automation"
        - "search for companies showing intent"
    - pattern: "in-market accounts"
      intent: "in_market_search"
      confidence: 0.80
      examples:
        - "find in-market accounts researching our category"
        - "show me in-market companies"
        - "find accounts that are in-market for CRM"
    - pattern: "companies researching [topic]"
      intent: "intent_topic_search"
      confidence: 0.75
      examples:
        - "find companies researching cloud migration"
        - "which companies are researching sales automation tools"
        - "find companies actively looking at data analytics platforms"
    - pattern: "intent signals for [topic]"
      intent: "intent_topic_signals"
      confidence: 0.85
      examples:
        - "get intent signals for cybersecurity"
        - "intent signals for machine learning"
        - "find companies with intent signals for RevOps"
        - "show me intent data for HR software buyers"

  keywords:
    - "explorium"
    - "intent"
    - "bombora"
    - "in-market"
    - "buying signals"
    - "intent data"
    - "intent signals"
    - "researching"
    - "in-market accounts"
    - "buying intent"

  required_context: []

  inputs:
    - name: intent_topics
      type: array
      description: "Bombora intent topics to search on — required. e.g. ['CRM Software', 'Sales Automation', 'Cloud Migration']. Use exact Bombora topic names where possible."
      required: true
    - name: industries
      type: array
      description: "Narrow to specific industries — e.g. ['SaaS', 'FinTech', 'Healthcare']. Optional."
      required: false
    - name: employee_ranges
      type: array
      description: "Company size brackets — e.g. [{ min: 50, max: 500 }]. Optional."
      required: false
    - name: countries
      type: array
      description: "Countries to filter by — e.g. ['United States', 'United Kingdom']. Optional."
      required: false
    - name: per_page
      type: number
      description: "Results per page (default 25, max 100)"
      required: false

  outputs:
    - name: table_id
      type: string
      description: "ID of the created Ops table containing companies with matched intent signals"
    - name: table_name
      type: string
      description: "Display name of the created Ops table"
    - name: row_count
      type: number
      description: "Number of company rows returned"

  requires_capabilities:
    - explorium_api
    - ops_tables

  priority: medium

  tags:
    - prospecting
    - intent
    - bombora
    - explorium
    - in-market
---

## Available Context
@_platform-references/org-variables.md

# Explorium Intent Signals

## Goal
Find companies actively researching topics relevant to your product category using Bombora's intent data, surfaced via Explorium. These are in-market accounts — the highest-priority targets for outbound because they are already in a buying motion.

## Credit Cost
Each intent search costs **2 platform credits** regardless of result count.
Always confirm with the user before executing.

## Required Capabilities
- **Explorium API**: Intent search endpoint via `explorium-search` edge function (`action: 'intent_search'`)
- **Ops Tables**: Writes results to a new Ops table

## Inputs
- `intent_topics` (required): Bombora intent topic names — e.g. `['CRM Software', 'Sales Automation']`
  Common topics: CRM Software, Sales Automation, Marketing Automation, Cloud Migration, Cybersecurity,
  Data Analytics, Business Intelligence, ERP Software, HR Software, Customer Success,
  Revenue Operations, Account-Based Marketing, Sales Enablement, Digital Transformation,
  DevOps, Machine Learning, Artificial Intelligence, SaaS Procurement, Data Warehouse
- `industries`: Narrow by industry vertical — e.g. `['SaaS', 'Financial Services']`
- `employee_ranges`: Filter by company size — e.g. `[{ min: 100, max: 1000 }]`
- `countries`: Geographic filter — e.g. `['United States', 'Canada']`
- `per_page`: Results per page (default 25, max 100)

## Execution
1. Confirm intent topics: if the user's topic is ambiguous, suggest the closest Bombora category
2. Warn the user: "This search will cost 2 platform credits. Proceed?"
3. On confirmation, call `explorium-search` with `action: 'intent_search'` and provided filters
4. Present results: companies found, intent topics matched, Ops table created
5. Offer to chain into `explorium-people-search` to find contacts at in-market accounts

## Output Contract
Results are written to an Ops table with columns:
- Company Name, Domain, Industry, Employee Count, Country, Intent Topics, Intent Score, LinkedIn, Website

Highlight the top intent scorers — these are the warmest accounts.

## When to Use vs. explorium-company-search
- Use `explorium-intent-signals` when timing is the primary filter — you want companies in an active buying cycle now
- Use `explorium-company-search` when firmographic fit matters most — target the right-profile companies regardless of timing
- Combine both: run `explorium-company-search` for ICP fit, then `explorium-enrich` with `enrich_type: intent` to layer in Bombora scores

## Chaining
- Chain into `explorium-people-search` with the resulting `table_id` to find contacts at in-market accounts
- Chain into `explorium-enrich` to add firmographic or contact detail data to matched companies
- The `seq-explorium-icp-discovery` sequence handles the full company → contacts → enrich flow
