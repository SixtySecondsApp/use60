# Progress Log — Dynamic Tables

## Feature Overview
Clay-style AI-powered lead enrichment & data processing layer for use60.
Branch: `feat/dynamic-tables`
PRD: `dynamic tables/dynamic_tables_brief.md`
Design: `dynamic tables/dynamic_table_design.jsx`

## Codebase Patterns
<!-- Reusable learnings across all stories -->

- TanStack Table v8 for table rendering (see PipelineTable.tsx for reference)
- Routes: add to routeConfig.ts + lazyPages.tsx + App.tsx
- Services follow class pattern (see copilotMemoryService.ts)
- Copilot responses: add type to types.ts, component to responses/, case to CopilotResponse.tsx
- Edge functions: explicit column selection, CORS headers, error handling
- Migrations: IF NOT EXISTS, RLS first, cascade deletes, NOTIFY pgrst

---

## Session Log

*No sessions yet — run `60/dev-run` to begin execution.*
