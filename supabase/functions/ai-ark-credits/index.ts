import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

const AI_ARK_API_BASE = 'https://api.ai-ark.com/api/developer-portal/v1'

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  const headers = { ...getCorsHeaders(req), 'Content-Type': 'application/json' }

  try {
    // Auth — support both Authorization header and _auth_token in body
    const body = await req.json().catch(() => ({}))
    const { _auth_token, skip_probe } = body as { _auth_token?: string; skip_probe?: boolean }
    const authHeader = req.headers.get('Authorization')
    const bearerToken = authHeader || (_auth_token ? `Bearer ${_auth_token}` : null)

    if (!bearerToken) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401, headers })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: bearerToken } },
    })

    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers })
    }

    // Org lookup
    const { data: membership } = await userClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return new Response(JSON.stringify({ error: 'No organization found' }), { status: 400, headers })
    }

    // API key from integration_credentials
    const serviceClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: integration } = await serviceClient
      .from('integration_credentials')
      .select('credentials')
      .eq('organization_id', membership.org_id)
      .eq('provider', 'ai_ark')
      .maybeSingle()

    const aiArkApiKey = (integration?.credentials as Record<string, string>)?.api_key
    if (!aiArkApiKey) {
      return new Response(
        JSON.stringify({ error: 'AI Ark not configured', code: 'AI_ARK_NOT_CONFIGURED' }),
        { status: 400, headers }
      )
    }

    // If skip_probe is true, return config-only response without consuming credits
    if (skip_probe) {
      return new Response(JSON.stringify({
        configured: true,
        credits_consumed_by_probe: null,
        rate_limit: null,
        warning: null,
        source: 'config_check_only',
      }), { status: 200, headers })
    }

    // Probe: minimal company search to read credit/rate-limit headers.
    // There is no free balance endpoint — every API call costs credits.
    // A company search with size=1 costs ~2.5 credits.
    try {
      const probeResponse = await fetch(`${AI_ARK_API_BASE}/companies`, {
        method: 'POST',
        headers: {
          'X-TOKEN': aiArkApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ page: 0, size: 1 }),
      })

      if (!probeResponse.ok) {
        const errorBody = await probeResponse.text().catch(() => '')
        console.error('[ai-ark-credits] Probe search failed:', probeResponse.status, errorBody)
        return new Response(JSON.stringify({
          configured: true,
          credits_consumed_by_probe: null,
          rate_limit: null,
          warning: `Probe search failed with status ${probeResponse.status}. API key may be invalid or expired.`,
          source: 'probe_failed',
        }), { status: 200, headers })
      }

      // Parse rate limit and credit headers
      const creditHeader = probeResponse.headers.get('x-credit')
      const creditsConsumed = creditHeader ? parseFloat(creditHeader) : null

      const limitPerSecond = probeResponse.headers.get('x-ratelimit-limit-second')
        ?? probeResponse.headers.get('ratelimit-limit')
      const remainingPerSecond = probeResponse.headers.get('x-ratelimit-remaining-second')
        ?? probeResponse.headers.get('ratelimit-remaining')
      const resetSeconds = probeResponse.headers.get('ratelimit-reset')

      return new Response(JSON.stringify({
        configured: true,
        credits_consumed_by_probe: creditsConsumed,
        rate_limit: {
          limit_per_second: limitPerSecond ? parseInt(limitPerSecond, 10) : null,
          remaining_per_second: remainingPerSecond ? parseInt(remainingPerSecond, 10) : null,
          remaining: probeResponse.headers.get('ratelimit-remaining')
            ? parseInt(probeResponse.headers.get('ratelimit-remaining')!, 10)
            : null,
          reset_seconds: resetSeconds ? parseInt(resetSeconds, 10) : null,
        },
        warning: 'No free balance endpoint available. This check consumed ~2.5 credits.',
        source: 'probe_search',
      }), { status: 200, headers })
    } catch (e) {
      console.error('[ai-ark-credits] Probe request failed:', e)
      return new Response(JSON.stringify({
        configured: true,
        credits_consumed_by_probe: null,
        rate_limit: null,
        warning: `Probe request failed: ${(e as Error).message}`,
        source: 'probe_error',
      }), { status: 200, headers })
    }
  } catch (error) {
    console.error('[ai-ark-credits] Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message || 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
