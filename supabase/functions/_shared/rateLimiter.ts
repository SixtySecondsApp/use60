/**
 * Rate Limiting Utility for Supabase Edge Functions
 * 
 * Based on Phase 3 audit findings: "No rate limiting on most Edge Functions"
 * Implements per-user and per-endpoint rate limiting to prevent abuse
 * 
 * Security Benefits:
 * - Prevents API abuse and resource exhaustion
 * - Protects against DDoS attacks
 * - Ensures fair resource usage across users
 */

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  totalRequests: number;
}

// Default rate limit configurations for different endpoint types
export const RATE_LIMIT_CONFIGS = {
  // High-frequency endpoints (like activities, deals)
  standard: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute
    message: 'Too many requests, please try again later'
  },
  
  // Resource-intensive endpoints (like bulk operations)
  intensive: {
    windowMs: 60 * 1000, // 1 minute  
    maxRequests: 10, // 10 requests per minute
    message: 'Rate limit exceeded for intensive operations'
  },
  
  // Authentication endpoints
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 attempts per 15 minutes
    message: 'Too many authentication attempts'
  },
  
  // Admin operations
  admin: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 requests per minute
    message: 'Admin rate limit exceeded'
  }
} as const;

/**
 * Check rate limit for a user and endpoint
 */
export async function checkRateLimit(
  supabaseClient: any,
  userId: string,
  endpoint: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - config.windowMs;
  
  try {
    // Get current request count in the time window
    const { data: requests, error } = await supabaseClient
      .from('rate_limit')
      .select('id, created_at')
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
      .gte('created_at', new Date(windowStart).toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      // If table doesn't exist (42P01), allow request and log warning
      if (error.code === '42P01') {
      }
      // On error, allow the request but log the issue
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetTime: now + config.windowMs,
        totalRequests: 0
      };
    }

    const currentRequests = requests?.length || 0;
    const allowed = currentRequests < config.maxRequests;
    
    if (allowed) {
      // Record this request (ignore errors if table doesn't exist)
      try {
        await supabaseClient
          .from('rate_limit')
          .insert({
            user_id: userId,
            endpoint: endpoint,
            created_at: new Date(now).toISOString(),
            ip_address: null, // Could be added for additional tracking
            user_agent: null
          });
      } catch (insertError: any) {
        // If table doesn't exist, just log and continue
        if (insertError.code === '42P01') {
        } else {
        }
      }
    }

    return {
      allowed,
      remaining: Math.max(0, config.maxRequests - currentRequests - (allowed ? 1 : 0)),
      resetTime: now + config.windowMs,
      totalRequests: currentRequests + (allowed ? 1 : 0)
    };

  } catch (error) {
    // On error, allow the request to prevent blocking legitimate users
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime: now + config.windowMs,
      totalRequests: 0
    };
  }
}

/**
 * Rate limiting middleware for Edge Functions
 */
export async function rateLimitMiddleware(
  supabaseClient: any,
  req: Request,
  endpoint: string,
  config: RateLimitConfig = RATE_LIMIT_CONFIGS.standard
): Promise<Response | null> {
  try {
    // Extract user ID from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      // No auth header - apply IP-based rate limiting would go here
      // For now, skip rate limiting for unauthenticated requests
      return null;
    }

    // Get user from JWT token
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      // Invalid token - let the main function handle authentication
      return null;
    }

    // Check rate limit
    const rateLimitResult = await checkRateLimit(
      supabaseClient,
      user.id,
      endpoint,
      config
    );

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({
          error: config.message || 'Rate limit exceeded',
          retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': config.maxRequests.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': Math.ceil(rateLimitResult.resetTime / 1000).toString(),
            'Retry-After': Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString()
          }
        }
      );
    }

    // Rate limit passed - add headers and continue
    return null; // Continue processing
    
  } catch (error) {
    // On error, allow the request to prevent blocking legitimate users
    return null;
  }
}

/**
 * Clean up old rate limit records (call periodically)
 */
export async function cleanupRateLimitRecords(supabaseClient: any): Promise<void> {
  try {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    const { error } = await supabaseClient
      .from('rate_limit')
      .delete()
      .lt('created_at', cutoffTime.toISOString());

    if (error) {
    } else {
    }
  } catch (error) {
  }
}

// =============================================================================
// Concurrency & Retry utilities for external API calls (enrichment, integrations)
// =============================================================================

/**
 * Simple concurrency limiter — runs up to `limit` async functions in parallel.
 * Used by enrichment and integration edge functions to avoid API bans.
 */
export function createConcurrencyLimiter(limit: number) {
  let active = 0
  const queue: (() => void)[] = []

  function next() {
    if (queue.length > 0 && active < limit) {
      active++
      const resolve = queue.shift()!
      resolve()
    }
  }

  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>((resolve) => {
        queue.push(resolve)
      })
    } else {
      active++
    }

    try {
      return await fn()
    } finally {
      active--
      next()
    }
  }
}

/**
 * Fetch with retry on 429 (rate limit) and 5xx (server error) responses.
 * Parses Retry-After header for optimal backoff timing.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts?: {
    maxRetries?: number
    baseDelayMs?: number
    signal?: AbortSignal
    logPrefix?: string
  }
): Promise<Response> {
  const maxRetries = opts?.maxRetries ?? 3
  const baseDelayMs = opts?.baseDelayMs ?? 2000
  const logPrefix = opts?.logPrefix ?? '[fetchWithRetry]'

  let lastResponse: Response | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      ...init,
      signal: opts?.signal,
    })

    if (response.ok) {
      return response
    }

    lastResponse = response

    const shouldRetry = response.status === 429 || response.status >= 500
    if (!shouldRetry || attempt === maxRetries) {
      return response
    }

    let delayMs = Math.min(baseDelayMs * Math.pow(2, attempt), 30000)

    const retryAfter = response.headers.get('retry-after')
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10)
      if (!isNaN(seconds)) {
        delayMs = seconds * 1000
      }
    }

    delayMs += Math.random() * 1000

    console.log(
      `${logPrefix} ${response.status} — retrying in ${Math.round(delayMs)}ms (attempt ${attempt + 1}/${maxRetries})`
    )

    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  return lastResponse!
}

export default {
  checkRateLimit,
  rateLimitMiddleware,
  cleanupRateLimitRecords,
  createConcurrencyLimiter,
  fetchWithRetry,
  RATE_LIMIT_CONFIGS
};