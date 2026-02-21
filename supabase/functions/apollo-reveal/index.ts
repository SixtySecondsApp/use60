import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders } from '../_shared/corsHelper.ts'
import { logFlatRateCostEvent, checkCreditBalance } from '../_shared/costTracking.ts'

/**
 * apollo-reveal — Unmask Apollo search results by calling /people/bulk_match.
 *
 * Apollo's /people/search API masks last names (****). This function accepts
 * a list of apollo_ids and returns the full name + verified email for each,
 * using the org's configured Apollo API key.
 *
 * POST body: { apollo_ids: string[] }
 * Response:  { people: Array<{ apollo_id, full_name, first_name, last_name, email, title, company }> }
 */

const APOLLO_API_BASE = 'https://api.apollo.io/api/v1'

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
      )
    }

    // Auth: validate JWT
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
      )
    }

    // Get org membership
    const { data: membership } = await userClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return new Response(
        JSON.stringify({ error: 'No organization found' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
      )
    }

    // Get Apollo API key from org's integration credentials
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: creds } = await serviceClient
      .from('integration_credentials')
      .select('credentials')
      .eq('organization_id', membership.org_id)
      .eq('provider', 'apollo')
      .maybeSingle()

    const apolloApiKey = (creds?.credentials as Record<string, string>)?.api_key
      || Deno.env.get('APOLLO_API_KEY')

    if (!apolloApiKey) {
      return new Response(
        JSON.stringify({ error: 'Apollo not configured', code: 'APOLLO_NOT_CONFIGURED' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
      )
    }

    // Credit balance pre-flight check
    const balanceCheck = await checkCreditBalance(serviceClient, membership.org_id)
    if (!balanceCheck.allowed) {
      return new Response(
        JSON.stringify({ error: 'Insufficient credits', code: 'INSUFFICIENT_CREDITS' }),
        { status: 402, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
      )
    }

    const { apollo_ids } = await req.json() as { apollo_ids: string[] }
    if (!apollo_ids?.length) {
      return new Response(
        JSON.stringify({ error: 'apollo_ids is required' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
      )
    }

    // Call Apollo bulk_match with just IDs — returns full unmasked names + emails
    const details = apollo_ids.slice(0, 10).map(id => ({ id }))
    const response = await fetch(`${APOLLO_API_BASE}/people/bulk_match`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apolloApiKey,
      },
      body: JSON.stringify({ details }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Apollo API ${response.status}: ${errorText.slice(0, 200)}`)
    }

    const result = await response.json()
    const matches = (result.matches ?? result.people ?? []) as Array<Record<string, unknown> | null>

    const people = matches
      .map((p, idx) => {
        if (!p) return null
        const org = p.organization as Record<string, unknown> | null
        return {
          apollo_id: (p.id as string) || apollo_ids[idx],
          first_name: (p.first_name as string) || '',
          last_name: (p.last_name as string) || '',
          full_name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
          email: (p.email as string) || null,
          title: (p.title as string) || null,
          company: (org?.name as string) || (p.organization_name as string) || null,
          linkedin_url: (p.linkedin_url as string) || null,
        }
      })
      .filter(Boolean)

    // Deduct credits for successful reveal
    await logFlatRateCostEvent(
      serviceClient,
      user.id,
      membership.org_id,
      'apollo',
      'apollo-reveal',
      0.3,
      'apollo_enrichment',
    )

    return new Response(
      JSON.stringify({ people }),
      { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    )
  } catch (error: unknown) {
    console.error('[apollo-reveal] Error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? 'Internal error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    )
  }
})
