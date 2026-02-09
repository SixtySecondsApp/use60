# Progress Log — Ops: Edit Filters & Collect More Data

## Feature Context
Enable iterative data collection: create small Apollo list → review → edit filters → collect more leads into same table.

## Codebase Patterns
- Filters already persisted in `dynamic_tables.source_query` (JSONB)
- HubSpot toolbar buttons (OpsDetailPage:2114-2145) are the pattern for Apollo controls
- `copilot-dynamic-table` dedup logic (lines 253-427) must be shared, not duplicated
- Edge functions: `getCorsHeaders(req)`, pin `@supabase/supabase-js@2.43.4`
- Deploy to staging: `--no-verify-jwt`

## Key Files
- `src/components/ops/ApolloSearchWizard.tsx` — source for filter UI extraction
- `supabase/functions/copilot-dynamic-table/index.ts` — dedup + row insertion patterns
- `src/pages/OpsDetailPage.tsx` — integration point (line 2145+)
- `src/lib/services/opsTableService.ts` — updateTable needs source_query support

## Dependency Graph
```
OCM-001 (extract filter editor) ──┬──→ OCM-002 (filter sheet)  ──┐
                                  └──→ OCM-004 (collect modal)  ──┤
OCM-003 (edge function + dedup) ──→ OCM-005 (hook + deploy)    ──┤
                                                                  └──→ OCM-006 (wire into page)
```

---

## Session Log

### Session 2026-02-09

**OCM-001** ✅ — Extracted `ApolloFilterEditor.tsx` from `ApolloSearchWizard.tsx`. Exports constants (SENIORITY_OPTIONS, DEPARTMENT_OPTIONS, EMPLOYEE_RANGES, FUNDING_OPTIONS, APOLLO_LOCATIONS), sub-components (ChipSelect, TagInput, LocationTagInput), and the ApolloFilterEditor form component. Updated ApolloSearchWizard to import from the new file.

**OCM-003** ✅ — Created `supabase/functions/apollo-collect-more/index.ts` edge function. Full auth, dedup (source_ids + CRM contacts + fuzzy name matching), paginated Apollo search, row/cell insertion, row_count update, optional auto-enrichment. Uses `getCorsHeaders(req)` and pins `@supabase/supabase-js@2.43.4`.

**OCM-005** ✅ — Created `src/lib/hooks/useApolloCollectMore.ts` mutation hook. Wraps `supabase.functions.invoke('apollo-collect-more')`, invalidates ops-table and ops-table-data queries on success.

**OCM-002** ✅ — Created `src/components/ops/ApolloFilterSheet.tsx` side panel. Uses Sheet component, initializes local filter state from `table.source_query`, renders ApolloFilterEditor, saves to DB, has reset button.

**OCM-004** ✅ — Created `src/components/ops/ApolloCollectMoreModal.tsx` dialog modal. Filter summary chips, count presets (10/25/50/100), email/phone enrichment toggles, loading state, success/info toasts.

**OCM-006** ✅ — Created `src/components/ops/ApolloSourceControls.tsx` toolbar buttons. Extended `opsTableService.updateTable` to accept `source_query`. Wired into OpsDetailPage: imports, state, toolbar buttons (purple themed, apollo source_type only), ApolloFilterSheet and ApolloCollectMoreModal at bottom of component. Build passes.

**Remaining**: Deploy `apollo-collect-more` edge function to staging.
