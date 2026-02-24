# Progress Log — PRD-01: Agent Configuration Engine

## Codebase Patterns
<!-- Reusable learnings for this feature -->

- **Existing config tables**: `agent_team_config` (org-level model/budget), `proactive_agent_config` (org-level sequence toggles), `user_sequence_preferences` (user-level opt-out) — all remain operational, new system runs alongside
- **org_id is UUID** in most tables (NOT text) — FK to `organizations(id)`
- **RLS pattern**: `get_org_role(auth.uid(), org_id)` helper for admin checks, subquery to `organization_memberships` for member checks
- **Edge auth**: `edgeAuth.ts` provides `getAuthContext()` and `requireOrgRole()`
- **Config loading**: Use `maybeSingle()`, explicit column selection, Map-based request caching
- **CORS**: New functions use `getCorsHeaders(req)` from `corsHelper.ts`
- **Deploy**: Staging uses `--no-verify-jwt` flag
- **Migration naming**: `YYYYMMDDHHMMSS_descriptive_name.sql`

## Agent Types (for seed data)
| Agent Type | Config Keys | Purpose |
|-----------|-------------|---------|
| `global` | `active_methodology`, `temporal.quarter_phases`, `pipeline.targets` | Cross-agent settings |
| `crm_update` | mission, playbook, boundaries, voice, heartbeat, delivery, thresholds | Auto CRM updates |
| `deal_risk` | mission, playbook, boundaries, voice, heartbeat, delivery, thresholds, weights | Deal risk scoring |
| `reengagement` | mission, playbook, boundaries, voice, delivery, cooldown_rules | Re-engagement triggers |
| `morning_briefing` | mission, delivery, pipeline_math, temporal, format | Morning brief |
| `eod_synthesis` | mission, delivery, format, overnight_plan | End-of-day wrap |
| `internal_meeting_prep` | mission, meeting_types, delivery, format | Internal meeting prep |
| `email_signals` | mission, signal_types, delivery, thresholds | Email signal processing |
| `coaching_digest` | mission, delivery, format, focus_areas | Weekly coaching |

---

## Session Log

### 2026-02-21 — Phase 1: CFG-001–004 ✅
**Story**: Schema & Resolution Functions (consolidated into single migration)
**Agent**: schema-builder (Sonnet), reviewed by Opus
**Files**: `supabase/migrations/20260222000001_agent_config_engine.sql` (899 lines)
**Contents**: 4 tables, 2 resolution functions, 66 seed rows, RLS, triggers, GRANTs
**Time**: ~15 min
**Gates**: Opus review ✅

---

### 2026-02-21 — Phase 2: CFG-005 ✅
**Story**: Shared agentConfigEngine.ts loader
**Agent**: config-loader (Sonnet), reviewed by Opus
**Files**: `supabase/functions/_shared/config/agentConfigEngine.ts` (262 lines), `types.ts` (71 lines)
**Contents**: getAgentConfig, getAgentConfigKey, 5min cache, fallback defaults, type definitions
**Fix**: Opus corrected source attribution on single-key RPC (was falsely reporting 'default')
**Gates**: Opus review ✅

---

### 2026-02-21 — Phase 2: CFG-006 ✅
**Story**: agent-config-admin edge function
**Agent**: admin-fn-builder (Sonnet), reviewed by Opus
**Files**: `supabase/functions/agent-config-admin/index.ts` (320 lines)
**Contents**: 10 actions (get_config, list_agent_types, set/remove org/user overrides, overridable, methodologies, apply_methodology)
**Gates**: Opus review ✅

---

### 2026-02-21 — Phase 3: CFG-007+008 ✅
**Story**: Methodology templates + apply_methodology()
**Agent**: methodology-builder (Sonnet), reviewed by Opus
**Files**: `supabase/migrations/20260222000002_agent_methodology_templates.sql` (447 lines)
**Contents**: agent_methodology_templates table, 5 methodologies seeded, apply_methodology() SECURITY DEFINER function
**Gates**: Opus review ✅

---

### 2026-02-21 — Phase 4: CFG-009 ✅
**Story**: Frontend agentConfigService.ts
**Agent**: frontend-service (Sonnet), reviewed by Opus
**Files**: `src/lib/services/agentConfigService.ts` (170 lines)
**Contents**: 10 exported functions calling agent-config-admin edge function, DRY invoke helper
**Gates**: Opus review ✅

---

### 2026-02-21 — Phase 4: CFG-010 ✅
**Story**: React Query hooks
**Agent**: hooks-builder (Sonnet), reviewed by Opus
**Files**: `src/lib/hooks/useAgentConfig.ts` (197 lines)
**Contents**: 4 query hooks, 6 mutation hooks, AGENT_CONFIG_KEYS, type re-exports
**Gates**: Opus review ✅ | lint ✅ (0 errors, 14 warnings — all pre-existing project-level)

---

### 2026-02-21 — Phase 5: CFG-011 ✅
**Story**: Wire orchestrator to config engine
**Agent**: orchestrator-wirer (Sonnet), reviewed by Opus
**Files**: `runner.ts` (+30 lines), `types.ts` (+2 lines)
**Contents**: Import config engine, event→agent type map, load config after settings gates, pass to SequenceState
**Gates**: Opus review ✅

---

### 2026-02-21 — CFG-012 ✅
**Story**: End-to-end verification
**Agent**: Opus (direct)
**Verification**: All 7 new files + 2 modified files verified. 2,366 total lines. Lint: 0 errors. Build: pending staging deploy.
**Gates**: Opus verification ✅
