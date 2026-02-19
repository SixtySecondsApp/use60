import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

export interface ApiKeyValidation {
  isValid: boolean;
  user_id?: string;
  permissions?: any;
  rate_limit?: number;
  is_expired?: boolean;
  error?: string;
}

export interface RateLimitCheck {
  allowed: boolean;
  current_usage: number;
  limit_value: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Create Supabase client with service role key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Extract API key from X-API-Key header
    const apiKey = req.headers.get('X-API-Key')
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: 'API key required in X-API-Key header',
        code: 'API_KEY_MISSING'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Validate API key format
    if (!apiKey.startsWith('sk_') || apiKey.length < 10) {
      return new Response(JSON.stringify({
        error: 'Invalid API key format',
        code: 'API_KEY_INVALID_FORMAT'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Validate the API key
    const validation = await validateApiKey(supabaseClient, apiKey)
    
    if (!validation.isValid) {
      const errorCode = validation.is_expired ? 'API_KEY_EXPIRED' : 'API_KEY_INVALID'
      return new Response(JSON.stringify({
        error: validation.error || 'Invalid API key',
        code: errorCode
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check rate limit
    const rateLimitCheck = await checkRateLimit(supabaseClient, apiKey)
    
    if (!rateLimitCheck.allowed) {
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        details: {
          current_usage: rateLimitCheck.current_usage,
          limit: rateLimitCheck.limit_value,
          reset_time: new Date(Date.now() + 3600000).toISOString() // Next hour
        }
      }), {
        status: 429,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': rateLimitCheck.limit_value.toString(),
          'X-RateLimit-Remaining': Math.max(0, rateLimitCheck.limit_value - rateLimitCheck.current_usage - 1).toString(),
          'X-RateLimit-Reset': Math.floor((Date.now() + 3600000) / 1000).toString()
        }
      })
    }

    // Log the API usage (fire and forget)
    logApiUsage(supabaseClient, apiKey, req).catch(console.error)

    // Return successful authentication with user context
    return new Response(JSON.stringify({
      valid: true,
      user_id: validation.user_id,
      permissions: validation.permissions,
      rate_limit: {
        limit: rateLimitCheck.limit_value,
        remaining: rateLimitCheck.limit_value - rateLimitCheck.current_usage - 1,
        reset: Math.floor((Date.now() + 3600000) / 1000)
      }
    }), {
      status: 200,
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': rateLimitCheck.limit_value.toString(),
        'X-RateLimit-Remaining': Math.max(0, rateLimitCheck.limit_value - rateLimitCheck.current_usage - 1).toString(),
        'X-RateLimit-Reset': Math.floor((Date.now() + 3600000) / 1000).toString()
      }
    })

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

// Validate API key using database function
async function validateApiKey(supabaseClient: any, apiKey: string): Promise<ApiKeyValidation> {
  try {
    const { data, error } = await supabaseClient
      .rpc('validate_api_key', { key_text: apiKey })

    if (error) {
      return { isValid: false, error: 'Database validation error' }
    }

    if (!data || data.length === 0) {
      return { isValid: false, error: 'API key not found' }
    }

    const result = data[0]
    return {
      isValid: result.is_valid,
      user_id: result.user_id,
      permissions: result.permissions,
      rate_limit: result.rate_limit,
      is_expired: result.is_expired,
      error: result.is_expired ? 'API key has expired' : undefined
    }
  } catch (error) {
    return { isValid: false, error: 'Validation exception' }
  }
}

// Check rate limit using database function
async function checkRateLimit(supabaseClient: any, apiKey: string): Promise<RateLimitCheck> {
  try {
    // Hash the API key for lookup
    const { data: hashData, error: hashError } = await supabaseClient
      .rpc('hash_api_key', { key_text: apiKey })

    if (hashError || !hashData) {
      return { allowed: false, current_usage: 0, limit_value: 0 }
    }

    const { data, error } = await supabaseClient
      .rpc('check_rate_limit', { key_hash_val: hashData })

    if (error) {
      return { allowed: false, current_usage: 0, limit_value: 0 }
    }

    if (!data || data.length === 0) {
      return { allowed: false, current_usage: 0, limit_value: 0 }
    }

    const result = data[0]
    return {
      allowed: result.allowed,
      current_usage: result.current_usage,
      limit_value: result.limit_value
    }
  } catch (error) {
    return { allowed: false, current_usage: 0, limit_value: 0 }
  }
}

// Log API usage for analytics and monitoring
async function logApiUsage(supabaseClient: any, apiKey: string, req: Request): Promise<void> {
  try {
    // Get API key ID
    const { data: hashData } = await supabaseClient
      .rpc('hash_api_key', { key_text: apiKey })

    if (!hashData) return

    const { data: keyData } = await supabaseClient
      .from('api_keys')
      .select('id')
      .eq('key_hash', hashData)
      .single()

    if (!keyData) return

    // Parse request details
    const url = new URL(req.url)
    const endpoint = url.pathname
    const method = req.method
    const userAgent = req.headers.get('user-agent') || 'Unknown'
    const contentLength = req.headers.get('content-length')

    // Get client IP (from various possible headers)
    const forwarded = req.headers.get('x-forwarded-for')
    const realIp = req.headers.get('x-real-ip')
    const ipAddress = forwarded?.split(',')[0] || realIp || 'unknown'

    // Log the usage
    await supabaseClient
      .from('api_key_usage')
      .insert({
        api_key_id: keyData.id,
        endpoint,
        method,
        status_code: 200, // Will be updated by actual endpoint
        response_time_ms: 0, // Will be calculated by actual endpoint
        user_agent: userAgent,
        ip_address: ipAddress === 'unknown' ? null : ipAddress,
        request_size: contentLength ? parseInt(contentLength) : null
      })

  } catch (error) {
    // Don't fail the request if logging fails
  }
}

// Helper function to create authenticated supabase client for user
export async function createAuthenticatedClient(req: Request) {
  const apiKey = req.headers.get('X-API-Key')
  if (!apiKey) {
    throw new Error('API key required')
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Validate API key and get user context
  const validation = await validateApiKey(supabaseClient, apiKey)
  
  if (!validation.isValid) {
    throw new Error('Invalid API key')
  }

  // Set RLS context for the user
  await supabaseClient.rpc('set_session_user', { user_id: validation.user_id })

  return {
    client: supabaseClient,
    user_id: validation.user_id,
    permissions: validation.permissions
  }
}