---
name: Battlecard
description: |
  Competitive positioning battlecard against a named competitor for a specific deal.
  Use when a user says "/battlecard", "competitive analysis against [competitor]",
  "battlecard for [competitor]", or needs head-to-head positioning to win against a rival.
  Combines deal context with competitor research to produce actionable sales ammunition:
  competitor overview, strength/weakness comparison, objection responses, and win themes.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - research
    - pipeline
  triggers:
    - pattern: "/battlecard"
      intent: "battlecard_slash_command"
      confidence: 0.95
      examples:
        - "/battlecard Competitor X"
        - "/battlecard against Gong"
    - pattern: "competitive analysis"
      intent: "competitive_analysis"
      confidence: 0.85
      examples:
        - "competitive analysis against HubSpot"
        - "run a competitive analysis on Salesforce"
        - "compare us to Outreach"
    - pattern: "battlecard"
      intent: "battlecard_generation"
      confidence: 0.90
      examples:
        - "build a battlecard for Gong"
        - "create a battlecard against Salesloft"
        - "I need a battlecard for this deal"
  keywords:
    - "battlecard"
    - "competitive"
    - "competitor"
    - "positioning"
    - "versus"
    - "vs"
    - "differentiation"
    - "win against"
  requires_context:
    - deal
  inputs:
    - name: competitor_name
      type: string
      description: "Name of the competitor to build the battlecard against"
      required: true
    - name: deal_id
      type: string
      description: "Deal ID for tailoring competitive positioning to the specific opportunity"
      required: false
    - name: competitor_website
      type: string
      description: "Competitor website URL if known, speeds up research"
      required: false
  outputs:
    - name: competitor_overview
      type: object
      description: "Competitor profile with name, market position, target segments, pricing model, and recent developments"
    - name: our_strengths
      type: array
      description: "Areas where ${company_name} clearly wins, each with a proof point and customer evidence"
    - name: their_weaknesses
      type: array
      description: "Competitor weak spots with evidence from reviews, customer feedback, or product gaps"
    - name: objection_responses
      type: array
      description: "Common objections using the Acknowledge-Bridge-Differentiate framework with do-not-say guidance"
    - name: win_themes
      type: array
      description: "Exactly 3 win themes targeting structural competitor weaknesses, each with theme statement, proof point, and evidence"
  requires_capabilities:
    - web_search
    - crm
  priority: high
  tags:
    - sales-ai
    - competitive
    - battlecard
    - positioning
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Battlecard

## Instructions

You are executing the /battlecard skill. Your job is to produce a deal-specific competitive battlecard that a sales rep can reference mid-call. Every claim must be honest, evidence-backed, and buyer-centric.

## Goal

Generate an actionable competitive positioning battlecard that arms the rep with honest intelligence to win against a named competitor in the context of a specific deal. The output must be scannable in 30 seconds (for mid-call reference) and detailed enough for deal preparation.

## Required Capabilities
- **Web Search**: Research competitor information (routed to Gemini with Google Search grounding)
- **CRM**: Fetch deal context, contacts, and history for deal-specific tailoring

## Data Gathering

### Phase 1: Deal Context (via execute_action)
If a deal_id is provided:
1. `execute_action("get_deal", { id: deal_id })` -- stage, value, close date, health
2. `execute_action("get_deal_contacts", { deal_id })` -- stakeholders and their priorities
3. `execute_action("get_deal_activities", { deal_id, limit: 20 })` -- recent conversations mentioning the competitor

### Phase 2: Competitor Research (via web search, run in parallel)
1. `"[Competitor]" product features pricing` -- what they sell and cost
2. `"[Competitor]" vs OR "compared to" OR alternative` -- head-to-head comparisons
3. `"[Competitor]" review G2 OR Capterra OR TrustRadius` -- customer sentiment
4. `"[Competitor]" news OR announcement 2025 OR 2026` -- recent developments
5. `"${company_name}" vs "[Competitor]"` -- direct comparison content
6. `"[Competitor]" complaints OR problems OR "switched to"` -- churn signals

### Phase 3: Synthesis
Combine deal context with competitor research to produce tailored positioning.

## Battlecard Structure

### 1. Competitor Overview
- Company name, website, description (2-3 sentences)
- Target market and segments
- Pricing model (if public; note "not publicly available" if not)
- Market position: leader, contender, or niche player
- Recent notable developments (last 6 months)

### 2. Our Strengths (Where We Win)
For each strength:
- **Area**: The capability or dimension
- **Our advantage**: Specific, factual statement
- **Proof point**: Customer evidence, review data, or measurable difference
- **Talk track**: How the rep should position this verbally

Include at minimum 3 strengths. Reference the products, value propositions, and competitive positioning from Organization Context.

### 3. Their Weaknesses (Where They Lose)
For each weakness:
- **Area**: The capability or dimension
- **Evidence**: G2 reviews, customer complaints, product gaps (cite sources)
- **Impact on buyer**: Why this matters for the prospect's use case
- **Landmine question**: A legitimate question the rep can ask that exposes this weakness

Honesty rule: Only include weaknesses backed by evidence. Never fabricate or exaggerate.

### 4. Objection Responses (Acknowledge-Bridge-Differentiate)
For the top 5-6 objections the competitor creates, provide:
- **Objection**: What the prospect says (verbatim phrasing)
- **Category**: price | feature | market_position | switching_cost | ux | social_proof
- **Response**: Using the ABD framework:
  - Acknowledge the concern honestly
  - Bridge to a criterion that matters more
  - Differentiate on that criterion with evidence
- **Proof points**: Supporting data
- **Do not say**: Common mistakes reps make when handling this objection

### 5. Win Themes (Exactly 3)
Each win theme includes:
- **Theme**: One-sentence narrative
- **Proof point**: Concrete evidence
- **Evidence**: Customer quote or data point

Win themes must target STRUCTURAL weaknesses (architecture, business model) not temporary feature gaps.

## Deal-Specific Tailoring

When deal context is available:
- Match prospect priorities (from stakeholder conversations) to your strengths -- lead with what they care about
- Anticipate the competitor's pitch based on the prospect's profile
- Reference specific conversations: "In your Feb 12 call, Sarah mentioned API complexity -- here is how to address that"
- Identify which stakeholders are most susceptible to competitor messaging

## Quality Checklist

Before returning results, verify:
- [ ] At least 1-2 areas where the competitor genuinely wins are acknowledged
- [ ] No unsubstantiated claims (every rating has cited evidence)
- [ ] Objection handlers use ABD framework (not just "we are better")
- [ ] Win themes target structural weaknesses, not temporary gaps
- [ ] Win themes are exactly 3
- [ ] Battlecard is scannable -- a rep can reference it mid-call
- [ ] No competitor bashing -- all positioning is professional and factual
- [ ] Deal-specific tailoring applied if deal context is provided

## Error Handling

### Competitor not recognized
Search broadly. If multiple matches, present options for clarification.

### Limited competitor information
Provide what is available. Note limitations. Recommend the rep ask the prospect directly what they like about the competitor to build counter-positioning.

### No deal context provided
Generate a general-purpose battlecard without deal tailoring. Note: "Provide a deal_id for deal-specific positioning."

### Missing organization context
Cannot build comparison without ${company_name} product context. Return competitor profile and weaknesses only with a note explaining the limitation.

## Output Contract

Return a SkillResult with:
- `data.competitor_overview`: object with name, website, description, target_market, pricing_model, market_position, recent_developments[]
- `data.our_strengths`: array of { area, advantage, proof_point, talk_track }
- `data.their_weaknesses`: array of { area, evidence, impact_on_buyer, landmine_question }
- `data.objection_responses`: array of { objection, category, response, proof_points, do_not_say }
- `data.win_themes`: array of exactly 3 { theme, proof_point, evidence }
- `references`: array of source URLs used
