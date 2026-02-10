---
name: Competitor Intel
description: |
  Competitive intelligence and battlecard generation for a specific competitor.
  Use when a user asks "how do we compare to [competitor]", "competitive analysis",
  "what is [competitor] doing", "battlecard for [competitor]", or needs talking points
  against a rival. Returns structured battlecard with comparison, objection handlers,
  and competitive positioning.
metadata:
  author: sixty-ai
  version: "2"
  category: sales-ai
  skill_type: atomic
  is_active: true
  agent_affinity:
    - research
  triggers:
    - pattern: "how do we compare to"
      intent: "competitive_comparison"
      confidence: 0.90
      examples:
        - "how do we stack up against"
        - "compare us to"
        - "what makes us different from"
    - pattern: "competitive analysis"
      intent: "competitor_analysis"
      confidence: 0.85
      examples:
        - "competitor analysis for"
        - "competitive intel on"
        - "analyze the competition"
    - pattern: "what is the competitor doing"
      intent: "competitor_monitoring"
      confidence: 0.80
      examples:
        - "what's new with"
        - "what has the competitor launched recently"
        - "competitor news"
    - pattern: "battlecard for"
      intent: "battlecard_generation"
      confidence: 0.90
      examples:
        - "create a battlecard"
        - "give me a battlecard against"
        - "competitive battlecard"
  keywords:
    - "competitor"
    - "competitive"
    - "battlecard"
    - "compare"
    - "versus"
    - "vs"
    - "differentiation"
    - "objection"
    - "rival"
  required_context:
    - competitor_name
  inputs:
    - name: competitor_name
      type: string
      description: "Name of the competitor to research and build a battlecard for"
      required: true
    - name: competitor_website
      type: string
      description: "Competitor's website URL if known"
      required: false
    - name: deal_id
      type: string
      description: "Related deal ID for tailoring competitive positioning to the deal context"
      required: false
  outputs:
    - name: competitor_profile
      type: object
      description: "Competitor overview with name, description, target market, pricing, and key customers"
    - name: comparison
      type: object
      description: "Head-to-head feature comparison with strengths, weaknesses, and neutral areas"
    - name: battlecard
      type: object
      description: "Sales battlecard with elevator pitch, differentiators, landmines, and win themes"
    - name: objection_handlers
      type: array
      description: "Common objections with recommended responses and supporting proof points"
    - name: recent_intel
      type: array
      description: "3-5 recent competitive developments with impact and talking points"
  requires_capabilities:
    - web_search
  priority: high
  tags:
    - sales-ai
    - competitive
    - battlecard
    - positioning
---

# Competitor Intel

## Goal
Generate actionable competitive intelligence and a battlecard that helps sales reps win against a specific competitor.

## Required Capabilities
- **Web Search**: To research competitor information across the web (routed to Gemini with Google Search grounding)

## Inputs
- `competitor_name`: Name of the competitor to research (required)
- `competitor_website`: Competitor's website URL (if known)
- `deal_context`: Current deal context where competitor is involved (if available)
- `organization_id`: Current organization context
- Organization variables: `${company_name}`, `${products}`, `${value_proposition}`

## Data Gathering (via web search)
1. Search for competitor's website, product pages, and pricing
2. Search for competitor's product features, capabilities, and recent launches
3. Search for competitor reviews on G2, Capterra, TrustRadius, and similar platforms
4. Search for competitor's recent news, press releases, and announcements
5. Search for competitor's funding, company size, and growth trajectory
6. Search for head-to-head comparison articles or analyst reports
7. Search for competitor's customer case studies and notable wins
8. Search for common objections and switching stories (from review sites)

## Output Contract
Return a SkillResult with:
- `data.competitor_profile`: Competitor overview with:
  - `name`: Competitor name
  - `website`: URL
  - `description`: What they do (2-3 sentences)
  - `target_market`: Who they sell to
  - `pricing_model`: Known pricing structure (if publicly available)
  - `company_size`: Employee count or range
  - `funding`: Total funding and last round
  - `key_customers`: Notable customers (if known)
- `data.comparison`: Head-to-head comparison with:
  - `feature_comparison`: Array of feature comparisons:
    - `feature`: Feature name
    - `us`: ${company_name}'s capability ("strong" | "moderate" | "weak" | "absent")
    - `them`: Competitor's capability ("strong" | "moderate" | "weak" | "absent")
    - `notes`: Context or nuance
  - `strengths_vs_them`: Array of areas where ${company_name} wins
  - `weaknesses_vs_them`: Array of areas where competitor has an edge
  - `neutral`: Array of areas that are roughly equivalent
- `data.battlecard`: Sales battlecard with:
  - `elevator_pitch`: Why ${company_name} over this competitor (2-3 sentences)
  - `key_differentiators`: Top 3-5 differentiators with proof points
  - `landmines`: Questions to plant that expose competitor weaknesses
  - `trap_questions`: Questions the competitor might try to use against ${company_name} and how to respond
  - `win_themes`: Top 3 themes that resonate when competing against this rival
  - `customer_evidence`: References to wins against this competitor or switching stories
- `data.objection_handlers`: Array of common objections with:
  - `objection`: What the prospect might say (e.g., "[Competitor] has better X")
  - `response`: Recommended response with reasoning
  - `proof_points`: Supporting evidence or references
- `data.recent_intel`: Array of 3-5 recent competitive developments with:
  - `date`: Date of development
  - `title`: What happened
  - `impact`: How it affects competitive positioning
  - `talking_point`: How to address this with prospects
  - `url`: Source URL
- `references`: Array of all source URLs used

## Guidelines
- Be factual and balanced -- do not fabricate competitive claims that cannot be supported
- Use ${company_name} and ${products} variables to tailor the battlecard
- Focus on talking points that are relevant to the current deal stage if `deal_context` is provided
- Highlight areas where prospects commonly switch FROM the competitor TO ${company_name}
- Keep objection handlers concise and easy to memorize for live conversations
- Flag any recent competitor moves that could change the competitive dynamic (new features, price changes, acquisitions)
- Note if pricing information is not publicly available rather than guessing

## Error Handling
- If competitor name is not recognized, search broadly and confirm the correct entity before proceeding
- If competitor is a very new or niche player with limited public information, note this and provide what is available
- If ${company_name} product information is not available in context, focus on competitor analysis without direct comparison
- Always return at least `competitor_profile` and `recent_intel` even if comparison data is limited
