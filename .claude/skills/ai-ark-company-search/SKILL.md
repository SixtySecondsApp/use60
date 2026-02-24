---
name: AI Ark Company Search
description: |
  Search for companies using AI Ark's firmographic database. Filters by industry,
  employee count, location, technology stack, revenue range, and founding year.
  Use when a user asks "find companies", "search for businesses", "AI Ark company search",
  or needs to build a target account list with firmographic criteria.
  Returns a table of companies with industry, size, location, and tech data.
  Each search costs ~2.5 credits. Supports preview mode (5 results, same credit cost).

  Industries: software development, it services and it consulting, financial services,
  hospitals and health care, real estate, manufacturing, retail, advertising services,
  staffing and recruiting, insurance, telecommunications, investment management,
  e-learning providers, technology information and internet, business consulting and services,
  human resources services, information services, environmental services, research services,
  accounting, legal services, architecture and planning, civil engineering, higher education,
  construction, food and beverage manufacturing, medical equipment manufacturing,
  oil and gas, chemical manufacturing, biotechnology, pharmaceuticals, transportation,
  automotive, aerospace, defense, government administration, non-profit organizations,
  media production, entertainment providers, events services.

  Technologies: amazon aws, microsoft office 365, google cloud hosting, salesforce,
  hubspot, zendesk, intercom, stripe, shopify, wordpress, react, python, java, ruby on rails,
  node.js, docker, kubernetes, terraform, github, jira, slack, zoom, notion, airtable,
  snowflake, databricks, tableau, looker, segment, mixpanel, amplitude, twilio, sendgrid,
  marketo, pardot, drift, gong, outreach, salesloft, greenhouse, lever, workday, netsuite,
  sap, oracle, microsoft azure, google workspace, cloudflare, aws lambda, contentful.
metadata:
  author: sixty-ai
  version: "2"
  category: enrichment
  skill_type: atomic
  is_active: true
  agent_affinity:
    - research
    - prospecting

  triggers:
    - pattern: "ai ark company search"
      intent: "ai_ark_company_search"
      confidence: 0.95
      examples:
        - "use ai ark to find companies"
        - "search ai ark for companies"
        - "ai ark company lookup"
    - pattern: "find companies by industry"
      intent: "company_search"
      confidence: 0.65
      examples:
        - "find SaaS companies in the UK"
        - "search for fintech companies with 50-200 employees"
        - "find companies using Salesforce"
        - "find software development companies in Germany"
        - "search for healthcare IT companies with 100-500 employees"
        - "find manufacturing companies using AWS"
        - "find staffing companies in the US"
        - "find fintech companies using Stripe and Snowflake"
        - "find construction companies founded after 2018"
        - "find chemical manufacturing companies in Europe"
    - pattern: "build a target account list"
      intent: "account_list"
      confidence: 0.60
      examples:
        - "build me a list of target companies"
        - "create an account list of healthcare startups"
        - "build a prospect list of mid-market SaaS companies"
        - "find 50 companies in the advertising services space"

  keywords:
    - "company search"
    - "find companies"
    - "firmographic"
    - "target accounts"
    - "ai ark"
    - "account list"
    - "industry search"
    - "tech stack"
    - "employee count"
    - "revenue range"
    - "founded year"

  required_context: []

  inputs:
    - name: industry
      type: string
      description: "Industry filter — use exact AI Ark industry names e.g. 'software development', 'financial services', 'hospitals and health care', 'it services and it consulting', 'manufacturing', 'retail', 'real estate'"
      required: false
    - name: employee_count_range
      type: string
      description: "Employee count range (e.g. '50-200', '1-10', '500+')"
      required: false
    - name: location
      type: string
      description: "Location filter — country, city, or region"
      required: false
    - name: technology_keywords
      type: array
      description: "Technology stack keywords — use exact AI Ark tech names e.g. ['amazon aws', 'salesforce', 'hubspot', 'stripe', 'shopify', 'react', 'python', 'docker', 'kubernetes', 'snowflake']"
      required: false
    - name: revenue_range
      type: string
      description: "Revenue range filter (e.g. '$1M-$10M')"
      required: false
    - name: founded_year
      type: string
      description: "Founding year or range (e.g. '2020', '2018-2023')"
      required: false
    - name: preview_mode
      type: boolean
      description: "Return only 5 results for quick preview before committing to a full search"
      required: false

  outputs:
    - name: companies
      type: array
      description: "List of matching companies with firmographic data"
    - name: pagination
      type: object
      description: "Pagination metadata (page, page_size, total, total_count, has_more)"
    - name: total_count
      type: number
      description: "Total matching companies in AI Ark database"
    - name: estimated_credit_cost
      type: object
      description: "Credit cost breakdown: { search_cost, per_page_cost, description }"

  requires_capabilities:
    - ai_ark_api

  priority: medium

  tags:
    - enrichment
    - companies
    - firmographic
    - ai-ark
---

## Available Context
@_platform-references/org-variables.md

# AI Ark Company Search

## Goal
Search AI Ark's company database to find businesses matching firmographic criteria.

## Credit Cost
Each company search request costs **~2.5 credits** regardless of result count.
Use `preview_mode: true` to fetch 5 results first (same 2.5 credit cost) before running a full search.
Always warn the user before executing a paid search.

## Required Capabilities
- **AI Ark API**: Company search endpoint via `ai-ark-search` edge function (`action: 'company_search'`)

## Inputs
- `industry`: Industry vertical — use exact AI Ark industry names (lowercase). Examples:
  - software development, it services and it consulting, financial services, hospitals and health care
  - real estate, manufacturing, retail, advertising services, staffing and recruiting, insurance
  - telecommunications, investment management, e-learning providers, technology information and internet
  - business consulting and services, human resources services, information services
  - environmental services, research services, accounting, legal services, construction
  - food and beverage manufacturing, medical equipment manufacturing, oil and gas
  - chemical manufacturing, biotechnology, higher education, government administration
- `employee_count_range`: Company size (e.g. '1-10', '11-50', '50-200', '200-500', '500-1000', '1000+')
- `location`: Geographic filter — country, city, or region
- `technology_keywords`: Tech stack requirements — use exact AI Ark technology names. Examples:
  - amazon aws, microsoft office 365, google cloud hosting, salesforce, hubspot, zendesk
  - stripe, shopify, wordpress, react, python, java, docker, kubernetes, terraform
  - github, slack, zoom, notion, airtable, snowflake, databricks, tableau, looker
  - segment, mixpanel, amplitude, twilio, sendgrid, marketo, pardot, drift, gong
  - outreach, salesloft, greenhouse, lever, workday, netsuite, sap, oracle, cloudflare
- `revenue_range`: Revenue bracket (e.g. '$1M-$10M', '$10M-$50M')
- `founded_year`: Founding year or range (e.g. '2020', '2018-2023')
- `preview_mode`: Fetch 5 results first for quick validation

## Execution
1. Confirm intent: clarify any ambiguous industry or tech filters
2. Warn the user: "This search will cost ~2.5 AI Ark credits. Proceed?" (or offer preview first)
3. Optionally run with `preview_mode: true` to show 5 results before committing
4. On confirmation, call `ai-ark-search` with `action: 'company_search'` and provided filters
5. Present results as a table for review

## Output Contract
Return a table with columns:
- Company Name, Domain, Industry, Employee Count, Employee Range, Location, Description, Technologies, LinkedIn, Website

Show `total_count` to give the user a sense of the full dataset size.
