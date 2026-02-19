import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

serve(async (req) => {
  // Handle CORS preflight
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { userId } = await req.json()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'User ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Get the user from the JWT token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: requestingUser }, error: userError } = await supabaseAdmin.auth.getUser(token)

    if (userError || !requestingUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify the user is requesting to verify their own email
    if (requestingUser.id !== userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user has a waitlist entry (indicates valid access code)
    const { data: waitlistEntry } = await supabaseAdmin
      .from('meetings_waitlist')
      .select('id')
      .or(`user_id.eq.${userId},email.ilike.${requestingUser.email}`)
      .limit(1)
      .maybeSingle()

    // Only auto-verify if user has waitlist entry (valid access code)
    if (!waitlistEntry) {
      return new Response(
        JSON.stringify({ error: 'No waitlist entry found. Email verification required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Auto-verify email using admin API
    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { email_confirm: true }
    )

    if (updateError) {
      console.error('Error auto-verifying email:', updateError)
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email auto-verified',
        user: {
          id: updatedUser.user.id,
          email: updatedUser.user.email,
          email_confirmed_at: updatedUser.user.email_confirmed_at
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('Error in auto-verify-email:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
