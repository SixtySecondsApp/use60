import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * HubSpot Token Refresh (org-scoped)
 *
 * Purpose:
 * - Proactively refresh HubSpot access tokens for all active org connections.
 * - Keeps connections healthy without user intervention.
 *
 * Notes:
 * - Should be called by a cron (Vercel cron or Supabase scheduled trigger).
 * - Uses service role.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const startTime = Date.now()
  const results: Array<{
    org_id: string
    status: 'refreshed' | 'skipped' | 'failed' | 'needs_reconnect'
    message: string
    expires_at?: string
  }> = []

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const clientId = Deno.env.get('HUBSPOT_CLIENT_ID') || ''
    const clientSecret = Deno.env.get('HUBSPOT_CLIENT_SECRET') || ''

    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ success: false, error: 'Missing HUBSPOT_CLIENT_ID or HUBSPOT_CLIENT_SECRET' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: integrations, error: fetchError } = await supabase
      .from('hubspot_org_integrations')
      .select('org_id, is_active, is_connected')
      .eq('is_active', true)

    if (fetchError) {
      throw new Error(`Failed to fetch integrations: ${fetchError.message}`)
    }

    if (!integrations || integrations.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No active HubSpot integrations to refresh', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    for (const row of integrations as any[]) {
      const orgId = String(row.org_id)

      try {
        const { data: creds, error: credsError } = await supabase
          .from('hubspot_org_credentials')
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

        const refreshToken = String((creds as any).refresh_token || '')
        if (!refreshToken) {
          results.push({ org_id: orgId, status: 'needs_reconnect', message: 'Missing refresh token' })
          continue
        }

        // Refresh proactively (daily). If desired, this can be gated by expiry window.
        const tokenParams = new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
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
          const msg = tokenData?.message || tokenData?.error_description || tokenText || 'Token refresh failed'
          const isPermFailure =
            String(tokenData?.error || '').includes('invalid_grant') ||
            String(msg).toLowerCase().includes('invalid_grant') ||
            tokenResp.status === 400

          if (isPermFailure) {
            // Mark integration as disconnected/inactive (user must reconnect)
            try {
              await supabase
                .from('hubspot_org_integrations')
                .update({ is_active: false, is_connected: false, updated_at: new Date().toISOString() })
                .eq('org_id', orgId)
            } catch { /* ignore */ }

            results.push({ org_id: orgId, status: 'needs_reconnect', message: 'Refresh token expired/invalid; reconnect required' })
          } else {
            results.push({ org_id: orgId, status: 'failed', message: `Token refresh failed: ${String(msg).slice(0, 200)}` })
          }

          continue
        }

        const accessToken = String(tokenData.access_token || '')
        const newRefreshToken = tokenData.refresh_token ? String(tokenData.refresh_token) : refreshToken
        const expiresIn = Number(tokenData.expires_in || 1800)
        const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

        const { error: updateError } = await supabase
          .from('hubspot_org_credentials')
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
            .from('hubspot_org_integrations')
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
    return new Response(
      JSON.stringify({
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
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})


