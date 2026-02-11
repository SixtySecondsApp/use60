---
name: Apify Run Trigger
description: |
  Configure and start an Apify actor run from natural language instructions.
  Translates user intent into actor input JSON, starts the run, and monitors progress.
  Use when a user says "run the LinkedIn scraper", "scrape these 50 company websites",
  "start an Apify actor", or wants to kick off a data collection job.
  Supports preview-then-confirm pattern for cost safety.
metadata:
  author: sixty-ai
  version: "1"
  category: enrichment
  skill_type: atomic
  is_active: true
  agent_affinity:
    - prospecting

  triggers:
    - pattern: "run apify actor"
      intent: "apify_run_trigger"
      confidence: 0.95
      examples:
        - "run the Apify LinkedIn scraper"
        - "start an Apify actor"
        - "trigger an Apify run"
    - pattern: "scrape these"
      intent: "scrape_trigger"
      confidence: 0.70
      examples:
        - "scrape these 50 company websites"
        - "scrape LinkedIn profiles for these contacts"
        - "extract data from these URLs"
    - pattern: "start a scraping job"
      intent: "job_trigger"
      confidence: 0.70
      examples:
        - "start a scraping job for Google Maps results"
        - "kick off a web scraping run"
        - "run data extraction on this list"

  keywords:
    - "apify"
    - "run actor"
    - "start scraping"
    - "trigger run"
    - "scrape"
    - "extract data"
    - "web scraping"

  required_context: []

  inputs:
    - name: actor_id
      type: string
      description: "Apify actor ID (e.g. 'apify/web-scraper', 'epctex/google-maps-scraper')"
      required: true
    - name: input_description
      type: string
      description: "Natural language description of what to scrape and how (e.g. 'scrape the first 100 Google Maps results for dentists in Chicago')"
      required: true
    - name: urls
      type: array
      description: "List of URLs or domains to process"
      required: false
    - name: max_results
      type: number
      description: "Maximum number of results to collect"
      required: false
    - name: memory_mb
      type: number
      description: "Memory allocation in MB (default: 1024)"
      required: false

  outputs:
    - name: run_id
      type: string
      description: "Apify run ID for tracking"
    - name: status
      type: string
      description: "Run status (READY, RUNNING, SUCCEEDED, FAILED)"
    - name: estimated_cost
      type: string
      description: "Estimated cost in USD"

  requires_capabilities:
    - apify_api

  priority: high

  tags:
    - enrichment
    - apify
    - scraping
    - automation
---

## Available Context
@_platform-references/org-variables.md

# Apify Run Trigger

## Goal
Translate natural language scraping instructions into Apify actor input configuration, preview the cost, and start the run on user confirmation.

## Required Capabilities
- **Apify API**: Actor run management via `apify-admin` edge function

## Inputs
- `actor_id`: Which actor to run
- `input_description`: Natural language description of the job
- `urls`: Optional list of target URLs
- `max_results`: Optional result cap
- `memory_mb`: Optional memory override

## Execution
1. Translate the user's natural language description into the actor's expected input JSON schema
2. Preview the configuration and estimated cost to the user (simulation mode)
3. On confirmation, call `apify-admin` with `action: 'start_run'`, the actor ID, and constructed input
4. Return the run ID and initial status
5. Inform user they can check status later with "check my Apify run"

## Confirmation Pattern
This skill uses the preview-then-confirm pattern:
- First call with `is_simulation: true` shows the constructed input and cost estimate
- User confirms with "yes", "go ahead", "confirm"
- Second call with `is_simulation: false` triggers the actual run

## Output Contract
Return:
- Run ID, Actor, Status, Memory (MB), Estimated Cost
- Link to monitor the run in the Apify console
