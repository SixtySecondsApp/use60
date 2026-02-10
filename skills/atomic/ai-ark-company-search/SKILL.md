---
name: AI Ark Company Search
description: |
  Search for companies using AI Ark's firmographic database. Filters by industry,
  employee count, location, technology stack, revenue range, and founding year.
  Use when a user asks "find companies", "search for businesses", "AI Ark company search",
  or needs to build a target account list with firmographic criteria.
  Returns a table of companies with industry, size, location, and tech data.
metadata:
  author: sixty-ai
  version: "1"
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
        - "find companies using React"
    - pattern: "build a target account list"
      intent: "account_list"
      confidence: 0.60
      examples:
        - "build me a list of target companies"
        - "create an account list of healthcare startups"

  keywords:
    - "company search"
    - "find companies"
    - "firmographic"
    - "target accounts"
    - "ai ark"
    - "account list"
    - "industry search"

  required_context: []

  inputs:
    - name: industry
      type: string
      description: "Industry filter (e.g. 'SaaS', 'Healthcare', 'Fintech')"
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
      description: "Technology stack keywords (e.g. ['React', 'AWS', 'Salesforce'])"
      required: false
    - name: revenue_range
      type: string
      description: "Revenue range filter (e.g. '$1M-$10M')"
      required: false
    - name: founded_year
      type: string
      description: "Founding year or range (e.g. '2020', '2018-2023')"
      required: false

  outputs:
    - name: companies
      type: array
      description: "List of matching companies with firmographic data"
    - name: pagination
      type: object
      description: "Pagination metadata (page, per_page, total, has_more)"

  requires_capabilities:
    - ai_ark_api

  priority: medium

  tags:
    - enrichment
    - companies
    - firmographic
    - ai-ark
---

# AI Ark Company Search

## Goal
Search AI Ark's company database to find businesses matching firmographic criteria.

## Credit Cost
Each company search request costs **~2.5 credits** regardless of result count. There is no free preview mode. Always warn the user before executing.

## Required Capabilities
- **AI Ark API**: Company search endpoint via `ai-ark-search` edge function

## Inputs
- `industry`: Industry vertical filter
- `employee_count_range`: Company size filter
- `location`: Geographic filter
- `technology_keywords`: Tech stack requirements
- `revenue_range`: Revenue bracket
- `founded_year`: Founding year or range

## Execution
1. Warn the user: "This search will cost ~2.5 AI Ark credits. Proceed?"
2. On confirmation, call `ai-ark-search` with `action: 'company_search'` and provided filters
3. Present results as a table for review

## Output Contract
Return a table with columns:
- Company Name, Domain, Industry, Employee Count, Employee Range, Location, Description, Technologies, LinkedIn, Website
