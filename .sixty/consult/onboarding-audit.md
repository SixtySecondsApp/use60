# Consult Report: Onboarding Flow Audit
Generated: 2026-02-03

## User Request
"Run through the onboarding and check for any bugs or logic errors. Should be smooth sailing from waitlist release to dashboard access."

## Clarifications
- Q: Auth method for waitlist users?
- A: Send them to a password/profile setup page, then proceed with onboarding

- Q: Business email domain matches existing org?
- A: Auto-join the org

- Q: Personal email users matching an existing org?
- A: Send join request (require admin approval)

- Q: When join request is denied?
- A: Both options: restart onboarding OR create their own org

- Q: Multiple org matches for business domain?
- A: Show list to choose

---

## Complete Flow Map

```
Waitlist Release (Admin clicks "Grant Access")
    |
    v
waitlistAdminService.grantAccess()
    |-- Generates custom token via generate-waitlist-token edge function
    |-- Builds URL: /auth/set-password?token=xxx&waitlist_entry=yyy
    |-- Sends email via encharge-send-email (template: waitlist_invite)
    |
    v
User clicks email link -> SetPassword.tsx
    |-- Validates token via validate-waitlist-token edge function
    |-- User enters: First Name, Last Name, Password, Confirm Password
    |-- Creates Supabase Auth user (signUp)
    |-- Updates waitlist entry to 'converted'
    |-- Signs in user
    |-- Syncs profile names (with retry + edge function fallback)
    |-- Redirects to /onboarding
    |
    v
ProtectedRoute checks:
    |-- Is authenticated? -> Yes
    |-- Email verified? -> Yes (auto-verified on signUp with password)
    |-- Profile status? -> 'active' (default)
    |-- Has org membership? -> No (new user)
    |-- Needs onboarding? -> Yes
    |-- -> Redirects to /onboarding
    |
    v
OnboardingV2.tsx (setUserEmail called)
    |
    |-- Business email (e.g. @acme.com)?
    |   |-- currentStep = 'enrichment_loading'
    |   |-- Auto-starts enrichment with domain
    |   |-- (Should check for existing org by domain first!)
    |   v
    |   enrichment_loading -> enrichment_result -> skills_config -> complete
    |
    |-- Personal email (gmail, hotmail, etc.)?
        |-- currentStep = 'website_input'
        v
        Website Input Step
        |-- User enters company website OR company name
        |
        |-- If website entered -> submitWebsite()
        |   |-- Extracts domain
        |   |-- Checks for existing org (exact match, then fuzzy)
        |   |-- If match found:
        |   |   |-- Creates join request
        |   |   |-- Sets profile_status = 'pending_approval'
        |   |   |-- currentStep = 'pending_approval'
        |   |   |-- ProtectedRoute redirects to /auth/pending-approval
        |   |-- If no match:
        |       |-- Creates/uses org, starts enrichment
        |       |-- enrichment_loading -> enrichment_result -> skills_config -> complete
        |
        |-- If no website -> manual_enrichment step
            |-- User fills company info form
            |-- submitManualEnrichment() -> createOrganizationFromManualData()
            |   |-- Checks for similar orgs (fuzzy match)
            |   |-- If high confidence match (>0.7):
            |   |   |-- Creates org with requires_admin_approval
            |   |   |-- Sets profile_status = 'pending_approval'
            |   |   |-- currentStep = 'pending_approval'
            |   |-- If similar orgs found (<0.7):
            |   |   |-- currentStep = 'organization_selection'
            |   |   |-- User chooses: join existing or create new
            |   |-- If no match:
            |       |-- Creates org, starts enrichment
            |       |-- enrichment_loading -> enrichment_result -> skills_config -> complete
```

---

## BUGS & LOGIC ERRORS FOUND

### BUG 1: Business email users bypass org domain check (CRITICAL)
**File**: `src/lib/stores/onboardingV2Store.ts:461`
**Issue**: When `setUserEmail()` is called with a business email, it sets `currentStep = 'enrichment_loading'` and the flow immediately starts enrichment. But there's **no check for whether an organization already exists for that email domain**.

Per your requirement, business email users should auto-join an existing org for their domain. Currently, they skip straight to enrichment and create a new org, leading to duplicate organizations.

**Expected behavior**: Business email users should:
1. Extract domain from email
2. Check if org exists for that domain
3. If yes: auto-join (or show selection if multiple matches)
4. If no: proceed to enrichment

**Fix needed**: Add a domain-check step before enrichment for business email users, or route them through `submitWebsite()` with their email domain pre-filled.

---

### BUG 2: `grantAccess()` uses template `waitlist_invite`, `bulkGrantAccess()` uses `waitlist_welcome` (INCONSISTENCY)
**File**: `src/lib/services/waitlistAdminService.ts:128` vs `:323`
**Issue**: Single grant uses `template_type: 'waitlist_invite'`, but bulk grant uses `template_type: 'waitlist_welcome'`. These are different templates with potentially different designs/content.

**Fix**: Both should use the same template type for consistency. Likely `waitlist_invite` is the correct one since it contains the setup link.

---

### BUG 3: `entry.company` referenced but column is `company_name` (DATA ERROR)
**File**: `src/lib/services/waitlistAdminService.ts:134`
**Issue**: `company_name: entry.company || ''` - The waitlist entry select only fetches `id, email, full_name, status`. The field `company` is not selected and doesn't exist. The actual column is `company_name` and it's not in the select query.

**Fix**: Add `company_name` to the select query and change `entry.company` to `entry.company_name`.

---

### BUG 4: RequestRejectedPage uses wrong column for fetching rejection details
**File**: `src/pages/auth/RequestRejectedPage.tsx:35`
**Issue**: The query uses `organization_id(name)` as a join but `organization_id` is a UUID column, not a FK relation name. The correct Supabase relation syntax would be `organizations(name)` since the FK references the `organizations` table via `org_id`. Also uses `organization_id` instead of `org_id`.

**Fix**: Change to `.select('org_id, rejection_reason, organizations(name)')` with `.eq('status', 'rejected')`.

---

### BUG 5: No `organization_selection` step UI rendered for multiple matches
**File**: `src/lib/stores/onboardingV2Store.ts:696-704`
**Issue**: When `createOrganizationFromManualData()` finds similar orgs with similarity < 0.7, it sets `currentStep = 'organization_selection'` and stores `similarOrganizations`. However, I need to verify the OnboardingV2 page actually renders a component for this step. The step is defined in the type but may not have a corresponding UI component.

---

### BUG 6: `submitWebsite()` creates join request but doesn't handle multiple matches
**File**: `src/lib/stores/onboardingV2Store.ts:506-530`
**Issue**: Per your requirement, if a domain fuzzy-matches multiple organizations, the user should be shown a list to choose from. Currently, `submitWebsite()` only takes the top match (`fuzzyMatches[0]`) with score > 0.7 and auto-creates a join request. If there are 2+ similar orgs, the user never sees a choice.

**Fix**: When fuzzy matching returns multiple results with score > 0.7, set `currentStep = 'organization_selection'` and let the user choose.

---

### BUG 7: `createOrganizationFromManualData` returns `organizationName` string instead of org ID on selection step
**File**: `src/lib/stores/onboardingV2Store.ts:704`
**Issue**: When routing to `organization_selection`, the function returns `organizationName` (a string) as if it's an org ID. The caller (`submitManualEnrichment`) then stores this as `organizationId` in the store via `set({ organizationId: finalOrgId })`. This pollutes the org ID with a company name string.

**Fix**: Return `null` or a sentinel value when routing to selection step, and don't set it as `organizationId`.

---

### BUG 8: `PendingApprovalPage` approval detection doesn't mark onboarding as complete
**File**: `src/pages/auth/PendingApprovalPage.tsx:147-152`
**Issue**: The comment says "We skip marking onboarding as complete because the user already completed onboarding." But for users who went through the personal email -> join request flow, they may NOT have completed onboarding (they never did enrichment/skills). When they get approved and redirected to `/dashboard`, `ProtectedRoute` will check `needsOnboarding` and redirect them back to `/onboarding`, creating a loop.

**Fix**: After approval, either:
- Mark onboarding as complete (upsert `user_onboarding_progress` with `onboarding_step: 'complete'`), OR
- Route them through the remaining onboarding steps (enrichment/skills) for their new org

---

### BUG 9: `SetPassword.tsx` navigates to `/onboarding` but doesn't pass user context
**File**: `src/pages/auth/SetPassword.tsx:362`
**Issue**: After account creation, the page navigates to `/onboarding` with `replace: true`. The onboarding page needs to detect the user's email, check if it's personal/business, and set the initial step. If the onboarding store doesn't get initialized with the user's email before rendering, it may default to `website_input` for everyone.

This should work if `OnboardingV2.tsx` reads the user email from the auth session on mount, but worth verifying.

---

### BUG 10: `orgStore` persists `activeOrgId` in localStorage - stale data after waitlist signup
**File**: `src/lib/stores/orgStore.ts:361-365` and `src/pages/auth/SetPassword.tsx:183`
**Issue**: `SetPassword.tsx` clears `org-store` from localStorage before signup (line 183), which is good. But if the ProtectedRoute's org membership check runs before `loadOrganizations()` finishes, the stale null state could cause issues. This is a race condition.

---

### BUG 11: `bulkGrantAccess` select doesn't match column names
**File**: `src/lib/services/waitlistAdminService.ts:237`
**Issue**: The select includes `company_name` in the type but the query selects `id, email, full_name, referral_code, company_name`. Then on line 338, it references `entry.company` which doesn't exist in the select. Should be `entry.company_name`.

---

## LOGIC GAPS (Not bugs, but missing requirements)

### GAP 1: No auto-join for business email users
**Your requirement**: "Business email users whose domain matches an existing org should auto-join."
**Current behavior**: Business emails go straight to enrichment, creating a new org. No domain matching happens.

### GAP 2: No "restart onboarding" option during enrichment/skills steps
**Your requirement**: "If they choose to restart then they should be able to."
**Current behavior**: There's a restart option on PendingApprovalPage and RequestRejectedPage, but not during the enrichment or skills configuration steps. Users stuck in enrichment have no way to go back.

### GAP 3: Approved users skip to dashboard without role assignment
**Your requirement**: "If they are accepted it should send them to the dashboard and have them join the organization with the provided role."
**Current behavior**: The `PendingApprovalPage` approval handler doesn't check what role was assigned. The `accept_join_request` RPC should handle this, but the approval detection hook just checks for membership existence, not role.

---

## SUMMARY OF SEVERITY

| # | Bug | Severity | Impact |
|---|-----|----------|--------|
| 1 | Business email bypasses org check | CRITICAL | Duplicate orgs for every business user |
| 2 | Template inconsistency | LOW | Different email appearance for single vs bulk |
| 3 | `entry.company` undefined | MEDIUM | Email sent with empty company field |
| 4 | Wrong column in rejection query | MEDIUM | Rejection page shows "the organization" fallback |
| 5 | Missing org selection UI | HIGH | Users see blank step when similar orgs found |
| 6 | No multi-match selection for websites | HIGH | Users can't choose between multiple matching orgs |
| 7 | Returns name string as org ID | HIGH | Corrupts org state when similar orgs found |
| 8 | Approval doesn't complete onboarding | CRITICAL | Approved users stuck in redirect loop |
| 9 | Onboarding email init | LOW | May work via auth context, needs verification |
| 10 | Stale org store race condition | LOW | Potential flash on first load |
| 11 | `entry.company` in bulk grant | MEDIUM | Email sent with undefined company |

---

## RECOMMENDED EXECUTION PLAN

| # | Story | Type | Priority |
|---|-------|------|----------|
| 1 | Add domain check for business email users before enrichment | backend/frontend | CRITICAL |
| 2 | Fix PendingApprovalPage to mark onboarding complete on approval | frontend | CRITICAL |
| 3 | Add multi-org selection when domain matches multiple orgs | frontend | HIGH |
| 4 | Fix `organization_selection` step to have proper UI rendering | frontend | HIGH |
| 5 | Fix `createOrganizationFromManualData` return value on selection step | backend | HIGH |
| 6 | Fix `entry.company` -> `entry.company_name` in both grant functions | backend | MEDIUM |
| 7 | Fix RequestRejectedPage query to use correct column names | frontend | MEDIUM |
| 8 | Unify template type in single vs bulk grant access | backend | LOW |
| 9 | Add restart/back option during enrichment steps | frontend | LOW |
