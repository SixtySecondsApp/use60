# Progress Log — Ops Intelligence Platform

## Codebase Patterns
<!-- Reusable learnings across all layers -->

- Edge functions: `supabase/functions/ops-table-*` pattern, Deno runtime, CORS helpers from `_shared/corsHelper.ts`
- AI model: `claude-haiku-4-5-20251001` for parsing/analysis, pinned imports: `@supabase/supabase-js@2.43.4`, `@anthropic-ai/sdk@0.32.1`
- Cost tracking: `logAICostEvent()` from `_shared/costTracking.ts` on every AI call
- Deploy: `npx supabase functions deploy <name> --project-ref caerqjzvuerejfrdtygb --no-verify-jwt`
- Frontend: React Query for server state, Zustand for UI state, Sonner toasts, Radix UI primitives
- Service layer: `src/lib/services/opsTableService.ts` with `supabase.functions.invoke()` for edge function calls
- Tests: Playwright E2E in `tests/e2e/ops-intelligence/`, Playwriter MCP for browser automation
- Slack: `_shared/slackBlocks.ts` + `_shared/slackAuth.ts` for Block Kit messages

---

## Session Log

*No sessions yet — plan generated, awaiting execution.*
