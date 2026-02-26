---
name: Explorium Company Search
description: |
  Search Explorium's database of 80M+ businesses by industry, company size, revenue,
  tech stack, intent signals (Bombora), and geography. Creates an Ops table with matched
  companies. CRM accounts are automatically excluded. Costs 2 platform credits per search.
  Use when a user asks "find companies in [industry]", "search explorium for companies",
  "find businesses using [technology]", or wants to build a target account list with
  firmographic or technographic criteria. Supports filtering by Bombora intent topics to
  surface in-market accounts. Returns a paginated Ops table ready for enrichment or export.

  Industries: SaaS, FinTech, HealthTech, EdTech, E-commerce, Manufacturing, Financial Services,
  Healthcare, Real Estate, Insurance, Telecommunications, Retail, Logistics, Legal Services,
  Marketing & Advertising, HR & Recruiting, Cybersecurity, CleanTech, PropTech, Construction,
  Media & Entertainment, Professional Services.

  Technologies: Salesforce, HubSpot, Marketo, Outreach, Gong, Salesloft, ZoomInfo, Snowflake,
  Databricks, AWS, Azure, GCP, Stripe, Shopify, Zendesk, Intercom, Slack, Zoom, Notion,
  Workday, SAP, Oracle, NetSuite, Segment, Mixpanel, Amplitude, Tableau, Looker.
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
    - pattern: "explorium company search"
      intent: "explorium_company_search"
      confidence: 0.95
      examples:
        - "use explorium to find companies"
        - "search explorium for companies"
        - "explorium company lookup"
    - pattern: "search explorium for companies"
      intent: "explorium_company_search"
      confidence: 0.90
      examples:
        - "search explorium for SaaS companies in the US"
        - "find companies in explorium matching my ICP"
        - "run an explorium company search"
    - pattern: "find companies with intent signals"
      intent: "intent_company_search"
      confidence: 0.70
      examples:
        - "find companies with active intent signals"
        - "find in-market accounts using bombora"
        - "search for companies showing intent for CRM software"
    - pattern: "find businesses using [technology]"
      intent: "technographic_search"
      confidence: 0.65
      examples:
        - "find companies using Salesforce and HubSpot"
        - "find businesses running on AWS with 100-500 employees"
        - "search for companies using Snowflake in the US"
    - pattern: "search for companies by [industry]"
      intent: "industry_company_search"
      confidence: 0.65
      examples:
        - "find FinTech companies with 50-200 employees in the UK"
        - "search for SaaS companies in EMEA"
        - "find manufacturing companies with revenue over $10M"

  keywords:
    - "explorium"
    - "company search"
    - "business search"
    - "intent data"
    - "bombora"
    - "firmographics"
    - "technographics"
    - "target accounts"
    - "account list"
    - "industry search"
    - "tech stack"
    - "employee count"
    - "revenue range"

  required_context: []

  inputs:
    - name: industries
      type: array
      description: "Industry verticals to include — e.g. ['SaaS', 'FinTech', 'Healthcare', 'Manufacturing']"
      required: false
    - name: employee_ranges
      type: array
      description: "Company size brackets — e.g. [{ min: 50, max: 200 }, { min: 500, max: 1000 }]"
      required: false
    - name: revenue_ranges
      type: array
      description: "Annual revenue brackets in USD — e.g. [{ min: 1000000, max: 10000000 }]"
      required: false
    - name: countries
      type: array
      description: "Countries to filter by — e.g. ['United States', 'United Kingdom', 'Germany']"
      required: false
    - name: technologies
      type: array
      description: "Technology stack requirements — e.g. ['Salesforce', 'HubSpot', 'AWS', 'Snowflake']"
      required: false
    - name: intent_topics
      type: array
      description: "Bombora intent topics to filter by — e.g. ['CRM Software', 'Sales Automation', 'Cloud Migration']"
      required: false
    - name: is_public
      type: boolean
      description: "Filter to publicly traded companies only (true) or private only (false). Omit for both."
      required: false
    - name: domains
      type: array
      description: "Specific company domains to look up — e.g. ['stripe.com', 'notion.so']"
      required: false
    - name: per_page
      type: number
      description: "Results per page (default 25, max 100)"
      required: false

  outputs:
    - name: table_id
      type: string
      description: "ID of the created Ops table containing matched companies"
    - name: table_name
      type: string
      description: "Display name of the created Ops table"
    - name: row_count
      type: number
      description: "Number of company rows returned in this page"
    - name: dedup
      type: object
      description: "Deduplication summary: { total, duplicates, net_new } — CRM accounts auto-excluded"

  requires_capabilities:
    - explorium_api
    - ops_tables

  priority: medium

  tags:
    - prospecting
    - companies
    - firmographic
    - explorium
---

## Available Context
@_platform-references/org-variables.md

# Explorium Company Search

## Goal
Search Explorium's database of 80M+ businesses to build a targeted account list matching firmographic, technographic, and intent-based criteria. Results are written to a new Ops table, with known CRM accounts automatically excluded.

## Credit Cost
Each company search costs **2 platform credits** regardless of result count.
Always confirm with the user before executing. There is no free preview mode.

## Required Capabilities
- **Explorium API**: Company search endpoint via `explorium-search` edge function (`action: 'company_search'`)
- **Ops Tables**: Writes results to a new or existing Ops table

## Inputs
- `industries`: Industry verticals — e.g. SaaS, FinTech, HealthTech, Manufacturing, Financial Services
- `employee_ranges`: Company size brackets — e.g. `[{ min: 50, max: 200 }]`
- `revenue_ranges`: Annual revenue brackets in USD — e.g. `[{ min: 1000000, max: 50000000 }]`
- `countries`: Geographic filter — e.g. `['United States', 'United Kingdom']`
- `technologies`: Tech stack filter — Salesforce, HubSpot, AWS, Snowflake, Stripe, etc.
- `intent_topics`: Bombora intent topics — surfaces companies actively researching a subject
- `is_public`: Narrow to public or private companies only
- `domains`: Target specific domains for lookup
- `per_page`: Results per page (default 25, max 100)

## Execution
1. Confirm intent: clarify any ambiguous filters before running
2. Warn the user: "This search will cost 2 platform credits. Proceed?"
3. On confirmation, call `explorium-search` with `action: 'company_search'` and provided filters
4. Present results as a summary: companies found, net new vs CRM duplicates, Ops table created
5. Offer to chain into `explorium-people-search` to find contacts at matched companies

## Output Contract
Results are written to an Ops table with columns:
- Company Name, Domain, Industry, Employee Count, Revenue Range, Country, Technologies, Intent Topics, LinkedIn, Website

Show `dedup` summary: "Found X companies — Y already in your CRM, Z net new accounts added to [Table Name]."

## Chaining
- Chain into `explorium-people-search` passing the `table_id` to find contacts at matched companies
- Chain into `explorium-enrich` to layer on additional firmographic, funding, or intent data
- Use `explorium-intent-signals` as a complement to filter for in-market accounts specifically
