# Progress Log — ICP Redesign + Ops Integration

## Key Decisions
- **DO NOT rename `icp_profiles` table** — 213 file refs, 5 migrations, RLS policies. Add columns only.
- Profile types: `icp` (company) / `ibp` (product buyer) — same table, new column
- Status: `active` / `archived` only — no approval workflow
- Each profile gets a persistent linked Ops table
- Search moves to Ops via "Find More" sheet

## Dependency Graph
```
ICP-001 (schema: profile_type + status)
  ├── ICP-002 (types + service)  ──┐
  │     └── ICP-003 (UI redesign)  │
  └── ICP-004 (schema: linked_table) ──┤
        └── ICP-005 (auto-create table) ┘
              └── ICP-006 (Find More sheet)
                    └── ICP-007 (CRM search)
                          └── ICP-008 (lead classification)
              └── ICP-009 (persistent append)
                          └── ICP-010 (wire end-to-end)
```

## Parallel Opportunities
- ICP-002 + ICP-004 can run in parallel after ICP-001
- ICP-006 + ICP-007 can run in parallel after ICP-005

---

## Session Log

### 2026-02-15 — Full Feature Implementation ✅

**Team**: Opus manager + 3 Sonnet workers
**Duration**: ~30 min wall clock
**Stories**: 10/10 complete

| Story | Title | Worker | Status |
|-------|-------|--------|--------|
| ICP-001 | Migration: profile_type + status simplification | worker-1 | ✅ |
| ICP-002 | Types, service, hooks for profile_type | worker-1 | ✅ |
| ICP-003 | Profiles page UI redesign | worker-1 | ✅ |
| ICP-004 | Migration: linked_table_id + source tagging | worker-1 | ✅ |
| ICP-005 | Auto-create linked Ops table | worker-1 | ✅ |
| ICP-006 | Find More sheet on Ops page | worker-1 | ✅ |
| ICP-007 | CRM search edge function | worker-2 + lead | ✅ |
| ICP-008 | Lead classification (net_new/uncontacted/etc) | worker-3 | ✅ |
| ICP-009 | Persistent table append with dedup | worker-1 | ✅ |
| ICP-010 | End-to-end wiring with filters + batch actions | worker-1 | ✅ |

**Key Files Created/Modified**:
- `supabase/migrations/20260215100001_icp_profile_type_and_status_simplification.sql`
- `supabase/migrations/20260215100002_icp_linked_table_and_source_tagging.sql`
- `supabase/functions/search-crm-with-icp/index.ts` (new)
- `supabase/functions/_shared/classifyLeadStatus.ts` (new)
- `src/components/ops/FindMoreSheet.tsx` (new)
- `src/lib/types/prospecting.ts`
- `src/lib/services/icpProfileService.ts`
- `src/components/prospecting/ICPProfileGrid.tsx`
- `src/components/prospecting/ICPProfileCard.tsx`
- `src/components/prospecting/ICPProfileForm.tsx`
- `src/pages/OpsDetailPage.tsx`
- `supabase/functions/prospecting-search/index.ts`
