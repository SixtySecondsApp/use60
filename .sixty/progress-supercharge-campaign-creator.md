# Progress Log - Supercharge /t/{domain} Campaign Creator

## Feature Summary
Transform the URL campaign creator from a single-scrape-and-guess flow into a multi-source intelligence powerhouse using EXA, AI Ark, Apollo, Apify, and Perplexity. 5 improvements: multi-source research, prospect intelligence, competitive battlecards, multi-touch sequences, and live research feed.

## Codebase Patterns
- Edge functions use `getCorsHeaders(req)` from `_shared/corsHelper.ts`
- AI Ark auth: `X-TOKEN: {api_key}` header, base URL `https://api.ai-ark.com/api/developer-portal/v1`
- Apollo auth: `x-api-key` header, base URL `https://api.apollo.io/api/v1`
- EXA auth: `x-api-key` header, base URL `https://api.exa.ai`
- Pin `@supabase/supabase-js@2.43.4` on esm.sh
- All staging deploys: `--no-verify-jwt` (ES256 JWT issue)
- ResearchData shape must stay backward compatible (all new fields optional)
- Gemini JSON mode: `responseMimeType: 'application/json'`

## Key Decisions
- demo-research-v2 is a NEW function (not modifying existing) so original stays as fallback
- prospect-enrich is auth-gated (JWT required) - only creator view calls it
- SSE streaming is progressive enhancement with non-streaming fallback
- AI Ark company search costs 2.5 credits per call - acceptable for demo quality
- All provider calls use Promise.allSettled with individual timeouts for resilience

## Dependency Graph
```
SCC-001 (multi-source backend) ─┬─> SCC-002 (types) ──> SCC-003 (wire frontend)
                                │                              │
SCC-004 (prospect backend) ─────┤                              ├──> SCC-005 (prospect UI)
                                │                              │         │
                                │                              │         v
                                │                              ├──> SCC-006 (upgrade drafts)
                                │                              │         │
                                │                              │         v
                                │                              │    SCC-008 (sequence backend)
                                │                              │         │
                                │                              │         v
                                │                              │    SCC-009 (sequence UI)
                                │                              │
                                ├──> SCC-007 (competitive panel)
                                │
                                └──> SCC-010 (SSE backend) ──> SCC-011 (research feed UI)

SCC-012 (deploy + verify) depends on all backend stories
```

## Parallel Opportunities
- SCC-001 + SCC-004: independent backend functions
- SCC-007 + SCC-008: independent features
- SCC-009 + SCC-010: independent frontend/backend

---

## Session Log

### 2026-03-06 — SCC-001 through SCC-009 (Session 1)
**Stories**: All 9 stories implemented in first session
**Files created**: demo-research-v2/index.ts, prospect-enrich/index.ts, CompetitiveIntel.tsx
**Files modified**: demo-types.ts, useDemoResearch.ts, CreatorView.tsx, OutreachComposer.tsx, campaign-outreach-draft/index.ts, sandboxTypes.ts, generatePersonalizedData.ts

### 2026-03-06 — SCC-007 completion + SCC-010, SCC-011 (Session 2)
**SCC-007**: Wired CompetitiveIntel into SandboxPipeline.tsx deal detail panel
**SCC-010**: Added SSE streaming support to useDemoResearch.ts (fetchResearchSSE, ProviderEvent type, providerEvents state)
**SCC-011**: Created ResearchFeed.tsx component, replaced CreatorView loading spinner with real-time intelligence feed
**Gates**: No lint errors in changed files
