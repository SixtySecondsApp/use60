// supabase/functions/fathom-update-user-mapping/index.ts
// Allows org admins to map any Fathom user email to any Sixty user in their org.
// Also reassigns historical meetings for that email.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { getAuthContext, requireOrgRole } from '../_shared/edgeAuth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Body = {
  orgId: string;
  fathomUserEmail: string;
  sixtyUserId: string | null; // null to unmap
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
    const { orgId, fathomUserEmail, sixtyUserId } = body;

    if (!orgId) {
      return new Response(
        JSON.stringify({ success: false, error: 'orgId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!fathomUserEmail) {
      return new Response(
        JSON.stringify({ success: false, error: 'fathomUserEmail required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Require admin role for org-wide mapping management
    await requireOrgRole(supabase, orgId, auth.userId, ['owner', 'admin']);

    const normalizedEmail = fathomUserEmail.trim().toLowerCase();

    // If sixtyUserId is provided, verify they are a member of this org
    if (sixtyUserId) {
      const { data: membership, error: membershipError } = await supabase
        .from('organization_memberships')
        .select('user_id')
        .eq('org_id', orgId)
        .eq('user_id', sixtyUserId)
        .maybeSingle();

      if (membershipError || !membership) {
        return new Response(
          JSON.stringify({ success: false, error: 'Target user is not a member of this organization' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Find existing mapping
    const { data: existingMapping, error: lookupError } = await supabase
      .from('fathom_user_mappings')
      .select('id, sixty_user_id, fathom_user_name')
      .eq('org_id', orgId)
      .eq('fathom_user_email', normalizedEmail)
      .maybeSingle();

    if (lookupError) {
      console.error('[fathom-update-user-mapping] Lookup error:', lookupError.message);
      return new Response(
        JSON.stringify({ success: false, error: 'Database error during lookup' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the target user's name if mapping to someone
    let targetUserName: string | null = null;
    if (sixtyUserId) {
      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', sixtyUserId)
        .single();

      targetUserName = [targetProfile?.first_name, targetProfile?.last_name]
        .filter(Boolean)
        .join(' ') || targetProfile?.email || null;
    }

    let mappingId: string;

    if (!existingMapping) {
      // Create new mapping
      const { data: newMapping, error: insertError } = await supabase
        .from('fathom_user_mappings')
        .insert({
          org_id: orgId,
          fathom_user_email: normalizedEmail,
          fathom_user_name: targetUserName,
          sixty_user_id: sixtyUserId,
          is_auto_matched: false,
          last_seen_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('[fathom-update-user-mapping] Insert error:', insertError.message);
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
          sixty_user_id: sixtyUserId,
          fathom_user_name: targetUserName || existingMapping.fathom_user_name,
          is_auto_matched: false, // Admin mappings are never auto-matched
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingMapping.id);

      if (updateError) {
        console.error('[fathom-update-user-mapping] Update error:', updateError.message);
        return new Response(
          JSON.stringify({ success: false, error: updateError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      mappingId = existingMapping.id;
    }

    // BACKFILL: Reassign existing meetings with this owner_email
    let meetingsBackfilled = 0;

    if (sixtyUserId) {
      // Map meetings to the new user
      console.log(`[fathom-update-user-mapping] Backfilling meetings for ${normalizedEmail} -> user ${sixtyUserId}`);
      
      const { data: updatedMeetings, error: backfillError } = await supabase
        .from('meetings')
        .update({ 
          owner_user_id: sixtyUserId,
          updated_at: new Date().toISOString(),
        })
        .eq('org_id', orgId)
        .eq('owner_email', normalizedEmail)
        .neq('owner_user_id', sixtyUserId) // Only update if not already correct
        .select('id');

      if (backfillError) {
        console.warn('[fathom-update-user-mapping] Backfill warning:', backfillError.message);
      } else {
        meetingsBackfilled = updatedMeetings?.length || 0;
        console.log(`[fathom-update-user-mapping] Backfilled ${meetingsBackfilled} meetings`);
      }
    } else {
      // Unmapping - set meetings to null owner_user_id
      // Note: This may not be desired behavior - we might want to leave them assigned
      // For now, we'll leave existing assignments alone when unmapping
      console.log(`[fathom-update-user-mapping] Unmapping ${normalizedEmail} - leaving existing meeting assignments unchanged`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        mapping: {
          id: mappingId,
          fathomUserEmail: normalizedEmail,
          sixtyUserId: sixtyUserId,
          targetUserName: targetUserName,
        },
        meetingsBackfilled,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[fathom-update-user-mapping] Error:', error?.message || error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});












