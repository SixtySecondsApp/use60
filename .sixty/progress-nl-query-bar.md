# Progress Log — Natural Language Query Bar

## Project Overview
**Feature**: Natural Language Query Bar for Prospecting
**Created**: 2026-02-12
**Status**: Ready for implementation
**Estimated Time**: 9.5 hours (realistic)

## Codebase Patterns to Follow

### Edge Function Patterns
- **Auth**: JWT → supabase.auth.getUser() → org membership → service role for secrets
- **CORS**: Always use `getCorsHeaders(req)` from `_shared/corsHelper.ts`
- **Supabase**: Pin to `@2.43.4` - `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'`
- **Error Handling**: Structured responses with code + message, toast.error() for user-facing

### Query Parsing Pattern (from parse-apollo-query)
- Use Claude Haiku 4.5 with `tool_use` for entity extraction
- Extract: entity_type, count, location, filters, source_preference
- Return confidence score with result
- Handle ambiguous queries with clarification flow

### Multi-Provider Orchestration (from research-router)
- Classify query to determine provider ranking
- Execute actors in parallel with Promise.all()
- Normalize outputs to common schema
- Track providers_used and sources for attribution

### Frontend State Management
- React Query for server state with hierarchical keys
- Supabase Realtime for live progress updates
- useState for UI-only state (query input, selected sources)
- Optimistic updates in useMutation.onMutate

### Table Population (from AgentResearchDemo)
- Append results via `supabase.from('dynamic_table_rows').insert()`
- Batch insert for multiple results
- Realtime subscription for live table updates
- Deduplication on insert to prevent duplicates

## Reference Implementations

### Files to Study Before Implementation
1. **supabase/functions/parse-apollo-query/index.ts** - Claude-based NL parsing pattern
2. **supabase/functions/research-router/index.ts** - Multi-provider orchestration
3. **supabase/functions/apify-run-start/index.ts** - Apify actor execution, rate limiting
4. **src/pages/demo/AgentResearchDemo.tsx** - Table creation, Apollo import, Realtime
5. **src/lib/utils/searchIntelligence.ts** - NLP query parsing patterns

## Key Architecture Decisions

### 1. Use Claude Haiku (not Gemini) for Query Parsing
**Rationale**: Faster, cheaper, already integrated for parse-apollo-query. Haiku 4.5 handles complex entity extraction well.
**Risk**: May struggle with very ambiguous queries → add clarification handling in NLPQ-012.

### 2. Orchestrate Actors in Parallel (not Sequential)
**Rationale**: Queries like "find agencies with LinkedIn + Maps data" should hit both simultaneously to reduce latency.
**Risk**: Apify rate limits (5 concurrent) may kick in → already handled by apify-run-start.

### 3. Normalize All Actor Outputs Before Table Append
**Rationale**: Different actors return wildly different JSON. Normalization ensures consistent table schema.
**Risk**: Some data loss when normalizing (e.g., Maps hours_of_operation has no prospect analog) → store raw JSON in hidden column if needed.

### 4. Use Realtime Channel for Progress (not Polling)
**Rationale**: Supabase Realtime already in use; cleaner UX. Actor webhook publishes events to channel.
**Risk**: Realtime connection drops lose updates → add fallback polling in NLPQ-012.

## Parallel Execution Opportunities

### Group 1: Foundation (can run together)
- NLPQ-001 (parser edge function)
- NLPQ-002 (TypeScript types)
- NLPQ-007 (query bar UI component)

**Time Saved**: ~20 minutes

### Group 2: Utilities (can run together)
- NLPQ-003 (source preference resolver)
- NLPQ-006 (result normalizer)

**Time Saved**: ~10 minutes

### Group 3: Core Features (can run together)
- NLPQ-004 (orchestrator edge function)
- NLPQ-008 (progress indicator UI)
- NLPQ-009 (results preview UI)

**Time Saved**: ~15 minutes

### Group 4: Polish (can run together)
- NLPQ-011 (source preference selector)
- NLPQ-012 (error states and retry)

**Time Saved**: ~10 minutes

**Total Time Savings with Parallelization**: ~55 minutes

## Session Log

_Stories will be logged here as they complete_

---

## Notes

- All stories sized ≤30 minutes for rapid iteration
- Dependencies mapped to prevent blocking
- Patterns extracted from existing codebase (parse-apollo-query, research-router, AgentResearchDemo)
- Testing strategy: Unit (parse-nl-query), Integration (mock Apify), E2E (full flow with demo data)
