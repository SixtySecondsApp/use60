import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders } from '../../_shared/corsHelper.ts'

/**
 * LinkedIn OAuth Initiation (org-scoped)
 *
 * Flow:
 *  - Frontend calls this function with Authorization header (user session JWT)
 *  - We validate user + org admin role
 *  - We create linkedin_oauth_states row (CSRF protection)
 *  - We return LinkedIn authorize URL for the user to complete OAuth
 */
export async function handleInitiate(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let orgIdFromBody: string | null = null
    let redirectPath: string | null = null
    try {
      const contentType = req.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const body = await req.json().catch(() => null)
        orgIdFromBody = body && typeof body.org_id === 'string' ? body.org_id : null
        redirectPath = body && typeof body.redirect_path === 'string' ? body.redirect_path : null
      }
    } catch {
      // ignore
    }

    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate user via anon client
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const {
      data: { user },
      error: userError,
    } = await anonClient.auth.getUser()

    if (userError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized: invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Service role client for privileged operations
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Resolve org_id (prefer explicit, else first membership)
    let orgId: string | null = orgIdFromBody
    if (!orgId) {
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      orgId = membership?.org_id || null
    }

    if (!orgId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing org_id', message: 'No organization could be resolved for this user.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Enforce org admin/owner
    const { data: roleRow } = await supabase
      .from('organization_memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle()

    const role = roleRow?.role || null
    if (role !== 'owner' && role !== 'admin') {
      return new Response(
        JSON.stringify({ success: false, error: 'Forbidden', message: 'Org admin role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if already connected (allow reconnect if disconnected)
    const { data: existing } = await supabase
      .from('linkedin_org_integrations')
      .select('id, is_active, is_connected')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .maybeSingle()

    if (existing?.id && existing.is_connected) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Integration already exists',
          message: 'This organization already has an active LinkedIn connection. Disconnect first to reconnect.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const clientId = Deno.env.get('LINKEDIN_CLIENT_ID') || ''
    const redirectUri = Deno.env.get('LINKEDIN_REDIRECT_URI') || ''
    if (!clientId || !redirectUri) {
      return new Response(JSON.stringify({ success: false, error: 'Missing LINKEDIN_CLIENT_ID or LINKEDIN_REDIRECT_URI' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const scopes = [
      'r_marketing_leadgen_automation',
      'r_events',
      'r_organization_admin',
    ]

    // Generate secure random state for CSRF protection
    const state = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    const { error: stateError } = await supabase.from('linkedin_oauth_states').insert({
      state,
      user_id: user.id,
      org_id: orgId,
      redirect_uri: redirectPath,
      expires_at: expiresAt,
    })

    if (stateError) {
      return new Response(JSON.stringify({ success: false, error: `Failed to store OAuth state: ${stateError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // LinkedIn OAuth 2.0 authorization URL
    const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization')
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('scope', scopes.join(' '))
    authUrl.searchParams.set('state', state)

    return new Response(
      JSON.stringify({
        success: true,
        authorization_url: authUrl.toString(),
        org_id: orgId,
        state,
        scopes,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}
