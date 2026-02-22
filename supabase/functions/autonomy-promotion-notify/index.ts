// supabase/functions/autonomy-promotion-notify/index.ts
// Delivers pending autonomy promotion suggestions via Slack DM (preferred) or in-app notification.
// Called by cron/scheduler with service role — no user JWT required.
// PRD-24, GRAD-003

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { getSlackOrgSettings } from '../_shared/proactive/settings.ts';
import { getSlackRecipients } from '../_shared/proactive/recipients.ts';
import { sendSlackDM } from '../_shared/proactive/deliverySlack.ts';
import { deliverToInApp } from '../_shared/proactive/deliveryInApp.ts';
import type { ProactiveNotificationPayload } from '../_shared/proactive/types.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// =============================================================================
// Types
// =============================================================================

interface PendingPromotion {
  id: string;
  org_id: string;
  action_type: string;
  current_policy: string;
  proposed_policy: string;
  evidence: {
    approvalRate: number;
    totalActions: number;
    windowDays: number;
    rejectionRate: number;
    avgEditRate: number;
    approvalCount: number;
    rejectionCount: number;
    editCount: number;
  };
  status: string;
  notified_at: string | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  crm_stage_change: 'CRM stage changes',
  crm_field_update: 'CRM field updates',
  crm_contact_create: 'Contact creation',
  send_email: 'Email sending',
  send_slack: 'Slack messages',
  create_task: 'Task creation',
  enrich_contact: 'Contact enrichment',
  draft_proposal: 'Proposal drafts',
};

// =============================================================================
// Slack Block Builders
// =============================================================================

function buildPromotionSlackBlocks(promotion: PendingPromotion): { blocks: unknown[]; text: string } {
  const label = ACTION_LABELS[promotion.action_type] || promotion.action_type.replace(/_/g, ' ');
  const { approvalCount, rejectionCount, windowDays } = promotion.evidence;

  const summaryText = `*${label}*: ${approvalCount} approved, ${rejectionCount} corrections in ${windowDays} days. Auto-approve this action?`;
  const detailText = `Current policy: _${promotion.current_policy}_ | Proposed: *${promotion.proposed_policy}*`;

  const actionValue = JSON.stringify({
    promotion_id: promotion.id,
    org_id: promotion.org_id,
    action_type: promotion.action_type,
  });

  const blocks = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: summaryText },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: detailText },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Yes', emoji: false },
          style: 'primary',
          action_id: 'autonomy_promotion_approve',
          value: actionValue,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'No', emoji: false },
          action_id: 'autonomy_promotion_reject',
          value: actionValue,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Not Now', emoji: false },
          action_id: 'autonomy_promotion_snooze',
          value: actionValue,
        },
      ],
    },
  ];

  const fallbackText = `${label}: ${approvalCount} approved, ${rejectionCount} corrections in ${windowDays} days. Auto-approve this action?`;

  return { blocks, text: fallbackText };
}

// =============================================================================
// Core Logic
// =============================================================================

async function processPromotionNotifications(
  serviceClient: ReturnType<typeof createClient>
): Promise<{ processed: number; slackSent: number; inAppSent: number; errors: number }> {
  const stats = { processed: 0, slackSent: 0, inAppSent: 0, errors: 0 };

  // Fetch pending promotions that have not been notified yet
  const { data: pendingPromotions, error: fetchError } = await serviceClient
    .from('autonomy_promotion_queue')
    .select('id, org_id, action_type, current_policy, proposed_policy, evidence, status, notified_at, created_at')
    .eq('status', 'pending')
    .is('notified_at', null)
    .order('created_at', { ascending: true })
    .limit(50);

  if (fetchError) {
    console.error('[autonomy-promotion-notify] Error fetching pending promotions:', fetchError);
    return stats;
  }

  if (!pendingPromotions || pendingPromotions.length === 0) {
    console.log('[autonomy-promotion-notify] No pending promotions to notify');
    return stats;
  }

  console.log(`[autonomy-promotion-notify] Processing ${pendingPromotions.length} pending promotions`);

  // Group by org_id for efficient Slack settings lookup
  const byOrg = new Map<string, PendingPromotion[]>();
  for (const p of pendingPromotions as PendingPromotion[]) {
    const list = byOrg.get(p.org_id) || [];
    list.push(p);
    byOrg.set(p.org_id, list);
  }

  for (const [orgId, promotions] of byOrg) {
    // Get Slack settings for this org
    const slackSettings = await getSlackOrgSettings(serviceClient, orgId);

    // Get recipients (org members with Slack mapping)
    const recipients = await getSlackRecipients(serviceClient, orgId);

    if (!recipients || recipients.length === 0) {
      console.log(`[autonomy-promotion-notify] No Slack recipients for org ${orgId}, falling back to in-app`);
    }

    for (const promotion of promotions) {
      stats.processed++;

      const { blocks, text } = buildPromotionSlackBlocks(promotion);
      let delivered = false;

      // Try Slack delivery first
      if (slackSettings?.botAccessToken && recipients.length > 0) {
        for (const recipient of recipients) {
          try {
            const result = await sendSlackDM({
              botToken: slackSettings.botAccessToken,
              slackUserId: recipient.slackUserId,
              blocks,
              text,
            });

            if (result.success) {
              stats.slackSent++;
              delivered = true;
              console.log(`[autonomy-promotion-notify] Slack DM sent to ${recipient.slackUserId} for promotion ${promotion.id}`);
            } else {
              console.warn(`[autonomy-promotion-notify] Slack DM failed for ${recipient.slackUserId}: ${result.error}`);
            }
          } catch (err) {
            console.error(`[autonomy-promotion-notify] Error sending Slack DM to ${recipient.slackUserId}:`, err);
          }
        }
      }

      // Fall back to in-app for all recipients if Slack failed or unavailable
      if (!delivered) {
        for (const recipient of recipients) {
          try {
            const payload: ProactiveNotificationPayload = {
              type: 'morning_brief', // Closest existing type for autonomy notifications
              orgId,
              recipientUserId: recipient.userId,
              title: 'Autonomy Promotion Suggestion',
              message: text,
              inAppType: 'info',
              inAppCategory: 'system',
              metadata: {
                promotion_id: promotion.id,
                action_type: promotion.action_type,
                current_policy: promotion.current_policy,
                proposed_policy: promotion.proposed_policy,
              },
              actionUrl: '/settings?tab=autonomy',
            };

            const result = await deliverToInApp(serviceClient, payload);
            if (result.created) {
              stats.inAppSent++;
              delivered = true;
            }
          } catch (err) {
            console.error(`[autonomy-promotion-notify] In-app fallback error:`, err);
          }
        }
      }

      // Mark as notified regardless of delivery success to avoid infinite retries
      const { error: updateError } = await serviceClient
        .from('autonomy_promotion_queue')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', promotion.id);

      if (updateError) {
        console.error(`[autonomy-promotion-notify] Error marking promotion ${promotion.id} as notified:`, updateError);
        stats.errors++;
      }

      if (!delivered) {
        stats.errors++;
        console.warn(`[autonomy-promotion-notify] Could not deliver promotion ${promotion.id} via any channel`);
      }
    }
  }

  return stats;
}

// =============================================================================
// Edge Function Handler
// =============================================================================

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const stats = await processPromotionNotifications(serviceClient);

    console.log('[autonomy-promotion-notify] Complete:', JSON.stringify(stats));

    return new Response(JSON.stringify({ ok: true, ...stats }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[autonomy-promotion-notify] Unhandled error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
