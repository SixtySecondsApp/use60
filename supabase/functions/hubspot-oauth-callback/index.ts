import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { captureException } from '../_shared/sentryEdge.ts'

/**
 * HubSpot OAuth Callback (org-scoped)
 *
 * HubSpot redirects the user to this public GET endpoint after authorization.
 * We validate the OAuth state from hubspot_oauth_states, exchange the code for
 * tokens, store credentials in hubspot_org_credentials, and mark the org
 * integration connected in hubspot_org_integrations.
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

    if (error) {
      return redirectToFrontend(frontendUrl, '/integrations', {
        hubspot_error: error,
      })
    }

    if (!code || !state) {
      return redirectToFrontend(frontendUrl, '/integrations', {
        hubspot_error: 'invalid_request',
        hubspot_error_description: 'Missing code or state',
      })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: oauthState, error: stateError } = await supabase
      .from('hubspot_oauth_states')
      .select('user_id, org_id, clerk_org_id, redirect_uri, expires_at, created_at')
      .eq('state', state)
      .single()

    if (stateError || !oauthState) {
      return redirectToFrontend(frontendUrl, '/integrations', {
        hubspot_error: 'invalid_state',
        hubspot_error_description: 'Invalid or expired OAuth state. Please try again.',
      })
    }

    // Extra safety: TTL check (in case cleanup job hasn't run)
    const createdAt = oauthState.created_at ? new Date(oauthState.created_at) : null
    if (createdAt && Date.now() - createdAt.getTime() > STATE_TTL_MS) {
      await supabase.from('hubspot_oauth_states').delete().eq('state', state)
      return redirectToFrontend(frontendUrl, '/integrations', {
        hubspot_error: 'expired_state',
        hubspot_error_description: 'OAuth state expired. Please try again.',
      })
    }

    // Exchange code -> tokens
    const clientId = Deno.env.get('HUBSPOT_CLIENT_ID') || ''
    const clientSecret = Deno.env.get('HUBSPOT_CLIENT_SECRET') || ''
    const redirectUri = Deno.env.get('HUBSPOT_REDIRECT_URI') || ''

    if (!clientId || !clientSecret || !redirectUri) {
      return redirectToFrontend(frontendUrl, '/integrations', {
        hubspot_error: 'server_misconfigured',
        hubspot_error_description: 'HubSpot OAuth is not configured on the server.',
      })
    }

    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    })

    const tokenResp = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    })

    const tokenText = await tokenResp.text()
    let tokenData: any
    try {
      tokenData = JSON.parse(tokenText)
    } catch {
      tokenData = { raw: tokenText }
    }

    if (!tokenResp.ok) {
      await supabase.from('hubspot_oauth_states').delete().eq('state', state)
      return redirectToFrontend(frontendUrl, '/integrations', {
        hubspot_error: 'token_exchange_failed',
        hubspot_error_description: tokenData?.message || tokenData?.error_description || 'Failed to exchange token',
      })
    }

    const accessToken = String(tokenData.access_token || '')
    const refreshToken = String(tokenData.refresh_token || '')
    const expiresIn = Number(tokenData.expires_in || 1800)
    const scopeStr = typeof tokenData.scope === 'string' ? tokenData.scope : ''

    if (!accessToken || !refreshToken) {
      await supabase.from('hubspot_oauth_states').delete().eq('state', state)
      return redirectToFrontend(frontendUrl, '/integrations', {
        hubspot_error: 'token_missing',
        hubspot_error_description: 'HubSpot did not return expected OAuth tokens.',
      })
    }

    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    // Fetch access token metadata (hub_id, scopes)
    let hubId: string | null = null
    let grantedScopes: string[] = scopeStr ? scopeStr.split(/[,\s]+/).filter(Boolean) : []
    try {
      const infoResp = await fetch(`https://api.hubapi.com/oauth/v1/access-tokens/${encodeURIComponent(accessToken)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (infoResp.ok) {
        const info = await infoResp.json()
        if (info?.hub_id != null) hubId = String(info.hub_id)
        if (Array.isArray(info?.scopes) && info.scopes.length) grantedScopes = info.scopes.map((s: any) => String(s))
      }
    } catch {
      // non-fatal
    }

    // Ensure we preserve a stable webhook_token per org
    const { data: existingIntegration } = await supabase
      .from('hubspot_org_integrations')
      .select('webhook_token, clerk_org_id')
      .eq('org_id', oauthState.org_id)
      .maybeSingle()

    const webhookToken = existingIntegration?.webhook_token || crypto.randomUUID()
    const clerkOrgId = (oauthState as any).clerk_org_id || existingIntegration?.clerk_org_id || null

    // Store credentials (service-role-only table)
    const { error: credsErr } = await supabase.from('hubspot_org_credentials').upsert(
      {
        org_id: oauthState.org_id,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id' }
    )

    if (credsErr) {
      await supabase.from('hubspot_oauth_states').delete().eq('state', state)
      return redirectToFrontend(frontendUrl, '/integrations', {
        hubspot_error: 'db_error',
        hubspot_error_description: `Failed to store credentials: ${credsErr.message}`,
      })
    }

    // Mark integration connected (non-sensitive table)
    const { error: integrationErr } = await supabase.from('hubspot_org_integrations').upsert(
      {
        org_id: oauthState.org_id,
        connected_by_user_id: oauthState.user_id,
        is_active: true,
        is_connected: true,
        connected_at: new Date().toISOString(),
        hubspot_portal_id: hubId,
        hubspot_hub_id: hubId,
        scopes: grantedScopes,
        webhook_token: webhookToken,
        clerk_org_id: clerkOrgId,
        last_sync_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id' }
    )

    if (integrationErr) {
      await supabase.from('hubspot_oauth_states').delete().eq('state', state)
      return redirectToFrontend(frontendUrl, '/integrations', {
        hubspot_error: 'db_error',
        hubspot_error_description: `Failed to store integration status: ${integrationErr.message}`,
      })
    }

    // Ensure settings + sync state rows exist (idempotent)
    await supabase
      .from('hubspot_settings')
      .upsert({ org_id: oauthState.org_id, clerk_org_id: clerkOrgId, settings: {} }, { onConflict: 'org_id' })
    await supabase
      .from('hubspot_org_sync_state')
      .upsert({ org_id: oauthState.org_id, clerk_org_id: clerkOrgId, sync_status: 'idle', cursors: {} }, { onConflict: 'org_id' })

    // Cleanup OAuth state (one-time use)
    await supabase.from('hubspot_oauth_states').delete().eq('state', state)

    const targetPath = typeof oauthState.redirect_uri === 'string' && oauthState.redirect_uri ? oauthState.redirect_uri : '/integrations'

    return redirectToFrontend(frontendUrl, targetPath, {
      hubspot_status: 'connected',
      hubspot_hub_id: hubId || '',
    })
  } catch (error) {
    await captureException(error, {
      tags: {
        function: 'hubspot-oauth-callback',
        integration: 'hubspot',
      },
    });
    return redirectToFrontend(frontendUrl, '/integrations', {
      hubspot_error: 'callback_failed',
      hubspot_error_description: error instanceof Error ? error.message : 'Unknown error',
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


