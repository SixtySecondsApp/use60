---
name: Slack Coaching Query
namespace: slack
description: |
  Provide sales coaching, objection handling advice, and performance snapshots from Slack DM.
  Use when a Slack user asks how they're doing, wants advice on handling an objection or tough
  situation, asks for coaching tips, wants to know their performance metrics, or asks how to
  improve. Returns AI-generated objection handling frameworks or performance summary cards.
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
    - pattern: "how should I handle [objection]"
      intent: "objection_handling"
      confidence: 0.92
      examples:
        - "how should I handle the price objection?"
        - "how do I handle 'we don't have budget'?"
        - "what's the best way to respond to 'we're happy with our current vendor'?"
    - pattern: "how am I doing"
      intent: "performance_snapshot"
      confidence: 0.88
      examples:
        - "how am I doing this quarter?"
        - "what are my performance stats?"
        - "show me my metrics"
        - "how's my performance?"
    - pattern: "any coaching tips"
      intent: "coaching_general"
      confidence: 0.80
      examples:
        - "any coaching tips for me?"
        - "give me some sales advice"
        - "what should I focus on?"
        - "how can I improve?"
    - pattern: "handle objection"
      intent: "objection_handling"
      confidence: 0.85
      examples:
        - "help me handle the budget objection"
        - "tips for handling procurement delays"
        - "how to respond to 'we need to think about it'"
  keywords:
    - "how am i"
    - "how should i"
    - "how can i"
    - "how do i"
    - "improve"
    - "coaching"
    - "tip"
    - "advice"
    - "handle"
    - "objection"
    - "performance"
    - "metric"
    - "stats"
    - "doing"
  required_context:
    - slack_user_id
  inputs:
    - name: objection_type
      type: string
      description: "The specific objection or challenge the user wants to handle"
      required: false
    - name: is_performance_query
      type: boolean
      description: "Whether asking about their own performance metrics"
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
  priority: medium
  tags:
    - slack
    - coaching
    - objection-handling
    - performance
    - sales-advice
---

## Available Context & Tools
@_platform-references/org-variables.md
@_platform-references/capabilities.md

# Slack Coaching Query

## Goal
Give the user actionable sales coaching in Slack — either specific objection-handling advice or a quick performance snapshot. Coaching should be concrete, not generic.

## Intent Patterns

### Objection Handling (AI-powered)
Triggered when `objection_type` is extracted from the message.

Use Claude Haiku to generate concise, actionable advice with 2-3 specific response frameworks or phrases.

**System prompt**: "You are a sales coaching expert. Give concise, actionable advice for handling sales objections. Include 2-3 specific response frameworks or phrases. Keep it under 200 words."

**Response format**:
- Section: `*Handling: "{objection}"*`
- Divider
- Section: AI-generated advice (formatted with line breaks for readability)
- Divider
- Context: "Based on general sales best practices. Your team's specific win data will improve this over time."

**Fallback (no AI available)**:
- Section: `*Handling: "{objection}"*`
- Section: "I'd give you specific advice, but the AI service is temporarily unavailable. General tips:"
- Bullet list: general objection handling principles
  - Acknowledge the concern genuinely
  - Ask clarifying questions to understand the root cause
  - Reframe around value and business outcomes
  - Share relevant proof points and case studies
- Context: "Try again in a moment for AI-powered advice."

### Performance Snapshot
Triggered when message matches: "how am I", "performance", "doing", "stats", "metric"

Fetch pipeline data and build a quick scorecard.

**Response format**:
- Section: "Your Performance Snapshot:"
- Fields (2x2):
  - Active Deals: count
  - Pipeline Value: total value
  - Meetings This Week: count of meetings since start of current week
  - Weighted Pipeline: probability-weighted value
- Divider
- Context: "For detailed coaching insights, check your weekly coaching digest.\nAsk me 'which deals are at risk?' or 'show my pipeline' for more detail."

### General Coaching (context-aware)
Triggered when no specific objection is mentioned and not a performance query.

Generate pipeline-aware tips based on current deal state:

1. If deals at risk (score >= 60): "You have N deal(s) at risk — consider focused attention there."
2. If many deals in Discovery (3+): "N deals in Discovery — focus on qualifying and advancing these."
3. If pipeline looks healthy: "Your pipeline looks healthy. Keep up the momentum!"

**Response format**:
- Section: "Quick Coaching:"
- Bullet list of context-aware tips
- Divider
- Context: Suggested follow-up questions the user can ask:
  - "How should I handle budget objections?"
  - "Which deals need attention?"
  - "Show my performance stats"

## Data Sources

- **Performance metrics**: `execute_action("get_pipeline_snapshot", { owner: slack_user_id })`
- **Active deals**: `execute_action("list_deals", { status: "active", owner: slack_user_id })`
- **Risk scores**: `execute_action("get_deal_risk_scores", { owner: slack_user_id })`
- **Meetings**: `execute_action("list_meetings", { owner: slack_user_id, days_back: 7 })`

## Week Calculation for Meeting Count

```
const now = new Date();
const weekStart = new Date(now);
weekStart.setDate(now.getDate() - now.getDay()); // Sunday of current week
const thisWeekMeetings = meetings.filter(m => new Date(m.start_time) >= weekStart);
```

## Response Constraints

- Objection advice: max 200 words — concise beats comprehensive in Slack
- Include 2-3 specific response frameworks, not abstract principles
- Performance snapshot: use same currency formatting as pipeline query (£/$ with K/M)
- General coaching: max 3 tips — focus on the most impactful actions
- Always end with suggested follow-up questions to drive engagement
- Tone: direct, encouraging, specific — avoid generic motivational phrases

## Error Cases

- **AI unavailable for objection advice**: Show structured fallback with general principles (never return an empty response)
- **No pipeline data for performance**: Show what's available, note missing data explicitly
- **No deals at all**: Skip deal-specific coaching tips, focus on prospecting advice
