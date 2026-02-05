# Onboarding V2 Bug Fixes - Summary

**Date**: 2026-02-05
**Commit**: f3d155b6
**Branch**: fix/go-live-bug-fixes

---

## Overview

Fixed **4 critical bugs** in the onboarding V2 flow that were causing:
- ❌ Instant enrichment failures with misleading timeout messages
- ❌ Organizations created with domain names instead of company names
- ❌ Security vulnerability allowing unauthorized auto-join
- ❌ Manual enrichment data being ignored

All bugs have been fixed and committed.

---

## Bugs Fixed

### ✅ BUG-004 [P1-SECURITY] Auto-Join Without Approval

**Severity**: High (Security Risk)
**File**: `src/lib/stores/onboardingV2Store.ts:507-541`

**Problem**:
Exact domain matches bypassed the join request approval flow. Anyone with an `@company.com` email could join instantly without admin approval, creating security risks for:
- Ex-employees rejoining after being removed
- Contractors/consultants getting unauthorized access
- No admin visibility into who joins

**Fix**:
```typescript
// BEFORE: Auto-created membership directly
await supabase
  .from('organization_memberships')
  .insert({
    org_id: exactMatchOrg.id,
    user_id: session.user.id,
    role: 'member', // ❌ No approval required
  });

// AFTER: Create join request requiring approval
const joinRequestResult = await supabase.rpc('create_join_request', {
  p_org_id: exactMatchOrg.id,
  p_user_id: session.user.id,
  p_user_profile: profileData,
});
```

**Result**: All matches (exact and fuzzy) now require admin approval before membership creation.

---

### ✅ BUG-002 [P0] Domain Used as Organization Name

**Severity**: Critical (Data Corruption)
**File**: `src/lib/stores/onboardingV2Store.ts:764`

**Problem**:
Organizations were created with the domain as the name (e.g., `"acme.com"`) instead of waiting for enrichment to discover the actual company name (e.g., `"Acme Software Inc."`).

**Fix**:
```typescript
// BEFORE: Used domain as name
const organizationName = domain || 'My Organization';

// AFTER: Use placeholder, update after enrichment
const organizationName = 'My Organization';
```

Plus added org name update when enrichment completes:
```typescript
// In pollEnrichmentStatus when status === 'completed'
if (enrichment.company_name && organizationId) {
  await supabase
    .from('organizations')
    .update({ name: enrichment.company_name })
    .eq('id', organizationId);
}
```

**Result**: Organizations now have proper company names from enrichment data.

---

### ✅ BUG-003 [P1] Manual Enrichment Doesn't Update Org Name

**Severity**: High (Data Corruption)
**File**: `src/lib/stores/onboardingV2Store.ts:1080-1089`

**Problem**:
After enrichment retries failed and user provided manual company data, the existing organization name was never updated. User would enter "Acme Software" but org would stay as "acme.com".

**Fix**:
```typescript
// Added before calling edge function in submitManualEnrichment
if (finalOrgId && manualData.company_name) {
  await supabase
    .from('organizations')
    .update({ name: manualData.company_name })
    .eq('id', finalOrgId);
}
```

**Result**: Manual enrichment now updates organization name correctly.

---

### ✅ BUG-001 [P0] Misleading Enrichment Error Messages

**Severity**: Critical (Poor UX)
**File**: `supabase/functions/deep-enrich-organization/index.ts:630-653`

**Problem**:
Enrichment failed immediately (2-10 seconds) but showed generic "timeout after 5 minutes" message. Users had no visibility into actual failure reasons (website blocked, network timeout, AI error).

**Fixes Applied**:

1. **User-friendly error messages**:
```typescript
// Before: Generic technical errors
const errorMessage = extractErrorMessage(error);

// After: Context-specific user messages
let userMessage = rawMessage;
if (rawMessage.includes('Could not scrape')) {
  userMessage = 'Unable to access website. It may be blocking automated access...';
} else if (rawMessage.includes('GEMINI_API_KEY')) {
  userMessage = 'AI service configuration error. Please contact support...';
} else if (rawMessage.includes('Failed to parse')) {
  userMessage = 'AI response was invalid. Please try again...';
}
```

2. **Added fetch timeouts** (10 seconds per page):
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10000);

const response = await fetch(url, {
  signal: controller.signal,
});

clearTimeout(timeoutId);
```

3. **Better logging** to track pipeline progress:
```typescript
console.log(`[Pipeline] Step 1/3: Scraping ${domain}`);
// ... scraping ...
console.log(`[Pipeline] Step 1/3: ✓ Scraped ${scrapedContent.length} chars`);

console.log(`[Pipeline] Step 2/3: Extracting data with AI`);
// ... extraction ...
console.log(`[Pipeline] Step 2/3: ✓ Extracted company: ${enrichmentData.company_name}`);

console.log(`[Pipeline] Step 3/3: Generating skills`);
// ... skill generation ...
console.log(`[Pipeline] Step 3/3: ✓ Generated ${Object.keys(skills).length} skills`);
```

**Result**: Users now see clear, actionable error messages and developers can debug issues from logs.

---

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/stores/onboardingV2Store.ts` | Fixed auto-join, org naming, manual enrichment update |
| `supabase/functions/deep-enrich-organization/index.ts` | Improved error messages, added timeouts, better logging |

**Total Lines Changed**: 121 insertions, 33 deletions

---

## Testing Recommendations

### Critical Flows to Test

1. **Security (BUG-004)**:
   - [ ] User with @company.com email → join request created (not auto-joined)
   - [ ] Admin must approve before membership created
   - [ ] Pending approval step shows correctly

2. **Organization Naming (BUG-002 & BUG-003)**:
   - [ ] Personal email + website → enrichment succeeds → org name is company name
   - [ ] Personal email + website → enrichment fails → manual entry → org name updated
   - [ ] No orgs with domain names like "acme.com"

3. **Error Messages (BUG-001)**:
   - [ ] Website unreachable → clear error message (not generic timeout)
   - [ ] Website blocks scraping → "blocking automated access" message
   - [ ] Enrichment succeeds → check logs show Step 1/3, 2/3, 3/3 progress

### Edge Cases

- [ ] Multiple retries → manual entry → org name correct
- [ ] Existing org with exact domain → join request flow
- [ ] Business email + exact match → join request → pending approval
- [ ] Network timeout → graceful failure with clear message

---

## Remaining Bugs (Lower Priority)

| Bug | Priority | Status |
|-----|----------|--------|
| BUG-005: Multiple conflicting checks | P2 | Pending |
| BUG-006: Can join empty orgs | P2 | Pending |
| BUG-007: PGRST116 error handling | P3 | Pending |

These can be addressed in a follow-up PR.

---

## Impact Summary

| Issue | Before | After |
|-------|--------|-------|
| **Security** | Anyone with @company.com auto-joins | All joins require admin approval ✅ |
| **Org Names** | Domain names like "acme.com" | Company names like "Acme Software" ✅ |
| **Manual Data** | Ignored after retry | Updates org name correctly ✅ |
| **Error Messages** | Generic "timeout" | Specific, actionable messages ✅ |
| **Debugging** | No visibility | Step-by-step progress logs ✅ |

---

## Deployment Notes

**No database migrations required** for these fixes - they only modify application logic.

The edge function changes will be automatically deployed with the next Supabase function deployment.

---

## Related Issues

These fixes address the user-reported symptoms:
- ✅ "Enrichment instantly fails and tells me it timed out after 5 minutes"
- ✅ "Organization created with name='google.com', website='acme.com' (backwards)"
- ✅ "Enrichment skipped after retries"
- ✅ "Auto-joined to new org without enrichment completing"

The PGRST116 error was already fixed in the code (using `.maybeSingle()`), but may require RPC function deployment verification.
