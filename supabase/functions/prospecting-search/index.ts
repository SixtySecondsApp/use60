import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'
import { checkCreditBalance } from '../_shared/costTracking.ts'
import { classifyLeads, extractDomainFromEmail } from '../_shared/classifyLeadStatus.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProspectingSearchRequest {
  icp_profile_id?: string
  parent_icp_id?: string
  profile_type?: 'icp' | 'persona'
  provider: 'apollo' | 'ai_ark'
  action?: 'people_search' | 'company_search'
  search_params: Record<string, unknown>
  page?: number
  per_page?: number
}

// Known credit costs per provider request (from MEMORY.md)
const CREDIT_COSTS: Record<string, number> = {
  apollo: 0.10,         // Apollo people search cost per request
  ai_ark_company: 2.5,  // AI Ark company search: -2.5 credits
  ai_ark_people: 12.5,  // AI Ark people search: -12.5 credits
}

function estimateCreditCost(provider: string, action?: string): number {
  if (provider === 'ai_ark') {
    return action === 'company_search'
      ? CREDIT_COSTS.ai_ark_company
      : CREDIT_COSTS.ai_ark_people
  }
  return CREDIT_COSTS.apollo
}

// ---------------------------------------------------------------------------
// Edge function
// ---------------------------------------------------------------------------

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  const cors = getCorsHeaders(req)
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  try {
    // ------------------------------------------------------------------
    // 1. Auth: validate JWT
    // ------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Missing authorization', code: 'UNAUTHORIZED' }, 401)
    }

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) {
      return json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
    }

    // ------------------------------------------------------------------
    // 2. Org: look up user's organization
    // ------------------------------------------------------------------
    const { data: membership } = await anonClient
      .from('organization_memberships')
      .select('org_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return json({ error: 'Not a member of any organization', code: 'NO_ORG' }, 403)
    }

    const orgId = membership.org_id

    // ------------------------------------------------------------------
    // 3. Parse request body
    // ------------------------------------------------------------------
    const body = (await req.json()) as ProspectingSearchRequest
    const { icp_profile_id, parent_icp_id, profile_type, provider, action, search_params, page = 1, per_page = 25 } = body

    if (!provider || !['apollo', 'ai_ark'].includes(provider)) {
      return json({ error: 'Invalid provider. Must be "apollo" or "ai_ark".', code: 'INVALID_PARAMS' }, 400)
    }

    if (provider === 'ai_ark' && (!action || !['people_search', 'company_search'].includes(action))) {
      return json({ error: 'AI Ark requires action: "people_search" or "company_search".', code: 'INVALID_PARAMS' }, 400)
    }

    if (!search_params || Object.keys(search_params).length === 0) {
      return json({ error: 'search_params is required and cannot be empty.', code: 'INVALID_PARAMS' }, 400)
    }

    // ------------------------------------------------------------------
    // 4. Credit check
    // ------------------------------------------------------------------
    const estimatedCost = estimateCreditCost(provider, action)
    const creditCheck = await checkCreditBalance(anonClient, orgId)

    if (!creditCheck.allowed) {
      return json({
        error: 'Insufficient credits',
        code: 'INSUFFICIENT_CREDITS',
        message: creditCheck.message || 'Your organization has run out of credits. Please top up to continue.',
        balance: creditCheck.balance,
        estimated_cost: estimatedCost,
      }, 402)
    }

    // ------------------------------------------------------------------
    // 5. Get provider credentials (service role to bypass RLS)
    // ------------------------------------------------------------------
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const providerKey = provider === 'apollo' ? 'apollo' : 'ai_ark'
    const { data: integration } = await serviceClient
      .from('integration_credentials')
      .select('credentials')
      .eq('organization_id', orgId)
      .eq('provider', providerKey)
      .maybeSingle()

    const apiKey = (integration?.credentials as Record<string, string>)?.api_key

    if (!apiKey) {
      const providerName = provider === 'apollo' ? 'Apollo' : 'AI Ark'
      return json({
        error: `${providerName} API key not configured. Please add your ${providerName} API key in Settings > Integrations.`,
        code: 'PROVIDER_NOT_CONFIGURED',
      }, 400)
    }

    // ------------------------------------------------------------------
    // 6. Server-to-server search call
    // ------------------------------------------------------------------
    const startTime = Date.now()
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    let searchResponse: Response

    if (provider === 'apollo') {
      // Call apollo-search edge function
      const apolloPayload = {
        ...search_params,
        page,
        per_page: Math.min(per_page, 100),
        _skip_credit_deduction: true,
      }

      searchResponse = await fetch(`${supabaseUrl}/functions/v1/apollo-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify(apolloPayload),
      })
    } else {
      // Call ai-ark-search edge function
      const aiArkPayload = {
        action,
        ...search_params,
        page,
        per_page: Math.min(per_page, 100),
        _skip_credit_deduction: true,
      }

      searchResponse = await fetch(`${supabaseUrl}/functions/v1/ai-ark-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify(aiArkPayload),
      })
    }

    const durationMs = Date.now() - startTime

    // ------------------------------------------------------------------
    // 7. Handle search response
    // ------------------------------------------------------------------
    if (!searchResponse.ok) {
      const errorBody = await searchResponse.text()
      console.error(`[prospecting-search] ${provider} error:`, searchResponse.status, errorBody)

      // Pass through rate limit headers
      if (searchResponse.status === 429) {
        const retryAfter = searchResponse.headers.get('Retry-After')
        const headers: Record<string, string> = { ...cors, 'Content-Type': 'application/json' }
        if (retryAfter) headers['Retry-After'] = retryAfter
        return new Response(
          JSON.stringify({
            error: `${provider === 'apollo' ? 'Apollo' : 'AI Ark'} rate limit exceeded. Please wait and try again.`,
            code: 'RATE_LIMITED',
          }),
          { status: 429, headers }
        )
      }

      // Parse error body if possible
      let parsedError: Record<string, unknown> = {}
      try {
        parsedError = JSON.parse(errorBody)
      } catch {
        parsedError = { details: errorBody }
      }

      return json({
        error: (parsedError.error as string) || `${provider} search failed`,
        code: (parsedError.code as string) || 'SEARCH_ERROR',
        details: parsedError.details || undefined,
      }, searchResponse.status >= 400 && searchResponse.status < 500 ? searchResponse.status : 500)
    }

    const searchData = await searchResponse.json()

    // Normalize the response shape across providers
    const results = searchData.contacts || searchData.companies || []
    const pagination = searchData.pagination || {}
    const totalResults = pagination.total ?? results.length
    const hasMore = pagination.has_more ?? false
    const creditsFromProvider = searchData.credits_consumed ?? null

    // Actual credits consumed (use provider-reported if available)
    const creditsConsumed = creditsFromProvider ?? estimatedCost

    // ------------------------------------------------------------------
    // 8. Deduct credits
    // ------------------------------------------------------------------
    try {
      await serviceClient.rpc('deduct_credits', {
        p_org_id: orgId,
        p_amount: creditsConsumed,
        p_description: `Prospecting search: ${provider}${action ? ` (${action})` : ''}`,
        p_feature_key: 'prospecting_search',
      })
    } catch (err) {
      console.warn('[prospecting-search] Credit deduction error (non-blocking):', err)
    }

    // ------------------------------------------------------------------
    // 9. Log to icp_search_history
    // ------------------------------------------------------------------
    try {
      await serviceClient
        .from('icp_search_history')
        .insert({
          icp_profile_id: icp_profile_id || null,
          organization_id: orgId,
          searched_by: user.id,
          provider: providerKey,
          search_params,
          result_count: totalResults,
          credits_consumed: creditsConsumed,
          duration_ms: durationMs,
        })
    } catch (err) {
      console.warn('[prospecting-search] Failed to log search history:', err)
    }

    // ------------------------------------------------------------------
    // 10. Update ICP profile (if linked)
    // ------------------------------------------------------------------
    if (icp_profile_id) {
      try {
        await serviceClient
          .from('icp_profiles')
          .update({
            last_tested_at: new Date().toISOString(),
            last_test_result_count: totalResults,
          })
          .eq('id', icp_profile_id)
          .eq('organization_id', orgId)
      } catch (err) {
        console.warn('[prospecting-search] Failed to update ICP profile:', err)
      }
    }

    // ------------------------------------------------------------------
    // 11. Classify leads (net_new, uncontacted, contacted_no_deal, existing_with_deal)
    // ------------------------------------------------------------------
    let enrichedResults = results;
    try {
      const leadsToClassify = results
        .filter((r: any) => r.email)
        .map((r: any) => ({
          email: r.email,
          company_domain: r.organization?.website_url || r.organization_website_url || extractDomainFromEmail(r.email),
        }));

      if (leadsToClassify.length > 0) {
        const classifications = await classifyLeads(serviceClient, orgId, leadsToClassify);

        enrichedResults = results.map((r: any) => {
          if (!r.email) return r;

          const classification = classifications.get(r.email);
          return {
            ...r,
            classification: classification?.classification || 'net_new',
            has_active_deal: classification?.has_active_deal || false,
            contact_id: classification?.contact_id || null,
          };
        });

        console.log(`[prospecting-search] Classified ${leadsToClassify.length} leads`);
      }
    } catch (classifyError) {
      console.error('[prospecting-search] Classification error (non-blocking):', classifyError);
      // If classification fails, return results without classification
    }

    // ------------------------------------------------------------------
    // 12. Return unified response
    // ------------------------------------------------------------------
    const searchChained = !!(profile_type === 'persona' && parent_icp_id);

    return json({
      results: enrichedResults,
      total_results: totalResults,
      credits_consumed: creditsConsumed,
      page,
      per_page: Math.min(per_page, 100),
      has_more: hasMore,
      provider,
      action: action || (provider === 'apollo' ? 'people_search' : undefined),
      duration_ms: durationMs,
      icp_profile_id: icp_profile_id || null,
      search_chained: searchChained, // Telemetry: persona with parent_icp_id (chained not yet implemented for external providers)
      parent_icp_id: searchChained ? parent_icp_id : null,
    })
  } catch (error) {
    console.error('[prospecting-search] Unexpected error:', error)
    return json({
      error: (error as Error).message || 'Internal server error',
      code: 'INTERNAL_ERROR',
    }, 500)
  }
})
