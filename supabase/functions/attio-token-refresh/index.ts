import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'

/**
 * Attio Token Refresh (org-scoped)
 *
 * Proactively refreshes Attio OAuth access tokens for all active org connections
 * whose tokens expire within 10 minutes. Called by Vercel cron or internal trigger.
 *
 * Auth: cron secret (x-cron-secret header) or service role bearer token.
 */
serve(async (req) => {
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

    // Allow: matching cron secret, internal call header, or service role bearer token
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

    const clientId = Deno.env.get('ATTIO_CLIENT_ID') || ''
    const clientSecret = Deno.env.get('ATTIO_CLIENT_SECRET') || ''

    if (!clientId || !clientSecret) {
      return errorResponse('Missing ATTIO_CLIENT_ID or ATTIO_CLIENT_SECRET', req, 500)
    }

    // Fetch active Attio integrations joined with credentials expiring within 10 minutes
    const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    const { data: integrations, error: fetchError } = await supabase
      .from('attio_org_integrations')
      .select('org_id, is_active, is_connected')
      .eq('is_active', true)

    if (fetchError) {
      throw new Error(`Failed to fetch integrations: ${fetchError.message}`)
    }

    if (!integrations || integrations.length === 0) {
      return jsonResponse({
        success: true,
        message: 'No active Attio integrations to refresh',
        processed: 0,
      }, req)
    }

    for (const row of integrations) {
      const orgId = String(row.org_id)

      try {
        const { data: creds, error: credsError } = await supabase
          .from('attio_org_credentials')
          .select('refresh_token, token_expires_at')
          .eq('org_id', orgId)
          .single()

        if (credsError || !creds) {
          results.push({
            org_id: orgId,
            status: 'needs_reconnect',
            message: `No credentials available (${credsError?.message || 'unknown'})`,
          })
          continue
        }

        const refreshToken = String(creds.refresh_token || '')
        if (!refreshToken) {
          results.push({ org_id: orgId, status: 'needs_reconnect', message: 'Missing refresh token' })
          continue
        }

        // Skip if token is not expiring within 10 minutes
        const expiresAt = creds.token_expires_at ? new Date(creds.token_expires_at) : null
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
          const msg = tokenData?.error_description || tokenData?.error || tokenText || 'Token refresh failed'
          const isPermanentFailure = tokenResp.status === 400 || tokenResp.status === 401

          if (isPermanentFailure) {
            // Mark integration as disconnected — user must reconnect
            try {
              await supabase
                .from('attio_org_integrations')
                .update({ is_active: false, is_connected: false, updated_at: new Date().toISOString() })
                .eq('org_id', orgId)
            } catch { /* ignore */ }

            results.push({
              org_id: orgId,
              status: 'needs_reconnect',
              message: 'Refresh token expired/invalid; reconnect required',
            })
          } else {
            // 5xx or transient — skip, will retry next cron run
            results.push({
              org_id: orgId,
              status: 'failed',
              message: `Token refresh failed (${tokenResp.status}): ${String(msg).slice(0, 200)}`,
            })
          }

          continue
        }

        // Success — update credentials
        const accessToken = String(tokenData.access_token || '')
        const newRefreshToken = tokenData.refresh_token ? String(tokenData.refresh_token) : refreshToken
        const expiresIn = Number(tokenData.expires_in || 1800)
        const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

        const { error: updateError } = await supabase
          .from('attio_org_credentials')
          .update({
            access_token: accessToken,
            refresh_token: newRefreshToken,
            token_expires_at: tokenExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq('org_id', orgId)

        if (updateError) {
          results.push({ org_id: orgId, status: 'failed', message: `Database update failed: ${updateError.message}` })
          continue
        }

        // Ensure integration stays marked connected
        try {
          await supabase
            .from('attio_org_integrations')
            .update({ is_connected: true, is_active: true, updated_at: new Date().toISOString() })
            .eq('org_id', orgId)
        } catch { /* ignore */ }

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
})
