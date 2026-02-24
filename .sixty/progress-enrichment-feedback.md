# Progress Log — Enrichment Feedback UX

## Codebase Patterns
- Enrichment cells are in `OpsTableCell.tsx`, status-driven rendering (pending/failed/complete/none)
- `useEnrichment.ts` hook manages jobs polling + batch chaining via `invokeEnrichment()`
- Edge function `enrich-dynamic-table` processes rows sequentially, checkpoints after each row
- React Query invalidation (`['ops-table-data', tableId]`) is the cell refresh mechanism — no Realtime
- Cell upsert uses `onConflict: 'row_id,column_id'` constraint

---

## Session Log

### ENR-001: Mark cells pending in edge function ✅
- Added batch pending upsert in `enrich-dynamic-table/index.ts` between job creation and row loop
- All target cells set to `status: 'pending'`, `value: null`, `confidence: null`, `metadata: null`
- Upserts in chunks of 500 rows

### ENR-002: Faster polling + single-row enrichment ✅
- Poll interval: 3000ms → 1500ms
- Batch chain delay: 500ms → 200ms
- Added `optimisticPendingUpdate()` helper for instant React Query cache clearing
- Added `singleRowEnrichmentMutation` (no toast on success — cell update IS the feedback)
- Exported `startSingleRowEnrichment` from hook

### ENR-003: Pass onEnrichRow through OpsTable ✅
- Added `onEnrichRow?: (rowId: string, columnId: string) => void` to `OpsTableProps`
- Passed to `OpsTableCell` only for enrichment columns

### ENR-004: Hover lightning bolt + cell status indicators ✅
- Added `onEnrichRow?: () => void` prop to `OpsTableCellProps`
- **Pending**: "Processing..." with violet text + spinner (no Zap)
- **Failed**: Red "Failed" text + hover Zap retry icon (violet, `e.stopPropagation()`)
- **Complete**: Existing expand overlay + hover Zap re-enrich icon (right-aligned, `e.stopPropagation()`)
- **Awaiting enrichment**: "Awaiting enrichment" text + hover Zap icon to trigger first enrich

### ENR-005: Wire handler in OpsDetailPage ✅
- Destructured `startSingleRowEnrichment` from `useEnrichment`
- Created `handleEnrichRow` callback, passed to `<OpsTable>`

---

## Build Verification
- `npx vite build` ✅ — built in 2m 12s, no compilation errors
