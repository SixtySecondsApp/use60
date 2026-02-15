# Progress Log — Standard Ops Tables

## Feature Summary
4 pre-built ops tables (Leads, Meetings, All Contacts, All Companies) with:
- Auto-provisioning on first Ops visit + template gallery
- Hybrid data: app data (Supabase) + CRM (HubSpot/Attio) real-time webhooks
- Fixed core columns (locked) + user-extensible
- Pre-wired automations (9 default rules)
- Copilot canonical awareness (can query/update standard tables)
- Sync health observability dashboard

## Codebase Patterns
- Ops tables use cell-based architecture (`dynamic_table_rows` + `dynamic_table_cells`)
- CRM webhooks already queued via `hubspot_sync_queue` / `attio_sync_queue`
- System views auto-generated via `systemViewGenerator.ts`
- Copilot skills loaded via `get_organization_skills_for_agent` RPC
- Standard tables detected BEFORE skill matching in copilot routing chain (Step 0)
- Conflict resolution uses last-writer-wins with `ops_sync_conflicts` audit trail

## Dependencies (v2)
- OPS-001 (templates) blocks OPS-002, OPS-003, OPS-006
- OPS-004 (clients template) blocks OPS-005, OPS-006
- OPS-006 (migration) depends on all other stories

---

## Phase 1 Session Log (SOT-001 through SOT-010) — All Complete

### 2026-02-15 — SOT-001 through SOT-010 ✅
All 10 original stories complete. See git history for details.

---

## Phase 2 Session Log (OPS-001 through OPS-006)

### 2026-02-20 — OPS-001 ✅
**Story**: Fix Leads source column + add Meetings lead_source template
**Files**: src/lib/config/standardTableTemplates.ts
**Agent**: Sonnet
**Changes**: source app_source_column external_source→booking_link_name, lead_source col added to Meetings at pos 12

---

### 2026-02-20 — OPS-004 ✅
**Story**: Add Clients standard table template + gallery UI
**Files**: src/lib/config/standardTableTemplates.ts, src/components/ops/StandardTablesGallery.tsx
**Agent**: Sonnet
**Changes**: CLIENTS_TABLE (10 cols, 3 views), Briefcase icon + nameMap in gallery

---

### 2026-02-20 — OPS-002 ✅
**Story**: Add meeting cross-ref to Leads backfill (meeting_held + recording + source fix)
**Files**: supabase/functions/backfill-standard-ops-tables/index.ts
**Agent**: Sonnet
**Changes**: Source fallback chain, batch meeting query, meeting_held derivation, recording URL

---

### 2026-02-20 — OPS-003 ✅
**Story**: Add lead_source lookup to Meetings backfill
**Files**: supabase/functions/backfill-standard-ops-tables/index.ts
**Agent**: Sonnet
**Changes**: Extended Step 4 query, leadSourceMap, lead_source cell with 'Direct' fallback

---

### 2026-02-20 — OPS-005 ✅
**Story**: Add backfillClients() to backfill edge function
**Files**: supabase/functions/backfill-standard-ops-tables/index.ts
**Agent**: Sonnet
**Changes**: New backfillClients() with deal cross-ref, handler routing for 'Clients'

---

### 2026-02-20 — OPS-006 ✅
**Story**: Write migration SQL for existing orgs + updated provision RPC
**Files**: supabase/migrations/20260220000001_source_tracking_and_clients_table.sql (new)
**Agent**: Sonnet
**Changes**: 5-section migration — source fix, meeting cols, lead_source, Clients table, replaced RPC with 5 tables

---

## Phase 2 COMPLETE — 6/6 stories ✅
