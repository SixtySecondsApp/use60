# Progress Log — 60 Sales Dashboard (March 2026 Impact)

## Plan Summary

| Tier | Features | Stories | Status |
|------|----------|---------|--------|
| Tier 1 — Ship Blockers | 8 | 60 | Pending |
| Tier 2 — High-Impact | 9 | 61 | Pending |
| Tier 3 — Differentiators | 5 | 36 | Pending |
| **Total** | **22** | **157** | **0 complete** |

## Active Feature: Sandbox Funnel + Campaign Links (4 features)

**Goal**: Complete funnel from sandbox demo to signed-up user, plus /t/ personalised links pipeline

| Feature | ID | Stories | Status |
|---------|-----|---------|--------|
| Sandbox Funnel (tour, copilot, CTAs, email capture, analytics) | FNL | 8 | Pending |
| Campaign Links (/t/ pipeline, batch enrichment, manager UI) | CMP | 5 | Pending |
| Lead Intelligence (scoring, Slack alerts, analytics) | LDI | 5 | Pending |
| Signup Data Seeding (demo context -> real account) | SEED | 3 | Pending |
| **Total** | | **22** | |

### Parallel Groups

**Group A (no dependencies — start together):**
- FNL-001 (progress bar) + FNL-003 (interactive copilot) + FNL-005 (contextual CTAs) + FNL-008 (view analytics)
- CMP-001 (apply migration)
- LDI-001 (weighted scoring) + LDI-003 (feature interest tracking)
- SEED-001 (signup URL params)

**Group B (after Group A):**
- FNL-002 (wire tour nudge) — needs FNL-001
- FNL-004 (personalized copilot responses) — needs FNL-003
- FNL-006 (email capture modal)
- CMP-002 (enrichment fn) + CMP-003 (manager UI) + CMP-004 (campaign landing) — all need CMP-001

**Group C (after Group B):**
- FNL-007 (social proof bar) — needs FNL-006
- CMP-005 (batch CSV upload) — needs CMP-002
- LDI-002 (Slack Block Kit alerts) — needs LDI-001
- SEED-002 (onboarding seeding) — needs SEED-001

**Group D (after Group C):**
- LDI-004 (campaign analytics dashboard) — needs LDI-001
- LDI-005 (auto-create lead) — needs LDI-002
- SEED-003 (welcome banner) — needs SEED-002

### What Already Exists (infrastructure built in sandbox-v2/v3)
- `/t/:code` route in App.tsx
- CampaignLanding.tsx — resolves codes, renders SandboxExperience
- campaign_links + campaign_visitors migration (not yet applied)
- campaign-enrich edge function (scaffolded)
- sandbox-lead-alert edge function (scaffolded)
- SandboxTour.tsx — 5-step tour component (not wired in)
- useSandboxTracking — basic engagement scoring + flush
- SandboxDataProvider — has suggestedNextView, visitedViews
- SandboxCopilot — auto-plays scripted convo, input non-interactive

---

## Previous: Edge Function Consolidation (EFC)

**Goal**: Reduce edge function count from ~500 → ~420 (save ~80 functions)
**Stories**: 20 (EFC-001 through EFC-020)
**Estimated**: 6-8 hours total

| Phase | Stories | Functions Saved | Status |
|-------|---------|----------------|--------|
| 1: Delete orphaned/test/demo/deprecated | EFC-001, 002, 003 | 37 | Complete |
| 2: API v1 consolidation | EFC-004, 005 | 5 | Complete |
| 3: OAuth consolidation | EFC-006, 007, 008, 009, 020 | 8 | Complete |
| 4: Polling consolidation | EFC-010, 011 | 5 | Complete |
| 5: Cleanup + backfill consolidation | EFC-012, 013, 014, 015 | 11 | Complete |
| 6: Webhook consolidation | EFC-016, 017, 018, 019 | 12 | Complete |

**Parallel Groups**:
- Phase 1: EFC-001 + EFC-002 + EFC-003 (all independent)
- Phase 3: EFC-006 + EFC-008 (both create new functions, independent)
- Phase 5: EFC-012 + EFC-014 (cleanup + backfill, independent)
- Phase 6: EFC-016 + EFC-017 + EFC-018 (all three webhook routers, independent)

---

## Codebase Patterns

- Edge function calls: `supabase.functions.invoke('name', { body: { action, org_id, ... } })`
- Service pattern: typed functions + React Query hooks (see `creditService.ts`)
- Route config: `routeConfig.ts` with RouteConfig interface (path, access, label, icon, navSection, order)
- Sheet pattern: `!top-16 !h-[calc(100vh-4rem)]` — positions below fixed top bar
- Chart pattern: Recharts ComposedChart with ResponsiveContainer, dark mode via useTheme()
- Filter pattern: URL params with useSearchParams() (see usePipelineFilters.ts)
- Use `maybeSingle()` when record might not exist, `single()` only when MUST exist
- Explicit column selection in edge functions — never `select('*')`
- Use `getCorsHeaders(req)` from `_shared/corsHelper.ts` for CORS
- Pin `@supabase/supabase-js@2.43.4` on esm.sh

## Cross-Feature Dependencies

```
PRD-101 (Command Centre) <- PRD-102 (Feature Dedup) depends on CC-001
PRD-101 (Command Centre) <- PRD-103 (Autonomy) routes through CC
PRD-114 (Campaigns) <- PRD-115 (Outreach Analytics) feeds from campaign data
```

## Execution Order (Tier 1)

### Parallel Group A (no dependencies)
- PRD-101: Command Centre Consolidation (9 stories)
- PRD-103: Autonomy Dashboard Polish (8 stories)
- PRD-114: Campaign Management Dashboard (10 stories)
- PRD-116: Forecast Dashboard (7 stories)
- PRD-118: Global Search & Command Palette (7 stories)
- PRD-123: Setup Wizard & Activation Checklist (7 stories)

### Sequential after Group A
- PRD-102: Feature Catalogue Dedup (5 stories) — after CC-001
- PRD-115: Outreach Analytics (7 stories) — after CAMP stories

---

## Session Log

### 2026-03-03 — CC-001 through CC-009 (impl-1)

**PRD-101: Command Centre Consolidation — COMPLETE**

All 9 CC stories delivered. Key findings: most of the core work was already implemented in previous sessions. Work done:

- **CC-001**: Created `src/components/command-centre/CommandCentre.tsx` re-export. Production CC was already at `src/pages/platform/CommandCentre.tsx` with full feed+detail layout.
- **CC-002**: Created `supabase/functions/_shared/cc/emitter.ts` — thin wrapper around `writeAdapter.ts` with `emitCCItem()` and `emitCCItems()` API. `writeAdapter.ts` was already a complete implementation.
- **CC-003**: Updated `slackBlocks.ts` — added `appUrl` param to `buildCommandCentreDigest`, per-item "View in CC" button with `/command-centre?item={id}` deep link URL.
- **CC-004**: Replaced `ActionCentre.tsx` (557-line old page) with redirect stub. Fixed `ActionCard.tsx` import to use `action-centre/types.ts`. Route `/action-centre` redirect already in `App.tsx`.
- **CC-005**: Already complete — routeConfig.ts has CC in nav with Inbox icon + AppLayout has badge wired.
- **CC-006**: Already complete — `useCommandCentreRealtime` already wired in CommandCentre.tsx.
- **CC-007**: Already complete — compression layout (flex row, feed + CCDetailPanel side panel) already in CommandCentre.tsx.
- **CC-008**: Already complete — approve/dismiss/undo with 5-second undo window already in CCDetailPanel + CCItemCard.
- **CC-009**: Created `tests/unit/cc-integration.test.ts` — 12 passing tests covering emitter API, status transitions, deep link shape, Slack notification deep links, undo timer, realtime cache invalidation.

**Commit**: `2cdf3492`

### 2026-03-03 — DEDUP-001 through DEDUP-005 (impl-1)

**PRD-102: Feature Catalogue Deduplication — COMPLETE**

All 5 DEDUP stories delivered:

- **DEDUP-001**: Audited `feature_list.html` — all 7 duplicate features (`command-centre`, `email-action-centre`, `agent-fleet`, `slack-copilot`, `competitive-intel`, `crm-writeback`, `semantic-search`) were already removed in prior sessions.
- **DEDUP-002**: Merged features confirmed — `competitive-intel-agent` subsumes `competitive-intel`; `crm-auto-update` subsumes `crm-writeback`. Both already in catalogue.
- **DEDUP-003**: Added 3 new features reflecting shipped Tier 1 work: `command-centre` (consolidated hub), `forecast-dashboard`, and `outreach-analytics`. Feature count updated 65 → 68 in header, stats bar, and footer.
- **DEDUP-004**: Audited source files for orphaned feature references. Routes `/action-centre` and `/email-actions` correctly marked `showInNav: false` with deprecation comments. No marketing-facing orphaned references found.
- **DEDUP-005**: Architecture diagram reviewed — `command-centre.mermaid` and `slack-copilot.mermaid` references are architecture diagrams (not feature catalogue entries) and are correct.

### 2026-03-03 — COMP-001 through COMP-007 (impl-1)

**PRD-105: Competitive Intelligence Library — COMPLETE**

All 7 COMP stories were already implemented in prior sessions. Verified and lint-checked:

- **COMP-001**: `CompetitiveIntelPage.tsx` — two-panel layout with sidebar competitor list, search, win/loss mini-bar, auto-select first competitor.
- **COMP-002**: `CompetitorProfileView.tsx` + `BattlecardViewer.tsx` — viewable/editable battlecard, admin-gated edit mode, AI-generated badge.
- **COMP-003**: `MentionFrequencyChart.tsx` — Recharts BarChart with 30/60/90d toggle, weekly bucketing for longer windows.
- **COMP-004**: `MentionedInDeals.tsx` — deal links with sentiment icon, outcome badge, mention context, show more/less.
- **COMP-005**: Win/loss ratio stats card in `CompetitorProfileView.tsx` — win rate %, wins, losses, progress bar.
- **COMP-006**: `DealCompetitorSection.tsx` wired into `DealIntelligenceSheet.tsx:876` — competitor badges link to `/intelligence/competitive?competitor=NAME`.
- **COMP-007**: `useCompetitiveIntel.ts` — `useCompetitorProfiles`, `useCompetitorProfile`, `useMentionFrequency`, `useMentionsWithDeals`, `useUpdateBattlecard` hooks.
- Route `/intelligence/competitive` registered in `routeConfig.ts` and `App.tsx`.

No new code written — all stories pre-implemented.

