# CRM Data Strategy: Hybrid Index + Lazy Materialization

**Date**: 2026-02-15
**Status**: Brief — Pending Approval

---

## Problem Statement

Customers may have 50K-500K contacts in their CRM (HubSpot, Attio, and future integrations). Currently the app either:
- Mirrors nothing (copilot can only query locally-created records), or
- Attempts to sync everything into standard ops tables (expensive, slow, duplicative)

The copilot needs to search the full CRM dataset ("find all VPs at fintech companies") but we shouldn't store 500K full contact records locally. We should only fully materialize records that become "active" through real engagement.

---

## Requirements (from discovery)

| Requirement | Detail |
|---|---|
| **CRM Sources** | HubSpot (primary), Attio, future: many CRM + booking + calendar integrations |
| **Copilot Access** | Full CRUD + enrichment — create, search, enrich, update, write back to CRM |
| **Activation Events** | Meeting booked, user references them, enrichment requested — any touch materializes |
| **Query Strategy** | Lightweight index of ALL CRM contacts; full-materialize on demand |
| **Index Fields** | name, email, company, job title, lead stage, lifecycle stage, deal association |
| **Scale** | 50K-500K contacts per org |
| **Write-back** | Async queue (resilient to CRM rate limits) |
| **Index Freshness** | Webhook-driven only (no polling/scheduled sync) |

---

## Current Architecture (What Exists)

### Already Built
| Component | Status | Location |
|---|---|---|
| HubSpot webhook handler | Working | `supabase/functions/hubspot-webhook/index.ts` |
| Attio webhook handler | Working | `supabase/functions/attio-webhook/index.ts` |
| Standard table sync | Working | `supabase/functions/_shared/standardTableSync.ts` |
| Conflict resolver | Working | `supabase/functions/_shared/conflictResolver.ts` |
| HubSpot sync queue | Schema exists | `hubspot_sync_queue` table (no worker) |
| Attio sync queue | Schema exists | `attio_sync_queue` table (no worker) |
| Composite CRM adapter | Working | `supabase/functions/_shared/copilot_adapters/registry.ts` |
| Entity resolution | Working | `supabase/functions/_shared/resolveEntityAdapter.ts` |
| Enrichment pipeline | Working | AI Ark, Apify, Apollo with credit metering |
| Row-level source caching | Working | `dynamic_table_rows.source_data` JSONB |

### Gaps
| Gap | Impact |
|---|---|
| No lightweight CRM index | Copilot can't search unmaterialized CRM records |
| No materialization trigger system | Records aren't auto-created from CRM when engaged |
| Sync queue workers don't exist | Queued jobs from webhooks never process |
| No async write-back queue | Changes can't be pushed back to CRM reliably |
| HubSpot queries contacts by `organization_id` | Wrong — should be `clerk_org_id` (just fixed for backfill) |

---

## Proposed Architecture: Two-Tier Data Model

```
┌─────────────────────────────────────────────────────────────┐
│                    CRM SOURCES                               │
│  HubSpot    Attio    [Future: Salesforce, Pipedrive, ...]   │
└──────┬────────┬──────────────────────────────────────────────┘
       │        │
       │ Webhooks (create/update/delete events)
       │        │
       ▼        ▼
┌─────────────────────────────────────────────────────────────┐
│  TIER 1: CRM INDEX (Lightweight — ALL records)              │
│                                                              │
│  crm_contact_index    crm_company_index    crm_deal_index   │
│  ~500K rows/org       ~50K rows/org        ~10K rows/org    │
│                                                              │
│  Slim fields only:                                           │
│  name, email, company, title, lifecycle, deal stage          │
│  ~200 bytes/row → 100MB at 500K contacts                    │
│                                                              │
│  Purpose: Copilot search, entity resolution, browse          │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┤ Activation Events:
        │                  │ • Meeting booked
        │                  │ • User references in copilot
        │                  │ • Enrichment requested
        │                  │ • Added to ops table
        │                  │ • Webhook + already materialized
        │                  │
        ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│  TIER 2: MATERIALIZED RECORDS (Full — active records only)  │
│                                                              │
│  contacts     companies     leads      meetings              │
│  ~2-5K/org    ~1-2K/org     ~500/org   ~200/org             │
│                                                              │
│  Full records with:                                          │
│  • All CRM fields (fetched via API on materialization)       │
│  • Enrichment data (AI Ark, Apollo, Apify cached)            │
│  • Activity history, meeting transcripts                     │
│  • Prep notes, health scores, relationship signals           │
│                                                              │
│  Purpose: Deep data, enrichment, copilot actions             │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┤ Write-back (async queue):
        │                  │ • Field updates
        │                  │ • New records created
        │                  │ • Deal stage changes
        │                  │ • Activity logging
        ▼                  │
┌─────────────────────────────────────────────────────────────┐
│  CRM WRITE-BACK QUEUE                                        │
│                                                              │
│  crm_writeback_queue                                         │
│  Async, deduped, retry with backoff                          │
│  Processes: push changes to CRM API                          │
│  Respects rate limits (10 req/sec HubSpot, 5 req/sec Attio) │
└─────────────────────────────────────────────────────────────┘
```

---

## Schema Design

### Tier 1: CRM Index Tables

```sql
-- Lightweight index of ALL CRM contacts — populated by webhooks
CREATE TABLE crm_contact_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  crm_source TEXT NOT NULL CHECK (crm_source IN ('hubspot', 'attio')),
  crm_record_id TEXT NOT NULL,              -- HubSpot VID or Attio record ID

  -- Slim searchable fields (the index)
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  company_name TEXT,
  job_title TEXT,
  lifecycle_stage TEXT,                      -- subscriber/lead/mql/sql/opportunity/customer
  lead_status TEXT,                          -- new/open/in_progress/etc.

  -- Deal association (denormalized for search)
  has_active_deal BOOLEAN DEFAULT false,
  deal_stage TEXT,                           -- Current deal stage name
  deal_value NUMERIC,                        -- Deal amount

  -- Materialization tracking
  materialized_contact_id UUID REFERENCES contacts(id),  -- NULL = not yet materialized
  is_materialized BOOLEAN DEFAULT false,
  materialized_at TIMESTAMPTZ,

  -- Freshness
  crm_created_at TIMESTAMPTZ,
  crm_updated_at TIMESTAMPTZ,
  last_webhook_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_crm_contact_per_org UNIQUE(org_id, crm_source, crm_record_id)
);

-- Indexes for copilot search patterns
CREATE INDEX idx_crm_contact_index_org ON crm_contact_index(org_id);
CREATE INDEX idx_crm_contact_index_email ON crm_contact_index(org_id, email);
CREATE INDEX idx_crm_contact_index_name ON crm_contact_index(org_id, first_name, last_name);
CREATE INDEX idx_crm_contact_index_company ON crm_contact_index(org_id, company_name);
CREATE INDEX idx_crm_contact_index_title ON crm_contact_index(org_id, job_title);
CREATE INDEX idx_crm_contact_index_lifecycle ON crm_contact_index(org_id, lifecycle_stage);
CREATE INDEX idx_crm_contact_index_deal ON crm_contact_index(org_id, has_active_deal, deal_stage);

-- Full-text search for copilot natural language queries
CREATE INDEX idx_crm_contact_index_fts ON crm_contact_index USING gin(
  to_tsvector('english',
    COALESCE(first_name, '') || ' ' ||
    COALESCE(last_name, '') || ' ' ||
    COALESCE(email, '') || ' ' ||
    COALESCE(company_name, '') || ' ' ||
    COALESCE(job_title, '')
  )
);


-- Company index (same pattern)
CREATE TABLE crm_company_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  crm_source TEXT NOT NULL CHECK (crm_source IN ('hubspot', 'attio')),
  crm_record_id TEXT NOT NULL,

  name TEXT,
  domain TEXT,
  industry TEXT,
  employee_count TEXT,                       -- Stored as text for range values
  annual_revenue NUMERIC,

  -- Materialization
  materialized_company_id UUID REFERENCES companies(id),
  is_materialized BOOLEAN DEFAULT false,

  -- Freshness
  crm_updated_at TIMESTAMPTZ,
  last_webhook_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_crm_company_per_org UNIQUE(org_id, crm_source, crm_record_id)
);

CREATE INDEX idx_crm_company_index_org ON crm_company_index(org_id);
CREATE INDEX idx_crm_company_index_name ON crm_company_index(org_id, name);
CREATE INDEX idx_crm_company_index_domain ON crm_company_index(org_id, domain);


-- Deal index (for enriching contact context)
CREATE TABLE crm_deal_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  crm_source TEXT NOT NULL CHECK (crm_source IN ('hubspot', 'attio')),
  crm_record_id TEXT NOT NULL,

  name TEXT,
  stage TEXT,
  amount NUMERIC,
  close_date DATE,
  contact_crm_ids TEXT[],                    -- Associated contact CRM IDs
  company_crm_id TEXT,                       -- Associated company CRM ID
  owner_crm_id TEXT,                         -- Owner in CRM

  crm_updated_at TIMESTAMPTZ,
  last_webhook_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_crm_deal_per_org UNIQUE(org_id, crm_source, crm_record_id)
);
```

### Write-back Queue

```sql
CREATE TABLE crm_writeback_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  crm_source TEXT NOT NULL,

  -- What to write
  entity_type TEXT NOT NULL CHECK (entity_type IN ('contact', 'company', 'deal', 'activity')),
  crm_record_id TEXT,                        -- NULL for creates
  operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'associate')),
  payload JSONB NOT NULL,                    -- Fields to write

  -- Source tracking
  triggered_by TEXT NOT NULL,                -- 'copilot', 'enrichment', 'automation', 'user'
  triggered_by_user_id UUID,

  -- Queue management
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
  priority INTEGER NOT NULL DEFAULT 5,       -- 1=highest, 10=lowest
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ DEFAULT NOW(),

  -- Dedup
  dedupe_key TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  CONSTRAINT unique_writeback_dedupe UNIQUE(org_id, dedupe_key)
);

CREATE INDEX idx_writeback_pending ON crm_writeback_queue(status, next_retry_at)
  WHERE status IN ('pending', 'failed');
```

---

## Data Flow: How Each Path Works

### Path 1: CRM Webhook → Index Update

```
CRM fires webhook (contact.created / contact.updated)
    │
    ▼
hubspot-webhook/index.ts (or attio-webhook)
    │
    ├─→ UPSERT into crm_contact_index (slim fields only)
    │   • Extract: name, email, company, title, lifecycle, deal info
    │   • ~0.5ms per record, no API calls
    │
    ├─→ IF contact.is_materialized = true:
    │   └─→ Also update the full `contacts` record
    │       (existing standardTableSync pattern)
    │
    └─→ Enqueue in sync queue (existing pattern, for batch processing)
```

### Path 2: Copilot Search → On-Demand Materialization

```
User: "Find all VPs at fintech companies in our CRM"
    │
    ▼
copilot-autonomous → execute_action("search_crm_index")
    │
    ▼
NEW: search_crm_index adapter
    │
    ├─→ Query crm_contact_index:
    │   WHERE org_id = $orgId
    │   AND job_title ILIKE '%VP%'
    │   AND (company_name ILIKE '%fintech%' OR industry = 'fintech')
    │   LIMIT 50
    │
    ├─→ Return slim results to copilot
    │   (name, email, company, title, lifecycle, deal info)
    │
    └─→ If user says "tell me more about [contact]" or "enrich these":
        └─→ MATERIALIZE: call CRM API for full record
            → Insert into contacts table
            → Update crm_contact_index.is_materialized = true
            → Return full record to copilot
```

### Path 3: Meeting Booked → Auto-Materialize

```
SavvyCal webhook → lead created in leads table
    │
    ▼
NEW: post-lead-creation hook
    │
    ├─→ Search crm_contact_index by email
    │
    ├─→ IF found in index + NOT materialized:
    │   ├─→ Call CRM API for full record
    │   ├─→ Insert into contacts table
    │   ├─→ Update index: is_materialized = true, materialized_contact_id
    │   └─→ Link lead.contact_id → new contact
    │
    └─→ IF not in CRM index:
        └─→ Create contact from lead data (contact_name, contact_email)
            (existing pattern — lead-sourced contacts)
```

### Path 4: Enrichment → Materialize + Enrich

```
User: "Enrich these 50 leads with AI Ark"
    │
    ▼
Enrichment skill → ops table rows
    │
    ├─→ For each row with email:
    │   ├─→ Check crm_contact_index by email
    │   ├─→ If found + not materialized → materialize first
    │   └─→ Run enrichment (AI Ark/Apollo/Apify)
    │       → Cache in source_data JSONB
    │       → Write enriched values to cells
    │
    └─→ Enriched contacts are now materialized + enhanced
```

### Path 5: Copilot Write-back → Async Queue

```
Copilot: "Update Stan's lifecycle to SQL in HubSpot"
    │
    ▼
execute_action("update_crm", {
  contact_id: "...",
  fields: { lifecycle_stage: "sql" }
})
    │
    ├─→ Update local contacts table immediately
    ├─→ Update crm_contact_index.lifecycle_stage immediately
    │
    └─→ INSERT INTO crm_writeback_queue:
        {
          entity_type: 'contact',
          crm_record_id: 'hubspot_vid_123',
          operation: 'update',
          payload: { lifecyclestage: 'salesqualifiedlead' },
          triggered_by: 'copilot'
        }
    │
    ▼
crm-writeback-worker (cron or pg_cron)
    │
    ├─→ Dequeue pending jobs (oldest first)
    ├─→ Call CRM API (HubSpot/Attio)
    ├─→ On success: mark completed
    └─→ On failure: increment attempts, exponential backoff
        (1min, 5min, 30min, 2hr, 12hr — then dead letter)
```

---

## Initial Sync: CRM Connection → Full Index Population

When a customer first connects their CRM, we need to populate the full index:

```
User connects HubSpot OAuth
    │
    ▼
hubspot-initial-sync (new edge function)
    │
    ├─→ Use HubSpot CRM Search API (paginated, 100/page)
    │   GET /crm/v3/objects/contacts?limit=100&after={cursor}
    │   Properties: firstname, lastname, email, company, jobtitle,
    │               lifecyclestage, hs_lead_status
    │
    ├─→ Batch UPSERT into crm_contact_index (1000 rows/batch)
    │   • 500K contacts ÷ 100/page = 5,000 API calls
    │   • At 10 req/sec = ~8 minutes for full sync
    │   • Index size: ~100MB in Postgres (fine)
    │
    ├─→ Same for companies and deals
    │
    └─→ Set integration.initial_sync_status = 'completed'
        • Register webhooks for ongoing updates
```

**Note:** This is a one-time cost per CRM connection. After initial sync, only webhooks maintain freshness.

---

## Changes to Existing Systems

### 1. Webhook Handlers (Modify)

Both `hubspot-webhook` and `attio-webhook` get an additional step:

```typescript
// EXISTING: enqueue sync job + sync to standard table
// NEW: also upsert to crm_contact_index
await upsertContactIndex(svc, orgId, crmSource, crmRecordId, {
  first_name: properties.firstname,
  last_name: properties.lastname,
  email: properties.email,
  company_name: properties.company,
  job_title: properties.jobtitle,
  lifecycle_stage: properties.lifecyclestage,
  lead_status: properties.hs_lead_status,
});
```

### 2. Copilot Adapters (New + Modify)

**New adapter:** `crmIndexAdapter.ts`
- `searchContacts(query, filters, limit)` — searches `crm_contact_index`
- `searchCompanies(query, filters, limit)` — searches `crm_company_index`
- `materializeContact(indexId)` — pulls full record from CRM API, creates local contact
- `getContactContext(indexId)` — returns slim context with deal info

**Modify:** `resolveEntityAdapter.ts`
- Add `crm_contact_index` as fourth search source (after contacts, meetings, calendar)
- Higher recency score for materialized contacts

**Modify:** `copilot-autonomous/index.ts`
- New action: `search_crm_index` — searches the lightweight index
- New action: `materialize_contact` — pulls full record on demand
- Existing `get_contact` unchanged — still queries materialized `contacts` table

### 3. Standard Ops Tables (Modify)

Standard tables continue to source from materialized records:
- **Leads** → `leads` table (booking-sourced, already correct)
- **Meetings** → `meetings` table (already correct)
- **All Contacts** → `contacts` table (only materialized contacts appear)
- **All Companies** → `companies` table (only materialized companies appear)

**New option:** "All CRM Contacts" standard table that reads from `crm_contact_index` directly (slim view of full CRM).

### 4. Materialization Service (New)

```typescript
// supabase/functions/_shared/materializationService.ts
export async function materializeContact(
  svc: SupabaseClient,
  orgId: string,
  indexRecord: CrmContactIndex
): Promise<string /* contact_id */> {
  // 1. Fetch full record from CRM API
  const fullRecord = await fetchFromCrm(orgId, indexRecord.crm_source, indexRecord.crm_record_id);

  // 2. Insert into contacts table
  const contactId = await insertContact(svc, orgId, fullRecord);

  // 3. Update index: mark as materialized
  await svc.from('crm_contact_index')
    .update({ is_materialized: true, materialized_contact_id: contactId, materialized_at: new Date() })
    .eq('id', indexRecord.id);

  // 4. Sync to standard ops tables
  await syncToStandardTable(svc, orgId, 'contact', fullRecord);

  return contactId;
}
```

---

## Sizing & Performance

### Storage at 500K contacts/org

| Table | Rows | Avg Row Size | Total Size |
|---|---|---|---|
| `crm_contact_index` | 500,000 | ~200 bytes | ~100 MB |
| `crm_company_index` | 50,000 | ~150 bytes | ~7.5 MB |
| `crm_deal_index` | 10,000 | ~200 bytes | ~2 MB |
| **Index total** | | | **~110 MB/org** |
| `contacts` (materialized) | ~5,000 | ~2 KB | ~10 MB |
| `companies` (materialized) | ~1,000 | ~1 KB | ~1 MB |

**Conclusion:** Well within Supabase Postgres capabilities. No need for Elasticsearch or dedicated search infra at this scale.

### Query Performance

| Query Pattern | Index Used | Expected Latency |
|---|---|---|
| Search by email | `idx_crm_contact_index_email` (B-tree) | <5ms |
| Search by name | `idx_crm_contact_index_name` (B-tree) | <10ms |
| Search by company + title | `idx_crm_contact_index_company` + filter | <20ms |
| Full-text search | `idx_crm_contact_index_fts` (GIN) | <50ms |
| Lifecycle stage filter | `idx_crm_contact_index_lifecycle` | <10ms |
| Deal-associated contacts | `idx_crm_contact_index_deal` | <10ms |

### Initial Sync Time

| CRM Size | API Calls | Time (at 10 req/sec) |
|---|---|---|
| 10K contacts | 100 pages | ~10 seconds |
| 50K contacts | 500 pages | ~50 seconds |
| 100K contacts | 1,000 pages | ~2 minutes |
| 500K contacts | 5,000 pages | ~8 minutes |

---

## Implementation Phases

### Phase 1: Schema + Index Population (Foundation)
- Create `crm_contact_index`, `crm_company_index`, `crm_deal_index` tables
- Create `crm_writeback_queue` table
- Modify webhook handlers to upsert into index tables
- Build `hubspot-initial-sync` edge function for first-time population
- Build `attio-initial-sync` edge function

### Phase 2: Copilot Integration (Search)
- Build `crmIndexAdapter.ts` for index queries
- Add `search_crm_index` action to copilot
- Enhance `resolve_entity` to include index search
- Add full-text search support for natural language queries

### Phase 3: Materialization (On-Demand)
- Build `materializationService.ts`
- Add `materialize_contact` action to copilot
- Wire meeting-booked → auto-materialize hook
- Wire enrichment → materialize-first pipeline

### Phase 4: Write-back (Bidirectional)
- Build `crm-writeback-worker` edge function (cron-triggered)
- Wire copilot update actions to enqueue write-back
- Add retry, dedup, and dead-letter handling
- Build write-back status UI (optional)

### Phase 5: "All CRM Contacts" View (Optional)
- New standard table type that reads from `crm_contact_index`
- Slim columns matching index fields
- Inline "Materialize" button per row

---

## Key Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Index storage | Supabase Postgres | 110MB/org at 500K — no need for Elasticsearch |
| Index granularity | Contact + Company + Deal | Deals needed for "has active deal" enrichment |
| Webhook-only freshness | Yes | Customer preference; simpler; CRM webhooks are reliable |
| Write-back pattern | Async queue | Resilient to CRM rate limits; dedup prevents loops |
| Materialization trigger | Any touch | Meeting booked, copilot reference, enrichment, manual |
| Full CRM fetch on materialize | Via CRM API (not cached) | Ensures freshest data at materialization time |
| Standard ops tables | Source from materialized only | Keeps standard tables focused on "active" records |

---

## Open Questions

1. **Should delete webhooks remove from index or soft-delete?** (Recommend: soft-delete with `deleted_at` timestamp)
2. **Should we expose index count in the UI?** ("Your CRM: 247,000 contacts indexed, 3,200 active")
3. **Rate limit for materialization?** (Prevent a user from materializing 10K contacts at once)
4. **Should the "All CRM Contacts" standard table exist from Phase 1?** (Or defer to Phase 5?)
