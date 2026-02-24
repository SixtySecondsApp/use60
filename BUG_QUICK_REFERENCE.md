# Waitlist Token Bug - Quick Reference Guide

## TL;DR

**Problem**: Waitlist admin gets 401 error when granting access to users
**Cause**: Edge function doesn't validate `EDGE_FUNCTION_SECRET` token
**Fix**: Add 2 lines to edge function to read and check `EDGE_FUNCTION_SECRET`
**Time to Fix**: <5 minutes (one file, ~15 lines changed)

---

## The Bug in 30 Seconds

1. Client sends: `Authorization: Bearer <VITE_EDGE_FUNCTION_SECRET>`
2. Edge function receives it but doesn't know to check `EDGE_FUNCTION_SECRET`
3. Edge function tries to validate it as JWT (it's not)
4. JWT validation fails → **401 Unauthorized**

---

## Files Involved

```
WORKING CORRECTLY:
  ✅ /src/lib/services/waitlistAdminService.ts (line 94-96)
  ✅ /.env (has EDGE_FUNCTION_SECRET defined)

BROKEN:
  ❌ /supabase/functions/generate-waitlist-token/index.ts (missing EDGE_FUNCTION_SECRET check)

REFERENCE PATTERN:
  📚 /supabase/functions/encharge-send-email/index.ts (lines 407-443) - CORRECT PATTERN
```

---

## Error Stack Trace

```
EnhancedWaitlistTable.tsx:725
  onClick → releaseUser()
    |
    v
useWaitlistAdmin.ts:75
  releaseUser() → grantAccess(id, user.id)
    |
    v
waitlistAdminService.ts:89
  grantAccess() → supabase.functions.invoke('generate-waitlist-token', {
    headers: { 'Authorization': `Bearer <EDGE_FUNCTION_SECRET>` }
  })
    |
    v
supabase/functions/generate-waitlist-token/index.ts:66
  Receives Authorization header
  Tries to validate as JWT
  JWT validation fails
  Returns: { status: 401, error: 'Unauthorized' }
    |
    v
TOAST ERROR: "Failed to generate invitation token"
```

---

## Visual Comparison

### Current (Broken) Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Client sends: Bearer <64-char-hex-EDGE_FUNCTION_SECRET>        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         v
┌─────────────────────────────────────────────────────────────────┐
│ Edge Function receive                                           │
│ Checks: token === SUPABASE_SERVICE_ROLE_KEY?                 │
│ NO MATCH (different values)                                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         v
┌─────────────────────────────────────────────────────────────────┐
│ Falls through to JWT validation                                │
│ Tries: auth.getUser(<64-char-hex-string>)                     │
│ JWT format: header.payload.signature (has dots)               │
│ Hex string: 64 hex chars (NO dots)                            │
│ Result: JWT validation FAILS                                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         v
                    ❌ 401 UNAUTHORIZED
```

### Fixed Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Client sends: Bearer <64-char-hex-EDGE_FUNCTION_SECRET>        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         v
┌─────────────────────────────────────────────────────────────────┐
│ Edge Function receives                                          │
│ Reads EDGE_FUNCTION_SECRET from Deno.env                      │
│ Checks: token === EDGE_FUNCTION_SECRET?                       │
│ YES MATCH!                                                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         v
┌─────────────────────────────────────────────────────────────────┐
│ Authentication succeeds                                        │
│ Proceed with token generation                                 │
│ - Verify waitlist entry exists                                │
│ - Create magic token                                          │
│ - Return token to client                                      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         v
                    ✅ 200 OK + TOKEN
```

---

## The Missing Code

### What's Missing (Line 19)

```typescript
// MISSING IN generate-waitlist-token/index.ts
const EDGE_FUNCTION_SECRET = Deno.env.get('EDGE_FUNCTION_SECRET');
```

### What's Missing (Lines 47-65)

```typescript
// MISSING IN generate-waitlist-token/index.ts
const isEdgeFunctionAuth = (() => {
  if (!authHeader || !EDGE_FUNCTION_SECRET) return false;
  const token = authHeader.replace(/^Bearer\s+/i, '');
  return token === EDGE_FUNCTION_SECRET;
})();

if (isEdgeFunctionAuth) {
  // Proceed - inter-function call is authenticated
} else if (authHeader?.startsWith('Bearer ')) {
  // Continue with JWT validation...
}
```

---

## Environment Variables

### What's Set (in .env)

```
VITE_EDGE_FUNCTION_SECRET=08b7f4cb0fbe428ca9084ba61cb3c2f53c22c4a1e80c22918647055b0495cbc3
EDGE_FUNCTION_SECRET=08b7f4cb0fbe428ca9084ba61cb3c2f53c22c4a1e80c22918647055b0495cbc3
SUPABASE_SERVICE_ROLE_KEY=YOUR_STAGING_SERVICE_ROLE_KEY_HERE  ← NOT SET!
```

### Why It Matters

- **VITE_EDGE_FUNCTION_SECRET**: Available on client, sent in Authorization header
- **EDGE_FUNCTION_SECRET**: Server-side, in edge function environment
- **SUPABASE_SERVICE_ROLE_KEY**: Server-side, should be checked but currently isn't (placeholder)

---

## Test Cases

### Test 1: EDGE_FUNCTION_SECRET Path (Should Pass)
```typescript
// Request from waitlistAdminService.ts
const response = await supabase.functions.invoke('generate-waitlist-token', {
  headers: {
    'Authorization': 'Bearer 08b7f4cb0fbe428ca9084ba61cb3c2f53c22c4a1e80c22918647055b0495cbc3'
  },
  body: { ... }
});

// Expected: 200 OK with token data
// Currently: 401 Unauthorized ❌
// After fix: 200 OK ✅
```

### Test 2: User JWT Path (Should Pass for Admin)
```typescript
// Request from user JWT in Authorization header
const response = await supabase.functions.invoke('generate-waitlist-token', {
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  },
  body: { ... }
});

// Expected: 200 OK (if admin) or 403 Forbidden (if not admin)
// Currently: Could work IF SUPABASE_SERVICE_ROLE_KEY was set properly
// After fix: Works correctly with proper error messages
```

### Test 3: No Auth (Should Fail)
```typescript
// Request with no Authorization header
const response = await supabase.functions.invoke('generate-waitlist-token', {
  body: { ... }
});

// Expected: 401 Unauthorized
// Currently: 401 Unauthorized ✅
// After fix: 401 Unauthorized ✅
```

---

## Code Changes Checklist

- [ ] Read `/supabase/functions/generate-waitlist-token/index.ts`
- [ ] Add line 19: `const EDGE_FUNCTION_SECRET = Deno.env.get('EDGE_FUNCTION_SECRET');`
- [ ] Add lines 47-63: isEdgeFunctionAuth check block
- [ ] Update line 65: Change `if (!isServiceRole) {` to `if (isEdgeFunctionAuth) { // proceed`
- [ ] Add else-if block for JWT validation
- [ ] Test locally or on staging
- [ ] Deploy: `supabase functions deploy generate-waitlist-token`
- [ ] Verify: Try granting access to waitlist user

---

## Before & After Comparison

| Aspect | Before (Broken) | After (Fixed) |
|--------|-----------------|---------------|
| **Accepts EDGE_FUNCTION_SECRET** | ❌ No | ✅ Yes |
| **Accepts User JWT (admin)** | ⚠️ Broken | ✅ Works |
| **Accepts Service Role Key** | ⚠️ Broken | ✅ Works |
| **Returns 401 for invalid** | ✅ Yes | ✅ Yes |
| **Returns 403 for non-admin** | ✅ Yes | ✅ Yes |
| **Matches encharge-send-email pattern** | ❌ No | ✅ Yes |
| **Used by waitlistAdminService** | ❌ Fails | ✅ Works |

---

## Why This Happened

The `generate-waitlist-token` function was likely created before the `EDGE_FUNCTION_SECRET` pattern was established. The newer `encharge-send-email` function implements the correct pattern but this one was never updated.

---

## Related Working Pattern

The same client code works with `encharge-send-email` because that function properly implements:

```typescript
const EDGE_FUNCTION_SECRET = Deno.env.get('EDGE_FUNCTION_SECRET');

const isEdgeFunctionAuth = (() => {
  if (!authHeader || !EDGE_FUNCTION_SECRET) return false;
  const token = authHeader.replace(/^Bearer\s+/i, '');
  return token === EDGE_FUNCTION_SECRET;
})();

if (isEdgeFunctionAuth) {
  // Proceed
} else if (authHeader) {
  // Try JWT validation
}
```

This exact pattern needs to be applied to `generate-waitlist-token`.

---

## Common Mistakes When Fixing

❌ **Don't do this:**
```typescript
// Wrong: comparing to wrong variable
const isServiceRole = token === EDGE_FUNCTION_SECRET;
if (isServiceRole) { /* ... */ }
// ^ This checks against undefined in the broken code
```

❌ **Don't do this:**
```typescript
// Wrong: not reading from Deno.env
if (EDGE_FUNCTION_SECRET === undefined) return 401;
// ^ Need to read it first!
```

✅ **Do this:**
```typescript
// Correct: read from env, then compare
const EDGE_FUNCTION_SECRET = Deno.env.get('EDGE_FUNCTION_SECRET');

const isEdgeFunctionAuth = (() => {
  if (!authHeader || !EDGE_FUNCTION_SECRET) return false;
  const token = authHeader.replace(/^Bearer\s+/i, '');
  return token === EDGE_FUNCTION_SECRET;
})();
```

---

## Verification Steps

After deploying the fix:

1. **Check deployment succeeded**
   - Go to Supabase Dashboard
   - Functions > generate-waitlist-token
   - Should show "Deployed" status

2. **Test the functionality**
   - Login as admin user
   - Go to waitlist management
   - Click "Grant Access" on a pending entry
   - Should see success toast (not error)

3. **Check logs** (Supabase Dashboard)
   - Functions > generate-waitlist-token
   - Logs should show "Token generated successfully"
   - Should NOT see auth errors

4. **Verify email sent**
   - Check user's email inbox
   - Should receive waitlist invitation email

5. **Test non-admin** (optional)
   - Try as non-admin user
   - Should get 403 Forbidden (not 401)

---

## Quick Links

- **Bug Analysis**: See `WAITLIST_TOKEN_BUG_ANALYSIS.md`
- **Implementation**: See `WAITLIST_TOKEN_FIX_IMPLEMENTATION.md`
- **Related Files**:
  - Edge Function: `/supabase/functions/generate-waitlist-token/index.ts`
  - Client Service: `/src/lib/services/waitlistAdminService.ts` (lines 88-96)
  - Reference Pattern: `/supabase/functions/encharge-send-email/index.ts` (lines 407-443)

