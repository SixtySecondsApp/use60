import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../../_shared/corsHelper.ts'

/**
 * LinkedIn Token Refresh (org-scoped)
 *
 * Proactively refreshes LinkedIn OAuth access tokens for all active org connections
 * whose tokens expire within 10 minutes. Called by Vercel cron or internal trigger.
 *
 * LinkedIn OAuth2 refresh endpoint:
 *   POST https://www.linkedin.com/oauth/v2/accessToken
 *   grant_type=refresh_token&refresh_token=...&client_id=...&client_secret=...
 *
 * LinkedIn access tokens expire after 60 days, refresh tokens after 365 days.
 *
 * Auth: cron secret (x-cron-secret header) or service role bearer token.
 */

const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'

export async function handleRefresh(req: Request): Promise<Response> {
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  const startTime = Date.now()
  const results: Array<{
    org_id: string
    status: 'refreshed' | 'skipped' | 'failed' | 'needs_reconnect'
    message: string
    expires_at?: string
  }> = []

  try {
    // Validate caller: cron secret or internal call
    const cronSecret = Deno.env.get('CRON_SECRET')
    const providedSecret = req.headers.get('x-cron-secret')
    const internalCall = req.headers.get('x-internal-call')
    const authHeader = req.headers.get('Authorization')

    const isAuthorized =
      (cronSecret && providedSecret === cronSecret) ||
      internalCall === 'true' ||
      (authHeader && authHeader.startsWith('Bearer '))

    if (!isAuthorized) {
      return errorResponse('Unauthorized', req, 401)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    const clientId = Deno.env.get('LINKEDIN_CLIENT_ID') || ''
    const clientSecret = Deno.env.get('LINKEDIN_CLIENT_SECRET') || ''

    if (!clientId || !clientSecret) {
      return errorResponse('Missing LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET', req, 500)
    }

    // Fetch active LinkedIn integrations with tokens
    const { data: integrations, error: fetchError } = await supabase
      .from('linkedin_org_integrations')
      .select('id, org_id, is_connected, access_token_encrypted, refresh_token_encrypted, token_expires_at')
      .eq('is_connected', true)
      .not('refresh_token_encrypted', 'is', null)

    if (fetchError) {
      throw new Error(`Failed to fetch integrations: ${fetchError.message}`)
    }

    if (!integrations || integrations.length === 0) {
      return jsonResponse({
        success: true,
        message: 'No active LinkedIn integrations to refresh',
        processed: 0,
      }, req)
    }

    const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    for (const row of integrations) {
      const orgId = String(row.org_id)
      const integrationId = String(row.id)

      try {
        const refreshToken = String(row.refresh_token_encrypted || '')
        if (!refreshToken) {
          results.push({ org_id: orgId, status: 'needs_reconnect', message: 'Missing refresh token' })
          continue
        }

        // Skip if token is not expiring within 10 minutes
        const expiresAt = row.token_expires_at ? new Date(row.token_expires_at) : null
        if (expiresAt && expiresAt.toISOString() > tenMinutesFromNow) {
          results.push({ org_id: orgId, status: 'skipped', message: 'Token not yet expiring' })
          continue
        }

        // Refresh the token
        const tokenParams = new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        })

        const tokenResp = await fetch(LINKEDIN_TOKEN_URL, {
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
          const msg = tokenData?.error_description || tokenData?.error || tokenText || 'Token refresh failed'
          const isPermanentFailure = tokenResp.status === 400 || tokenResp.status === 401

          if (isPermanentFailure) {
            // Mark integration as disconnected — user must reconnect
            try {
              await supabase
                .from('linkedin_org_integrations')
                .update({ is_connected: false, updated_at: new Date().toISOString() })
                .eq('id', integrationId)
            } catch { /* ignore */ }

            results.push({
              org_id: orgId,
              status: 'needs_reconnect',
              message: 'Refresh token expired/invalid; reconnect required',
            })
          } else {
            results.push({
              org_id: orgId,
              status: 'failed',
              message: `Token refresh failed (${tokenResp.status}): ${String(msg).slice(0, 200)}`,
            })
          }

          continue
        }

        // Success — update tokens on the integration row directly
        const accessToken = String(tokenData.access_token || '')
        const newRefreshToken = tokenData.refresh_token ? String(tokenData.refresh_token) : refreshToken
        // LinkedIn access tokens last 60 days but the API returns expires_in in seconds
        const expiresIn = Number(tokenData.expires_in || 5184000) // default 60 days
        const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

        const { error: updateError } = await supabase
          .from('linkedin_org_integrations')
          .update({
            access_token_encrypted: accessToken,
            refresh_token_encrypted: newRefreshToken,
            token_expires_at: tokenExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', integrationId)

        if (updateError) {
          results.push({ org_id: orgId, status: 'failed', message: `Database update failed: ${updateError.message}` })
          continue
        }

        results.push({ org_id: orgId, status: 'refreshed', message: 'Token refreshed', expires_at: tokenExpiresAt })
      } catch (e) {
        results.push({
          org_id: orgId,
          status: 'failed',
          message: e instanceof Error ? e.message : 'Unknown error',
        })
      }
    }

    const durationMs = Date.now() - startTime
    return jsonResponse({
      success: true,
      processed: results.length,
      summary: {
        refreshed: results.filter((r) => r.status === 'refreshed').length,
        skipped: results.filter((r) => r.status === 'skipped').length,
        failed: results.filter((r) => r.status === 'failed').length,
        needs_reconnect: results.filter((r) => r.status === 'needs_reconnect').length,
        duration_ms: durationMs,
      },
      results,
    }, req)
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      req,
      500
    )
  }
}
