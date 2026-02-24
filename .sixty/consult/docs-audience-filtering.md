# Consult Report: Docs Audience Filtering (Internal vs Customer View)

**Generated**: 2026-02-08
**Request**: Make docs relevant depending on whether you're on the internal view or customer view, and load appropriate docs onto the customer view.

## Problem Statement

The docs system currently has 31 articles covering the full platform (CRM, Pipeline, Ops, Copilot, Integrations, etc.), but external (customer) users only have access to ~7 features: Meetings, Intelligence, Team Analytics, Dashboard, Integrations, Docs, and Settings. Showing CRM/Pipeline/Copilot/Ops articles to external users creates confusion and a poor experience.

## Agent Findings

### User Type System (Codebase Scout)

- **Internal vs External** determined by `internal_users` email whitelist table (not domain-based)
- Two key values: `actualUserType` (real) and `effectiveUserType` (after view toggle)
- Internal users can preview external view via `ExternalViewToggle`
- Primary hooks: `useUserPermissions()`, `useEffectiveUserType()`, `useIsViewingAsExternal()`
- Feature access defined in `EXTERNAL_FEATURE_ACCESS` / `INTERNAL_FEATURE_ACCESS` constants

### External User Features

External users have access to (routes with `access: 'any'`):

| Feature | Route | Nav Label |
|---------|-------|-----------|
| Dashboard | `/dashboard` | Dashboard |
| Meetings | `/meetings` | Meetings |
| Intelligence | `/meetings/intelligence` | Intelligence |
| Team Analytics | `/insights/team` | Team Analytics |
| Integrations | `/integrations` | Integrations |
| Docs | `/docs` | Docs |
| Settings | `/settings` | Settings |

**NOT available**: CRM, Pipeline, Contacts, Tasks, Ops, Copilot, Workflows, Activity, Leads, Calls, Voice, Projects, Action Centre

### Current Docs Filtering

The DocsPage already has TWO filtering mechanisms in metadata:
1. `required_integrations` — hide if org doesn't have integration
2. `target_roles` — hide if user role doesn't match (admin/member/viewer)

**Missing**: No `target_audience` or `user_type` filtering. All 31 articles show to all authenticated users regardless of whether they're internal or external.

### Current Categories (16)

```
Getting Started, Core Features, Pipeline & Deals, Meetings, AI Copilot,
Contacts & CRM, Tasks & Activity, Query Bar, Conversations, Workflows,
Recipes, Cross-Table, Insights & Predictions, Integrations, Admin & Settings, Advanced
```

**Relevant to external users**: Getting Started, Meetings, Integrations (partially), Admin & Settings (partially)
**NOT relevant**: Pipeline & Deals, AI Copilot, Contacts & CRM, Tasks & Activity, Query Bar, Conversations, Workflows, Recipes, Cross-Table, Insights & Predictions, Advanced (Ops-specific)

## Synthesis

### Approach: Add `target_audience` metadata field

The simplest, most consistent approach extends the existing metadata filtering pattern:

```jsonb
{
  "target_audience": ["internal"],       // internal-only article
  "target_audience": ["external"],       // customer-only article
  "target_audience": ["internal", "external"],  // both (or omit field)
  // existing fields still work:
  "required_integrations": ["fathom"],
  "target_roles": ["admin"]
}
```

**Why this approach wins:**
1. Consistent with existing `required_integrations` and `target_roles` patterns
2. No schema changes needed (metadata is JSONB — just add a key)
3. DocsPage already has the filtering infrastructure — add one more check
4. Admin CMS already has toggle UI for integrations/roles — add audience toggles
5. `effectiveUserType` already available via `useUserPermissions()` — just read it
6. Works with "View as External" toggle automatically (uses `effectiveUserType`)

### What needs to happen

**1. DocsPage.tsx** — Add audience filter (3 lines):
```typescript
// After integration and role checks, add:
if (meta.target_audience?.length > 0) {
  if (!meta.target_audience.includes(effectiveUserType)) return false;
}
```

**2. DocsPage.tsx** — Get effectiveUserType from permissions hook:
```typescript
const { effectiveUserType } = useUserPermissions();
```

**3. DocsPage.tsx** — Filter categories to only show non-empty ones:
Already done — empty categories are hidden after article filtering.

**4. DocsAdminPage.tsx** — Add audience toggle UI:
Add "Internal" / "External" toggle pills (same pattern as integration/role toggles).

**5. Tag existing articles** with appropriate `target_audience`:
- Internal-only articles (CRM, Pipeline, Copilot, Ops, Tasks): `["internal"]`
- External-relevant articles: `["internal", "external"]` or omit field (show to all)
- External-only articles (future): `["external"]`

**6. Write customer-facing articles** for external features:
- Meetings guide (adapted from internal version)
- Meeting Intelligence / search
- Team Analytics
- Getting started (customer version)
- Integration setup (calendar, Fathom, Fireflies, Notetaker)
- Settings & profile

### Article Audience Mapping

| Article | Audience |
|---------|----------|
| getting-started | both (already generic) |
| onboarding-guide | both |
| pipeline-guide | internal |
| deal-health-scoring | internal |
| meetings-guide | both |
| meeting-recording-setup | both |
| meeting-command-centre | internal |
| contacts-guide | internal |
| contacts-enrichment | internal |
| tasks-guide | internal |
| smart-tasks | internal |
| activity-log | internal |
| copilot-guide | internal |
| copilot-skills | internal |
| copilot-memory | internal |
| integration-hubspot | internal |
| integration-slack | both |
| integration-fathom | both |
| integration-60-notetaker | both |
| integration-fireflies | both |
| integration-apollo | internal |
| integration-instantly | internal |
| integration-justcall | both |
| admin-settings | internal |
| team-management | internal |
| ops-getting-started | internal |
| ops-query-bar | internal |
| tables-and-views | internal |
| workflows-and-automation | internal |
| insights-and-predictions | internal |
| data-enrichment | internal |
| quick-start-guide | internal |

**New customer articles to write:**
- `customer-getting-started` — Tailored welcome for meeting analytics users
- `customer-meeting-intelligence` — How to use semantic search
- `customer-team-analytics` — Understanding team performance metrics
- `customer-dashboard` — Dashboard overview for customers
- `customer-settings` — Account & notification preferences

### Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Forgetting to tag new articles | Low | Default behavior (no tag = show to all) is safe |
| Breaking existing docs for internal users | Low | Adding a filter with fallback (empty = show to all) is non-breaking |
| External users seeing internal content until tagged | Medium | Run SQL UPDATE to tag all existing articles as `["internal"]`, then un-tag the ones that should be `["internal", "external"]` |
| Admin forgets to set audience on new articles | Low | Default "show to all" is reasonable; admin can refine later |

## Recommended Execution Plan

### Group 1: Infrastructure (no dependencies)
| # | Story | Type | Est |
|---|-------|------|-----|
| DOCS-201 | Add `target_audience` filter to DocsPage.tsx | frontend | 10m |
| DOCS-202 | Add audience toggle UI to DocsAdminPage.tsx | frontend | 15m |

### Group 2: Content tagging (depends on Group 1)
| # | Story | Type | Est |
|---|-------|------|-----|
| DOCS-203 | Tag all existing articles with audience metadata | migration | 10m |

### Group 3: Customer content (depends on Group 2)
| # | Story | Type | Est |
|---|-------|------|-----|
| DOCS-204 | Write customer-facing Getting Started article | content | 15m |
| DOCS-205 | Write customer Meeting Intelligence + Team Analytics docs | content | 15m |
| DOCS-206 | Write customer Dashboard + Settings docs | content | 10m |

### Group 4: Polish
| # | Story | Type | Est |
|---|-------|------|-----|
| DOCS-207 | Add HelpPanel to external-facing pages (Dashboard, MeetingIntelligence) | frontend | 10m |
| DOCS-208 | Update CATEGORY_ORDER to show customer-relevant categories first for external users | frontend | 10m |

**Total estimate**: ~1.5 hours
**MVP (Groups 1-2 only)**: ~35 minutes — external users stop seeing irrelevant docs

## Key Files

| File | Changes |
|------|---------|
| `src/pages/DocsPage.tsx` | Add audience filter + effectiveUserType hook |
| `src/pages/platform/DocsAdminPage.tsx` | Add audience toggle pills |
| `supabase/migrations/new_migration.sql` | UPDATE docs_articles SET metadata for audience |
| New seed migration | INSERT customer-facing articles |
