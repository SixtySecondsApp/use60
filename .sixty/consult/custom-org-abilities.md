# Consult Report: Custom Org Abilities — Configurable Workflow Engine

**Date**: 15 February 2026
**Branch**: `feat/proactive-agent-v2`
**Prerequisite Plan**: `.sixty/plan-proactive-config.json` (settings & user journey)

---

## User Request

"Can we have it so Orgs can build their own abilities for their users? Different Cron Job and event sequences / workflows?"

## Clarifications

- **Approach**: Skills Bridge (Option C) — unify skills/sequences + orchestrator into one data-driven system
- **Custom steps**: Full custom — compose from existing adapters + custom AI prompts + custom webhooks + custom Slack messages + data query/update
- **Triggers**: All 4 types — custom cron, webhook/external event, data change, manual/chat-initiated

---

## Current Architecture

### Two Separate "Sequence" Systems (Problem)

| System | Location | Count | Triggered By | Org-Configurable? |
|--------|----------|-------|--------------|-------------------|
| Orchestrator sequences | `eventSequences.ts` (hardcoded) | 9 | Events (meeting_ended, etc.) | No |
| Skill sequences | `skills/sequences/` → `organization_skills` | 23 | User chat / copilot | Partially (via skill editor) |

**The goal**: Merge these into a **unified data-driven system** where both system sequences and custom org sequences live in the same table, use the same runner, and support the same step types.

### What Exists

- **24+ adapters** in `ADAPTER_REGISTRY` — ready to compose
- **Skill editor** — already supports creating/editing skills per org
- **Per-org compilation** — `platform_skills` → `organization_skills`
- **Embedding discovery** — semantic routing for skills
- **Orchestrator runner** — parallel waves, HITL, retry, self-invocation

### What's Missing

- No way to define orchestrator sequences in DB
- No custom step types (AI prompt, webhook, etc.)
- No custom trigger system (cron, webhook, data change)
- No sequence builder UI for admins
- `getSequenceForEvent()` is hardcoded — doesn't check DB

---

## Architecture: Skills-as-Sequences Bridge

### Data Model

```
platform_skills (existing)
  + orchestrator_config JSONB (NEW)
    ├── event_type: string (unique identifier)
    ├── is_system: boolean (true for 9 defaults)
    ├── steps: StepDefinition[]
    │   ├── skill: string (adapter name or custom step id)
    │   ├── type: 'builtin' | 'ai_prompt' | 'webhook' | 'slack_message' | 'data_query' | 'data_update'
    │   ├── config: {} (type-specific config)
    │   ├── requires_context: string[] (tier1, tier2, tier3)
    │   ├── requires_approval: boolean
    │   ├── criticality: 'critical' | 'best-effort'
    │   └── depends_on: string[] (for parallel waves)
    ├── triggers: TriggerDefinition[]
    │   ├── type: 'cron' | 'webhook' | 'data_change' | 'manual'
    │   └── config: {} (schedule, URL, table+condition, etc.)
    └── default_enabled: boolean
```

### Resolution Chain

```
Event fires → getSequenceForEvent(eventType, orgId)
  1. Check organization_skills for org-specific sequence matching event_type
  2. Check platform_skills for system sequence matching event_type
  3. Fall back to hardcoded EVENT_SEQUENCES (deprecated path)
  4. If no match → reject event
```

### Custom Step Type Adapters

| Type | Config | What It Does |
|------|--------|-------------|
| `builtin` | `{ skill: 'classify-call-type' }` | Delegates to existing ADAPTER_REGISTRY |
| `ai_prompt` | `{ model, prompt_template, output_schema, variables }` | Calls Claude/Gemini with resolved template |
| `webhook` | `{ url, method, headers, body_template, timeout }` | HTTP call to external service |
| `slack_message` | `{ blocks_template, target, actions }` | Send Block Kit with variable resolution |
| `data_query` | `{ table, select, filters, limit }` | Parameterized DB read (whitelisted tables) |
| `data_update` | `{ table, set, where }` | CRM field update with guardrails |

### Trigger Types

| Trigger | Infrastructure | How It Works |
|---------|---------------|-------------|
| `cron` | `org_cron_schedules` table + cron edge function | Checks due schedules every minute, fires events |
| `webhook` | `org-webhook-trigger` edge function | Per-org API key, validates payload, fires event |
| `data_change` | pg_notify + trigger evaluation function | DB triggers on key tables, evaluates conditions |
| `manual` | UI button + orchestrator call | User clicks "Run" on ability page |

---

## Migration Strategy

### Phase 1: Seed System Sequences
- Insert 9 existing sequences as `platform_skills` rows with `orchestrator_config`
- Each step definition maps 1:1 to current `EVENT_SEQUENCES` entries
- All marked `is_system: true`

### Phase 2: Data-Driven Runner
- `getSequenceForEvent()` queries DB first, falls back to constants
- Step resolver dispatches to appropriate adapter (builtin or custom type)
- Existing behavior is 100% preserved — just reads from DB instead of constants

### Phase 3: Custom Steps & Triggers
- Generic adapters for custom step types
- Trigger infrastructure for cron, webhook, data change
- Variable resolution engine for templates

### Phase 4: Builder UI
- Admin creates custom abilities via enhanced skill editor
- Step configuration forms per type
- Trigger configuration with preview

---

## Security Considerations

1. **Custom webhooks**: URL allowlisting or admin-approved domains only
2. **Data query/update**: Whitelisted tables (contacts, deals, activities, companies) with column-level restrictions
3. **AI prompts**: Token limits and cost budgets per org
4. **Data change triggers**: Rate limiting to prevent trigger storms (max N events per table per minute)
5. **Webhook triggers**: API key per org, rate limiting, payload validation

---

## Relationship to proactive-config Plan

This plan **builds on** the proactive-config plan:
- CONF-001/002 (proactive_agent_config + user_sequence_preferences) gates ALL sequences including custom ones
- CONF-004 (runner gate) checks preferences for custom sequences same as system ones
- CONF-009/010/011 (agent_activity + delivery hardening) applies to custom sequence delivery too
- Custom abilities appear in the Agent Abilities UI (CONF-008) alongside system abilities

**Dependency**: Phase A of this plan can run in parallel with proactive-config. Phase B+ should run after proactive-config Phase B (enforcement layer) is complete so custom sequences respect the same gates.
