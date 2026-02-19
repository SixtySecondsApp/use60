// SLACK-005: Action expiry daemon
// Finds HITL pending approvals past their expires_at and disables buttons.
// Runs hourly via Vercel cron.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req: Request) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

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
    // Find expired pending approvals
    const { data: expiredApprovals, error } = await supabase
      .from('hitl_pending_approvals')
      .select('id, org_id, resource_type, resource_name, slack_team_id, slack_channel_id, slack_message_ts')
      .eq('status', 'pending')
      .lte('expires_at', new Date().toISOString())
      .limit(100);

    if (error) {
      console.error('[ExpireActions] Query error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!expiredApprovals || expiredApprovals.length === 0) {
      return new Response(JSON.stringify({ expired: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[ExpireActions] Found ${expiredApprovals.length} expired approvals`);

    let processed = 0;

    for (const approval of expiredApprovals) {
      try {
        // Update status to expired
        await supabase
          .from('hitl_pending_approvals')
          .update({
            status: 'expired',
            actioned_at: new Date().toISOString(),
          })
          .eq('id', approval.id);

        // Try to update the original Slack message
        if (approval.slack_channel_id && approval.slack_message_ts) {
          // Get bot token for this org
          const { data: orgSettings } = await supabase
            .from('slack_org_settings')
            .select('bot_access_token')
            .eq('org_id', approval.org_id)
            .eq('is_connected', true)
            .maybeSingle();

          if (orgSettings?.bot_access_token) {
            const expiredBlocks = [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Expired* — ${approval.resource_name || approval.resource_type}\n_This action is no longer available (24-hour timeout)._`,
                },
              },
              {
                type: 'context',
                elements: [{ type: 'mrkdwn', text: `Expired at ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}` }],
              },
            ];

            await fetch('https://slack.com/api/chat.update', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${orgSettings.bot_access_token}`,
              },
              body: JSON.stringify({
                channel: approval.slack_channel_id,
                ts: approval.slack_message_ts,
                blocks: expiredBlocks,
                text: `Expired: ${approval.resource_name || approval.resource_type}`,
              }),
            });
          }
        }

        processed++;
      } catch (err) {
        console.error(`[ExpireActions] Error expiring approval ${approval.id}:`, err);
      }
    }

    return new Response(JSON.stringify({ expired: processed, total: expiredApprovals.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[ExpireActions] Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
