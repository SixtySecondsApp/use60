---
name: AI Ark Semantic Discovery
description: |
  Natural language company discovery and contact enrichment workflow. Describe your
  target companies in plain language — the sequence converts your description to
  structured filters via parse-ai-ark-query, finds matching companies, then finds
  and enriches contacts with role and profile data.
  Use when a user says "find companies building AI tools for HR and get me founder emails",
  "search for companies doing X and find contacts", "find SaaS companies in fintech and
  get me the VPs of Sales", or describes a target market in natural language and wants
  contacts. Total cost: ~15 credits (2.5 company + 12.5 people search).
metadata:
  author: sixty-ai
  version: "2"
  category: agent-sequence
  skill_type: sequence
  is_active: true

  triggers:
    - pattern: "find companies that and get contacts"
      intent: "semantic_discovery"
      confidence: 0.85
      examples:
        - "find companies building AI tools for HR and get me founder emails"
        - "find companies doing remote team management and find their VPs"
        - "find fintech startups and get me the CTOs"
        - "find healthcare IT companies and get me the heads of sales"
        - "find SaaS companies using Salesforce and get decision-makers"
        - "find edtech companies with 50-200 employees and get founders"
    - pattern: "semantic search and enrich"
      intent: "semantic_enrich"
      confidence: 0.85
      examples:
        - "search for edtech startups and get me CTO contacts"
        - "find sustainable energy companies and get founder details"
        - "find manufacturing companies using AWS and get their VP Engineering"
    - pattern: "natural language company discovery"
      intent: "nl_discovery"
      confidence: 0.80
      examples:
        - "I'm looking for companies that do X, find them and get contacts"
        - "find companies matching this description and get me people to reach out to"

  keywords:
    - "companies that"
    - "companies building"
    - "natural language"
    - "get contacts"
    - "find and enrich"
    - "describe target"
    - "market description"
    - "find and get"

  required_context: []

  outputs:
    - companies_table
    - enriched_contacts

  requires_capabilities:
    - ai_ark_api

  priority: high

  workflow:
    - order: 1
      skill_key: parse-ai-ark-query
      description: "Parse natural language query into structured AI Ark filters"
      input_mapping:
        query: "${trigger.params.natural_language_query}"
      output_key: parsed_filters
      on_failure: stop

    - order: 2
      skill_key: ai-ark-company-search
      description: "Company search using parsed filters (~2.5 credits)"
      input_mapping:
        industry: "${outputs.parsed_filters.industry}"
        employee_count_range: "${outputs.parsed_filters.employee_count_range}"
        location: "${outputs.parsed_filters.location}"
        technology_keywords: "${outputs.parsed_filters.technologies}"
        keywords: "${outputs.parsed_filters.keywords}"
        preview_mode: "${trigger.params.preview_mode}"
      output_key: companies
      on_failure: stop

    - order: 3
      skill_key: ai-ark-people-search
      description: "Find contacts at discovered companies (~12.5 credits)"
      input_mapping:
        company_domain: "${outputs.companies.results[*].domain}"
        seniority_level: "${outputs.parsed_filters.seniority_level}"
        job_title: "${outputs.parsed_filters.job_title}"
      output_key: contacts
      on_failure: continue

    - order: 4
      skill_key: ai-ark-enrichment
      description: "Reverse lookup for additional profile data (credits per contact)"
      input_mapping:
        table_id: "${outputs.contacts.table_id}"
      output_key: enrichment_result
      on_failure: continue

  linked_skills:
    - parse-ai-ark-query
    - ai-ark-company-search
    - ai-ark-people-search
    - ai-ark-enrichment

  tags:
    - agent-sequence
    - semantic
    - discovery
    - ai-ark
---

## Available Context
@_platform-references/org-variables.md

# AI Ark Semantic Discovery Sequence

## Overview
Discover target companies via natural language, then find and enrich contacts.
Converts plain-English market descriptions into structured AI Ark filters automatically.

**Total credit cost: ~15 credits** (2.5 company search + 12.5 people search + per-contact enrichment)

## Steps

### Step 1: Parse Natural Language Query (~0 credits)
- Use `parse-ai-ark-query` edge function to convert user's description into structured filters
- Extracts: industry, employee_count_range, location, technologies, keywords, job_title, seniority_level
- Uses exact AI Ark vocabulary (industry names, technology names from reference data)
- If parse fails -> stop with error

### Step 2: Company Search (~2.5 credits)
- Warn user about credit cost before executing
- Use parsed filters to search AI Ark company database
- Optionally run with `preview_mode: true` first (5 results, same cost)
- Present results for user review
- User validates and refines: each refinement costs ~2.5 credits

### Step 3: People Search (~12.5 credits)
- Warn user about credit cost before executing
- Extract company domains from company list
- Search for contacts matching seniority/role criteria
- Note: Email/phone not included — use enrichment step
- Failure -> continue with partial results

### Step 4: Enrichment (credits per contact)
- Run reverse lookup on contacts for additional profile data (LinkedIn, location, company)
- Each lookup consumes credits individually
- Failure -> continue with partial results

## Flow Control
- Step 1 (parse) failure -> stop (can't proceed without filters)
- Step 2 (company search) failure -> stop
- Step 3/4 failure -> continue with partial results

## Natural Language Examples
The parser understands phrases like:
- "B2B SaaS companies with 50-200 employees using Salesforce in the US"
- "healthcare IT companies in Europe founded after 2018"
- "fintech startups with less than 100 people using Stripe and AWS"
- "manufacturing companies in Germany using SAP"
- "e-commerce companies using Shopify with VP of Marketing contacts"
