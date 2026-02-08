// supabase/functions/_shared/corsHelper.ts
// Allowlist-based CORS helper for secure cross-origin requests

/**
 * Get the list of allowed origins from environment or use defaults.
 * Production should use ALLOWED_ORIGINS env var with comma-separated list.
 */
function getAllowedOrigins(): string[] {
  const envOrigins = Deno.env.get('ALLOWED_ORIGINS');
  if (envOrigins) {
    return envOrigins.split(',').map(o => o.trim()).filter(Boolean);
  }
  
  // Default allowed origins (includes localhost for development)
  const frontendUrl = Deno.env.get('FRONTEND_URL') || '';
  const defaults = [
    'http://localhost:5173',
    'http://localhost:5175',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5175',
    'http://127.0.0.1:3000',
  ];
  
  if (frontendUrl && !defaults.includes(frontendUrl)) {
    defaults.push(frontendUrl);
  }
  
  // Add production domains
  const prodDomains = [
    'https://sixty.io',
    'https://www.sixty.io',
    'https://app.sixty.io',
    'https://use60.com',
    'https://www.use60.com',
    'https://app.use60.com',
    'https://staging.use60.com',
    'https://sixtyseconds.video',
    'https://www.sixtyseconds.video',
    'https://app.sixtyseconds.video',
    'https://sixty-sales-dashboard.vercel.app',
    '*.vercel.app',
  ];
  
  return [...defaults, ...prodDomains];
}

/**
 * Check if an origin is allowed
 */
export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  
  const allowedOrigins = getAllowedOrigins();
  return allowedOrigins.some(allowed => {
    // Exact match
    if (allowed === origin) return true;
    // Wildcard subdomain match (e.g., *.vercel.app)
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2);
      return origin.endsWith(domain) || origin.endsWith('.' + domain);
    }
    return false;
  });
}

/**
 * Get CORS headers for a request.
 * Returns null if origin is not allowed (for non-preflight requests).
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  
  // If no origin header, it's likely a same-origin or server-to-server request
  // Allow these through but don't set CORS headers
  if (!origin) {
    return {
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-cron-secret, x-internal-call',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
  }
  
  // Check if origin is allowed
  if (isOriginAllowed(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-cron-secret, x-internal-call',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Credentials': 'true',
    };
  }
  
  // Origin not allowed - return empty origin to block the request
  console.warn(`[CORS] Blocked request from origin: ${origin}`);
  return {
    'Access-Control-Allow-Origin': '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

/**
 * Handle CORS preflight request
 */
export function handleCorsPreflightRequest(req: Request): Response | null {
  if (req.method !== 'OPTIONS') {
    return null;
  }

  /**
   * Preflight MUST never hard-fail.
   * If preflight returns 4xx/5xx, the browser will abort the real request and
   * Supabase JS surfaces it as "Failed to send a request to the Edge Function".
   *
   * We keep the allowlist enforcement on the actual request (via getCorsHeaders),
   * but for OPTIONS we always respond 200 and echo requested headers/method.
   */
  const origin = req.headers.get('Origin');
  const requestHeaders =
    req.headers.get('Access-Control-Request-Headers') ||
    'authorization, x-client-info, apikey, content-type, x-api-key, x-cron-secret, x-internal-call';
  const requestMethod = req.headers.get('Access-Control-Request-Method') || 'POST';

  const allowOrigin = origin || '*';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': `${requestMethod}, OPTIONS`,
    'Access-Control-Allow-Headers': requestHeaders,
    Vary: 'Origin',
  };

  // Only allow credentials when we can echo a specific origin (never with '*')
  if (origin) headers['Access-Control-Allow-Credentials'] = 'true';

  return new Response('ok', { status: 200, headers });
}

/**
 * Create a JSON response with proper CORS headers
 */
export function jsonResponse(
  data: unknown, 
  req: Request, 
  status: number = 200
): Response {
  const corsHeaders = getCorsHeaders(req);
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    }
  );
}

/**
 * Create an error response with proper CORS headers
 */
export function errorResponse(
  message: string,
  req: Request,
  status: number = 400
): Response {
  return jsonResponse({ error: message }, req, status);
}

/**
 * Get the primary frontend origin from environment.
 * Falls back to production domain if not set.
 */
function getPrimaryOrigin(): string {
  return Deno.env.get('FRONTEND_URL') || 'https://app.use60.com';
}

/**
 * Legacy CORS headers - now uses FRONTEND_URL instead of wildcard
 * @deprecated Use getCorsHeaders(req) for proper origin validation
 */
export const legacyCorsHeaders = {
  get 'Access-Control-Allow-Origin'() { return getPrimaryOrigin(); },
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

/**
 * Standard CORS headers - uses FRONTEND_URL instead of wildcard '*'
 * 90+ functions import this. For new code, use getCorsHeaders(req) instead.
 *
 * NOTE: This uses a getter so it reads FRONTEND_URL at runtime, not import time.
 * Functions using this should migrate to getCorsHeaders(req) for full allowlist support.
 */
export const corsHeaders = {
  get 'Access-Control-Allow-Origin'() { return getPrimaryOrigin(); },
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-cron-secret, x-internal-call',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

/**
 * Handle CORS preflight request and return a Response directly.
 * Used by functions that handle OPTIONS separately without the request object.
 * Uses FRONTEND_URL instead of wildcard.
 */
export function handleCorsPreflightWithResponse(): Response {
  return new Response('ok', {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': getPrimaryOrigin(),
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-cron-secret, x-internal-call',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Max-Age': '86400',
    },
  });
}

