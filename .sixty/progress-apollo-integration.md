# Progress Log — Apollo Full Integration

## Feature: apollo-integration
**Plan**: `.sixty/plan-apollo-integration.json`
**Consult**: `.sixty/consult/apollo-full-integration.md`
**Detailed Spec**: Plan file at `~/.claude/plans/lucky-scribbling-bunny.md`

## Codebase Patterns
- Follow `hubspot_property` column pattern for `apollo_property` (migration, picker, service, cell rendering)
- Follow `run-reoon-verification` edge function pattern (concurrency limiter, fetchWithRetry, cell upsert)
- Follow `useEnrichment` hook pattern (optimistic updates, polling, auto-chaining)
- Cache Apollo response in `source_data.apollo` JSONB — "enrich once, column many"
- Deploy edge functions to staging with `--no-verify-jwt`
- Pin `@supabase/supabase-js@2.43.4` in edge function imports

## Session Log

### 2026-02-06 — APO-001 through APO-012 COMPLETE

**Phase 1: Per-Row Enrichment (APO-001 through APO-009)**
- APO-001: Migration `20260206100000_apollo_property_column.sql` — adds `apollo_property` column type + `apollo_property_name` field
- APO-002: Edge function `apollo-enrich/index.ts` — 26-field APOLLO_FIELD_MAP, cache in `source_data.apollo`, match by email > name+domain > linkedin
- APO-003: `ApolloPropertyPicker.tsx` — static field picker with 47 fields across 7 categories
- APO-004: `opsTableService.ts` — apolloPropertyName flows through addColumn
- APO-005: `AddColumnModal.tsx` — Apollo Property type with picker, credit toggles, run controls
- APO-006: `useApolloEnrichment.ts` — mutations for bulk/single/re-enrich with optimistic updates
- APO-007: `OpsDetailPage.tsx` — auto-trigger enrichment on column creation, handleEnrichRow, ColumnHeaderMenu
- APO-008: `OpsTableCell.tsx` + `OpsTable.tsx` — status badges, Apollo logo in column headers
- APO-009: Deployed to staging, migration applied via Supabase Management API

**Phase 2: Bulk Enrichment (APO-010)**
- Added Bulk People Enrichment API (`/v1/people/bulk_match`) for 10+ matchable rows
- Extracted `processEnrichResult()` helper, separate matchable/unmatchable upfront
- BULK_BATCH_SIZE = 10, concurrency limiter of 3 for bulk vs 5 for single

**Phase 3: Organization Enrichment (APO-011)**
- Migration `20260206200000_apollo_org_property.sql` — adds `apollo_org_property` column type
- Edge function `apollo-org-enrich/index.ts` — 22-field APOLLO_ORG_FIELD_MAP, cache in `source_data.apollo_org`
- ApolloPropertyPicker updated with 17 org enrichment fields
- Full wiring: OpsDetailPage, OpsTableCell, OpsTable, AddColumnModal, useApolloEnrichment

**Phase 4: Advanced Search (APO-012)**
- Added `person_seniorities`, `person_departments`, `q_organization_domains`, `contact_email_status` to edge function
- Created `ApolloSearchWizard.tsx` — 2-step wizard (search filters → preview & import)
- Added Apollo Search option to CreateTableModal
- Wired in OpsPage.tsx with full import flow

**All 12 stories complete. Feature: apollo-integration DONE.**

---
