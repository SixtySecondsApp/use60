# Consult Report: Enrichment Bugs & Hardening

Generated: 2026-03-03

## User Request

Fix enrichment failure ("Could not find the 'change_summary' column of 'organization_enrichment'"), add web search fallback when website blocks scraping, fix login redirect for authenticated users, fix password reset email styling, and scan for similar bugs.

## Issues Found

### Issue 1: Missing `change_summary` Column (P0 — blocks all enrichment)

**Error**: `Could not find the 'change_summary' column of 'organization_enrichment' in the schema cache`

**Root Cause**: Migration `20260124100002_add_last_enriched_at.sql` adds three columns (`enrichment_version`, `previous_hash`, `change_summary`) to `organization_enrichment` but has NOT been deployed to staging.

**Where it crashes**: `deep-enrich-organization/index.ts` line ~1203 writes all three columns in a single `.update()` call. When the columns don't exist, PostgREST rejects the entire update.

**Fix**: Apply the migration to staging, OR make the edge function resilient by removing those columns from the update when they don't exist (defensive coding).

### Issue 2: No Fallback When Website Blocks Scraping (P1)

**Current behavior**: `scrapeWebsite()` fetches up to 21 URLs. If ALL fail (403, CAPTCHA, timeout), it throws `"Could not scrape any content from {domain}"`. This maps to `status: 'failed'` in the enrichment record.

**Problem**: No attempt to search the web for company information as a fallback.

**Existing infrastructure**:
- `_shared/geminiSearch.ts` — Gemini 2.5 Flash with Google Search grounding (ready to use, only needs GEMINI_API_KEY which is already set)
- `_shared/exaSearch.ts` — Exa neural search + Gemini extraction
- `research_provider` app_setting controls which provider is used, but defaults to `'disabled'`

**Fix**: When `scrapeWebsite()` throws (zero pages scraped), automatically fall back to `executeGeminiSearch()` before giving up. This doesn't require any new API keys.

### Issue 3: Login Page Accessible When Authenticated (P2 — ALREADY FIXED)

Auth pages (`/auth/login`, `/auth/signup`, `/auth/forgot-password`) are defined outside `<ProtectedRoute>` in App.tsx, so authenticated users can navigate to them.

**Fix applied**: Added `useEffect` auth guard to all three pages that redirects to `/dashboard` when `isAuthenticated && !loading`.

### Issue 4: Password Reset Email Styling (P2)

The password reset email template exists in `encharge_email_templates` table (migration `20250113000000`). However, user reports it doesn't have the logo/dark styling. Need to verify the template on staging and update if needed to match the welcome template.

### Issue 5: Defensive Coding Gaps in Edge Functions

The `deep-enrich-organization` function has several patterns that could cause silent failures:
- `fetchPage()` silently ignores non-200 responses with no logging
- Partial blocking (some pages blocked) produces low-quality enrichment with no warning
- No minimum content threshold check after scraping

## Recommended Plan

See `.sixty/plan-enrichment-hardening.json`
