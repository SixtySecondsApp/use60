# Consult Report: Profile → ICP → Campaign Pipeline
Generated: 2026-02-12

## User Vision

Full end-to-end pipeline:
1. **Company Profile** (Fact Profile) — structured research about your company
2. **Product/Service Profile** — dedicated profiles for each product/service, linked to company
3. **ICP Creation** — build ideal customer profile for a company or specific product
4. **Audience in Ops** — use ICP to search and create a prospect table
5. **Profile as Variable** — select a profile when writing sequences for richer copy
6. **Campaign Creation** — create campaign from audience table
7. **Campaign Send** — push to outreach tool (Instantly)

## Agent Findings

### Codebase Scout: What Exists

| Asset | Status | Location |
|-------|--------|----------|
| Fact Profile CRUD | Complete | `factProfileService.ts`, `useFactProfiles.ts`, 10+ components |
| Fact Profile Research | Complete | `research-fact-profile` edge function, 8 sections |
| Products/Services data | Minimal | JSONB section in `research_data.products_services` — just `products: string[], use_cases: string[], pricing_model: string, key_features: string[]` |
| ICP Profile CRUD | Complete | `icpProfileService.ts`, `useICPProfilesCRUD.ts`, `ICPProfileForm.tsx` |
| Fact → ICP conversion | Complete | `factProfileToICPCriteria()` in `icpToSearchParams.ts` |
| ICP → Search Params | Complete | `toApolloSearchParams()`, `toAiArkSearchParams()` |
| Prospecting Search | Complete | `prospecting-search` edge function, `useProspectingSearch` hook |
| Results → Ops Import | Complete | `ImportToOpsDialog`, `copilot-dynamic-table` edge function |
| ICP Scoring | Complete | `icpScoring.ts` — 8-dimension weighted scoring |
| ICP ↔ Profile Alignment | Complete | `icpFactProfileAlignment.ts` — 5-dimension alignment check |
| Sales Sequence Skill | Complete | `skills/atomic/sales-sequence/SKILL.md` |
| Product Profile entity | Missing | No table, no service, no components |
| ICP ↔ Product linking | Missing | ICP has no `product_profile_id` field |
| Profile context in skills | Missing | Sales sequence takes `offer_description` (string), not a profile reference |
| Audience → Campaign flow | Missing | No automated pipeline from Ops → Instantly campaign |

### Patterns Analyst: Conventions to Follow

1. **Entity creation**: Dialog → React Query mutation → Service → Supabase (follow `NewFactProfileDialog` pattern)
2. **Service registration**: Lazy singleton in `ServiceLocator.tsx`
3. **React Query hooks**: Hierarchical keys, optimistic updates, toast feedback
4. **Variable interpolation**: `{{nested.path}}` via `promptVariables.ts` — context interface needs `factProfile` + `productProfile`
5. **Multi-step wizards**: Step state + phase tracking (follow `CSVImportOpsTableWizard`)
6. **Cross-page handoff**: `sessionStorage` for prefill data
7. **Enrichment column mentions**: `@column_key` resolved from row data at runtime

### Risk Scanner: Identified Risks

| Severity | Risk | Mitigation |
|----------|------|------------|
| High | New `product_profiles` table needs migration + RLS policies | Follow `client_fact_profiles` migration pattern exactly |
| High | `icp_profiles` schema change — adding `product_profile_id` FK | Nullable FK, backward compatible, no breaking change |
| High | `enrich-dynamic-table` has no product context — enrichment prompts are generic | Add optional `product_id` to EnrichRequest; fetch product details and inject into prompts |
| High | `prospecting-search` doesn't emit product context to audience tables | Pass `product_profile_id` through search → import → `dynamic_tables.source_query` |
| Medium | `linked_icp_profile_ids` array on fact profiles has no cascade triggers — can go stale | Add DB trigger on ICP delete to clean array, or switch to proper FK join table |
| Medium | FK cascades could silently delete ICPs when fact profiles are deleted | Use `ON DELETE SET NULL` instead of CASCADE for new FKs; consider soft deletes |
| Medium | `sales-sequence` skill context injection — currently copilot passes `offer_description` as a string | Add optional `fact_profile_id` + `product_profile_id` to skill inputs; resolve to full context in edge function |
| Medium | Products/services research depth — current `ProductsServicesSection` is just string arrays | New `research-product-profile` edge function needed for deep product research |
| Medium | No explicit "Audience" or "Campaign" entity — implicit in dynamic_tables + instantly_campaign_links | For MVP, extend `dynamic_tables.source_query` with product/ICP metadata; full entities in Phase 6 |
| Low | Campaign creation flow complexity — Instantly API has quirks (timezone enum, required schedule) | Already solved in codebase (`instantly-push` edge function) |
| Low | Multiple products per company increases UI complexity | Tab/list pattern within FactProfileView — manageable |

### Scope Sizer: Recommended Breakdown

**Total Estimate**: 12–16 hours (with parallel execution)
**MVP Option**: Phases 1–3 only (6–8 hours) — gets product profiles + ICP linking working

---

## Synthesis & Conflicts

### Agreements (all agents align)
- Product profiles need to be first-class entities (not JSONB)
- ICP should optionally link to a product profile
- The existing conversion pipeline (fact → ICP → search → import) is solid and extensible
- Sales sequence skill needs a new optional input for profile context
- Follow existing patterns exactly (service locator, React Query hooks, explicit columns)

### Key Design Decision: Product Profile Architecture

**Option A: Separate `product_profiles` table**
- New table with FK to `client_fact_profiles`
- Own CRUD service, hooks, components
- Deep research via dedicated edge function
- Most flexible, cleanest separation

**Option B: Enhanced JSONB in fact profile**
- Expand `products_services` section to be richer
- Each product becomes a named object within the JSONB
- No new table, no migration
- Limited — can't independently reference a product in ICP or skills

**Recommendation: Option A** — The whole vision depends on products being first-class entities that ICPs and skills can reference independently.

### Data Model Design

```
client_fact_profiles (existing)
  ├── id, organization_id, company_name, research_data...
  │
  ├── product_profiles (NEW - one-to-many)
  │   ├── id, fact_profile_id (FK), organization_id
  │   ├── name, description, category
  │   ├── research_data (JSONB): {
  │   │     overview, target_market, value_propositions,
  │   │     pricing, competitors, use_cases, differentiators,
  │   │     pain_points_solved, key_features, integrations
  │   │   }
  │   ├── research_status, research_sources
  │   └── created_at, updated_at
  │
  └── icp_profiles (existing - MODIFIED)
      ├── fact_profile_id (NEW nullable FK)
      ├── product_profile_id (NEW nullable FK)
      └── ... existing fields
```

## Recommended Execution Plan

### Phase 1: Product Profile Foundation (Schema + Service + UI)

| # | Story | Type | Est. | Depends |
|---|-------|------|------|---------|
| 1 | Create `product_profiles` migration + RLS | schema | 30m | — |
| 2 | Add `fact_profile_id` + `product_profile_id` to `icp_profiles` migration | schema | 15m | — |
| 3 | Create `ProductProfile` types in `src/lib/types/productProfile.ts` | types | 15m | — |
| 4 | Create `productProfileService.ts` + register in ServiceLocator | service | 30m | #1, #3 |
| 5 | Create `useProductProfiles.ts` React Query hooks | hooks | 20m | #4 |

### Phase 2: Product Profile UI + Research

| # | Story | Type | Est. | Depends |
|---|-------|------|------|---------|
| 6 | Create `NewProductProfileDialog` component | frontend | 30m | #5 |
| 7 | Create `ProductProfileView` component (display all sections) | frontend | 45m | #5 |
| 8 | Create `ProductProfileCard` component (for listings) | frontend | 20m | #5 |
| 9 | Add product profiles tab/section to `FactProfileView` | frontend | 30m | #6, #7, #8 |
| 10 | Create `research-product-profile` edge function | backend | 45m | #1 |

### Phase 3: ICP ↔ Product Linking

| # | Story | Type | Est. | Depends |
|---|-------|------|------|---------|
| 11 | Update `ICPProfileForm` to optionally select a product profile | frontend | 30m | #2, #5 |
| 12 | Create `productProfileToICPCriteria()` conversion utility | utility | 30m | #3 |
| 13 | Update `CreateICPFromFactsButton` to offer company-level OR product-level ICP | frontend | 20m | #11, #12 |
| 14 | Update `icpFactProfileAlignment` to check against product profile | utility | 20m | #12 |

### Phase 4: Profile Context in Sales Sequence

| # | Story | Type | Est. | Depends |
|---|-------|------|------|---------|
| 15 | Add `fact_profile_id` + `product_profile_id` as optional inputs to sales-sequence skill | skill | 15m | #3 |
| 16 | Update `promptVariables.ts` to include `factProfile` + `productProfile` in context | utility | 20m | #3 |
| 17 | Create profile selector UI in copilot/sequence context | frontend | 30m | #5, #16 |
| 18 | Update `copilot-autonomous` to resolve profile context when skills reference it | backend | 30m | #15, #16 |

### Phase 5: Audience → Campaign → Send Pipeline

| # | Story | Type | Est. | Depends |
|---|-------|------|------|---------|
| 19 | Add "Create Campaign from Table" button to OpsDetailPage | frontend | 30m | — |
| 20 | Create campaign creation wizard (name, schedule, sender account selection) | frontend | 45m | #19 |
| 21 | Wire wizard to `instantly-push` edge function for campaign creation + lead upload | backend | 30m | #20 |
| 22 | Add profile selector to campaign wizard (for sequence generation context) | frontend | 20m | #17, #20 |

### Parallel Opportunities

| Group | Stories | Time Saved |
|-------|---------|------------|
| Schema + Types | #1, #2, #3 in parallel | 30m |
| Service + Hooks | #4, #5 sequential but parallel with UI design | — |
| Product UI trio | #6, #7, #8 in parallel | 40m |
| ICP linking | #11, #12 in parallel | 20m |
| Profile context | #15, #16 in parallel | 15m |
| Campaign flow | #19–#22 parallel with Phase 4 | 45m |

## Decisions (Confirmed)

1. **Multiple products per company?** — YES. One-to-many relationship (product_profiles.fact_profile_id FK).
2. **Product research depth** — AI-powered web research via `research-product-profile` edge function (Gemini primary).
3. **Campaign send authorization** — Stop at "campaign created in Instantly" — user sends manually in Instantly.

## Execution Plan

Generated: `.sixty/plan-profile-icp-campaign-pipeline.json` (22 stories, 5 phases)

| Phase | Stories | Estimate |
|-------|---------|----------|
| 1. Foundation (schema + service + hooks) | PIPE-001 → 005 | 2h |
| 2. Product UI + Research | PIPE-006 → 010 | 3h |
| 3. ICP ↔ Product Linking | PIPE-011 → 014 | 2h |
| 4. Profile Context in Skills | PIPE-015 → 018, 022 | 2.5h |
| 5. Campaign Pipeline | PIPE-019 → 021 | 2h |

**Total: ~11.5h sequential, ~8-9h with parallel execution**
**MVP (Phases 1-3): ~7h**
