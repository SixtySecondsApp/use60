# Progress Log — PRD-02: Fleet Orchestrator & Event Router

## Codebase Patterns
<!-- Reusable learnings for this feature -->

- **Existing orchestrator**: `runner.ts` (890 lines) — parallel wave execution, HITL, retry, self-invocation, cost tracking
- **9 event types**: meeting_ended, pre_meeting_90min, email_received, proposal_generation, calendar_find_times, stale_deal_revival, campaign_daily_check, coaching_weekly, deal_risk_scan
- **33 adapters** in `_shared/orchestrator/adapters/` with `ADAPTER_REGISTRY` in index.ts
- **Sequence definitions**: Hardcoded in `eventSequences.ts` — PRD-02 moves these to DB
- **Intent action mappings**: Hardcoded in `intentActionRegistry.ts` — PRD-02 moves these to fleet_handoff_routes
- **Follow-up chaining**: Fire-and-forget via `processFollowups()` → agent-orchestrator HTTP POST
- **Step criticality**: `critical` = abort on fail, `best-effort` = skip on fail
- **Retry**: Exponential backoff (1s, 2s, 4s), MAX_STEP_RETRIES = 2
- **Self-invocation**: Persists state to DB, fires HTTP POST to resume before timeout
- **MAX_CHAIN_DEPTH**: 5 (prevents infinite loops)
- **Context tiers**: tier1 (always), tier2 (entity-specific), tier3 (on-demand enrichment)

## Key Files
| File | Lines | Purpose |
|------|-------|---------|
| `_shared/orchestrator/runner.ts` | ~890 | Core execution engine |
| `_shared/orchestrator/types.ts` | ~274 | Event types, step shapes, state |
| `_shared/orchestrator/eventSequences.ts` | ~450 | Hardcoded sequence definitions |
| `_shared/orchestrator/intentActionRegistry.ts` | ~200 | Intent-to-action handoff mappings |
| `_shared/orchestrator/adapters/index.ts` | ~163 | Adapter registry (33 adapters) |
| `agent-orchestrator/index.ts` | ~132 | Edge function entry point |
| `agent-trigger/index.ts` | — | Event-triggered specialist agents |
| `agent-scheduler/index.ts` | — | Cron-scheduled specialist agents |

## Migration Strategy
1. Seed fleet tables with exact copies of hardcoded sequences
2. Runner checks DB first, falls back to eventSequences.ts if not found
3. Once verified, eventSequences.ts becomes dead code (kept as reference)
4. Zero-downtime: fallback ensures no disruption

---

## Session Log

*No sessions yet — run `60/dev-run` to begin execution.*
