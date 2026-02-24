# Waitlist Token Generation Bug - Comprehensive Analysis

## Problem Summary

Users are getting **401 Unauthorized** errors when the waitlist admin tries to grant access to waitlist entries. The error occurs when calling the `generate-waitlist-token` edge function from `waitlistAdminService.grantAccess()`.

**Error Stack:**
1. EnhancedWaitlistTable.tsx:725 → onClick calls `releaseUser`
2. useWaitlistAdmin.ts:75 → calls `waitlistAdminService.grantAccess(id, user.id, notes)`
3. waitlistAdminService.ts:89 → calls `supabase.functions.invoke('generate-waitlist-token')`
4. Response: **401 Unauthorized** - "Edge Function returned a non-2xx status code"

---

## Root Cause Analysis

### The Core Issue: Authentication Mismatch

The `generate-waitlist-token` edge function has **incompatible authentication logic** that doesn't match how the client is sending authentication credentials.

#### What the Client Sends (waitlistAdminService.ts:94-96)

```typescript
headers: edgeFunctionSecret
  ? { 'Authorization': `Bearer ${edgeFunctionSecret}` }
  : {},
```

The client sends:
- **Authorization header**: `Bearer <VITE_EDGE_FUNCTION_SECRET>` (64-character hex string from .env)
- No other authentication headers

#### What the Edge Function Expects (generate-waitlist-token/index.ts:47-96)

The edge function checks for authentication in this order:

```typescript
const authHeader = req.headers.get('Authorization');
const apikeyHeader = req.headers.get('apikey');

// Only checks if header value matches SUPABASE_SERVICE_ROLE_KEY (line 52-53)
const isServiceRole = authHeader?.replace(/^Bearer\s+/i, '') === SUPABASE_SERVICE_ROLE_KEY ||
                      apikeyHeader === SUPABASE_SERVICE_ROLE_KEY;

if (!isServiceRole) {
  // If not service role, validate as user JWT and check admin status
  if (!authHeader) {
    return 401 Unauthorized
  }

  // Try to verify the header as a Supabase auth JWT (line 66)
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

  if (authError || !user) {
    return 401 Unauthorized
  }

  // Check if user is admin (line 80-86)
  // ... returns 403 if not admin
}
```

### The Mismatch: Three Problems

**Problem 1: EDGE_FUNCTION_SECRET Not Recognized**
- Client sends: `Bearer <VITE_EDGE_FUNCTION_SECRET>`
- Edge function checks: Does it equal `SUPABASE_SERVICE_ROLE_KEY`?
- Result: No match (these are different values)
- The edge function doesn't have code to validate the `EDGE_FUNCTION_SECRET`!

**Problem 2: Token Treated as JWT**
- Since the EDGE_FUNCTION_SECRET doesn't match SUPABASE_SERVICE_ROLE_KEY, the edge function falls through to the JWT validation path
- It tries to validate the 64-character hex string as a Supabase JWT
- A JWT has a specific format: `header.payload.signature` (3 dot-separated parts)
- A hex string (64 chars, no dots) is definitely NOT a valid JWT
- Result: `auth.getUser(token)` returns an error → **401 Unauthorized**

**Problem 3: Different Pattern Than Other Edge Functions**
- The `encharge-send-email` edge function (which works correctly) uses the proper pattern:
  ```typescript
  const EDGE_FUNCTION_SECRET = Deno.env.get('EDGE_FUNCTION_SECRET');

  const isEdgeFunctionAuth = (() => {
    if (!authHeader || !EDGE_FUNCTION_SECRET) return false;
    const token = authHeader.replace(/^Bearer\s+/i, '');
    return token === EDGE_FUNCTION_SECRET;  // Compares against env variable!
  })();

  if (isEdgeFunctionAuth) {
    // Authenticated via EDGE_FUNCTION_SECRET - proceed
  } else if (authHeader) {
    // Try JWT validation...
  }
  ```

---

## Why Other Edge Functions Work

The `encharge-send-email` edge function (called from the same `grantAccess` method, line 126) works because:

1. It reads `EDGE_FUNCTION_SECRET` from `Deno.env.get()` (server-side environment)
2. It compares the Bearer token against this environment variable
3. If it matches, it bypasses JWT validation and proceeds
4. If it doesn't match, it falls back to JWT validation for user authentication

The `generate-waitlist-token` function doesn't have this pattern implemented.

---

## Detailed Code Comparison

### Working Pattern (encharge-send-email/index.ts:407-443)

```typescript
const authHeader = req.headers.get('Authorization');
const EDGE_FUNCTION_SECRET = Deno.env.get('EDGE_FUNCTION_SECRET');  // ← Reads from env!

// Check for EDGE_FUNCTION_SECRET (inter-function calls from other edge functions)
const isEdgeFunctionAuth = (() => {
  if (!authHeader || !EDGE_FUNCTION_SECRET) return false;
  const token = authHeader.replace(/^Bearer\s+/i, '');
  return token === EDGE_FUNCTION_SECRET;  // ← Direct comparison to env variable
})();

if (isEdgeFunctionAuth) {
  // Authenticated via EDGE_FUNCTION_SECRET - proceed
} else if (authHeader) {
  // Try to validate as user JWT
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
  if (error || !user) {
    return 401 Unauthorized
  }
} else {
  return 401 Unauthorized
}
```

### Broken Pattern (generate-waitlist-token/index.ts:47-96)

```typescript
const authHeader = req.headers.get('Authorization');
const apikeyHeader = req.headers.get('apikey');

// PROBLEM: Only checks if header equals SUPABASE_SERVICE_ROLE_KEY
// Does NOT check against EDGE_FUNCTION_SECRET
const isServiceRole = authHeader?.replace(/^Bearer\s+/i, '') === SUPABASE_SERVICE_ROLE_KEY ||
                      apikeyHeader === SUPABASE_SERVICE_ROLE_KEY;

if (!isServiceRole) {
  // Falls through here when EDGE_FUNCTION_SECRET is sent

  if (!authHeader) {
    return 401 Unauthorized
  }

  // PROBLEM: Tries to validate EDGE_FUNCTION_SECRET as JWT
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
  // This fails because EDGE_FUNCTION_SECRET is not a valid JWT

  if (authError || !user) {
    return 401 Unauthorized  // ← This is what the user sees
  }
}
```

---

## Why This Bug Exists

1. **Inconsistent Authentication Pattern**: The `generate-waitlist-token` function was implemented without following the established pattern used in other edge functions
2. **No EDGE_FUNCTION_SECRET Support**: The function never reads or checks the `EDGE_FUNCTION_SECRET` environment variable
3. **Relies Only on Service Role Key**: It only accepts the SUPABASE_SERVICE_ROLE_KEY or valid JWTs, not the inter-service communication secret
4. **Different from encharge-send-email**: The encharge function implements the correct pattern, but generate-waitlist-token doesn't

---

## Environmental Context

From `.env`:
```
VITE_EDGE_FUNCTION_SECRET=08b7f4cb0fbe428ca9084ba61cb3c2f53c22c4a1e80c22918647055b0495cbc3
EDGE_FUNCTION_SECRET=08b7f4cb0fbe428ca9084ba61cb3c2f53c22c4a1e80c22918647055b0495cbc3
SUPABASE_SERVICE_ROLE_KEY=YOUR_STAGING_SERVICE_ROLE_KEY_HERE  ← This is NOT set!
```

The SUPABASE_SERVICE_ROLE_KEY is not set in the .env file, so:
1. Client sends: `Bearer <VITE_EDGE_FUNCTION_SECRET>`
2. Edge function checks if token === SUPABASE_SERVICE_ROLE_KEY (which is undefined/placeholder)
3. No match
4. Edge function tries to validate as JWT
5. JWT validation fails
6. Returns 401

---

## Fix Plan

### Option 1: Update generate-waitlist-token to Support EDGE_FUNCTION_SECRET (Recommended)

Update the edge function to follow the working pattern used in `encharge-send-email`:

**Changes to generate-waitlist-token/index.ts:**

1. **Add EDGE_FUNCTION_SECRET reading** (after line 19):
   ```typescript
   const EDGE_FUNCTION_SECRET = Deno.env.get('EDGE_FUNCTION_SECRET');
   ```

2. **Update authentication logic** (replace lines 46-96):
   ```typescript
   try {
     const authHeader = req.headers.get('Authorization');
     const apikeyHeader = req.headers.get('apikey');

     // Check for EDGE_FUNCTION_SECRET (inter-function calls)
     const isEdgeFunctionAuth = (() => {
       if (!authHeader || !EDGE_FUNCTION_SECRET) return false;
       const token = authHeader.replace(/^Bearer\s+/i, '');
       return token === EDGE_FUNCTION_SECRET;
     })();

     if (isEdgeFunctionAuth) {
       // Authenticated via EDGE_FUNCTION_SECRET - proceed
     } else if (authHeader?.startsWith('Bearer ')) {
       // Try to validate as user JWT and check admin status
       const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
       const token = authHeader.replace(/^Bearer\s+/i, '');
       const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

       if (authError || !user) {
         return new Response(
           JSON.stringify({
             success: false,
             error: 'Unauthorized: invalid authentication',
             details: { message: authError?.message || 'User not found' }
           }),
           { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
         );
       }

       // Check if user is an admin
       const { data: profile, error: profileError } = await supabaseClient
         .from('profiles')
         .select('is_admin')
         .eq('id', user.id)
         .single();

       if (profileError || !profile?.is_admin) {
         return new Response(
           JSON.stringify({
             success: false,
             error: 'Unauthorized: admin access required',
             details: { message: 'Only administrators can generate waitlist tokens' }
           }),
           { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
         );
       }
     } else if (apikeyHeader === SUPABASE_SERVICE_ROLE_KEY) {
       // Legacy support for service role key in apikey header
     } else {
       return new Response(
         JSON.stringify({ success: false, error: 'Unauthorized: authentication required' }),
         { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }

     const request: GenerateTokenRequest = await req.json();
     // ... rest of function
   ```

### Option 2: Update Client to Send Service Role Key

Alternatively, update `waitlistAdminService.ts` to send the service role key instead. **This is NOT recommended** because:
- Exposes server secret to frontend code
- Violates security best practices
- The current client code is correct

### Option 3: Update Client to Use User JWT

Make the function require valid user JWT instead of service secret. **This is less ideal** because:
- The client-side implementation is already correct
- Inter-service communication should use secrets, not user tokens

---

## Testing Strategy

After implementing the fix:

1. **Manual Test - Admin User**:
   - Log in as an admin user
   - Grant access to a pending waitlist entry
   - Verify success (no 401 error)
   - Verify email is sent

2. **Manual Test - Non-Admin User** (if applicable):
   - Try to grant access as non-admin
   - Should get 403 Forbidden (not 401)

3. **Unit Test - Authentication Paths**:
   ```typescript
   // Test with valid EDGE_FUNCTION_SECRET
   // Test with invalid token
   // Test with user JWT (admin)
   // Test with user JWT (non-admin)
   // Test with no auth header
   ```

4. **Integration Test - Full Flow**:
   - Verify waitlist entry creation
   - Grant access (should create token and send email)
   - Verify token is created in waitlist_magic_tokens table
   - Verify email trigger fires

---

## Related Files

- **Edge Function**: `/supabase/functions/generate-waitlist-token/index.ts`
- **Service Layer**: `/src/lib/services/waitlistAdminService.ts`
- **Hook**: `/src/lib/hooks/useWaitlistAdmin.ts`
- **Component**: `/src/components/platform/waitlist/EnhancedWaitlistTable.tsx`
- **Working Pattern Reference**: `/supabase/functions/encharge-send-email/index.ts` (lines 407-443)
- **Configuration**: `/.env` (contains EDGE_FUNCTION_SECRET)

---

## Summary

| Aspect | Details |
|--------|---------|
| **Root Cause** | `generate-waitlist-token` doesn't recognize `EDGE_FUNCTION_SECRET`, tries to validate it as JWT |
| **Error Code** | 401 Unauthorized |
| **Affected Function** | `waitlistAdminService.grantAccess()` |
| **Why It Happens** | Edge function missing the EDGE_FUNCTION_SECRET validation logic |
| **Working Equivalent** | `encharge-send-email` implements the correct pattern |
| **Fix Priority** | High - Blocks waitlist admin features |
| **Fix Complexity** | Low - Simple pattern change (20-30 lines) |
| **Breaking Changes** | None - Maintains backward compatibility with JWT auth |
| **Deployment Risk** | Low - Isolated to one edge function |

