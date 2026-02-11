---
name: AI Ark Semantic Discovery
description: |
  Natural language company discovery and contact enrichment workflow. Describe your
  target companies in plain language, find matching companies via semantic search,
  then find contacts and enrich with verified emails.
  Use when a user says "find companies building AI tools for HR and get me founder emails",
  "search for companies doing X and find contacts", or describes a target market in
  natural language and wants contacts.
metadata:
  author: sixty-ai
  version: "1"
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
    - pattern: "semantic search and enrich"
      intent: "semantic_enrich"
      confidence: 0.85
      examples:
        - "search for edtech startups and get me CTO contacts"
        - "find sustainable energy companies and get founder details"

  keywords:
    - "companies that"
    - "companies building"
    - "natural language"
    - "get contacts"
    - "find and enrich"

  required_context: []

  outputs:
    - companies_table
    - enriched_contacts

  requires_capabilities:
    - ai_ark_api

  priority: medium

  workflow:
    - order: 1
      skill_key: ai-ark-semantic-search
      input_mapping:
        natural_language_query: "${trigger.params.natural_language_query}"
        max_results: "${trigger.params.max_results}"
      output_key: companies
      on_failure: stop

    - order: 2
      skill_key: ai-ark-people-search
      input_mapping:
        company_domain: "${outputs.companies.companies[*].domain}"
        seniority_level: "${trigger.params.seniority_level}"
        job_title: "${trigger.params.job_title}"
      output_key: contacts
      on_failure: continue

    - order: 3
      skill_key: ai-ark-enrichment
      input_mapping:
        table_id: "${outputs.contacts.table_id}"
      output_key: enrichment_result
      on_failure: continue

  linked_skills:
    - ai-ark-semantic-search
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

## Steps

### Step 1: Keyword Company Search (~2.5 credits)
- Warn user about credit cost before executing
- Convert natural language query to keyword filters and search
- Present results for user review
- User validates and refines: "Good but also include edtech companies" (each refinement costs ~2.5 credits)

### Step 2: People Search (~12.5 credits)
- Warn user about credit cost before executing
- Extract company domains from company list
- Search for contacts matching seniority/role criteria
- Note: Email/phone not included — use enrichment step

### Step 3: Enrichment (credits per contact)
- Run reverse lookup on contacts for additional profile data
- Each lookup consumes credits individually

## Flow Control
- Step 1 failure -> stop
- Step 2/3 failure -> continue with partial results
