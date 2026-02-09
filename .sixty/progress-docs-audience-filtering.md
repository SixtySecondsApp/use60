# Progress Log — Docs Audience Filtering

## Codebase Patterns
- DocsPage already had integration + role filtering on metadata JSONB — audience filter follows the same pattern
- `useUserPermissions()` from `@/contexts/UserPermissionsContext` provides `effectiveUserType` ('internal' | 'external')
- `effectiveUserType` respects the "View as External" toggle for internal users
- HelpPanel component fetches article by slug on-demand (lazy loaded when opened)
- Customer articles use `target_audience: ["external", "internal"]` so they're visible to both audiences

## Key Decisions
- Default behavior: articles without `target_audience` field show to all (safe fallback)
- External users get a shorter CATEGORY_ORDER (5 categories vs 16) to only show relevant sections
- All existing 31 articles tagged as internal-only, then 9 re-tagged as shared (getting-started, onboarding, meetings, integrations)
- 5 new customer articles written: Getting Started, Meeting Intelligence, Team Analytics, Dashboard, Settings

---

## Session Log

### 2026-02-08 — All 8 stories ✅

**DOCS-201**: Add target_audience filter to DocsPage.tsx ✅
- Imported `useUserPermissions` hook
- Added audience filter after role filter in the `useMemo` grouping logic
- Filter checks `meta.target_audience` array, skips article if user's `effectiveUserType` not included
- Updated dependency array to include `effectiveUserType`

**DOCS-202**: Add audience toggle UI to DocsAdminPage.tsx ✅
- Added `target_audience` to metadata state (default empty array)
- Added "Target Audience" toggle pills (Internal/External) with emerald color scheme
- Included in save mutation metadata serialization
- Loads existing `target_audience` when editing an article
- Changed visibility grid from 2 to 3 columns

**DOCS-203**: Tag all existing articles with audience metadata ✅
- Migration: `20260208300000_tag_docs_audience.sql`
- All 31 articles tagged — 22 internal-only, 9 shared (getting-started, onboarding, meetings-guide, meeting-recording-setup, 5 integrations)
- Applied to staging via Management API — verified all slugs

**DOCS-204/205/206**: Write customer-facing articles ✅
- Migration: `20260208300001_seed_customer_docs.sql`
- 5 articles: customer-getting-started, customer-meeting-intelligence, customer-team-analytics, customer-dashboard, customer-settings
- All tagged with `target_audience: ["external", "internal"]`
- Applied to staging — verified 36 total articles (14 external-visible, 22 internal-only)

**DOCS-207**: Add HelpPanel to external-facing pages ✅
- Dashboard.tsx: Added HelpPanel linking to `customer-dashboard`
- MeetingIntelligence.tsx: Updated slug from `meeting-intelligence` to `customer-meeting-intelligence`
- TeamAnalytics.tsx: Added HelpPanel linking to `customer-team-analytics`

**DOCS-208**: Update CATEGORY_ORDER for external users ✅
- Split `CATEGORY_ORDER` into `INTERNAL_CATEGORY_ORDER` (16 categories) and `EXTERNAL_CATEGORY_ORDER` (5 categories)
- DocsPage dynamically selects order based on `effectiveUserType`
- External order: Getting Started, Meetings, Core Features, Integrations, Admin & Settings

**Gates**: lint ✅ (no errors) | staging migrations ✅ (all applied)

---

**Files Changed:**
- `src/pages/DocsPage.tsx` — Audience filter + category order split
- `src/pages/platform/DocsAdminPage.tsx` — Audience toggle pills in editor
- `src/pages/Dashboard.tsx` — HelpPanel added
- `src/pages/MeetingIntelligence.tsx` — HelpPanel slug updated
- `src/pages/insights/TeamAnalytics.tsx` — HelpPanel added
- `supabase/migrations/20260208300000_tag_docs_audience.sql` — Tag existing articles
- `supabase/migrations/20260208300001_seed_customer_docs.sql` — 5 customer articles
