import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { captureException } from '../_shared/sentryEdge.ts'

/**
 * Attio OAuth Callback (org-scoped)
 *
 * Attio redirects the user to this public GET endpoint after authorization.
 * We validate the OAuth state from attio_oauth_states, exchange the code for
 * tokens, store credentials in attio_org_credentials, and mark the org
 * integration connected in attio_org_integrations.
 */

// State TTL in milliseconds (10 minutes)
const STATE_TTL_MS = 10 * 60 * 1000

serve(async (req) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 })

  const frontendUrl = Deno.env.get('FRONTEND_URL') || 'http://localhost:5175'

  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    if (error) {
      return redirectToFrontend(frontendUrl, '/integrations', {
        attio_error: error,
      })
    }

    if (!code || !state) {
      return redirectToFrontend(frontendUrl, '/integrations', {
        attio_error: 'invalid_request',
        attio_error_description: 'Missing code or state',
      })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: oauthState, error: stateError } = await supabase
      .from('attio_oauth_states')
      .select('user_id, org_id, clerk_org_id, redirect_uri, expires_at, created_at')
      .eq('state', state)
      .single()

    if (stateError || !oauthState) {
      return redirectToFrontend(frontendUrl, '/integrations', {
        attio_error: 'invalid_state',
        attio_error_description: 'Invalid or expired OAuth state. Please try again.',
      })
    }

    // Extra safety: TTL check (in case cleanup job hasn't run)
    const createdAt = oauthState.created_at ? new Date(oauthState.created_at) : null
    if (createdAt && Date.now() - createdAt.getTime() > STATE_TTL_MS) {
      await supabase.from('attio_oauth_states').delete().eq('state', state)
      return redirectToFrontend(frontendUrl, '/integrations', {
        attio_error: 'expired_state',
        attio_error_description: 'OAuth state expired. Please try again.',
      })
    }

    // Exchange code -> tokens
    const clientId = Deno.env.get('ATTIO_CLIENT_ID') || ''
    const clientSecret = Deno.env.get('ATTIO_CLIENT_SECRET') || ''
    const redirectUri = Deno.env.get('ATTIO_REDIRECT_URI') || ''

    if (!clientId || !clientSecret || !redirectUri) {
      return redirectToFrontend(frontendUrl, '/integrations', {
        attio_error: 'server_misconfigured',
        attio_error_description: 'Attio OAuth is not configured on the server.',
      })
    }

    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    })

    const tokenResp = await fetch('https://app.attio.com/oauth/token', {
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
      await supabase.from('attio_oauth_states').delete().eq('state', state)
      return redirectToFrontend(frontendUrl, '/integrations', {
        attio_error: 'token_exchange_failed',
        attio_error_description: tokenData?.message || tokenData?.error_description || 'Failed to exchange token',
      })
    }

    const accessToken = String(tokenData.access_token || '')
    const refreshToken = String(tokenData.refresh_token || '')
    const expiresIn = Number(tokenData.expires_in || 1800)
    const scopeStr = typeof tokenData.scope === 'string' ? tokenData.scope : ''

    if (!accessToken) {
      await supabase.from('attio_oauth_states').delete().eq('state', state)
      return redirectToFrontend(frontendUrl, '/integrations', {
        attio_error: 'token_missing',
        attio_error_description: 'Attio did not return expected OAuth tokens.',
      })
    }

    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
    const grantedScopes: string[] = scopeStr ? scopeStr.split(/[,\s]+/).filter(Boolean) : []

    // Fetch workspace info from Attio
    let workspaceId: string | null = null
    let workspaceName: string | null = null
    try {
      const selfResp = await fetch('https://api.attio.com/v2/self', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (selfResp.ok) {
        const selfData = await selfResp.json()
        if (selfData?.workspace?.id) workspaceId = String(selfData.workspace.id)
        if (selfData?.workspace?.name) workspaceName = String(selfData.workspace.name)
      }
    } catch {
      // non-fatal
    }

    // Ensure we preserve a stable webhook_secret per org
    const { data: existingIntegration } = await supabase
      .from('attio_org_integrations')
      .select('webhook_secret, clerk_org_id')
      .eq('org_id', oauthState.org_id)
      .maybeSingle()

    const webhookSecret = existingIntegration?.webhook_secret || crypto.randomUUID()
    const clerkOrgId = (oauthState as any).clerk_org_id || existingIntegration?.clerk_org_id || null

    // Store credentials (service-role-only table)
    const { error: credsErr } = await supabase.from('attio_org_credentials').upsert(
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
      await supabase.from('attio_oauth_states').delete().eq('state', state)
      return redirectToFrontend(frontendUrl, '/integrations', {
        attio_error: 'db_error',
        attio_error_description: `Failed to store credentials: ${credsErr.message}`,
      })
    }

    // Mark integration connected (non-sensitive table)
    const { error: integrationErr } = await supabase.from('attio_org_integrations').upsert(
      {
        org_id: oauthState.org_id,
        connected_by_user_id: oauthState.user_id,
        is_active: true,
        is_connected: true,
        connected_at: new Date().toISOString(),
        attio_workspace_id: workspaceId,
        attio_workspace_name: workspaceName,
        scopes: grantedScopes,
        webhook_secret: webhookSecret,
        clerk_org_id: clerkOrgId,
        last_sync_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id' }
    )

    if (integrationErr) {
      await supabase.from('attio_oauth_states').delete().eq('state', state)
      return redirectToFrontend(frontendUrl, '/integrations', {
        attio_error: 'db_error',
        attio_error_description: `Failed to store integration status: ${integrationErr.message}`,
      })
    }

    // Ensure settings row exists (idempotent)
    await supabase
      .from('attio_settings')
      .upsert({ org_id: oauthState.org_id, clerk_org_id: clerkOrgId, settings: {} }, { onConflict: 'org_id' })

    // Cleanup OAuth state (one-time use)
    await supabase.from('attio_oauth_states').delete().eq('state', state)

    const targetPath = typeof oauthState.redirect_uri === 'string' && oauthState.redirect_uri ? oauthState.redirect_uri : '/integrations'

    return redirectToFrontend(frontendUrl, targetPath, {
      attio_status: 'connected',
      attio_workspace_id: workspaceId || '',
    })
  } catch (error) {
    await captureException(error, {
      tags: {
        function: 'attio-oauth-callback',
        integration: 'attio',
      },
    });
    return redirectToFrontend(frontendUrl, '/integrations', {
      attio_error: 'callback_failed',
      attio_error_description: error instanceof Error ? error.message : 'Unknown error',
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
