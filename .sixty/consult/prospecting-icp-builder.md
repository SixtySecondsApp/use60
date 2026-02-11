# Consult Report: Prospecting & ICP Builder
Generated: 2026-02-11

## User Request
"As a business we have a managed service where we have to identify and collect data for a client's ICP and there seems to be an issue on getting the audience profile correct and/or finding the right profiles. We have integrations into AI Ark and Apollo and we also have Ops and the new company research skill. Can we create a Prospecting feature to help the team find the best audience for the client and create the audience profile and test initial searches with data tools to see if the prospects are correct and then save the ICP profiles or edit them."

## Clarifications
- **Q**: Who will use this feature?
- **A**: Both team and clients can build ICPs. Multi-tenant from day one but internal-only access initially.
- **Q**: Where should it live?
- **A**: New top-level `/prospecting` page
- **Q**: What happens with search results?
- **A**: Preview first, then one-click import to Ops table
- **Q**: Access model?
- **A**: Multi-tenant infrastructure from day one (client role, visibility columns, RLS) but restrict to internal team initially
- **Q**: Scope?
- **A**: All 6 phases — full feature

## Existing Assets Found

### Apollo Integration (Full)
- **Edge Functions**: `apollo-search`, `apollo-org-enrich`, `apollo-credits`, `apollo-enrich`, `apollo-collect-more`, `parse-apollo-query`
- **Service**: `apolloSearchService.ts` — `searchAndCreateTable()`, `searchApollo()`
- **Hooks**: `useOpsTableSearch`, `useApolloIntegration`, `useApolloEnrichment`, `useApolloCollectMore`
- **UI**: `ApolloSearchWizard`, `ApolloFilterEditor`, `ApolloSourceControls`, `ApolloCollectMoreModal`
- **Types**: `ApolloSearchParams`, `NormalizedContact`, `ApolloSearchResult`

### AI Ark Integration (Full)
- **Edge Functions**: `ai-ark-search`, `ai-ark-similarity`, `ai-ark-semantic`, `ai-ark-enrich`, `ai-ark-credits`
- **Service**: `aiArkSearchService.ts` — `searchAndCreateTable()`, `searchCompanies()`, `searchPeople()`
- **Hooks**: `useAiArkIntegration`
- **Types**: `AiArkCompanySearchParams`, `NormalizedAiArkCompany`, `AiArkCompanySearchResult`

### ICP Generation (Exists but Ephemeral)
- **Edge Function**: `generate-icp-profiles` — AI-generates Apollo-compatible ICP profiles from org data
- **Hook**: `useICPProfiles` — Fetches + regenerate
- **UI**: `ICPProfileSelector` — Card-based selection
- **Cache**: 24h in `organization_context`, 5min client-side
- **Output**: `ICPProfile` with `name`, `description`, `emoji`, `filters: ApolloSearchParams`, `filter_count`, `rationale`
- **Valid enums**: seniority (10), departments (13), employee ranges (10), funding stages (10)

### Ops Tables (74 Components, Production-Ready)
- **Service**: `opsTableService.ts` (1832 lines) — full CRUD, views, recipes, AI query, workflows
- **Pipeline**: `copilot-dynamic-table` handles search → table creation
- **Import paths**: Apollo→Ops, AI Ark→Ops, HubSpot→Ops, CSV→Ops, Ops→Ops
- **Tables**: `dynamic_tables`, `dynamic_table_columns`, `dynamic_table_rows`, `dynamic_table_cells`, `dynamic_table_views`

### Company Research
- **Skill**: `skills/atomic/company-research/`
- **Edge Functions**: `enrich-company`, `enrich-crm-record`, `deep-enrich-organization`, `apollo-org-enrich`, `apify-linkedin-enrich`

## Risks Identified

### CRITICAL
1. **No `icp_profiles` table** — Cannot store/manage ICP definitions. Must be first migration.
2. **No credit tracking in search edge functions** — `apollo-search` and `ai-ark-search` never call `deduct_credits()`. Test searches burn real API credits with zero accounting.
3. **No transaction safety in table creation** — Failed imports leave orphaned tables that block retries.

### HIGH
4. **No `client` role in org memberships** — Need to add role + RLS policies for multi-tenant.
5. **Auth token in request body** — `apolloSearchService` sends JWT in body as workaround. ICP Builder should use `supabase.functions.invoke()` instead.

### MEDIUM
6. **AI Ark has no free balance endpoint** — Can't show credits without burning ~2.5 credits per check.
7. **Env variable API key fallback** — Platform shared key used when org key missing. Should require org-level key.
8. **No cross-source deduplication** — Apollo + AI Ark results for same ICP may overlap.
9. **No import path from dynamic_table_cells to contacts/companies** — Need field mapping + merge strategy.
10. **`apollo-search` uses legacy CORS** — New functions must use `corsHelper.ts`.

### LOW
11. **Pagination inconsistency** — Apollo 1-based, AI Ark 0-based.
12. **`dynamic_tables.source_type` missing 'prospecting'** — Need to add to constraint.
13. **`companies.size` CHECK constraint** — Must map numeric employee counts to enum values.

## Architecture Decisions

### Multi-Tenant Infrastructure (Day One)
- Add `client` role to `organization_memberships` (or use existing 'readonly' as equivalent)
- Add `visibility` column to `icp_profiles`: `'team_only' | 'shared' | 'client_visible'`
- RLS policies filter by role + visibility
- Internal-only flag on `/prospecting` route (using existing `InternalRouteGuard`)
- Future: swap to org-level route guard when ready for client access

### Credit Model
- Pass-through API costs tracked in `credit_transactions` ledger
- Show estimated cost before search execution
- Cache AI Ark balance from `x-credit` response headers (no probe calls)

### Search Strategy
- Unified search interface supporting both Apollo and AI Ark
- Apollo for people/contact searches (name, title, email, phone)
- AI Ark for company searches (lookalike, semantic, firmographic)
- Both for comparison searches (same ICP, two providers, compare results)

## Final Recommendation
Full 18-story plan across 6 phases. See `.sixty/plan-prospecting-icp-builder.json`.
