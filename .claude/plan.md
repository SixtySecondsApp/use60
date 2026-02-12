# Plan: Sync Fact Profiles to Org Context

## Goal
When a user clicks "Sync to Org Context" on a `client_org` fact profile, push its research data into both `organization_enrichment` and `organization_context` — so email generation (`loadBusinessContext`), skill compilation (`compile-organization-skills`), and the copilot all use the fact profile's data.

## Architecture

```
Fact Profile (client_fact_profiles.research_data)
    ↓  [sync-fact-profile-context edge function]
    ├→ organization_enrichment (upsert row, maps research fields → enrichment columns)
    ├→ organization_context (upsert key-value pairs via existing RPC)
    └→ Returns success + count of synced fields
```

## Implementation (4 files)

### 1. New Edge Function: `supabase/functions/sync-fact-profile-context/index.ts`

**JWT-protected, user-scoped.** Takes `{ profileId }` in body.

**Logic:**
1. Auth check — get userId from JWT
2. Fetch the fact profile by ID (verify it belongs to user's org, is `profile_type = 'client_org'`, and `research_status = 'complete'`)
3. Map `research_data` sections → `organization_enrichment` columns:

| Fact Profile Section | Enrichment Column | Mapping |
|---|---|---|
| `company_overview.name` | `company_name` | Direct |
| `company_overview.tagline` | `tagline` | Direct |
| `company_overview.description` | `description` | Direct |
| `market_position.industry` | `industry` | Direct |
| `team_leadership.employee_range` | `employee_count` | Direct |
| `products_services.products` | `products` | Map to `[{name, description: ''}]` |
| `ideal_customer_indicators.value_propositions` | `value_propositions` | Direct array |
| `market_position.competitors` | `competitors` | Map to `[{name}]` |
| `market_position.target_market` | `target_market` | Direct |
| `technology.tech_stack` | `tech_stack` | Direct array |
| `team_leadership.key_people` | `key_people` | Direct array (already `{name, title}`) |
| `ideal_customer_indicators.pain_points` | `pain_points` | Direct array |
| `company_overview.founded_year` | `founded_year` | Direct |
| `company_overview.headquarters` | `headquarters` | Direct |
| `financials.funding_status` | `funding_status` | Direct |
| `ideal_customer_indicators.buying_signals` | `buying_signals_detected` | Map to `[{type: 'fact_profile', detail}]` |
| `recent_activity.news` | `recent_news` | Direct |

4. Upsert `organization_enrichment` row (`.upsert()` on `organization_id`, set `status = 'completed'`, `enrichment_source = 'fact_profile'`)

5. Map `research_data` → `organization_context` key-value pairs (using same `upsert_organization_context` RPC pattern as deep-enrich):

| Fact Profile Field | Context Key |
|---|---|
| `company_overview.name` | `company_name` |
| `company_overview.tagline` | `tagline` |
| `company_overview.description` | `description` |
| `market_position.industry` | `industry` |
| `team_leadership.employee_range` | `employee_count` |
| `products_services.products` | `products` |
| `products_services.products[0]` | `main_product` |
| `ideal_customer_indicators.value_propositions` | `value_propositions` |
| `market_position.competitors` | `competitors` |
| `market_position.competitors[0]` | `primary_competitor` |
| `market_position.target_market` | `target_market` |
| `ideal_customer_indicators.pain_points` | `pain_points` |
| `technology.tech_stack` | `tech_stack` |
| `team_leadership.key_people` | `key_people` |
| `market_position.differentiators` | `differentiators` |
| `market_position.differentiators[0]` | `primary_differentiator` |
| `ideal_customer_indicators.target_industries` | `target_industries` |
| `ideal_customer_indicators.target_roles` | `target_roles` |
| `ideal_customer_indicators.buying_signals` | `buying_signals` |
| `financials.funding_status` | `funding_status` |

All context entries use `source = 'fact_profile'`, `confidence = 0.90`.

6. Return `{ success: true, enrichment_fields: N, context_keys: N }`.

### 2. New UI Component: `src/components/fact-profiles/SyncFactProfileToOrg.tsx`

Small button component (similar to `CreateICPFromFactsButton`, `PushFactProfileToOps`):
- Only renders for `profile_type === 'client_org'` and `research_status === 'complete'`
- Calls `supabase.functions.invoke('sync-fact-profile-context', { body: { profileId } })`
- Shows loading state, then success toast with count of synced fields
- Uses `RefreshCcw` lucide icon

### 3. Wire into FactProfileView: `src/components/fact-profiles/FactProfileView.tsx`

Add `<SyncFactProfileToOrg>` button alongside the existing action buttons (ExportPDF, CreateICP, PushToOps) in the header action bar (line ~359).

### 4. Register edge function in Supabase config

Add `sync-fact-profile-context` to `supabase/config.toml` if needed (JWT-protected by default, no special config).

## What This Unlocks

After syncing:
- `generate-email-sequence` picks up products, value props, pain points, competitors via `loadBusinessContext()` → `organization_enrichment`
- `compile-organization-skills` picks up all context keys → skills get `${company_name}`, `${products}`, `${value_propositions}` etc. resolved
- The `sales-sequence` skill (with `context_profile: communication`) gets `company_name`, `brand_voice`, `products`, `case_studies`, `customer_logos`, `value_propositions` from the synced data

## Not in scope
- Auto-sync on profile approval (can add later)
- Triggering skill recompilation after sync (user can do that separately)
- Syncing `target_company` profiles (those are prospect research, not your own org)
