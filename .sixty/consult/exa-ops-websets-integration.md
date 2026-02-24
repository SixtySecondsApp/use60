# Consult Report: Exa Search + Websets as Core Ops Engine
Generated: 2026-02-11

## User Request
"Lets integrate Exa search and exa websites into ops... Plan the best integration possible and make Exa a powerful feature of ops... I love their websets feature."

## Decision
Websets-first architecture for list building and continuous monitoring, with classic Exa Search as fast fallback and targeted single-entity research path.

---

## Initial Findings

### What already exists in this repo
- Exa search integration exists in `supabase/functions/_shared/exaSearch.ts` and is used by `supabase/functions/deep-enrich-organization/index.ts` when `research_provider = 'exa'`.
- Provider control exists via `src/lib/hooks/useResearchProvider.ts` but currently supports only `'gemini' | 'exa' | 'disabled'`.
- Ops flows (`enrich_table_column`, `enrich_contact`, `enrich_company`) are mostly Gemini/LLM-centric and do not expose Websets.
- Copilot autonomous tool registry currently favors Gemini research paths and does not expose a first-class Websets tool flow.

### Gaps
- No Exa Websets API client module.
- No preview-first UX (`/websets/v0/websets/preview`) before committing expensive searches.
- No webhook ingestion pipeline for `webset.item.created` / `webset.item.enriched` / idle events.
- No monitor scheduling for continuous refresh into ops tables.
- No provider enum or execute_action contract for `exa_websets`.

---

## Exa Guide Takeaways (Applied to this Plan)

### Websets operating model
- Websets are asynchronous and event-driven; items can be consumed as they arrive, not just after completion.
- Recommended flow: preview query decomposition, create Webset, monitor status, list/paginate items, then export/consume full set at idle.
- Monitors allow scheduled refresh with search or refresh behavior and timezone-aware cron.

### API features to prioritize
1. `POST /websets/v0/websets/preview` for user confidence and query debugging.
2. `POST /websets/v0/websets` for creation (search + criteria + enrichments).
3. `GET /websets/v0/websets/{id}` and `/items` for progress + partial results.
4. Webhooks with HMAC SHA256 signature verification (`Exa-Signature`) for reliable event ingestion.
5. Monitors for continuous "always-fresh" prospecting datasets.

### Rate-limit implications
- Search endpoints have lower QPS than contents; batching/queueing and retry strategy are required.
- Ops bulk workflows must use bounded concurrency and job orchestration (not naive fan-out).

---

## Recommended Architecture (Best Integration)

## 1) Add a unified research provider layer
- Create `supabase/functions/_shared/researchProviders.ts`.
- Normalize provider selection and return shape across:
  - `gemini`
  - `exa_search`
  - `exa_websets`
  - `agent_team` (existing path support)

Why: avoid provider branching duplicated across `deep-enrich-organization`, copilot adapters, and ops enrichment functions.

## 2) Build a dedicated Exa Websets shared module
- Create `supabase/functions/_shared/exaWebsets.ts` with:
  - `previewWebset(params)`
  - `createWebset(params)`
  - `getWebset(id)`
  - `listWebsetItems(id, cursor?)`
  - `waitUntilIdle(id, timeoutMs, pollIntervalMs)`
  - helper mappers from Webset items to ops row payloads.

Why: keeps Exa transport and mapping logic centralized and reusable.

## 3) Add Websets orchestration edge functions
- `supabase/functions/ops-webset-preview/index.ts`
- `supabase/functions/ops-webset-create/index.ts`
- `supabase/functions/ops-webset-status/index.ts`
- `supabase/functions/ops-webset-materialize/index.ts`

Responsibilities:
- Validate auth + org membership.
- Convert user intent (query, criteria, enrichments, count) into Exa payload.
- Persist run metadata and progress.
- Materialize Webset results into `dynamic_tables` safely and idempotently.

## 4) Add webhook receiver + event persistence
- `supabase/functions/exa-websets-webhook/index.ts`
- Verify `Exa-Signature` using raw request body + HMAC SHA256.
- Persist events into a new table (`exa_webset_events`) for observability and replay.
- Update job state table (`exa_webset_runs`) and trigger incremental materialization.

Why: real-time updates and reliability for long-running Websets.

## 5) Add monitor-driven freshness
- Add monitor management path (`create/list/update`) for recurring list refreshes.
- Attach monitor configs to a run/table mapping (e.g. "refresh weekly every Monday 9am in org timezone").

Why: turns ops lists from static snapshots into continuously updated lead intelligence assets.

## 6) Make copilot + skills truly Websets-native
- Extend `execute_action` with:
  - `preview_ops_webset`
  - `create_ops_webset`
  - `get_ops_webset_status`
  - `materialize_ops_webset_to_table`
  - `create_ops_webset_monitor`
- Add structured responses:
  - `ops_webset_preview`
  - `ops_webset_status`
  - `ops_webset_results`
- Add/upgrade skills:
  - `ops-webset-builder`
  - `ops-enrichment-manager` (Websets branch)
  - `seq-ops-prospect-pipeline` (Websets-first)

Why: Websets should be a top-tier copilot primitive, not a hidden backend-only option.

---

## Product UX Recommendation (Power Feature Positioning)

### "Webset Studio" in Ops
- Step 1: Prompt query.
- Step 2: Preview decomposition (entity + criteria + candidate enrichments).
- Step 3: Confirm and launch.
- Step 4: Live stream rows + enrichment columns as events arrive.
- Step 5: Save as monitored source (optional recurring refresh).

This is the strongest UX embodiment of Exa in ops because it combines discoverability, trust, and automation.

---

## Risks and Mitigations

| Severity | Risk | Mitigation |
|---|---|---|
| High | Bulk requests can exceed Exa limits | Queue + bounded concurrency + retry/backoff + partial commits |
| High | Webhook spoofing risk | Enforce Exa-Signature HMAC verification with timestamp freshness checks |
| Medium | Provider behavior divergence across functions | Centralize logic in `researchProviders.ts` |
| Medium | Ambiguous result quality for loose criteria | Enforce preview/confirm workflow before create |
| Medium | User confusion between criteria and enrichments | Add explicit UX split and helper text in Webset Studio |
| Low | Increased complexity in copilot actions | Introduce incremental structured response types with fallback text mode |

---

## Recommended Rollout

### Phase A (Foundation)
- Shared module + provider layer + run/event schema + secure webhook endpoint.

### Phase B (MVP UX + Copilot)
- Preview/create/status/materialize actions + core responses + one Webset builder skill.

### Phase C (Ops Deep Integration)
- Dynamic table ingestion at scale, enrichment mapping presets, and pipeline sequences.

### Phase D (Always-on Intelligence)
- Monitor scheduling, refresh policies, stale-row replacement strategy, usage/cost analytics.

---

## Open Product Decisions (Non-blocking but important)
1. Should `research_provider` be global (`app_settings`) or org-scoped?
2. Should Websets materialize into existing tables or create separate "source-owned" tables by default?
3. Should monitor refresh append only, upsert by domain, or replace stale rows?
4. Should we expose per-org Exa usage quotas and soft limits in UI?

---

## Best Immediate Next Step
Implement Phase A + B first (preview/create/status/materialize + webhook verification), then wire into `seq-ops-prospect-pipeline` so users feel Exa value in one end-to-end flow immediately.
