---
name: Slack Deal Query
namespace: slack
description: |
  Answer deal status, progress, and risk questions sent via Slack DM.
  Use when a Slack user asks about a specific deal's status, pipeline overview,
  at-risk deals, what's happening with an account, or wants deal details.
  Returns structured Slack Block Kit cards with deal info, risk signals, and quick actions.
metadata:
  author: sixty-ai
  version: "1"
  category: slack-copilot
  skill_type: atomic
  is_active: true
  context_profile: sales
  agent_affinity:
    - slack
    - pipeline
  triggers:
    - pattern: "what's happening with [deal]"
      intent: "deal_query"
      confidence: 0.90
      examples:
        - "what's happening with Acme?"
        - "status update on the Globex deal"
        - "how is the TechCorp opportunity progressing?"
    - pattern: "deal status"
      intent: "deal_status"
      confidence: 0.88
      examples:
        - "what's the status on Initech?"
        - "give me an update on my deals"
        - "tell me about the Acme deal"
    - pattern: "at risk deals"
      intent: "deal_risk_query"
      confidence: 0.85
      examples:
        - "which deals are at risk?"
        - "show me my risky deals"
        - "any deals slipping?"
        - "what deals are in danger?"
        - "deals that are stalling"
    - pattern: "show my deals"
      intent: "deal_overview"
      confidence: 0.80
      examples:
        - "show me my pipeline"
        - "list my active deals"
        - "what deals do I have open?"
  keywords:
    - "deal"
    - "opportunity"
    - "opp"
    - "account"
    - "at risk"
    - "slipping"
    - "stalling"
    - "risk"
    - "status"
    - "update"
    - "progress"
    - "what's happening"
  required_context:
    - slack_user_id
  inputs:
    - name: deal_name
      type: string
      description: "Specific deal name extracted from the Slack message"
      required: false
    - name: is_risk_query
      type: boolean
      description: "Whether the user is asking about at-risk deals"
      required: false
      default: false
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
  priority: high
  tags:
    - slack
    - deal
    - pipeline
    - risk
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Slack Deal Query

## Goal
Answer deal-related questions sent via Slack DM with structured, scannable responses. The user is on mobile or in Slack context — brevity and clarity matter more than exhaustive detail.

## Intent Patterns

### At-Risk Deal Query
Triggered when the message contains: "at risk", "risky", "risk", "danger", "slipping", "stalling"

1. Fetch all active deals with their risk scores from `deal_risk_scores`
2. Filter for high-risk deals (score >= 50), sort by score descending, show top 5
3. If no high-risk deals: return a green "All your deals look healthy" message with total deal count
4. For each at-risk deal: show deal title, risk badge (🔴 Critical / 🟡 High / 🟠 Medium), risk score, and top risk signal

**Response format**:
- Header: "N Deals At Risk"
- One section per at-risk deal: `[badge] *Deal Title* (score/100)\n_Top risk signal_`
- Context footer: "Risk scores update daily. Ask me about any specific deal for details."

### Specific Deal Query
Triggered when a deal name is extracted from the message.

1. Search deals by the extracted name (case-insensitive partial match)
2. If single match: show full deal card
3. If multiple matches: list up to 5 with stage and value, ask to be more specific
4. If no match: return "I couldn't find a deal matching [name]"

**Single deal card format**:
- Header: deal title
- Fields: Stage | Value | Close Date | Risk level
- Risk signals section (if risk data available): top 3 signals as bullet list
- Recent activity (up to 3 items): type — subject — date
- Actions: "Open in 60" (primary) | "Draft Follow-up"

### General Deal Overview
Triggered when no specific deal name is extracted and it's not a risk query.

1. Fetch all active deals with risk scores
2. Show top 5 deals by value with stage and risk badge
3. Include at-risk deal count in the header

**Response format**:
- Section: "Your Active Deals (N total, M at risk)"
- Bullet list: `• *Deal Title* — Stage | £Value [risk badge]`
- Context link to full pipeline if >5 deals

## Data Sources

- **Deals**: `execute_action("list_deals", { status: "active", owner: slack_user_id })`
- **Risk scores**: `execute_action("get_deal_risk_scores", { owner: slack_user_id })`
- **Recent activities**: `execute_action("list_activities", { deal_id, limit: 3 })`

## Response Constraints

- Keep responses scannable — use Slack Block Kit fields and sections, not walls of text
- Maximum 5 deals shown in list views
- Risk signals: max 3, plain language (not raw field names)
- Include app deep-link actions where relevant ("Open in 60")
- Close dates: format as `Jan 15` not ISO strings
- Values: format as currency (£/$ with K/M abbreviation for large amounts)

## Error Cases

- **No deals found**: "I couldn't find any deals in your pipeline. Start by creating a deal in the app."
- **No risk scores**: "No risk scores available yet. Risk scoring runs daily — check back tomorrow."
- **Multiple deal matches**: List top 5 and prompt: `Be more specific — e.g. "What's happening with Acme Corp?"`
