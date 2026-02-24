# Code Comparison Reference - Working vs Broken Authentication Patterns

## Executive Summary

The `generate-waitlist-token` edge function has an **incomplete authentication implementation**. It's missing the `EDGE_FUNCTION_SECRET` validation that the client is sending.

The working pattern exists in `encharge-send-email`. This document shows the exact differences.

---

## Side-by-Side Comparison

### How the Client Sends Auth (waitlistAdminService.ts:88-96)

Both functions receive the SAME auth header from the client:

```typescript
// BOTH functions called with identical authentication
const edgeFunctionSecret = import.meta.env.VITE_EDGE_FUNCTION_SECRET || '';
const { data: tokenData, error: tokenError } = await supabase.functions.invoke(
  'generate-waitlist-token',  // ← Broken
  {
    body: { email: entry.email, waitlist_entry_id: entryId },
    headers: edgeFunctionSecret
      ? { 'Authorization': `Bearer ${edgeFunctionSecret}` }
      : {},
  }
);

const { data, error } = await supabase.functions.invoke(
  'encharge-send-email',  // ← Works
  {
    body: { /* ... */ },
    headers: edgeFunctionSecret
      ? { 'Authorization': `Bearer ${edgeFunctionSecret}` }
      : {},
  }
);
```

**What's sent:**
- Header: `Authorization: Bearer 08b7f4cb0fbe428ca9084ba61cb3c2f53c22c4a1e80c22918647055b0495cbc3`

---

## Edge Function Comparison

### BROKEN: generate-waitlist-token/index.ts (Lines 19, 47-96)

```typescript
// ❌ PROBLEM 1: EDGE_FUNCTION_SECRET is never read from environment
// Missing: const EDGE_FUNCTION_SECRET = Deno.env.get('EDGE_FUNCTION_SECRET');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// ^ Only reads these two variables

const corsHeaders = { /* ... */ };

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ❌ PROBLEM 2: Authentication logic doesn't handle EDGE_FUNCTION_SECRET
    const authHeader = req.headers.get('Authorization');
    const apikeyHeader = req.headers.get('apikey');

    // ❌ Only checks against SUPABASE_SERVICE_ROLE_KEY
    // Does NOT check against EDGE_FUNCTION_SECRET
    const isServiceRole = authHeader?.replace(/^Bearer\s+/i, '') === SUPABASE_SERVICE_ROLE_KEY ||
                          apikeyHeader === SUPABASE_SERVICE_ROLE_KEY;

    if (!isServiceRole) {
      // ❌ PROBLEM 3: Falls through here when EDGE_FUNCTION_SECRET is sent
      if (!authHeader) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized: authentication required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ❌ PROBLEM 4: Tries to validate EDGE_FUNCTION_SECRET as a JWT
      // EDGE_FUNCTION_SECRET is a 64-char hex string
      // JWTs have format: xxxxx.yyyyy.zzzzz (three dot-separated parts)
      // This will ALWAYS fail
      const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
      //                                                                        ↑
      //                                     Trying to validate "08b7f4cb0fbe..." as JWT
      //                                     This is NOT a JWT - it's a hex string!

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

      // This code is never reached when EDGE_FUNCTION_SECRET is sent
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
    }

    // Rest of function never reached due to auth failure
    const request: GenerateTokenRequest = await req.json();
    // ... [rest of implementation]
  } catch (error: any) {
    // ...
  }
});
```

**Issues:**
1. Line 19: Missing `const EDGE_FUNCTION_SECRET = Deno.env.get('EDGE_FUNCTION_SECRET');`
2. Line 52: Only checks against `SUPABASE_SERVICE_ROLE_KEY`, not `EDGE_FUNCTION_SECRET`
3. Line 64: Tries to validate hex string as JWT → Always fails
4. Result: Always returns 401

---

### WORKING: encharge-send-email/index.ts (Lines 407-443)

```typescript
// ✅ CORRECT 1: Reads EDGE_FUNCTION_SECRET from environment
const EDGE_FUNCTION_SECRET = Deno.env.get('EDGE_FUNCTION_SECRET');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ✅ CORRECT 2: Check authentication - EDGE_FUNCTION_SECRET for inter-function calls, or user JWT
  const authHeader = req.headers.get('Authorization');
  // const EDGE_FUNCTION_SECRET = Deno.env.get('EDGE_FUNCTION_SECRET');  // Already read at top

  // ✅ CORRECT 3: Check for EDGE_FUNCTION_SECRET FIRST
  const isEdgeFunctionAuth = (() => {
    if (!authHeader || !EDGE_FUNCTION_SECRET) return false;
    const token = authHeader.replace(/^Bearer\s+/i, '');
    return token === EDGE_FUNCTION_SECRET;  // ✅ Compares against env variable
  })();

  if (isEdgeFunctionAuth) {
    // ✅ Authenticated via EDGE_FUNCTION_SECRET - proceed without JWT validation
    // This is where waitlistAdminService calls end up - SUCCESS!
  } else if (authHeader) {
    // ✅ Try to validate as user JWT (for client-side calls via supabase.functions.invoke)
    try {
      const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
      if (error || !user) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized: invalid authentication' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (authError) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: authentication failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } else {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized: no authentication provided' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // ✅ Authentication passed - proceed with function logic
  try {
    const request: SendEmailRequest = await req.json();
    // ... [rest of implementation]
  } catch (error: any) {
    // ...
  }
});
```

**Correct aspects:**
1. Line 409: ✅ Reads `EDGE_FUNCTION_SECRET` from environment
2. Lines 412-416: ✅ Checks if token matches `EDGE_FUNCTION_SECRET` FIRST
3. Line 418: ✅ If EDGE_FUNCTION_SECRET matches, proceed directly
4. Lines 420-437: ✅ Only try JWT validation if EDGE_FUNCTION_SECRET didn't match
5. Result: Returns 200 when called from `waitlistAdminService`

---

## Line-by-Line Comparison

### Environment Variable Reading

| File | Line | Code | Status |
|------|------|------|--------|
| generate-waitlist-token | 18-19 | `const SUPABASE_URL = ...` | ✅ |
| generate-waitlist-token | 19 | `const EDGE_FUNCTION_SECRET = ...` | ❌ MISSING |
| encharge-send-email | 15 | `const ENCHARGE_WRITE_KEY = ...` | ✅ |
| encharge-send-email | 15-20 | `const ... = Deno.env.get(...)` (5 lines) | ✅ |
| encharge-send-email | 409 | `const EDGE_FUNCTION_SECRET = Deno.env.get(...)` | ✅ PRESENT |

---

### Authentication Check Logic

| File | Lines | Code Pattern | Status |
|------|-------|------|--------|
| generate-waitlist-token | 48-53 | Check against `SUPABASE_SERVICE_ROLE_KEY` | ❌ Incomplete |
| generate-waitlist-token | 55-96 | Falls back to JWT only | ❌ Wrong order |
| encharge-send-email | 412-416 | Check against `EDGE_FUNCTION_SECRET` first | ✅ Correct |
| encharge-send-email | 420-437 | Falls back to JWT if no EDGE_FUNCTION_SECRET | ✅ Correct |

---

## Token Validation Comparison

### What Gets Validated

**When client sends:** `Authorization: Bearer 08b7f4cb0fbe428ca9084ba61cb3c2f53c22c4a1e80c22918647055b0495cbc3`

#### generate-waitlist-token (Broken)

```
Step 1: Extract token
  Input: "Bearer 08b7f4cb0fbe428ca9084ba61cb3c2f53c22c4a1e80c22918647055b0495cbc3"
  Extract: "08b7f4cb0fbe428ca9084ba61cb3c2f53c22c4a1e80c22918647055b0495cbc3"

Step 2: Check if == SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_SERVICE_ROLE_KEY = undefined (not set in .env)
  08b7f4cb... == undefined? NO
  Result: ❌ NOT EQUAL

Step 3: Fall through to JWT validation
  Input: "08b7f4cb0fbe428ca9084ba61cb3c2f53c22c4a1e80c22918647055b0495cbc3"
  Expected JWT format: "xxxxx.yyyyy.zzzzz"
  Actual token: "08b7f4cb0fbe428ca9084ba61cb3c2f53c22c4a1e80c22918647055b0495cbc3"
  Has 2 dots? NO (64 char hex string has NO dots)
  Result: ❌ NOT A VALID JWT

Step 4: Return 401 Unauthorized
  Error: "invalid authentication"
  Details: "User not found"
```

#### encharge-send-email (Working)

```
Step 1: Extract token
  Input: "Bearer 08b7f4cb0fbe428ca9084ba61cb3c2f53c22c4a1e80c22918647055b0495cbc3"
  Extract: "08b7f4cb0fbe428ca9084ba61cb3c2f53c22c4a1e80c22918647055b0495cbc3"

Step 2: Check if == EDGE_FUNCTION_SECRET
  EDGE_FUNCTION_SECRET = "08b7f4cb0fbe428ca9084ba61cb3c2f53c22c4a1e80c22918647055b0495cbc3"
  08b7f4cb... == 08b7f4cb...? YES
  Result: ✅ EQUAL

Step 3: Authentication passes!
  Proceed with token generation
  Return 200 OK with token data
```

---

## Control Flow Diagrams

### Current (Broken) Flow

```
generate-waitlist-token receives request
         |
         v
   Is authHeader present?
         |
         +---> NO: return 401 ❌
         |
         +---> YES: extract token
                    |
                    v
                Is token === SUPABASE_SERVICE_ROLE_KEY?
                    |
                    +---> YES: proceed ✅ (but token isn't service role key)
                    |
                    +---> NO: try JWT validation ❌ (THIS IS THE PATH!)
                           |
                           v
                       Is token a valid JWT?
                           |
                           +---> YES: check admin status ✅ (but token isn't JWT)
                           |
                           +---> NO: return 401 ❌ (WE END UP HERE!)
```

### Fixed Flow

```
encharge-send-email receives request (same pattern needed for generate-waitlist-token)
         |
         v
   Is authHeader present AND EDGE_FUNCTION_SECRET set?
         |
         +---> YES: Does token === EDGE_FUNCTION_SECRET?
         |              |
         |              +---> YES: return 200 ✅ (THIS IS WHERE WE NEED TO GO!)
         |              |
         |              +---> NO: try JWT validation
         |
         +---> NO: Is authHeader at least present?
                    |
                    +---> YES: try JWT validation
                    |
                    +---> NO: return 401 ❌
```

---

## Environment Variable Values

From `/. env`:

```ini
# Frontend (exposed to browser)
VITE_EDGE_FUNCTION_SECRET=08b7f4cb0fbe428ca9084ba61cb3c2f53c22c4a1e80c22918647055b0495cbc3

# Server-side (edge functions)
EDGE_FUNCTION_SECRET=08b7f4cb0fbe428ca9084ba61cb3c2f53c22c4a1e80c22918647055b0495cbc3
SUPABASE_SERVICE_ROLE_KEY=YOUR_STAGING_SERVICE_ROLE_KEY_HERE

# What this means:
# ✅ VITE_EDGE_FUNCTION_SECRET is sent by client in Authorization header
# ✅ EDGE_FUNCTION_SECRET is available on server (in Deno.env)
# ❌ SUPABASE_SERVICE_ROLE_KEY is not properly set (placeholder value)
```

---

## The Fix in Context

### What Changes

```diff
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
+ const EDGE_FUNCTION_SECRET = Deno.env.get('EDGE_FUNCTION_SECRET');

  serve(async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    try {
      const authHeader = req.headers.get('Authorization');
-     const apikeyHeader = req.headers.get('apikey');
-
-     const isServiceRole = authHeader?.replace(/^Bearer\s+/i, '') === SUPABASE_SERVICE_ROLE_KEY ||
-                           apikeyHeader === SUPABASE_SERVICE_ROLE_KEY;
-
-     if (!isServiceRole) {
+     // Check for EDGE_FUNCTION_SECRET (inter-function calls from other edge functions)
+     const isEdgeFunctionAuth = (() => {
+       if (!authHeader || !EDGE_FUNCTION_SECRET) return false;
+       const token = authHeader.replace(/^Bearer\s+/i, '');
+       return token === EDGE_FUNCTION_SECRET;
+     })();
+
+     if (isEdgeFunctionAuth) {
+       // Authenticated via EDGE_FUNCTION_SECRET - proceed
+     } else if (authHeader?.startsWith('Bearer ')) {
        // If not service role, validate as user JWT and check admin status
        if (!authHeader) {
          return new Response(
            JSON.stringify({ success: false, error: 'Unauthorized: authentication required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

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
+     } else {
+       return new Response(
+         JSON.stringify({ success: false, error: 'Unauthorized: authentication required' }),
+         { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
+       );
      }
```

---

## Testing the Fix

### Before Fix

```bash
$ curl -X POST https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/generate-waitlist-token \
  -H "Authorization: Bearer 08b7f4cb0fbe428ca9084ba61cb3c2f53c22c4a1e80c22918647055b0495cbc3" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","waitlist_entry_id":"123"}'

# Response:
# {
#   "success": false,
#   "error": "Unauthorized: invalid authentication",
#   "details": {
#     "message": "User not found"
#   }
# }
# Status: 401 ❌
```

### After Fix

```bash
$ curl -X POST https://caerqjzvuerejfrdtygb.supabase.co/functions/v1/generate-waitlist-token \
  -H "Authorization: Bearer 08b7f4cb0fbe428ca9084ba61cb3c2f53c22c4a1e80c22918647055b0495cbc3" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","waitlist_entry_id":"123"}'

# Response:
# {
#   "success": true,
#   "token": "a1b2c3d4e5f6...",
#   "expiresAt": "2024-01-10T12:30:45.123Z"
# }
# Status: 200 ✅
```

