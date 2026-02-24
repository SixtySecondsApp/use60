# Consult Report: Ops Expansion — Intelligent Operating Layer

Generated: 2026-02-04

## User Request

Transform Ops from enrichment tables into the full intelligent operating layer:
- **4 data sources**: CRM sync (HubSpot), prospecting (Apollo — already built), manual/CSV (built), cross-op import
- **4 special column types**: AI (built), formula, integration, action
- **CRM push flow**: field mapping, duplicate detection, list assignment, per-row status
- **Views**: saved filters (built), conditional formatting, column reordering
- **Automations**: simple rule builder (IF/THEN)

## Clarifications

| Question | Answer |
|----------|--------|
| Which CRMs to support initially? | **HubSpot only** (existing OAuth + API client) |
| Formula column sophistication? | **Simple formulas** (IF/THEN, CONCAT, math, @column refs — no AI formulas yet) |
| Automation starting point? | **Simple rule builder** (IF [col] [op] [val] THEN [action]) |
| Cross-op import in initial release? | **Yes**, as a fifth source type |

## What Already Exists (Foundation)

| Area | Status | Key Files |
|------|--------|-----------|
| Core schema (EAV) | Done | `20260204180000-180002` migrations |
| 11 column types | Done | text, email, url, number, boolean, enrichment, status, person, company, linkedin, date |
| AI enrichment | Done | `enrich-dynamic-table/index.ts` (531 lines), @mention refs, confidence scoring |
| CSV import | Done | `CSVImportOpsTableWizard.tsx` (400+ lines), auto-detection |
| Apollo search | Done | `apollo-search/`, `copilot-dynamic-table/` |
| Instantly push | Done | `instantly-push/`, `InstantlyPushModal.tsx` |
| Saved views | Done | 10 filter operators, system views, user views |
| Virtual table UI | Done | `@tanstack/react-virtual`, column management |
| HubSpot OAuth | Done | `hubspot-oauth-*` functions, `hubspot_org_credentials` table |
| HubSpot API client | Done | `_shared/hubspot.ts` with retry/backoff |

## Critical Risks

### P0: Edge function timeout (>75 rows)
- **Current**: Sequential processing, 30s/row timeout, 150s wall clock limit
- **Impact**: Tables >75 rows will timeout during enrichment
- **Fix**: OPS-001 — batch limit (50 rows), checkpointing, resume token

### P0: Client-side filtering (breaks at 500+ rows)
- **Current**: All filtering in React `useMemo` on hardcoded 500-row fetch
- **Impact**: Tables >500 rows can't be filtered; >2000 rows = multi-second lag
- **Fix**: OPS-002 — move to server-side Postgres WHERE clauses

### P0: No rate limiting on external APIs
- **Current**: No backoff, no retry-after parsing, no concurrency limits
- **Impact**: API bans from Claude, Apollo, Reoon at scale
- **Fix**: OPS-003 — exponential backoff, p-limit concurrency control

### P1: EAV scaling (200k+ cells)
- **Current**: Missing composite index on `(table_id, row_index)`
- **Impact**: Slow pagination queries at scale
- **Fix**: Index added in OPS-002

## Architecture Decisions

### Formula evaluation: Edge function (not client-side)
- Matches enrichment pattern (server → store → render)
- Uses `expr-eval` library (not `eval()`) for security
- Results cached in `dynamic_table_cells` with `source='formula'`
- @column_key references resolved via existing `resolveColumnMentions()` pattern

### Integration columns: Shared schema (integration_type + config JSONB)
- One column_type `'integration'` with `integration_type` discriminator
- New integrations = new edge function + UI config, no schema change
- Per-cell status tracking via cell status + integration_metadata JSONB

### CRM push: HITL preview → confirm
- Follows existing copilot HITL pattern (simulation mode)
- Preview modal shows mapped records, new vs update count
- Confirmation required before writing to HubSpot

### Cross-op: Deep copy (not live reference)
- Avoids cascade delete problems across tables
- Source tracked via `source_data` JSONB for audit
- No cross-table foreign keys = simpler integrity model

### Automations: Webhook-based triggers (via pg_net)
- DB triggers can't call external APIs
- pg_net webhook → edge function enables HubSpot push, email, etc.
- Circuit breaker: disable after 10 consecutive failures
- 60s debounce per row per rule prevents infinite loops

## Execution Plan Summary

| Phase | Stories | Key Deliverable |
|-------|---------|-----------------|
| **0: Stabilize** | OPS-001 → 003 | Batch enrichment, server-side filters, rate limiting |
| **1: Column Types** | OPS-004 → 007 | Dropdown/tags, phone, checkbox, formula columns |
| **2: Integrations** | OPS-008 → 011 | Reoon email verify, Apify actor runner, shared status UI |
| **3: Actions + CRM Push** | OPS-012 → 016 | Action buttons, HubSpot push with mapping + status |
| **4: HubSpot Pull** | OPS-017 → 020 | Import from HubSpot lists/filters, incremental sync |
| **5: Cross-Op** | OPS-021 → 022 | Import rows from another Op with filters |
| **6: Rule Builder** | OPS-023 → 025 | IF/THEN rules with trigger hooks and execution log |
| **7: Views** | OPS-026 → 027 | Conditional formatting, column drag-drop reorder |

**Total**: 27 stories across 8 phases

### MVP Cut (13 stories)
- Phase 0: Stabilize (3 stories)
- Phase 1: Column types (4 stories)
- Phase 3: HubSpot push (4 stories — OPS-012 → 015)
- Phase 5: Cross-op import (2 stories)

Covers the core loop: **get data in** (cross-op, existing CSV/Apollo) → **work with it** (formulas, dropdowns, enrichment) → **push it out** (HubSpot)

### Parallel Execution Groups
- OPS-001 + OPS-002 (stabilize: batch limits || server-side filters)
- OPS-004 + OPS-005 + OPS-006 (column types: dropdown || phone || formula schema)
- OPS-009 + OPS-010 + OPS-011 (integrations: Reoon || Apify || progress UI)
- OPS-024 + OPS-025 (rules: trigger hooks || UI builder)
- OPS-026 + OPS-027 (views: formatting || reordering)

## File Hotspots

These files are modified by 10+ stories — refactoring recommended before starting:

1. **`OpsTableCell.tsx`** (~12 stories) — consider cell renderer registry pattern
2. **`AddColumnModal.tsx`** (~10 stories) — consider pluggable type config system
3. **`opsTableService.ts`** (~15 stories) — consider splitting by domain
4. **`BulkActionsBar.tsx`** (~6 stories) — consider action registry

## HubSpot Integration Reuse

Existing infrastructure that can be directly reused:

| Component | File | Reuse For |
|-----------|------|-----------|
| OAuth flow | `hubspot-oauth-initiate/`, `hubspot-oauth-callback/` | Connection check in HubSpot pull/push |
| API client | `_shared/hubspot.ts` (retry, backoff, 120ms delay) | All HubSpot API calls |
| Credentials | `hubspot_org_credentials` table (service role only) | Token fetch in edge functions |
| Object mappings | `hubspot_object_mappings` table | Track Sixty ↔ HubSpot ID links |
| Properties API | `useHubSpotIntegration.getProperties()` | Field mapping in push/pull modals |
| Lists API | `useHubSpotIntegration` patterns | List selection in push/pull |

## New Migrations Required

| Migration | Table/Change |
|-----------|-------------|
| `20260205000000` | `enrichment_jobs.last_processed_row_index` |
| `20260205000001` | Composite index `(table_id, row_index)` |
| `20260205100000` | `dropdown_options` JSONB, `dropdown`/`tags` types |
| `20260205100001` | `phone`/`checkbox` column types |
| `20260205100002` | `formula` type, `formula_expression` column |
| `20260205200000` | `integration` type, `integration_type`/`integration_config` columns |
| `20260205300000` | `action` type, `action_type`/`action_config` columns |
| `20260205400000` | `hubspot` source type |
| `20260205500000` | `ops_table` source type |
| `20260205600000` | `ops_rules` + `ops_rule_executions` tables |
| `20260205600001` | Rule trigger functions (pg_net webhooks) |
| `20260205700000` | `formatting_rules` JSONB on views |

## Next Steps

```bash
# Start executing
60/dev-run

# Or review/edit plan first
cat .sixty/plan-ops-expansion.json
```
