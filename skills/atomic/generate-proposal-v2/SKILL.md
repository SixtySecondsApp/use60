---
name: Generate Proposal V2
description: |
  Generate a professional, structured sales proposal using the V2 pipeline.
  Fires the full 5-stage pipeline: context assembly, AI composition, HTML rendering,
  PDF generation, and delivery. Use when a user wants to write, generate, or create
  a proposal for a deal or company.
  Trigger phrases: "write a proposal", "generate proposal", "create proposal for",
  "proposal for [deal/company]", "draft a proposal", "put together a proposal",
  "make me a proposal", "build a proposal".
  Routes to the V2 pipeline with trigger_type 'copilot'.
  Do NOT use for SOWs, contracts, cold emails, or internal project plans.
metadata:
  author: sixty-ai
  version: "2.0"
  category: sales-ai
  skill_type: atomic
  is_active: true
  output_type: structured
  output_format: ProposalPanel
  command_centre:
    enabled: true
    label: "/proposal"
    description: "Generate a proposal using the V2 pipeline"
    icon: "file-text"
  context_profile: sales
  agent_affinity:
    - pipeline
    - outreach
  triggers:
    - pattern: "write a proposal"
      intent: "create_proposal"
      confidence: 0.92
      examples:
        - "draft a proposal for"
        - "create a proposal"
        - "proposal for this client"
        - "write me a proposal"
    - pattern: "generate proposal"
      intent: "generate_proposal"
      confidence: 0.92
      examples:
        - "generate a proposal"
        - "make me a proposal"
        - "build a proposal for this client"
    - pattern: "create proposal for"
      intent: "create_proposal_for"
      confidence: 0.90
      examples:
        - "create a proposal for this deal"
        - "create proposal for acme"
        - "put together a proposal for"
    - pattern: "proposal for"
      intent: "proposal_for_entity"
      confidence: 0.85
      examples:
        - "proposal for this deal"
        - "proposal for acme corp"
        - "send a proposal to"
    - pattern: "/proposal"
      intent: "slash_proposal"
      confidence: 0.95
      examples:
        - "/proposal"
        - "/proposal for acme"
        - "/proposal for this deal"
  keywords:
    - "proposal"
    - "generate"
    - "draft"
    - "create"
    - "deal"
    - "pitch"
    - "offer"
    - "quote"
    - "bid"
  required_context:
    - deal_id
    - meeting_id
  inputs:
    - name: deal_id
      type: string
      description: "Deal ID to generate proposal for. Required — the V2 pipeline assembles context from the deal."
      required: true
    - name: proposal_id
      type: string
      description: "Existing proposal row ID if resuming or regenerating"
      required: false
    - name: meeting_id
      type: string
      description: "Meeting ID to pull transcript context from"
      required: false
    - name: trigger_type
      type: string
      description: "Always 'copilot' when triggered from the copilot interface"
      required: false
      default: "copilot"
  outputs:
    - name: proposal_id
      type: string
      description: "ID of the created or updated proposal row"
    - name: sections_count
      type: number
      description: "Number of sections composed by the AI"
    - name: status
      type: string
      description: "Pipeline status: assembled | composed | rendered | delivered"
    - name: pdf_url
      type: string
      description: "Signed URL to the generated PDF (available after render stage)"
  pipeline:
    entry_function: "proposal-assemble-context"
    trigger_type: "copilot"
    stages:
      - stage: 1
        function: "proposal-assemble-context"
        description: "Assemble ProposalContextPayload from deal, contact, meeting, offering profile"
      - stage: 2
        function: "proposal-compose-v2"
        description: "AI composition — Claude Sonnet via OpenRouter produces ProposalSection[]"
      - stage: 3
        function: "proposal-render-gotenberg"
        description: "Render HTML template and convert to PDF via Gotenberg"
      - stage: 4
        function: "proposal-deliver"
        description: "Store delivery record and notify via Slack/email"
  priority: high
  linked_skills:
    - proposal-assemble-context
    - proposal-compose-v2
    - proposal-render-gotenberg
    - proposal-deliver
  tags:
    - sales
    - proposal
    - v2-pipeline
    - deal-closing
    - pipeline
    - pricing
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Generate Proposal V2

You are executing the V2 proposal pipeline. Your job is to trigger a full, automated proposal generation run that assembles deal context, composes structured sections with AI, renders a professional PDF, and delivers it — all in one pipeline.

## When to Use This Skill

Use this skill when the user says:
- "write a proposal for [deal/company]"
- "generate proposal"
- "create a proposal for this deal"
- "proposal for [name]"
- "/proposal"

Do NOT use for manual SOW writing, contract drafting, cold email copy, or internal project plans.

## Pipeline Overview

The V2 pipeline runs 4 stages automatically:

```
Stage 1: proposal-assemble-context
  → Loads deal, contact, meeting transcript, offering profile
  → Builds compound style fingerprint from user tone settings
  → Returns ProposalContextPayload

Stage 2: proposal-compose-v2
  → Sends context + template schema to Claude Sonnet via OpenRouter
  → Style fingerprint injected into system prompt
  → Returns ProposalSection[] stored on proposals.sections

Stage 3: proposal-render-gotenberg
  → Renders HTML using org template + brand config
  → Converts to PDF via Gotenberg
  → Stores PDF to Supabase Storage

Stage 4: proposal-deliver
  → Stores delivery record
  → Sends Slack notification with PDF link
```

## How to Trigger

Call `proposal-assemble-context` with `trigger_type: 'copilot'`:

```json
{
  "deal_id": "<deal_id>",
  "trigger_type": "copilot",
  "proposal_id": "<optional — omit to create new>"
}
```

The pipeline will chain automatically through all stages.

## Context Requirements

The pipeline works best when the deal has:
- A linked primary contact
- At least one meeting with a transcript or AI summary
- An org offering profile (created via the Offering uploader)

If context is sparse, the AI composes a professional template-based proposal with placeholders.

## Error Handling

### No deal found
Ask: "Which deal should I generate a proposal for?" Do not fabricate deal IDs.

### Pipeline fails at Stage 2 (composition)
Surface the error to the user. Common causes: insufficient AI credits (check balance), OpenRouter rate limit, or empty context payload.

### No offering profile
The pipeline proceeds without offering data. Pricing and solution sections will use generic language. Recommend the user uploads offering collateral in Settings > Offering Profile.

### Proposal already in progress
Check `proposals.generation_status`. If `processing`, inform the user and do not trigger a duplicate run.
