import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

interface RateLimitCheck {
  action: 'login' | 'signup' | 'password_reset'
  identifier: string // email or IP
  ip_address?: string
}

interface RateLimitResponse {
  allowed: boolean
  remaining_attempts?: number
  reset_time?: number
  blocked_until?: number
}

// Rate limit configurations
const RATE_LIMITS = {
  login: { max_attempts: 5, window_minutes: 15 }, // 5 attempts per 15 minutes
  signup: { max_attempts: 3, window_minutes: 60 }, // 3 signups per hour
  password_reset: { max_attempts: 3, window_minutes: 60 } // 3 resets per hour
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { action, identifier, ip_address }: RateLimitCheck = await req.json()
    const limit_config = RATE_LIMITS[action]
    
    if (!limit_config) {
      throw new Error('Invalid action for rate limiting')
    }

    const now = new Date()
    const window_start = new Date(now.getTime() - (limit_config.window_minutes * 60 * 1000))

    // Check existing attempts in the time window
    const { data: attempts, error } = await supabaseAdmin
      .from('rate_limit_attempts')
      .select('*')
      .eq('action', action)
      .eq('identifier', identifier)
      .gte('created_at', window_start.toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      // If we can't check rate limits, allow the request (fail open)
      return new Response(
        JSON.stringify({ allowed: true } as RateLimitResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const current_attempts = attempts?.length || 0
    const remaining = limit_config.max_attempts - current_attempts

    // Check if user is blocked
    if (current_attempts >= limit_config.max_attempts) {
      const oldest_attempt = attempts[attempts.length - 1]
      const reset_time = new Date(oldest_attempt.created_at)
      reset_time.setMinutes(reset_time.getMinutes() + limit_config.window_minutes)

      return new Response(
        JSON.stringify({
          allowed: false,
          remaining_attempts: 0,
          reset_time: reset_time.getTime(),
          blocked_until: reset_time.getTime()
        } as RateLimitResponse),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 429 
        }
      )
    }

    // Record this attempt
    await supabaseAdmin
      .from('rate_limit_attempts')
      .insert({
        action,
        identifier,
        ip_address: ip_address || req.headers.get('x-forwarded-for') || 'unknown',
        user_agent: req.headers.get('user-agent') || 'unknown'
      })

    return new Response(
      JSON.stringify({
        allowed: true,
        remaining_attempts: remaining - 1
      } as RateLimitResponse),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    // Fail open - don't block users if rate limiting is broken
    return new Response(
      JSON.stringify({ allowed: true } as RateLimitResponse),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}) 