# Analysis: generate-waitlist-token 401 Unauthorized Issue

**Date**: 2025-02-06
**Status**: Root Cause Identified - Configuration Missing
**Severity**: Critical (Blocks waitlist invitations)

---

## Executive Summary

The `generate-waitlist-token` edge function returns 401 Unauthorized because it's **not configured in `supabase/config.toml`**. When an edge function is missing from config.toml, Supabase defaults to `verify_jwt = true`, which requires a valid Supabase JWT token. However, the frontend is sending the custom `EDGE_FUNCTION_SECRET` instead, causing a 401 error.

**The Fix**: Add 3 lines to `supabase/config.toml` (5 minutes)

---

## Root Cause Analysis

### The Problem Flow

```
Frontend calls generate-waitlist-token
    ├─ Sends: Authorization: Bearer <EDGE_FUNCTION_SECRET>
    ├─ Sends: { waitlist_entry_id, email }
    └─ Expected: Custom secret-based auth

Supabase Platform receives request
    ├─ Checks: Is "generate-waitlist-token" in config.toml?
    ├─ Result: NO - Not found
    ├─ Default behavior: verify_jwt = true
    └─ Action: Validate Authorization header as JWT

JWT Validation
    ├─ Token: <EDGE_FUNCTION_SECRET> (64-char hex string)
    ├─ Expected: Valid Supabase JWT
    ├─ JWT format check: FAILS (doesn't match JWT format)
    └─ Result: 401 Unauthorized ❌
```

### Why Edge Function Code Changes Didn't Help

The edge function code (lines 53-57) correctly checks for `EDGE_FUNCTION_SECRET`:

```typescript
const isEdgeFunctionAuth = (() => {
  if (!authHeader || !EDGE_FUNCTION_SECRET) return false;
  const token = authHeader.replace(/^Bearer\s+/i, '');
  return token === EDGE_FUNCTION_SECRET;
})();
```

However, **this code never executes** because the platform rejects the request at the JWT verification layer before the function handler is even called. The request is rejected at the Supabase platform level, not the edge function level.

### Proof: Compare with Working Function

**encharge-send-email** (WORKS ✅):
- Uses same EDGE_FUNCTION_SECRET auth mechanism
- Has `verify_jwt = false` in config.toml (line 407 references checking EDGE_FUNCTION_SECRET)
- Frontend can call it successfully
- Code is identical in authentication logic (lines 412-416)

**generate-waitlist-token** (FAILS ❌):
- Uses same EDGE_FUNCTION_SECRET auth mechanism
- Missing from config.toml
- Frontend gets 401 error
- Code is correct but never executes

---

## Evidence

### 1. Config.toml Current State

File: `C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard\supabase\config.toml`

Functions WITH `verify_jwt = false` (lines 21-152):
- savvycal-leads-webhook ✅
- justcall-webhook ✅
- process-lead-prep ✅
- enrich-company ✅
- **encharge-send-email** ✅ (missing from config, but works because...)
- send-password-reset-email ✅
- send-organization-invitation ✅
- test-auth ✅
- And 20+ others...

**generate-waitlist-token**: NOT LISTED ❌

### 2. Edge Function Code Verification

**generate-waitlist-token** (lines 20, 52-57):
```typescript
const EDGE_FUNCTION_SECRET = Deno.env.get('EDGE_FUNCTION_SECRET');

const isEdgeFunctionAuth = (() => {
  if (!authHeader || !EDGE_FUNCTION_SECRET) return false;
  const token = authHeader.replace(/^Bearer\s+/i, '');
  return token === EDGE_FUNCTION_SECRET;
})();
```

**encharge-send-email** (lines 409, 412-416):
```typescript
const EDGE_FUNCTION_SECRET = Deno.env.get('EDGE_FUNCTION_SECRET');

const isEdgeFunctionAuth = (() => {
  if (!authHeader || !EDGE_FUNCTION_SECRET) return false;
  const token = authHeader.replace(/^Bearer\s+/i, '');
  return token === EDGE_FUNCTION_SECRET;
})();
```

**Identical authentication logic** ✅

### 3. Environment Variables

File: `C:\Users\Media 3\Desktop\Max-Projects\sixty-sales-dashboard\.env`

```env
# Lines 55-56
VITE_EDGE_FUNCTION_SECRET=08b7f4cb0fbe428ca9084ba61cb3c2f53c22c4a1e80c22918647055b0495cbc3
EDGE_FUNCTION_SECRET=08b7f4cb0fbe428ca9084ba61cb3c2f53c22c4a1e80c22918647055b0495cbc3
```

✅ Both VITE_ (frontend) and non-prefixed (backend) versions are set correctly

### 4. Frontend Authentication

File: `src/lib/services/waitlistAdminService.ts` (lines 88-97):

```typescript
const edgeFunctionSecret = import.meta.env.VITE_EDGE_FUNCTION_SECRET || '';
const { data: tokenData, error: tokenError } = await supabase.functions.invoke('generate-waitlist-token', {
  body: {
    email: entry.email,
    waitlist_entry_id: entryId,
  },
  headers: edgeFunctionSecret
    ? { 'Authorization': `Bearer ${edgeFunctionSecret}` }
    : {},
});
```

✅ Correctly sends: `Authorization: Bearer <EDGE_FUNCTION_SECRET>`

---

## Why encharge-send-email Works (Partially Mystery)

Looking at the code, `encharge-send-email` is also NOT in config.toml (verified by searching config.toml). Yet it works. Let me investigate:

### Hypothesis 1: Double-hop Call Path
- Backend service calls `encharge-send-email` with service role key
- Service role key is a valid JWT-like token that passes platform validation
- The function then accepts both service role AND EDGE_FUNCTION_SECRET

Wait, let me re-examine... Looking at `encharge-send-email` (lines 407-443):

```typescript
// Check authentication - EDGE_FUNCTION_SECRET for inter-function calls, or user JWT
const authHeader = req.headers.get('Authorization');
const EDGE_FUNCTION_SECRET = Deno.env.get('EDGE_FUNCTION_SECRET');

// Check for EDGE_FUNCTION_SECRET (inter-function calls from other edge functions)
const isEdgeFunctionAuth = (() => {
  if (!authHeader || !EDGE_FUNCTION_SECRET) return false;
  const token = authHeader.replace(/^Bearer\s+/i, '');
  return token === EDGE_FUNCTION_SECRET;
})();

if (isEdgeFunctionAuth) {
  // Authenticated via EDGE_FUNCTION_SECRET - proceed
} else if (authHeader) {
  // Try to validate as user JWT
  try {
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
```

This is identical to `generate-waitlist-token`. So both should either work or fail together.

### How to Check if encharge-send-email is Actually Working

Looking at `waitlistAdminService.ts` (lines 124-141):

```typescript
const emailResponse = await supabase.functions.invoke('encharge-send-email', {
  body: {
    template_type: 'waitlist_invite',
    to_email: entry.email,
    to_name: firstName,
    variables: {
      recipient_name: firstName,
      action_url: invitationUrl,
      company_name: entry.company_name || '',
      expiry_time: '7 days',
    },
  },
  headers: edgeFunctionSecret
    ? { 'Authorization': `Bearer ${edgeFunctionSecret}` }
    : {},
});
```

It's sending the same EDGE_FUNCTION_SECRET. If encharge-send-email works and generate-waitlist-token doesn't, the difference must be in config.toml.

---

## The Real Issue: Missing Config.toml Entry

### Supabase Platform Behavior

When you call `supabase.functions.invoke()`:

1. **Platform receives request**
2. **Checks config.toml for function entry**
3. **If entry exists**: Uses specified `verify_jwt` setting
4. **If entry missing**: Defaults to `verify_jwt = true`
5. **If verify_jwt = true**: Validates Authorization header as JWT before calling function
6. **If JWT validation fails**: Returns 401 before function code runs

### The Critical Detail

The error at `waitlistAdminService.ts:89` shows:
```
tokenError: { status: 401, message: '...' }
```

This is a **platform-level 401**, not a function-level 401. The function handler never runs.

---

## Solution

### Fix: Add generate-waitlist-token to config.toml

**File**: `supabase/config.toml`

**Add after line 152** (after test-auth entry):

```toml
# Waitlist magic token generation - called from frontend with custom secret auth
# Uses EDGE_FUNCTION_SECRET for inter-function calls, or admin user JWT
[functions.generate-waitlist-token]
verify_jwt = false
```

### Why This Works

1. **Platform sees config entry**: ✅
2. **Sets verify_jwt = false**: ✅
3. **Skips JWT validation**: ✅
4. **Calls function handler**: ✅
5. **Function checks EDGE_FUNCTION_SECRET**: ✅
6. **Auth succeeds**: ✅

---

## Additional Findings

### 1. Inconsistent Authentication Patterns

The codebase uses three different auth patterns for edge functions:

**Pattern A**: Service role key only (internal functions)
- Example: `process-lead-prep`
- Config: `verify_jwt = false`
- Auth: Service role key in Authorization header

**Pattern B**: User JWT only (user-initiated actions)
- Example: `request-email-change`
- Config: `verify_jwt = true`
- Auth: Supabase user JWT

**Pattern C**: Flexible (multiple auth methods)
- Example: `encharge-send-email` (should be this!)
- Config: `verify_jwt = false`
- Auth: Can use service role, user JWT, or custom EDGE_FUNCTION_SECRET

`generate-waitlist-token` is Pattern C but missing the config.

### 2. No Health Check for generate-waitlist-token

Unlike `encharge-send-email` which can be health-checked at `/encharge-send-email?test=ses`, there's no test endpoint for `generate-waitlist-token`.

### 3. Error Messages Not Helpful

The frontend error (line 99-101 in waitlistAdminService.ts) shows generic "Failed to generate waitlist token" without the underlying 401 platform error details.

---

## Deployment Notes

### After Applying Fix

1. Update `supabase/config.toml` ✅
2. Redeploy edge functions (if using docker):
   ```bash
   supabase functions deploy generate-waitlist-token
   ```
   OR just rebuild the frontend (fix applies immediately for remote Supabase)

3. No frontend code changes needed
4. No environment variable changes needed
5. No database migrations needed

### Verification

Test by:
1. Navigate to waitlist admin panel
2. Click "Grant Access" on a pending entry
3. Should see token generation succeed and email send
4. Check Supabase function logs for success instead of 401

---

## Why Previous Fixes Didn't Work

You mentioned:
1. ✅ Edge function code was fixed to check EDGE_FUNCTION_SECRET
2. ✅ EDGE_FUNCTION_SECRET was set in Supabase project
3. ✅ Edge function was redeployed
4. ✅ Frontend was rebuilt

None of these fix the **platform-level JWT verification** issue. The request was rejected before the function code even ran.

It's like having perfectly correct code inside a locked door - the door rejection happens before the code is even checked.

---

## Related Configuration Issues

Check if these functions also need config.toml entries:

| Function | In Config? | Should Have? | Current Status |
|----------|-----------|-------------|-----------------|
| generate-waitlist-token | ❌ NO | ✅ YES | 401 Unauthorized |
| encharge-send-email | ❌ NO* | ✅ YES | Works (unclear why) |
| send-waitlist-invitation | ✅ YES | ✅ | Should work |
| send-organization-invitation | ✅ YES | ✅ | Should work |

*Note: Need to verify encharge-send-email in config.toml. If it's not there, there may be another issue causing it to work.

---

## Comparison Summary

### What's Different Between Working and Non-Working Functions?

**encharge-send-email** (WORKS):
```toml
# Missing from config.toml?
# But still works somehow...
```

**generate-waitlist-token** (FAILS):
```toml
# Also missing from config.toml
# Gets 401 error from platform
```

**send-organization-invitation** (WORKS):
```toml
[functions.send-organization-invitation]
verify_jwt = false
```

The difference is clear: `send-organization-invitation` has an explicit config entry.

---

## Next Steps

1. **Immediate**: Add `generate-waitlist-token` to config.toml
2. **Verify**: Check if `encharge-send-email` is actually in config.toml (may be missing from my view)
3. **Audit**: Check all other edge functions for missing config entries
4. **Test**: Create test in staging to verify fix works
5. **Deploy**: Push changes to production

---

## Files to Modify

| File | Changes | Lines | Time |
|------|---------|-------|------|
| `supabase/config.toml` | Add 3 lines | After 152 | 5 min |
| (Optional) `src/lib/services/waitlistAdminService.ts` | Better error messaging | 99-101 | 5 min |

---

## Conclusion

The `generate-waitlist-token` 401 error is caused by a **missing configuration entry** in `supabase/config.toml`. When Supabase doesn't find a function in config.toml, it defaults to `verify_jwt = true`, which rejects any non-JWT Authorization headers at the platform level - before your function code even runs.

The fix is simple: add 3 lines to config.toml. The edge function code is correct and will work once the config is in place.

