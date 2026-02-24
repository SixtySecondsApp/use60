# Progress Log — Exa UX Enrichment Improvement

## Feature Overview
Replace generic enrichment provider setup with Exa-aware experience: curated templates, provider cards, conditional form, preview, inline intent signals.

## Key Files
- `src/components/ops/AddColumnModal.tsx` — Main enrichment setup modal (~1400 lines)
- `src/components/ops/EditEnrichmentModal.tsx` — Edit modal (~309 lines)
- `src/components/ops/OpsTableCell.tsx` — Cell renderer with expand view

## Patterns to Follow
- Templates: `ENRICHMENT_TEMPLATES` array at top of AddColumnModal (line 175)
- Provider state: `enrichmentProvider` useState with type `'openrouter' | 'anthropic' | 'exa'`
- @mention system: Already works in both modals (insertMention callback)
- Intent signal rendering: Lines 960-992 of OpsTableCell (expanded view)
- Lucide icons only, no emoji
- Tailwind dark theme (gray-900 bg, gray-700 borders, violet accents)

## Codebase Notes
- AddColumnModal `ENRICHMENT_TEMPLATES` at line 175 — 4 generic templates
- Provider dropdown at line 1240-1248 — plain `<select>`
- OpenRouterModelPicker already conditionally shown at line 1254-1258
- OpsTableCell intent signals at line 960 — only in expanded view
- EditEnrichmentModal at 309 lines — compact, no templates

---

## Session Log

*(No sessions yet)*
