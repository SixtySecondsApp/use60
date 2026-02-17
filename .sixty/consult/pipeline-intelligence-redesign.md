# Pipeline Intelligence Redesign — Consultation Brief

**Date**: 2026-02-16
**Scope**: Pipeline + Deal Health + Relationship Health — full redesign, unification, and copilot integration

---

## Executive Summary

The pipeline, deal health, and relationship health features were built early and have fallen behind the rest of the application in design quality, performance, and system integration. This brief defines a comprehensive refactor that:

1. **Dissolves separate health dashboards** — merges all intelligence into the pipeline as a first-class layer
2. **Redesigns the pipeline** from scratch with a data-rich, Attio/HubSpot-style aesthetic
3. **Creates a standard Deals ops table** with health scores as enrichable columns
4. **Adds event-driven health recalculation** with real-time proactive copilot alerts
5. **Pushes health scores to CRMs** (HubSpot/Attio) for bidirectional visibility
6. **Cuts API calls from ~105 to <20** on pipeline load

---

## Current State Analysis

### Performance Problems

| Issue | Impact | Current | Target |
|-------|--------|---------|--------|
| N+1 deal splits query | 50 deals = 50 queries | Per-card `useDealSplits()` | Single batched query |
| N+1 company logos | 50 deals = 50 edge function calls | Per-card `useCompanyLogo()` | Batch fetch + client cache |
| No DealCard memoization | Full re-render cascade on any update | No `React.memo()` | Memoized with stable props |
| Deep clone on drag | `structuredClone()` of all deals per context change | Line 199 Pipeline.tsx | Shallow clone or ref-based |
| **Total queries (50 deals)** | **~105 calls** | 2 + 3 + 50 + 50 | **<20 calls** |

### Architecture Problems

| Problem | Detail |
|---------|--------|
| 3 siloed systems | Deal health dashboard (689 lines), Relationship health dashboard (725 lines), Pipeline (891 lines) — all separate pages |
| 3 separate scoring engines | `dealHealthService.ts` (819 lines), `relationshipHealthService.ts`, `deal_risk_scores` table — no shared abstractions |
| Health is optional in copilot | `include_health` flag on `get_deal` — not deeply woven into context |
| Daily batch refresh only | `scheduled-health-refresh` cron job — no event-driven recalculation |
| No Deals ops table | Standard tables exist for Leads, Meetings, Contacts, Companies — but not Deals |
| No CRM health push | Health scores stay internal — not synced to HubSpot/Attio |

### Design Problems

| Problem | Detail |
|---------|--------|
| Inconsistent card design | DealCard.tsx (300+ lines) doesn't match modern app aesthetic |
| Information scattered | Must visit 3 separate pages to understand a deal's full health picture |
| No progressive disclosure | Either too little info (pipeline card) or too much (health dashboard) |
| Separate health dashboards | Feel like admin tools, not integrated sales intelligence |

---

## Design Decisions (Confirmed)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Health architecture | **Merge into pipeline** | Dissolve separate dashboards; health becomes a layer within pipeline |
| Pipeline UX | **Full redesign** | New card design, integrated health/relationship context, split-view layout |
| Deal detail interaction | **Right-side sheet panel** | Click card opens Sheet with full deal intelligence; pipeline stays visible |
| Design aesthetic | **Data-rich (Attio/HubSpot-style)** | Information density upfront — health indicators, scores, tags, activity visible on cards |
| Ops integration | **Standard Deals table** | 5th standard ops table with health as enrichable columns |
| Health refresh | **Event + schedule hybrid** | Recalc on key events (stage change, meeting, 7+ day gap) + daily sweep |
| CRM sync | **Bidirectional** | Push health scores + risk levels to HubSpot/Attio custom properties |
| Proactive AI | **Real-time alerts** | Event-driven copilot notifications when health changes significantly |
| Alert channels | **Slack + in-app** | Critical alerts to Slack, all alerts in copilot chat; user-configurable thresholds |
| Performance target | **As few as reasonable (<20)** | Batch everything; no per-card queries; consider single RPC approach |

---

## Target Architecture

### 1. Unified Pipeline Intelligence View

```
┌──────────────────────────────────────────────────────────────────────┐
│ PIPELINE                                                    [Views] │
│ ┌──────────────────────────────────────────────────────────────────┐│
│ │ Header: Total $2.4M | Weighted $1.1M | 23 Deals                ││
│ │ Filters: [Stage ▼] [Health ▼] [Risk ▼] [Owner ▼] [Search...]  ││
│ │ Quick Stats: 🟢 12 Healthy  🟡 6 Warning  🔴 3 Critical  👻 2  ││
│ └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│ ┌─ KANBAN VIEW ───────────────────────────┐ ┌─ DEAL SHEET ────────┐│
│ │                                         │ │                      ││
│ │  SQL    │ Opportunity │ Verbal │ Signed │ │ Acme Corp — $50K     ││
│ │  ────── │ ─────────── │ ────── │ ────── │ │ Stage: Opportunity   ││
│ │         │             │        │        │ │                      ││
│ │ ┌─────┐ │ ┌─────────┐ │        │        │ │ ── Health ────────── ││
│ │ │Card │ │ │  CARD   │◄│────────│────────│─│ Deal: 72/100 🟡     ││
│ │ │     │ │ │ ▪health │ │        │        │ │ Relationship: 45 🔴 ││
│ │ │     │ │ │ ▪risk   │ │        │        │ │ Ghost Risk: 35%     ││
│ │ └─────┘ │ │ ▪trend  │ │        │        │ │                      ││
│ │ ┌─────┐ │ │ ▪days   │ │        │        │ │ ── Signals ──────── ││
│ │ │Card │ │ └─────────┘ │        │        │ │ ⚠ No meeting 21d   ││
│ │ └─────┘ │ ┌─────────┐ │        │        │ │ ⚠ Sentiment ↓      ││
│ │         │ │ Card    │ │        │        │ │ ✓ Response <4h      ││
│ │         │ └─────────┘ │        │        │ │                      ││
│ │         │             │        │        │ │ ── Next Actions ──── ││
│ │         │             │        │        │ │ 1. Send check-in    ││
│ │         │             │        │        │ │ 2. Book meeting     ││
│ │         │             │        │        │ │                      ││
│ │         │             │        │        │ │ [Ask Copilot] [Edit] ││
│ └─────────┴─────────────┴────────┴────────┘ └──────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

### 2. Redesigned Deal Card (Data-Rich)

```
┌─────────────────────────────────┐
│ ● Acme Corp                $50K │  ← Company + value
│ Enterprise License Renewal      │  ← Deal name
│─────────────────────────────────│
│ 🟡 72  │ 🔴 45  │ 📅 14d │ ↗️  │  ← Health score | Rel health | Days in stage | Trend
│─────────────────────────────────│
│ ▸ 2 risks │ ▸ 1 action │ J.S. │  ← Risk count | Pending actions | Owner avatar
└─────────────────────────────────┘
```

**Card shows at a glance:**
- Company name + deal value (header)
- Deal name (subtitle)
- Deal health score (color-coded)
- Relationship health score (color-coded)
- Days in current stage
- Trend indicator (improving/stable/declining)
- Risk factor count
- Pending action count
- Owner avatar/initials

### 3. Deal Intelligence Sheet Panel

When a deal card is clicked, a right-side Sheet opens (`!top-16 !h-[calc(100vh-4rem)]` per CLAUDE.md):

**Sections:**
1. **Header** — Company, deal name, value, stage, close date, owner
2. **Health Overview** — Combined deal + relationship health with sparkline trends
3. **Risk Signals** — Merged risk factors from both health systems, sorted by severity
4. **Ghost Detection** — Active ghost signals with probability and recommended action
5. **Recent Activity Timeline** — Last 10 interactions (meetings, emails, calls)
6. **Sentiment Trend** — Chart showing sentiment over last 30 days
7. **Next Best Actions** — AI-generated ranked actions from `next_action_suggestions`
8. **Related Contacts** — Key contacts with their individual relationship health
9. **Quick Actions** — "Ask Copilot", "Log Activity", "Schedule Meeting", "Send Email"

### 4. Data Flow (Target)

```
                    ┌───────────────────────────┐
                    │  Single Pipeline RPC       │
                    │  get_pipeline_with_health  │
                    │                            │
                    │  Returns:                  │
                    │  - deals[]                 │
                    │  - deal_health_scores[]    │
                    │  - relationship_health[]   │
                    │  - next_actions[]          │
                    │  - deal_splits[]           │
                    │  - stage_metrics           │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │  React Query Cache         │
                    │  queryKey: ['pipeline',    │
                    │    orgId, filters, sort]   │
                    │  staleTime: 30s            │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────┼──────────────┐
                    ▼             ▼               ▼
              PipelineHeader  DealCards[]    DealSheet
              (aggregated     (memoized,     (lazy-loaded
               metrics)       stable props)   on click)
```

**Target: 1-3 queries on page load** (pipeline RPC + optional logo batch + sheet detail on demand)

### 5. Standard Deals Ops Table

**Schema (system columns):**

| Column | Type | Source | Notes |
|--------|------|--------|-------|
| deal_name | text | app | Synced from `deals` table |
| company_name | text | app | From deal.company |
| deal_value | currency | app | From deal.value |
| stage | single_select | app | From deal_stages.name |
| close_date | date | app | From deal.expected_close_date |
| owner | user | app | From deal.owner_id |
| deal_health_score | number | computed | From `deal_health_scores.overall_health_score` |
| deal_health_status | single_select | computed | healthy/warning/critical/stalled |
| relationship_health_score | number | computed | From `relationship_health_scores.overall_health_score` |
| relationship_health_status | single_select | computed | healthy/at_risk/critical/ghost |
| risk_level | single_select | computed | low/medium/high/critical |
| risk_factors | multi_select | computed | From `deal_health_scores.risk_factors` |
| days_in_stage | number | computed | Calculated from `stage_changed_at` |
| ghost_probability | number | computed | From `relationship_health_scores.ghost_probability_percent` |
| sentiment_trend | single_select | computed | improving/stable/declining |
| last_meeting_date | date | computed | From meetings table |
| last_activity_date | date | computed | From activities table |
| next_action | text | computed | From `next_action_suggestions` |

**User-addable enrichment columns:** (on top of system columns)
- AI research columns (e.g., "Score likelihood to close 1-5 based on {risk_factors} and {days_in_stage}")
- Apollo/Exa enrichment on company domain
- Custom formula columns
- Integration columns (HubSpot property sync)

### 6. Event-Driven Health Recalculation

**Trigger Events:**

| Event | Recalculates | Source |
|-------|-------------|--------|
| Deal stage changed | Deal health | `deals` UPDATE trigger |
| Meeting completed | Deal health + Relationship health | `meetings` INSERT/UPDATE |
| Activity logged | Deal health + Relationship health | `activities` INSERT |
| 7+ days no activity | Deal health | Daily sweep |
| Email sent/received | Relationship health | `communication_events` INSERT |
| Sentiment score updated | Both | `meetings` UPDATE (sentiment_score) |
| Ghost signal detected | Relationship health | Ghost detection service |

**Implementation:** PostgreSQL triggers → `pg_notify` → Edge function listener → Recalculate → Upsert scores → Supabase Realtime → Frontend auto-updates

### 7. Proactive Copilot Alerts

**Alert Triggers:**

| Condition | Severity | Channels | Copilot Action |
|-----------|----------|----------|---------------|
| Health drops >20 points in 7 days | Critical | Slack + In-app | Suggests rescue plan |
| Ghost probability >60% | Critical | Slack + In-app | Suggests intervention |
| No activity for 14+ days | Warning | In-app | Suggests next action |
| Stage stall >2x average | Warning | In-app | Suggests acceleration |
| Sentiment declining 3+ meetings | Warning | In-app | Suggests check-in |
| Deal close date <7 days + health <50 | Critical | Slack + In-app | Suggests rescue + escalation |

**Copilot Message Format:**
```
🔴 Deal Alert: Acme Corp Enterprise License ($50K)

Health dropped from 78 → 52 in the last 5 days.

Signals:
- No response to last 2 emails (sent Feb 10, Feb 13)
- Last meeting was 18 days ago
- Sentiment declining over last 3 interactions

Suggested Actions:
1. Send a pattern-interrupt email (different angle)
2. Try reaching Sarah Chen via LinkedIn instead of email
3. Loop in their VP Engineering who showed interest in the demo

[Open Deal] [Draft Email] [Schedule Call]
```

### 8. CRM Bidirectional Sync

**Push to HubSpot/Attio:**

| 60 Field | HubSpot Custom Property | Attio Custom Field |
|----------|------------------------|-------------------|
| deal_health_score | `sixty_deal_health_score` (number) | `Deal Health Score` (number) |
| health_status | `sixty_health_status` (enumeration) | `Health Status` (select) |
| risk_level | `sixty_risk_level` (enumeration) | `Risk Level` (select) |
| relationship_health_score | `sixty_relationship_health` (number) | `Relationship Health` (number) |
| ghost_probability | `sixty_ghost_risk` (number) | `Ghost Risk %` (number) |
| days_in_stage | `sixty_days_in_stage` (number) | `Days in Stage` (number) |

**Sync Frequency:** On every health score recalculation (event-driven)
**Direction:** 60 → CRM (health scores are computed in 60, pushed out)

---

## Phased Execution Plan

### Phase 1: Performance & Data Layer (Foundation)
> Fix the N+1 queries, create the unified data RPC, establish the standard Deals ops table

**Stories:**
1. Create `get_pipeline_with_health` PostgreSQL RPC — single query returning deals + health + relationship + splits + next actions
2. Refactor `useBatchedDealMetadata` to use the new RPC — eliminate all per-card queries
3. Add company logo caching layer (domain → URL map with 24h TTL in React Query)
4. Wrap `DealCard` in `React.memo()` with stable batched props
5. Create standard Deals ops table schema + provisioning migration
6. Add `sync_deals_to_ops_table` function that populates/refreshes the ops table from `deals` + health scores
7. Wire standard Deals ops table into `provision-standard-ops-tables` edge function

### Phase 2: Pipeline Redesign (UI/UX)
> Full redesign of pipeline with data-rich cards, sheet panel, merged health layer, and mobile responsiveness

**Stories:**
8. Design and implement new `DealCard` component — data-rich Attio-style with health scores, risk count, trend, days-in-stage
9. Build `DealIntelligenceSheet` — right-side panel with full deal + relationship + ghost + timeline context
10. Redesign `PipelineHeader` — integrated health stats (healthy/warning/critical/ghost counts), better filters including health and risk
11. Refactor `Pipeline.tsx` — cleaner architecture, new layout with sheet integration, remove 891-line monolith
12. Update `PipelineTable` view to include health columns and inline health indicators
13. Remove standalone `DealHealthDashboard` and `RelationshipHealthDashboard` pages — redirect to pipeline with appropriate filters
14. Build `DealHealthTrendSparkline` — compact inline chart component for cards and sheet
15. Mobile-responsive pipeline — cards stack vertically on mobile, kanban collapses to filterable list, sheet becomes full-screen overlay

### Phase 3: Event-Driven Health & Proactive AI
> Real-time health recalculation and copilot-driven alerts

**Stories:**
16. Create PostgreSQL triggers on `deals`, `meetings`, `activities`, `communication_events` that fire `pg_notify` on relevant changes
17. Build `health-recalculate` edge function that listens for events and recalculates affected deal + relationship health scores
18. Build proactive alert evaluation — when health score changes, evaluate alert rules and generate copilot messages
19. Implement Slack alert delivery for critical health changes (using existing Slack integration)
20. Implement in-app copilot proactive messages — health alerts appear in copilot chat with suggested actions
21. Add user-configurable alert thresholds (settings page: which alerts, which channels, severity filters)

### Phase 4: Ops Table Integration & CRM Sync
> Standard Deals table enrichment + bidirectional CRM push

**Stories:**
22. Wire health score computed columns in Deals ops table — auto-update on health recalculation events
23. Add AI enrichment columns for deals (e.g., "close probability reasoning", "risk mitigation suggestion")
24. Build HubSpot custom property provisioning — create `sixty_*` properties on first sync
25. Build Attio custom field provisioning — create health fields on first sync
26. Implement health score → CRM push on every recalculation
27. Add CRM sync status indicators in pipeline UI (last synced, sync errors)

### Phase 5: Copilot Deep Integration
> Make the copilot truly deal-health-aware with intervention skills

**Stories:**
28. Update `copilot-autonomous` to always include health context when discussing deals (remove `include_health` flag — always include)
29. Update deal-related skills to reference health + relationship data in their instructions
30. Build new copilot structured response component: `DealIntelligenceResponse` — unified view replacing separate health/pipeline responses
31. Add "Ask Copilot about this deal" action in DealIntelligenceSheet that pre-loads full deal context
32. Create new skill: `deal-intelligence-summary` — generates narrative summary of deal health, relationship health, risk signals, and recommended actions
33. Create new skill: `deal-reengagement-intervention` — copilot-driven re-engagement that replaces the standalone intervention template UI. Uses ghost detection signals, relationship context, and communication history to generate personalized outreach (permission-to-close, value-add, pattern-interrupt, soft check-in, channel switch). Tracks intervention outcomes for continuous improvement.
34. Remove standalone intervention template library UI (`TemplateLibrary.tsx`, `InterventionModal.tsx`) — copilot handles interventions conversationally

---

## Key Technical Decisions

### Single RPC vs Multiple Queries

**Recommendation: Single PostgreSQL RPC (`get_pipeline_with_health`)**

```sql
CREATE OR REPLACE FUNCTION get_pipeline_with_health(
  p_user_id UUID,
  p_org_id TEXT,
  p_filters JSONB DEFAULT '{}'
)
RETURNS JSONB AS $$
  -- Returns: { deals, health_scores, relationship_scores, next_actions, splits, stage_metrics }
  -- Single round-trip, all joins done in PostgreSQL
$$;
```

**Benefits:** 1 query instead of 5+, all joins server-side, filterable, sortable, pageable.

### Health Score Storage

Keep `deal_health_scores` and `relationship_health_scores` as separate tables (they have different signal schemas), but expose them via:
1. The pipeline RPC (joined, denormalized for UI)
2. The standard Deals ops table (computed columns)
3. The copilot context (always included)

### Component Architecture

```
src/components/pipeline/           (renamed from Pipeline/)
  PipelineView.tsx                 (orchestrator, <400 lines)
  PipelineHeader.tsx               (filters, stats, view toggle)
  PipelineKanban.tsx               (DnD kanban view)
  PipelineTable.tsx                (table view, updated)
  DealCard.tsx                     (data-rich card, memoized)
  DealIntelligenceSheet.tsx        (right panel)
  DealHealthSignals.tsx            (health signal grid)
  DealRiskFactors.tsx              (risk factor chips)
  DealActivityTimeline.tsx         (recent activity)
  DealTrendChart.tsx               (sparkline charts)
  hooks/
    usePipelineData.ts             (single RPC hook)
    useDealSheet.ts                (sheet state + lazy detail fetch)
    usePipelineFilters.ts          (filter/sort/search state)
```

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Pipeline load queries | ~105 | <10 |
| Pipeline initial load time | ~3-4s (estimated) | <1s |
| Pages to understand a deal's health | 3 (Pipeline + Deal Health + Relationship Health) | 1 (Pipeline + Sheet) |
| Copilot deal health context | Optional (flag-based) | Always included |
| Health refresh latency | 24 hours (daily batch) | <5 minutes (event-driven) |
| CRM health visibility | None | Real-time push to HubSpot/Attio |
| Proactive alerts | None | Slack + in-app on critical changes |

---

## Files Affected (Major)

### Modified
- `src/components/Pipeline/*` → refactored to `src/components/pipeline/*`
- `src/lib/contexts/PipelineContext.tsx` → simplified (RPC replaces multiple hooks)
- `src/lib/hooks/deals/useDeals.ts` → replaced by `usePipelineData.ts`
- `src/lib/hooks/useBatchedDealMetadata.ts` → absorbed into pipeline RPC
- `src/lib/services/dealHealthService.ts` → add event-driven recalculation
- `src/lib/services/relationshipHealthService.ts` → add event-driven recalculation
- `supabase/functions/copilot-autonomous/index.ts` → always include health
- `supabase/functions/provision-standard-ops-tables/index.ts` → add Deals table
- `src/lib/services/standardTableSync.ts` → add deals sync

### New
- `src/components/pipeline/DealIntelligenceSheet.tsx`
- `src/components/pipeline/DealCard.tsx` (new design)
- `src/components/pipeline/hooks/usePipelineData.ts`
- `supabase/functions/health-recalculate/index.ts`
- `supabase/migrations/YYYYMMDD_pipeline_intelligence_rpc.sql`
- `supabase/migrations/YYYYMMDD_standard_deals_ops_table.sql`
- `supabase/migrations/YYYYMMDD_health_event_triggers.sql`
- `skills/atomic/deal-intelligence-summary/SKILL.md`
- `skills/atomic/deal-reengagement-intervention/SKILL.md`

### Removed (merged into pipeline or replaced by copilot skills)
- `src/pages/DealHealthPage.tsx` → redirect to `pipeline?health=critical`
- `src/components/DealHealthDashboard.tsx` → merged into pipeline
- `src/pages/RelationshipHealth.tsx` → redirect to `pipeline?risk=high`
- `src/components/relationship-health/RelationshipHealthDashboard.tsx` → merged into pipeline
- `src/components/relationship-health/TemplateLibrary.tsx` → replaced by `deal-reengagement-intervention` skill
- `src/components/relationship-health/InterventionModal.tsx` → replaced by copilot conversational interventions

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Single RPC becomes a bottleneck | Medium | Add index hints, EXPLAIN ANALYZE, consider materialized view for heavy aggregations |
| Event-driven triggers create too much load | Medium | Debounce: max 1 recalc per deal per 5 minutes; queue-based processing |
| CRM rate limits on health push | Low | Batch pushes every 15 min instead of per-event; respect HubSpot 100/10s limit |
| Removing standalone dashboards breaks bookmarks/links | Low | Redirect old URLs to pipeline with equivalent filters |
| Pipeline RPC returns too much data for large orgs | Medium | Add pagination support (LIMIT/OFFSET) and stage-level lazy loading |

---

## Resolved Questions

1. **Deals ops table**: Read-only rows (auto-synced from `deals` table + health scores). Users **cannot** add rows manually. Users **can** add custom columns, enrichments, and formula columns on top of the system columns.
2. **Intervention system**: Remove the standalone intervention template library UI. Instead, create a powerful **copilot skill** (`deal-reengagement-intervention`) that generates personalized re-engagement messages using ghost detection signals, relationship context, and communication history. The copilot handles interventions conversationally — no separate template management UI needed.
3. **Mobile responsive**: Yes — the pipeline redesign must be mobile-responsive. Cards should stack vertically on mobile, sheet panel becomes full-screen, and the kanban view collapses to a filterable list on small screens.
