# Progress Log - URL-Based Campaign Link Creator

## Feature Summary
Create personalized campaign links directly from URLs like `/t/stripe.com` with a split-screen creator view (preview + outreach composer). Supports query params (`fn`, `ln`, `email`, `cid`). Links feed into ABM Campaigns with full analytics.

## Codebase Patterns
- Landing pages live in `packages/landing/src/`
- Auth via `AuthContext.tsx` with `useAuth()` hook (Supabase-based)
- Campaign links stored in `campaign_links` table (existing schema)
- Enrichment via `demo-research` edge function (~4-6s, Exa + Gemini)
- Link creation via `campaign-enrich` edge function
- Tracking via `useSandboxTracking` hook + `campaign_visitors` table

## Key Decisions
- Creator view lives in `packages/landing/` (same domain, simpler routing)
- Domain detection: `code.includes('.')` = domain, else = campaign code
- Auth-gated: unauthenticated visitors redirected to app login
- No new DB tables or edge functions needed

---

## Session Log

(No sessions yet)
