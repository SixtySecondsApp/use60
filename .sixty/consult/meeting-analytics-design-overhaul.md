# Consult Report: Meeting Analytics Design Overhaul
Generated: 2026-02-18

## User Request
"Design overhaul for the entire /meeting-analytics page to match the other pages. No functionality changes - purely visual upgrade."

## Scope
- **Frontend only** - no backend/service/hook changes
- **No functionality changes** - same data, same interactions, just better visuals
- **Match existing standards** from Dashboard, Pipeline, and Meetings pages

## Reference Pages Analyzed
1. **Dashboard.tsx** - Metric cards with progress bars, gradient icon badges, hover:scale-105
2. **PipelineView.tsx** - Glassmorphism backgrounds, premium filters, health dots with glow
3. **UnifiedMeetingsList.tsx** - Stat cards with backdrop-blur, gradient banners, animated transitions
4. **Clients.tsx** - View toggles, animated tab transitions

## Design System Patterns to Apply

### Card Styling (Current → Target)
```
CURRENT: Card component with default border, rounded-lg
TARGET:  bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl
         border border-gray-200/50 dark:border-gray-700/30
         shadow-sm dark:shadow-lg dark:shadow-black/10
```

### Header Pattern (Current → Target)
```
CURRENT: <h1>Meeting Analytics</h1> <p>subtitle</p>
TARGET:  Icon badge (BarChart3 in colored circle) +
         text-2xl sm:text-3xl font-bold +
         text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1
```

### KPI Cards (Current → Target)
```
CURRENT: Simple Card with icon, value, label
TARGET:  Glassmorphic container, colored icon badge (bg-{color}-500/10 border-{color}-500/20),
         text-2xl sm:text-3xl font-bold value, progress bar, trend indicator,
         hover:scale-105 transition-all duration-300, rounded-3xl p-6 sm:p-7
```

### Chart Containers (Current → Target)
```
CURRENT: Card wrapper with CardHeader/CardContent
TARGET:  Glassmorphic card, gradient section headers,
         premium tooltip styling, h-72 responsive containers
```

### Table Rows (Current → Target)
```
CURRENT: Default table styling
TARGET:  hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors,
         badge-enhanced cells, avatar elements where applicable
```

### Animations
```
CURRENT: Page-level motion.div only
TARGET:  Per-card stagger: transition={{ duration: 0.3, delay: index * 0.03 }}
         Hover lift: whileHover={{ y: -2 }}
         Empty state fade: AnimatePresence mode="wait"
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/MeetingAnalyticsPage.tsx` | Header redesign, tab styling upgrade, page background |
| `src/components/meeting-analytics/OverviewTab.tsx` | KPI cards, chart containers, trends, pipeline cards, alerts |
| `src/components/meeting-analytics/InsightsTab.tsx` | Grade chart, sentiment chart, scoreboard table, patterns cards |
| `src/components/meeting-analytics/TranscriptsTab.tsx` | Search bar, table styling, pagination, delete dialog |
| `src/components/meeting-analytics/SearchTab.tsx` | Mode toggle, result cards, similarity badges |
| `src/components/meeting-analytics/ReportsTab.tsx` | Controls bar, metric cards, highlights, history table |
| `src/components/meeting-analytics/AskAnythingPanel.tsx` | Chat bubbles, source cards, input area, starter questions |
| `src/components/meeting-analytics/TranscriptDetailSheet.tsx` | Section cards, badges, talk time viz, moment cards |
| `src/components/meeting-analytics/NotificationSettingsDialog.tsx` | Setting cards, form styling |
