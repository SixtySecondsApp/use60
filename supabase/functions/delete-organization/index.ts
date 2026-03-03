import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { captureException } from '../_shared/sentryEdge.ts'

serve(async (req) => {
  // Handle CORS preflight
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

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
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

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
    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', adminUser.id)
      .maybeSingle()

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
      .maybeSingle()

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

    // Step 2.5: Delete auth.users for all org members
    // This ensures users can re-register with the same email after org deletion
    if (memberUserIds.length > 0) {
      for (const memberId of memberUserIds) {
        try {
          const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(memberId);
          if (authDeleteError) {
            // Ignore "not found" errors — user may already be deleted
            const isNotFound = authDeleteError.status === 404 ||
              (authDeleteError as any)?.code === 'user_not_found' ||
              authDeleteError.message?.includes('not found');
            if (!isNotFound) {
              console.error(`[delete-organization] Failed to delete auth user ${memberId}:`, authDeleteError);
            }
          } else {
            console.log(`[delete-organization] Deleted auth user: ${memberId}`);
          }
        } catch (e) {
          console.error(`[delete-organization] Exception deleting auth user ${memberId}:`, e);
        }
      }
    }

    // Step 2.7: Delete sales data scoped by clerk_org_id (text field, no FK cascade)
    // These tables reference the org via a plain text clerk_org_id column, not a FK,
    // so CASCADE on the organizations row does NOT reach them.
    const orgIdStr = orgId;
    const tablesToClean = ['activities', 'deals', 'contacts', 'companies'];
    for (const table of tablesToClean) {
      try {
        const { error } = await supabaseAdmin
          .from(table)
          .delete()
          .eq('clerk_org_id', orgIdStr);
        if (error) {
          console.error(`[delete-organization] Failed to clean ${table}:`, error);
        } else {
          console.log(`[delete-organization] Cleaned ${table} for org ${orgIdStr}`);
        }
      } catch (e) {
        console.error(`[delete-organization] Exception cleaning ${table}:`, e);
      }
    }

    // Step 2.8: Clean Railway PostgreSQL data (meeting-analytics transcripts + segments)
    // This removes any meeting data synced to the Railway database for AI "Ask Anything"
    try {
      const analyticsUrl = `${supabaseUrl}/functions/v1/meeting-analytics`;
      // Call meeting-analytics health to check if Railway is reachable, then clean directly
      const railwayDbUrl = Deno.env.get('RAILWAY_DATABASE_URL');
      if (railwayDbUrl) {
        // Import postgres dynamically for Railway cleanup
        const { Pool } = await import('https://deno.land/x/postgres@v0.19.3/mod.ts');
        const pool = new Pool(railwayDbUrl, 1, true);
        const client = await pool.connect();
        try {
          // Delete segments first (FK to transcripts), then transcripts
          const segResult = await client.queryObject(
            `DELETE FROM transcript_segments WHERE transcript_id IN (SELECT id FROM transcripts WHERE org_id = $1)`,
            [orgId]
          );
          const txResult = await client.queryObject(
            `DELETE FROM transcripts WHERE org_id = $1`,
            [orgId]
          );
          console.log(`[delete-organization] Railway cleanup: removed transcripts and segments for org ${orgId}`);
        } finally {
          client.release();
          await pool.end();
        }
      } else {
        console.log('[delete-organization] RAILWAY_DATABASE_URL not set, skipping Railway cleanup');
      }
    } catch (railwayErr) {
      // Non-fatal — Railway data cleanup should not block org deletion
      console.warn('[delete-organization] Railway cleanup failed (non-fatal):', railwayErr);
    }

    // Step 3: Delete the organization
    // ON DELETE CASCADE will handle:
    //   - organization_memberships (users become unassigned)
    //   - org-scoped data (integrations, AI data, billing, settings)
    // Sales data (contacts, deals, activities, companies) already cleaned in Step 2.7
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

    // Step 4: Anonymize profiles for deleted members
    // auth.users records were deleted in Step 2.5; profile rows are left as tombstones
    // for referential integrity but scrubbed of PII.
    if (memberUserIds.length > 0) {
      for (const memberId of memberUserIds) {
        try {
          await supabaseAdmin
            .from('profiles')
            .update({
              email: `deleted_${memberId}@deleted.local`,
              avatar_url: null,
              bio: null,
              clerk_user_id: null,
              auth_provider: 'deleted',
              updated_at: new Date().toISOString(),
            })
            .eq('id', memberId);
        } catch (e) {
          console.error(`[delete-organization] Failed to anonymize profile ${memberId}:`, e);
        }
      }
      console.log(`[delete-organization] Anonymized profiles for ${memberUserIds.length} members`)
    }

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
    try {
      await captureException(error, {
        tags: {
          function: 'delete-organization',
          integration: 'supabase',
        },
      });
    } catch (sentryErr) {
      console.warn('[delete-organization] Sentry captureException failed (non-fatal):', sentryErr)
    }
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
