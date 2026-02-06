import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders } from '../_shared/cors.ts'
import { captureException } from '../_shared/sentryEdge.ts'

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { orgId } = await req.json()

    if (!orgId) {
      return new Response(
        JSON.stringify({ error: 'Organization ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Get the admin user from the JWT token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: adminUser }, error: userError } = await supabaseAdmin.auth.getUser(token)

    if (userError || !adminUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify admin user is a platform admin
    const { data: adminProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', adminUser.id)
      .single()

    if (profileError) {
      console.error('[delete-organization] Error fetching admin profile:', profileError)
      return new Response(
        JSON.stringify({ error: 'Failed to verify admin status', code: 'ADMIN_CHECK_FAILED' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!adminProfile?.is_admin) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Platform admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify the organization exists
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .eq('id', orgId)
      .single()

    if (orgError || !org) {
      return new Response(
        JSON.stringify({ error: 'Organization not found', code: 'ORG_NOT_FOUND' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[delete-organization] Admin ${adminUser.id} deleting org ${orgId} (${org.name})`)

    // Step 1: Get all member user_ids BEFORE any deletions
    const { data: memberships, error: membershipsError } = await supabaseAdmin
      .from('organization_memberships')
      .select('user_id')
      .eq('org_id', orgId)

    if (membershipsError) {
      console.error('[delete-organization] Error fetching memberships:', membershipsError)
      return new Response(
        JSON.stringify({
          error: `Failed to fetch organization members: ${membershipsError.message}`,
          code: 'ORG_DELETION_FAILED'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const memberUserIds = (memberships || []).map(m => m.user_id)
    console.log(`[delete-organization] Found ${memberUserIds.length} members to unassign`)

    // Step 2: Reset onboarding progress for all members
    // CRITICAL: This must happen BEFORE deleting the org (which cascades memberships)
    // Without this, users get stuck in a redirect loop:
    //   - No membership → ProtectedRoute sends to /onboarding
    //   - onboarding_completed_at is set → onboarding page redirects to /dashboard
    //   - /dashboard sees no membership → back to /onboarding → infinite loop
    if (memberUserIds.length > 0) {
      const { error: onboardingResetError } = await supabaseAdmin
        .from('user_onboarding_progress')
        .update({
          onboarding_completed_at: null,
          onboarding_step: 'website_input',
          updated_at: new Date().toISOString()
        })
        .in('user_id', memberUserIds)

      if (onboardingResetError) {
        console.error('[delete-organization] Error resetting onboarding progress:', onboardingResetError)
        return new Response(
          JSON.stringify({
            error: `Failed to reset user onboarding: ${onboardingResetError.message}`,
            code: 'ORG_DELETION_FAILED'
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`[delete-organization] Reset onboarding progress for ${memberUserIds.length} users`)
    }

    // Step 3: Delete the organization
    // ON DELETE CASCADE will handle:
    //   - organization_memberships (users become unassigned)
    //   - org-scoped data (integrations, AI data, billing, settings)
    // Core sales data (contacts, deals, activities) uses clerk_org_id (text, no FK) — preserved
    const { error: deleteError } = await supabaseAdmin
      .from('organizations')
      .delete()
      .eq('id', orgId)

    if (deleteError) {
      console.error('[delete-organization] Error deleting organization:', deleteError)
      return new Response(
        JSON.stringify({
          error: `Failed to delete organization: ${deleteError.message}`,
          code: 'ORG_DELETION_FAILED'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[delete-organization] Organization ${orgId} (${org.name}) deleted successfully`)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Organization deleted successfully',
        orgId,
        orgName: org.name,
        affectedUsers: memberUserIds.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('[delete-organization] Fatal error:', error)
    await captureException(error, {
      tags: {
        function: 'delete-organization',
        integration: 'supabase',
      },
    });
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
