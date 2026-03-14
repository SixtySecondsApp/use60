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

# === BRAIN CONTEXT (auto-injected memory tables) ===
brain_context:
  - "contact_memory"
  - "deal_memory_events"

# === AGENT AFFINITY (multi-agent routing) ===
agent_affinity:
  - "pipeline"
  - "research"

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

# === BRAIN CONTEXT (auto-injected memory tables) ===
brain_context:
  - "contact_memory"
  - "deal_memory_events"
  - "copilot_memories"

# === AGENT AFFINITY (multi-agent routing) ===
agent_affinity:
  - "pipeline"

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
| brain_context | Default: contact + deal | Same as skill, may add copilot_memories |
| agent_affinity | Optional, limits to specific agents | Optional, same behavior |

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

## Context Profiles (Organization Context Injection)

The `context_profile` field controls which organization context variables are injected into the compiled skill as an auto-generated `## Organization Context` block. This enables skills to reference real org data (company name, products, ICP, competitors, etc.) without hardcoding `${variable}` placeholders throughout the skill body.

### Field Spec

```yaml
metadata:
  context_profile: sales  # sales | research | communication | full
```

- **Type**: `string` (one of: `sales`, `research`, `communication`, `full`)
- **Required**: No. Defaults to `full` if not specified.
- **Location**: Inside the `metadata` block, alongside `category`, `triggers`, etc.

### Profile Definitions

| Profile | Variables Included | Best For |
|---------|-------------------|----------|
| `sales` | company_name, company_bio, products, value_propositions, competitors, icp, ideal_customer_profile, brand_voice, case_studies, customer_logos, pain_points | Deal management, pipeline, qualification, proposals |
| `research` | company_name, company_bio, products, competitors, industry, target_market, tech_stack, pain_points, employee_count, company_size | Company intelligence, lead research, competitive analysis |
| `communication` | company_name, brand_voice, products, case_studies, customer_logos, value_propositions | Email drafting, follow-ups, outreach, tone-sensitive content |
| `full` | ALL keys from organization_context | Meeting prep, daily planning, search, broad context needs |

### How It Works

During compilation (`compile-organization-skills`), the system:

1. Reads `context_profile` from the skill's frontmatter metadata
2. Fetches the organization's context variables from `organization_context`
3. Filters variables to only those in the selected profile
4. Generates a `## Organization Context (Auto-Generated)` markdown block
5. Prepends this block to the skill's compiled content

The skill body can then reference "the Organization Context above" instead of needing explicit `${variable}` placeholders for every field.

### When Context Changes

When an organization updates their context (products, ICP, brand voice, etc.), a database trigger marks all their skills for recompilation. A periodic cron job processes the queue, regenerating context blocks with fresh data.

### Example

A skill with `context_profile: sales` for "Acme Corp" would get this block prepended:

```markdown
## Organization Context (Auto-Generated)

**Company**: Acme Corp
**Industry**: Enterprise SaaS
**Products**: Widget Pro (AI-powered analytics), DataSync (ETL pipeline)
**Value Propositions**: 10x faster data processing, No-code setup, SOC2 compliant
**Competitors**: Fivetran, Airbyte, Stitch Data
**ICP**: VP/Director of Data Engineering at Series B+ SaaS companies
**Pain Points**: Complex ETL pipelines, Data freshness issues, Engineering bottleneck
**Brand Voice**: Confident partner — direct, technical but approachable
**Case Studies**: DataCo (3x pipeline speed), TechFlow (saved $200k/yr)

> This context is auto-generated from your organization settings.
```

### Inline Variables

Only `${company_name}` should be used inline in skill bodies — for titles, competitive framing, and email signatures. All other org data comes from the context block and should be referenced as "the Organization Context above" or "your organization's [products/ICP/etc.]".

### Profile Assignment Reference

| Skill | context_profile |
|-------|----------------|
| deal-map-builder | `sales` |
| deal-next-best-actions | `sales` |
| deal-rescue-plan | `sales` |
| deal-slippage-diagnosis | `sales` |
| pipeline-focus-task-planner | `sales` |
| objection-to-playbook | `sales` |
| lead-qualification | `sales` |
| proposal-generator | `sales` |
| company-analysis | `research` |
| company-research | `research` |
| competitor-intel | `research` |
| lead-research | `research` |
| sales-enrich | `research` |
| followup-reply-drafter | `communication` |
| followup-triage | `communication` |
| event-followup-analyzer | `communication` |
| sales-sequence | `communication` |
| meeting-command-center-plan | `full` |
| meeting-digest-truth-extractor | `full` |
| meeting-prep-brief | `full` |
| post-meeting-followup-drafter | `full` |
| post-meeting-followup-pack-builder | `full` |
| daily-brief-planner | `full` |
| daily-focus-planner | `full` |
| search-documentation | `full` |

---

## Brain Context (Auto-Injected Memory Tables)

The `brain_context` field declares which Brain tables the copilot should auto-inject as context before skill execution. This lets skills receive relevant memory (contact history, deal events, learned preferences) without the skill author manually fetching it.

### Field Spec

```yaml
brain_context:
  - "contact_memory"
  - "deal_memory_events"
```

- **Type**: `string[]` (array of Brain table identifiers)
- **Required**: No. Defaults to `['contact_memory', 'deal_memory_events']` (most skills benefit from deal + contact context).
- **Accepted values**: `contact_memory`, `deal_memory_events`, `copilot_memories`, `commitments`, `none`
- **Location**: Top-level frontmatter field, alongside `execution_mode`, `agent_affinity`, etc.

### Value Definitions

| Value | Description | Use When |
|-------|-------------|----------|
| `contact_memory` | Past interactions, preferences, and notes about the contact | Skill references a specific person |
| `deal_memory_events` | Timeline of deal events, stage changes, and signals | Skill analyzes or acts on a deal |
| `copilot_memories` | Learned user preferences and patterns (e.g., tone, formatting habits) | Skill generates content the user will send |
| `commitments` | Open commitments and promises made to contacts | Skill drafts follow-ups or checks accountability |
| `none` | Opt out of all Brain context injection | Utility skills, formatting, or search-only skills |

### Behavior

| `brain_context` value | What gets injected |
|-----------------------|--------------------|
| Not set (default) | `contact_memory` + `deal_memory_events` |
| `["contact_memory", "copilot_memories"]` | Contact memory + learned preferences |
| `["none"]` | Nothing -- no Brain tables injected |
| `["contact_memory", "deal_memory_events", "copilot_memories", "commitments"]` | All available Brain context |

### Examples

**Deal-focused skill** (default -- contact + deal context):
```yaml
brain_context:
  - "contact_memory"
  - "deal_memory_events"
```

**Content generation skill** (needs tone preferences):
```yaml
brain_context:
  - "contact_memory"
  - "deal_memory_events"
  - "copilot_memories"
```

**Follow-up skill** (needs commitments):
```yaml
brain_context:
  - "contact_memory"
  - "deal_memory_events"
  - "commitments"
```

**Utility/formatting skill** (no context needed):
```yaml
brain_context:
  - "none"
```

### Compilation

The `brain_context` field is stored in `platform_skills.frontmatter` (JSONB) and passes through to `organization_skills.compiled_frontmatter` unchanged during compilation. The compilation pipeline (`compile-organization-skills`) copies all frontmatter fields through, so no special handling is required -- `brain_context` is preserved as-is.

The copilot runtime reads `brain_context` from the compiled frontmatter at execution time and fetches the declared tables before invoking the skill.

---

## Agent Affinity (Multi-Agent Routing)

The `agent_affinity` field controls which specialist agents can use a skill. When the multi-agent orchestrator delegates a task to a specialist (e.g. `pipeline`, `outreach`), that agent's `list_skills` call filters to only skills matching its name.

### Field Spec

```yaml
metadata:
  agent_affinity:
    - "pipeline"
    - "meetings"
```

- **Type**: `string[]` (array of `AgentName` values)
- **Required**: No. Skills without `agent_affinity` are available to **all** agents.
- **Valid values**: `pipeline`, `outreach`, `research`, `crm_ops`, `meetings`, `prospecting`
- **Location**: Inside the `metadata` block, alongside `category`, `triggers`, etc.

### Behavior

| `agent_affinity` value | Which agents see the skill |
|------------------------|---------------------------|
| Not set / empty `[]` | All agents (universal skill) |
| `["pipeline"]` | Only the pipeline agent |
| `["research", "prospecting"]` | Research and prospecting agents |

### Examples

**Single-agent skill** -- only the meetings agent uses this:
```yaml
metadata:
  agent_affinity:
    - "meetings"
```

**Multi-agent skill** -- shared between outreach and meetings:
```yaml
metadata:
  agent_affinity:
    - "outreach"
    - "meetings"
```

**Universal skill** -- available to all agents (omit the field):
```yaml
metadata:
  # No agent_affinity -- all agents can use this skill
  category: output-format
```

### Full Mapping Reference

| Skill | agent_affinity |
|-------|---------------|
| meeting-prep-brief | `[meetings]` |
| meeting-digest-truth-extractor | `[meetings]` |
| meeting-command-center-plan | `[meetings]` |
| post-meeting-followup-drafter | `[outreach, meetings]` |
| post-meeting-followup-pack-builder | `[outreach, meetings]` |
| followup-triage | `[outreach]` |
| followup-reply-drafter | `[outreach]` |
| event-followup-analyzer | `[outreach, meetings]` |
| deal-map-builder | `[pipeline]` |
| deal-next-best-actions | `[pipeline]` |
| deal-rescue-plan | `[pipeline]` |
| deal-slippage-diagnosis | `[pipeline]` |
| pipeline-focus-task-planner | `[pipeline]` |
| company-analysis | `[research, pipeline]` |
| competitor-intel | `[research]` |
| lead-qualification | `[research, prospecting]` |
| lead-research | `[research, prospecting]` |
| daily-brief-planner | `[pipeline, meetings]` |
| daily-focus-planner | `[pipeline]` |
| objection-to-playbook | `[outreach, pipeline]` |
| output-format-selector | `[]` (all agents) |
| search-documentation | `[]` (all agents) |
| ai-ark-company-search | `[research, prospecting]` |
| ai-ark-people-search | `[research, prospecting]` |
| ai-ark-reverse-lookup | `[research]` |
| ai-ark-similarity-search | `[prospecting]` |
| ai-ark-semantic-search | `[research, prospecting]` |
| ai-ark-enrichment | `[research]` |
| apify-actor-browse | `[prospecting]` |
| apify-results-query | `[prospecting]` |
| apify-run-trigger | `[prospecting]` |

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
