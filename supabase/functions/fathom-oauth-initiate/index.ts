import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Fathom OAuth Initiation Edge Function (Per-User)
 *
 * Purpose: Generate OAuth authorization URL and redirect user to Fathom
 * Flow: User clicks "Connect Fathom" → This function → Redirect to Fathom OAuth
 *
 * Note: This is a per-user integration - each user connects their own Fathom account.
 */
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get authenticated user using anon key
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const { data: { user }, error: userError } = await anonClient.auth.getUser()

    if (userError || !user) {
      throw new Error('Unauthorized: No valid session')
    }

    // Create service role client for bypassing RLS when storing OAuth state
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      }
    )

    // Check if user already has an active integration (per-user)
    const { data: existingIntegration } = await supabase
      .from('fathom_integrations')
      .select('id, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (existingIntegration) {
      return new Response(
        JSON.stringify({
          error: 'Integration already exists',
          message: 'You already have an active Fathom connection. Disconnect first to reconnect.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Get OAuth configuration from environment
    const clientId = Deno.env.get('FATHOM_CLIENT_ID')
    const redirectUri = Deno.env.get('FATHOM_REDIRECT_URI')

    if (!clientId || !redirectUri) {
      throw new Error('Missing Fathom OAuth configuration')
    }

    // Generate secure random state for CSRF protection
    const state = crypto.randomUUID()

    // Store state in session for validation (per-user, no org_id needed)
    const { error: stateError } = await supabase
      .from('fathom_oauth_states')
      .insert({
        state,
        user_id: user.id,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
      })

    if (stateError) {
      throw new Error(`Failed to store OAuth state: ${stateError.message}`)
    }

    // Build OAuth authorization URL
    const authUrl = new URL('https://fathom.video/external/v1/oauth2/authorize')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', 'public_api') // Only supported scope
    authUrl.searchParams.set('state', state)

    console.log('[fathom-oauth-initiate] Generated URL:', authUrl.toString())
    console.log('[fathom-oauth-initiate] Redirect URI:', redirectUri)

    return new Response(
      JSON.stringify({
        success: true,
        authorization_url: authUrl.toString(),
        state,
        user_id: user.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to initiate OAuth',
        details: error.toString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
