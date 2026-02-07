// SLACK-002: Snooze re-notification cron job
// Checks for snoozed items that are due and re-sends notifications.
// Runs every 15 minutes via Vercel cron.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Verify cron auth
  const cronSecret = Deno.env.get('CRON_SECRET');
  const authHeader = req.headers.get('authorization');
  const isCron = req.headers.get('x-vercel-cron');
  const isServiceRole = authHeader?.replace('Bearer ', '') === supabaseServiceKey;

  if (!isCron && !isServiceRole && cronSecret) {
    const url = new URL(req.url);
    if (url.searchParams.get('secret') !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Find all snoozed items that are due
    const { data: dueItems, error } = await supabase
      .from('slack_snoozed_items')
      .select('id, org_id, user_id, entity_type, entity_id, original_message_blocks, original_context, notification_type, slack_user_id')
      .lte('snooze_until', new Date().toISOString())
      .is('resurfaced_at', null)
      .limit(50);

    if (error) {
      console.error('[SnoozeCheck] Query error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!dueItems || dueItems.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[SnoozeCheck] Found ${dueItems.length} due snoozed items`);

    let processed = 0;

    for (const item of dueItems) {
      try {
        // Get org's bot token
        const { data: orgSettings } = await supabase
          .from('slack_org_settings')
          .select('bot_access_token')
          .eq('org_id', item.org_id)
          .eq('is_connected', true)
          .maybeSingle();

        if (!orgSettings?.bot_access_token || !item.slack_user_id) {
          console.warn(`[SnoozeCheck] No bot token or slack user for item ${item.id}`);
          continue;
        }

        // Open DM channel
        const dmResponse = await fetch('https://slack.com/api/conversations.open', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${orgSettings.bot_access_token}`,
          },
          body: JSON.stringify({ users: item.slack_user_id }),
        });
        const dmData = await dmResponse.json();
        const dmChannelId = dmData.channel?.id;

        if (!dmChannelId) {
          console.warn(`[SnoozeCheck] Could not open DM for user ${item.slack_user_id}`);
          continue;
        }

        // Build re-notification message
        const entityName = (item.original_context as any)?.entityName || item.entity_id;
        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Snoozed reminder:* ${entityName}\n_This ${item.entity_type} was snoozed and is now due for your attention._`,
            },
          },
          { type: 'divider' },
          // Include original message blocks if available (max 10 to stay within limits)
          ...(Array.isArray(item.original_message_blocks)
            ? (item.original_message_blocks as any[]).slice(0, 10)
            : []),
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: 'Resurfaced from snooze' }],
          },
        ];

        // Send DM
        const sendResponse = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${orgSettings.bot_access_token}`,
          },
          body: JSON.stringify({
            channel: dmChannelId,
            blocks,
            text: `Snoozed reminder: ${entityName}`,
          }),
        });

        const sendData = await sendResponse.json();

        if (sendData.ok) {
          // Mark as resurfaced
          await supabase
            .from('slack_snoozed_items')
            .update({ resurfaced_at: new Date().toISOString() })
            .eq('id', item.id);

          processed++;
        } else {
          console.error(`[SnoozeCheck] Failed to send DM for item ${item.id}:`, sendData.error);
        }
      } catch (err) {
        console.error(`[SnoozeCheck] Error processing item ${item.id}:`, err);
      }
    }

    return new Response(JSON.stringify({ processed, total: dueItems.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[SnoozeCheck] Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
