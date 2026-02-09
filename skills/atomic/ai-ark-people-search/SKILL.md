---
name: AI Ark People Search
description: |
  Search for contacts and decision-makers using AI Ark's people database.
  Filters by job title, seniority, department, company domain, and location.
  Use when a user asks "find contacts", "search for decision-makers",
  "find VP Sales at these companies", or needs to identify people matching role criteria.
  Often chained after ai-ark-company-search to find contacts at discovered companies.
metadata:
  author: sixty-ai
  version: "1"
  category: enrichment
  skill_type: atomic
  is_active: true

  triggers:
    - pattern: "ai ark people search"
      intent: "ai_ark_people_search"
      confidence: 0.95
      examples:
        - "use ai ark to find contacts"
        - "search ai ark for people"
        - "ai ark contact search"
    - pattern: "find contacts at companies"
      intent: "people_search"
      confidence: 0.65
      examples:
        - "find VP Sales at each of these companies"
        - "get me the CTOs at these startups"
        - "find decision-makers at Acme Corp"
    - pattern: "find people by role"
      intent: "role_search"
      confidence: 0.60
      examples:
        - "find marketing directors in London"
        - "search for founders at Series A companies"

  keywords:
    - "people search"
    - "find contacts"
    - "decision-makers"
    - "contacts at"
    - "ai ark"
    - "role search"
    - "seniority"

  required_context: []

  inputs:
    - name: job_title
      type: string
      description: "Job title filter (e.g. 'VP Sales', 'CTO', 'Marketing Director')"
      required: false
    - name: seniority_level
      type: string
      description: "Seniority filter (e.g. 'VP', 'C-Level', 'Director', 'Manager')"
      required: false
    - name: department
      type: string
      description: "Department filter (e.g. 'Sales', 'Engineering', 'Marketing')"
      required: false
    - name: company_domain
      type: string
      description: "Company domain to search within (e.g. 'acme.com')"
      required: false
    - name: location
      type: string
      description: "Location filter — country, city, or region"
      required: false
    - name: keywords_in_profile
      type: array
      description: "Keywords to match in profile (e.g. ['AI', 'machine learning'])"
      required: false

  outputs:
    - name: contacts
      type: array
      description: "List of matching contacts with role and company data"
    - name: pagination
      type: object
      description: "Pagination metadata (page, per_page, total, has_more)"

  requires_capabilities:
    - ai_ark_api

  priority: medium

  tags:
    - enrichment
    - contacts
    - people
    - ai-ark
---

# AI Ark People Search

## Goal
Search AI Ark's people database to find contacts matching role, seniority, and company criteria.

## Required Capabilities
- **AI Ark API**: People search endpoint via `ai-ark-search` edge function

## Inputs
- `job_title`: Role title filter
- `seniority_level`: Seniority bracket
- `department`: Department filter
- `company_domain`: Target company domain
- `location`: Geographic filter
- `keywords_in_profile`: Profile keyword matches

## Credit Cost
Each people search request costs **~12.5 credits** regardless of result count. There is no free preview mode. Always warn the user before executing.

## Execution
1. Warn the user: "This search will cost ~12.5 AI Ark credits. Proceed?"
2. On confirmation, call `ai-ark-search` with `action: 'people_search'` and provided filters
3. Present results as a table for review

## Chaining
Often used after `ai-ark-company-search` — takes company domains from the company results
and finds contacts at those companies. The copilot should extract domains from the current
table and pass them as `company_domain` filters.

## Output Contract
Return a table with columns:
- Name, Title, Seniority, Company, Company Domain, LinkedIn, Location, Industry
- Note: Email and phone are NOT returned by people search — use reverse lookup to obtain those
