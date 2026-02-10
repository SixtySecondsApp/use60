---
name: AI Ark Similarity Search
description: |
  Find lookalike companies based on a seed company profile using AI Ark's
  AI-powered similarity matching. Provide a company domain or name and get
  back companies with similar firmographic profiles ranked by similarity score.
  Use when a user says "find companies similar to", "lookalike companies",
  "find more like", or wants to expand their target account list from a seed company.
  This is AI Ark's unique differentiator with no Apollo equivalent.
metadata:
  author: sixty-ai
  version: "1"
  category: enrichment
  skill_type: atomic
  is_active: true
  agent_affinity:
    - prospecting

  triggers:
    - pattern: "find companies similar to"
      intent: "similarity_search"
      confidence: 0.90
      examples:
        - "find 100 companies similar to Stripe"
        - "find companies like HubSpot"
        - "show me lookalikes for Notion"
    - pattern: "lookalike companies"
      intent: "lookalike"
      confidence: 0.90
      examples:
        - "build a lookalike list from Figma"
        - "get lookalike companies for our top customer"
    - pattern: "ai ark similarity"
      intent: "ai_ark_similarity"
      confidence: 0.95
      examples:
        - "use ai ark similarity search"
        - "ai ark lookalike search"

  keywords:
    - "similar to"
    - "lookalike"
    - "like"
    - "similarity"
    - "ai ark"
    - "seed company"

  required_context: []

  inputs:
    - name: seed_company_domain
      type: string
      description: "Domain of the seed company (e.g. 'stripe.com')"
      required: false
    - name: seed_company_name
      type: string
      description: "Name of the seed company (used if domain not provided)"
      required: false
    - name: match_count
      type: number
      description: "Number of similar companies to return (default: 50)"
      required: false
    - name: match_precision
      type: string
      description: "Precision level: 'high', 'medium', 'low' (default: 'medium')"
      required: false

  outputs:
    - name: companies
      type: array
      description: "List of lookalike companies with similarity_score and firmographic data"
    - name: seed_profile
      type: object
      description: "The resolved profile of the seed company"

  requires_capabilities:
    - ai_ark_api

  priority: high

  tags:
    - enrichment
    - companies
    - similarity
    - lookalike
    - ai-ark
---

# AI Ark Similarity Search

## Goal
Find companies similar to a seed company using AI Ark's AI-powered similarity matching engine.

## Required Capabilities
- **AI Ark API**: Similarity search endpoint via `ai-ark-similarity` edge function

## Inputs
- `seed_company_domain`: Domain of the target company (preferred)
- `seed_company_name`: Company name (fallback if domain unknown)
- `match_count`: How many lookalikes to find (default: 50)
- `match_precision`: Matching strictness (high/medium/low)

## Credit Cost
Each similarity search request costs **~2.5 credits** (uses the company search endpoint with `lookalikeDomains`). There is no free preview mode. Always warn the user before executing.

## Execution
1. Warn the user: "This search will cost ~2.5 AI Ark credits. Proceed?"
2. On confirmation, call `ai-ark-similarity` with seed company domain/LinkedIn URL (max 5 seeds)
3. Present results as a table for review

## Output Contract
Return a table with columns:
- Company Name, Domain, Industry, Employee Count, Employee Range, Location, Description, Technologies, LinkedIn, Website

## Key Differentiator
Uses AI Ark's `lookalikeDomains` parameter on the company search endpoint to find firms with
similar firmographic profiles. Accepts up to 5 seed domains or LinkedIn URLs.

## Common Patterns
- Seed from best customer -> find 100 lookalikes -> people search for VPs -> outbound
- Seed from closed-won deal -> lookalikes -> pipeline expansion
