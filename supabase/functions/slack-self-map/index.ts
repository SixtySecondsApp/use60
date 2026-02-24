// supabase/functions/slack-self-map/index.ts
// Allows a user to safely map ONLY themselves to a Slack user in their org.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { getAuthContext, requireOrgRole } from '../_shared/edgeAuth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Body = {
  orgId?: string;
  slackUserId?: string;
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
    const slackUserId = body.slackUserId?.trim() || null;

    if (!orgId) {
      return new Response(
        JSON.stringify({ success: false, error: 'orgId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Require membership (any role is fine)
    await requireOrgRole(supabase, orgId, auth.userId, ['owner', 'admin', 'member', 'readonly']);

    // Get user email for safe email matching
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', auth.userId)
      .single();
    const userEmail = (profile?.email || '').toLowerCase();

    if (!userEmail) {
      return new Response(
        JSON.stringify({ success: false, error: 'User email not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find mapping row
    let mapping: any = null;

    if (slackUserId) {
      const { data, error } = await supabase
        .from('slack_user_mappings')
        .select('id, org_id, slack_user_id, slack_username, slack_email, sixty_user_id')
        .eq('org_id', orgId)
        .eq('slack_user_id', slackUserId)
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              'Slack user not found in mappings. Have the user DM the Sixty bot once in Slack, then try again.',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      mapping = data;

      // If Slack email is present, require it matches the authenticated user's email.
      const slackEmail = (mapping.slack_email || '').toLowerCase();
      if (slackEmail && slackEmail !== userEmail) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `This Slack user email (${mapping.slack_email}) does not match your account email.`,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Email match flow: find the Slack user mapping row by email
      const { data, error } = await supabase
        .from('slack_user_mappings')
        .select('id, org_id, slack_user_id, slack_username, slack_email, sixty_user_id')
        .eq('org_id', orgId)
        .eq('slack_email', userEmail)
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              'No Slack mapping found for your email yet. Please DM the Sixty bot in Slack once, then retry.',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      mapping = data;
    }

    // Prevent hijacking someone else's mapping
    if (mapping.sixty_user_id && mapping.sixty_user_id !== auth.userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'This Slack user is already mapped to another user.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update mapping
    const { error: updateError } = await supabase
      .from('slack_user_mappings')
      .update({ sixty_user_id: auth.userId })
      .eq('id', mapping.id);

    if (updateError) {
      return new Response(
        JSON.stringify({ success: false, error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        mapping: {
          slackUserId: mapping.slack_user_id,
          slackUsername: mapping.slack_username,
          slackEmail: mapping.slack_email,
          sixtyUserId: auth.userId,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});













