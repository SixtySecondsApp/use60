# Progress Log — Apify Integration (Ops Platform)

## Codebase Patterns
<!-- Reusable learnings from exploration -->

- **Credential storage**: `integration_credentials` table with `organization_id` + `provider` unique constraint, `credentials` JSONB column
- **Edge function auth**: JWT from Authorization header → `supabase.auth.getUser()` → org membership check via `organization_members`
- **CORS**: Always use `getCorsHeaders(req)` from `_shared/corsHelper.ts` — NOT legacy `corsHeaders`
- **Supabase import**: Pin to `@2.43.4`: `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'`
- **Frontend service**: Follow `apolloSearchService.ts` pattern — types → service class → export. Use `supabase.functions.invoke()` (NOT raw `fetch()`)
- **Config modal**: Follow `AiArkConfigModal.tsx` pattern
- **RLS for credentials**: Service-role-only via `public.is_service_role()`
- **RLS for org data**: `can_access_org_data(org_id)` for reads, `can_admin_org(org_id)` for writes
- **Dynamic tables**: 4-table hierarchy (tables → columns → rows → cells). Sync tracking via dedicated columns.
- **Cron jobs**: Wrapper functions calling edge functions via `pg_net.http_post()` with service role from `vault.decrypted_secrets`
- **Existing run-apify-actor**: Row-level enrichment function for dynamic table columns — DIFFERENT use case from bulk scraping pipeline
- **Staging deploy**: `npx supabase functions deploy <name> --project-ref caerqjzvuerejfrdtygb --no-verify-jwt`

## Key Decisions
- Use existing `integration_credentials` table (provider='apify') — NOT a new org_integrations table
- Apify results get dedicated tables (`apify_results`, `mapped_records`) since they're bulk data, not row-level enrichments
- Webhook endpoint needs `--no-verify-jwt` since Apify calls it externally
- Phase 1 webhook stores raw only; mapping pipeline added in Phase 2
- MCP is read-only for copilot; all writes go through pipeline edge functions

---

## Session Log

<!-- Entries added by 60/dev-run as stories complete -->

### 2026-02-09 — Phase 1 & 2 Complete

**Completed Stories (14/24):**

| Story | Title | Status |
|-------|-------|--------|
| APFY-001 | Core Apify tables migration | Done — deployed to staging |
| APFY-002 | Mapping engine tables migration | Done — deployed to staging |
| APFY-003 | apify-connect edge function | Done — deployed to staging |
| APFY-004 | apify-actor-introspect edge function | Done — deployed to staging |
| APFY-005 | apify-run-start edge function | Done — deployed to staging |
| APFY-006 | apify-run-webhook edge function | Done — deployed to staging |
| APFY-007 | apify-auto-map edge function | Done — deployed to staging |
| APFY-008 | ApifyConfigModal component | Done |
| APFY-009 | Apify card on Integrations page | Done |
| APFY-010 | JSON Schema dynamic form renderer | Done |
| APFY-011 | Apify Run Builder page | Done |
| APFY-012 | Apify Run History table | Done |
| APFY-013 | Shared transform functions | Done (in _shared/apifyTransforms.ts) |
| APFY-019 | Frontend service layer + hooks | Done |

**Database tables deployed to staging:**
- `actor_schema_cache` — cached actor input schemas (24h TTL)
- `apify_runs` — run tracking with status, cost, record counts
- `apify_results` — raw results with 30-day expiry
- `mapping_templates` — reusable field mappings (2 system templates seeded)
- `mapped_records` — processed/normalized records with GDPR flags

**Edge functions deployed to staging (5):**
- `apify-connect` — token validation, connect/disconnect/revalidate
- `apify-actor-introspect` — schema fetch + cache (24h TTL)
- `apify-run-start` — run orchestration with rate limiting
- `apify-run-webhook` — webhook handler for run completion
- `apify-auto-map` — heuristic field mapping generator

**Frontend files created:**
- `src/lib/services/apifyService.ts` — service layer
- `src/lib/hooks/useApifyIntegration.ts` — connection hook
- `src/components/integrations/ApifyConfigModal.tsx` — config modal
- `src/components/ops/ApifySchemaForm.tsx` — JSON Schema → form renderer
- `src/components/ops/ApifyRunBuilder.tsx` — actor selector + input form + start
- `src/components/ops/ApifyRunHistory.tsx` — run history table with detail expansion
- `src/pages/ApifyOpsPage.tsx` — main ops page (route: /ops/apify)

**Migration deployment note:** Used Supabase Management API (`https://api.supabase.com/v1/projects/{ref}/database/query`) since `supabase db push` had out-of-order migration timestamp issues.

### 2026-02-09 — Phase 2 & 3 Complete (All 24 Stories Done)

**Completed Stories (10/10 remaining):**

| Story | Title | Status |
|-------|-------|--------|
| APFY-014 | Mapping pipeline in webhook | Done — deployed to staging (resolvePath + applyTransform + GDPR checks) |
| APFY-015 | GDPR detection in pipeline | Done — integrated into APFY-014 (gdpr_check_record on mapped data) |
| APFY-016 | Mapping editor UI | Done (by frontend-agent) — ApifyMappingEditor.tsx + ApifyAutoMapReview.tsx |
| APFY-017 | Results Explorer | Done — ApifyResultsExplorer.tsx with pagination, filters, expandable rows |
| APFY-018 | Bulk actions | Done — ApifyBulkActions.tsx (CSV export, delete) + ApifyGdprConfirmDialog.tsx |
| APFY-020 | Copilot skills | Done (by backend-agent) |
| APFY-021 | MCP server connection | Done (by backend-agent) |
| APFY-022 | Cost tracking | Done (by frontend-agent) |
| APFY-023 | Purge cron | Done (by backend-agent) |
| APFY-024 | Ops page tab navigation | Done — 3 tabs: Run Builder, Run History, Results Explorer |

**Edge functions updated and deployed:**
- `apify-run-webhook` — now includes full mapping pipeline: load template → resolve paths → apply transforms → GDPR check → insert mapped_records → update status counts

**New frontend files created:**
- `src/components/ops/ApifyResultsExplorer.tsx` — paginated results table with dynamic columns, confidence badges, GDPR indicators, row selection, expandable detail, raw JSON viewer
- `src/components/ops/ApifyBulkActions.tsx` — floating action bar (CSV export, delete with confirmation)
- `src/components/ops/ApifyGdprConfirmDialog.tsx` — GDPR legal basis selector (legitimate interest, consent, contract)
- `src/components/ops/ApifyMappingEditor.tsx` — field mapping editor (by frontend-agent)
- `src/components/ops/ApifyAutoMapReview.tsx` — auto-map review UI (by frontend-agent)

**Updated files:**
- `src/lib/services/apifyService.ts` — added `listMappedRecords()`, `getRawResult()`, `ApifyMappedRecord` type
- `src/components/ops/ApifyRunHistory.tsx` — added `onViewResults` prop and "Results" button
- `src/pages/ApifyOpsPage.tsx` — full rewrite with Radix Tabs (builder/history/results), URL state via searchParams

**Build:** Clean (vite build passes, 36s)

