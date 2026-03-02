import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

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
 *
 * Returns: { authenticated: boolean, method: 'bearer' | 'header' | 'dev' | 'none' }
 */
export function verifySecret(req: Request, secret?: string): VerifySecretResult {
  const envSecret = secret || Deno.env.get('EDGE_FUNCTION_SECRET');
  const hasEnvSecret = !!envSecret;

  // Check Authorization header for Bearer token (avoids CORS preflight issues)
  const authHeader = req.headers.get('authorization');
  const hasAuthHeader = !!authHeader;

  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (envSecret && token === envSecret) {
      console.log('[edgeAuth.verifySecret] ✅ Authenticated via Bearer token', {
        secretConfigured: hasEnvSecret,
        tokenLength: token.length,
      });
      return { authenticated: true, method: 'bearer' };
    } else if (envSecret) {
      console.warn('[edgeAuth.verifySecret] ❌ Bearer token provided but invalid', {
        secretConfigured: hasEnvSecret,
        tokenLength: token.length,
        secretLength: envSecret.length,
      });
    }
  }

  // Fallback: Check for custom header if Authorization not used
  const headerSecret = req.headers.get('x-edge-function-secret');
  const hasHeaderSecret = !!headerSecret;

  if (headerSecret && envSecret && headerSecret === envSecret) {
    console.log('[edgeAuth.verifySecret] ✅ Authenticated via x-edge-function-secret header', {
      secretConfigured: hasEnvSecret,
      secretLength: headerSecret.length,
    });
    return { authenticated: true, method: 'header' };
  } else if (headerSecret && envSecret) {
    console.warn('[edgeAuth.verifySecret] ❌ Custom header provided but invalid', {
      secretConfigured: hasEnvSecret,
      headerLength: headerSecret.length,
      secretLength: envSecret.length,
    });
  }

  // If running locally (no secret configured), allow requests for development
  if (!envSecret) {
    console.log('[edgeAuth.verifySecret] ℹ️ Development mode - no EDGE_FUNCTION_SECRET configured, allowing request', {
      authHeaderPresent: hasAuthHeader,
      customHeaderPresent: hasHeaderSecret,
    });
    return { authenticated: true, method: 'dev' };
  }

  // Authentication failed - neither bearer token nor custom header matched
  console.error('[edgeAuth.verifySecret] ❌ Authentication failed - invalid or missing credentials', {
    authHeaderPresent: hasAuthHeader,
    customHeaderPresent: hasHeaderSecret,
    secretConfigured: hasEnvSecret,
    bearerTokenFormat: authHeader?.substring(0, 10) || 'none',
  });

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
 * Check if the request is authenticated with a service role key.
 * Accepts both the sb_secret_ format (Deno env var) and the JWT-format
 * service role key (used by callers/clients).
 */
export function isServiceRoleAuth(authHeader: string | null, serviceRoleKey: string): boolean {
  const token = normalizeBearer(authHeader);
  if (!token) return false;
  // Direct match against the env var (sb_secret_ format)
  if (token === serviceRoleKey) return true;
  // JWT-format service role keys: compare the full token against the known
  // SUPABASE_SERVICE_ROLE_KEY env var (which IS a JWT). We never decode/trust
  // claims from an unverified JWT — only exact string match is safe.
  const envServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (envServiceRoleKey && token === envServiceRoleKey) return true;
  return false;
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

  const { data: authData, error } = await supabase.auth.getUser(token);

  if (error || !authData?.user) {
    console.error('[edgeAuth] auth.getUser() failed:', error?.message);
    throw new Error(`Unauthorized: invalid session - ${error?.message || 'no user'}`);
  }

  const user = authData.user;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

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

  const { data: authData, error } = await supabase.auth.getUser(token);

  if (error || !authData?.user) {
    console.error('[edgeAuth] authenticateRequest: auth.getUser() failed:', error?.message);
    throw new Error(`Unauthorized: invalid session - ${error?.message || 'no user'}`);
  }

  return { userId: authData.user.id, mode: 'user' };
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
    .maybeSingle();

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


