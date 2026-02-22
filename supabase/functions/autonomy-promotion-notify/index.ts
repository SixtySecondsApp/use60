// supabase/functions/autonomy-promotion-notify/index.ts
// Sends promotion suggestions via Slack and evaluates demotion triggers (PRD-24, GRAD-003)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { refreshAnalytics } from '../_shared/orchestrator/autonomyAnalytics.ts';
import { evaluatePromotions, createPromotionSuggestions } from '../_shared/orchestrator/promotionEngine.ts';
import { evaluateDemotions, clearExpiredCooldowns } from '../_shared/orchestrator/demotionHandler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ACTION_LABELS: Record<string, string> = {
  crm_stage_change: 'CRM Stage Changes',
  crm_field_update: 'CRM Field Updates',
  crm_contact_create: 'Contact Creation',
  send_email: 'Email Sending',
  send_slack: 'Slack Messages',
  create_task: 'Task Creation',
  enrich_contact: 'Contact Enrichment',
  draft_proposal: 'Proposal Drafts',
};

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json().catch(() => ({}));
    const orgId = body.orgId;

    if (!orgId) {
      return new Response(
        JSON.stringify({ error: 'orgId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Refresh analytics
    await refreshAnalytics(supabase, orgId);

    // Clear expired cooldowns
    await clearExpiredCooldowns(supabase, orgId);

    // Evaluate demotions first
    await evaluateDemotions(supabase, orgId);

    // Evaluate promotions
    const candidates = await evaluatePromotions(supabase, orgId);

    if (candidates.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, promotions: 0, message: 'No promotion candidates' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create promotion suggestions
    await createPromotionSuggestions(supabase, orgId, candidates);

    // Send Slack notifications
    const { data: slackSettings } = await supabase
      .from('slack_org_settings')
      .select('bot_access_token, default_channel_id')
      .eq('org_id', orgId)
      .eq('is_connected', true)
      .maybeSingle();

    if (slackSettings?.bot_access_token) {
      // Get the admin users to DM
      const { data: admins } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('org_id', orgId)
        .eq('role', 'admin')
        .limit(3);

      for (const candidate of candidates) {
        const label = ACTION_LABELS[candidate.actionType] || candidate.actionType;
        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `:arrow_up: *Autonomy Promotion Suggestion*\n\n*${label}*: ${candidate.evidence.approvalCount} approved, ${candidate.evidence.rejectionCount} corrections in ${candidate.evidence.windowDays} days (${candidate.evidence.approvalRate}% approval rate).\n\nUpgrade from *${candidate.currentPolicy}* → *${candidate.proposedPolicy}*?`,
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Approve' },
                action_id: 'autonomy_promotion_approve',
                value: JSON.stringify({ orgId, actionType: candidate.actionType }),
                style: 'primary',
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Snooze 30 Days' },
                action_id: 'autonomy_promotion_snooze',
                value: JSON.stringify({ orgId, actionType: candidate.actionType }),
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Reject' },
                action_id: 'autonomy_promotion_reject',
                value: JSON.stringify({ orgId, actionType: candidate.actionType }),
                style: 'danger',
              },
            ],
          },
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: 'This suggestion is based on your team\'s approval patterns. You can manage autonomy in Settings > Agent Autonomy.' }],
          },
        ];

        // Post to the org's configured channel or DM admins
        if (slackSettings.default_channel_id) {
          await postSlackBlocks(slackSettings.bot_access_token, slackSettings.default_channel_id, blocks);
        } else if (admins && admins.length > 0) {
          // DM the first admin
          const { data: adminMapping } = await supabase
            .from('slack_user_mappings')
            .select('slack_user_id')
            .eq('org_id', orgId)
            .eq('sixty_user_id', admins[0].user_id)
            .maybeSingle();

          if (adminMapping?.slack_user_id) {
            // Open DM channel
            const openRes = await fetch('https://slack.com/api/conversations.open', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${slackSettings.bot_access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ users: adminMapping.slack_user_id }),
            });
            const openData = await openRes.json();
            if (openData.ok && openData.channel?.id) {
              await postSlackBlocks(slackSettings.bot_access_token, openData.channel.id, blocks);
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, promotions: candidates.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[autonomy-promotion-notify] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function postSlackBlocks(botToken: string, channel: string, blocks: unknown[]): Promise<void> {
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      text: 'Autonomy promotion suggestion',
      blocks,
    }),
  });
}
