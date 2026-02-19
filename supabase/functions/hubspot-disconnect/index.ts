import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

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

  // user-auth (admin-only)
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const userToken = req.headers.get('Authorization')?.replace('Bearer ', '') || ''

  console.log('[hubspot-disconnect] Auth check - anonKey exists:', !!anonKey, 'userToken exists:', !!userToken)

  if (!anonKey || !userToken) {
    console.log('[hubspot-disconnect] Missing anonKey or userToken')
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
    error: userError,
  } = await userClient.auth.getUser()

  console.log('[hubspot-disconnect] getUser result - user:', user?.id, 'error:', userError?.message)

  if (!user) {
    return new Response(JSON.stringify({ success: false, error: userError?.message || 'Unauthorized' }), {
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
      .from('hubspot_org_integrations')
      .update({
        is_active: false,
        is_connected: false,
        webhook_last_received_at: null,
        webhook_last_event_id: null,
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

    // Credentials remain stored but effectively disabled; rotate webhook token for safety.
    await svc
      .from('hubspot_org_integrations')
      .update({ webhook_token: crypto.randomUUID().replace(/-/g, '') })
      .eq('org_id', orgId)
      .catch((e) => console.error('Failed to rotate webhook token:', e))

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('Disconnect error:', e)
    return new Response(JSON.stringify({ success: false, error: e.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})


