---
name: Slack Competitive Query
namespace: slack
description: |
  Retrieve competitive intelligence, battlecards, and win/loss positioning from Slack DM.
  Use when a Slack user asks about competitors, how to beat a specific competitor, win rates
  against a vendor, competitive positioning, or wants to see the competitive landscape.
  Returns battlecard summaries with competitor strengths, weaknesses, and win rate data
  extracted from the team's sales conversations.
metadata:
  author: sixty-ai
  version: "1"
  category: slack-copilot
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - slack
  triggers:
    - pattern: "how do we beat [competitor]"
      intent: "competitive_query"
      confidence: 0.92
      examples:
        - "how do we beat Salesforce?"
        - "how do I win against HubSpot?"
        - "tips for competing against Pipedrive"
    - pattern: "competitive intelligence"
      intent: "competitive_landscape"
      confidence: 0.85
      examples:
        - "show me the competitive landscape"
        - "competitive overview"
        - "what competitors are we seeing?"
    - pattern: "vs [competitor]"
      intent: "competitive_battlecard"
      confidence: 0.88
      examples:
        - "us vs Salesforce"
        - "how do we compare to HubSpot?"
        - "versus Pipedrive positioning"
        - "against Copper CRM"
    - pattern: "win rate against"
      intent: "competitive_win_rate"
      confidence: 0.85
      examples:
        - "what's our win rate against Salesforce?"
        - "how do we do against HubSpot?"
        - "do we beat Pipedrive often?"
  keywords:
    - "competitor"
    - "compete"
    - "vs"
    - "versus"
    - "against"
    - "battle"
    - "battlecard"
    - "positioning"
    - "differentiat"
    - "competitive"
    - "win rate"
    - "beat"
    - "landscape"
  required_context:
    - slack_user_id
  inputs:
    - name: competitor_name
      type: string
      description: "Specific competitor name extracted from the Slack message"
      required: false
    - name: raw_query
      type: string
      description: "The original Slack message text"
      required: true
  outputs:
    - name: slack_blocks
      type: array
      description: "Slack Block Kit blocks to render in the DM response"
    - name: text
      type: string
      description: "Fallback plain text if blocks are unavailable"
  requires_capabilities:
    - crm
  priority: medium
  tags:
    - slack
    - competitive
    - battlecard
    - win-rate
    - positioning
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Slack Competitive Query

## Goal
Surface competitive intelligence from the team's sales conversations to help reps prepare for competitive deals. Data builds automatically as competitors are mentioned in sales calls — the more conversations logged, the richer the intelligence.

## Intent Patterns

### Specific Competitor Battlecard
Triggered when `competitor_name` is extracted from the message.

1. Search competitive intelligence records for the named competitor (case-insensitive partial match)
2. If found: show full battlecard
3. If not found: "No competitive intelligence found for [name]. This data builds up as competitors are mentioned in your sales calls."

**Battlecard format**:
- Header: "Battlecard: [Competitor Name]"
- Fields: Mentions (N across deals) | Win Rate (N% or "Insufficient data" if < 5 deals)
- Section "Their Strengths:" — bullet list of known competitor strengths
- Section "Our Advantages:" — bullet list of our differentiators vs. this competitor
- Divider
- Context: "Competitive intel builds from your team's sales conversations. More data = better insights."

### Competitive Landscape Overview
Triggered when no specific competitor is named, or when asking "show competitive landscape."

1. Fetch all competitive intelligence records sorted by mention count
2. Show ranked list of all known competitors

**Landscape format**:
- Section: "Competitive Landscape:"
- Bullet list: `• *Competitor Name* — N mentions | Win rate: N%`
  - Omit win rate if insufficient data
  - Sort by mention count descending
- Divider
- Context: "Ask about a specific competitor for their full battlecard."

### No Competitive Data
Show when no competitive intelligence data exists at all:
- Section: "No competitive intelligence data yet. This builds automatically as competitors are mentioned in your sales calls."
- Context: `Once data accumulates, ask me things like "What works against [competitor]?" or "Show competitive landscape"`

## Data Sources

- **Competitive intelligence**: `execute_action("get_competitive_intelligence", { owner: slack_user_id })`
  - Returns: `competitor_name`, `mention_count`, `win_rate` (null if insufficient data), `strengths[]`, `weaknesses[]`

## Win Rate Display Rules

- Show win rate only if there are ≥ 5 competitive deals with this competitor
- Format: "{N}%" (e.g., "47%")
- If insufficient data: show "Insufficient data" — never show 0% for missing data
- Win rate = deals won / (deals won + deals lost) where this competitor was tagged

## Response Constraints

- Strengths and weaknesses: show all available — don't truncate (competitive prep needs complete info)
- If no strengths data: skip the "Their Strengths" section entirely
- If no weaknesses/advantages data: skip the "Our Advantages" section entirely
- Mention count: format as "N across deals" for context
- Sort landscape by mention count descending — most frequently encountered competitors first

## Error Cases

- **Specific competitor not found**: Plain text with competitor name and explanation that data builds from call transcripts
- **No competitive data at all**: Structured response explaining how data builds (not an error state — users need to understand the value proposition)
- **Win rate with < 5 deals**: Show "Insufficient data" rather than a potentially misleading percentage
