# Bug Report: Onboarding V2 - Comprehensive Analysis
Generated: 2026-02-05
Reported Symptoms:
- Enrichment instantly fails with "timeout after 5 minutes" message
- PGRST116 error on check_existing_org_by_email_domain
- Wrong organization created (name="google.com", website="acme.com")
- Enrichment skipped after retries
- Auto-joined to new org without enrichment completing

---

## Executive Summary

The onboarding V2 flow has **7 critical bugs** that break the core user experience:

1. ✅ **Instant Timeout** - Enrichment fails immediately but shows misleading "5 minute timeout" message
2. ✅ **Wrong Organization Data** - Org created with domain as name, manual data doesn't update it
3. ✅ **Enrichment Skipped** - After enrichment retries, manual flow bypasses org name update
4. ✅ **Auto-Join Without Approval** - Exact domain matches bypass join request approval flow
5. ✅ **Multiple Conflicting Checks** - Three separate org existence checks cause race conditions
6. ✅ **Empty Org Join Allowed** - Can join organizations with no active members
7. ⚠️ **PGRST116 Error** - RPC may not be deployed (already fixed in code)

---

## Bug Details

### 🔴 BUG-001: Instant Enrichment Failure with Misleading Timeout Message

**Severity**: Critical
**Priority**: P0
**Confidence**: 95%

**Location**:
- `supabase/functions/deep-enrich-organization/index.ts:564-642`
- `src/lib/stores/onboardingV2Store.ts:1132-1159`

**Description**:
When enrichment starts, the pipeline can fail immediately (2-10 seconds) due to:
- Website scraping blocked/failed (403, 404, network timeout)
- Missing GEMINI_API_KEY
- AI response parsing failure

However, the error message shown says "Enrichment timed out after 5 minutes" even though it never actually ran for 5 minutes.

**Root Cause**:
The backend timeout check (5 minutes) only triggers for long-running jobs. When the pipeline fails instantly, it shows whatever error occurred, but users see a timeout message in the UI because that's the only context they have.

**Impact**:
- User confusion (thinks they waited 5 minutes, actually failed in seconds)
- No visibility into actual failure reason
- Cannot debug website access issues

**Fix Approach**:
1. Add specific error messages for common failure modes
2. Add fetch timeouts to website scraping (10s per page)
3. Add better logging to track where pipeline fails
4. Show actual error message to user instead of generic timeout

**Test Cases**:
- Website blocking bots → shows "website blocking automated access"
- Network timeout → shows "website unreachable"
- AI API error → shows "AI service error, please contact support"

---

### 🔴 BUG-002: Organization Created with Domain as Name

**Severity**: Critical
**Priority**: P0
**Confidence**: 99%

**Location**: `src/lib/stores/onboardingV2Store.ts:742`

**Description**:
When user enters a website (e.g., "acme.com"), the code creates an organization with:
- `name: "acme.com"` (the domain) ❌
- `company_domain: "acme.com"` ✅

Instead of waiting for enrichment to discover the actual company name (e.g., "Acme Software Inc.")

**Root Cause**:
```typescript
// Line 742 - Uses domain as name
const organizationName = domain || 'My Organization';
```

The organization is created **immediately** when `submitWebsite()` is called, before enrichment completes.

**Impact**:
- All organizations have domain names instead of proper company names
- User never gets to review/edit company name
- Database filled with "google.com", "microsoft.com" instead of "Google", "Microsoft"

**Fix Approach**:
1. Option A: Don't create org until enrichment completes
2. Option B: Create with placeholder name "My Organization", update after enrichment
3. Option C: Update org name when enrichment completes successfully

Recommend Option C for minimal refactoring.

**Test Cases**:
- Enter website → enrichment succeeds → org name is company name from enrichment
- Enter website → enrichment fails → manual entry updates org name
- Personal email → manual entry creates org with correct name

---

### 🟠 BUG-003: Manual Enrichment Doesn't Update Existing Organization

**Severity**: High
**Priority**: P1
**Confidence**: 99%

**Location**: `src/lib/stores/onboardingV2Store.ts:1040-1086`

**Description**:
When enrichment fails after retries and user provides manual company data, the code:
1. Checks if organization ID already exists
2. If exists → skips creating new org
3. Sends manual data to edge function for skill generation
4. **NEVER updates the organization name with manual data**

**Root Cause**:
```typescript
// submitManualEnrichment line 1057
if (!finalOrgId || finalOrgId === '') {
  // Only creates/updates org if ID is empty
  finalOrgId = await get().createOrganizationFromManualData(session.user.id, manualData);
}

// If ID exists, jumps straight to edge function call (line 1069)
// Organization name never updated with manualData.company_name
```

**Impact**:
- Organization keeps wrong name even after user manually provides correct name
- User enters "Acme Software" manually, org stays as "acme.com"
- Enrichment runs with manual data, but org metadata is wrong

**Fix Approach**:
Before calling edge function in `submitManualEnrichment`, add:
```typescript
if (finalOrgId && manualData.company_name) {
  await supabase
    .from('organizations')
    .update({ name: manualData.company_name })
    .eq('id', finalOrgId);
}
```

**Test Cases**:
- Enrichment fails → manual entry → org name updated to manual input
- Enrichment succeeds → org name from enrichment
- Both paths result in correct org name

---

### 🟠 BUG-004: Auto-Join Exact Domain Matches Without Approval

**Severity**: High (Security Risk)
**Priority**: P1
**Confidence**: 99%

**Location**: `src/lib/stores/onboardingV2Store.ts:507-541`

**Description**:
For **exact domain matches**, the code automatically creates a membership without admin approval:

```typescript
// Lines 507-520
if (hasExactMatch && exactMatchOrg) {
  await supabase
    .from('organization_memberships')
    .insert({
      org_id: exactMatchOrg.id,
      user_id: session.user.id,
      role: 'member', // ❌ No approval required
    });
}
```

**Security Implications**:
- Anyone with an email from that domain can join instantly
- Ex-employees can rejoin after being removed
- Contractors/consultants get automatic access
- No admin visibility into who joins

**Expected Behavior**:
ALL matches (exact and fuzzy) should require join request → admin approval → membership creation.

**Fix Approach**:
Replace auto-membership insert with join request creation:
```typescript
if (hasExactMatch && exactMatchOrg) {
  await supabase.rpc('create_join_request', {
    p_org_id: exactMatchOrg.id,
    p_user_id: session.user.id,
    p_email: session.user.email,
  });
  set({ step: 'pending_approval' });
}
```

**Test Cases**:
- Exact domain match → join request created → pending approval
- Admin approves → user gets membership
- Admin rejects → user can retry or create new org

---

### 🟡 BUG-005: Multiple Conflicting Organization Existence Checks

**Severity**: Medium (Causes Race Conditions)
**Priority**: P2
**Confidence**: 90%

**Locations**:
1. `onboardingV2Store.ts:463-579` - `setUserEmail()`
2. `onboardingV2Store.ts:609-796` - `submitWebsite()`
3. `OnboardingV2.tsx:272-320` - `checkBusinessEmailOrg()` useEffect

**Description**:
Three separate places check for existing organizations with different logic:
- `setUserEmail()`: Checks on email entry for business domains
- `submitWebsite()`: Checks when user submits website URL
- `checkBusinessEmailOrg()`: Runs in useEffect with skip conditions

**Problems**:
- Race conditions between checks
- Inconsistent behavior depending on timing
- Skip logic prevents checks during critical steps
- User redirected multiple times

**Root Cause**:
```typescript
// OnboardingV2.tsx line 276-279 - Skips during these steps!
const stepsToSkip = ['pending_approval', 'enrichment_loading', 'enrichment_result',
                     'skills_config', 'complete', 'organization_selection'];
if (stepsToSkip.includes(currentStep)) {
  return; // Won't check for existing orgs
}
```

If user is already on `enrichment_loading` (happens for business emails), the check is skipped entirely.

**Impact**:
- Duplicate organizations created
- Users bypass join request flow
- Inconsistent user experience

**Fix Approach**:
1. Remove useEffect check from OnboardingV2.tsx (most problematic)
2. Consolidate logic into store methods only
3. Remove skip conditions or make them smarter

**Test Cases**:
- Business email → exactly one org check → correct flow
- Personal email + website → exactly one org check → correct flow
- No race conditions or duplicate checks

---

### 🟡 BUG-006: Can Join Empty Organizations

**Severity**: Medium
**Priority**: P2
**Confidence**: 85%

**Location**:
- `src/lib/stores/onboardingV2Store.ts:666-735`
- `supabase/migrations/20260126000001_add_domain_fuzzy_search.sql:36-47`

**Description**:
When `submitWebsite()` finds an existing org, it creates a join request without checking if the org has active members. Users can request to join "ghost" organizations with no admins to approve them.

**Root Cause**:
```typescript
// submitWebsite line 666 - No member count check!
if (existingOrg) {
  // Immediately creates join request
  const joinRequestResult = await supabase.rpc('create_join_request', {...});
}
```

Compare with OnboardingV2.tsx which checks:
```typescript
if (existingOrg && existingOrg.should_request_join && existingOrg.member_count > 0) {
  // Only shows if org has active members ✅
}
```

Additionally, `find_similar_organizations_by_domain` RPC counts ALL members (including inactive):
```sql
LEFT JOIN organization_memberships om ON o.id = om.org_id
-- Missing: AND om.member_status = 'active'
```

**Impact**:
- Users stuck in pending approval with no admin to approve
- Ghost organizations clutter database
- Poor user experience

**Fix Approach**:
1. Add member count check in `submitWebsite()` before creating join request
2. Update `find_similar_organizations_by_domain` RPC to filter active members only
3. Handle edge case: if no active members, allow user to create new org instead

**Test Cases**:
- Org with 0 members → don't show join option → create new
- Org with 1+ active members → show join option
- Org with only inactive members → treated as empty

---

### ⚠️ BUG-007: PGRST116 Error on check_existing_org_by_email_domain

**Severity**: Low (Already Fixed)
**Priority**: P3
**Confidence**: 100%

**Location**: `src/pages/onboarding/v2/OnboardingV2.tsx:286-296`

**Description**:
User reported PGRST116 error: "Cannot coerce the result to a single JSON object" (0 rows returned).

**Status**: ✅ **ALREADY FIXED** in code

The code correctly uses `.maybeSingle()`:
```typescript
const { data: existingOrg, error } = await supabase
  .rpc('check_existing_org_by_email_domain', {
    p_email: userEmail,
  })
  .maybeSingle(); // ✅ Won't throw PGRST116
```

**Possible Causes of User's Error**:
1. RPC function not deployed to their Supabase instance
2. Running older version of code
3. Error occurred before fix was deployed

**Fix Approach**:
Verify RPC is deployed and add better error handling:
```typescript
if (error) {
  console.warn('[OnboardingV2] RPC check_existing_org_by_email_domain failed:', error);
  // Continue without org check rather than blocking user
  return;
}
```

**Test Cases**:
- RPC not deployed → fails silently → user continues to enrichment
- RPC deployed, 0 results → returns null → user continues to enrichment
- RPC deployed, 1 result → returns org → user sent to join request

---

## Impact Summary

| Bug | User Impact | Data Impact | Security Impact |
|-----|-------------|-------------|-----------------|
| BUG-001 | Confusion, wasted time | None | None |
| BUG-002 | Wrong org names | Data corruption | None |
| BUG-003 | Manual entry ignored | Data corruption | None |
| BUG-004 | Unauthorized access | None | **HIGH** |
| BUG-005 | Duplicate orgs | Data pollution | Low |
| BUG-006 | Stuck in pending | None | None |
| BUG-007 | Blocking error | None | None |

---

## Prioritized Fix Order

```
BUG-004 [P1-Security] Fix auto-join without approval
  └── Security risk, must fix first
  └── Approach: Create join request instead of membership
  └── Est: 15 min

BUG-002 [P0] Don't use domain as organization name
  └── Blocks: BUG-003
  └── Approach: Use placeholder or wait for enrichment
  └── Est: 10 min

BUG-003 [P1] Update org name with manual enrichment data
  └── Depends: BUG-002
  └── Approach: Add org update before edge function call
  └── Est: 15 min

BUG-001 [P0] Fix enrichment error messages
  └── Parallel with: BUG-002, BUG-003
  └── Approach: Better error messages, logging, timeouts
  └── Est: 30 min

BUG-005 [P2] Remove conflicting org checks
  └── Depends: BUG-001, BUG-002, BUG-003, BUG-004
  └── Approach: Remove OnboardingV2.tsx useEffect check
  └── Est: 20 min

BUG-006 [P2] Validate member count before join
  └── Parallel with: BUG-005
  └── Approach: Check member_count > 0 before join request
  └── Est: 15 min

BUG-007 [P3] Verify RPC deployment
  └── After all fixes
  └── Approach: Check migrations, add error recovery
  └── Est: 10 min
```

**Total Estimated Time**: ~115 minutes (~2 hours)

---

## Test Plan

After fixes, verify:

### Core Flow Tests
- [ ] Personal email + website URL → enrichment succeeds → org created with correct name
- [ ] Personal email + website URL → enrichment fails → manual entry → org name updated
- [ ] Business email + exact domain match → join request created → pending approval
- [ ] Business email + fuzzy domain match → org selection → join request → pending approval
- [ ] Business email + no match → enrichment → org created with correct name

### Error Handling Tests
- [ ] Website unreachable → clear error message (not "5 minute timeout")
- [ ] Website blocks scraping → clear error message + manual entry option
- [ ] Enrichment timeout (actual 5 min) → timeout message accurate
- [ ] PGRST116 error → handled gracefully, user not blocked

### Security Tests
- [ ] Exact domain match → NO auto-join → join request required
- [ ] Admin approval required for all join requests
- [ ] Cannot join organizations with 0 active members
- [ ] Removed users cannot auto-rejoin

### Edge Case Tests
- [ ] Multiple retries → manual entry → org name correct
- [ ] Switch from enrichment to manual → no duplicate orgs
- [ ] Concurrent org checks → no race conditions
- [ ] Empty org found → user redirected to create new

---

## Migration Required

✅ **YES** - Database RPC updates needed

**Files**:
- `supabase/migrations/YYYYMMDDHHMMSS_fix_onboarding_bugs.sql`
  - Update `find_similar_organizations_by_domain` to filter active members
  - Verify `check_existing_org_by_email_domain` is deployed with active member filter

---

## Related Files

**Frontend**:
- `src/lib/stores/onboardingV2Store.ts` (1500+ lines, core logic)
- `src/pages/onboarding/v2/OnboardingV2.tsx` (main container)
- `src/pages/onboarding/v2/EnrichmentLoadingStep.tsx` (error display)
- `src/pages/onboarding/v2/WebsiteInputStep.tsx` (website entry)

**Backend**:
- `supabase/functions/deep-enrich-organization/index.ts` (enrichment pipeline)
- `supabase/migrations/20260126000001_add_domain_fuzzy_search.sql` (fuzzy matching RPC)
- `supabase/migrations/20260205100200_fix_business_email_org_check_empty_orgs.sql` (active member filter)

**Services**:
- `src/lib/services/joinRequestService.ts` (join request management)
- `src/lib/services/organizationAdminService.ts` (org management)

---

## Agent Analysis Credits

This report synthesized findings from 4 specialized bug hunter agents:

1. **Explore Agent** - Mapped onboarding file structure and flow
2. **Enrichment Timeout Agent** - Analyzed timeout and PGRST116 errors
3. **Org Creation Agent** - Found wrong name and skipped enrichment bugs
4. **Join Request Agent** - Discovered auto-join and member count issues
