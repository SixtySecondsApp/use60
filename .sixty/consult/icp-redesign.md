# Consult Report: ICP Page Redesign + Ops Integration
Generated: 2026-02-15

## User Request
"Redesign the ICP page to work well with Ops. Support ICPs for companies (Ideal Customer Profile) and products/services (Ideal Buyer Profile). Simplify lifecycle, enable CRM search from Ops tables, differentiate net-new vs uncontacted leads."

## Clarifications

| # | Question | Answer |
|---|----------|--------|
| 1 | What should "Company ICP" and "Product/Service ICP" define? | **ICP** = ideal customer (company-level). **IBP** = ideal buyer profile for a specific product/service. Rename across all Profile features. |
| 2 | How should ICPs connect to Ops? | **A + B**: Each ICP gets a persistent Ops table that accumulates results over time AND results feed into standard Leads/Contacts/Companies tables with source tagging. |
| 3 | Where should search/prospecting live? | Move to Ops (since results end up there). |
| 4 | How important is the approval workflow? | Over-engineered. Simplify to `active / archived` only. |
| 5 | What providers/actions matter? | Run ICP search directly from Ops tables. Search the CRM too. Differentiate net-new leads from uncontacted leads (check lead stage + deal associations). |

---

## Codebase Findings

### What Exists Today

| Category | Asset | Location |
|----------|-------|----------|
| Page | ProfilesPage (3 tabs: Business, Companies, ICPs) | `src/pages/ProfilesPage.tsx` |
| Components | ProspectingTab, ICPProfileGrid, ICPProfileCard, ICPProfileForm, ProviderSelector, SearchResultsPreview, ImportToOpsDialog, SearchHistoryPanel | `src/components/prospecting/` |
| Types | ICPProfile, ICPCriteria, ICPSearchHistoryEntry, CreateICPProfilePayload, UpdateICPProfilePayload | `src/lib/types/prospecting.ts` |
| Service | icpProfileService (CRUD + duplicate + search history) | `src/lib/services/icpProfileService.ts` |
| Hooks | useProspectingSearch, useApolloIntegration, useAiArkIntegration | `src/lib/hooks/` |
| Utilities | factProfileToICP, productProfileToICP, icpScoring, icpSearchParamMapper | `src/lib/utils/` |
| DB | `icp_profiles`, `icp_search_history`, `icp_profile_versions` | `supabase/migrations/20260211*` |
| Edge Functions | `prospecting-search` | `supabase/functions/prospecting-search/` |
| Ops Tables | `dynamic_tables`, `dynamic_table_columns`, `dynamic_table_rows`, `dynamic_table_cells` | Ops system |
| Standard Tables | Leads, Meetings, All Contacts, All Companies | `src/lib/config/standardTableTemplates.ts` |
| CRM Sync | standardTableSync.ts (HubSpot/Attio webhook -> standard tables) | `supabase/functions/_shared/` |
| Import Bridge | ImportToOpsDialog (creates throwaway custom tables) | `src/components/prospecting/ImportToOpsDialog.tsx` |
| Route | `/profiles` -> `ProfilesPage` | `src/lib/routes/routeConfig.ts:269` |

### Gaps Identified

1. **No persistent ICP-to-table link** -- Import creates a new table each time with no back-reference
2. **No profile_type column** -- `icp_profiles` doesn't distinguish ICP (company) from IBP (product/service)
3. **No CRM search capability** -- search only hits external providers (Apollo, AI Ark), not internal contacts/companies/deals tables
4. **No source tagging** -- when results import to Ops, there's no `source_icp_id` or `lead_origin` column to track which ICP sourced them
5. **No net-new vs uncontacted** -- no dedup against existing CRM data before showing results
6. **Status bloat** -- 6-stage lifecycle (`draft -> testing -> pending_approval -> approved -> active -> archived`) with no profiles ever leaving "draft"
7. **Naming inconsistency** -- everything says "ICP" even for product-level buyer profiles

### Patterns to Follow

| Pattern | Example | Rule |
|---------|---------|------|
| React Query for server state | `useQuery(['icp-profiles', orgId], ...)` | All DB calls through RQ hooks |
| Zustand for UI state | `useOrgStore` | Persist with localStorage middleware |
| Service layer | `icpProfileService.ts` | Explicit column selection, typed payloads |
| Edge functions | `prospecting-search` | JWT auth, getCorsHeaders, service role only when justified |
| Ops table creation | `copilot-dynamic-table` | `source_type` + `source_query` JSONB |
| Standard table sync | `standardTableSync.ts` | Column mappings per CRM, conflict resolution |
| Form modals | `ICPProfileForm.tsx` | Multi-section collapsible, tag inputs |
| Nav items | `routeConfig.ts` | `{ path, icon, showInNav, navSection, order, displayGroup }` |

### Risks

| Severity | Risk | Mitigation |
|----------|------|------------|
| High | Migration adds `profile_type` to `icp_profiles` -- existing rows need default | Default to `'icp'` for existing rows |
| High | Status simplification -- existing `draft` profiles need migration to `active` | Migration: `UPDATE icp_profiles SET status = 'active' WHERE status IN ('draft','testing','pending_approval','approved')` |
| Medium | Renaming "ICP" to "ICP/IBP" across UI strings, types, service, and edge functions | Phased: rename UI labels first, keep DB column names stable |
| Medium | CRM search needs new edge function or RPC to query contacts/companies with ICP criteria | New `search-crm-with-icp` edge function |
| Medium | Net-new detection needs dedup logic (email match against contacts, domain match against companies) | Implement as server-side filter in search edge function |
| Low | Persistent ICP table could grow large over time | Add row limit or pagination, archival policy |

---

## Recommended Execution Plan

### Architecture Overview

```
BEFORE:
  Profiles Page -> ICPs tab -> Search -> Import to NEW Ops table (throwaway)

AFTER:
  Profiles Page -> ICP / IBP tabs -> Define targeting criteria
       |
       v
  Ops Page -> "Find More" button on any table -> Select ICP/IBP -> Search
       |
       ├── External search (Apollo, AI Ark)
       ├── CRM search (internal contacts/companies)
       └── Results -> Append to SAME table (persistent)
                  -> Tag in standard Leads/Contacts tables
```

### Story Breakdown

| # | Story | Type | Files | Parallel |
|---|-------|------|-------|----------|
| 1 | **Add `profile_type` column + simplify status** | migration | 1 migration | -- |
| 2 | **Rename ICP -> ICP/IBP across types and service** | types + service | `prospecting.ts`, `icpProfileService.ts`, UI strings | -- |
| 3 | **Redesign ProfilesPage with ICP/IBP sections** | frontend | `ProfilesPage.tsx`, `ICPProfileForm.tsx`, `ICPProfileGrid.tsx`, `ICPProfileCard.tsx` | with #2 |
| 4 | **Add `linked_table_id` to `icp_profiles` + auto-create Ops table** | migration + service | 1 migration, `icpProfileService.ts`, edge function | after #1 |
| 5 | **Build "Find More" action on Ops table** | frontend | New `FindMoreSheet.tsx` in `src/components/ops/`, `OpsTablePage.tsx` toolbar | after #4 |
| 6 | **Build CRM search endpoint** | backend | New `search-crm-with-icp` edge function | with #5 |
| 7 | **Net-new vs uncontacted lead classification** | backend | Update `prospecting-search` + new dedup RPC | after #6 |
| 8 | **Source tagging in standard tables** | migration + backend | Add `source_icp_id` column to Ops rows, update ImportToOpsDialog | after #4 |
| 9 | **Persistent table append (replace throwaway import)** | frontend + backend | Rework ImportToOpsDialog -> AppendToTableDialog | after #4, #8 |
| 10 | **Wire search from Ops page** | frontend | Connect FindMoreSheet -> search providers + CRM search -> append results | after #5, #6, #9 |

### Phase 1: Foundation (Stories 1-2)

**Story 1: Migration -- `profile_type` + status simplification**

```sql
-- Add profile_type column (icp = company targeting, ibp = buyer persona for product/service)
ALTER TABLE icp_profiles ADD COLUMN profile_type TEXT NOT NULL DEFAULT 'icp'
  CHECK (profile_type IN ('icp', 'ibp'));

-- Simplify status: collapse everything to active/archived
UPDATE icp_profiles SET status = 'active'
  WHERE status IN ('draft', 'testing', 'pending_approval', 'approved');
-- Keep 'archived' as-is

-- Constrain to new values only
ALTER TABLE icp_profiles DROP CONSTRAINT IF EXISTS icp_profiles_status_check;
ALTER TABLE icp_profiles ADD CONSTRAINT icp_profiles_status_check
  CHECK (status IN ('active', 'archived'));
```

**Story 2: Rename across types/service/UI**

- `ICPProfile.status` type: `'draft' | 'testing' | ... | 'archived'` -> `'active' | 'archived'`
- Add `profile_type: 'icp' | 'ibp'` to ICPProfile type
- UI labels: "Ideal Customer Profile" for company-level, "Ideal Buyer Profile" for product/service-level
- Tab names on Profiles page: "Customer Profiles" | "Buyer Profiles" (replace single "ICPs" tab)
- Form: add profile_type selector at top
- Grid: filter by profile_type

### Phase 2: Ops Bridge (Stories 4, 8)

**Story 4: Persistent ICP-to-table link**

```sql
-- Link ICP to its persistent Ops table
ALTER TABLE icp_profiles ADD COLUMN linked_table_id UUID REFERENCES dynamic_tables(id);
```

When creating an ICP/IBP, auto-create an Ops table with:
- `source_type: 'icp'`
- `source_query: { icp_profile_id: '<uuid>' }`
- Standard columns based on profile_type (company columns for ICP, person columns for IBP)
- Set `linked_table_id` on the ICP profile

**Story 8: Source tagging**

Add `source_icp_id` to `dynamic_table_rows` so every row knows which ICP search produced it. When appending to standard tables (Leads, All Contacts, All Companies), include the ICP source as metadata.

### Phase 3: Search from Ops (Stories 5, 6, 7)

**Story 5: "Find More" button on Ops table toolbar**

- Sheet slides out from right side of Ops table
- Shows linked ICP/IBP criteria summary
- Provider selector (Apollo, AI Ark, CRM, All)
- "Search" button -> results preview -> "Add X rows to table"
- Results append to the same table (not create new)

**Story 6: CRM search endpoint**

New edge function `search-crm-with-icp`:
- Takes ICP criteria
- Queries `contacts` table with matching: industry (via company), title keywords, seniority, location
- Queries `companies` table with matching: industry, employee count, revenue, tech stack
- Returns results with `lead_origin: 'crm'` tag

**Story 7: Net-new vs uncontacted classification**

For each search result:
- Check if email exists in `contacts` table -> if yes, mark as `existing`
- Check if company domain exists in `companies` table -> if yes, check for deals:
  - Has active deal -> `existing_with_deal`
  - No deal, has activities -> `contacted_no_deal`
  - No deal, no activities -> `uncontacted`
- If neither -> `net_new`

This becomes a `lead_classification` column in results, filterable in the Ops table.

### Phase 4: Full Integration (Stories 9, 10)

**Story 9: Replace throwaway import with persistent append**

- Remove "Import to New Table" flow
- Replace with "Add to [Table Name]" that appends rows to the ICP's linked table
- Dedup by email/domain before appending
- Also push to standard Leads/Contacts tables with `source_icp_id` tag

**Story 10: Wire it all together**

- Ops table toolbar shows "Find More" when table has a linked ICP
- Search results show `lead_classification` badges (Net New / Uncontacted / Existing)
- Filter controls for classification
- Batch actions: "Add all net-new to table", "Add uncontacted only"

---

## MVP Suggestion

**Stories 1-5 only** -- gets the core value:
- ICP/IBP distinction with simplified lifecycle
- Persistent table per profile
- "Find More" from Ops table using external providers

Defer CRM search (Story 6-7) and net-new classification to Phase 2.

---

## Key Decisions Made

1. **Keep `icp_profiles` table name** -- don't rename to avoid migration complexity. Add `profile_type` column instead.
2. **Profile types**: `icp` (company targeting) and `ibp` (product/service buyer targeting) -- not separate tables.
3. **One persistent Ops table per ICP/IBP** -- auto-created, accumulates results over time.
4. **Status simplified to `active` / `archived`** -- no approval workflow.
5. **Search moves to Ops** -- ICP page is for defining criteria, Ops is for finding and managing results.
6. **CRM search is a separate edge function** -- keeps external provider search and internal CRM search cleanly separated.
7. **Lead classification computed server-side** -- dedup and classification happen in the search edge function, not the frontend.
