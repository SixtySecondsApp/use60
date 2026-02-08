import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * apollo-credits — Fetch Apollo API credit/usage info for the org.
 *
 * Tries two strategies:
 *   1. POST /api/v1/usage_stats/api_usage_stats (requires master key)
 *   2. Lightweight search call to capture rate limit headers
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Get org
    const { data: membership } = await userClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return new Response(
        JSON.stringify({ error: 'No organization found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Get Apollo API key
    const serviceClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const { data: integration } = await serviceClient
      .from('integration_credentials')
      .select('credentials')
      .eq('organization_id', membership.org_id)
      .eq('provider', 'apollo')
      .maybeSingle()

    const apolloApiKey = (integration?.credentials as Record<string, string>)?.api_key
      || Deno.env.get('APOLLO_API_KEY')

    if (!apolloApiKey) {
      return new Response(
        JSON.stringify({ error: 'Apollo API key not configured', code: 'APOLLO_NOT_CONFIGURED' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Strategy 1: Try usage_stats endpoint (needs master key)
    const usageResponse = await fetch('https://api.apollo.io/api/v1/usage_stats/api_usage_stats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apolloApiKey,
      },
      body: JSON.stringify({}),
    })

    if (usageResponse.ok) {
      const usageData = await usageResponse.json()
      console.log('[apollo-credits] usage_stats raw response:', JSON.stringify(usageData))
      return new Response(
        JSON.stringify({
          source: 'usage_stats',
          raw: usageData,
          ...usageData,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    console.log('[apollo-credits] usage_stats returned:', usageResponse.status)

    // Strategy 2: Minimal search to capture rate limit headers
    const probeResponse = await fetch('https://api.apollo.io/v1/mixed_people/api_search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apolloApiKey,
        per_page: 1,
        page: 1,
        q_keywords: 'test',
      }),
    })

    // Extract rate limit headers
    const rateLimits: Record<string, string | null> = {}
    for (const [key, value] of probeResponse.headers.entries()) {
      if (key.toLowerCase().includes('rate') || key.toLowerCase().includes('limit') || key.toLowerCase().includes('credit') || key.toLowerCase().includes('remaining')) {
        rateLimits[key] = value
      }
    }

    // Also check for credit info in the body
    const probeData = probeResponse.ok ? await probeResponse.json() : null
    const pagination = probeData?.pagination ?? null

    return new Response(
      JSON.stringify({
        source: 'rate_headers',
        rate_limits: Object.keys(rateLimits).length > 0 ? rateLimits : null,
        pagination,
        usage_stats_status: usageResponse.status,
        usage_stats_message: usageResponse.status === 403
          ? 'Usage stats require a master API key. Generate one at app.apollo.io > Settings > Integrations > API.'
          : `Usage stats returned ${usageResponse.status}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('[apollo-credits] Error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
