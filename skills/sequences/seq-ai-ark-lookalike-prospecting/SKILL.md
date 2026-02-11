---
name: AI Ark Lookalike Prospecting
description: |
  End-to-end lookalike prospecting workflow: find companies similar to a seed company,
  then find decision-maker contacts at those companies, and optionally verify emails.
  Use when a user says "find companies like X and get me their VP Sales",
  "lookalike prospecting from our best customer", or wants to expand their pipeline
  from a seed company. Chains similarity search, people search, and email verification.
metadata:
  author: sixty-ai
  version: "1"
  category: agent-sequence
  skill_type: sequence
  is_active: true

  triggers:
    - pattern: "find companies like and get contacts"
      intent: "lookalike_prospecting"
      confidence: 0.90
      examples:
        - "find companies similar to Stripe and get me their VP Sales"
        - "lookalike prospecting from Notion"
        - "find 100 companies like HubSpot and get founder contacts"
    - pattern: "lookalike prospecting"
      intent: "lookalike_pipeline"
      confidence: 0.90
      examples:
        - "run lookalike prospecting from our top customer"
        - "build a lookalike pipeline from Figma"

  keywords:
    - "lookalike"
    - "similar companies"
    - "prospecting"
    - "find contacts"
    - "pipeline expansion"

  required_context: []

  outputs:
    - companies_table
    - contacts_table

  requires_capabilities:
    - ai_ark_api

  priority: high

  workflow:
    - order: 1
      skill_key: ai-ark-similarity-search
      input_mapping:
        seed_company_domain: "${trigger.params.seed_company_domain}"
        seed_company_name: "${trigger.params.seed_company_name}"
        match_count: "${trigger.params.match_count}"
      output_key: similar_companies
      on_failure: stop

    - order: 2
      skill_key: ai-ark-people-search
      input_mapping:
        company_domain: "${outputs.similar_companies.companies[*].domain}"
        job_title: "${trigger.params.job_title}"
        seniority_level: "${trigger.params.seniority_level}"
      output_key: contacts
      on_failure: continue

    - order: 3
      skill_key: ai-ark-reverse-lookup
      input_mapping:
        table_id: "${outputs.contacts.table_id}"
      output_key: enriched_contacts
      on_failure: continue

  linked_skills:
    - ai-ark-similarity-search
    - ai-ark-people-search
    - ai-ark-reverse-lookup

  tags:
    - agent-sequence
    - prospecting
    - lookalike
    - ai-ark
---

## Available Context
@_platform-references/org-variables.md

# AI Ark Lookalike Prospecting Sequence

## Overview
End-to-end pipeline expansion from a seed company through AI Ark's unique similarity search.

## Steps

### Step 1: Similarity Search (~2.5 credits)
- Warn user about credit cost before executing
- Find companies similar to the seed company using `lookalikeDomains`
- Present results for user review
- User refines if needed ("too many agencies, filter to product companies")

### Step 2: People Search (~12.5 credits)
- Warn user about credit cost before executing
- Extract company domains from the company list
- Search for contacts matching role criteria (VP Sales, CTO, etc.)
- Present contacts for review
- Note: Email/phone not included — use enrichment step

### Step 3: Enrichment (Optional, credits per contact)
- Run reverse lookup on contacts for additional profile data
- Each lookup consumes credits individually
- Flag contacts ready for outbound

## Flow Control
- Step 1 failure -> stop (can't proceed without companies)
- Step 2 failure -> continue (still have company data)
- Step 3 failure -> continue (contacts usable without full enrichment)
