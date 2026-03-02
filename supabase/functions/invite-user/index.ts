import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { captureException } from '../_shared/sentryEdge.ts'

const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get('origin') || 'https://staging.use60.com'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  
  console.log('[invite-user] Request method:', req.method)
  console.log('[invite-user] Origin:', req.headers.get('origin'))
  
  if (req.method === 'OPTIONS') {
    console.log('[invite-user] Handling OPTIONS preflight')
    const response = new Response(null, { 
      status: 204,
      headers: corsHeaders 
    })
    console.log('[invite-user] OPTIONS response headers:', Object.fromEntries(response.headers.entries()))
    return response
  }

  try {
    console.log('[invite-user] Starting invitation process')

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const body = await req.json()
    const { email, first_name, last_name, redirectTo, invitedByAdminId } = body

    if (!email || !redirectTo) {
      throw new Error('Email and redirectTo are required')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Verify admin
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: adminUser }, error: userError } = await supabaseAdmin.auth.getUser(token)

    if (userError || !adminUser) {
      throw new Error('Invalid token')
    }

    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', adminUser.id)
      .single()

    if (!adminProfile?.is_admin) {
      throw new Error('Admin access required')
    }

    // Check if user exists
    const { data: existingAuth } = await supabaseAdmin.auth.admin.listUsers()
    const userExists = existingAuth?.users?.some(u => u.email?.toLowerCase() === email.toLowerCase())

    if (userExists) {
      throw new Error(`User ${email} already exists`)
    }

    // Create auth user (passwordless initially)
    console.log('[invite-user] Creating auth user for:', email)
    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      user_metadata: {
        first_name: first_name || null,
        last_name: last_name || null,
        full_name: first_name && last_name ? `${first_name} ${last_name}` : null,
        invited_by_admin_id: invitedByAdminId,
        invited_at: new Date().toISOString(),
      },
      // Don't set password - user will set it via the link
    })

    if (createError) {
      throw new Error(`Failed to create user: ${createError.message}`)
    }

    if (!createData?.user?.id) {
      throw new Error('No user ID returned')
    }

    const userId = createData.user.id
    console.log('[invite-user] User created:', userId)

    // Create profile
    console.log('[invite-user] Creating profile for user:', userId)
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        email: email.toLowerCase().trim(),
        first_name: first_name || null,
        last_name: last_name || null,
      })

    if (profileError) {
      console.warn('[invite-user] Profile creation warning:', profileError)
      // Don't throw - profile might have been created by trigger
    }

    // Generate magic link for password setup
    console.log('[invite-user] Generating magic link')
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: email.toLowerCase().trim(),
      options: {
        redirectTo: redirectTo,
      },
    })

    if (linkError) {
      throw new Error(`Failed to generate link: ${linkError.message}`)
    }

    const magicLink = linkData?.properties?.action_link
    if (!magicLink) {
      throw new Error('No magic link generated')
    }

    console.log('[invite-user] Magic link generated, sending email')

    // Send welcome email with the magic link
    const emailResponse = await fetch(`${supabaseUrl}/functions/v1/encharge-send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey,
      },
      body: JSON.stringify({
        template_type: 'welcome',
        to_email: email,
        to_name: first_name || 'Team Member',
        user_id: userId,
        variables: {
          first_name: first_name || 'Team Member',
          invitation_link: magicLink,
          action_url: magicLink,
        },
      }),
    })

    if (!emailResponse.ok) {
      const emailError = await emailResponse.text()
      console.warn('[invite-user] Email sending warning:', emailError)
      // Don't throw - user is created, just email failed
    } else {
      console.log('[invite-user] Welcome email sent')
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `User invited successfully`,
        userId,
        email,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('[invite-user] Error:', error.message)
    
    await captureException(error, {
      tags: { function: 'invite-user' },
    })

    const statusCode = error.message?.includes('already exists') ? 400 :
                      error.message?.includes('Admin access') ? 403 :
                      error.message?.includes('Invalid token') ? 401 : 500

    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
