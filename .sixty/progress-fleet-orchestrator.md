# Progress Log — PRD-02: Fleet Orchestrator & Event Router

## Codebase Patterns
<!-- Reusable learnings for this feature -->

- **Additive migration strategy**: DB-driven routing layered on hardcoded fallback — zero downtime rollback
- **COALESCE NULL org_id pattern**: `COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid)` for UNIQUE constraints with NULL platform defaults
- **Resolution function pattern**: Try org-specific → fall back to platform default, SECURITY DEFINER with `SET search_path = 'public'`
- **5-minute cache TTL**: Consistent across config engine (PRD-01) and fleet router (PRD-02)
- **Circuit breaker**: In-memory per invocation + persisted in sequence_jobs.context for cross-invocation state
- **Dead-letter backoff**: Exponential: 1min × 4^retry_count, max 1 hour
- **Handoff evaluation**: Condition keys matched against step output — supports `min_confidence`, `risk_score_above`, `intent`, `has_scheduling_intent`, `classification`

---

## Session Log

### 2026-02-21 — Phase 1: FLT-001, FLT-002, FLT-003 ✅
**Story**: Fleet Configuration Schema (event routes, sequence definitions, handoff routes)
**Agent**: Opus (direct)
**Files**: `supabase/migrations/20260222100001_fleet_orchestrator.sql` (372 lines)
**Contents**: 3 tables with RLS, indexes, updated_at triggers, GRANTs
**Gates**: Opus review ✅

---

### 2026-02-21 — Phase 2: FLT-004 ✅
**Story**: Resolution functions
**Agent**: Opus (direct)
**Files**: `supabase/migrations/20260222100001_fleet_orchestrator.sql` (same file, +resolution functions)
**Contents**: `resolve_event_route()`, `get_sequence_definition()`, `get_handoff_routes()` — all SECURITY DEFINER STABLE
**Gates**: Opus review ✅

---

### 2026-02-21 — Phase 2: FLT-005 ✅
**Story**: DB-driven route resolution in runner.ts
**Agent**: Opus (direct)
**Files**: `supabase/functions/_shared/orchestrator/fleetRouter.ts` (306 lines), `runner.ts` (modified)
**Contents**: resolveRoute(), getSequenceSteps(), getHandoffRoutes(), evaluateHandoffConditions(), applyContextMapping(), getAgentTypeForSkill(), 5-min cache, hardcoded fallback
**Gates**: Opus review ✅

---

### 2026-02-21 — Phase 3: FLT-006 ✅
**Story**: Structured handoff protocol in runner.ts
**Agent**: Opus (direct)
**Files**: `runner.ts` (modified — handoff routing after step completion in parallel loop)
**Contents**: After each successful step, queries get_handoff_routes, evaluates conditions, pushes to queued_followups
**Gates**: Opus review ✅

---

### 2026-02-21 — Phase 3: FLT-007 ✅
**Story**: Agent trigger handoff fields
**Agent**: Opus (direct)
**Files**: `supabase/migrations/20260222100002_fleet_trigger_handoffs.sql` (18 lines), `agent-trigger/index.ts` (modified)
**Contents**: 3 new nullable columns on agent_triggers, handoff firing after specialist agent completes
**Gates**: Opus review ✅

---

### 2026-02-21 — Phase 4: FLT-008 ✅
**Story**: Dead-letter queue table
**Agent**: Opus (direct)
**Files**: `supabase/migrations/20260222100003_fleet_reliability.sql` (58 lines)
**Contents**: fleet_dead_letter_queue table with retry polling index, org inspection index, RLS
**Gates**: Opus review ✅

---

### 2026-02-21 — Phase 4: FLT-009 ✅
**Story**: Dead-letter queue wiring
**Agent**: Opus (direct)
**Files**: `deadLetter.ts` (210 lines), `runner.ts` (modified), `agent-orchestrator/index.ts` (modified)
**Contents**: enqueueDeadLetter(), retryDeadLetters(), wired into critical step failures + followup failures + cron route
**Gates**: Opus review ✅

---

### 2026-02-21 — Phase 4: FLT-010 ✅
**Story**: Circuit breaker for adapters
**Agent**: Opus (direct)
**Files**: `circuitBreaker.ts` (182 lines), `runner.ts` (modified)
**Contents**: 3-state circuit breaker (closed/open/half-open), 5 failures in 60s trips, 30s cooldown, cross-invocation state persistence
**Gates**: Opus review ✅

---

### 2026-02-21 — Phase 5: FLT-011 ✅
**Story**: Config engine integration (extending CFG-011)
**Agent**: Opus (direct)
**Files**: `fleetRouter.ts` (getAgentTypeForSkill mapping)
**Contents**: Skill-to-agent-type mapping for 30+ skills
**Note**: PRD-01 CFG-011 already loaded agentConfig into SequenceState. FLT-011 adds per-skill agent type mapping.
**Gates**: Opus review ✅

---

### 2026-02-21 — Phase 5: FLT-012 ✅
**Story**: Seed data migration
**Agent**: Opus (direct)
**Files**: `supabase/migrations/20260222100004_fleet_seed_data.sql` (293 lines)
**Contents**: 9 event routes, 9 sequence definitions (exact JSONB from eventSequences.ts), 7 handoff routes
**Gates**: Opus review ✅

---

### 2026-02-21 — Phase 6: FLT-013 ✅
**Story**: Fleet admin edge function
**Agent**: Opus (direct)
**Files**: `supabase/functions/fleet-admin/index.ts` (303 lines)
**Contents**: 14 actions for routes, sequences, handoffs, dead-letter management, circuit breaker stats
**Gates**: Opus review ✅

---

### 2026-02-21 — FLT-014 ✅
**Story**: End-to-end verification
**Agent**: Opus (direct)
**Verification**: 8 new files + 3 modified files. 3,491 total lines. Lint: 0 code errors (Deno tsconfig warnings are pre-existing).
**Gates**: Opus verification ✅
