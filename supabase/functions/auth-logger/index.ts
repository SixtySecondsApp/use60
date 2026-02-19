import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

interface AuthEvent {
  event_type: 'SIGNED_IN' | 'SIGNED_OUT' | 'SIGNED_UP' | 'PASSWORD_RECOVERY' | 'TOKEN_REFRESHED' | 'USER_UPDATED'
  user_id: string
  email?: string
  ip_address?: string
  user_agent?: string
  metadata?: Record<string, any>
}

serve(async (req) => {
  // Handle CORS preflight requests
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Create Supabase client with service role key
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

    const authEvent: AuthEvent = await req.json()
    
    // Get client info
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    const userAgent = req.headers.get('user-agent') || 'unknown'

    // Log to admin_logs table (if it exists)
    try {
      const { error: logError } = await supabaseAdmin
        .from('admin_logs')
        .insert({
          action: `AUTH_${authEvent.event_type}`,
          target_user_id: authEvent.user_id,
          details: {
            email: authEvent.email,
            ip_address: clientIP,
            user_agent: userAgent,
            ...authEvent.metadata
          },
          performed_by: authEvent.user_id // Self-performed auth action
        })

      if (logError) {
        // Don't fail the request if logging fails
      }
    } catch (logException) {
      // Continue without logging
    }

    // Optional: Additional security checks based on event type
    if (authEvent.event_type === 'SIGNED_IN') {
      // Could add rate limiting, suspicious IP detection, etc.
      // For now, just log successfully
    }

    return new Response(
      JSON.stringify({ success: true, logged: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
}) 