# Progress Log — HubSpot Bi-Directional Sync

## Codebase Patterns

- HubSpot credentials: `hubspot_org_credentials` table, fetched via service role
- Edge functions must pin `@supabase/supabase-js@2.43.4` (esm.sh CDN issue)
- Staging deploy: `npx supabase functions deploy <name> --project-ref caerqjzvuerejfrdtygb --no-verify-jwt`
- Cell edits flow: OpsTableCell → OpsTable.handleCellEdit → OpsDetailPage.handleCellEdit → cellEditMutation
- Enrichment column styling pattern: `bg-violet-500/5` header, `bg-violet-500/[0.03]` cells
- Batch cell upserts: chunks of 500 with `onConflict: 'row_id,column_id'`
- Column metadata: `hubspot_property_name` field on `dynamic_table_columns`
- Row metadata: `source_id` (HubSpot contact ID), `source_data` (full object)
- Toast pattern: `toast.success(...)` / `toast.error(...)` from sonner
- React Query mutations with `onSuccess` callbacks for side effects

---

## Session Log

### BISYNC-001: Database Migration ✅
- Created `supabase/migrations/20260208000000_hubspot_bidirectional_sync.sql`
- Tables: `hubspot_sync_history` (with RLS), columns: `hubspot_removed_at` on rows, `hubspot_last_pushed_at` on cells
- Applied to staging project `caerqjzvuerejfrdtygb`

### BISYNC-002: Orange Left Border ✅
- Modified `src/components/ops/OpsTable.tsx`
- Added `hubspot_property_name` to Column interface, `hubspot_removed_at` to Row interface
- Orange left border (`border-l-4 border-l-orange-500/20`) on headers + cells when column has `hubspot_property_name`
- Removed row styling: `opacity-50 line-through` when `hubspot_removed_at` is set

### BISYNC-003: Sync Direction Setting ✅
- Modified `src/components/ops/HubSpotImportWizard.tsx` — sync direction toggle (pull_only/bidirectional)
- Modified `supabase/functions/import-from-hubspot/index.ts` — accepts & stores `sync_direction` in `source_query`
- Created `src/components/ops/HubSpotSyncSettingsModal.tsx` — edit sync direction for existing tables

### BISYNC-004: Push-Cell-to-HubSpot Edge Function ✅
- Created `supabase/functions/push-cell-to-hubspot/index.ts`
- Auth: validates JWT, checks org membership
- Guards: verifies table is hubspot + bidirectional, column has `hubspot_property_name`, row has `source_id`
- Action: PATCH `/crm/v3/objects/contacts/{source_id}`, updates `hubspot_last_pushed_at`

### BISYNC-005: Write-Back Hook ✅
- Created `src/lib/hooks/useHubSpotWriteBack.ts` — fire-and-forget push via `supabase.functions.invoke()`
- Modified `src/pages/OpsDetailPage.tsx` — injects write-back in `handleCellEdit` onSuccess callback
- Only triggers when table is hubspot, sync_direction is bidirectional, and column has hubspot_property_name

### BISYNC-006: Removed Contact Detection + Sync History ✅
- Modified `supabase/functions/sync-hubspot-ops-table/index.ts`
- Tracks all HubSpot contact IDs during pagination loop
- After sync: flags removed rows (`hubspot_removed_at`), un-flags returned rows
- Records sync history with snapshot (cell changes + row actions) in `hubspot_sync_history`
- Write-back loop prevention: skips cells where `hubspot_last_pushed_at > last_synced_at`
- Fixed pre-existing bugs: `SUPABASE_URL` → `supabaseUrl`, `authHeader` now properly declared
- Updated `src/lib/hooks/useHubSpotSync.ts` — toast shows removed/returned counts

### BISYNC-007: Sync History UI + Revert ✅
- Created `src/components/ops/HubSpotSyncHistory.tsx` — Sheet with last 20 syncs, revert button
- Created `supabase/functions/revert-hubspot-sync/index.ts` — restores cells, deletes added rows, reverses removal flags
- Modified `src/pages/OpsDetailPage.tsx` — Clock icon button opens sync history, wired up settings modal

## Build Status
- Vite build: ✅ Passes (37.66s)
- All 7 stories complete
