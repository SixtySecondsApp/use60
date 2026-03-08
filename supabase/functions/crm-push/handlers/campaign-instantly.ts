import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../../_shared/corsHelper.ts'

const INSTANTLY_API_BASE = 'https://api.instantly.ai/api/v1'
const INSTANTLY_TIMEOUT_MS = 15_000

interface PushCampaignRequest {
  campaign_name: string
  contacts: Array<{
    email: string
    first_name?: string
    last_name?: string
    company_name?: string
    title?: string
    linkedin_url?: string
    demo_link?: string
  }>
}

export async function handleCampaignInstantly(req: Request): Promise<Response> {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  try {
    // -----------------------------------------------------------------------
    // 1. Authenticate user
    // -----------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Missing authorization header', req, 401)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', req, 401)
    }

    // Get user's org membership
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: membership } = await serviceClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return errorResponse('No organization found', req, 403)
    }

    // -----------------------------------------------------------------------
    // 2. Get org Instantly API key
    // -----------------------------------------------------------------------
    const { data: instantlyCreds } = await serviceClient
      .from('instantly_org_credentials')
      .select('api_key')
      .eq('org_id', membership.org_id)
      .maybeSingle()

    let instantlyApiKey = instantlyCreds?.api_key || null

    if (!instantlyApiKey) {
      const { data: integration } = await serviceClient
        .from('integration_credentials')
        .select('credentials')
        .eq('organization_id', membership.org_id)
        .eq('provider', 'instantly')
        .maybeSingle()

      instantlyApiKey = (integration?.credentials as Record<string, string>)?.api_key || null
    }

    if (!instantlyApiKey) {
      instantlyApiKey = Deno.env.get('INSTANTLY_API_KEY') || null
    }

    if (!instantlyApiKey) {
      return jsonResponse(
        {
          error: 'Instantly API key not configured. Please add your Instantly API key in Settings > Integrations.',
          code: 'INSTANTLY_NOT_CONFIGURED',
        },
        req,
        400
      )
    }

    // -----------------------------------------------------------------------
    // 3. Parse and validate request body
    // -----------------------------------------------------------------------
    const body = await req.json() as PushCampaignRequest
    const { campaign_name, contacts } = body

    if (!campaign_name || typeof campaign_name !== 'string' || !campaign_name.trim()) {
      return errorResponse('campaign_name is required', req, 400)
    }

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return errorResponse('contacts array is required and must not be empty', req, 400)
    }

    // Filter to contacts with valid email addresses
    const validContacts = contacts.filter(c => c.email && typeof c.email === 'string' && c.email.includes('@'))
    const leadsSkipped = contacts.length - validContacts.length

    if (validContacts.length === 0) {
      return errorResponse('No contacts have valid email addresses', req, 400)
    }

    console.log(`[push-campaign-instantly] User ${user.id} pushing ${validContacts.length} contacts (${leadsSkipped} skipped) to new campaign "${campaign_name}"`)

    // -----------------------------------------------------------------------
    // 4. Create Instantly campaign
    // -----------------------------------------------------------------------
    const campaignController = new AbortController()
    const campaignTimeout = setTimeout(() => campaignController.abort(), INSTANTLY_TIMEOUT_MS)

    let campaignRes: Response
    try {
      campaignRes = await fetch(`${INSTANTLY_API_BASE}/campaign/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: instantlyApiKey,
          name: campaign_name.trim(),
        }),
        signal: campaignController.signal,
      })
    } catch (fetchErr) {
      clearTimeout(campaignTimeout)
      console.error('[push-campaign-instantly] Campaign creation fetch error:', fetchErr)
      return errorResponse('Instantly API request timed out or failed', req, 504)
    }
    clearTimeout(campaignTimeout)

    if (!campaignRes.ok) {
      const errorBody = await campaignRes.text()
      console.error('[push-campaign-instantly] Campaign creation error:', campaignRes.status, errorBody)

      if (campaignRes.status === 429) {
        return jsonResponse(
          { error: 'Instantly rate limit exceeded. Please wait and try again.', code: 'RATE_LIMITED' },
          req,
          429
        )
      }

      return errorResponse(`Failed to create Instantly campaign: ${campaignRes.status}`, req, 502)
    }

    const campaignData = await campaignRes.json()
    const campaignId = campaignData.id || campaignData.campaign_id || ''

    if (!campaignId) {
      console.error('[push-campaign-instantly] Campaign created but no ID returned:', campaignData)
      return errorResponse('Campaign created but no campaign ID was returned from Instantly', req, 502)
    }

    console.log(`[push-campaign-instantly] Campaign created: ${campaignId}`)

    // -----------------------------------------------------------------------
    // 5. Push leads to campaign
    // -----------------------------------------------------------------------
    const leads = validContacts.map(c => ({
      email: c.email,
      ...(c.first_name ? { first_name: c.first_name } : {}),
      ...(c.last_name ? { last_name: c.last_name } : {}),
      ...(c.company_name ? { company_name: c.company_name } : {}),
      ...((c.title || c.linkedin_url || c.demo_link) ? {
        custom_variables: {
          ...(c.title ? { title: c.title } : {}),
          ...(c.linkedin_url ? { linkedin_url: c.linkedin_url } : {}),
          ...(c.demo_link ? { demo_link: c.demo_link } : {}),
        },
      } : {}),
    }))

    const leadController = new AbortController()
    const leadTimeout = setTimeout(() => leadController.abort(), INSTANTLY_TIMEOUT_MS)

    let pushRes: Response
    try {
      pushRes = await fetch(`${INSTANTLY_API_BASE}/lead/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: instantlyApiKey,
          campaign_id: campaignId,
          skip_if_in_workspace: true,
          leads,
        }),
        signal: leadController.signal,
      })
    } catch (fetchErr) {
      clearTimeout(leadTimeout)
      console.error('[push-campaign-instantly] Lead push fetch error:', fetchErr)
      return errorResponse('Instantly API request timed out or failed while pushing leads', req, 504)
    }
    clearTimeout(leadTimeout)

    if (!pushRes.ok) {
      const errorBody = await pushRes.text()
      console.error('[push-campaign-instantly] Lead push error:', pushRes.status, errorBody)

      if (pushRes.status === 429) {
        return jsonResponse(
          { error: 'Instantly rate limit exceeded. Please wait and try again.', code: 'RATE_LIMITED' },
          req,
          429
        )
      }

      return errorResponse(`Campaign created but failed to push leads: ${pushRes.status}`, req, 502)
    }

    const pushData = await pushRes.json()
    console.log('[push-campaign-instantly] Lead push response:', JSON.stringify(pushData))

    const leadsPushed = pushData.leads_added ?? pushData.uploaded ?? validContacts.length

    // -----------------------------------------------------------------------
    // 6. Return result
    // -----------------------------------------------------------------------
    console.log(`[push-campaign-instantly] Success: campaign=${campaignId}, pushed=${leadsPushed}, skipped=${leadsSkipped}`)

    return jsonResponse(
      {
        success: true,
        campaign_id: campaignId,
        campaign_name: campaign_name.trim(),
        leads_pushed: leadsPushed,
        leads_skipped: leadsSkipped,
      },
      req
    )
  } catch (error) {
    console.error('[push-campaign-instantly] Unexpected error:', error)
    return errorResponse((error as Error).message || 'Internal server error', req, 500)
  }
}
