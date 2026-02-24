import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'
import { AttioClient } from '../_shared/attio.ts'

serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse('Server misconfigured', req, 500)
  }

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const userToken = req.headers.get('Authorization')?.replace('Bearer ', '') || ''

  if (!anonKey || !userToken) {
    return errorResponse('Unauthorized', req, 401)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  })
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser()

  if (!user) {
    return errorResponse(userError?.message || 'Unauthorized', req, 401)
  }

  const svc = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const body = await req.json().catch(() => ({}))
  const orgId = typeof body.org_id === 'string' ? body.org_id : null
  if (!orgId) {
    return errorResponse('Missing org_id', req, 400)
  }

  try {
    // Verify org admin/owner membership
    const { data: membership, error: membershipError } = await svc
      .from('organization_memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError) {
      console.error('[attio-disconnect] Membership query error:', membershipError)
      return errorResponse(`Database error: ${membershipError.message}`, req, 500)
    }

    const role = membership?.role as string | undefined
    if (role !== 'owner' && role !== 'admin') {
      return errorResponse('Forbidden - admin role required', req, 403)
    }

    // Read current integration state to get webhook_id
    const { data: integration } = await svc
      .from('attio_org_integrations')
      .select('webhook_id')
      .eq('org_id', orgId)
      .maybeSingle()

    // Best-effort: delete Attio webhook if one exists
    if (integration?.webhook_id) {
      try {
        const { data: creds } = await svc
          .from('attio_org_credentials')
          .select('access_token')
          .eq('org_id', orgId)
          .maybeSingle()

        if (creds?.access_token) {
          const attio = new AttioClient({ accessToken: creds.access_token })
          await attio.deleteWebhook(integration.webhook_id)
          console.log('[attio-disconnect] Deleted webhook:', integration.webhook_id)
        }
      } catch (webhookErr: any) {
        console.warn('[attio-disconnect] Webhook deletion failed (non-fatal):', webhookErr.message)
      }
    }

    // Mark integration as disconnected
    const { error: updateError } = await svc
      .from('attio_org_integrations')
      .update({
        is_active: false,
        is_connected: false,
        webhook_id: null,
        webhook_last_received_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)

    if (updateError) {
      console.error('[attio-disconnect] Update error:', updateError)
      return errorResponse(`Failed to disconnect: ${updateError.message}`, req, 500)
    }

    // Delete credentials row
    const { error: deleteError } = await svc
      .from('attio_org_credentials')
      .delete()
      .eq('org_id', orgId)

    if (deleteError) {
      console.warn('[attio-disconnect] Credential deletion failed (non-fatal):', deleteError.message)
    }

    return jsonResponse({ success: true }, req)
  } catch (e: any) {
    console.error('[attio-disconnect] Disconnect error:', e)
    return errorResponse(e.message || 'Unknown error', req, 500)
  }
})
