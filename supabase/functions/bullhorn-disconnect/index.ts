import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

/**
 * Bullhorn Disconnect (org-scoped)
 *
 * Disconnects a Bullhorn integration for an organization:
 * - Validates user is org owner/admin
 * - Sets is_connected=false in bullhorn_org_integrations
 * - Deletes credentials from bullhorn_org_credentials
 * - Clears pending items from sync queue
 * - Rotates webhook token for security
 */
serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ success: false, error: 'Server misconfigured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // User auth (admin-only)
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const userToken = req.headers.get('Authorization')?.replace('Bearer ', '') || ''
  if (!anonKey || !userToken) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  })
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const svc = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const body = await req.json().catch(() => ({}))
  const orgId = typeof body.org_id === 'string' ? body.org_id : null
  if (!orgId) {
    return new Response(JSON.stringify({ success: false, error: 'Missing org_id' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // Verify org admin (owner/admin) membership
    const { data: membership, error: membershipError } = await svc
      .from('organization_memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError) {
      console.error('Membership query error:', membershipError)
      return new Response(JSON.stringify({ success: false, error: `Database error: ${membershipError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const role = membership?.role as string | undefined
    const isAdmin = role === 'owner' || role === 'admin'
    if (!isAdmin) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden - admin role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Disconnect the integration
    const { error: updateError } = await svc
      .from('bullhorn_org_integrations')
      .update({
        is_active: false,
        is_connected: false,
        webhook_last_received_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)

    if (updateError) {
      console.error('Update error:', updateError)
      return new Response(JSON.stringify({ success: false, error: `Failed to disconnect: ${updateError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Delete credentials (rather than just disabling, for security)
    const { error: deleteCredsError } = await svc
      .from('bullhorn_org_credentials')
      .delete()
      .eq('org_id', orgId)

    if (deleteCredsError) {
      console.error('Failed to delete credentials:', deleteCredsError)
      // Non-fatal - continue
    }

    // Clear sync queue for this org
    const { error: clearQueueError } = await svc
      .from('bullhorn_sync_queue')
      .delete()
      .eq('org_id', orgId)

    if (clearQueueError) {
      console.error('Failed to clear sync queue:', clearQueueError)
      // Non-fatal - continue
    }

    // Rotate webhook token for security
    await svc
      .from('bullhorn_org_integrations')
      .update({ webhook_token: crypto.randomUUID().replace(/-/g, '') })
      .eq('org_id', orgId)
      .catch((e) => console.error('Failed to rotate webhook token:', e))

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: unknown) {
    console.error('Disconnect error:', e)
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
