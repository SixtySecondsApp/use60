---
name: Objection to Playbook Mapper
description: |
  Map objections to approved playbook responses with proof points, discovery questions, and disqualifiers. Enforces compliance constraints.
metadata:
  author: sixty-ai
  version: "1"
  category: sales-ai
  skill_type: atomic
  is_active: true
  triggers:
    - pattern: objection_detected
    - pattern: user_request
  required_context:
    - objection
    - deal_id
  outputs:
    - playbook_match
    - response
    - proof_points
    - discovery_questions
    - disqualifiers
    - allowed_claims
    - banned_phrases
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
