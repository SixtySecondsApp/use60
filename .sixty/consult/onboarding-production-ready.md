# Consult Report: Onboarding Production Hardening
Generated: 2025-01-30T10:00:00Z

## User Request
Fix 404 error when adding users and ensure onboarding flow is production-ready with smooth error handling, organization management, and re-onboarding support.

## Clarifications from User

**Q: Email Provider?**
A: AWS SES

**Q: Approval Timeline?**
A: 24 hours is acceptable

**Q: Rejection UX?**
A: User should get automatic email notification

**Q: Duplicate Orgs?**
A: Require admin approval when similar org names exist

**Q: Environment?**
A: Staging

---

## Agent Findings Summary

### Agent 1: API Routing Scout

**Root Cause of 404**: The `vercel.json` file explicitly declared `"framework": "vite"` (line 3), which told Vercel to treat the project as a frontend-only Vite SPA. This disabled Vercel's auto-discovery of serverless functions in the `/api` directory.

**Evidence**:
- `vercel.json` line 3: `"framework": "vite"`
- `vite.config.ts`: Only processes `/src` directory
- `tsconfig.json` line 37: Only includes `src/` folder
- Build command runs `vite build` which ignores `/api`

**Fix Applied**: Changed `"framework": "vite"` to `"outputDirectory": "dist"` in vercel.json.

**Working Routes**: Other API routes (test, webhooks, cron jobs) may have worked due to explicit registration in crons section.

---

### Agent 2: Onboarding Flow Analyst

**Complete Flow Map**:

```
Entry Points:
├─ /auth/signup (Standard signup)
├─ /invite/:token (Organization invitation)
├─ /auth/invite-signup/:token (Signup during invitation)
└─ /auth/callback (Email verification)

Flow Decision Tree:
User Signs Up
    │
    ├─ Corporate Email (@company.com)
    │   ├─ Existing Org Found? → Join Request → Pending Approval
    │   └─ No Org → Auto-Create → Enrichment
    │
    └─ Personal Email (@gmail.com)
        └─ Website Input
            ├─ Has Website?
            │   ├─ YES → Check Similar Orgs
            │   │   ├─ Match? → Organization Selection → Join Request
            │   │   └─ No Match → Create Org → Enrichment
            │
            └─ NO → Manual Q&A → Create Org → Enrichment

Enrichment → Skills Config → Complete → Dashboard
```

**Organization Logic**:
- **Creation**: 3 paths (auto for business emails, manual for personal+website, Q&A fallback)
- **Duplicate Detection**: ✅ Exact domain match + fuzzy matching (>0.7 similarity)
- **Join Request**: ✅ Full approval workflow with RPC functions
- **Approval Flow**: ✅ Admin review → magic link → membership creation

**Re-onboarding Support**:
- ✅ Users can cancel join requests and restart
- ✅ Cancel redirects to `/onboarding?step=website_input`
- ⚠️ **GAP**: No automatic rejection notification UI

**Critical Files**:
- `OnboardingV2.tsx` - Main orchestrator
- `onboardingV2Store.ts` - State management
- `AuthCallback.tsx` - Entry point processing
- `PendingApprovalStep.tsx` - Approval waiting screen
- `joinRequestService.ts` - Join request operations

---

### Agent 3: Error Handling Auditor

**Error Coverage: 70/100**

**Covered**:
- ✅ Try-catch blocks throughout codebase
- ✅ Toast feedback on all operations
- ✅ Detailed logging with `logger`
- ✅ Loading states with spinners
- ✅ Retry logic for session establishment (3 attempts)
- ✅ Non-blocking profile creation
- ✅ Email confirmation bypass for invitations

**Critical Gaps**:
- ❌ **Email delivery failures only show warning** - User invited but no email received
- ❌ **No orphaned invitation cleanup** - Expired invitations accumulate forever
- ❌ **Race condition on acceptance** - User could click accept button twice
- ❌ **Session loss = data loss** - No form state persistence
- ❌ **No rate limiting** - Admin could spam invitations

**Production Blockers**:
1. Email sending failures not confirmed to user
2. No rejection notification when admin denies join request
3. Concurrent invitation acceptance not protected
4. Form state not persisted across session loss

**Strengths**:
- Comprehensive logging throughout
- Detailed error messages (not generic)
- Multiple fallback strategies for finding data

---

### Agent 4: Workflow Skeleton Validator

**Alignment Status**: ✅ **WELL ALIGNED**

**Matches Spec**:
- ✅ Multi-path onboarding (corporate/personal email)
- ✅ Organization creation with duplicate prevention
- ✅ Join request system with approval workflow
- ✅ User can change org selection (cancel + restart)

**Missing from Spec**:
- No formal PRD document found
- Implementation is self-documenting through code comments

**Gaps Identified**:
- **User Rejection Workflow**: When admin denies join request, no automatic notification or UI update
- **Enrollment Timeout**: No automatic re-request for expired tokens
- **Email Retry**: No retry logic when encharge-send-email fails

**Multi-Tenant Status**:
- Organization creation: ✅ ALIGNED
- Duplicate prevention: ✅ ALIGNED (3 mechanisms)
- Invite flow: ✅ ALIGNED
- Re-onboarding: ⚠️ PARTIAL (can restart but no rejection UI)

---

## Synthesis

### ✅ Agreements (All Agents Align)

1. **404 Error Root Cause**: vercel.json framework setting disabled API route discovery
2. **Onboarding Flow**: Multi-path implementation is complete and working
3. **Duplicate Prevention**: 3-layer system (exact, fuzzy, similar org search)
4. **Error Handling**: Good coverage on happy paths, weak on failure recovery
5. **State Management**: URL params + database persistence works well

### ⚠️ Conflicts (Resolved)

1. **Email Sending Status**:
   - Patterns Analyst found warning toasts
   - Error Auditor found no confirmation
   - **Resolution**: Warning exists but insufficient - need retry + resend UI

2. **Re-onboarding Support**:
   - Flow Analyst found cancel functionality
   - Skeleton Validator found no rejection notification
   - **Resolution**: Partial implementation - cancel works but rejection notification missing

### 🔍 Gaps (Need Implementation)

1. **Email Delivery Confirmation** - Critical for production
2. **Orphaned Invitation Cleanup** - Database hygiene issue
3. **Race Condition Protection** - Concurrent acceptance bug
4. **Session Persistence** - UX issue on session loss
5. **Rejection Notifications** - UX gap for denied users
6. **Duplicate Org Approval** - New requirement from user
7. **Rate Limiting** - Security/abuse prevention

---

## Final Recommendation

### Phase 1: Critical Fixes (Deploy Today)

**Priority 0 - Deployment**:
1. ✅ Fix 404 error (vercel.json updated)
2. Deploy to staging
3. Verify /api/admin/invite-user returns 200

**Priority 0 - Email Reliability**:
1. Track email sending status in database
2. Add AWS SES error handling
3. Show email status to user
4. Add "Resend" button for failed emails

### Phase 2: Production Hardening (This Week)

**Priority 1 - Data Integrity**:
1. Orphaned invitation cleanup (migration + cron job)
2. Race condition protection (atomic processing flag)
3. Session persistence (localStorage backup)

**Priority 2 - UX Polish**:
1. Rejection notification system (email + UI polling)
2. Duplicate org admin approval workflow
3. Rate limiting (10/day per admin, 50/day per org)

### Execution Plan

**Total Stories**: 19
**Estimated Time**: 6.7 hours (without parallel) → **5 hours (with parallel)**
**Parallel Groups**: 3 groups identified

**Story Breakdown**:
- Schema migrations: 5 stories (75 min)
- Backend/API changes: 6 stories (150 min)
- Frontend changes: 5 stories (120 min)
- Config/deployment: 3 stories (55 min)

**Dependencies**:
- All stories depend on ONBOARD-001 (deploy 404 fix)
- Schema changes must complete before dependent backend/frontend work
- Email templates must be created before notification features

---

## Critical Files Reference

| Category | Files |
|----------|-------|
| **API Routes** | `api/admin/invite-user.ts` |
| **Frontend Hooks** | `src/lib/hooks/useUsers.ts` |
| **Onboarding** | `src/pages/onboarding/v2/OnboardingV2.tsx`<br>`src/lib/stores/onboardingV2Store.ts`<br>`src/pages/onboarding/v2/PendingApprovalStep.tsx` |
| **Auth** | `src/pages/auth/AuthCallback.tsx`<br>`src/pages/auth/AcceptInvitation.tsx` |
| **Services** | `src/lib/services/joinRequestService.ts` |
| **Config** | `vercel.json` |
| **Migrations** | `supabase/migrations/` |
| **Edge Functions** | `supabase/functions/cleanup-expired-invitations/`<br>`supabase/functions/encharge-send-email/` |

---

## Next Steps

Run `60/run` to begin execution of the 19-story plan, or `60/status` to review the complete breakdown with dependencies.
