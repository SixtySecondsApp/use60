/**
 * Re-engagement Slack HITL Delivery Adapter
 *
 * REN-006: Sends Slack approval messages for qualified re-engagement opportunities
 * to deal owners. Each message shows signal summary, draft email preview, and
 * HITL action buttons (Approve & Send / Edit Draft / Snooze 30d / Dismiss).
 *
 * Routing in slack-interactive/index.ts handles `reengagement_*::` action_ids.
 * Approved emails are forwarded via the email-send adapter.
 * Dismissed signals update watchlist status to 'removed'.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';
import {
  buildReengagementApprovalMessage,
  type ReengagementApprovalData,
} from '../../slackBlocks.ts';
import type { ScoredDeal } from './reengagementScorer.ts';

// =============================================================================
// Types
// =============================================================================

interface EmailDraft {
  deal_id: string;
  deal_name: string;
  company_name: string | null;
  contact_name: string;
  contact_email: string;
  subject: string;
  body: string;
  signal_summary: string;
  score: number;
  recommended_approach?: string;
}

interface DeliveryResult {
  deal_id: string;
  deal_name: string;
  owner_id: string;
  owner_slack_user_id: string | null;
  sent: boolean;
  error?: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Open a Slack DM channel with a user and send a message.
 */
async function sendSlackDM(
  botToken: string,
  slackUserId: string,
  messagePayload: ReturnType<typeof buildReengagementApprovalMessage>
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Open DM channel
    const openResp = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ users: slackUserId }),
    });

    const openData: { ok: boolean; channel?: { id: string }; error?: string } =
      await openResp.json();

    if (!openData.ok || !openData.channel?.id) {
      return { success: false, error: `conversations.open failed: ${openData.error}` };
    }

    const channelId = openData.channel.id;

    // 2. Post message
    const postResp = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        text: messagePayload.text || 'Re-engagement opportunity',
        blocks: messagePayload.blocks,
      }),
    });

    const postData: { ok: boolean; error?: string } = await postResp.json();
    if (!postData.ok) {
      return { success: false, error: `chat.postMessage failed: ${postData.error}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// =============================================================================
// Main Adapter
// =============================================================================

export const reengagementSlackAdapter: SkillAdapter = {
  name: 'deliver-reengagement-slack',

  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[reengagement-slack] Delivering HITL approval messages...');

      const supabase = getServiceClient();
      const orgId = state.event.org_id;
      const appUrl = Deno.env.get('APP_URL') || 'https://app.use60.com';

      if (!orgId) {
        throw new Error('org_id is required in event payload');
      }

      // 1. Get email drafts from upstream draft-reengagement step
      //    Falls back to scored_deals if drafts are not available
      const draftOutput = state.outputs['draft-reengagement'] as
        | { drafts: EmailDraft[]; total_qualified: number }
        | undefined;

      // Also try to get scorer output for signal context
      const scorerOutput = state.outputs['score-reengagement-signals'] as
        | { qualified_deals: ScoredDeal[] }
        | undefined;

      if (!draftOutput?.drafts || draftOutput.drafts.length === 0) {
        console.log('[reengagement-slack] No email drafts to deliver');
        return {
          success: true,
          output: { delivered: 0, failed: 0, results: [] },
          duration_ms: Date.now() - start,
        };
      }

      const drafts = draftOutput.drafts;
      console.log(`[reengagement-slack] Delivering ${drafts.length} HITL messages...`);

      // 2. Get Slack bot token
      const { data: slackIntegration } = await supabase
        .from('slack_integrations')
        .select('access_token')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      const botToken = slackIntegration?.access_token;

      if (!botToken) {
        console.warn('[reengagement-slack] No Slack bot token found, skipping delivery');
        return {
          success: true,
          output: {
            delivered: 0,
            failed: drafts.length,
            results: [],
            skipped_reason: 'no_slack_integration',
          },
          duration_ms: Date.now() - start,
        };
      }

      // 3. Build a scorer lookup for signal context
      const scorerByDealId = new Map<string, ScoredDeal>();
      for (const scored of scorerOutput?.qualified_deals || []) {
        scorerByDealId.set(scored.deal_id, scored);
      }

      // 4. Get deal owner details (for Slack user mapping)
      const dealIds = drafts.map((d) => d.deal_id);

      const { data: dealRows } = await supabase
        .from('deals')
        .select('id, owner_id')
        .in('id', dealIds);

      const dealOwnerMap = new Map<string, string>();
      for (const row of dealRows || []) {
        if (row.owner_id) dealOwnerMap.set(row.id, row.owner_id);
      }

      // 5. Get Slack user mappings for all deal owners
      const ownerIds = [...new Set([...dealOwnerMap.values()])];
      const { data: slackMappings } = await supabase
        .from('slack_user_mappings')
        .select('sixty_user_id, slack_user_id')
        .eq('org_id', orgId)
        .in('sixty_user_id', ownerIds);

      const ownerToSlackId = new Map<string, string>();
      for (const mapping of slackMappings || []) {
        ownerToSlackId.set(mapping.sixty_user_id, mapping.slack_user_id);
      }

      // 6. Get owner display names
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, full_name')
        .in('id', ownerIds);

      const ownerNames = new Map<string, string>();
      for (const p of profiles || []) {
        ownerNames.set(
          p.id,
          p.full_name ||
            [p.first_name, p.last_name].filter(Boolean).join(' ') ||
            p.id
        );
      }

      // 7. Send each draft as a Slack HITL approval message
      let delivered = 0;
      let failed = 0;
      const results: DeliveryResult[] = [];

      for (const draft of drafts) {
        const ownerId = dealOwnerMap.get(draft.deal_id);
        const ownerSlackId = ownerId ? ownerToSlackId.get(ownerId) || null : null;
        const ownerName = ownerId ? ownerNames.get(ownerId) || null : null;

        if (!ownerSlackId) {
          console.warn(
            `[reengagement-slack] No Slack mapping for owner of deal ${draft.deal_id}, skipping`
          );
          failed++;
          results.push({
            deal_id: draft.deal_id,
            deal_name: draft.deal_name,
            owner_id: ownerId || '',
            owner_slack_user_id: null,
            sent: false,
            error: 'no_slack_mapping',
          });
          continue;
        }

        // Get signal context from scorer output
        const scoredDeal = scorerByDealId.get(draft.deal_id);

        const approvalData: ReengagementApprovalData = {
          dealId: draft.deal_id,
          dealName: draft.deal_name,
          dealValue: scoredDeal?.deal_value ?? null,
          companyName: draft.company_name,
          contactName: draft.contact_name,
          contactEmail: draft.contact_email,
          ownerName,
          ownerSlackUserId: ownerSlackId,
          score: draft.score,
          temperature: scoredDeal?.temperature ?? 0,
          daysSinceClose: scoredDeal?.days_since_close ?? 0,
          lossReason: scoredDeal?.loss_reason ?? null,
          topSignals: (scoredDeal?.top_signals ?? []).map((s) => ({
            type: s.type,
            source: s.source || 'unknown',
            description: s.description,
            score_delta: s.score_delta,
            detected_at: s.detected_at,
          })),
          emailSubject: draft.subject,
          emailBody: draft.body,
          signalSummary: draft.signal_summary,
          appUrl,
        };

        const message = buildReengagementApprovalMessage(approvalData);

        const sendResult = await sendSlackDM(botToken, ownerSlackId, message);

        if (sendResult.success) {
          delivered++;
          console.log(
            `[reengagement-slack] Delivered HITL for deal ${draft.deal_name} ` +
            `to owner ${ownerId} (slack: ${ownerSlackId})`
          );

          // Log agent_activity for the feed
          try {
            await supabase.rpc('insert_agent_activity', {
              p_user_id: ownerId,
              p_org_id: orgId,
              p_sequence_type: 'reengagement_trigger',
              p_title: `Re-engagement opportunity: ${draft.deal_name}`,
              p_summary: draft.signal_summary,
              p_metadata: {
                deal_id: draft.deal_id,
                score: draft.score,
                contact_email: draft.contact_email,
              },
              p_job_id: null,
            });
          } catch (actErr) {
            console.warn('[reengagement-slack] Failed to log agent_activity:', actErr);
          }
        } else {
          failed++;
          console.warn(
            `[reengagement-slack] Failed to deliver for deal ${draft.deal_name}: ${sendResult.error}`
          );
        }

        results.push({
          deal_id: draft.deal_id,
          deal_name: draft.deal_name,
          owner_id: ownerId || '',
          owner_slack_user_id: ownerSlackId,
          sent: sendResult.success,
          error: sendResult.error,
        });
      }

      console.log(
        `[reengagement-slack] Complete: ${delivered} delivered, ${failed} failed`
      );

      return {
        success: true,
        output: {
          delivered,
          failed,
          results,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[reengagement-slack] Error:', err);
      return {
        success: false,
        error: String(err),
        duration_ms: Date.now() - start,
      };
    }
  },
};
