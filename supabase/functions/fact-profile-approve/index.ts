/**
 * fact-profile-approve -- Public edge function for fact profile approval actions.
 *
 * Actions:
 *   approve          -- Set approval_status='approved', record reviewer name + timestamp
 *   request_changes  -- Set approval_status='changes_requested', record feedback + reviewer
 *   track_view       -- Increment share_views counter and update last_viewed_at
 *   verify_password  -- Verify a share password against the stored hash
 *
 * Auth: NONE required (public page). Uses service role to update the table.
 * Service role justification: public page needs to update approval_status and
 * track views without authentication.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
} from '../_shared/corsHelper.ts'

// ---------------------------------------------------------------------------
// Explicit column selection (never use select('*'))
// ---------------------------------------------------------------------------

const PROFILE_COLUMNS =
  'id, approval_status, approved_by, approved_at, approval_feedback, share_token, is_public, share_password_hash, share_views, last_viewed_at, share_expires_at'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RequestBody {
  action: 'approve' | 'request_changes' | 'track_view' | 'verify_password'
  share_token: string
  reviewer_name?: string
  feedback?: string
  password?: string
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  const corsHeaders = getCorsHeaders(req)

  try {
    // Only accept POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body: RequestBody = await req.json()
    const { action, share_token, reviewer_name, feedback, password } = body

    // Validate required fields
    if (!action || !share_token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: action, share_token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create service role client (public page -- no user auth)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // -----------------------------------------------------------------------
    // Action: track_view -- lightweight, no validation needed
    // -----------------------------------------------------------------------
    if (action === 'track_view') {
      const { error } = await supabaseAdmin.rpc('increment_fact_profile_views', {
        p_share_token: share_token,
      })

      // Fallback: if the RPC doesn't exist, do a manual update
      if (error) {
        // Get current profile
        const { data: profile } = await supabaseAdmin
          .from('client_fact_profiles')
          .select('id, share_views')
          .eq('share_token', share_token)
          .eq('is_public', true)
          .maybeSingle()

        if (profile) {
          await supabaseAdmin
            .from('client_fact_profiles')
            .update({
              share_views: (profile.share_views || 0) + 1,
              last_viewed_at: new Date().toISOString(),
            })
            .eq('id', profile.id)
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // -----------------------------------------------------------------------
    // Action: verify_password
    // -----------------------------------------------------------------------
    if (action === 'verify_password') {
      if (!password) {
        return new Response(
          JSON.stringify({ success: false, error: 'Password is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: profile } = await supabaseAdmin
        .from('client_fact_profiles')
        .select('id, share_password_hash')
        .eq('share_token', share_token)
        .eq('is_public', true)
        .maybeSingle()

      if (!profile) {
        return new Response(
          JSON.stringify({ success: false, error: 'Profile not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!profile.share_password_hash) {
        // No password set -- allow access
        return new Response(
          JSON.stringify({ success: true, verified: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Simple hash comparison using Web Crypto API
      const encoder = new TextEncoder()
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password))
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

      const isValid = hashHex === profile.share_password_hash

      return new Response(
        JSON.stringify({ success: true, verified: isValid }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // -----------------------------------------------------------------------
    // Actions: approve / request_changes -- require profile lookup + validation
    // -----------------------------------------------------------------------
    if (action !== 'approve' && action !== 'request_changes') {
      return new Response(
        JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch the profile by share_token
    const { data: profile, error: fetchError } = await supabaseAdmin
      .from('client_fact_profiles')
      .select(PROFILE_COLUMNS)
      .eq('share_token', share_token)
      .eq('is_public', true)
      .maybeSingle()

    if (fetchError || !profile) {
      return new Response(
        JSON.stringify({ success: false, error: 'Profile not found or not publicly shared' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check the profile is in a reviewable state
    if (profile.approval_status !== 'pending_review') {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Profile cannot be reviewed in its current state (${profile.approval_status})`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check expiry
    if (profile.share_expires_at && new Date(profile.share_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: 'This share link has expired' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build update payload
    const updatePayload: Record<string, unknown> = {
      approved_by: reviewer_name || 'Anonymous Reviewer',
      updated_at: new Date().toISOString(),
    }

    if (action === 'approve') {
      updatePayload.approval_status = 'approved'
      updatePayload.approved_at = new Date().toISOString()
    } else {
      // request_changes
      updatePayload.approval_status = 'changes_requested'
      updatePayload.approval_feedback = feedback || 'Changes requested (no details provided)'
    }

    const { error: updateError } = await supabaseAdmin
      .from('client_fact_profiles')
      .update(updatePayload)
      .eq('id', profile.id)

    if (updateError) {
      console.error('[fact-profile-approve] Update failed:', updateError)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, action }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[fact-profile-approve] Unhandled error:', err)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
