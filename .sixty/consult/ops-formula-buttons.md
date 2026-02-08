# Consult Report: Enhanced Formulas + Coda-Style Buttons
Generated: 2026-02-06

## User Request
"On the ops table columns in formulas can we add more options — string concatenation with the & operator, and Coda-style button columns with formulas and actions."

## Clarifications
- Q: What string functions beyond CONCAT?
- A: Concatenation only — make CONCAT and `&` work well, keep it simple

- Q: How far should buttons go?
- A: Coda-style full buttons — configurable label, color, icon. Actions: modify row values, open URL, trigger edge function, push to CRM, run sequence. Multi-action chaining (RunActions pattern).

## Codebase Scout Findings

### Existing Assets
| Path | Relevance | Notes |
|------|-----------|-------|
| `supabase/functions/evaluate-formula/index.ts` | Formula engine | CONCAT, IF, math. No `&` operator. N/A propagation too aggressive for CONCAT. |
| `src/components/ops/OpsTableCell.tsx:517-551` | Action button render | Basic Run/Done/Retry button. No config UI. |
| `src/lib/hooks/useActionExecution.ts` | Action dispatch hook | **Exists but UNUSED** — supports push_to_crm and re_enrich |
| `src/components/ops/AddColumnModal.tsx:440-487` | Formula editor | Textarea + 4 quick-insert templates. No autocomplete. |
| `src/pages/OpsDetailPage.tsx` | Page container | handleCellEdit writes 'execute' to cell but doesn't dispatch action |
| `src/lib/services/opsTableService.ts` | Service layer | action_type + action_config fields defined but barely used |

### Gaps Identified
- No `&` string operator in formula engine
- CONCAT fails on empty columns (N/A propagation kills result)
- `useActionExecution` hook not wired up in OpsDetailPage
- No button configuration UI (AddColumnModal has no action config)
- No multi-action chaining support
- No dynamic button labels from formulas
- Column header menu has no "Configure Action" option

## Risk Analysis

| Severity | Risk | Mitigation |
|----------|------|------------|
| Medium | N/A propagation in CONCAT too aggressive | Change CONCAT to skip N/A args |
| Medium | `useActionExecution` unused — action buttons just write 'execute' string | Wire up dispatch in OpsDetailPage |
| Low | esm.sh CDN issue | Already pinned to @2.43.4 in evaluate-formula |
| Low | No formula validation UI | Can add later; not a blocker |

## Patterns to Follow

- **Column config**: Follow `integration_config` JSONB pattern for `action_config`
- **Cell status**: Use existing `pending/running/complete/failed` states
- **Edge function calls**: Use `supabase.functions.invoke()` via clientV2
- **Column types**: Extend BASE_COLUMN_TYPES array in AddColumnModal
- **Quick-insert templates**: Follow existing pattern in formula editor

## Recommended Plan
See `.sixty/plan-ops-formula-buttons.json`
