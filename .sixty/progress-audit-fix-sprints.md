# Progress: Audit Fix Sprints

## Feature Complete

**Feature**: Audit Fix Sprints - 50 P0 + 147 P1 Remediation
**Stories**: 9/9 complete
**Date**: 2026-03-01

---

### FIX-001: Fix shared auth infrastructure (edgeAuth.ts JWT bypass)
**Files**: `_shared/edgeAuth.ts`, `debug-auth/` (deleted), `impersonate-user/index.ts`
**Fixes**:
- Removed JWT decode fallback in `getAuthContext()` — was accepting forged JWTs without signature verification
- Removed JWT decode fallback in `authenticateRequest()` — same vulnerability
- Fixed `isServiceRoleAuth()` — removed claim-based check, now only exact string match against known service role key
- Deleted `debug-auth` function (leaked service role key)
- Pinned SDK + updated CORS in `impersonate-user`

### FIX-002: Delete test/debug functions from production
**Deleted**: 12 functions (test-auth, test-browserless-access, test-email-sequence, test-fathom-api, test-fathom-token, test-hitl, test-no-auth, test-slack-webhook, clerk-user-sync, fix-invitation-rls, fix-trigger, run-process-map-test)

### FIX-003: Add auth to cron/worker functions (~27 functions)
**Pattern**: Added `verifyCronSecret()` guard after CORS preflight
**Functions fixed**: cc-auto-execute, cc-auto-report, cc-daily-cleanup, cc-enrich, cc-prioritise, agent-dead-letter-retry, agent-pipeline-snapshot, fleet-health, proactive-pipeline-analysis, proactive-task-analysis, proactive-weekly-scorecard, send-slack-notification, send-slack-task-notification, process-notification-queue, process-reengagement, bullhorn-process-queue, bullhorn-token-refresh, crm-writeback-worker, send-organization-invitation, send-rejoin-invitation, send-waitlist-invitation, send-waitlist-invite, send-org-deactivation-email, send-org-member-deactivation-email, credit-auto-topup, meter-storage, reconcile-billing

### FIX-004: Fix CRUD endpoint auth + body.userId bypasses
**Files**: `deals/index.ts`, `contacts/index.ts`, `handle-join-request-action/index.ts`, `generate-magic-link/index.ts`, `execute-migration/index.ts`, `google-calendar-sync/index.ts`
**Fixes**:
- `deals`: Added JWT auth + org scoping (clerk_org_id filter on all queries)
- `contacts`: Added JWT auth + owner scoping (owner_id filter)
- `handle-join-request-action`: Replaced body.admin_user_id with JWT-authenticated userId
- `generate-magic-link`: Added actual JWT validation (was only checking header presence)
- `execute-migration`: Added JWT + platform admin check (was only checking header presence)
- `google-calendar-sync`: Fixed body.userId trust — now only accepted via service_role auth

### FIX-005: Webhook verification + proxy lockdown + email auth
**Fixes**:
- `slackAuth.ts`: Replaced `===` with constant-time XOR comparison for signature verification
- `corsHelper.ts`: Restricted `*.vercel.app` wildcard to `*-sixty-sales.vercel.app`
- `proxy-fathom-video`: Added JWT auth + proper CORS
- `freepik-proxy`: Added JWT auth
- `run-apify-actor`: Added JWT auth + proper CORS
- `google-oauth-initiate`: Added origin allowlist to prevent open redirects

### FIX-006: SDK pinning + CORS migration (~307 files)
**Fixes**:
- Pinned all `@supabase/supabase-js@2` imports to `@2.43.4` (304 files)
- Fixed `_shared/security.ts` createErrorResponse() — removed hardcoded `Access-Control-Allow-Origin: *`
- Fixed `_shared/api-utils.ts` — replaced legacy corsHeaders with getCorsHeaders(req)

### FIX-007: Agent budget enforcement + cost tracking
**Fixes**:
- `agentRunner.ts`: Added `addCredits()` method to AgentContext for budget tracking
- `agentConfig.ts`: Added `checkDailyBudget()` function querying credit_transactions
- `rateLimiter.ts`: Changed fail-open to fail-closed on DB errors (3 locations)
- `agentSkillExecutor.ts`: Wrapped skill content in XML tags, added system prompt hardening against prompt injection

### FIX-008: IDOR fixes, data safety, S3 expiry, .single() fixes
**Fixes**:
- Fixed 11 `.single()` to `.maybeSingle()` across 7 shared files
- Reduced S3 URL expiry from 7 days to 4 hours in `get-recording-url` and `get-batch-signed-urls`
- Fixed `responseCache.ts` — replaced 32-bit hash with SHA-256 for cache keys
- Fixed fail-open auth in `meeting-limit-warning-email`, `slack-snooze-check`, `slack-expire-actions`

### FIX-009: Architecture diagram corrections
**File**: `docs/architecture/architecture-diagram.html`
**Fixes**:
- Model reference: "Claude Haiku 4.5" -> "Claude Sonnet 4.6" (all occurrences)
- Transcription: "AssemblyAI" -> "Railway WhisperX" (all occurrences)
- Skills count: 30 -> 127
- Response panels: 48 -> 62
- Credit Governance: Marked as "PLANNED/ASPIRATIONAL" (stubs only, not deployed)
