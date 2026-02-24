import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShareRequest {
  action: 'toggle_public' | 'set_password' | 'remove_password' | 'set_expiry' | 'verify_password'
  profileId: string
  is_public?: boolean
  password?: string
  share_token?: string // for verify_password only
  expires_at?: string | null
}

// ---------------------------------------------------------------------------
// Password hashing (SHA-256 via Web Crypto API)
// ---------------------------------------------------------------------------

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------------------
// Edge function
// ---------------------------------------------------------------------------

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  const cors = getCorsHeaders(req)
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  try {
    const body = (await req.json()) as ShareRequest
    const { action, profileId } = body

    if (!action) {
      return json({ success: false, error: 'Missing action' }, 400)
    }

    if (!profileId && action !== 'verify_password') {
      return json({ success: false, error: 'Missing profileId' }, 400)
    }

    // ------------------------------------------------------------------
    // verify_password: NO auth required (public page access)
    // ------------------------------------------------------------------
    if (action === 'verify_password') {
      const { share_token, password } = body

      if (!share_token) {
        return json({ success: false, error: 'share_token is required' }, 400)
      }
      if (!password) {
        return json({ success: false, error: 'password is required' }, 400)
      }

      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      const { data: profile, error: fetchError } = await serviceClient
        .from('client_fact_profiles')
        .select('id, share_password_hash')
        .eq('share_token', share_token)
        .eq('is_public', true)
        .maybeSingle()

      if (fetchError) {
        console.error('[fact-profile-share] verify_password query error:', fetchError)
        return json({ success: false, error: 'Failed to verify password' }, 500)
      }

      if (!profile) {
        return json({ success: false, error: 'Profile not found or not public' }, 404)
      }

      if (!profile.share_password_hash) {
        // No password set — allow access
        return json({ success: true })
      }

      const hashedInput = await hashPassword(password)
      if (hashedInput === profile.share_password_hash) {
        return json({ success: true })
      } else {
        return json({ success: false, error: 'Incorrect password' }, 401)
      }
    }

    // ------------------------------------------------------------------
    // All other actions: require JWT auth
    // ------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ success: false, error: 'Missing authorization' }, 401)
    }

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) {
      return json({ success: false, error: 'Unauthorized' }, 401)
    }

    // Verify user is an org member
    const { data: membership } = await anonClient
      .from('organization_memberships')
      .select('org_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return json({ success: false, error: 'Not a member of any organization' }, 403)
    }

    const orgId = membership.org_id

    // Service role client for writes (bypasses RLS)
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify the profile belongs to the user's org
    const { data: existingProfile, error: profileError } = await anonClient
      .from('client_fact_profiles')
      .select('id, share_token, is_public, share_password_hash, share_views, last_viewed_at, share_expires_at')
      .eq('id', profileId)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (profileError) {
      console.error('[fact-profile-share] profile lookup error:', profileError)
      return json({ success: false, error: 'Failed to look up profile' }, 500)
    }

    if (!existingProfile) {
      return json({ success: false, error: 'Fact profile not found' }, 404)
    }

    // ------------------------------------------------------------------
    // toggle_public
    // ------------------------------------------------------------------
    if (action === 'toggle_public') {
      const isPublic = body.is_public ?? !existingProfile.is_public

      const { error: updateError } = await serviceClient
        .from('client_fact_profiles')
        .update({ is_public: isPublic })
        .eq('id', profileId)

      if (updateError) {
        console.error('[fact-profile-share] toggle_public error:', updateError)
        return json({ success: false, error: 'Failed to update sharing status' }, 500)
      }

      const shareUrl = isPublic
        ? `${Deno.env.get('FRONTEND_URL') || 'https://app.use60.com'}/share/fact-profile/${existingProfile.share_token}`
        : null

      return json({ success: true, is_public: isPublic, share_url: shareUrl })
    }

    // ------------------------------------------------------------------
    // set_password
    // ------------------------------------------------------------------
    if (action === 'set_password') {
      const { password } = body
      if (!password || password.length < 4) {
        return json({ success: false, error: 'Password must be at least 4 characters' }, 400)
      }

      const hashed = await hashPassword(password)

      const { error: updateError } = await serviceClient
        .from('client_fact_profiles')
        .update({ share_password_hash: hashed })
        .eq('id', profileId)

      if (updateError) {
        console.error('[fact-profile-share] set_password error:', updateError)
        return json({ success: false, error: 'Failed to set password' }, 500)
      }

      return json({ success: true })
    }

    // ------------------------------------------------------------------
    // remove_password
    // ------------------------------------------------------------------
    if (action === 'remove_password') {
      const { error: updateError } = await serviceClient
        .from('client_fact_profiles')
        .update({ share_password_hash: null })
        .eq('id', profileId)

      if (updateError) {
        console.error('[fact-profile-share] remove_password error:', updateError)
        return json({ success: false, error: 'Failed to remove password' }, 500)
      }

      return json({ success: true })
    }

    // ------------------------------------------------------------------
    // set_expiry
    // ------------------------------------------------------------------
    if (action === 'set_expiry') {
      const expiresAt = body.expires_at ?? null

      const { error: updateError } = await serviceClient
        .from('client_fact_profiles')
        .update({ share_expires_at: expiresAt })
        .eq('id', profileId)

      if (updateError) {
        console.error('[fact-profile-share] set_expiry error:', updateError)
        return json({ success: false, error: 'Failed to set expiry' }, 500)
      }

      return json({ success: true, share_expires_at: expiresAt })
    }

    return json({ success: false, error: `Unknown action: ${action}` }, 400)
  } catch (error) {
    console.error('[fact-profile-share] Unexpected error:', error)
    return json({ success: false, error: 'Internal server error' }, 500)
  }
})
