# Consult Report: Org Fact Profile & Client Profiles
Generated: 2026-02-12

## User Request
> On onboarding, the research should create the fact profile for the ORG (their business) and assign as their business. The user should also be able to create client profiles or secondary profiles that are not used in the org's variables and context.

## Clarifications

| Question | Answer |
|----------|--------|
| Onboarding integration | Integrate into existing signup flow |
| Client profile linking | Standalone + optionally linkable to Contacts, Deals, Companies |
| Org profile data usage | Feeds everything: templates, copilot context, org variables, personalization |
| Edit location | Both fact profile view AND Settings > Company Profile |
| CRM linking | Contacts + Deals + Companies |

---

## Current Architecture

### Data Flow Today (Disconnected)

```
Onboarding V2:
  Website/Email → scrape → organization_enrichment → organization_context → skill compilation
                                                                              ↓
                                                                        ${variables} in skills

Fact Profiles (Separate):
  Manual create → research-fact-profile → client_fact_profiles → View/Share/Export
```

### Proposed Data Flow (Connected)

```
Onboarding V2:
  Website/Email → scrape → organization_enrichment → AUTO-CREATE fact profile (is_org_profile=true)
                                                          ↓
                                                    research-fact-profile (deep research)
                                                          ↓
                                                    SYNC → organization_context → skill compilation
                                                                                      ↓
                                                                                ${variables} in skills

Client Profiles (Separate, NOT in org context):
  Manual create → research-fact-profile → client_fact_profiles (is_org_profile=false)
                                              ↓ (optional)
                                         Link to Contact/Deal/Company
```

---

## Existing Assets

| Asset | Path | Relevance |
|-------|------|-----------|
| Fact profile types | `src/lib/types/factProfile.ts` | Extend with `is_org_profile` |
| Fact profile service | `src/lib/services/factProfileService.ts` | Add `getOrgProfile()` method |
| Fact profile hooks | `src/lib/hooks/useFactProfiles.ts` | Add `useOrgProfile()` hook |
| Fact profile page | `src/pages/FactProfilesPage.tsx` | Add "Your Business" tab/badge |
| New profile dialog | `src/components/fact-profiles/NewFactProfileDialog.tsx` | Block creating second org profile |
| Profile view | `src/components/fact-profiles/FactProfileView.tsx` | Add org profile badge + sync button |
| Onboarding completion | `src/pages/onboarding/v2/CompletionStep.tsx` | Trigger org profile creation |
| Enrichment result | `src/pages/onboarding/v2/EnrichmentResultStep.tsx` | Pre-populate fact profile from enrichment |
| Org context hooks | `src/lib/hooks/useOrganizationContext.ts` | Bridge for syncing profile → context |
| Skill compiler | `src/lib/utils/skillCompiler.ts` | Already reads from org context (no changes) |
| Research edge function | `supabase/functions/research-fact-profile/index.ts` | Accept seed data from enrichment |

### Gaps Identified

1. No `is_org_profile` column on `client_fact_profiles`
2. No bridge between fact profile research data and `organization_context`
3. No CRM entity linking columns on `client_fact_profiles`
4. No "Your Business" differentiation in FactProfilesPage UI
5. No Settings > Company Profile section
6. Onboarding completion doesn't create a fact profile

---

## Risks

| Severity | Risk | Mitigation |
|----------|------|------------|
| Medium | Dual source of truth (org_enrichment + fact profile) | Fact profile becomes canonical; org_enrichment is seed data only |
| Medium | Migration for existing orgs (no org profile yet) | Script to backfill from existing org_enrichment data |
| Low | Partial unique index on `is_org_profile` | PostgreSQL supports `WHERE is_org_profile = true` partial unique |
| Low | Research might fail during onboarding | Graceful fallback: create profile with enrichment data, research async |

---

## Execution Plan

### Story 1: Schema — Add `is_org_profile` and CRM linking columns
**Type**: Migration
**Est**: 15 min

Add to `client_fact_profiles`:
- `is_org_profile BOOLEAN DEFAULT false` — one per org (partial unique index)
- `linked_contact_id UUID REFERENCES contacts(id)` — optional CRM link
- `linked_deal_id UUID REFERENCES deals(id)` — optional CRM link
- `linked_company_domain TEXT` — optional company link

### Story 2: Types, service, hooks — Org profile support
**Type**: Frontend
**Est**: 20 min

- Extend `FactProfile` type with `is_org_profile`, `linked_contact_id`, `linked_deal_id`, `linked_company_domain`
- Add `factProfileService.getOrgProfile(orgId)` method
- Add `useOrgProfile(orgId)` React Query hook
- Add `factProfileService.syncToOrgContext(profileId)` method

### Story 3: Onboarding — Auto-create org fact profile on completion
**Type**: Frontend + Edge Function
**Est**: 30 min

- In `CompletionStep.tsx`: after org creation, create fact profile with `is_org_profile: true`
- Seed profile with enrichment data from onboarding
- Fire background research for deeper analysis
- On research complete: sync to `organization_context` → trigger skill recompilation

### Story 4: Sync bridge — Fact profile research → organization_context
**Type**: Backend
**Est**: 25 min

- New function or extension of `research-fact-profile`: on research complete, map 8 research sections to `organization_context` keys
- Mapping: `company_overview` → `company_name`, `industry`, `description`, etc.
- `products_services` → `products`, `value_propositions`
- `team_leadership` → `key_people`
- Trigger `compile-organization-skills` after sync

### Story 5: FactProfilesPage — "Your Business" tab and badge
**Type**: Frontend
**Est**: 20 min

- Add "Your Business" tab/badge to FactProfilesPage
- Show org profile prominently (pinned at top or dedicated tab)
- Prevent deletion of org profile (disable delete action)
- Show "Feeds org context" indicator
- Block creating second org profile in NewFactProfileDialog

### Story 6: Client profiles — CRM entity linking
**Type**: Frontend
**Est**: 25 min

- Add optional CRM linking fields to NewFactProfileDialog
- Contact picker, Deal picker, Company domain input
- Show linked entity badge on FactProfileCard
- Navigate to linked entity from profile view

### Story 7: Settings — Company Profile section
**Type**: Frontend
**Est**: 20 min

- Add "Company Profile" section to org Settings page
- Quick view of org fact profile research data
- "Edit Profile" → navigates to fact profile edit view
- "Re-research" button → triggers fresh research
- "Sync to Skills" button → manual sync to org context + recompile
- Show last synced timestamp

---

### Story 8: Schema — Add context_profile_id to dynamic_tables
**Type**: Migration
**Est**: 10 min

Add to `dynamic_tables`:
- `context_profile_id UUID REFERENCES client_fact_profiles(id) ON DELETE SET NULL` — table-level profile focus
- Defaults to NULL (uses org profile / org context as fallback)
- When set, all enrichments on this table use the selected profile's research data

### Story 9: Backend — Enrichment context resolution from fact profiles
**Type**: Backend (Edge Function)
**Est**: 30 min

Extend `enrich-dynamic-table`:
- Accept `context_profile_id` parameter (from table metadata)
- New function `buildFactProfileContext(profileId)` — maps 8 research sections to context variables
- Replaces/augments existing `buildProductContext()` — fact profile context takes priority
- Resolve `${variable}` placeholders in enrichment prompts using profile context
- Fallback chain: table context_profile_id → org profile → org context → no context

### Story 10: Frontend — Profile focus selector on OpsDetailPage
**Type**: Frontend
**Est**: 25 min

- Add profile selector dropdown in OpsDetailPage top bar (next to table name)
- Lists all fact profiles for the org (org profile first, then client profiles)
- Shows active profile name + badge (e.g., "Context: Acme Corp" or "Context: Client - TechStartup")
- Selecting a profile updates `dynamic_tables.context_profile_id`
- Enrichment modal shows which profile will provide context
- "Default (Your Business)" option resets to org profile

---

## Ops Context Flow (New)

### Current Enrichment Context Flow
```
enrich-dynamic-table:
  product_profile_id → product_profiles table → ${product_context} in prompt
  @column_key → row cell values → direct substitution
  (NO org context, NO fact profile context)
```

### Proposed Enrichment Context Flow
```
enrich-dynamic-table:
  context_profile_id → client_fact_profiles.research_data → ${variables} in prompt
    ↓ fallback chain
  1. Table's context_profile_id (if set)
  2. Org's is_org_profile=true profile (if exists)
  3. organization_context table (legacy fallback)
  4. No context (enrichment works without it)

  Available variables from fact profile:
    ${company_name}, ${industry}, ${description}, ${tagline}
    ${products}, ${value_propositions}, ${pricing}
    ${competitors}, ${target_market}
    ${key_people}, ${leadership}
    ${tech_stack}, ${revenue}, ${funding}
    ${recent_news}, ${recent_activity}

  Plus existing:
    @column_key → row cell values
    ${product_context} → product_profiles (if set)
```

---

## Architecture Decisions

1. **Single source of truth**: Org fact profile becomes the canonical company data. `organization_enrichment` is onboarding seed data only.
2. **Sync direction**: Fact profile → `organization_context` (one-way). Edits to org profile trigger re-sync.
3. **Client profiles isolated**: `is_org_profile = false` profiles never write to `organization_context`.
4. **CRM linking optional**: Client profiles CAN link to CRM entities but it's not required.
5. **Backward compatible**: Existing orgs without org profiles continue working. Backfill migration optional.
6. **Ops profile focus**: Per-table context switching via `context_profile_id` — swaps the `${variables}` used in enrichment prompts.
7. **Fallback chain**: Table profile → org profile → org context → no context. Never breaks if no profile exists.
8. **Context isolation**: Changing a table's profile focus does NOT affect org context or skill compilation. It only affects enrichment prompts for that table.
