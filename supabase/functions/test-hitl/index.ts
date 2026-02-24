// supabase/functions/test-hitl/index.ts
// Test endpoint for HITL approval flow

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { buildHITLApprovalMessage, type HITLApprovalData } from '../_shared/slackBlocks.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const appUrl = Deno.env.get('APP_URL') || 'https://app.use60.com';

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Parse request body for optional channel_id
    let body: { channel_id?: string } = {};
    try {
      body = await req.json();
    } catch {
      // No body provided, that's ok
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get a Slack connection to test with
    const { data: slackConnection, error: connError } = await supabase
      .from('slack_org_settings')
      .select('org_id, slack_team_id, bot_access_token')
      .eq('is_connected', true)
      .limit(1)
      .single();

    if (connError || !slackConnection) {
      return new Response(
        JSON.stringify({ error: 'No Slack connection found', details: connError }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use provided channel_id or try to find one from slack_channels
    let channelId = body.channel_id;

    if (!channelId) {
      // Try to get a channel from slack_channels table
      const { data: channelConfig } = await supabase
        .from('slack_channels')
        .select('channel_id')
        .eq('org_id', slackConnection.org_id)
        .limit(1)
        .maybeSingle();

      channelId = channelConfig?.channel_id;
    }

    if (!channelId) {
      return new Response(
        JSON.stringify({
          error: 'No channel_id provided and no configured channels found',
          hint: 'POST with { "channel_id": "C12345678" } to specify a Slack channel'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create a test follow-up email content
    const testContent = {
      recipient: 'sarah.jones@acme.com',
      subject: 'Great chatting today - next steps for Q2 pipeline',
      body: `Hi Sarah,

Great speaking with you today about your Q2 pipeline challenges. As discussed, I wanted to follow up with a few resources:

1. The TechCorp case study showing 40% improvement in pipeline velocity
2. Our implementation timeline for the integration you mentioned
3. Pricing details for the Enterprise tier

Would Thursday at 2pm work for a follow-up call to discuss next steps?

Best regards,
Andrew`,
    };

    // First, send the message to Slack to get the message timestamp
    const approvalId = crypto.randomUUID();

    const hitlData: HITLApprovalData = {
      approvalId,
      resourceType: 'email_draft',
      resourceId: `draft_${approvalId.slice(0, 8)}`,
      resourceName: 'Follow-up Email',
      content: testContent,
      context: {
        dealName: 'Acme Corp - Enterprise Deal',
        contactName: 'Sarah Jones',
        meetingTitle: 'Discovery Call - Q2 Pipeline Review',
      },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      appUrl,
    };

    const message = buildHITLApprovalMessage(hitlData);

    // Send to Slack
    const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackConnection.bot_access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        blocks: message.blocks,
        text: message.text,
      }),
    });

    const slackResult = await slackResponse.json();

    if (!slackResult.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to send Slack message', slack_error: slackResult.error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Now create the HITL approval record with the message timestamp
    const { error: insertError } = await supabase
      .from('hitl_pending_approvals')
      .insert({
        id: approvalId,
        org_id: slackConnection.org_id,
        resource_type: 'email_draft',
        resource_id: hitlData.resourceId,
        resource_name: hitlData.resourceName,
        slack_team_id: slackConnection.slack_team_id,
        slack_channel_id: channelId,
        slack_message_ts: slackResult.ts,
        original_content: testContent,
        status: 'pending',
        expires_at: hitlData.expiresAt,
        metadata: {
          test: true,
          context: hitlData.context,
        },
      });

    if (insertError) {
      console.error('Failed to create approval record:', insertError);
      return new Response(
        JSON.stringify({
          error: 'Message sent but failed to create approval record',
          details: insertError,
          slack_ts: slackResult.ts
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        approval_id: approvalId,
        channel_id: channelId,
        message_ts: slackResult.ts,
        message: 'HITL approval message sent! Click Approve, Edit, or Reject in Slack to test.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in test-hitl:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
