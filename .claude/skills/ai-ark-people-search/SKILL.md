---
name: AI Ark People Search
description: |
  Search for contacts and decision-makers using AI Ark's people database.
  Filters by job title, seniority, department, company domain, and location.
  Use when a user asks "find contacts", "search for decision-makers",
  "find VP Sales at these companies", "get me CTOs in fintech", or needs to
  identify people matching role and seniority criteria at specific companies.
  Often chained after ai-ark-company-search to find contacts at discovered companies.
  Each search costs ~12.5 credits. Email/phone not returned — use reverse lookup for those.

  Seniority levels: C-Level, VP, Director, Manager, Senior, Entry, Owner, Partner, Training.

  Common titles: CEO, CTO, CFO, COO, CMO, VP Sales, VP Marketing, VP Engineering,
  Head of Sales, Head of Product, Head of Engineering, Director of Sales, Director of Marketing,
  Sales Manager, Account Executive, Business Development Manager, Founder, Co-Founder,
  Chief Revenue Officer, Chief Product Officer, Head of Growth, Head of Customer Success,
  Product Manager, Software Engineer, Data Scientist, DevOps Engineer, Marketing Manager.
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
        - "find all the Heads of Engineering at these domains"
        - "get me founders at companies in the fintech space"
        - "find marketing directors at SaaS companies in London"
        - "search for Chief Revenue Officers at companies using Salesforce"
        - "find C-Level contacts at the companies we found"
    - pattern: "find people by role"
      intent: "role_search"
      confidence: 0.60
      examples:
        - "find marketing directors in London"
        - "search for founders at Series A companies"
        - "find senior software engineers at healthcare companies"
        - "get me VP of Sales at companies with 50-200 employees"
        - "find Directors of Product at edtech companies"

  keywords:
    - "people search"
    - "find contacts"
    - "decision-makers"
    - "contacts at"
    - "ai ark"
    - "role search"
    - "seniority"
    - "VP"
    - "CTO"
    - "CEO"
    - "founder"
    - "director"
    - "head of"

  required_context: []

  inputs:
    - name: job_title
      type: string
      description: "Job title filter — e.g. 'VP Sales', 'CTO', 'Head of Marketing', 'Founder', 'Chief Revenue Officer', 'Director of Product'. AI Ark uses SMART search mode so partial matches work."
      required: false
    - name: seniority_level
      type: string
      description: "Seniority filter — exact AI Ark values: 'C-Level', 'VP', 'Director', 'Manager', 'Senior', 'Entry', 'Owner', 'Partner', 'Training'"
      required: false
    - name: department
      type: string
      description: "Department filter (e.g. 'Sales', 'Engineering', 'Marketing', 'Product', 'Finance', 'Operations')"
      required: false
    - name: company_domain
      type: string
      description: "Company domain to search within (e.g. 'acme.com') — can be an array of domains when chaining from company search"
      required: false
    - name: location
      type: string
      description: "Location filter — country, city, or region"
      required: false
    - name: keywords_in_profile
      type: array
      description: "Keywords to match in profile (e.g. ['AI', 'machine learning', 'go-to-market'])"
      required: false

  outputs:
    - name: contacts
      type: array
      description: "List of matching contacts with role and company data (no email/phone — use reverse lookup)"
    - name: pagination
      type: object
      description: "Pagination metadata (page, page_size, total, total_count, has_more)"
    - name: total_count
      type: number
      description: "Total matching contacts in AI Ark database"
    - name: estimated_credit_cost
      type: object
      description: "Credit cost breakdown: { search_cost, per_page_cost, description }"

  requires_capabilities:
    - ai_ark_api

  priority: medium

  tags:
    - enrichment
    - contacts
    - people
    - ai-ark
---

## Available Context
@_platform-references/org-variables.md

# AI Ark People Search

## Goal
Search AI Ark's people database to find contacts matching role, seniority, and company criteria.

## Credit Cost
Each people search request costs **~12.5 credits** regardless of result count.
Always warn the user before executing. There is no free preview mode.

## Required Capabilities
- **AI Ark API**: People search endpoint via `ai-ark-search` edge function (`action: 'people_search'`)

## Inputs
- `job_title`: Role title filter — AI Ark uses SMART search so "VP Sales" matches "Vice President of Sales", "VP of Sales", etc. Common values:
  - CEO, CTO, CFO, COO, CMO, CRO (Chief Revenue Officer), CPO (Chief Product Officer)
  - VP Sales, VP Marketing, VP Engineering, VP Product, VP Customer Success
  - Head of Sales, Head of Marketing, Head of Product, Head of Engineering, Head of Growth
  - Director of Sales, Director of Marketing, Director of Engineering
  - Sales Manager, Account Executive, Business Development Manager
  - Founder, Co-Founder, Owner
  - Product Manager, Software Engineer, Data Scientist, DevOps Engineer
- `seniority_level`: AI Ark seniority enum — must be one of: C-Level, VP, Director, Manager, Senior, Entry, Owner, Partner, Training
- `department`: Department filter — Sales, Engineering, Marketing, Product, Finance, Operations, HR, Legal
- `company_domain`: Target company domain(s) — usually extracted from a prior company search
- `location`: Geographic filter — country, city, or region
- `keywords_in_profile`: Profile keyword matches

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

**Important**: Email and phone are NOT returned by people search. Use `ai-ark-enrichment`
(reverse lookup) to obtain verified contact details for specific individuals.
