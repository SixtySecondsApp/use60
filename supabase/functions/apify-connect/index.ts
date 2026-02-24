import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts'

const APIFY_API_BASE = 'https://api.apify.com/v2'

interface ConnectRequest {
  action: 'connect' | 'disconnect' | 'revalidate'
  token?: string
}

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  try {
    const body = (await req.json()) as ConnectRequest
    const { action } = body

    if (!action || !['connect', 'disconnect', 'revalidate'].includes(action)) {
      return errorResponse(
        'Invalid action. Must be "connect", "disconnect", or "revalidate".',
        req,
        400
      )
    }

    // --- Auth: JWT -> user -> org membership ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Missing authorization', req, 401)
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', req, 401)
    }

    const { data: membership } = await userClient
      .from('organization_memberships')
      .select('org_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return errorResponse('No organization found', req, 400)
    }

    const orgId = membership.org_id

    // Service role client for credential writes (bypasses RLS)
    const svc = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    // --- Action handlers ---

    if (action === 'connect') {
      const token = body.token
      if (!token) {
        return errorResponse('Missing "token" field for connect action', req, 400)
      }

      // Validate token with Apify
      const apifyRes = await fetch(`${APIFY_API_BASE}/users/me?token=${encodeURIComponent(token)}`)

      if (!apifyRes.ok) {
        const errText = await apifyRes.text()
        console.error('[apify-connect] Token validation failed:', apifyRes.status, errText)
        if (apifyRes.status === 401) {
          return errorResponse('Invalid Apify API token', req, 401)
        }
        return errorResponse(`Apify API error: ${apifyRes.status}`, req, 400)
      }

      const apifyUser = await apifyRes.json() as Record<string, unknown>
      const data = (apifyUser.data || apifyUser) as Record<string, unknown>
      const plan = (data.plan || {}) as Record<string, unknown>

      // Upsert into integration_credentials
      const { error: upsertError } = await svc
        .from('integration_credentials')
        .upsert(
          {
            organization_id: orgId,
            provider: 'apify',
            credentials: {
              api_token: token,
              username: data.username || data.id,
              plan: plan.id || plan.name || null,
              credits_remaining: (data.proxy as Record<string, unknown>)?.usageUsd != null
                ? null
                : null,
            },
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id,provider' }
        )

      if (upsertError) {
        console.error('[apify-connect] Upsert error:', upsertError)
        return errorResponse('Failed to save credentials', req, 500)
      }

      return jsonResponse(
        {
          connected: true,
          user: {
            username: data.username,
            email: data.email,
            plan: plan.id || plan.name || null,
          },
        },
        req
      )
    }

    if (action === 'disconnect') {
      const { error: updateError } = await svc
        .from('integration_credentials')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('organization_id', orgId)
        .eq('provider', 'apify')

      if (updateError) {
        console.error('[apify-connect] Disconnect error:', updateError)
        return errorResponse('Failed to disconnect', req, 500)
      }

      return jsonResponse({ connected: false }, req)
    }

    if (action === 'revalidate') {
      // Fetch existing credentials
      const { data: creds } = await svc
        .from('integration_credentials')
        .select('credentials, is_active')
        .eq('organization_id', orgId)
        .eq('provider', 'apify')
        .maybeSingle()

      if (!creds || !creds.is_active) {
        return jsonResponse({ connected: false, reason: 'not_configured' }, req)
      }

      const apiToken = (creds.credentials as Record<string, string>)?.api_token
      if (!apiToken) {
        return jsonResponse({ connected: false, reason: 'missing_token' }, req)
      }

      // Re-validate with Apify
      const apifyRes = await fetch(
        `${APIFY_API_BASE}/users/me?token=${encodeURIComponent(apiToken)}`
      )

      if (!apifyRes.ok) {
        // Token no longer valid — mark as inactive
        await svc
          .from('integration_credentials')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('organization_id', orgId)
          .eq('provider', 'apify')

        return jsonResponse(
          { connected: false, reason: 'token_invalid' },
          req
        )
      }

      const apifyUser = await apifyRes.json() as Record<string, unknown>
      const data = (apifyUser.data || apifyUser) as Record<string, unknown>
      const plan = (data.plan || {}) as Record<string, unknown>

      // Update metadata
      await svc
        .from('integration_credentials')
        .update({
          credentials: {
            api_token: apiToken,
            username: data.username || data.id,
            plan: plan.id || plan.name || null,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', orgId)
        .eq('provider', 'apify')

      return jsonResponse(
        {
          connected: true,
          user: {
            username: data.username,
            email: data.email,
            plan: plan.id || plan.name || null,
          },
        },
        req
      )
    }

    return errorResponse('Unknown action', req, 400)
  } catch (error) {
    console.error('[apify-connect] Error:', error)
    return errorResponse((error as Error).message, req, 500)
  }
})
