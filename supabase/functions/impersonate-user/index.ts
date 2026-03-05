import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { captureException } from '../_shared/sentryEdge.ts'
import { getCorsHeaders } from '../_shared/corsHelper.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    // Get the JWT and API key from headers
    const authHeader = req.headers.get('Authorization')
    const apiKey = req.headers.get('apikey')

    if (!authHeader || !apiKey) {
      throw new Error('Missing authorization headers')
    }

    // Create Supabase client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get the JWT token
    const token = authHeader.replace('Bearer ', '')

    // Verify the JWT and get the user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      throw new Error('Invalid token')
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.is_admin) {
      throw new Error('Unauthorized - admin access required')
    }

    // Get request body
    const { userId, adminId, adminEmail, redirectTo } = await req.json()
    
    if (!userId || !adminId || !adminEmail || !redirectTo) {
      throw new Error('Missing required parameters')
    }

    // Verify the admin ID matches the authenticated user
    if (user.id !== adminId) {
      throw new Error('Admin ID mismatch')
    }

    // Get user to impersonate
    const { data: targetUser, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId)

    if (userError || !targetUser) {
      throw new Error('User not found')
    }

    // Validate that the target user has an email address
    if (!targetUser.user.email || targetUser.user.email.trim() === '') {
      throw new Error('Target user does not have a valid email address. Cannot generate magic link for impersonation.')
    }

    // Try to create a session for the target user first (preserves their password)
    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.createSession({
      userId: userId,
      expiresIn: 3600 // 1 hour expiry for impersonation sessions
    })

    if (sessionError || !sessionData) {
      // Fallback to magic link if session creation fails
      const { data: magicLinkData, error: magicLinkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: targetUser.user.email,
        options: {
          redirectTo: redirectTo,
          data: {
            impersonated_by: adminId,
            impersonated_by_email: adminEmail,
            is_impersonation: true
          }
        }
      })

      if (magicLinkError || !magicLinkData) {
        throw new Error('Failed to generate magic link')
      }

      return new Response(
        JSON.stringify({
          magicLink: magicLinkData.properties.action_link,
          sessionBased: false // Using magic link fallback
        }),
        {
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // Log the impersonation for audit purposes
    const { error: logError } = await supabaseAdmin
      .from('impersonation_logs')
      .insert({
        admin_id: adminId,
        admin_email: adminEmail,
        target_user_id: userId,
        target_user_email: targetUser.user.email,
        action: 'start_impersonation',
        created_at: new Date().toISOString()
      })

    if (logError) {
    }

    // Return the session data for impersonation
    return new Response(
      JSON.stringify({
        session: sessionData.session,
        sessionBased: true, // Using session-based impersonation
        adminId: adminId,
        adminEmail: adminEmail
      }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    await captureException(error, {
      tags: {
        function: 'impersonate-user',
        integration: 'supabase-auth',
      },
    });
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})