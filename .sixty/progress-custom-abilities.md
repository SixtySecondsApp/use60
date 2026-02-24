# Progress Log — Custom Org Abilities

## Source
- Consult: `.sixty/consult/custom-org-abilities.md`
- Plan: `.sixty/plan-custom-abilities.json`
- Prerequisite: `.sixty/plan-proactive-config.json` (settings & user journey)
- Branch: `feat/proactive-agent-v2`

## Goal
Enable orgs to build custom abilities (event sequences/workflows) by merging the skills system with the orchestrator. Move sequence definitions from hardcoded TypeScript to organization_skills. Add 5 custom step types and 4 trigger types. Build sequence builder UI.

## Key Architecture
- **Skills Bridge**: orchestrator_config JSONB column on platform_skills stores sequence definitions
- **Step resolver**: stepResolver.ts dispatches to builtin adapters or generic custom step adapters
- **DB-first resolution**: getSequenceForEvent(eventType, orgId) queries org_skills → platform_skills → hardcoded fallback
- **Custom step types**: ai_prompt, webhook, slack_message, data_query, data_update
- **Trigger types**: cron (org_cron_schedules), webhook (API key), data_change (pg_notify), manual (UI)
- **Variable resolution**: ${event.payload.X}, ${context.tier1.user.name}, ${outputs.step-name.field}

## Codebase Patterns
- Adapters implement SkillAdapter: { name: string, execute(state, step): Promise<StepResult> }
- Register in adapters/index.ts ADAPTER_REGISTRY
- Step definitions: { skill, type, config, requires_context, requires_approval, criticality, depends_on }
- Runner handles: idempotency → chain depth → steps → context → cost budget → [NEW: settings gate] → execute

---

## Session Log

(Execution not started yet)
