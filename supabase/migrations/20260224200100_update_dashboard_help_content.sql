-- Migration: Update dashboard help content for customer-dashboard slug
-- Updates the docs_articles record with comprehensive current feature documentation

UPDATE docs_articles
SET
  title = 'Dashboard Overview',
  content = E'## What is the Dashboard?

Your command center for all sales activity. The dashboard surfaces KPI metrics, team performance, and trend analysis — all filterable by date range.

---

## KPI Metrics Grid

The top row displays four core business metrics:

| Metric | What it Tracks |
|--------|---------------|
| **New Business** | Deals created in the selected period |
| **Outbound** | Outbound activities (calls, emails, LinkedIn) |
| **Meetings** | Meetings held or booked |
| **Proposals** | Proposals sent |

Each card shows the current value, a delta vs the previous period, and a sparkline trend.

:::tip
Hover a KPI card to see the previous period value and percentage change.
:::

---

## Team Performance Section

Below the KPI grid you will find two views:

- **Team KPI Grid** — each team member's totals side-by-side for all four metrics
- **Comparison Matrix** — rank reps against each other to quickly spot outliers

:::info
Only managers and admins can see the full team breakdown. Individual reps see their own stats by default.
:::

---

## Dashboard Tabs

### Overview
High-level snapshot: KPI cards + team grid. The default landing view.

### Activity
Breaks down all logged activities by type (call, email, LinkedIn, meeting) over time. Use this to coach rep behavior.

### Funnel
Visualises deal progression through pipeline stages — from new lead to closed won. Tracks conversion rates at each step.

### Heatmap
Shows activity density by day of week and hour. Helps identify when your team is most and least active.

### Lead Analytics
Aggregates lead source data, showing which channels generate the most qualified pipeline.

:::tip
All tabs respect the global **Date Range Filter** — change it once and every chart updates.
:::

---

## Date Range Filter

Located in the top-right of the dashboard. Choose from presets (This Week, This Month, This Quarter, This Year) or set a custom range.

---

## Activation Checklist

New to the platform? A checklist appears at the top of your dashboard until your account is fully set up:

1. Connect your email
2. Import or add your first contacts
3. Create your first deal
4. Log your first activity

The checklist dismisses automatically once all steps are complete.

---

## Quick Navigation Tips

- Click any **KPI card** to drill into the underlying records
- Click a **rep's name** in the Team Grid to filter the whole page to that rep
- Use the **Export** button (top-right) to download the current view as CSV

:::note
Dashboard data refreshes every 60 seconds. Pull-to-refresh or press **R** to force an immediate reload.
:::
',
  updated_at = NOW()
WHERE slug = 'customer-dashboard';
