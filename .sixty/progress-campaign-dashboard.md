# Progress Log — Campaign Management Dashboard (PRD-114)

## Codebase Patterns
<!-- Reusable learnings for this feature -->

- Edge function calls: `supabase.functions.invoke('instantly-admin', { body: { action, org_id, ... } })`
- Service pattern: see `creditService.ts` — typed functions + React Query hooks
- Route config: `routeConfig.ts` with RouteConfig interface (path, access, label, icon, navSection, order)
- Sheet pattern: `!top-16 !h-[calc(100vh-4rem)]` — positions below fixed top bar
- Chart pattern: Recharts `ComposedChart` with `ResponsiveContainer`, dark mode via `useTheme()`
- Filter pattern: `usePipelineFilters.ts` — URL params with `useSearchParams()`
- Instantly status map: 0=Draft, 1=Active, 2=Paused, 3=Completed
- Campaign schedule timezone: must use restricted Instantly enum (see MEMORY.md)
- Reply categories: interested, not_interested, out_of_office, unsubscribe, forwarded, question

## Existing Components to Reuse
- `InstantlyAnalyticsPanel.tsx` — already renders campaign stats, can extract patterns
- `InstantlySyncHistory.tsx` — already queries sync history, can embed in detail sheet
- `InstantlyCampaignPickerModal.tsx` — campaign list with infinite scroll + status tabs
- `CampaignApprovalBanner.tsx` — has activate/pause/review logic
- `SalesActivityChart.tsx` — Recharts pattern to follow

---

## Session Log

### 2026-03-03 — All 10 stories implemented

**Files created:**
- `src/lib/types/campaign.ts` — Campaign, CampaignAnalytics, DailyAnalyticsEntry, ClassifiedReply, CampaignRecommendation, MonitorData, StatusFilter
- `src/lib/services/campaignService.ts` — listCampaigns, getCampaignDetails, getCampaignAnalytics, getDailyAnalytics, createCampaign, activateCampaign, pauseCampaign, deleteCampaign, getMonitorData; hooks: useCampaigns, useCampaignAnalytics, useDailyCampaignAnalytics, useCampaignMonitor, usePauseCampaign, useActivateCampaign, useDeleteCampaign
- `src/lib/hooks/useCampaignFilters.ts` — URL-param status filter hook
- `src/components/campaigns/campaignUtils.ts` — campaignStatusLabel, campaignStatusColor, formatCampaignDate
- `src/components/campaigns/CampaignCard.tsx` — Card with dropdown (pause/resume/delete + confirmation)
- `src/components/campaigns/CampaignDetailSheet.tsx` — Sheet with tabs: overview, replies, recommendations, sync
- `src/components/campaigns/CampaignPerformanceChart.tsx` — Recharts ComposedChart daily bar chart
- `src/components/campaigns/ReplyClassificationPanel.tsx` — Category tabs + reply cards
- `src/components/campaigns/CampaignRecommendationsPanel.tsx` — Severity cards with localStorage dismiss
- `src/components/campaigns/CampaignSyncSection.tsx` — Sync button + history from instantly_sync_history
- `src/pages/campaigns/CampaignsPage.tsx` — Main page with status filter tabs + campaign list

**Files modified:**
- `src/routes/lazyPages.tsx` — Added CampaignsPage lazy export
- `src/App.tsx` — Added /campaigns route (InternalRouteGuard + AppLayout)
- `src/lib/routes/routeConfig.ts` — Added /campaigns nav entry (tools section, order 3.5)
