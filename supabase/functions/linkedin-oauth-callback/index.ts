import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { captureException } from '../_shared/sentryEdge.ts'

/**
 * LinkedIn OAuth Callback (org-scoped)
 *
 * LinkedIn redirects the user to this public GET endpoint after authorization.
 * We validate the OAuth state, exchange the code for tokens, store credentials
 * in integration_credentials, and mark the org integration connected.
 */

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
        linkedin_error: error,
        linkedin_error_description: errorDescription || '',
      })
    }

    if (!code || !state) {
      return redirectToFrontend(frontendUrl, '/integrations', {
        linkedin_error: 'invalid_request',
        linkedin_error_description: 'Missing code or state',
      })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Validate CSRF state
    const { data: oauthState, error: stateError } = await supabase
      .from('linkedin_oauth_states')
      .select('user_id, org_id, redirect_uri, expires_at, created_at')
      .eq('state', state)
      .single()

    if (stateError || !oauthState) {
      return redirectToFrontend(frontendUrl, '/integrations', {
        linkedin_error: 'invalid_state',
        linkedin_error_description: 'Invalid or expired OAuth state. Please try again.',
      })
    }

    // TTL check
    const createdAt = oauthState.created_at ? new Date(oauthState.created_at) : null
    if (createdAt && Date.now() - createdAt.getTime() > STATE_TTL_MS) {
      await supabase.from('linkedin_oauth_states').delete().eq('state', state)
      return redirectToFrontend(frontendUrl, '/integrations', {
        linkedin_error: 'expired_state',
        linkedin_error_description: 'OAuth state expired. Please try again.',
      })
    }

    // Exchange code for tokens
    const clientId = Deno.env.get('LINKEDIN_CLIENT_ID') || ''
    const clientSecret = Deno.env.get('LINKEDIN_CLIENT_SECRET') || ''
    const redirectUri = Deno.env.get('LINKEDIN_REDIRECT_URI') || ''

    if (!clientId || !clientSecret || !redirectUri) {
      return redirectToFrontend(frontendUrl, '/integrations', {
        linkedin_error: 'server_misconfigured',
        linkedin_error_description: 'LinkedIn OAuth is not configured on the server.',
      })
    }

    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    })

    const tokenResp = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    })

    const tokenText = await tokenResp.text()
    let tokenData: Record<string, unknown>
    try {
      tokenData = JSON.parse(tokenText)
    } catch {
      tokenData = { raw: tokenText }
    }

    if (!tokenResp.ok) {
      await supabase.from('linkedin_oauth_states').delete().eq('state', state)
      return redirectToFrontend(frontendUrl, '/integrations', {
        linkedin_error: 'token_exchange_failed',
        linkedin_error_description: String(tokenData?.error_description || tokenData?.error || 'Failed to exchange token'),
      })
    }

    const accessToken = String(tokenData.access_token || '')
    const refreshToken = String(tokenData.refresh_token || '')
    const expiresIn = Number(tokenData.expires_in || 5184000) // LinkedIn default: 60 days
    const scope = typeof tokenData.scope === 'string' ? tokenData.scope : ''

    if (!accessToken) {
      await supabase.from('linkedin_oauth_states').delete().eq('state', state)
      return redirectToFrontend(frontendUrl, '/integrations', {
        linkedin_error: 'token_missing',
        linkedin_error_description: 'LinkedIn did not return expected OAuth tokens.',
      })
    }

    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
    const grantedScopes = scope ? scope.split(/[,\s]+/).filter(Boolean) : []

    // Fetch ad accounts to show user which account was connected
    let adAccountId: string | null = null
    let adAccountName: string | null = null
    try {
      const adAccountsResp = await fetch(
        'https://api.linkedin.com/rest/adAccounts?q=search&search=(status:(values:List(ACTIVE)))&count=1',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'LinkedIn-Version': '202402',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      )
      if (adAccountsResp.ok) {
        const adData = await adAccountsResp.json()
        const firstAccount = adData?.elements?.[0]
        if (firstAccount) {
          adAccountId = firstAccount.id ? String(firstAccount.id) : null
          adAccountName = firstAccount.name || null
        }
      }
    } catch {
      // Non-fatal — user can still configure later
    }

    // Store credentials in integration_credentials (sensitive, service-role-only)
    const { error: credsErr } = await supabase
      .from('integration_credentials')
      .upsert(
        {
          organization_id: oauthState.org_id,
          provider: 'linkedin',
          credentials: {
            access_token: accessToken,
            refresh_token: refreshToken,
            token_expires_at: tokenExpiresAt,
            scopes: grantedScopes,
            client_secret: clientSecret,
            webhook_subscription_ids: [],
          },
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,provider' }
      )

    if (credsErr) {
      await supabase.from('linkedin_oauth_states').delete().eq('state', state)
      return redirectToFrontend(frontendUrl, '/integrations', {
        linkedin_error: 'db_error',
        linkedin_error_description: `Failed to store credentials: ${credsErr.message}`,
      })
    }

    // Mark integration connected (non-sensitive metadata table)
    const { error: integrationErr } = await supabase
      .from('linkedin_org_integrations')
      .upsert(
        {
          org_id: oauthState.org_id,
          connected_by_user_id: oauthState.user_id,
          is_active: true,
          is_connected: true,
          connected_at: new Date().toISOString(),
          linkedin_ad_account_id: adAccountId,
          linkedin_ad_account_name: adAccountName,
          scopes: grantedScopes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id' }
      )

    if (integrationErr) {
      console.error('Failed to store integration status:', integrationErr)
      // Non-fatal — credentials are stored, integration will work
    }

    // Cleanup OAuth state (one-time use)
    await supabase.from('linkedin_oauth_states').delete().eq('state', state)

    const targetPath = typeof oauthState.redirect_uri === 'string' && oauthState.redirect_uri
      ? oauthState.redirect_uri
      : '/integrations'

    return redirectToFrontend(frontendUrl, targetPath, {
      linkedin_status: 'connected',
      linkedin_account: adAccountName || '',
    })
  } catch (error) {
    await captureException(error, {
      tags: { function: 'linkedin-oauth-callback', integration: 'linkedin' },
    })
    return redirectToFrontend(frontendUrl, '/integrations', {
      linkedin_error: 'callback_failed',
      linkedin_error_description: error instanceof Error ? error.message : 'Unknown error',
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
