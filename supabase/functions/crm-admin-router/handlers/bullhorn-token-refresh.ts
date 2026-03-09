// Handler: delegates to oauth-token-refresh/providers/bullhorn.ts
// Note: the original file uses Deno.serve directly, so we import and wrap the inner logic

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../../_shared/corsHelper.ts'
import { verifyCronSecret } from '../../_shared/edgeAuth.ts'
import {
  refreshTokens,
  exchangeAccessTokenForRestToken,
  isTokenExpired,
} from '../../_shared/bullhorn.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const BULLHORN_CLIENT_ID = Deno.env.get('BULLHORN_CLIENT_ID') || ''
const BULLHORN_CLIENT_SECRET = Deno.env.get('BULLHORN_CLIENT_SECRET') || ''

export async function handleBullhornTokenRefresh(req: Request): Promise<Response> {
  // Handle CORS preflight
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  // Auth: require cron secret
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!verifyCronSecret(req, cronSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const bufferMs = 300000 // 5 minutes

    const { data: credentials, error: credError } = await adminClient
      .from('bullhorn_org_credentials')
      .select('*')

    if (credError) {
      console.error('[bullhorn-token-refresh] Error fetching credentials:', credError)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!credentials || credentials.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No credentials to refresh', refreshed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results: Array<{ org_id: string; success: boolean; error?: string }> = []

    for (const cred of credentials) {
      try {
        const expiresAt = new Date(cred.expires_at).getTime()
        const needsRefresh = isTokenExpired(expiresAt, bufferMs)

        if (!needsRefresh) {
          results.push({ org_id: cred.org_id, success: true })
          continue
        }

        console.log(`[bullhorn-token-refresh] Refreshing tokens for org ${cred.org_id}`)

        const refreshResult = await refreshTokens(
          cred.refresh_token,
          BULLHORN_CLIENT_ID,
          BULLHORN_CLIENT_SECRET
        )

        const restResult = await exchangeAccessTokenForRestToken(refreshResult.access_token)

        const newExpiresAt = new Date(Date.now() + refreshResult.expires_in * 1000).toISOString()

        const { error: updateError } = await adminClient
          .from('bullhorn_org_credentials')
          .update({
            access_token: refreshResult.access_token,
            refresh_token: refreshResult.refresh_token,
            bh_rest_token: restResult.BhRestToken,
            rest_url: restResult.restUrl,
            expires_at: newExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq('org_id', cred.org_id)

        if (updateError) {
          throw new Error(`Failed to update credentials: ${updateError.message}`)
        }

        await adminClient
          .from('bullhorn_org_integrations')
          .update({
            last_token_refresh_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('org_id', cred.org_id)

        console.log(`[bullhorn-token-refresh] Successfully refreshed tokens for org ${cred.org_id}`)
        results.push({ org_id: cred.org_id, success: true })
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error'
        console.error(`[bullhorn-token-refresh] Error refreshing org ${cred.org_id}:`, errMsg)
        results.push({ org_id: cred.org_id, success: false, error: errMsg })

        if (errMsg.includes('invalid_grant') || errMsg.includes('Invalid refresh token')) {
          await adminClient
            .from('bullhorn_org_integrations')
            .update({
              is_connected: false,
              error_message: 'Token refresh failed - reconnection required',
              updated_at: new Date().toISOString(),
            })
            .eq('org_id', cred.org_id)
        }
      }
    }

    const refreshed = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success).length

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${credentials.length} integrations`,
        refreshed,
        failed,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[bullhorn-token-refresh] Unexpected error:', msg)
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}
