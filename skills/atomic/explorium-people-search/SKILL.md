---
name: Explorium People Search
description: |
  Search Explorium's database for decision-makers and contacts by job title, seniority,
  department, company size, and location. Creates an Ops table with matched prospects.
  Known CRM contacts are automatically excluded. Costs 2 platform credits per search.
  Use when a user asks "find decision-makers", "find prospects with explorium",
  "find [title] at [company type]", or needs to identify contacts matching role and
  seniority criteria. Often chained after explorium-company-search to find contacts at
  a pre-filtered set of companies using the business_ids output.

  Seniority levels: C-Suite, VP, Director, Manager, Senior, Entry-Level, Owner, Partner.

  Common titles: CEO, CTO, CFO, COO, CMO, VP Sales, VP Marketing, VP Engineering,
  Head of Sales, Head of Product, Head of Engineering, Director of Sales, Director of Marketing,
  Sales Manager, Account Executive, Business Development Manager, Founder, Co-Founder,
  Chief Revenue Officer, Chief Product Officer, Head of Growth, Head of Customer Success,
  Product Manager, Software Engineer, Data Scientist, DevOps Engineer, Marketing Manager.
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
    - pattern: "explorium people search"
      intent: "explorium_people_search"
      confidence: 0.95
      examples:
        - "use explorium to find contacts"
        - "search explorium for people"
        - "explorium contact search"
    - pattern: "find prospects with explorium"
      intent: "explorium_people_search"
      confidence: 0.90
      examples:
        - "find prospects using explorium"
        - "search explorium for decision-makers"
        - "run a people search on explorium"
    - pattern: "find [title] at [company type]"
      intent: "role_search"
      confidence: 0.60
      examples:
        - "find VP Sales at SaaS companies in the US"
        - "get me CTOs at healthcare companies with 100-500 employees"
        - "find Heads of Engineering at the companies we just found"
        - "find founders at FinTech startups in London"
        - "search for Directors of Product at EdTech companies"
    - pattern: "search for decision makers"
      intent: "decision_maker_search"
      confidence: 0.60
      examples:
        - "find decision-makers at these companies"
        - "get me the key contacts at these accounts"
        - "find buying committee members at our target accounts"

  keywords:
    - "explorium"
    - "people search"
    - "prospect search"
    - "contacts"
    - "decision-makers"
    - "seniority"
    - "job title"
    - "find contacts"
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
      description: "Job title filter — e.g. 'VP Sales', 'CTO', 'Head of Marketing', 'Founder', 'Chief Revenue Officer'. Supports partial and related title matching."
      required: false
    - name: include_related_titles
      type: boolean
      description: "Expand search to include related and equivalent titles (e.g. 'VP Sales' also matches 'Head of Sales', 'Director of Sales'). Default true."
      required: false
    - name: seniorities
      type: array
      description: "Seniority filter — Explorium values: 'C-Suite', 'VP', 'Director', 'Manager', 'Senior', 'Entry-Level', 'Owner', 'Partner'"
      required: false
    - name: departments
      type: array
      description: "Department filter — e.g. ['Sales', 'Engineering', 'Marketing', 'Product', 'Finance', 'Operations', 'HR', 'Legal']"
      required: false
    - name: countries
      type: array
      description: "Countries to filter by — e.g. ['United States', 'United Kingdom', 'Germany']"
      required: false
    - name: employee_ranges
      type: array
      description: "Company size brackets for the prospect's employer — e.g. [{ min: 50, max: 500 }]"
      required: false
    - name: has_email
      type: boolean
      description: "Only return prospects with a verified email address on file. Default false."
      required: false
    - name: business_ids
      type: array
      description: "Scope search to specific Explorium business IDs — typically extracted from a prior explorium-company-search result to find contacts at matched companies"
      required: false
    - name: per_page
      type: number
      description: "Results per page (default 25, max 100)"
      required: false

  outputs:
    - name: table_id
      type: string
      description: "ID of the created Ops table containing matched prospects"
    - name: table_name
      type: string
      description: "Display name of the created Ops table"
    - name: row_count
      type: number
      description: "Number of prospect rows returned in this page"
    - name: dedup
      type: object
      description: "Deduplication summary: { total, duplicates, net_new } — known CRM contacts auto-excluded"

  requires_capabilities:
    - explorium_api
    - ops_tables

  priority: medium

  tags:
    - prospecting
    - contacts
    - people
    - explorium
---

## Available Context
@_platform-references/org-variables.md

# Explorium People Search

## Goal
Search Explorium's prospect database to find decision-makers and contacts matching role, seniority, and company criteria. Results are written to a new Ops table, with known CRM contacts automatically excluded.

## Credit Cost
Each people search costs **2 platform credits** regardless of result count.
Always confirm with the user before executing.

## Required Capabilities
- **Explorium API**: People search endpoint via `explorium-search` edge function (`action: 'people_search'`)
- **Ops Tables**: Writes results to a new or existing Ops table

## Inputs
- `job_title`: Role title — e.g. VP Sales, CTO, Head of Marketing, Founder. Partial matching supported.
- `include_related_titles`: Expand to equivalent titles (default true)
- `seniorities`: Seniority enum — C-Suite, VP, Director, Manager, Senior, Entry-Level, Owner, Partner
- `departments`: Department filter — Sales, Engineering, Marketing, Product, Finance, Operations
- `countries`: Geographic filter — e.g. `['United States', 'Germany']`
- `employee_ranges`: Filter by employer size — e.g. `[{ min: 50, max: 500 }]`
- `has_email`: Only return contacts with verified email on file
- `business_ids`: Scope to specific Explorium business IDs (from a prior company search)
- `per_page`: Results per page (default 25, max 100)

## Execution
1. Confirm intent: clarify any ambiguous role or seniority filters
2. Warn the user: "This search will cost 2 platform credits. Proceed?"
3. On confirmation, call `explorium-search` with `action: 'people_search'` and provided filters
4. Present a summary: prospects found, CRM duplicates excluded, Ops table created
5. Offer to chain into `explorium-enrich` to add verified contact details

## Output Contract
Results are written to an Ops table with columns:
- Name, Title, Seniority, Department, Company, Company Size, Country, LinkedIn, Email (if available)

Show `dedup` summary: "Found X prospects — Y already in your CRM, Z net new contacts added to [Table Name]."

## Chaining
- Typically used after `explorium-company-search` — pass `business_ids` from the company results to scope contacts to matched accounts
- Chain into `explorium-enrich` with `enrich_type: contact_details` to obtain verified emails and phone numbers
- Part of the `seq-explorium-icp-discovery` sequence
