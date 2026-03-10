# Progress Log — Auto-Discover Contacts & Outreach Kit

## Feature Summary
Transform /t/{domain} campaign creator: auto-discover 3-5 decision makers via AI Ark + Apollo, per-contact personalized outreach, LinkedIn activity via EXA, one-click outreach kit, and Instantly campaign push.

## Codebase Patterns
- Edge functions use `getCorsHeaders(req)` from `_shared/corsHelper.ts`
- AI Ark auth: `X-TOKEN: {api_key}` header, base URL `https://api.ai-ark.com/api/developer-portal/v1`
- Apollo auth: `x-api-key` header, base URL `https://api.apollo.io/api/v1`
- EXA auth: `x-api-key` header, base URL `https://api.exa.ai`
- Pin `@supabase/supabase-js@2.43.4` on esm.sh
- All staging deploys: `--no-verify-jwt` (ES256 JWT issue)
- InstantlyClient from `_shared/instantly.ts` — auto-retry, rate limiting
- Instantly org API key from `instantly_org_credentials` table
- Campaign schedule timezone must use restricted Instantly enum (default: America/Chicago)

## Key Decisions
- EXA for LinkedIn activity (not Apify) — indexes public LinkedIn posts, faster, more reliable, legal
- AI Ark primary for people search (richer data), Apollo as fallback (cheaper, has photos)
- Per-contact drafts reuse existing campaign-outreach-draft — no new AI endpoint needed
- New push-campaign-instantly function (not reusing instantly-push which is ops-table-coupled)
- Contact discovery fires after research completes, not in parallel (needs ICP title from research)

## Dependency Graph
```
CC-001 (discover backend) ─┐
                           ├──> CC-003 (wire to UI) ──> CC-004 (per-contact drafts) ──> CC-005 (outreach kit) ──> CC-006 (Instantly push) ──> CC-007 (LinkedIn activity)
CC-002 (types + component) ┘
```

## Parallel Opportunities
- CC-001 + CC-002: independent backend + frontend scaffolding

---

## Session Log

### 2026-03-06 — CC-001 through CC-007 (Session 1)
**All 7 stories implemented in single session**

**Files created:**
- `supabase/functions/discover-contacts/index.ts` — AI Ark + Apollo people search with EXA LinkedIn activity enrichment
- `supabase/functions/push-campaign-instantly/index.ts` — Creates Instantly campaign and pushes contacts as leads
- `packages/landing/src/components/ContactCard.tsx` — Expandable contact card with seniority badges, LinkedIn, activity

**Files modified:**
- `packages/landing/src/demo/demo-types.ts` — Added DiscoveredContact interface
- `packages/landing/src/pages/CreatorView.tsx` — Decision Makers panel, per-contact drafts, outreach kit, Instantly push

**Edge functions deployed to staging:**
- `discover-contacts` — with EXA activity enrichment
- `push-campaign-instantly` — campaign creation + lead push

**Gates:** 0 lint errors in changed files
