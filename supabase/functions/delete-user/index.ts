import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'
import { captureException } from '../_shared/sentryEdge.ts'

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  const corsHeaders = getCorsHeaders(req)

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
    const { userId } = await req.json()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'User ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    console.log('[delete-user] Creating admin client, URL:', supabaseUrl ? 'present' : 'MISSING', 'Key:', supabaseServiceKey ? 'present' : 'MISSING')
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

    // Verify admin user is an admin
    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', adminUser.id)
      .maybeSingle()

    if (!adminProfile?.is_admin) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Prevent self-deletion
    if (adminUser.id === userId) {
      return new Response(
        JSON.stringify({ error: 'Cannot delete your own account' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user email before deletion for cleanup
    const { data: userProfile } = await supabaseAdmin
      .from('profiles')
      .select('email, first_name, last_name')
      .eq('id', userId)
      .maybeSingle()

    // If profile is already anonymized or missing, still proceed with auth deletion
    const isAlreadyAnonymized = userProfile?.email?.startsWith('deleted_')
    if (!userProfile && !isAlreadyAnonymized) {
      // No profile at all — try auth deletion directly in case of orphaned auth user
      console.log('No profile found for user, attempting auth-only deletion:', userId)
    }

    // Delete from internal_users if exists
    if (userProfile?.email && !userProfile.email.startsWith('deleted_')) {
      try {
        console.log('[delete-user] Deactivating internal_users for:', userProfile.email)
        const { error: internalError } = await supabaseAdmin
          .from('internal_users')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('email', userProfile.email.toLowerCase())
        if (internalError) {
          console.warn('[delete-user] internal_users deactivation failed (non-fatal):', internalError.message)
        }
      } catch (internalErr) {
        console.warn('[delete-user] internal_users deactivation threw (non-fatal):', internalErr)
      }
    }

    // Anonymize the profile (skip if already anonymized or no profile)
    if (userProfile && !isAlreadyAnonymized) {
      console.log('[delete-user] Anonymizing profile for:', userId)
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({
          email: `deleted_${userId}@deleted.local`,
          avatar_url: null,
          bio: null,
          clerk_user_id: null,
          auth_provider: 'deleted',
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)

      if (profileError) {
        console.error('[delete-user] Error anonymizing profile:', profileError)
        // Non-fatal — continue to auth deletion
      }
    }

    // Delete from auth.users to revoke access (user can sign up again with same email)
    console.log('[delete-user] Deleting auth user:', userId)
    let authWarning: string | null = null
    try {
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

      if (authDeleteError) {
        // Only ignore if auth user truly doesn't exist (404)
        const isNotFound = authDeleteError.status === 404 ||
          (authDeleteError as any)?.code === 'user_not_found' ||
          authDeleteError.message?.includes('not found')

        if (isNotFound) {
          console.log('[delete-user] Auth user does not exist (already deleted):', authDeleteError.message)
        } else {
          // Auth deletion failed — log it but don't block if profile was already anonymized
          console.error('[delete-user] Error deleting auth user:', authDeleteError.message)
          authWarning = `Auth cleanup incomplete: ${authDeleteError.message || 'Unknown error'}. User profile has been removed.`
        }
      } else {
        console.log('[delete-user] Auth user deleted successfully:', userId)
      }
    } catch (authErr: any) {
      console.error('[delete-user] auth.admin.deleteUser threw:', authErr?.message || authErr)
      authWarning = `Auth cleanup threw: ${authErr?.message || 'Unknown error'}. User profile has been removed.`
    }

    // Reset waitlist entry so user can be re-invited
    // Find by original email (before anonymization) and reset status to 'pending'
    if (userProfile?.email && !userProfile.email.startsWith('deleted_')) {
      try {
        const { error: waitlistError } = await supabaseAdmin
          .from('meetings_waitlist')
          .update({
            status: 'pending',
            user_id: null,
            converted_at: null,
            invitation_accepted_at: null,
          })
          .eq('email', userProfile.email.toLowerCase())
          .in('status', ['converted', 'released'])

        if (waitlistError) {
          // Non-fatal: log but don't fail the deletion
          console.warn('Failed to reset waitlist entry (non-fatal):', waitlistError.message)
        } else {
          console.log('Waitlist entry reset to pending for:', userProfile.email)
        }
      } catch (waitlistErr) {
        console.warn('Waitlist reset threw (non-fatal):', waitlistErr)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: authWarning ? 'User removed with warnings' : 'User deleted successfully',
        warning: authWarning || undefined,
        userId
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('Error in delete-user:', error)
    try {
      await captureException(error, {
        tags: {
          function: 'delete-user',
          integration: 'supabase-auth',
        },
      });
    } catch (sentryErr) {
      console.warn('Sentry captureException failed (non-fatal):', sentryErr)
    }
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
