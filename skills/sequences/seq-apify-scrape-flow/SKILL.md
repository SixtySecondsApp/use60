---
name: Apify Scrape Flow
description: |
  End-to-end Apify scraping workflow: browse the marketplace to find the right actor,
  configure it from natural language, run the scrape, and present mapped results.
  Use when a user says "scrape LinkedIn for sales leads", "use Apify to get Google Maps data",
  "run a full scraping pipeline", or wants a guided scraping experience from discovery to results.
  Chains actor browsing, run triggering, and results querying.
metadata:
  author: sixty-ai
  version: "1"
  category: agent-sequence
  skill_type: sequence
  is_active: true

  triggers:
    - pattern: "scrape with apify"
      intent: "apify_scrape_flow"
      confidence: 0.90
      examples:
        - "use Apify to scrape LinkedIn profiles"
        - "scrape Google Maps for restaurants in NYC"
        - "run an Apify scraping pipeline"
    - pattern: "full scraping workflow"
      intent: "scrape_pipeline"
      confidence: 0.85
      examples:
        - "I need to scrape some data end to end"
        - "set up a scraping job from scratch"
        - "help me scrape and get the results"
    - pattern: "find and run a scraper"
      intent: "discover_and_scrape"
      confidence: 0.80
      examples:
        - "find a good scraper for Zillow and run it"
        - "what can I scrape on Apify and start a run"
        - "help me pick an Apify actor and scrape data"

  keywords:
    - "apify"
    - "scrape"
    - "scraping pipeline"
    - "web scraping"
    - "data extraction"
    - "full workflow"

  required_context: []

  outputs:
    - results_table
    - run_summary

  requires_capabilities:
    - apify_api

  priority: high

  workflow:
    - order: 1
      skill_key: apify-actor-browse
      input_mapping:
        search_query: "${trigger.params.search_query}"
        category: "${trigger.params.category}"
      output_key: actor_selection
      on_failure: stop

    - order: 2
      skill_key: apify-run-trigger
      input_mapping:
        actor_id: "${outputs.actor_selection.selected_actor_id}"
        input_description: "${trigger.params.input_description}"
        urls: "${trigger.params.urls}"
        max_results: "${trigger.params.max_results}"
      output_key: run_result
      on_failure: stop

    - order: 3
      skill_key: apify-results-query
      input_mapping:
        run_id: "${outputs.run_result.run_id}"
        filter_description: "${trigger.params.filter_description}"
      output_key: final_results
      on_failure: continue

  linked_skills:
    - apify-actor-browse
    - apify-run-trigger
    - apify-results-query

  tags:
    - agent-sequence
    - apify
    - scraping
    - pipeline
---

# Apify Scrape Flow Sequence

## Overview
End-to-end guided scraping workflow that helps users discover the right Apify actor, configure and run it, and query the results -- all from natural language.

## Steps

### Step 1: Actor Discovery
- Search the Apify marketplace based on the user's scraping goal
- Present top actor recommendations with pricing and popularity
- User selects an actor (or copilot recommends the best fit)
- Failure here stops the sequence (can't proceed without an actor)

### Step 2: Configure and Run (~cost varies by actor)
- Translate the user's natural language instructions into actor input JSON
- Preview the configuration and estimated cost
- On user confirmation, start the run
- Monitor until completion (or return run ID for async tracking)
- Failure here stops the sequence (no results without a run)

### Step 3: Query Results
- Once the run completes and results are mapped, query the mapped records
- Apply any user-specified filters
- Present results as a table with GDPR flags if applicable
- Offer follow-up actions: export, push to CRM, push to Instantly
- Failure here continues (run data is still available in Apify console)

## Flow Control
- Step 1 failure -> stop (no actor selected)
- Step 2 failure -> stop (no run to query)
- Step 3 failure -> continue (results exist in Apify, user can retry query)
