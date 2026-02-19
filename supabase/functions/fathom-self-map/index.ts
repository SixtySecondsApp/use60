// supabase/functions/fathom-self-map/index.ts
// Allows a user to safely map ONLY themselves to a Fathom user email in their org.
// Pattern: Mirrors slack-self-map functionality.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { getAuthContext, requireOrgRole } from '../_shared/edgeAuth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Body = {
  orgId?: string;
  fathomUserEmail?: string; // Optional: if omitted, use the user's own email
};

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const auth = await getAuthContext(req, supabase, supabaseServiceKey);

    if (auth.mode !== 'user' || !auth.userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const orgId = body.orgId;
    let fathomUserEmail = body.fathomUserEmail?.trim().toLowerCase() || null;

    if (!orgId) {
      return new Response(
        JSON.stringify({ success: false, error: 'orgId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Require membership (any role is fine for self-mapping)
    await requireOrgRole(supabase, orgId, auth.userId, ['owner', 'admin', 'member', 'readonly']);

    // Get user email from their profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, first_name, last_name')
      .eq('id', auth.userId)
      .single();
    
    const userEmail = (profile?.email || '').toLowerCase();
    const userName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || userEmail;

    if (!userEmail) {
      return new Response(
        JSON.stringify({ success: false, error: 'User email not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If no fathomUserEmail provided, use the user's own email (auto-match scenario)
    if (!fathomUserEmail) {
      fathomUserEmail = userEmail;
    }

    // Find existing mapping row for this Fathom email
    const { data: existingMapping, error: lookupError } = await supabase
      .from('fathom_user_mappings')
      .select('id, org_id, fathom_user_email, fathom_user_name, sixty_user_id, is_auto_matched')
      .eq('org_id', orgId)
      .eq('fathom_user_email', fathomUserEmail)
      .maybeSingle();

    if (lookupError) {
      console.error('[fathom-self-map] Lookup error:', lookupError.message);
      return new Response(
        JSON.stringify({ success: false, error: 'Database error during lookup' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If mapping exists but is already mapped to a different user, reject
    if (existingMapping && existingMapping.sixty_user_id && existingMapping.sixty_user_id !== auth.userId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'This Fathom email is already mapped to another user.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If mapping doesn't exist, create it; otherwise update it
    let mappingId: string;
    const isAutoMatch = fathomUserEmail === userEmail;

    if (!existingMapping) {
      // Create new mapping
      const { data: newMapping, error: insertError } = await supabase
        .from('fathom_user_mappings')
        .insert({
          org_id: orgId,
          fathom_user_email: fathomUserEmail,
          fathom_user_name: userName,
          sixty_user_id: auth.userId,
          is_auto_matched: isAutoMatch,
          last_seen_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('[fathom-self-map] Insert error:', insertError.message);
        return new Response(
          JSON.stringify({ success: false, error: insertError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      mappingId = newMapping.id;
    } else {
      // Update existing mapping
      const { error: updateError } = await supabase
        .from('fathom_user_mappings')
        .update({
          sixty_user_id: auth.userId,
          fathom_user_name: userName,
          is_auto_matched: isAutoMatch,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingMapping.id);

      if (updateError) {
        console.error('[fathom-self-map] Update error:', updateError.message);
        return new Response(
          JSON.stringify({ success: false, error: updateError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      mappingId = existingMapping.id;
    }

    // BACKFILL: Reassign existing meetings with this owner_email to this user
    // This ensures historical meetings are correctly attributed
    console.log(`[fathom-self-map] Backfilling meetings for ${fathomUserEmail} -> user ${auth.userId}`);
    
    const { data: updatedMeetings, error: backfillError } = await supabase
      .from('meetings')
      .update({ 
        owner_user_id: auth.userId,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)
      .eq('owner_email', fathomUserEmail)
      .neq('owner_user_id', auth.userId) // Only update if not already correct
      .select('id');

    const meetingsBackfilled = updatedMeetings?.length || 0;
    
    if (backfillError) {
      console.warn('[fathom-self-map] Backfill warning:', backfillError.message);
      // Don't fail the request, just log the warning
    } else {
      console.log(`[fathom-self-map] Backfilled ${meetingsBackfilled} meetings`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        mapping: {
          id: mappingId,
          fathomUserEmail: fathomUserEmail,
          sixtyUserId: auth.userId,
          isAutoMatched: isAutoMatch,
        },
        meetingsBackfilled,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[fathom-self-map] Error:', error?.message || error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});












