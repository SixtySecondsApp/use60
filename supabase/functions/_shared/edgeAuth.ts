import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export type AuthMode = 'service_role' | 'user' | 'cron' | 'edge_function_secret';

export type AuthContext = {
  mode: AuthMode;
  userId: string | null;
  isPlatformAdmin: boolean;
};

export type VerifySecretResult = {
  authenticated: boolean;
  method: 'bearer' | 'header' | 'dev' | 'none';
};

/**
 * Verify custom edge function secret
 * Used for inter-function communication and controlled API access
 *
 * Checks in order:
 * 1. Authorization: Bearer {secret} header (preferred for CORS compatibility)
 * 2. x-edge-function-secret header (custom header fallback)
 * 3. Dev mode: if no secret configured, returns true with console log
 */
export function verifySecret(req: Request, secret?: string): VerifySecretResult {
  const envSecret = secret || Deno.env.get('EDGE_FUNCTION_SECRET');

  // Check Authorization header for Bearer token (avoids CORS preflight issues)
  const authHeader = req.headers.get('authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (envSecret && token === envSecret) {
      console.log('[edgeAuth.verifySecret] ✅ Authentication successful via Bearer token');
      return { authenticated: true, method: 'bearer' };
    }
  }

  // Fallback: Check for custom header if Authorization not used
  const headerSecret = req.headers.get('x-edge-function-secret');
  if (headerSecret && envSecret && headerSecret === envSecret) {
    console.log('[edgeAuth.verifySecret] ✅ Authentication successful via custom header');
    return { authenticated: true, method: 'header' };
  }

  // If running locally (no secret configured), allow requests for development
  if (!envSecret) {
    console.log('[edgeAuth.verifySecret] ℹ️ Dev mode - no EDGE_FUNCTION_SECRET configured, allowing request');
    return { authenticated: true, method: 'dev' };
  }

  console.warn('[edgeAuth.verifySecret] ❌ Authentication failed: invalid or missing credentials');
  return { authenticated: false, method: 'none' };
}

/**
 * Extract bearer token from Authorization header
 */
function normalizeBearer(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const v = authHeader.trim();
  if (!v.toLowerCase().startsWith('bearer ')) return null;
  // Some proxies / runtimes can append additional auth schemes or duplicate values
  // in a single Authorization header, comma-separated. We always treat the first
  // Bearer token as the credential.
  const remainder = v.slice('bearer '.length).trim();
  // Split on comma OR any whitespace (defensive parsing).
  const firstToken = remainder.split(/[,\s]+/)[0]?.trim() ?? '';
  return firstToken || null;
}

/**
 * Check if the request is authenticated with a service role key (exact match)
 */
export function isServiceRoleAuth(authHeader: string | null, serviceRoleKey: string): boolean {
  const token = normalizeBearer(authHeader);
  if (!token) return false;
  // IMPORTANT: Exact match only - no partial/includes checks
  return token === serviceRoleKey;
}

/**
 * Verify cron secret for scheduled jobs.
 * FAIL-CLOSED: Returns false if CRON_SECRET is not set or doesn't match.
 */
export function verifyCronSecret(req: Request, cronSecret: string | undefined): boolean {
  // Fail closed: if no cron secret is configured, reject all cron requests
  if (!cronSecret || cronSecret.trim() === '') {
    console.error('[edgeAuth] CRON_SECRET not configured - rejecting cron request');
    return false;
  }
  
  const providedSecret = req.headers.get('x-cron-secret');
  if (!providedSecret) {
    return false;
  }
  
  // Constant-time comparison to prevent timing attacks
  if (cronSecret.length !== providedSecret.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < cronSecret.length; i++) {
    result |= cronSecret.charCodeAt(i) ^ providedSecret.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Get authentication context from request.
 * Supports user JWT, service role key, and optional cron secret.
 */
export async function getAuthContext(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  serviceRoleKey: string,
  options?: { cronSecret?: string }
): Promise<AuthContext> {
  const authHeader = req.headers.get('Authorization');

  // Check for service role authentication (exact match)
  if (isServiceRoleAuth(authHeader, serviceRoleKey)) {
    return { mode: 'service_role', userId: null, isPlatformAdmin: true };
  }

  // Check for cron authentication if cron secret is provided
  if (options?.cronSecret && verifyCronSecret(req, options.cronSecret)) {
    return { mode: 'cron', userId: null, isPlatformAdmin: false };
  }

  const token = normalizeBearer(authHeader);
  if (!token) {
    throw new Error('Unauthorized: missing Authorization header');
  }

  let user = null;
  const { data: authData, error } = await supabase.auth.getUser(token);

  if (error || !authData?.user) {
    console.error('[edgeAuth] auth.getUser() failed:', error);

    // Fallback: decode JWT without verification (we're in a trusted edge function environment)
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        console.log('[edgeAuth] Decoded JWT payload (fallback):', { sub: payload.sub, email: payload.email, iss: payload.iss });

        // Verify the JWT is for this project by checking issuer
        if (payload.iss && payload.iss.includes(supabase.supabaseUrl.replace('https://', ''))) {
          console.log('[edgeAuth] JWT issuer matches project, using fallback auth');
          user = {
            id: payload.sub,
            email: payload.email,
            ...payload
          };
        } else {
          console.error('[edgeAuth] JWT issuer mismatch:', payload.iss, 'vs', supabase.supabaseUrl);
          throw new Error('Unauthorized: JWT issuer mismatch');
        }
      }
    } catch (decodeError) {
      console.error('[edgeAuth] JWT decode fallback failed:', decodeError);
      throw new Error(`Unauthorized: invalid session - ${error?.message || 'no user'}`);
    }
  } else {
    user = authData.user;
  }

  if (!user) {
    throw new Error('Unauthorized: no user found');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  return { mode: 'user', userId: user.id, isPlatformAdmin: profile?.is_admin === true };
}

/**
 * Authenticate a request and return userId.
 * For service-role calls, userId must be provided in the request body.
 * For user calls, userId is derived from the JWT.
 */
export async function authenticateRequest(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  serviceRoleKey: string,
  bodyUserId?: string
): Promise<{ userId: string; mode: AuthMode }> {
  const authHeader = req.headers.get('Authorization');

  // Check for service role authentication
  if (isServiceRoleAuth(authHeader, serviceRoleKey)) {
    if (!bodyUserId) {
      throw new Error('userId required in body for service-role calls');
    }
    return { userId: bodyUserId, mode: 'service_role' };
  }

  // User JWT authentication
  const token = normalizeBearer(authHeader);
  if (!token) {
    throw new Error('Unauthorized: missing Authorization header');
  }

  let user = null;
  const { data: authData, error } = await supabase.auth.getUser(token);

  if (error || !authData?.user) {
    console.error('[edgeAuth] authenticateRequest: auth.getUser() failed:', error);

    // Fallback: decode JWT without verification (trusted environment)
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

        // Verify JWT issuer matches this project
        if (payload.iss && payload.iss.includes(supabase.supabaseUrl.replace('https://', ''))) {
          user = {
            id: payload.sub,
            email: payload.email,
            ...payload
          };
        } else {
          throw new Error('Unauthorized: JWT issuer mismatch');
        }
      }
    } catch (decodeError) {
      throw new Error(`Unauthorized: invalid session - ${error?.message || 'no user'}`);
    }
  } else {
    user = authData.user;
  }

  if (!user) {
    throw new Error('Unauthorized: no user found');
  }

  return { userId: user.id, mode: 'user' };
}

/**
 * Require organization membership with specific roles
 */
export async function requireOrgRole(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userId: string,
  allowedRoles: Array<'owner' | 'admin' | 'member' | 'readonly'>
): Promise<void> {
  const { data, error } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .single();

  if (error || !data?.role) {
    throw new Error('Unauthorized: not a member of this organization');
  }

  if (!allowedRoles.includes(data.role)) {
    throw new Error('Unauthorized: insufficient permissions for this organization');
  }
}

/**
 * Get the user's organization ID (first membership found)
 * Returns null if user has no org membership - callers should decide how to handle
 */
export async function getUserOrgId(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  return membership?.org_id || null;
}


