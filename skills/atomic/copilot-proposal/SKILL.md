---
name: Copilot Proposal
description: |
  Generate a tailored sales proposal from deal and company context with pricing options.
  Use when a user asks "/proposal", "write a proposal", "generate proposal", "draft a proposal
  for this deal", "create a proposal for [company]", or "put together a proposal".
  Pulls deal data, contact history, company intel, and org templates to produce a complete
  proposal with pricing table and next steps. Requires a deal or company entity in context.
  Do NOT use for SOWs, contracts, or legal documents -- use proposal-generator for those.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  command_centre:
    enabled: true
    label: "/proposal"
    description: "Generate a tailored proposal from deal context"
    icon: "file-text"
  context_profile: sales
  agent_affinity:
    - pipeline
    - outreach
  triggers:
    - pattern: "/proposal"
      intent: "slash_proposal"
      confidence: 0.95
      examples:
        - "/proposal"
        - "/proposal for Acme"
        - "/proposal for this deal"
    - pattern: "write a proposal"
      intent: "create_proposal"
      confidence: 0.90
      examples:
        - "draft a proposal for this deal"
        - "create a proposal for this company"
        - "put together a proposal"
    - pattern: "generate proposal"
      intent: "generate_proposal"
      confidence: 0.90
      examples:
        - "generate a proposal"
        - "make me a proposal"
        - "build a proposal for this client"
  keywords:
    - "proposal"
    - "deal"
    - "pricing"
    - "pitch"
    - "offer"
    - "generate"
  requires_context:
    - deal
    - company
  inputs:
    - name: deal_id
      type: string
      description: "The deal identifier to pull context from"
      required: false
    - name: company_name
      type: string
      description: "Company name if no deal is linked"
      required: false
    - name: tone
      type: string
      description: "Tone: confident_partner, professional_advisor, or enterprise"
      required: false
    - name: template
      type: string
      description: "Template override if the user has a preferred format"
      required: false
  outputs:
    - name: proposal_content
      type: string
      description: "Complete formatted proposal in markdown with all sections"
    - name: pricing_table
      type: object
      description: "Structured pricing table with up to 3 tiers, line items, and totals"
    - name: next_steps
      type: array
      description: "Recommended next steps with owners and deadlines"
  requires_capabilities:
    - crm
  priority: high
  tags:
    - sales
    - proposal
    - deal-closing
    - pipeline
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

## Instructions

You are executing the /proposal skill. Your job is to generate a tailored, persuasive sales proposal based on the deal and company context available in the CRM.

## Data Gathering

Before writing anything, collect all available intelligence:

1. **Fetch deal details**: `execute_action("get_deal", { id: deal_id })` -- stage, amount, contacts, custom fields, notes
2. **Fetch company info**: `execute_action("get_company_status", { company_name })` -- overview, industry, size, relationship health
3. **Fetch contact details**: `execute_action("get_contact", { id: primary_contact_id })` -- name, title, role, previous interactions
4. **Fetch meeting history**: Search for recent meetings and transcripts with this company to extract pain points, requirements, and commitments
5. **Fetch activity timeline**: Recent emails, calls, and notes for tone and context clues

## Proposal Structure

Generate the proposal using this structure:

### 1. Executive Summary (3-5 sentences)
- Lead with the client's problem, not your solution
- Reference specific pain points from meetings and CRM notes
- State the proposed outcome in their language

### 2. The Challenge
- Reflect back what the prospect told you in discovery
- Quantify the cost of inaction where possible
- Use their exact words from transcripts and notes

### 3. Proposed Solution
- Map ${company_name} offerings to their specific needs
- Break into phases if the engagement is complex
- Include timeline estimates

### 4. Why ${company_name}
- 1-2 relevant case studies or proof points from Organization Context
- Differentiators that matter to THIS prospect (not generic)
- Social proof: logos, testimonials, metrics

### 5. Pricing Table
- Present up to 3 tiers (Starter, Growth, Scale) using anchoring -- highest first
- Each tier has clear deliverables and differentiation
- Use pricing from Organization Context if available; otherwise use placeholders
- Include payment terms

### 6. Next Steps
- 2-3 concrete actions with owners and deadlines
- Single clear CTA (schedule review, sign, reply YES)
- Urgency element based on real constraints (team availability, pricing window)

## Pricing Table Format

Structure the `pricing_table` output as:
```json
{
  "tiers": [
    {
      "name": "Scale",
      "price": "$X",
      "includes": ["item1", "item2"],
      "best_for": "scenario description",
      "highlighted": false
    },
    {
      "name": "Growth",
      "price": "$Y",
      "includes": ["item1", "item2"],
      "best_for": "scenario description",
      "highlighted": true
    },
    {
      "name": "Starter",
      "price": "$Z",
      "includes": ["item1", "item2"],
      "best_for": "scenario description",
      "highlighted": false
    }
  ],
  "currency": "USD",
  "payment_terms": "50/50 or milestone-based"
}
```

## Tone Calibration

- **confident_partner**: Direct, first-person, treats client as an equal. For founders and business owners.
- **professional_advisor**: Warm but clear, uses analogies, avoids jargon. For non-technical buyers.
- **enterprise**: Formal, comprehensive, risk-aware. Includes compliance and SLA language. For procurement.

Default to the tone that matches the prospect's communication style from emails and meeting transcripts.

## Quality Checklist

Before returning:
- [ ] Opens with the CLIENT's problem, not ${company_name}'s pitch
- [ ] Uses the prospect's own language from calls and emails
- [ ] Pricing appears AFTER value and proof sections
- [ ] Social proof matches their industry or problem type
- [ ] Every next step has an owner and deadline
- [ ] Single clear CTA at the end
- [ ] No dead language ("synergies", "leverage", "streamline")
- [ ] Under 10 pages equivalent in markdown

## Error Handling

### No deal found
If no deal is linked, ask: "Which company or deal should I generate a proposal for?" Do not fabricate deal details.

### No pricing available
Use `[PRICE]` placeholders and recommend three tiers. Note: "Pricing placeholders included -- fill in your rates before sending."

### Minimal context
If CRM data is sparse, ask the user to provide: the client's main pain points, what was discussed, their timeline, and budget range. These are the minimum inputs for a strong proposal.
