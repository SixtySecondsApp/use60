import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DisconnectRequest {
  delete_synced_meetings?: boolean
}

/**
 * Extract bearer token from Authorization header (same as edgeAuth.ts)
 */
function normalizeBearer(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const v = authHeader.trim();
  if (!v.toLowerCase().startsWith('bearer ')) return null;
  const remainder = v.slice('bearer '.length).trim();
  const firstToken = remainder.split(/[,\s]+/)[0]?.trim() ?? '';
  return firstToken || null;
}

/**
 * Fathom Disconnect Edge Function (Per-User)
 *
 * Purpose:
 * - Allow any user to disconnect their own Fathom integration
 * - Optionally delete all Fathom-synced meetings owned by that user
 *
 * Security:
 * - Requires a valid user session
 * - Users can only disconnect their own integration
 *
 * Note: This is a per-user integration - each user manages their own Fathom connection.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('[fathom-disconnect] Function started')

    const body: DisconnectRequest = await req.json().catch(() => ({} as DisconnectRequest))
    const deleteSyncedMeetings = !!body.delete_synced_meetings

    // Service role client for operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    // Get authenticated user from Supabase context
    // The edge runtime has already validated the JWT - we can get the user ID from the request
    // The auth_user field in the metadata shows the validated user: ac4efca2-1fe1-49b3-9d5e-6ac3d8bf3459

    // Try to get user from Authorization header first
    const authHeader = req.headers.get('Authorization')
    console.log('[fathom-disconnect] Auth header present:', !!authHeader)

    let userId: string | null = null;

    if (authHeader) {
      // Extract token and decode to get user ID
      const token = normalizeBearer(authHeader);
      if (token) {
        try {
          // Decode JWT to get user ID (already validated by Supabase runtime)
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            userId = payload.sub;
            console.log('[fathom-disconnect] User ID from JWT:', userId);
          }
        } catch (err) {
          console.error('[fathom-disconnect] Failed to decode JWT:', err);
        }
      }
    }

    if (!userId) {
      console.error('[fathom-disconnect] No user ID found');
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: no user found' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[fathom-disconnect] ✅ User authenticated:', userId)

    // Verify user has an active integration
    const { data: existingIntegration } = await supabase
      .from('fathom_integrations')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle()

    if (!existingIntegration) {
      return new Response(
        JSON.stringify({ success: false, error: 'No active Fathom integration found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Optionally delete user's meetings synced from Fathom
    if (deleteSyncedMeetings) {
      const { error: delMeetingsError } = await supabase
        .from('meetings')
        .delete()
        .eq('owner_user_id', userId)
        .not('fathom_recording_id', 'is', null)

      if (delMeetingsError) {
        // Non-fatal: proceed with disconnect
        console.error('[fathom-disconnect] Failed to delete meetings:', delMeetingsError)
      }
    }

    // Delete sync state
    const { error: deleteSyncError } = await supabase
      .from('fathom_sync_state')
      .delete()
      .eq('user_id', userId)

    if (deleteSyncError) {
      console.error('[fathom-disconnect] Failed to delete sync state:', deleteSyncError)
    }

    // Delete integration record entirely (ensures fresh token on reconnect)
    const { error: deleteIntegrationError } = await supabase
      .from('fathom_integrations')
      .delete()
      .eq('user_id', userId)

    if (deleteIntegrationError) {
      throw new Error(`Failed to delete integration: ${deleteIntegrationError.message}`)
    }

    console.log(`[fathom-disconnect] Successfully disconnected Fathom for user ${userId}`)

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        deleted_meetings: deleteSyncedMeetings
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
