import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { captureException } from '../_shared/sentryEdge.ts'
import { exchangeAuthCode, exchangeAccessTokenForRestToken } from '../_shared/bullhorn.ts'

/**
 * Bullhorn OAuth Callback (org-scoped)
 *
 * Bullhorn redirects the user to this public GET endpoint after authorization.
 * We validate the OAuth state from bullhorn_oauth_states, exchange the code for
 * tokens, exchange access token for BhRestToken, store credentials in
 * bullhorn_org_credentials, and mark the org integration connected.
 *
 * Bullhorn OAuth flow:
 * 1. Exchange authorization code for access_token + refresh_token
 * 2. Exchange access_token for BhRestToken + restUrl (required for API calls)
 * 3. Store all credentials and mark integration as connected
 */

// State TTL in milliseconds (10 minutes)
const STATE_TTL_MS = 10 * 60 * 1000

serve(async (req) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 })

  const frontendUrl = Deno.env.get('FRONTEND_URL') || 'http://localhost:5173'

  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')
    const errorDescription = url.searchParams.get('error_description')

    if (error) {
      return redirectToFrontend(frontendUrl, '/integrations', {
        bullhorn_status: 'error',
        error: error,
        error_description: errorDescription || 'Authorization denied',
      })
    }

    if (!code || !state) {
      return redirectToFrontend(frontendUrl, '/integrations', {
        bullhorn_status: 'error',
        error: 'invalid_request',
        error_description: 'Missing code or state',
      })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Validate OAuth state
    const { data: oauthState, error: stateError } = await supabase
      .from('bullhorn_oauth_states')
      .select('user_id, org_id, expires_at, created_at')
      .eq('state', state)
      .single()

    if (stateError || !oauthState) {
      return redirectToFrontend(frontendUrl, '/integrations', {
        bullhorn_status: 'error',
        error: 'invalid_state',
        error_description: 'Invalid or expired OAuth state. Please try again.',
      })
    }

    // Extra safety: TTL check (in case cleanup job hasn't run)
    const createdAt = oauthState.created_at ? new Date(oauthState.created_at) : null
    if (createdAt && Date.now() - createdAt.getTime() > STATE_TTL_MS) {
      await supabase.from('bullhorn_oauth_states').delete().eq('state', state)
      return redirectToFrontend(frontendUrl, '/integrations', {
        bullhorn_status: 'error',
        error: 'expired_state',
        error_description: 'OAuth state expired. Please try again.',
      })
    }

    // Get Bullhorn OAuth credentials from environment
    const clientId = Deno.env.get('BULLHORN_CLIENT_ID') || ''
    const clientSecret = Deno.env.get('BULLHORN_CLIENT_SECRET') || ''
    const redirectUri = Deno.env.get('BULLHORN_REDIRECT_URI') || ''

    if (!clientId || !clientSecret || !redirectUri) {
      return redirectToFrontend(frontendUrl, '/integrations', {
        bullhorn_status: 'error',
        error: 'server_misconfigured',
        error_description: 'Bullhorn OAuth is not configured on the server.',
      })
    }

    // Step 1: Exchange authorization code for access token + refresh token
    let tokenData
    try {
      tokenData = await exchangeAuthCode(code, clientId, clientSecret, redirectUri)
    } catch (tokenError) {
      console.error('Token exchange error:', tokenError)
      await supabase.from('bullhorn_oauth_states').delete().eq('state', state)
      const errorMsg = tokenError instanceof Error ? tokenError.message : 'Failed to exchange token'
      return redirectToFrontend(frontendUrl, '/integrations', {
        bullhorn_status: 'error',
        error: 'token_exchange_failed',
        error_description: errorMsg,
      })
    }

    const accessToken = tokenData.access_token
    const refreshToken = tokenData.refresh_token
    const expiresIn = tokenData.expires_in || 1800 // Default to 30 minutes

    if (!accessToken || !refreshToken) {
      await supabase.from('bullhorn_oauth_states').delete().eq('state', state)
      return redirectToFrontend(frontendUrl, '/integrations', {
        bullhorn_status: 'error',
        error: 'token_missing',
        error_description: 'Bullhorn did not return expected OAuth tokens.',
      })
    }

    // Step 2: Exchange access token for BhRestToken and REST URL
    let restTokenData
    try {
      restTokenData = await exchangeAccessTokenForRestToken(accessToken)
    } catch (restError) {
      console.error('REST token exchange error:', restError)
      await supabase.from('bullhorn_oauth_states').delete().eq('state', state)
      const errorMsg = restError instanceof Error ? restError.message : 'Failed to get REST token'
      return redirectToFrontend(frontendUrl, '/integrations', {
        bullhorn_status: 'error',
        error: 'rest_token_failed',
        error_description: errorMsg,
      })
    }

    const bhRestToken = restTokenData.BhRestToken
    const restUrl = restTokenData.restUrl

    if (!bhRestToken || !restUrl) {
      await supabase.from('bullhorn_oauth_states').delete().eq('state', state)
      return redirectToFrontend(frontendUrl, '/integrations', {
        bullhorn_status: 'error',
        error: 'rest_token_missing',
        error_description: 'Bullhorn did not return expected REST token.',
      })
    }

    // Extract corp ID from restUrl (e.g., "rest123.bullhornstaffing.com" -> "123")
    let bullhornCorpId: string | null = null
    try {
      const restUrlParsed = new URL(restUrl)
      const hostMatch = restUrlParsed.hostname.match(/rest(\d+)/)
      if (hostMatch) {
        bullhornCorpId = hostMatch[1]
      }
    } catch {
      // Non-fatal - we may not be able to extract corp ID
    }

    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    // Ensure we preserve a stable webhook_token per org
    const { data: existingIntegration } = await supabase
      .from('bullhorn_org_integrations')
      .select('webhook_token')
      .eq('org_id', oauthState.org_id)
      .maybeSingle()

    const webhookToken = existingIntegration?.webhook_token || crypto.randomUUID()

    // Store credentials (service-role-only table)
    const { error: credsErr } = await supabase.from('bullhorn_org_credentials').upsert(
      {
        org_id: oauthState.org_id,
        access_token: accessToken,
        refresh_token: refreshToken,
        bh_rest_token: bhRestToken,
        rest_url: restUrl,
        token_expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id' }
    )

    if (credsErr) {
      await supabase.from('bullhorn_oauth_states').delete().eq('state', state)
      return redirectToFrontend(frontendUrl, '/integrations', {
        bullhorn_status: 'error',
        error: 'db_error',
        error_description: `Failed to store credentials: ${credsErr.message}`,
      })
    }

    // Mark integration connected (non-sensitive table)
    const { error: integrationErr } = await supabase.from('bullhorn_org_integrations').upsert(
      {
        org_id: oauthState.org_id,
        connected_by_user_id: oauthState.user_id,
        is_active: true,
        is_connected: true,
        connected_at: new Date().toISOString(),
        bullhorn_corp_id: bullhornCorpId,
        rest_url: restUrl,
        webhook_token: webhookToken,
        last_sync_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id' }
    )

    if (integrationErr) {
      await supabase.from('bullhorn_oauth_states').delete().eq('state', state)
      return redirectToFrontend(frontendUrl, '/integrations', {
        bullhorn_status: 'error',
        error: 'db_error',
        error_description: `Failed to store integration status: ${integrationErr.message}`,
      })
    }

    // Ensure settings + sync state rows exist (idempotent)
    await supabase
      .from('bullhorn_settings')
      .upsert({ org_id: oauthState.org_id, settings: {} }, { onConflict: 'org_id' })
    await supabase
      .from('bullhorn_org_sync_state')
      .upsert({ org_id: oauthState.org_id, sync_status: 'idle', cursors: {} }, { onConflict: 'org_id' })

    // Cleanup OAuth state (one-time use)
    await supabase.from('bullhorn_oauth_states').delete().eq('state', state)

    return redirectToFrontend(frontendUrl, '/integrations', {
      bullhorn_status: 'connected',
      bullhorn_corp_id: bullhornCorpId || '',
    })
  } catch (error) {
    await captureException(error, {
      tags: {
        function: 'bullhorn-oauth-callback',
        integration: 'bullhorn',
      },
    })
    return redirectToFrontend(frontendUrl, '/integrations', {
      bullhorn_status: 'error',
      error: 'callback_failed',
      error_description: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

function redirectToFrontend(frontendBase: string, path: string, params: Record<string, string>): Response {
  const u = new URL(frontendBase)
  u.pathname = path
  for (const [k, v] of Object.entries(params)) {
    if (v) u.searchParams.set(k, v)
  }
  return Response.redirect(u.toString(), 302)
}
