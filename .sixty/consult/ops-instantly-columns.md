# Ops × Instantly Column Integration — Consult Report

**Date**: 2026-02-07
**Feature**: Move Instantly from top-bar buttons into the Ops table column system
**Replaces**: Previous top-bar overlay approach (ops-instantly-integration.md)

---

## Goal

Transform Instantly from a top-bar action set into a **first-class column type** in the Ops table, following the pattern established by Apollo Property and HubSpot Property columns. Users interact with Instantly entirely through columns — adding, configuring, pushing, syncing, and viewing analytics.

---

## User Requirements (from consult)

1. **Column-based, not top-bar** — Remove all Instantly buttons from top bar
2. **First column triggers campaign setup** — Inline onboarding: API key → campaign → field mapping
3. **Three sequence content modes**:
   - Use existing Instantly sequence as-is
   - Map table columns to `{{custom_variables}}` for personalization
   - Author full sequence steps from table columns (with auto-scaffolding)
4. **Engagement data columns** — Per-row metrics (reply count, open count, status, etc.)
5. **Action columns** — Button to push row(s) to campaign
6. **Summary row** — Aggregate campaign analytics at table level
7. **Campaign creation via API** — Create campaigns from within the Ops table
8. **Inline connection flow** — API key entry within add column modal if not connected

---

## Architecture

### New Column Type: `instantly`

Added to the column type union alongside `apollo_property`, `hubspot_property`.

#### Column Subtypes (via `integration_config.instantly_subtype`)

| Subtype | Purpose | Editable | Auto-created |
|---------|---------|----------|-------------|
| `campaign_config` | Campaign link + field mapping + sequence mode | No (display only) | On first column add |
| `push_action` | Button to push row to campaign | No | User adds |
| `engagement_status` | Lead interest status from Instantly | No | On sync |
| `email_status` | Sent/opened/replied/bounced | No | On sync |
| `last_contacted` | Timestamp of last email | No | On sync |
| `reply_count` | Number of replies | No | On sync |
| `open_count` | Number of opens | No | On sync |
| `sequence_step` | Email step content (subject + body) | Yes | User adds or auto-scaffold |

#### Integration Config Shape

```typescript
interface InstantlyColumnConfig {
  instantly_subtype:
    | 'campaign_config'
    | 'push_action'
    | 'engagement_status'
    | 'email_status'
    | 'last_contacted'
    | 'reply_count'
    | 'open_count'
    | 'sequence_step'

  // For campaign_config subtype
  campaign_id?: string
  campaign_name?: string
  field_mapping?: InstantlyFieldMapping
  sequence_mode?: 'use_existing' | 'map_variables' | 'author_steps'

  // For push_action subtype
  push_config?: {
    campaign_id: string
    auto_field_mapping: boolean  // true = use campaign_config mapping
  }

  // For sequence_step subtype
  step_config?: {
    step_number: number
    field: 'subject' | 'body'
  }

  // For engagement subtypes (auto-created)
  engagement_field?: string  // 'interest_status_label' | 'lead_status' | etc.
}
```

---

## Add Column Flow (First Instantly Column)

### Step 1: Connection Check
- User clicks "Add Column" → selects "Instantly" type
- System checks `instantly_org_integrations` for connection status
- **If not connected**: Show inline API key input → validate → store

### Step 2: Campaign Selection
- Fetch campaigns from `instantly-admin` `list_campaigns`
- **Pick existing**: Select from dropdown with search + status badges
- **Create new**: Name + optional schedule → `create_campaign` action

### Step 3: Sequence Mode
Three options presented as cards:

1. **Use Existing Sequence** — "Campaign already has email steps in Instantly"
   - No additional config needed
   - Just shows campaign info

2. **Map Variables** — "Send personalized content from your table columns"
   - Shows Instantly `{{custom_variables}}` available in the campaign
   - Dropdown per variable → pick source column
   - Preview first 3 rows with resolved variables

3. **Author Steps** — "Create email sequence from table columns"
   - Shows number of steps to create
   - For each step: subject column + body column pickers
   - Option to auto-scaffold columns: creates "Step N Subject" + "Step N Body" columns
   - Content pushed as sequence steps to Instantly API

### Step 4: Field Mapping
- Auto-detect: email, first_name, last_name, company_name
- User can adjust mappings
- Custom variables from other columns

### Step 5: Column Creation
Creates the `campaign_config` column + optionally:
- `push_action` column (button to push individual rows)
- Engagement columns (if user wants to sync immediately)

---

## Engagement Sync Flow

When user triggers sync (from column header menu or push_action button):

1. `sync-instantly-engagement` edge function runs
2. Auto-creates engagement columns if missing (same 5 columns as current)
3. Columns are typed as `instantly` with appropriate subtype
4. Cells populated via batch upsert
5. Summary row updated with aggregate stats

---

## Summary Row

At the bottom of the table, a pinned row shows aggregate campaign stats:

| Campaign Config | Push | Status | Email Status | Last Contacted | Replies | Opens |
|----------------|------|--------|-------------|----------------|---------|-------|
| "TechCorp Outreach" Active | — | 45% Interested | 82% Opened | — | 23 total | 156 total |

- Fetched via `campaign_analytics` action
- Updates on sync
- Clickable to open full analytics panel (reuse `InstantlyAnalyticsPanel`)

---

## Files Affected

### Remove from OpsDetailPage
- Top-bar Instantly buttons (lines 1961-2021)
- State variables (lines 214-218)
- Instantly queries (lines 318-350)
- Modal renderers (lines 2706-2767)
- Related imports

### New Files
- `src/components/ops/InstantlyColumnWizard.tsx` — Multi-step add column flow
- `src/components/ops/InstantlySequenceBuilder.tsx` — Sequence step authoring UI
- `src/components/ops/EditInstantlySettingsModal.tsx` — Column settings editor

### Modified Files
- `src/components/ops/AddColumnModal.tsx` — Add 'instantly' to column types
- `src/components/ops/OpsTableCell.tsx` — Render instantly subtypes
- `src/components/ops/ColumnHeaderMenu.tsx` — Add Instantly column menu items
- `src/components/ops/OpsTable.tsx` — Summary row support
- `src/lib/services/opsTableService.ts` — Column type + service methods
- `src/lib/hooks/useActionExecution.ts` — Handle push_to_instantly action
- `src/lib/types/instantly.ts` — Extended types

### Preserved (reused)
- `src/lib/hooks/useInstantlyPush.ts`
- `src/lib/hooks/useInstantlySync.ts`
- `src/components/ops/InstantlyAnalyticsPanel.tsx`
- `src/components/ops/InstantlySyncHistory.tsx`
- All edge functions (no backend changes needed)
- All database schema (no migration changes needed)

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Instantly API doesn't support sequence creation fully | Medium | Fallback: create campaign only, user adds sequences in Instantly |
| Summary row performance on large tables | Low | Separate analytics query, not computed from cells |
| Multiple campaigns per table | Low | Support via multiple campaign_config columns |
| Column type migration from existing | Low | Existing tables don't have Instantly columns yet (top-bar only) |
