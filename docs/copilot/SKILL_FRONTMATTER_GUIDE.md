# Skill Frontmatter Guide

This guide defines the YAML frontmatter structure for skills and sequences that enables effective AI agent routing and execution.

## How Routing Works

1. **Sequences are checked first** (category: `agent-sequence`)
2. If sequence matches with confidence > 70%, it's selected
3. Otherwise, individual skills are checked
4. Best match above 50% confidence is selected

The routing uses:
- `triggers` - Pattern matching with confidence scores
- `keywords` - Fallback keyword matching
- `description` - Context for AI understanding

---

## Individual Skill Frontmatter (V2)

```yaml
# === IDENTITY ===
name: "Deal Health Analysis"
description: |
  Analyze deal health and win probability based on CRM data,
  meeting engagement, email sentiment, and timeline adherence.
  Returns structured assessment with risk flags and actions.
category: "sales-ai"
version: 2

# === AI MATCHING (Critical for routing) ===
triggers:
  - pattern: "analyze deal"
    intent: "deal_analysis"
    confidence: 0.9
    examples:
      - "analyze this deal"
      - "what's the health of this deal"
      - "deal analysis for Acme"

  - pattern: "deal health"
    intent: "deal_analysis"
    confidence: 0.85
    examples:
      - "check deal health"
      - "how healthy is this deal"
      - "deal health score"

  - pattern: "win probability"
    intent: "deal_analysis"
    confidence: 0.8
    examples:
      - "what's the win probability"
      - "chances of winning this deal"
      - "likelihood to close"

keywords:
  - "deal"
  - "health"
  - "score"
  - "probability"
  - "forecast"
  - "pipeline"
  - "risk"

# === CONTEXT REQUIREMENTS ===
required_context:
  - "company_name"
  - "deal_id"

optional_context:
  - "contact_name"
  - "deal_stage"

# === INPUT/OUTPUT SCHEMA ===
inputs:
  - name: "deal_id"
    type: "string"
    description: "The deal ID to analyze"
    required: true

  - name: "include_recommendations"
    type: "boolean"
    description: "Include action recommendations"
    required: false
    default: true

outputs:
  - name: "health_score"
    type: "number"
    description: "Deal health score 0-100"

  - name: "win_probability"
    type: "number"
    description: "Estimated win probability 0-1"

  - name: "risk_flags"
    type: "array"
    description: "List of identified risks"

  - name: "recommended_actions"
    type: "array"
    description: "Suggested next steps"

# === EXECUTION ===
execution_mode: "sync"
timeout_ms: 30000

# === METADATA ===
tags:
  - "deals"
  - "forecasting"
  - "analytics"
```

---

## Sequence Frontmatter (Mega Skills)

Sequences orchestrate multiple skills. They need additional fields to describe the workflow.

```yaml
# === IDENTITY ===
name: "Complete Deal Review"
description: |
  End-to-end deal review workflow that gathers context, analyzes health,
  generates recommendations, and optionally sends Slack briefing.

  Orchestrates: @get-contact-context → @deal-scoring → @hitl/slack-approval → @slack-briefing-format
category: "agent-sequence"
version: 1

# === AI MATCHING ===
triggers:
  - pattern: "full deal review"
    intent: "comprehensive_deal_analysis"
    confidence: 0.95
    examples:
      - "do a full deal review"
      - "complete deal analysis"
      - "comprehensive deal review for Acme"

  - pattern: "review my deal"
    intent: "comprehensive_deal_analysis"
    confidence: 0.85
    examples:
      - "review this deal"
      - "analyze and review deal"
      - "deal review with recommendations"

  - pattern: "deal briefing"
    intent: "comprehensive_deal_analysis"
    confidence: 0.8
    examples:
      - "prepare deal briefing"
      - "deal briefing for tomorrow"
      - "send me a deal summary"

keywords:
  - "review"
  - "briefing"
  - "comprehensive"
  - "full"
  - "complete"
  - "deal"
  - "analysis"

# === SEQUENCE WORKFLOW ===
# Describes the orchestration flow for AI understanding
workflow_description: |
  1. Gather full contact and deal context (@get-contact-context)
  2. Analyze deal health and risks (@deal-scoring)
  3. If high-risk, request approval before sending (@hitl/slack-approval)
  4. Format and deliver Slack briefing (@slack-briefing-format)

# These are populated automatically from skill_links table
# but can be listed here for documentation
linked_skills:
  - "get-contact-context"
  - "deal-scoring"
  - "hitl/slack-approval"
  - "slack-briefing-format"

# === CONTEXT REQUIREMENTS ===
required_context:
  - "company_name"
  - "deal_id"

optional_context:
  - "slack_channel"
  - "urgency_level"

# === INPUT/OUTPUT SCHEMA ===
inputs:
  - name: "deal_id"
    type: "string"
    description: "The deal to review"
    required: true

  - name: "send_to_slack"
    type: "boolean"
    description: "Send briefing to Slack"
    required: false
    default: true

  - name: "slack_channel"
    type: "string"
    description: "Target Slack channel"
    required: false
    default: "#deal-reviews"

outputs:
  - name: "health_score"
    type: "number"
    description: "Overall deal health"

  - name: "briefing_sent"
    type: "boolean"
    description: "Whether Slack briefing was sent"

  - name: "job_id"
    type: "string"
    description: "Sequence execution job ID for tracking"

# === EXECUTION ===
execution_mode: "async"  # Sequences often need async for HITL
timeout_ms: 300000       # 5 minutes for full workflow

# === METADATA ===
tags:
  - "deals"
  - "workflow"
  - "slack"
  - "briefing"
```

---

## Key Differences: Skill vs Sequence

| Aspect | Individual Skill | Sequence |
|--------|------------------|----------|
| Category | Any except `agent-sequence` | `agent-sequence` |
| Triggers | Specific actions | Broader workflows |
| Confidence | Usually 0.7-0.9 | Usually 0.8-0.95 |
| Execution | Usually sync | Often async (HITL) |
| workflow_description | Not needed | Describes flow |
| linked_skills | Not used | Lists orchestrated skills |

---

## Best Practices for AI Routing

### 1. Strong Triggers
```yaml
# GOOD - Specific with examples
triggers:
  - pattern: "analyze deal health"
    confidence: 0.9
    examples:
      - "check the health of this deal"
      - "deal health analysis"

# BAD - Too generic
triggers:
  - pattern: "analyze"
    confidence: 0.5
```

### 2. Confidence Levels
- **0.9-1.0**: Exact, unambiguous matches
- **0.7-0.9**: Strong matches with some variation
- **0.5-0.7**: Moderate matches, may have alternatives
- **Below 0.5**: Weak, likely false positives

### 3. Keywords as Fallback
```yaml
# Good keyword selection
keywords:
  - "deal"      # Core concept
  - "health"    # Action type
  - "score"     # Output type
  - "risk"      # Related concept
```

### 4. Clear Descriptions
The description helps AI understand when to use the skill:
```yaml
description: |
  Analyze deal health and win probability.
  Use when: User asks about deal status, risks, or forecasting.
  Output: Structured health score with risk flags.
```

---

## Updating Existing Skills

To improve routing for existing skills, update frontmatter:

```sql
-- Example: Update skill frontmatter
UPDATE platform_skills
SET frontmatter = jsonb_set(
  frontmatter,
  '{triggers}',
  '[
    {"pattern": "analyze deal", "confidence": 0.9, "examples": ["check deal health", "deal analysis"]},
    {"pattern": "deal health", "confidence": 0.85, "examples": ["health score", "deal status"]}
  ]'::jsonb
)
WHERE skill_key = 'deal-scoring';
```

Or via the skill editor UI - edit the SKILL.md frontmatter section.
