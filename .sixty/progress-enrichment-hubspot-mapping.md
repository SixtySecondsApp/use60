# Progress Log — Enrichment Column HubSpot Mapping

## Feature Overview

**Goal**: Allow enrichment columns to be mapped to HubSpot fields and display with orange HubSpot styling instead of violet enrichment styling.

**User Story**: "When I map an enrichment column to a HubSpot field, I want it to show the orange HubSpot highlight (like native HubSpot columns) so I can visually identify which enrichments sync back to HubSpot."

---

## Codebase Patterns Discovered

### Current Enrichment Implementation
- **Column flag**: `is_enrichment: BOOLEAN` in `dynamic_table_columns` table
- **Visual styling**: `bg-violet-500/5` (header), `bg-violet-500/[0.03]` (cells)
- **Icon**: Sparkles icon (`text-violet-400`)
- **Configuration**: `enrichment_prompt` (with @mentions), `enrichment_model` (OpenRouter model ID)
- **Execution**: `enrich-dynamic-table` edge function processes rows in batches of 50

### Current HubSpot Column Implementation
- **Column flag**: `hubspot_property_name: TEXT` in `dynamic_table_columns` table
- **Visual styling**: `bg-orange-500/20` (header), `bg-orange-500/5` (cells)
- **Column type**: Can be `'hubspot_property'` in `column_type` field
- **Bidirectional sync**: Controlled by `source_query.sync_direction` ('pull_only' | 'bidirectional')

### Key Files
| File | Purpose |
|------|---------|
| `src/components/ops/AddColumnModal.tsx` | Column creation UI (lines 88-748) |
| `src/components/ops/EditEnrichmentModal.tsx` | Edit enrichment config |
| `src/components/ops/HubSpotPropertyPicker.tsx` | HubSpot property selection modal |
| `src/components/ops/OpsTable.tsx` | Column rendering with styling (lines 166-171) |
| `src/lib/hooks/useEnrichment.ts` | Enrichment execution mutations |
| `src/lib/hooks/useHubSpotWriteBack.ts` | Push cell values to HubSpot |
| `supabase/functions/enrich-dynamic-table/index.ts` | AI enrichment processing |
| `supabase/functions/push-cell-to-hubspot/index.ts` | HubSpot writeback |

---

## Architecture Notes

### Data Model
Both `is_enrichment` and `hubspot_property_name` can be true simultaneously:
- `is_enrichment = true, hubspot_property_name = NULL` → Enrichment only (violet)
- `is_enrichment = false, hubspot_property_name = 'firstname'` → HubSpot property (orange)
- `is_enrichment = true, hubspot_property_name = 'notes'` → **NEW**: Enrichment synced to HubSpot (orange)

### Visual Priority
When both flags are true, orange takes precedence:
```typescript
// Priority order: HubSpot mapped > Enrichment only > Default
${col.is_enrichment && col.hubspot_property_name ? 'bg-orange-500/20' : ''}
${col.is_enrichment && !col.hubspot_property_name ? 'bg-violet-500/5' : ''}
```

### Sync Flow
```
User creates enrichment column with HubSpot mapping
    ↓
Enrichment runs (enrich-dynamic-table edge function)
    ↓
Check if column.hubspot_property_name exists
    ↓
If yes && sync_direction = 'bidirectional':
    Call push-cell-to-hubspot for each enriched row
    ↓
HubSpot field updated with enrichment result
```

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Data type mismatch (text → number) | Medium | Validate type compatibility in UI before allowing mapping |
| Rate limiting (1000 enrichments → 1000 HubSpot calls) | Medium | Use existing batch sync from push-cell-to-hubspot |
| Sync direction confusion | Low | Show warning if pull_only when trying to map |
| User confusion (enrichment vs property) | Low | Clear UI labels, tooltips explaining difference |

---

## Session Log

### 2026-02-06 00:00 — Planning Complete
**Action**: Generated execution plan
**Stories**: 7 stories created (EH-001 to EH-007)
**Estimate**: ~2 hours total (135 minutes)
**Parallel opportunities**: EH-003 and EH-004 can run in parallel after EH-002

---

## Next Steps

Run `60/dev-run` to begin execution starting with EH-001.
