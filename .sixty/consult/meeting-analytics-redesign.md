# Consult Report: Combined Meeting + Team Analytics Page Redesign

**Generated**: 2026-02-18
**Request**: Merge Meeting Analytics and Team Analytics pages into a single, search-first page inspired by the Intelligence page design.

---

## User Requirements

1. **Combine** Meeting Analytics + Team Analytics into one page
2. **Search-first design** inspired by the Intelligence page (`MeetingIntelligence.tsx`)
3. **Ensure proper light/dark mode** classes with no clashing colors
4. **Responsive graphs** that display correctly on all screen sizes
5. **Compact design** with tabs separating data categories
6. **Ask Anything** as a toggle within the search area
7. **Remove** the standalone Team Analytics page after merge

## Decisions Made

| Question | Answer |
|----------|--------|
| Page layout | Search hero + 4 tabs (Dashboard, Transcripts, Insights, Reports) |
| Team Analytics page | Remove entirely |
| Ask Anything | Toggle mode within search bar area |

---

## Architecture

### New Page Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER: Icon + "Meeting Analytics" + Sync Status Indicator     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  SEARCH HERO CARD (always visible)                       │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │ Gradient accent bar (emerald → teal → cyan)         │ │   │
│  │  │ [🔍 Search icon] [Large input h-14] [Search button] │ │   │
│  │  │ Toggle: [Semantic Search] | [Ask Anything]          │ │   │
│  │  │ Filters: [Team Member] [Sentiment] [Date] [Actions] │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  │  Example queries / Recent searches (when no query)       │   │
│  │  Search results / AI answer (when query active)          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─ TABS ──────────────────────────────────────────────────┐   │
│  │ [Dashboard] [Transcripts] [Insights] [Reports]          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─ TAB CONTENT ───────────────────────────────────────────┐   │
│  │                                                          │   │
│  │  (Varies by active tab - see below)                     │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Tab Content Details

#### Tab 1: Dashboard (merged Overview + Team)
```
┌──────────────────────────────────────────────────┐
│  Period Selector: [7d] [30d] [90d]               │
├──────────────────────────────────────────────────┤
│                                                   │
│  KPI Cards Row (compact, scrollable on mobile)    │
│  [Total Meetings] [Avg Score] [Sentiment]         │
│  [Talk Time] [Action Items] [Team Members]        │
│                                                   │
├──────────────────┬───────────────────────────────┤
│  Meeting Volume  │  Team Comparison Matrix        │
│  Trend Chart     │  (sortable table with          │
│  (3 sub-tabs:    │   sparklines)                  │
│   Volume,        │                                │
│   Sentiment,     │                                │
│   Talk Time)     │                                │
├──────────────────┴───────────────────────────────┤
│  Pipeline Health Cards (compact row)              │
│  Active Alerts (if any, collapsible)              │
└──────────────────────────────────────────────────┘
```

#### Tab 2: Transcripts
- Same as current TranscriptsTab with search filter + paginated table
- TranscriptDetailSheet opens on click (side panel)

#### Tab 3: Insights
- Performance grade distribution chart
- Sentiment distribution pie chart
- Meeting scoreboard (top 10)
- Pattern analysis (strengths / improvements)

#### Tab 4: Reports
- Report generation + preview
- Notification settings
- Report history

---

## Design System: Intelligence Page Pattern

### Glassmorphism Card Base
```css
/* Light mode */
bg-white/80 backdrop-blur-xl rounded-2xl
border border-gray-200/50 shadow-sm

/* Dark mode */
dark:bg-gray-900/40 dark:backdrop-blur-xl dark:rounded-2xl
dark:border-gray-700/30 dark:shadow-lg dark:shadow-black/10
```

### Color Palette
```css
/* Primary accent gradient */
from-emerald-500 via-teal-500 to-cyan-500

/* Search button */
bg-gradient-to-r from-emerald-500 to-teal-600
hover:from-emerald-600 hover:to-teal-700
shadow-lg shadow-emerald-500/25

/* Badges - light */
bg-emerald-100/80 text-emerald-700 border-emerald-200/50
bg-red-100/80 text-red-700 border-red-200/50
bg-amber-100/80 text-amber-700 border-amber-200/50
bg-blue-100/80 text-blue-700 border-blue-200/50

/* Badges - dark */
dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-500/30
dark:bg-red-900/30 dark:text-red-400 dark:border-red-500/30
dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-500/30
dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-500/30
```

### Typography Hierarchy
```css
/* Page title */
text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white

/* Section headers */
text-sm font-medium text-gray-600 dark:text-gray-300

/* Card titles */
font-medium text-gray-900 dark:text-white

/* Body text */
text-sm text-gray-600 dark:text-gray-300

/* Labels */
text-xs text-gray-500 dark:text-gray-400
```

### Interactive States
```css
/* Hover on cards */
hover:border-emerald-500/40 dark:hover:border-emerald-500/30

/* Button hover */
hover:scale-[1.02] active:scale-[0.98]

/* Focus */
focus-visible:ring-2 focus-visible:ring-emerald-500/20
```

### Chart Theming (Recharts)
```css
/* Grid lines */
stroke: light=#E5E7EB dark=#374151

/* Axis text */
fill: light=#6B7280 dark=#9CA3AF

/* Area fill */
fill: url(#gradient) with opacity 0.3

/* Tooltip */
bg-white/90 dark:bg-gray-900/90 backdrop-blur
border-gray-200/50 dark:border-gray-700/30
```

---

## Existing Assets to Reuse

### From Meeting Analytics
| Component | Reuse Strategy |
|-----------|---------------|
| `SearchTab.tsx` | Refactor into search hero (extract from tab, elevate to page level) |
| `AskAnythingPanel.tsx` | Keep as-is, embed in search hero toggle |
| `OverviewTab.tsx` | Merge into Dashboard tab (KPIs + charts) |
| `TranscriptsTab.tsx` | Keep as-is (Tab 2) |
| `InsightsTab.tsx` | Keep as-is (Tab 3) |
| `ReportsTab.tsx` | Keep as-is (Tab 4) |
| `TranscriptDetailSheet.tsx` | Keep as-is (side panel) |
| `NotificationSettingsDialog.tsx` | Keep as-is |
| `useMeetingAnalytics.ts` | Keep all hooks |
| `meetingAnalyticsService.ts` | Keep all service methods |

### From Team Analytics
| Component | Reuse Strategy |
|-----------|---------------|
| `TeamKPIGrid.tsx` | Merge KPI cards into Dashboard tab |
| `TeamTrendsChart.tsx` | Add as chart in Dashboard tab |
| `TeamComparisonMatrix.tsx` | Add as table in Dashboard tab |
| `MetricDrillDownModal.tsx` | Keep for drill-down interactions |
| `useTeamAnalytics.ts` | Keep all hooks |
| `teamAnalyticsService.ts` | Keep all service methods |

### From Intelligence Page (design patterns only)
| Pattern | How to Apply |
|---------|-------------|
| Search hero card layout | Copy card structure, gradient bar, input sizing |
| Filter bar below search | Adapt filters for meeting analytics context |
| Example queries / recent | Add example queries for meeting search |
| Source cards | Adapt for search result display |
| Loading animations | Reuse multi-ring animation pattern |
| Glassmorphism classes | Apply consistently across all components |

---

## Files to Modify

### Primary Changes
| File | Change |
|------|--------|
| `src/pages/MeetingAnalyticsPage.tsx` | Complete restructure: search hero + 4 tabs |
| `src/components/meeting-analytics/SearchTab.tsx` | Refactor into `SearchHero.tsx` (page-level component) |
| `src/components/meeting-analytics/OverviewTab.tsx` | Rename to `DashboardTab.tsx`, merge team components |
| `src/components/meeting-analytics/InsightsTab.tsx` | Update styling to match new design system |
| `src/components/meeting-analytics/TranscriptsTab.tsx` | Update styling to match new design system |
| `src/components/meeting-analytics/ReportsTab.tsx` | Update styling to match new design system |
| `src/components/meeting-analytics/AskAnythingPanel.tsx` | Update styling, ensure works in hero context |
| `src/components/meeting-analytics/TranscriptDetailSheet.tsx` | Update styling |
| `src/components/meeting-analytics/NotificationSettingsDialog.tsx` | Update styling |

### New Files
| File | Purpose |
|------|---------|
| `src/components/meeting-analytics/SearchHero.tsx` | Elevated search component (extracted from SearchTab) |
| `src/components/meeting-analytics/DashboardTab.tsx` | Merged Overview + Team tab |

### Files to Remove
| File | Reason |
|------|--------|
| `src/pages/insights/TeamAnalytics.tsx` | Functionality merged into combined page |
| Route entry for Team Analytics | Remove from router config |

### Files to Keep (move components into DashboardTab)
| File | Notes |
|------|-------|
| `src/components/insights/TeamKPIGrid.tsx` | Import into DashboardTab |
| `src/components/insights/TeamTrendsChart.tsx` | Import into DashboardTab |
| `src/components/insights/TeamComparisonMatrix.tsx` | Import into DashboardTab |
| `src/components/insights/MetricDrillDownModal.tsx` | Import into DashboardTab |

---

## Risk Assessment

| Severity | Risk | Mitigation |
|----------|------|------------|
| Medium | Two data sources (Railway API + Supabase RPCs) | Keep both services, Dashboard tab loads from both |
| Medium | Responsive chart sizing on combined layout | Use CSS grid with minmax, test at all breakpoints |
| Low | Dark mode color clashes in charts | Audit all Recharts colors, use consistent palette |
| Low | Performance with more data on one page | Lazy load tab content, only fetch active tab's data |
| Low | Route changes breaking navigation | Update all references to team analytics route |

---

## Execution Plan (Stories)

### Story 1: Create SearchHero component
**Type**: Frontend | **Est**: 30min
- Extract search functionality from `SearchTab.tsx` into new `SearchHero.tsx`
- Apply Intelligence page design pattern (glassmorphism card, gradient accent, large input)
- Add mode toggle: Semantic Search | Ask Anything
- Integrate filter bar (team member, sentiment, date, action items)
- Add example queries and recent searches
- Display search results / AI answers below
- Full light/dark mode support

### Story 2: Create DashboardTab (merge Overview + Team)
**Type**: Frontend | **Est**: 40min
- Create new `DashboardTab.tsx` component
- Add period selector (7d/30d/90d)
- Merge KPI cards from both pages (select best 6-8 metrics, avoid duplication)
- Side-by-side layout: Team Trends Chart | Team Comparison Matrix
- Add Pipeline Health cards row
- Add Active Alerts (collapsible)
- Import and use existing team components (`TeamKPIGrid`, `TeamTrendsChart`, `TeamComparisonMatrix`)
- Full light/dark mode support with glassmorphism styling

### Story 3: Restructure MeetingAnalyticsPage
**Type**: Frontend | **Est**: 25min
- Restructure page layout: Header → SearchHero → Tabs
- Change tabs: Dashboard, Transcripts, Insights, Reports (remove Search tab, add Dashboard)
- Wire up SearchHero at page level (always visible)
- Update URL params for new tab structure
- Keep TranscriptDetailSheet integration
- Apply Intelligence page header pattern

### Story 4: Restyle all tab components for design consistency
**Type**: Frontend | **Est**: 35min
- Update `InsightsTab.tsx` with glassmorphism cards, proper dark mode classes
- Update `TranscriptsTab.tsx` with matching design
- Update `ReportsTab.tsx` with matching design
- Update `TranscriptDetailSheet.tsx` with matching design
- Update `NotificationSettingsDialog.tsx` with matching design
- Update `AskAnythingPanel.tsx` styling
- Ensure all charts use consistent color palette for both themes
- Audit all Recharts components for responsive sizing

### Story 5: Fix chart responsiveness and theming
**Type**: Frontend | **Est**: 25min
- Wrap all Recharts charts in `ResponsiveContainer` with proper aspect ratios
- Add dark mode colors to all chart grid lines, axes, tooltips
- Test charts at mobile, tablet, desktop breakpoints
- Ensure chart legends are readable in both themes
- Fix any overlapping labels or truncated data

### Story 6: Remove Team Analytics page and update routing
**Type**: Frontend | **Est**: 15min
- Remove `src/pages/insights/TeamAnalytics.tsx` page
- Remove/redirect route in router config
- Update any navigation links pointing to team analytics
- Update sidebar/menu items if applicable
- Verify no broken imports

### Story 7: Final QA pass - dark/light mode audit
**Type**: QA | **Est**: 20min
- Toggle between light and dark mode on every section
- Check all badge colors, chart colors, card borders
- Verify no clashing colors (e.g., light text on light bg)
- Test responsive layouts at 320px, 768px, 1024px, 1440px
- Verify TranscriptDetailSheet renders below top bar
- Test search in both modes (semantic + ask anything)

---

## Dependencies

```
Story 1 (SearchHero) ──┐
                        ├──→ Story 3 (Restructure Page)
Story 2 (DashboardTab) ┘         │
                                  ├──→ Story 4 (Restyle Tabs)
                                  │         │
                                  │         ├──→ Story 5 (Charts)
                                  │         │
                                  ├──→ Story 6 (Remove Team Page)
                                  │
                                  └──→ Story 7 (QA Audit)
```

**Parallel opportunities**: Stories 1 and 2 can run in parallel. Stories 4, 5, and 6 can run in parallel after Story 3.

**Total estimate**: 3-3.5 hours (with parallel execution: ~2.5 hours)
