---
name: Apify Actor Browse
description: |
  Search the Apify marketplace for actors (pre-built scrapers and automation tools).
  Recommend actors for a given use case such as LinkedIn scraping, Google Maps extraction,
  website crawling, or social media scraping. Use when a user asks "find an Apify actor",
  "what scrapers are available for LinkedIn", "browse Apify marketplace", or needs to
  discover the right actor for a data collection task.
metadata:
  author: sixty-ai
  version: "1"
  category: enrichment
  skill_type: atomic
  is_active: true
  agent_affinity:
    - prospecting

  triggers:
    - pattern: "apify actor browse"
      intent: "apify_actor_browse"
      confidence: 0.95
      examples:
        - "browse Apify actors"
        - "search Apify marketplace"
        - "find Apify scrapers"
    - pattern: "find a scraper for"
      intent: "scraper_discovery"
      confidence: 0.70
      examples:
        - "find a scraper for LinkedIn"
        - "what Apify actors can scrape Google Maps"
        - "is there an Apify actor for Twitter"
    - pattern: "what apify actors are available"
      intent: "actor_listing"
      confidence: 0.75
      examples:
        - "what scrapers do we have on Apify"
        - "list available Apify actors"
        - "show me Apify tools for lead generation"

  keywords:
    - "apify"
    - "actor"
    - "scraper"
    - "marketplace"
    - "browse actors"
    - "web scraping"
    - "data extraction"

  required_context: []

  inputs:
    - name: search_query
      type: string
      description: "Search query for the Apify marketplace (e.g. 'LinkedIn scraper', 'Google Maps')"
      required: true
    - name: category
      type: string
      description: "Actor category filter (e.g. 'social-media', 'e-commerce', 'web-scraping')"
      required: false

  outputs:
    - name: actors
      type: array
      description: "List of matching actors with name, description, pricing, and run stats"
    - name: recommendation
      type: string
      description: "AI recommendation for which actor best fits the use case"

  requires_capabilities:
    - apify_api

  priority: medium

  tags:
    - enrichment
    - apify
    - scraping
    - marketplace
---

# Apify Actor Browse

## Goal
Search the Apify actor marketplace to find scrapers and automation tools matching a user's data collection needs.

## Required Capabilities
- **Apify API**: Actor store search via `apify-admin` edge function

## Inputs
- `search_query`: What the user wants to scrape or automate
- `category`: Optional category filter

## Execution
1. Call `apify-admin` with `action: 'search_actors'` and the search query
2. Present top results with name, description, pricing tier, and recent run count
3. Recommend the best actor for the use case based on popularity and relevance
4. If the user selects an actor, provide its input schema and typical configuration

## Output Contract
Return a list with columns:
- Actor Name, Author, Description, Monthly Runs, Pricing, Actor ID

Followed by a recommendation of which actor to use and why.
