# Progress Log — Demo-to-Signup Conversion

## Feature Summary
Skip skills onboarding for demo users by pre-seeding their account with research data collected during the /demo-v2 flow.

## Branch
`feature/demo-to-signup-conversion`

## Key Decisions
- Collect password at demo signup (not magic link) — login flow requires password
- No access code needed for demo path — signup calls Supabase Auth REST API directly (bypasses client-side gate)
- DEMO60 code added to waitlist_invite_codes for tracking if needed later
- AI-generate all 5 skills server-side from demo research context via Gemini
- Fire deep-enrich-organization in background after conversion for full enrichment
- Email auto-verified via service role in demo-convert-account (no waitlist entry needed)
- auto_create_org_for_new_user trigger was DROPPED — no race condition risk

## Codebase Patterns
- Landing package uses raw fetch (no supabase client) — uses REST API directly
- Edge functions: pin @supabase/supabase-js@2.43.4, use getCorsHeaders(req)
- Deploy staging with --no-verify-jwt (ES256 JWT issue)
- Access codes validated against `waitlist_invite_codes` table (not `access_codes`)
- Service role client: `createClient(url, serviceRoleKey, { auth: { persistSession: false } })`

---

## Session Log

### 2026-02-25 — DEMO-001 + DEMO-002 (parallel) ✅
**Stories**: Expand DemoSignup form + Create demo-convert-account edge function
**Files**: packages/landing/src/demo-v2/DemoSignup.tsx, packages/landing/src/demo-v2/DemoExperience.tsx, supabase/functions/demo-convert-account/index.ts
**Gates**: lint ✅ (warnings are pre-existing patterns) | deploy ✅
**Learnings**:
- DemoSignup props changed: `researchData + url` instead of `companyName + stats`
- DemoExperience.tsx updated to pass full research data + url to signup step
- Edge function uses service role for all operations (org creation, membership, enrichment, skills, credits)
- Gemini skill generation reuses `promptLoader` and `organization_skill_generation` prompt from deep-enrich

### 2026-02-25 — DEMO-003 ✅ (merged into DEMO-001)
**Story**: Wire DemoSignup to real auth + demo-convert-account
**Notes**: Implemented directly in DemoSignup.tsx — signup calls Supabase REST API then demo-convert-account

### 2026-02-25 — DEMO-004 ✅
**Story**: Add signup_source column + demo access code
**Files**: supabase/migrations/20260225000001_add_signup_source_and_demo_code.sql
**Notes**: Adds `signup_source TEXT` to profiles, inserts DEMO60 into waitlist_invite_codes. Migration needs manual apply (remote history mismatch).

### 2026-02-25 — DEMO-005 ✅ (no changes needed)
**Story**: Handle demo conversions in auth routing
**Notes**: AuthCallback.tsx already checks `onboarding_completed_at` — demo users have this set by demo-convert-account, so they route to dashboard automatically. ProtectedRoute also correct.

### 2026-02-25 — DEMO-006 ✅ (merged into DEMO-002)
**Story**: Trigger deep-enrich in background after conversion
**Notes**: Fire-and-forget fetch to deep-enrich-organization included in demo-convert-account step 9.

### 2026-02-25 — Email auto-verify improvement
**Addition**: demo-convert-account now calls `supabase.auth.admin.updateUserById(user_id, { email_confirm: true })` directly with service role — no waitlist entry needed.

---

## Remaining
- DEMO-007: E2E test on staging (manual)
- Migration 20260225000001 needs manual SQL apply on staging (db push has history mismatch)
