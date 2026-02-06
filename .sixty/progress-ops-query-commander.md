# Progress Log — Ops Query Commander

## Feature
**Ops Query Commander** — Expand the Ops query bar from 3 tools to 12, turning it into a Clay-killer natural language command center for sales ops managers.

## Architecture
- **Edge function**: `ops-table-ai-query` (expanded from 3→12 tools, upgraded to Sonnet for parsing)
- **New edge function**: `ops-table-transform-column` (batch AI transformations via Haiku)
- **New components**: AiQuerySummaryCard, AiTransformPreviewModal, AiDeduplicatePreviewModal, AiQueryBar
- **New service methods**: executeDeduplicate, executeConditionalUpdate, generateCSVExport, getColumnUniqueValues, getColumnStats

## Codebase Patterns
- Edge functions use `https://esm.sh/@supabase/supabase-js@2.43.4` (pinned)
- Deploy with `--no-verify-jwt` to staging (`caerqjzvuerejfrdtygb`)
- AI cost tracked via `logAICostEvent()` from `_shared/costTracking.ts`
- Cell upsert uses `onConflict: 'row_id,column_id'` for batch writes

---

## Session Log

*No sessions yet*
