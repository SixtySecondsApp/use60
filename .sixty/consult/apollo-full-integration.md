# Apollo Full Integration for Ops — Consultation Report

## Discovery Session Summary

**Date**: 2026-02-06
**Request**: "Can you fully integrate Apollo into our Ops?"
**Reference**: https://docs.apollo.io/reference/people-api-search

## Current State

### What Exists
- **Apollo People Search** (`apollo-search` edge function): Searches Apollo's database and creates new Ops tables from results. Returns normalized contacts but **no emails or phones** (Search API doesn't return them).
- **API Key Management** (`useApolloIntegration` hook): Stores/retrieves Apollo API key in `integration_credentials` per org.
- **Table Creation**: `copilot-dynamic-table` creates Apollo-sourced tables with 9 standard columns.
- **Integration Column Pattern**: Generic `integration` column type with `reoon_email_verify` and `apify_actor` integration types.
- **HubSpot Property Column**: Dedicated `hubspot_property` column type with field picker, multi-select, bidirectional sync.

### What's Missing
1. **People Enrichment** — No way to get emails, phones, or detailed contact data from Apollo
2. **Organization Enrichment** — No company-level enrichment (revenue, tech stack, funding)
3. **Bulk Operations** — No efficient batch enrichment for large tables
4. **Advanced Search Filters** — Missing seniority, department, domain, email status filters

## User Requirements

1. **"Enrich once, column many" pattern**: Store full Apollo response in `source_data.apollo`, let users pick which fields to surface as columns. Same UX as HubSpot property columns.
2. **Batch run controls**: User chooses how many rows to enrich: Don't run / 10 / 50 / 100 / All rows
3. **Configurable credit options**: Toggles for "Reveal personal emails" (+1 credit) and "Reveal phone numbers" (+8 credits)
4. **Works on ANY table**: Apollo, HubSpot, CSV, manual — matches by name+company/email/linkedin
5. **Priority order**: Enrichment first, then Bulk, then Org enrichment, then Advanced search

## Architecture Decision: `apollo_property` Column Type

**Chosen**: Dedicated column type (like `hubspot_property`) instead of generic `integration` type.

**Rationale**:
- Clean field picker UI mirroring HubSpotPropertyPicker
- Dedicated cell rendering with type-appropriate formatting
- Cache-aware: reads from `source_data.apollo` before calling API
- Future-proof for Apollo-specific features (credit tracking, org enrichment)

## Apollo API Summary

| Endpoint | Method | Credits | Returns |
|----------|--------|---------|---------|
| People Search (`/v1/mixed_people/search`) | POST | Free | Contacts without emails/phones |
| People Enrichment (`/v1/people/match`) | POST | 1 + reveal costs | Full contact + org data |
| Bulk People Enrichment (`/v1/people/bulk_match`) | POST | Same per record | Batch of 10 |
| Org Enrichment (`/v1/organizations/enrich`) | GET | 1 | Company firmographics |

**Credit costs**: Base=1, +1 for personal email reveal, +8 for phone reveal. Max 10/record.

**Rate limits**: 50-200/min (plan-dependent). Bulk API at 50% of per-minute rate.

**Match strategies** (priority order):
1. Email (most accurate)
2. first_name + last_name + domain
3. name + domain
4. linkedin_url

## Key Technical Patterns

### Caching in `source_data.apollo`
```sql
UPDATE dynamic_table_rows
SET source_data = COALESCE(source_data, '{}'::jsonb) || jsonb_build_object('apollo', @full_response)
WHERE id = @row_id;
```

Second Apollo column reads from cache — zero API calls, zero credits.

### Field Extraction (nested path resolution)
```typescript
// 'organization.estimated_num_employees' → response.organization.estimated_num_employees
function extractField(response: any, path: string): any {
  return path.split('.').reduce((obj, key) => {
    if (key.includes('[')) {
      const [arrKey, idx] = key.replace(']', '').split('[');
      return obj?.[arrKey]?.[parseInt(idx)];
    }
    return obj?.[key];
  }, response);
}
```

### 26 Apollo Fields Mapped
Contact (5), Professional (3), Location (3), Social (4), Email Quality (2), Company (11) — all with proper column types.
