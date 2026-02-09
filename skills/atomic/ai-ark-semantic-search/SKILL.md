---
name: AI Ark Semantic Search
description: |
  Search for companies using natural language descriptions instead of structured filters.
  AI Ark's semantic search interprets intent and returns companies matching the described
  criteria with relevance scores. Use when a user describes companies in plain language
  like "companies building AI tools for HR", "startups doing remote team management",
  or "fintech companies focused on payments in Europe".
metadata:
  author: sixty-ai
  version: "1"
  category: enrichment
  skill_type: atomic
  is_active: true

  triggers:
    - pattern: "find companies that"
      intent: "semantic_company_search"
      confidence: 0.80
      examples:
        - "find companies that are building tools for remote teams"
        - "find companies that do AI-powered recruitment"
    - pattern: "search for companies doing"
      intent: "semantic_search"
      confidence: 0.80
      examples:
        - "search for companies doing sustainable energy in Europe"
        - "find startups working on developer tools"
    - pattern: "ai ark semantic search"
      intent: "ai_ark_semantic"
      confidence: 0.95
      examples:
        - "use ai ark semantic search"
        - "ai ark natural language company search"

  keywords:
    - "companies that"
    - "companies doing"
    - "companies building"
    - "semantic search"
    - "natural language"
    - "ai ark"

  required_context: []

  inputs:
    - name: natural_language_query
      type: string
      description: "Natural language description of target companies"
      required: true
    - name: max_results
      type: number
      description: "Maximum number of results (default: 50)"
      required: false

  outputs:
    - name: companies
      type: array
      description: "List of matching companies with relevance_score and firmographic data"

  requires_capabilities:
    - ai_ark_api

  priority: medium

  tags:
    - enrichment
    - companies
    - semantic
    - natural-language
    - ai-ark
---

# AI Ark Semantic Search

## Goal
Search for companies using natural language descriptions. AI Ark does not have a native semantic search endpoint — this skill converts natural language into keyword-based filters.

## Credit Cost
Each search request costs **~2.5 credits** (uses the company search endpoint with keyword filters). There is no free preview mode. Always warn the user before executing.

## Required Capabilities
- **AI Ark API**: Keyword-based company search via `ai-ark-semantic` edge function

## Inputs
- `natural_language_query`: Plain English description of target companies (required)
- `max_results`: Cap on results (default: 50)

## Execution
1. Warn the user: "This search will cost ~2.5 AI Ark credits. Proceed?"
2. On confirmation, call `ai-ark-semantic` with the natural language query
3. The edge function extracts keywords and searches using `account.keyword` and `account.productAndServices` filters
4. Present results as a table for review
5. User can refine the query conversationally (each refinement costs another ~2.5 credits)

## Output Contract
Return a table with columns:
- Company Name, Domain, Industry, Employee Count, Employee Range, Location, Description, Technologies

## How It Works
The natural language query is split into keyword phrases (by commas, "and", semicolons) and
searched against company keywords, descriptions, SEO tags, names, and industry fields.
A query like "companies building AI tools for HR in Europe" becomes keyword filters for
"companies building AI tools for HR" and "Europe".

## Refinement Loop
The copilot should help users iterate:
1. Show results: "These are mostly enterprise companies"
2. User refines: "Focus on startups under 200 employees"
3. Re-search with refined query (costs another ~2.5 credits)
4. Additional filters can be passed via `additional_filters` for structured criteria
