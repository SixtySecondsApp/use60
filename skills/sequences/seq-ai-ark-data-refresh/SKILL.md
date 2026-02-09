---
name: AI Ark Data Refresh
description: |
  Batch refresh existing ops table contacts with current data from AI Ark.
  Updates job titles, company info, emails, and flags contacts who changed companies.
  Use when a user says "refresh all contacts in this op", "run data hygiene",
  "update job titles for this table", or wants to verify data before a campaign.
  After enrichment, highlights changes for re-qualification.
metadata:
  author: sixty-ai
  version: "1"
  category: agent-sequence
  skill_type: sequence
  is_active: true

  triggers:
    - pattern: "refresh contacts in this op"
      intent: "data_refresh"
      confidence: 0.85
      examples:
        - "refresh all contacts in this op with their current job titles"
        - "update the data in this table"
    - pattern: "run data hygiene"
      intent: "data_hygiene"
      confidence: 0.85
      examples:
        - "run data hygiene on this ops table"
        - "clean up this contact list before the campaign"

  keywords:
    - "refresh"
    - "data hygiene"
    - "update contacts"
    - "verify data"
    - "before campaign"

  required_context:
    - table_id

  outputs:
    - enrichment_summary
    - change_report

  requires_capabilities:
    - ai_ark_api

  priority: medium

  workflow:
    - order: 1
      skill_key: ai-ark-enrichment
      input_mapping:
        table_id: "${trigger.params.table_id}"
      output_key: enrichment_result
      on_failure: stop

  linked_skills:
    - ai-ark-enrichment

  tags:
    - agent-sequence
    - data-hygiene
    - refresh
    - ai-ark
---

# AI Ark Data Refresh Sequence

## Overview
Batch refresh existing contacts with current data and highlight changes.

## Steps

### Step 1: Bulk Enrichment (credits per contact)
- Warn user about total credit cost (number of rows x credits per lookup) before executing
- Call AI Ark reverse lookup for each row individually (4 concurrent, rate-limited)
- Match by email > LinkedIn URL
- Cache responses in `source_data.ai_ark`
- Update cells with refreshed data

### Post-Enrichment Analysis
After enrichment, the copilot should:
1. **Highlight job changes**: Flag rows where `title` or `company` changed
2. **Re-qualification suggestion**: Contacts who changed companies may need re-qualification
3. **Summary report**: "42 contacts refreshed, 8 changed companies"

## Use Cases
- Pre-campaign data verification
- Monthly CRM hygiene
- Post-event contact list refresh
- Re-engagement campaign prep
