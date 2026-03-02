---
name: Battlecard
description: |
  Competitive positioning battlecard against a named competitor for a specific deal.
  Use when a user says "/battlecard", "competitive analysis against [competitor]",
  "battlecard for [competitor]", or needs head-to-head positioning to win against a rival.
  Combines deal context, competitor web research, and historical meeting intelligence (RAG)
  to produce actionable sales ammunition: competitor overview, strength/weakness comparison,
  objection responses, win themes, evidence confidence levels, and timing guidance.
metadata:
  author: sixty-ai
  version: "3"
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
    - "head to head"
    - "compete"
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
      description: "Competitor profile with market position, pricing, recent developments"
    - name: our_strengths
      type: array
      description: "3+ areas where we win, with proof points and talk tracks"
    - name: their_weaknesses
      type: array
      description: "Competitor weak spots with evidence and landmine questions"
    - name: objection_responses
      type: array
      description: "5-6 objections using ABD framework"
    - name: win_themes
      type: array
      description: "Exactly 3 win themes with structural differentiators"
    - name: evidence_confidence
      type: object
      description: "Confidence rating (high/medium/low) for each claim with source"
    - name: timing_guidance
      type: object
      description: "When to surface each win theme based on deal stage and stakeholder"
    - name: deal_specific_angles
      type: array
      description: "Positioning angles specific to this deal from RAG/meeting context"
    - name: competitor_acknowledgments
      type: array
      description: "1-2 areas where competitor genuinely wins, with mitigation"
  requires_capabilities:
    - web_search
    - crm
    - rag
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

You are executing the /battlecard skill. Your job is to produce a deal-specific competitive battlecard that a sales rep can reference mid-call. Every claim must be honest, evidence-backed, and buyer-centric. Where evidence is thin, say so.

Consult `references/battlecard-frameworks.md` for the ABD framework deep dive, feature comparison matrix, pricing position guide, and win theme construction methodology. Consult `references/competitive-intel-guide.md` for web research methodology, review extraction patterns, and handling incomplete data.

## Goal

Generate an actionable competitive positioning battlecard that arms the rep with honest intelligence to win against a named competitor in the context of a specific deal. The output must be scannable in 30 seconds (for mid-call reference) and detailed enough for deal preparation. Every claim carries an evidence confidence rating so the rep knows what to lean on and what to tread carefully around.

## Required Capabilities
- **Web Search**: Research competitor information (routed to Gemini with Google Search grounding)
- **CRM**: Fetch deal context, contacts, and history for deal-specific tailoring
- **RAG**: Search meeting transcripts for historical competitive mentions and buyer comparison criteria

## The 5-Layer Intelligence Model

### Layer 1: Deal Context (via execute_action)

If a deal_id is provided:
1. `execute_action("get_deal", { id: deal_id })` -- stage, value, close date, health
2. `execute_action("get_deal_contacts", { deal_id })` -- stakeholders and their priorities
3. `execute_action("get_deal_activities", { deal_id, limit: 20 })` -- recent conversations mentioning the competitor

Extract: deal stage, deal value, key stakeholders, stated priorities, competitive mentions in notes.

### Layer 2: Competitor Research (via web search, run in parallel)

Run 6 searches with structured extraction:
1. `"[Competitor]" product features pricing` -- what they sell and cost
2. `"[Competitor]" vs OR "compared to" OR alternative` -- head-to-head comparisons
3. `"[Competitor]" review G2 OR Capterra OR TrustRadius` -- customer sentiment
4. `"[Competitor]" news OR announcement 2025 OR 2026` -- recent developments
5. `"${company_name}" vs "[Competitor]"` -- direct comparison content
6. `"[Competitor]" complaints OR problems OR "switched to"` -- churn signals

For each claim extracted, tag confidence immediately:
- **High**: 3+ independent sources agree, or from official competitor documentation
- **Medium**: 1-2 sources, or from a single credible review site
- **Low**: Inferred from absence of evidence, single anecdote, or outdated source (12+ months)

### Layer 3: Historical Context (via RAG)

Search meeting transcripts for deal-specific competitive intelligence:
1. `"{competitor} mentioned by {contact}"` -- what exactly was said about the competitor
2. `"comparing us to" OR "evaluation criteria"` -- understand buyer's comparison framework
3. `"{competitor} strengths" OR "what they liked about {competitor}"` -- know what you are up against
4. `"pricing comparison" OR "budget for {competitor}"` -- understand price positioning
5. `"why {competitor}" OR "chose {competitor}"` -- understand attraction factors
6. `"concerns about {competitor}" OR "problems with {competitor}"` -- competitor weaknesses from buyer's mouth

Use RAG results to:
- Tailor win themes to what the BUYER specifically cares about
- Address the EXACT competitive concerns raised in meetings
- Reference specific quotes: "In your March 5 call, you mentioned [competitor] was strong on X -- here is how we compare"
- Weight evidence from the buyer's own words higher than web research

### Layer 4: Intelligence Signals

Synthesize signals from Layers 1-3:
- **Deal stage signal**: Early (discovery/demo) = focus on feature comparison and differentiation. Late (negotiation/close) = focus on risk mitigation and switching cost.
- **Stakeholder map**: Who favors the competitor? Who favors us? Who is undecided? Tailor themes per stakeholder.
- **Competitive mention frequency**: If competitor mentions are trending up across recent meetings, flag as urgent threat. If declining, note reduced competitive pressure.
- **Buyer criteria alignment**: Map buyer's stated evaluation criteria to areas where we win vs. where they win.

### Layer 5: Battlecard Synthesis

Combine all layers into the structured output below.

## Battlecard Structure

### 1. Competitor Overview
- Company name, website, description (2-3 sentences)
- Target market and segments
- Pricing model (if public; note "not publicly available" if not) -- tag confidence
- Market position: leader, contender, or niche player
- Recent notable developments (last 6 months) -- tag confidence per item

### 2. Our Strengths (Where We Win) -- minimum 3
For each strength:
- **Area**: The capability or dimension
- **Our advantage**: Specific, factual statement
- **Proof point**: Customer evidence, review data, or measurable difference
- **Talk track**: How the rep should position this verbally
- **Confidence**: High/Medium/Low with source

Reference products, value propositions, and competitive positioning from Organization Context.

### 3. Their Weaknesses (Where They Lose)
For each weakness:
- **Area**: The capability or dimension
- **Evidence**: G2 reviews, customer complaints, product gaps (cite sources)
- **Impact on buyer**: Why this matters for the prospect's use case
- **Landmine question**: A legitimate discovery question the rep can ask that exposes this weakness
- **Confidence**: High/Medium/Low with source

Honesty rule: Only include weaknesses backed by evidence. Never fabricate or exaggerate.

### 4. Objection Responses (5-6, using ABD Framework)
For each objection:
- **Objection**: What the prospect says (verbatim phrasing)
- **Category**: price | feature | market_position | switching_cost | ux | social_proof
- **Response**: Using ABD (see `references/battlecard-frameworks.md` for detailed framework):
  - Acknowledge the concern honestly
  - Bridge to a criterion that matters more
  - Differentiate on that criterion with evidence
- **Proof points**: Supporting data
- **Do not say**: Common mistakes reps make when handling this objection

### 5. Win Themes (Exactly 3)
Each win theme:
- **Theme**: One-sentence narrative
- **Proof point**: Concrete evidence
- **Evidence**: Customer quote or data point
- **When to use**: Deal stage and stakeholder type where this theme lands best

Win themes must target STRUCTURAL weaknesses (architecture, business model, go-to-market) not temporary feature gaps.

### 6. Competitor Acknowledgments (1-2 Areas Where They Win)
For each area where the competitor genuinely wins, provide:
- **Area**: What they do well
- **Why they win**: Honest assessment
- **Mitigation**: How to reframe or work around it
- **Talk track**: Professional language for acknowledging it in a call

### 7. Deal-Specific Angles (from RAG/Meeting Context)
When meeting transcripts contain competitive mentions:
- Reference specific conversations with dates
- Map buyer's stated criteria to your strengths
- Identify which stakeholders are most susceptible to competitor messaging
- Provide counter-positioning for exact concerns raised

## When the Competitor Is Actually Stronger

For areas where the competitor genuinely wins:
1. **Acknowledge it**: "Yes, [Competitor] has strong [capability]"
2. **Reframe the criteria**: "The question is whether [capability] is the most important factor for your use case"
3. **Redirect to your strength**: "Where we consistently outperform is [area], and here is why that matters more for [prospect's stated goals]"
4. **Provide mitigation**: "We address [gap] through [workaround/roadmap/partner integration]"

Never deny a competitor's genuine strength. Buyers lose trust in reps who cannot acknowledge reality.

## Timing Guidance

Surface different themes at different stages:
- **Discovery/Early**: Feature comparison, market positioning, breadth of capability
- **Evaluation/Demo**: Technical differentiation, integration advantages, total cost of ownership
- **Negotiation/Late**: Risk mitigation, switching cost analysis, implementation speed, long-term roadmap
- **Executive meetings**: Strategic alignment, vendor stability, partnership model

Match themes to stakeholders:
- **Technical evaluators**: Architecture, API quality, integration depth
- **Economic buyers**: TCO, ROI, vendor risk
- **End users**: UX, onboarding speed, daily workflow impact
- **Champions**: Internal selling ammunition, competitive talking points they can repeat

## Quality Checklist

Before returning results, verify:
- [ ] At least 1-2 areas where competitor genuinely wins are acknowledged with mitigation
- [ ] Every claim has evidence_confidence rating (high/medium/low) with source
- [ ] Objection handlers use ABD framework, not just "we are better"
- [ ] Win themes target STRUCTURAL weaknesses, not temporary feature gaps
- [ ] If RAG found competitor mentions, deal_specific_angles references them
- [ ] Timing guidance included (which themes for which stakeholders at which stage)
- [ ] Battlecard scannable in 30 seconds for mid-call reference
- [ ] No competitor bashing -- all positioning is professional and factual
- [ ] Competitor_acknowledgments section is honest
- [ ] Landmine questions are legitimate discovery questions, not traps

## Error Handling

### Competitor not recognized
Search broadly. If multiple matches, present options for clarification.

### Limited competitor information
Provide what is available. Note limitations honestly. Mark all claims as Low confidence. Recommend the rep ask the prospect directly what they like about the competitor. See `references/competitive-intel-guide.md` for handling incomplete data.

### No deal context provided
Generate a general-purpose battlecard without deal tailoring. Note: "Provide a deal_id for deal-specific positioning."

### No RAG results
Proceed without historical context. Note: "No previous meeting transcripts mention this competitor. Positioning is based on web research and organization context only."

### Missing organization context
Cannot build comparison without ${company_name} product context. Return competitor profile and weaknesses only with a note explaining the limitation.

### Multi-competitor deal
If the buyer is evaluating 3+ vendors, acknowledge the multi-vendor dynamic. Focus the battlecard on the named competitor but note where other competitors create different positioning challenges.

## Graceful Degradation

| Data Available | Output Quality | Notes |
|---|---|---|
| All 5 layers | Full battlecard with deal-specific angles | Best output |
| No RAG results | Full battlecard, no deal_specific_angles | Note transcript gap |
| No deal context | General battlecard, no timing/stakeholder guidance | Note missing deal |
| No org context | Competitor profile + weaknesses only | Cannot compare without own product data |
| Limited web results | Partial battlecard, most claims Low confidence | Flag data gaps explicitly |

## Output Contract

Return a SkillResult with:
- `data.competitor_overview`: object with name, website, description, target_market, pricing_model, market_position, recent_developments[]
- `data.our_strengths`: array of { area, advantage, proof_point, talk_track, confidence }
- `data.their_weaknesses`: array of { area, evidence, impact_on_buyer, landmine_question, confidence }
- `data.objection_responses`: array of { objection, category, response, proof_points, do_not_say }
- `data.win_themes`: array of exactly 3 { theme, proof_point, evidence, when_to_use }
- `data.evidence_confidence`: object mapping each major claim to { level: high|medium|low, source: string }
- `data.timing_guidance`: object with { by_stage: {}, by_stakeholder: {} }
- `data.deal_specific_angles`: array of { angle, source_meeting_date, stakeholder, positioning }
- `data.competitor_acknowledgments`: array of { area, why_they_win, mitigation, talk_track }
- `references`: array of source URLs used
