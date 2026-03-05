# PRD-119: Pipeline Advanced Views & Bulk Operations

**Priority:** Tier 2 — High-Impact Quick Win
**Current Score:** 3 (ALPHA) — kanban + table exist, missing power features
**Target Score:** 4 (BETA)
**Estimated Effort:** 8-10 hours
**Dependencies:** None

---

## Problem

Pipeline has solid foundations — `PipelineView.tsx` (401 lines) switches between kanban and table, `PipelineKanban.tsx` (174 lines) supports drag-drop, `PipelineTable.tsx` (444 lines) has sorting and inline editing. But power-user features are missing:

1. **No saved filter sets** — can't save "deals closing this quarter" or "my stale deals" as presets
2. **No bulk operations** — can't multi-select deals to bulk-move, bulk-tag, or bulk-assign
3. **No manager multi-rep view** — managers can't see all reps' pipelines side-by-side
4. **No custom columns** — users can't add/remove columns in table view
5. **No pipeline export** — can't export filtered pipeline to CSV/PDF
6. **No metrics overlay** — no win rate %, ARR by stage, or conversion rate displayed on pipeline

## Goal

Extend the pipeline page with saved views, bulk operations, manager views, and metrics overlays to support daily pipeline management workflows.

## Success Criteria

- [ ] Saved filter presets (create, name, apply, share with team)
- [ ] Multi-select with bulk move, bulk tag, and bulk assign actions
- [ ] Manager view showing all reps' pipelines with drill-down
- [ ] Column customisation in table view (add/remove/reorder)
- [ ] Export to CSV with current filters applied
- [ ] Metrics overlay on kanban (conversion rate, total value per stage)

## Stories

| ID | Title | Type | Est | Dependencies |
|----|-------|------|-----|-------------|
| PIPE-ADV-001 | Add saved filter presets with create/apply/share | frontend + backend | 2h | — |
| PIPE-ADV-002 | Build multi-select with bulk move, tag, and assign actions | frontend | 2h | — |
| PIPE-ADV-003 | Create manager multi-rep pipeline view with drill-down | frontend | 2h | — |
| PIPE-ADV-004 | Add column customisation in table view | frontend | 1.5h | — |
| PIPE-ADV-005 | Add CSV export with current filters | frontend | 1h | — |
| PIPE-ADV-006 | Add metrics overlay on kanban stages (value, count, conversion rate) | frontend | 1.5h | — |

## Technical Notes

- `PipelineView.tsx` (401 lines), `PipelineKanban.tsx` (174 lines), `PipelineTable.tsx` (444 lines) are the base components
- Saved filters: store in `pipeline_saved_views` table (org_id, user_id, name, filters JSONB, is_shared)
- Bulk operations: add checkbox column to PipelineTable, floating action bar on selection
- Manager view: query deals grouped by `owner_id`, render stacked kanban or summary cards per rep
- Column customisation: store user preferences in localStorage or `user_preferences` table
- Export: generate CSV client-side from current filtered data (no backend needed)
- Metrics overlay: `calculate_pipeline_math` RPC already returns conversion rates — display above each stage column
- `get_weighted_pipeline` RPC returns weighted value per stage — use for value overlay
