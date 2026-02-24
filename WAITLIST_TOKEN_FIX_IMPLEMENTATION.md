# Waitlist Token Generation - Fix Implementation Guide

## The Fix

Update `/supabase/functions/generate-waitlist-token/index.ts` to properly handle the `EDGE_FUNCTION_SECRET` authentication pattern used by the client.

---

## Current Broken Code (Lines 1-96)

```typescript
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface GenerateTokenRequest {
  waitlist_entry_id: string;
  email: string;
}

// Generate a secure random token (64-character hex string)
function generateSecureToken(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ❌ PROBLEM: This authentication logic is broken
    // Authenticate the request - require service role OR valid user JWT with admin access
    const authHeader = req.headers.get('Authorization');
    const apikeyHeader = req.headers.get('apikey');

    // ❌ PROBLEM: Only checks against SUPABASE_SERVICE_ROLE_KEY
    // Does NOT check against EDGE_FUNCTION_SECRET
    // Allow service role (for backend calls)
    const isServiceRole = authHeader?.replace(/^Bearer\s+/i, '') === SUPABASE_SERVICE_ROLE_KEY ||
                          apikeyHeader === SUPABASE_SERVICE_ROLE_KEY;

    if (!isServiceRole) {
      // ❌ PROBLEM: Falls through here when EDGE_FUNCTION_SECRET is sent
      // If not service role, validate as user JWT and check admin status
      if (!authHeader) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized: authentication required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ❌ PROBLEM: Tries to validate EDGE_FUNCTION_SECRET as a JWT
      // This fails because it's a 64-char hex string, not a JWT with 3 dot-separated parts
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
    }

    // ... rest of function
  }
});
```

---

## Fixed Code

### Step 1: Add EDGE_FUNCTION_SECRET Variable (After Line 12)

```typescript
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EDGE_FUNCTION_SECRET = Deno.env.get('EDGE_FUNCTION_SECRET');  // ← ADD THIS LINE

const corsHeaders = {
```

### Step 2: Replace Authentication Logic (Lines 46-96)

Replace the entire try block's authentication section with:

```typescript
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authenticate the request
    // Supports: EDGE_FUNCTION_SECRET (for inter-function calls), or user JWT with admin status
    const authHeader = req.headers.get('Authorization');
    const apikeyHeader = req.headers.get('apikey');

    // Check for EDGE_FUNCTION_SECRET (inter-function calls from other edge functions)
    const isEdgeFunctionAuth = (() => {
      if (!authHeader || !EDGE_FUNCTION_SECRET) return false;
      const token = authHeader.replace(/^Bearer\s+/i, '');
      return token === EDGE_FUNCTION_SECRET;
    })();

    if (isEdgeFunctionAuth) {
      // ✅ Authenticated via EDGE_FUNCTION_SECRET - proceed
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
    } else if (apikeyHeader === SUPABASE_SERVICE_ROLE_KEY && SUPABASE_SERVICE_ROLE_KEY) {
      // Legacy support for service role key in apikey header
    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Continue with the rest of the function...
    const request: GenerateTokenRequest = await req.json();
    // ... [rest of implementation unchanged]
  } catch (error: any) {
    // ... [error handling unchanged]
  }
});
```

---

## Complete Fixed File

Here's the complete corrected function:

```typescript
/**
 * Generate Waitlist Token Edge Function
 *
 * Generates a custom magic token for waitlist invitations
 * Tokens expire after 24 hours and can only be used once
 * This allows full control over the signup flow without Supabase auto-creating users
 */

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EDGE_FUNCTION_SECRET = Deno.env.get('EDGE_FUNCTION_SECRET');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface GenerateTokenRequest {
  waitlist_entry_id: string;
  email: string;
}

// Generate a secure random token (64-character hex string)
function generateSecureToken(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authenticate the request
    // Supports: EDGE_FUNCTION_SECRET (for inter-function calls), or user JWT with admin status
    const authHeader = req.headers.get('Authorization');
    const apikeyHeader = req.headers.get('apikey');

    // Check for EDGE_FUNCTION_SECRET (inter-function calls from other edge functions)
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
    } else if (apikeyHeader === SUPABASE_SERVICE_ROLE_KEY && SUPABASE_SERVICE_ROLE_KEY) {
      // Legacy support for service role key in apikey header
    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const request: GenerateTokenRequest = await req.json();

    if (!request.waitlist_entry_id || !request.email) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing waitlist_entry_id or email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(request.email)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client with explicit service role configuration
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      db: {
        schema: 'public',
      },
    });

    // Generate token
    const token = generateSecureToken();

    // Calculate expiry (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // First verify the waitlist entry exists before inserting token
    const { data: entryExists, error: entryCheckError } = await supabaseAdmin
      .from('meetings_waitlist')
      .select('id')
      .eq('id', request.waitlist_entry_id)
      .maybeSingle();

    if (entryCheckError) {
      console.error('Error checking waitlist entry:', entryCheckError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to verify waitlist entry',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!entryExists) {
      console.error('Waitlist entry not found:', request.waitlist_entry_id);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Waitlist entry not found',
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert token into database
    const { data, error } = await supabaseAdmin
      .from('waitlist_magic_tokens')
      .insert({
        token,
        waitlist_entry_id: request.waitlist_entry_id,
        email: request.email.toLowerCase(),
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create token:', {
        message: error.message,
        code: error.code,
        details: error.details,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || 'Failed to generate token',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Token generated successfully for:', request.email);

    return new Response(
      JSON.stringify({
        success: true,
        token: data.token,
        expiresAt: data.expires_at,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error generating token:', {
      message: error.message,
      stack: error.stack,
    });
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

---

## Key Changes Summary

| Change | Line(s) | Reason |
|--------|---------|--------|
| Add EDGE_FUNCTION_SECRET | 19 | Read the inter-function secret from environment |
| New isEdgeFunctionAuth check | 58-63 | Validate EDGE_FUNCTION_SECRET before treating as JWT |
| Changed condition from `!isServiceRole` | 65 | Use proper auth hierarchy: secret → JWT → fail |
| Better token validation | 66 | Use `.startsWith('Bearer ')` for safer parsing |
| Support legacy apikey | 89-90 | Maintain backward compatibility |
| Better error messages | 91 | Clearer authentication failure messages |

---

## Authentication Flow After Fix

```
Request comes in with: Authorization: Bearer <token>
          |
          v
Is EDGE_FUNCTION_SECRET present in env AND matches token?
          |
          +---> YES: Allow (inter-function call)
          |
          +---> NO: Continue to next check
                      |
                      v
                Is token a valid Supabase JWT?
                      |
                      +---> YES: Check admin status
                      |           |
                      |           +---> IS ADMIN: Allow
                      |           |
                      |           +---> NOT ADMIN: Return 403
                      |
                      +---> NO: Return 401
```

---

## Deployment Steps

1. **Update the file**: Replace `/supabase/functions/generate-waitlist-token/index.ts` with the fixed version
2. **Deploy edge functions**:
   ```bash
   supabase functions deploy generate-waitlist-token
   ```
3. **Verify deployment**: Check Supabase dashboard > Edge Functions > generate-waitlist-token
4. **Test**:
   - Log in as admin
   - Grant access to a waitlist entry
   - Should succeed with no 401 error
   - Verify email is sent

---

## Backward Compatibility

This fix maintains backward compatibility:
- ✅ Still accepts user JWTs with admin check
- ✅ Still accepts service role key in apikey header
- ✅ Now also accepts EDGE_FUNCTION_SECRET (the missing piece)
- ✅ No breaking changes to API contract

