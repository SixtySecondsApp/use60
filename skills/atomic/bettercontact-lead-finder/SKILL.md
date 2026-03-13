---
name: BetterContact Lead Finder
description: |
  Search for new leads using BetterContact's Lead Finder API.
  Use when a user asks "search bettercontact", "find leads bettercontact", "bettercontact prospecting",
  "search for contacts at company", or needs to find new prospects by company and role filters.
  Creates a new Ops table with the search results.
metadata:
  author: sixty-ai
  version: "1"
  category: prospecting
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - prospecting
  triggers:
    - pattern: "bettercontact lead finder"
      intent: "bettercontact_lead_search"
      confidence: 0.95
      examples:
        - "search bettercontact for leads"
        - "bettercontact lead finder"
        - "find contacts with bettercontact"
    - pattern: "bettercontact search"
      intent: "bettercontact_lead_search"
      confidence: 0.90
      examples:
        - "search bettercontact"
        - "bettercontact prospecting"
        - "find people on bettercontact"
    - pattern: "find leads at company"
      intent: "bettercontact_lead_search"
      confidence: 0.70
      examples:
        - "find decision makers at Acme Corp"
        - "who works at this company"
        - "find contacts at domain.com"
  keywords:
    - "bettercontact"
    - "lead finder"
    - "search"
    - "prospect"
    - "find contacts"
    - "find leads"
  required_context: []
  optional_context: []
  inputs:
    - name: company_name
      type: string
      description: "Company name to search"
      required: false
    - name: company_domain
      type: string
      description: "Company domain to search"
      required: false
    - name: job_title
      type: string
      description: "Job title keywords to filter by"
      required: false
    - name: location
      type: string
      description: "Location filter"
      required: false
    - name: limit
      type: number
      description: "Maximum number of results (default: 100)"
      required: false
  outputs:
    - name: search_result
      type: object
      description: "Search submission result with request_id"
    - name: table_result
      type: object
      description: "Created Ops table with search results"
  requires_capabilities:
    - ops_tables
  execution_mode: sync
  timeout_ms: 60000
  priority: medium
  tags:
    - ops
    - prospecting
    - bettercontact
    - lead-finder
---

# BetterContact Lead Finder

## Goal

Search for new leads using BetterContact's Lead Finder API and import results into an Ops table. This is a prospecting tool — use it when users need to find new contacts at specific companies or matching specific criteria.

## Instructions

### Searching for Leads

1. Gather search criteria: company name/domain, job title, location.
2. At minimum, need company name OR company domain.
3. Submit search via bettercontact-lead-finder edge function.
4. Poll for results (async API). When ready, create an Ops table with the results.
5. Report: "Found N contacts at [Company]. Created Ops table '[Table Name]'."

### Search Filters
- **Company name**: Full or partial company name
- **Company domain**: Company website domain
- **Job title**: Keywords like "VP Sales", "CTO", "Marketing Manager"
- **Location**: City, state, or country

## Output Format

### Search Submitted
```
BETTERCONTACT LEAD SEARCH
  Company: Acme Corp (acme.com)
  Title filter: VP Sales, Director
  Location: United States

  Search submitted. I'll create an Ops table when results are ready.
```

### Results Ready
```
LEAD SEARCH COMPLETE
  Found: 23 contacts at Acme Corp
  Table created: "BetterContact — Acme Corp"

  Columns: First Name, Last Name, Email, Phone, Job Title, LinkedIn
  Ready to enrich or push to campaigns.
```
