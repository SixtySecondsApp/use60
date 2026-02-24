import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
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

    // Verify admin user is an admin
    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', adminUser.id)
      .single()

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
      .single()

    if (!userProfile) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Delete from internal_users if exists
    if (userProfile.email) {
      await supabaseAdmin
        .from('internal_users')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('email', userProfile.email.toLowerCase())
    }

    // Anonymize the profile: clear personal data but keep name visible for audit trail in meetings/tasks
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
      console.error('Error anonymizing profile:', profileError)
      return new Response(
        JSON.stringify({ error: `Failed to delete profile: ${profileError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Delete from auth.users to revoke access (user can sign up again with same email)
    // IMPORTANT: auth.admin.deleteUser() returns { data, error } — it does NOT throw.
    // We must check the returned error object, not rely on try/catch.
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (authDeleteError) {
      // Only ignore if auth user truly doesn't exist (404)
      const isNotFound = authDeleteError.status === 404 ||
        (authDeleteError as any)?.code === 'user_not_found' ||
        authDeleteError.message?.includes('not found')

      if (isNotFound) {
        console.log('Note: Auth user does not exist (already deleted or never created):', authDeleteError.message)
      } else {
        // Auth deletion failed for a real reason - return error
        console.error('Error deleting auth user:', authDeleteError)
        return new Response(
          JSON.stringify({
            error: `Failed to delete auth user: ${authDeleteError.message || 'Unknown error'}`,
            code: 'AUTH_DELETION_FAILED',
            details: authDeleteError
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else {
      console.log('Auth user deleted successfully:', userId)
    }

    // Reset waitlist entry so user can be re-invited
    // Find by original email (before anonymization) and reset status to 'pending'
    if (userProfile.email) {
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
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'User deleted successfully',
        userId
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('Error in delete-user:', error)
    await captureException(error, {
      tags: {
        function: 'delete-user',
        integration: 'supabase-auth',
      },
    });
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
