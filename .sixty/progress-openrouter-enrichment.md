# Progress Log — OpenRouter AI Model Selection

## Feature Overview
Add AI model selection to ops table enrichment columns using OpenRouter, allowing users to browse and select from recommended models with pricing displayed.

## Requirements Summary
- **Model catalog**: Fetch from OpenRouter API with caching
- **Recommended models**: Claude 3.5 Sonnet, GPT-4o, Llama 3.1 70B, Mixtral shown first
- **Pricing display**: Show cost per 1M tokens for input/output
- **Model selection**: Per-column setting stored in column config
- **Platform key**: OPENROUTER_API_KEY managed by platform (users don't need their own)
- **Backwards compatible**: Existing columns continue using Claude Sonnet 4

---

## Codebase Patterns
<!-- Learnings specific to this feature -->

- Enrichment columns store config in `enrichment_prompt` (text) column
- Model ID should use OpenRouter format: `provider/model-name` (e.g., `anthropic/claude-3.5-sonnet`)
- Edge functions use `fetchWithRetry` helper from `_shared/rateLimiter.ts`
- AddColumnModal follows pattern of conditional sections per column type
- OpenRouter API uses OpenAI-compatible chat/completions format

---

## Session Log

### 2026-02-05 10:00 — ORM-001 ✅
**Story**: Create fetch-openrouter-models edge function
**Files**: supabase/functions/fetch-openrouter-models/index.ts
**Time**: ~5 min
**Gates**: lint ✅
**Learnings**: OpenRouter models API returns pricing as string per token, convert to per-million for display

---

### 2026-02-05 10:05 — ORM-002 ✅
**Story**: Create OpenRouterModelPicker component
**Files**: src/components/ops/OpenRouterModelPicker.tsx
**Time**: ~8 min
**Gates**: lint ✅
**Learnings**: Use React Query with 1hr staleTime to match edge function cache TTL

---

### 2026-02-05 10:13 — ORM-003 ✅
**Story**: Integrate model picker into AddColumnModal
**Files**: src/components/ops/AddColumnModal.tsx
**Time**: ~5 min
**Gates**: lint ✅
**Learnings**: Added enrichmentModel state, default to anthropic/claude-3.5-sonnet

---

### 2026-02-05 10:18 — ORM-004 ✅
**Story**: Add enrichment_model column to database
**Files**: supabase/migrations/20260205900000_enrichment_model_column.sql
**Time**: ~3 min
**Gates**: N/A (migration)
**Learnings**: Simple ALTER TABLE, NULL means use default (Claude)

---

### 2026-02-05 10:21 — ORM-005 ✅
**Story**: Update opsTableService for enrichment_model
**Files**: src/lib/services/opsTableService.ts
**Time**: ~5 min
**Gates**: lint ✅
**Learnings**: Added to OpsTableColumn type, COLUMN_COLUMNS selection, addColumn params

---

### 2026-02-05 10:26 — ORM-006 ✅
**Story**: Update enrich-dynamic-table to use OpenRouter
**Files**: supabase/functions/enrich-dynamic-table/index.ts
**Time**: ~10 min
**Gates**: N/A (edge function)
**Learnings**: OpenRouter uses OpenAI-compatible API format (choices[0].message.content)

---

## Feature Complete ✅

All 6 stories implemented:
- Backend: Edge function to fetch/cache OpenRouter models
- Frontend: Model picker component with recommended models + search
- Integration: Model selection in AddColumnModal for enrichment columns
- Database: New enrichment_model column
- Service: Updated opsTableService types and methods
- Execution: enrich-dynamic-table routes to OpenRouter when model specified

**Files Created/Modified**:
- `supabase/functions/fetch-openrouter-models/index.ts` (new)
- `src/components/ops/OpenRouterModelPicker.tsx` (new)
- `src/components/ops/AddColumnModal.tsx` (modified)
- `supabase/migrations/20260205900000_enrichment_model_column.sql` (new)
- `src/lib/services/opsTableService.ts` (modified)
- `supabase/functions/enrich-dynamic-table/index.ts` (modified)

**Required Secret**: `OPENROUTER_API_KEY` must be set in Supabase edge function secrets
