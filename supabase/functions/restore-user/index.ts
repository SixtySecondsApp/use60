import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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

    // Verify the JWT and get the user (this should be the impersonated user)
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      throw new Error('Invalid token')
    }

    // Get the request body
    const { userId, email, redirectTo } = await req.json()
    
    if (!userId || !email || !redirectTo) {
      throw new Error('Missing required parameters: userId, email, and redirectTo are required')
    }

    // Verify that the provided userId exists and matches the email
    const { data: originalUser, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId)

    if (userError || !originalUser) {
      throw new Error('Original user not found')
    }

    // Validate that the original user has an email address
    if (!originalUser.user.email || originalUser.user.email.trim() === '') {
      throw new Error('Original user does not have a valid email address')
    }

    if (originalUser.user.email !== email) {
      throw new Error('Email mismatch for original user')
    }

    // Instead of generating a magic link (which invalidates password),
    // create a temporary recovery token that can be exchanged for a session
    // without affecting the user's password
    
    // First, create a recovery token for the admin user
    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.createSession({
      userId: userId,
      expiresIn: 300 // 5 minutes expiry for security
    })

    if (sessionError || !sessionData) {
      // Fallback to magic link if session creation fails
      const { data: magicLinkData, error: magicLinkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: email,
        options: {
          redirectTo: redirectTo,
          data: {
            restored_from_impersonation: true,
            impersonated_user_id: user.id
          }
        }
      })

      if (magicLinkError || !magicLinkData) {
        throw new Error('Failed to generate magic link for restoration')
      }

      return new Response(
        JSON.stringify({
          magicLink: magicLinkData.properties.action_link,
          requiresPasswordReset: true // Indicate that password reset will be needed
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // Log the restoration for audit purposes
    const { error: logError } = await supabaseAdmin
      .from('impersonation_logs')
      .insert({
        admin_id: userId,
        admin_email: email,
        target_user_id: user.id,
        target_user_email: user.email || 'unknown',
        action: 'end_impersonation',
        created_at: new Date().toISOString()
      })

    if (logError) {
    }

    // Return the session data to restore the admin session
    return new Response(
      JSON.stringify({
        session: sessionData.session,
        requiresPasswordReset: false // No password reset needed with session restoration
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})