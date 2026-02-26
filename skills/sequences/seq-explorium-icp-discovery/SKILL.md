---
name: Explorium ICP Discovery
description: |
  End-to-end ICP prospecting sequence: (1) search for companies matching your ICP,
  (2) find decision-makers at those companies, (3) enrich with contact details.
  Produces a ready-to-outreach Ops table. Use when a user says "run explorium icp
  discovery", "find and enrich prospects with explorium", "build a prospect list with
  explorium", or wants to go from ICP criteria to outreach-ready contacts in one workflow.
  Chains explorium-company-search, explorium-people-search, and explorium-enrich.
  Credit estimate: ~24 platform credits for 25 companies + 25 contacts + contact detail enrichment.
metadata:
  author: sixty-ai
  version: "1"
  category: agent-sequence
  skill_type: sequence
  is_active: true

  triggers:
    - pattern: "run explorium icp discovery"
      intent: "explorium_icp_discovery"
      confidence: 0.90
      examples:
        - "run the explorium ICP discovery sequence"
        - "start explorium ICP discovery"
        - "kick off explorium icp prospecting"
    - pattern: "find and enrich prospects with explorium"
      intent: "explorium_icp_discovery"
      confidence: 0.85
      examples:
        - "find and enrich ICP prospects with explorium"
        - "use explorium to find and enrich leads"
        - "search explorium and enrich the contacts"
    - pattern: "build prospect list with explorium"
      intent: "explorium_prospect_list"
      confidence: 0.80
      examples:
        - "build a full prospect list using explorium"
        - "create an outreach-ready prospect list with explorium"
        - "build my ICP list from explorium end to end"

  keywords:
    - "explorium"
    - "ICP discovery"
    - "prospect list"
    - "icp"
    - "end-to-end prospecting"
    - "find and enrich"
    - "outreach ready"

  required_context: []

  outputs:
    - companies_table
    - contacts_table
    - enriched_contacts_table

  requires_capabilities:
    - explorium_api
    - ops_tables

  workflow:
    - order: 1
      skill_key: explorium-company-search
      input_mapping:
        industries: "${trigger.params.industries}"
        employee_ranges: "${trigger.params.employee_ranges}"
        revenue_ranges: "${trigger.params.revenue_ranges}"
        countries: "${trigger.params.countries}"
        technologies: "${trigger.params.technologies}"
        intent_topics: "${trigger.params.intent_topics}"
        per_page: "${trigger.params.per_page}"
      output_key: company_results
      on_failure: stop

    - order: 2
      skill_key: explorium-people-search
      input_mapping:
        business_ids: "${outputs.company_results.business_ids}"
        job_title: "${trigger.params.job_title}"
        seniorities: "${trigger.params.seniorities}"
        departments: "${trigger.params.departments}"
        countries: "${trigger.params.countries}"
        per_page: "${trigger.params.per_page}"
      output_key: people_results
      on_failure: continue

    - order: 3
      skill_key: explorium-enrich
      input_mapping:
        table_id: "${outputs.people_results.table_id}"
        enrich_type: "contact_details"
      output_key: enrichment_results
      on_failure: continue

  linked_skills:
    - explorium-company-search
    - explorium-people-search
    - explorium-enrich

  priority: high

  tags:
    - agent-sequence
    - prospecting
    - icp
    - explorium
---

## Available Context
@_platform-references/org-variables.md

# Explorium ICP Discovery Sequence

## Overview
End-to-end ICP prospecting from criteria to outreach-ready contacts using Explorium's 80M+ business database and Bombora intent data.

## Credit Estimate
~24 platform credits for a typical run:
- Step 1 (company search): 2 credits
- Step 2 (people search): 2 credits
- Step 3 (contact detail enrichment): 10 credits × N contacts

Always confirm the full estimated cost with the user before starting.

## Steps

### Step 1: Company Search (2 credits)
- Gather ICP filters from the user: industries, employee ranges, revenue, geography, tech stack, intent topics
- Warn user: "Step 1 will cost 2 platform credits to search for matching companies."
- Run `explorium-company-search` with the provided ICP criteria
- Present a summary: "Found X companies matching your ICP — Y net new (Z already in your CRM)"
- Allow the user to refine filters if the result set looks off before proceeding
- Extract `business_ids` from results to scope the people search

### Step 2: People Search (2 credits)
- Gather contact filters from the user: job titles, seniorities, departments
- Warn user: "Step 2 will cost 2 platform credits to find decision-makers at matched companies."
- Run `explorium-people-search` scoped to the `business_ids` from Step 1
- Present a summary: "Found X prospects across Y companies"
- Allow the user to review and adjust before running enrichment

### Step 3: Contact Detail Enrichment (10 credits × rows)
- Confirm count: "Enriching contact details for X prospects will cost ~Y platform credits. Proceed?"
- Run `explorium-enrich` with `enrich_type: contact_details` on the contacts table
- Present final summary: enriched count, any failures, Ops table ready

## Flow Control
- Step 1 failure → stop (cannot proceed without companies)
- Step 2 failure → continue (still have company data; offer to retry people search or stop here)
- Step 3 failure → continue (contacts usable without full contact detail enrichment; offer retry)

## Output Contract
The sequence produces one final Ops table with columns:
- Name, Title, Seniority, Company, Company Size, Industry, Country, Email, Phone, LinkedIn

Ready for export to Instantly, HubSpot, or direct outreach.

## Tips
- For maximum precision, scope `per_page` to 25 at each step and review results before enriching
- Use `intent_topics` in Step 1 to surface only in-market accounts — this dramatically improves conversion rates
- If the contact detail enrichment cost is high, filter the contacts table first (e.g. "only ICP-fit titles") before running Step 3
- The `explorium-intent-signals` skill is a useful entry point if you already know intent topics and want to skip broader company search
