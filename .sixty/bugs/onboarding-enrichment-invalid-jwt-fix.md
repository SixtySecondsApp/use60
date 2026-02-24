# Bug Fix Report: Invalid JWT During Onboarding Enrichment

**Date:** 2026-02-06
**Issue:** Invalid JWT when finishing onboarding enrichment
**Root Cause:** JWT token expires during 5-minute polling without refresh logic
**Severity:** Critical (P0)

---

## Executive Summary

Users were experiencing "Invalid JWT" errors when completing the onboarding enrichment process. This occurred because:

1. JWT tokens were cached in localStorage and never refreshed during the 5-minute polling window
2. Edge function validation would fail with expired tokens
3. Error messages were generic and didn't guide users on remediation

The fix implements automatic JWT refresh before each polling attempt and improves error messaging throughout the flow.

---

## Bugs Fixed

### BUG-001: Add JWT Refresh in Polling Loop (CRITICAL - FIXED)
**File:** `src/lib/stores/onboardingV2Store.ts:1243`

**Problem:**
```typescript
// OLD CODE - Used cached session without refresh
const { data: { session } } = await supabase.auth.getSession();
```

**Fix:**
```typescript
// NEW CODE - Refreshes session to get fresh JWT
const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
```

**Impact:**
- Prevents "Invalid JWT" errors during enrichment
- Adds token expiry logging for debugging
- Provides clear error message on session expiry

---

### BUG-002: Fix pollEnrichmentStatus data.success Check (CRITICAL - FIXED)
**File:** `src/lib/stores/onboardingV2Store.ts:1256`

**Problem:**
```typescript
// OLD CODE - Destructured without checking success field
if (error) throw error;
const { status, enrichment, skills } = data;
```

**Fix:**
```typescript
// NEW CODE - Checks data.success before destructuring
if (error) throw error;

if (!data || data.success === false) {
  const errorMsg = data?.error || 'Failed to get enrichment status';
  console.error('[pollEnrichmentStatus] Edge function error:', errorMsg);
  throw new Error(errorMsg);
}

const { status, enrichment, skills } = data;
```

**Impact:**
- Properly handles edge function application errors
- Prevents undefined destructuring errors
- Logs edge function errors for debugging

---

### BUG-004: Improve Edge Function Error Messages (HIGH - FIXED)
**File:** `supabase/functions/deep-enrich-organization/index.ts:167`

**Problem:**
```typescript
// OLD CODE - Generic error message
if (userError || !user) {
  throw new Error('Invalid authentication token');
}
```

**Fix:**
```typescript
// NEW CODE - Includes detailed error information
if (userError || !user) {
  const errorDetails = userError
    ? `${userError.message || 'Unknown auth error'} (${userError.name || 'AuthError'})`
    : 'No user found in token';
  console.error('[deep-enrich-organization] Auth validation failed:', errorDetails);
  throw new Error(`Invalid authentication token: ${errorDetails}`);
}
```

**Impact:**
- Error messages show WHY authentication failed
- Distinguishes between expired, malformed, or invalid JWTs
- Improves debugging with detailed logging

---

### BUG-005: Use Proper HTTP Status Codes (HIGH - FIXED)
**File:** `supabase/functions/deep-enrich-organization/index.ts:207`

**Problem:**
```typescript
// OLD CODE - All errors returned HTTP 200
return new Response(
  JSON.stringify({ success: false, error: errorMessage }),
  { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
);
```

**Fix:**
```typescript
// NEW CODE - Returns 401 for auth, 500 for server errors
const isAuthError = errorMessage.toLowerCase().includes('authentication') ||
                   errorMessage.toLowerCase().includes('token') ||
                   errorMessage.toLowerCase().includes('unauthorized');
const statusCode = isAuthError ? 401 : 500;

return new Response(
  JSON.stringify({ success: false, error: errorMessage }),
  { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
);
```

**Impact:**
- Supabase SDK can properly detect error types
- Standard HTTP semantics for better monitoring
- Easier to track auth vs server errors in logs

---

### BUG-006: Add User-Friendly Error Categorization (MEDIUM - PARTIAL FIX)
**File:** `src/lib/stores/onboardingV2Store.ts:1305-1314`

**Problem:**
```typescript
// OLD CODE - Generic error message
const message = error instanceof Error ? error.message : 'Failed to get enrichment status';
set({ enrichmentError: message });
```

**Fix:**
```typescript
// NEW CODE - Categorizes errors and provides actionable guidance
let userMessage = message;
if (message.includes('session') || message.includes('authentication') || message.includes('JWT') || message.includes('token')) {
  userMessage = 'Your session has expired. Please refresh the page and try again.';
} else if (message.includes('network') || message.includes('fetch')) {
  userMessage = 'Network error. Please check your connection and try again.';
}
set({ enrichmentError: userMessage });
```

**Impact:**
- Users see helpful, actionable error messages
- Auth errors guide user to refresh page
- Network errors suggest checking connection

---

## Technical Details

### Root Cause Analysis

The "Invalid JWT" error chain:

1. **User starts enrichment** → JWT is fresh ✅
2. **Polling begins** → Uses cached JWT from `getSession()` ⚠️
3. **5 minutes of polling** → JWT never refreshed (150 attempts at 2s interval) 🚨
4. **JWT expires mid-polling** → Still in localStorage, not detected 🔴
5. **Edge function validates JWT** → `supabase.auth.getUser(token)` fails 💥
6. **Error: "Invalid authentication token"** → User sees generic error ❌

### Why refreshSession() Fixes It

- `getSession()` returns **cached session** from localStorage
- `refreshSession()` makes a **network call** to get a fresh token
- New token is automatically stored and used for subsequent requests
- Polling continues successfully even if original JWT would have expired

---

## Testing

### Manual Testing
- [x] Start enrichment with fresh JWT - completes successfully
- [x] Simulate near-expired JWT - auto-refreshes during polling
- [x] Verify no "Invalid JWT" error appears
- [x] Check error messages are user-friendly

### Automated Testing
- [ ] Unit test for token refresh in polling loop
- [ ] Unit test for data.success check
- [ ] Integration test with mock near-expired JWT

---

## Files Modified

1. `src/lib/stores/onboardingV2Store.ts`
   - Line 1243-1260: Added refreshSession() and data.success check
   - Line 1305-1325: Improved error categorization

2. `supabase/functions/deep-enrich-organization/index.ts`
   - Line 167-175: Enhanced auth error messages
   - Line 207-219: Proper HTTP status codes

---

## Verification

To verify the fix works:

1. **Session Refresh Logging**
   - Check browser console during enrichment
   - Should see: `[pollEnrichmentStatus] Token expires at: [ISO timestamp]`
   - Token expiry should be refreshed on each poll

2. **Error Messages**
   - If session expires, should see: "Your session has expired. Please refresh the page and try again."
   - NOT: "Invalid JWT" or "Failed to get enrichment status"

3. **Edge Function Logs**
   - If auth fails, logs should include detailed error
   - Example: `Auth validation failed: JWT expired (AuthApiError)`

---

## Next Steps

### Remaining Issues (Lower Priority)

**BUG-003: Replace localStorage JWT read (P1)**
- File: `src/lib/supabase/clientV2.ts:218`
- Custom fetch still reads from localStorage
- Should use getSession() API instead

**Full BUG-006: Complete error categorization (P2)**
- Add more sophisticated error detection
- Category-based retry logic
- User action recommendations

### Monitoring Recommendations

1. **Track JWT Refresh Rate**
   - Monitor `TOKEN_REFRESHED` auth events during onboarding
   - Alert if refresh rate is abnormally high

2. **Session Age Metrics**
   - Measure time between session creation and enrichment start
   - Alert if users starting enrichment with old sessions

3. **Error Rate Tracking**
   - Monitor 401 errors from edge functions
   - Track "session expired" message frequency

---

## Deployment

### Pre-Deployment Checklist
- [x] Code changes reviewed
- [x] Files modified documented
- [x] Error handling verified
- [ ] Tests added
- [ ] Staging deployment tested

### Post-Deployment Monitoring
- Monitor Supabase Edge Function logs for auth errors
- Track user reports of "Invalid JWT"
- Measure enrichment completion rates

---

## Contributors

**Analysis:** 4 specialized bug hunter agents (Code Tracer, Logic Analyzer, Error Tracker, Edge Case Hunter)
**Implementation:** Claude Sonnet 4.5
**Testing:** Manual verification

---

## References

- Supabase Auth Documentation: https://supabase.com/docs/guides/auth/sessions
- JWT Best Practices: https://supabase.com/docs/guides/auth/jwts
- Edge Function Authentication: https://supabase.com/docs/guides/functions/auth
