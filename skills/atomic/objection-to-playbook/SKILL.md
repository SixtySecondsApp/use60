---
name: Objection to Playbook Mapper
description: |
  Map sales objections to approved playbook responses with proof points and discovery questions.
  Use when a user asks "how do I handle this objection", "they said it's too expensive",
  "respond to a pricing objection", or needs compliance-safe guidance for overcoming objections.
  Returns playbook match, response framework, proof points, and discovery questions.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  triggers:
    - pattern: "how do I handle this objection"
      intent: "objection_handling"
      confidence: 0.90
      examples:
        - "handle this objection"
        - "they raised an objection"
        - "objection response"
    - pattern: "they said it's too expensive"
      intent: "pricing_objection"
      confidence: 0.85
      examples:
        - "pricing objection"
        - "they think it's too costly"
        - "budget pushback"
    - pattern: "overcome this objection"
      intent: "objection_overcome"
      confidence: 0.85
      examples:
        - "help me overcome this objection"
        - "what's the playbook response"
        - "counter this objection"
    - pattern: "competition objection"
      intent: "competitive_objection"
      confidence: 0.80
      examples:
        - "they mentioned a competitor"
        - "how do I respond to competitive comparison"
        - "competitor came up"
  keywords:
    - "objection"
    - "pushback"
    - "expensive"
    - "competitor"
    - "playbook"
    - "handle"
    - "overcome"
    - "response"
    - "pricing"
  required_context:
    - objection
    - deal_id
  inputs:
    - name: objection
      type: string
      description: "The objection text or description to map to a playbook response"
      required: true
    - name: deal_id
      type: string
      description: "Related deal identifier for enriching response with deal context"
      required: false
    - name: objection_category
      type: string
      description: "Pre-classified objection category if known"
      required: false
      example: "pricing"
  outputs:
    - name: playbook_match
      type: object
      description: "Matched playbook section with objection type, section reference, and confidence"
    - name: response
      type: object
      description: "Structured response with opening, main response, closing, and recommended tone"
    - name: proof_points
      type: array
      description: "Relevant proof points with source and relevance explanation"
    - name: discovery_questions
      type: array
      description: "Questions to ask with purpose and follow-up guidance"
    - name: disqualifiers
      type: array
      description: "Disqualification criteria with assessment questions"
    - name: allowed_claims
      type: array
      description: "Compliance-safe claims that can be made"
    - name: banned_phrases
      type: array
      description: "Phrases to avoid from organization context"
  requires_capabilities:
    - crm
    - meetings
  priority: high
  tags:
    - sales-ai
    - objections
    - playbook
    - compliance
    - responses
---

# Objection to Playbook Mapper

## Goal
Map sales objections to approved playbook responses with compliance-safe guidance.

## Required Capabilities
- **CRM**: To fetch deal context and company information
- **Transcript**: To analyze objection context from meeting transcripts

## Inputs
- `objection`: The objection text or identifier
- `deal_id`: Related deal (for context)
- `organization_id`: Current organization context

## Data Gathering (via execute_action)
1. Fetch deal: `execute_action("get_deal", { id: deal_id })`
2. Fetch company: `execute_action("get_company_status", { company_name })`
3. (Optional) Search transcripts: If transcript capability available, search for similar objections

## Output Contract
Return a SkillResult with:
- `data.playbook_match`: Playbook match object:
  - `objection_type`: Categorized objection type
  - `playbook_section`: Which playbook section applies
  - `confidence`: Match confidence (High/Medium/Low)
- `data.response`: Response object:
  - `opening`: How to acknowledge the objection
  - `main_response`: Core response content
  - `closing`: How to transition to next topic
  - `tone`: Recommended tone (empathetic, confident, etc.)
- `data.proof_points`: Array of proof points:
  - `point`: The proof point
  - `source`: Where it comes from (case study, data, etc.)
  - `relevance`: Why it addresses this objection
- `data.discovery_questions`: Array of questions to ask:
  - `question`: The question
  - `purpose`: Why to ask it
  - `follow_up`: What to do with the answer
- `data.disqualifiers`: Array of disqualification criteria:
  - `criteria`: What would disqualify this prospect
  - `question`: Question to assess this
- `data.allowed_claims`: Array of claims that are safe to make
- `data.banned_phrases`: Array of phrases to avoid (from organization context)
- `references`: Links to playbook, case studies, etc.

## Guidelines
- Use organization context (words_to_avoid, key_phrases) for compliance
- Map to standard objection categories (price, timing, competition, etc.)
- Provide multiple response options (short, detailed, empathetic)
- Include discovery questions to understand root cause
- Flag if objection suggests disqualification
- Reference organization-specific proof points when available
