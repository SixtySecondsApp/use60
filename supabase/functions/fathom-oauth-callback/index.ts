import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { captureException } from "../_shared/sentryEdge.ts"

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const publicUrl =
  Deno.env.get('PUBLIC_URL') ||
  Deno.env.get('APP_URL') ||
  Deno.env.get('SITE_URL') ||
  'https://use60.com'

/**
 * Fathom OAuth Callback Edge Function (Per-User)
 *
 * Purpose: Handle OAuth callback from Fathom, exchange code for tokens
 * Flow: Fathom redirects here → Exchange code → Store tokens (per-user) → Redirect to app
 *
 * Note: This is a per-user integration - each user connects their own Fathom account.
 */
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Track progress for debugging - declared OUTSIDE try for catch access
  let debugStep = 'init'

  try {
    debugStep = 'parsing_request'
    // Get code and state from request body (POST) or URL params (GET redirect)
    let code: string | null = null
    let state: string | null = null
    let error: string | null = null
    let errorDescription: string | null = null

    if (req.method === 'POST') {
      const body = await req.json()
      code = body.code
      state = body.state
    } else {
      const url = new URL(req.url)
      code = url.searchParams.get('code')
      state = url.searchParams.get('state')
      error = url.searchParams.get('error')
      errorDescription = url.searchParams.get('error_description')
    }

    // Check for OAuth errors from Fathom
    if (error) {
      return new Response(
        `<!DOCTYPE html>
        <html>
          <head><title>Fathom Connection Failed</title></head>
          <body>
            <h1>Connection Failed</h1>
            <p>Error: ${escapeHtml(error || '')}</p>
            <p>${escapeHtml(errorDescription || '')}</p>
            <a href="/">Return to App</a>
            <script>
              // Auto-close window after 5 seconds if opened in popup
              setTimeout(() => {
                if (window.opener) {
                  window.close();
                } else {
                  window.location.href = '/integrations';
                }
              }, 5000);
            </script>
          </body>
        </html>`,
        {
          status: 400,
          headers: { 'Content-Type': 'text/html' },
        }
      )
    }

    if (!code || !state) {
      throw new Error('Missing code or state parameter')
    }

    debugStep = 'creating_supabase_client'
    // Use service role to bypass RLS for token storage
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

    debugStep = 'validating_state'
    // Validate state (CSRF protection)
    const { data: stateRecord, error: stateError } = await supabase
      .from('fathom_oauth_states')
      .select('*')
      .eq('state', state)
      .single()

    if (stateError || !stateRecord) {
      throw new Error('Invalid state parameter - possible CSRF attack')
    }

    // Check if state is expired
    if (new Date(stateRecord.expires_at) < new Date()) {
      throw new Error('State expired - please try again')
    }

    const userId = stateRecord.user_id

    // NOTE: We delete the state AFTER successful token exchange (moved below)
    // This allows retries if token exchange fails

    debugStep = 'getting_oauth_config'
    // Get OAuth configuration
    const clientId = Deno.env.get('FATHOM_CLIENT_ID')
    const clientSecret = Deno.env.get('FATHOM_CLIENT_SECRET')
    const redirectUri = Deno.env.get('FATHOM_REDIRECT_URI')

    console.log('[fathom-oauth] OAuth config check:', {
      hasClientId: !!clientId,
      clientIdPrefix: clientId?.substring(0, 10) + '...',
      hasClientSecret: !!clientSecret,
      secretLength: clientSecret?.length,
      redirectUri,
    })

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Missing Fathom OAuth configuration')
    }

    debugStep = 'exchanging_token'
    // Exchange authorization code for access token
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    })

    console.log('[fathom-oauth] Token exchange request:', {
      endpoint: 'https://fathom.video/external/v1/oauth2/token',
      grant_type: 'authorization_code',
      hasCode: !!code,
      codeLength: code?.length,
      client_id: clientId,
      redirect_uri: redirectUri,
    })

    const tokenResponse = await fetch('https://fathom.video/external/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams.toString(),
    })

    console.log('[fathom-oauth] Token response status:', tokenResponse.status, tokenResponse.statusText)

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('[fathom-oauth] Token exchange error response:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        body: errorText,
      })
      throw new Error(`Token exchange failed (${tokenResponse.status}): ${errorText}`)
    }

    debugStep = 'parsing_token_response'
    const tokenData = await tokenResponse.json()

    debugStep = 'deleting_state'
    // NOW delete the used state (after successful token exchange)
    await supabase
      .from('fathom_oauth_states')
      .delete()
      .eq('state', state)

    debugStep = 'getting_user_info'
    // Get the connecting user's info from Supabase
    let fathomUserId: string | null = null
    let fathomUserEmail: string | null = null

    // Get user's email from their Supabase profile
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .maybeSingle()

    // Also get from auth.users as fallback
    const { data: authUser } = await supabase.auth.admin.getUserById(userId)

    fathomUserEmail = userProfile?.email || authUser?.user?.email || null
    console.log(`[fathom-oauth] User email from Supabase: ${fathomUserEmail}`)

    // Try to get Fathom user info from recordings endpoint
    try {
      console.log('[fathom-oauth] Fetching Fathom workspace info from recordings...')
      const recordingsResponse = await fetch('https://api.fathom.ai/external/v1/recordings?limit=1', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
        },
      })

      if (recordingsResponse.ok) {
        const recordingsData = await recordingsResponse.json()
        console.log('[fathom-oauth] Recordings response structure:', Object.keys(recordingsData))

        // Check if there's user info in the response
        if (recordingsData.user) {
          fathomUserId = recordingsData.user.id || null
        }
      } else {
        const errorText = await recordingsResponse.text()
        console.log(`[fathom-oauth] Recordings endpoint returned ${recordingsResponse.status}: ${errorText.substring(0, 100)}`)
      }
    } catch (error) {
      console.error('[fathom-oauth] Error fetching Fathom info:', error)
      // Continue anyway - this is not critical
    }

    // Calculate token expiry
    const expiresIn = tokenData.expires_in || 3600 // Default 1 hour
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    console.log(`[fathom-oauth] Storing per-user integration for user ${userId}`)

    debugStep = 'storing_integration'
    // Store per-user integration (includes tokens directly)
    const { data: userIntegration, error: insertError } = await supabase
      .from('fathom_integrations')
      .upsert({
        user_id: userId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: tokenExpiresAt,
        fathom_user_id: fathomUserId,
        fathom_user_email: fathomUserEmail,
        scopes: tokenData.scope?.split(' ') || ['public_api'],
        is_active: true,
        last_sync_at: null,
      }, {
        onConflict: 'user_id',
      })
      .select()
      .single()

    if (insertError) {
      throw new Error(`Failed to store integration: ${insertError.message}`)
    }

    debugStep = 'creating_sync_state'
    // Create initial sync state for the user
    const { error: syncStateError } = await supabase
      .from('fathom_sync_state')
      .upsert({
        user_id: userId,
        integration_id: userIntegration.id,
        sync_status: 'idle',
        meetings_synced: 0,
        total_meetings_found: 0,
      }, {
        onConflict: 'user_id',
      })

    if (syncStateError) {
      console.log(`[fathom-oauth] Warning: Failed to create sync state: ${syncStateError.message}`)
      // Continue anyway - sync state can be created later
    }

    debugStep = 'returning_response'
    // Return JSON response for POST requests, HTML for GET redirects
    if (req.method === 'POST') {
      return new Response(
        JSON.stringify({
          success: true,
          integration_id: userIntegration.id,
          user_id: userId,
          message: 'Fathom integration connected successfully'
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // HTML response for GET redirects (if Fathom redirects directly to Edge Function)
    return new Response(
      `<!DOCTYPE html>
      <html>
        <head>
          <title>Fathom Connected!</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .container {
              text-align: center;
              padding: 2rem;
              background: rgba(255, 255, 255, 0.1);
              backdrop-filter: blur(10px);
              border-radius: 20px;
              box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            }
            h1 { margin: 0 0 1rem; font-size: 2.5rem; }
            p { margin: 0.5rem 0; opacity: 0.9; }
            .spinner {
              margin: 2rem auto;
              width: 50px;
              height: 50px;
              border: 4px solid rgba(255, 255, 255, 0.3);
              border-top-color: white;
              border-radius: 50%;
              animation: spin 1s linear infinite;
            }
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ Fathom Connected!</h1>
            <p>Your Fathom account has been successfully connected.</p>
            <p>Redirecting to integrations...</p>
            <div class="spinner"></div>
          </div>
          <script>
            // Notify parent window of success
            if (window.opener) {
              window.opener.postMessage({ type: 'fathom-oauth-success' }, '*');
              // Close popup after a short delay
              setTimeout(() => window.close(), 1500);
            } else {
              // Redirect after 2 seconds if not in popup
              setTimeout(() => {
                window.location.href = '${publicUrl}/integrations?fathom=connected';
              }, 2000);
            }
          </script>
        </body>
      </html>`,
      {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined

    console.error('[fathom-oauth] Fatal error:', {
      message: errorMessage,
      stack: errorStack,
    })

    // Try to capture to Sentry, but don't let it crash the function
    try {
      await captureException(error, {
        tags: {
          function: 'fathom-oauth-callback',
          integration: 'fathom',
        },
      });
    } catch (sentryError) {
      console.error('[fathom-oauth] Failed to capture exception to Sentry:', sentryError)
    }

    // Return JSON for POST requests (from frontend)
    if (req.method === 'POST') {
      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          debugStep,
          debug: {
            step: debugStep,
            timestamp: new Date().toISOString(),
          }
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // HTML response for GET requests
    return new Response(
      `<!DOCTYPE html>
      <html>
        <head><title>Connection Failed</title></head>
        <body>
          <h1>Fathom Connection Failed</h1>
          <p>Error: ${escapeHtml(errorMessage || '')}</p>
          <a href="${publicUrl}/integrations">Return to Integrations</a>
          <script>
            setTimeout(() => {
              if (window.opener) {
                window.close();
              } else {
                window.location.href = '${publicUrl}/integrations';
              }
            }, 5000);
          </script>
        </body>
      </html>`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/html' },
      }
    )
  }
})
