import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'

/**
 * Attio OAuth Initiation (org-scoped)
 *
 * Flow:
 *  - Frontend calls this function with Authorization header (user session JWT)
 *  - We validate user + org admin role
 *  - We create attio_oauth_states row (CSRF protection)
 *  - We return Attio authorize URL for the user to complete OAuth
 */
serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  try {
    // Optional JSON body: { org_id?: string, clerk_org_id?: string, redirect_path?: string }
    let orgIdFromBody: string | null = null
    let clerkOrgIdFromBody: string | null = null
    let redirectPath: string | null = null
    try {
      const contentType = req.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const body = await req.json().catch(() => null)
        orgIdFromBody = body && typeof body.org_id === 'string' ? body.org_id : null
        clerkOrgIdFromBody = body && typeof body.clerk_org_id === 'string' ? body.clerk_org_id : null
        redirectPath = body && typeof body.redirect_path === 'string' ? body.redirect_path : null
      }
    } catch {
      // ignore
    }

    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader) {
      return jsonResponse({ success: false, error: 'Missing authorization header' }, req, 401)
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
      return jsonResponse({ success: false, error: 'Unauthorized: invalid session' }, req, 401)
    }

    // Service role client for privileged operations (OAuth state table is service-role-only)
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
      return jsonResponse(
        { success: false, error: 'Missing org_id', message: 'No organization could be resolved for this user.' },
        req,
        400
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
      return jsonResponse(
        { success: false, error: 'Forbidden', message: 'Org admin role required' },
        req,
        403
      )
    }

    // Block if already connected and active
    const { data: existing } = await supabase
      .from('attio_org_integrations')
      .select('id, is_active, is_connected')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .maybeSingle()

    if (existing?.id && existing.is_connected) {
      return jsonResponse(
        {
          success: false,
          error: 'Integration already exists',
          message: 'This organization already has an active Attio connection. Disconnect first to reconnect.',
        },
        req,
        400
      )
    }

    const clientId = Deno.env.get('ATTIO_CLIENT_ID') || ''
    const redirectUri = Deno.env.get('ATTIO_REDIRECT_URI') || ''
    if (!clientId || !redirectUri) {
      return jsonResponse({ success: false, error: 'Missing ATTIO_CLIENT_ID or ATTIO_REDIRECT_URI' }, req, 500)
    }

    const scopes = [
      'record_permission:read-write',
      'object_configuration:read',
      'list_configuration:read',
      'list_entry:read-write',
      'note:read-write',
      'task:read-write',
      'webhook:read-write',
      'user_management:read',
    ]

    // Generate secure random state for CSRF protection
    const state = crypto.randomUUID()

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const { error: stateError } = await supabase.from('attio_oauth_states').insert({
      state,
      user_id: user.id,
      org_id: orgId,
      clerk_org_id: clerkOrgIdFromBody,
      redirect_uri: redirectPath,
      expires_at: expiresAt,
    })

    if (stateError) {
      return jsonResponse(
        { success: false, error: `Failed to store OAuth state: ${stateError.message}` },
        req,
        500
      )
    }

    const authUrl = new URL('https://app.attio.com/authorize')
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('scope', scopes.join(' '))
    authUrl.searchParams.set('state', state)

    return jsonResponse(
      {
        success: true,
        authorization_url: authUrl.toString(),
        org_id: orgId,
        state,
        scopes,
      },
      req
    )
  } catch (error) {
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      req,
      500
    )
  }
})
