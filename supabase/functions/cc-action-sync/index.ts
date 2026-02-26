// supabase/functions/cc-action-sync/index.ts
//
// CC-011: Bi-directional status sync — web UI actions to Slack.
// Called when a user approves or dismisses a Command Centre item in the web UI.
// Looks up the stored slack_message_ts + slack_channel_id on the item and calls
// Slack chat.update to replace the action buttons with a confirmation message.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';

serve(async (req: Request) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Missing authorization header', req, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', req, 401);

    const { item_id, action } = await req.json();
    if (!item_id || !action) return errorResponse('item_id and action are required', req, 400);

    // Use service client to read item (bypasses RLS for slack fields)
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Get the item's Slack message reference
    const { data: item, error: fetchError } = await serviceClient
      .from('command_centre_items')
      .select('slack_message_ts, slack_channel_id')
      .eq('id', item_id)
      .maybeSingle();

    if (fetchError || !item) {
      return jsonResponse({ synced: false, reason: 'Item not found' }, req);
    }

    if (!item.slack_message_ts || !item.slack_channel_id) {
      return jsonResponse({ synced: false, reason: 'No Slack message linked' }, req);
    }

    // Get user display name
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();

    const userName = profile?.full_name ?? 'A team member';

    // Build replacement message text based on action
    const statusText = action === 'approved'
      ? `Approved by ${userName}`
      : action === 'dismissed'
      ? `Dismissed by ${userName}`
      : `Updated by ${userName}`;

    const statusIcon = action === 'approved' ? ':white_check_mark:' : ':no_entry_sign:';

    // Call Slack chat.update to replace action buttons with status confirmation
    const slackToken = Deno.env.get('SLACK_BOT_TOKEN');
    if (!slackToken) {
      console.error('[cc-action-sync] SLACK_BOT_TOKEN not set');
      return jsonResponse({ synced: false, reason: 'Slack not configured' }, req);
    }

    const slackResponse = await fetch('https://slack.com/api/chat.update', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: item.slack_channel_id,
        ts: item.slack_message_ts,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${statusIcon} *${statusText}*`,
            },
          },
        ],
      }),
    });

    const slackResult = await slackResponse.json();

    if (!slackResult.ok) {
      console.error('[cc-action-sync] Slack update failed:', slackResult.error);
      return jsonResponse({ synced: false, reason: slackResult.error }, req);
    }

    console.log(`[cc-action-sync] Synced item ${item_id} action "${action}" to Slack`);
    return jsonResponse({ synced: true }, req);
  } catch (err) {
    console.error('[cc-action-sync] Error:', err);
    return errorResponse('Internal server error', req, 500);
  }
});
