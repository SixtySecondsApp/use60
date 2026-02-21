/**
 * CRM Slack Notify Adapter (CRM-006)
 *
 * Sends the HITL approval message to Slack after CRM field extraction.
 * Called by the fleet runner after auto-apply completes (CRM-004).
 *
 * Responsibilities:
 * 1. Build Block Kit message via buildCRMApprovalMessage()
 * 2. Resolve Slack credentials for the rep (bot token + Slack user ID)
 * 3. Send DM via sendSlackDM()
 * 4. Store message_ts back on crm_approval_queue rows for later updates
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  buildCRMApprovalMessage,
  type CRMAppliedChange,
  type CRMPendingApproval,
  type CRMSkippedField,
} from '../../slackBlocks.ts';
import { sendSlackDM } from '../../proactive/deliverySlack.ts';
import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';
import type { AppliedChange } from './crmAutoApply.ts';
import type { FieldChange } from './crmFieldClassifier.ts';

// =============================================================================
// Types
// =============================================================================

export interface CRMSlackNotifyContext {
  org_id: string;
  user_id: string;
  deal_id: string;
  meeting_id: string;
}

export interface CRMSlackNotifyResult {
  sent: boolean;
  message_ts?: string;
  channel_id?: string;
  error?: string;
}

// =============================================================================
// Main export
// =============================================================================

/**
 * Build and send the CRM HITL approval message to the rep via Slack DM.
 *
 * @param supabase   Service-role Supabase client (needed for slack credentials + queue updates)
 * @param context    org/user/deal/meeting identifiers
 * @param autoApplied  Fields already written to the deals table (high-confidence)
 * @param pendingApprovals  Queue entries awaiting rep approval
 * @param skippedFields     Low-confidence fields that were skipped
 */
export async function notifySlackApproval(
  supabase: SupabaseClient,
  context: CRMSlackNotifyContext,
  autoApplied: CRMAppliedChange[],
  pendingApprovals: CRMPendingApproval[],
  skippedFields: CRMSkippedField[]
): Promise<CRMSlackNotifyResult> {
  const { org_id, user_id, deal_id, meeting_id } = context;

  // --- Nothing to notify about ---
  if (autoApplied.length === 0 && pendingApprovals.length === 0) {
    return { sent: false, error: 'No CRM changes to notify about' };
  }

  // --- Resolve Slack credentials ---
  const [integrationResult, mappingResult, meetingResult] = await Promise.all([
    supabase
      .from('slack_integrations')
      .select('access_token')
      .eq('user_id', user_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle(),

    supabase
      .from('slack_user_mappings')
      .select('slack_user_id')
      .eq('org_id', org_id)
      .eq('sixty_user_id', user_id)
      .maybeSingle(),

    supabase
      .from('meetings')
      .select('title')
      .eq('id', meeting_id)
      .maybeSingle(),
  ]);

  const botToken = integrationResult.data?.access_token;
  const slackUserId = mappingResult.data?.slack_user_id;
  const meetingTitle = meetingResult.data?.title || 'Meeting';

  if (!botToken) {
    console.warn('[crmSlackNotify] No Slack bot token for user', user_id);
    return { sent: false, error: 'No Slack integration found' };
  }

  if (!slackUserId) {
    console.warn('[crmSlackNotify] No Slack user mapping for user', user_id);
    return { sent: false, error: 'No Slack user mapping found' };
  }

  // --- Fetch deal name ---
  const { data: dealData } = await supabase
    .from('deals')
    .select('title')
    .eq('id', deal_id)
    .maybeSingle();

  const dealName = dealData?.title || 'Unknown Deal';

  const appUrl = Deno.env.get('APP_URL') || 'https://app.use60.com';

  // --- Build Block Kit message ---
  const message = buildCRMApprovalMessage({
    dealId: deal_id,
    dealName,
    meetingId: meeting_id,
    meetingTitle,
    autoApplied,
    pendingApprovals,
    skippedFields,
    appUrl,
  });

  // --- Send DM ---
  const dmResult = await sendSlackDM({
    botToken,
    slackUserId,
    blocks: message.blocks,
    text: message.text,
  });

  if (!dmResult.success) {
    console.error('[crmSlackNotify] Failed to send Slack DM:', dmResult.error);
    return { sent: false, error: dmResult.error };
  }

  const messageTsValue = dmResult.ts;
  const channelIdValue = dmResult.channelId;

  // --- Store message_ts on pending queue entries (enables later message updates) ---
  if (messageTsValue && pendingApprovals.length > 0) {
    const queueIds = pendingApprovals.map((p) => p.id);

    const { error: updateError } = await supabase
      .from('crm_approval_queue')
      .update({
        slack_message_ts: messageTsValue,
        slack_channel_id: channelIdValue,
        updated_at: new Date().toISOString(),
      })
      .in('id', queueIds);

    if (updateError) {
      // Non-fatal — message was still delivered
      console.warn('[crmSlackNotify] Failed to store message_ts on queue entries:', updateError.message);
    }
  }

  console.log(
    `[crmSlackNotify] CRM approval DM sent to ${slackUserId} — ` +
    `auto_applied=${autoApplied.length}, pending=${pendingApprovals.length}, ` +
    `skipped=${skippedFields.length}, ts=${messageTsValue}`
  );

  return {
    sent: true,
    message_ts: messageTsValue,
    channel_id: channelIdValue,
  };
}

// =============================================================================
// SkillAdapter wrapper — used by the fleet runner registry
// =============================================================================

/**
 * Fleet runner adapter for the 'slack-crm-notify' sequence step.
 *
 * Collects auto-applied, pending-approval, and skipped fields from upstream
 * step outputs, then calls notifySlackApproval() to send the HITL DM.
 *
 * Upstream outputs consumed:
 *   - 'auto-apply-crm-fields'  → applied[], auto_applied_fields[]
 *   - 'classify-crm-fields'    → requireApproval[], skipLowConfidence[]
 *
 * Also queries crm_approval_queue for the pending items (with deal_id + status=pending)
 * to populate the Block Kit approval cards.
 */
export const crmSlackNotifyAdapter: SkillAdapter = {
  name: 'slack-crm-notify',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();

    try {
      const deal = state.context.tier2?.deal;
      if (!deal?.id) {
        return {
          success: true,
          output: { sent: false, skipped: true, reason: 'No deal in context' },
          duration_ms: Date.now() - start,
        };
      }

      const supabase = getServiceClient();

      // Collect auto-applied changes from upstream
      const autoApplyOutput = state.outputs['auto-apply-crm-fields'] as
        | { applied?: AppliedChange[] }
        | undefined;
      const autoApplied: CRMAppliedChange[] = (autoApplyOutput?.applied ?? []).map((a) => ({
        field_name: a.field_name,
        applied_value: a.applied_value,
        previous_value: a.previous_value,
        confidence: a.confidence,
        reason: a.reason,
      }));

      // Collect skipped low-confidence fields from classifier
      const classifiedOutput = state.outputs['classify-crm-fields'] as
        | { skipLowConfidence?: FieldChange[] }
        | undefined;
      const skippedFields: CRMSkippedField[] = (classifiedOutput?.skipLowConfidence ?? []).map((f) => ({
        field_name: f.field_name,
        proposed_value: f.proposed_value,
        confidence: f.confidence,
        reason: f.reason,
      }));

      // Fetch pending approval queue entries for this deal
      const meetingId = (state.event.payload as any)?.meeting_id ?? '';
      const { data: queueRows } = await supabase
        .from('crm_approval_queue')
        .select('id, field_name, current_value, proposed_value, confidence, reason, expires_at')
        .eq('org_id', state.event.org_id)
        .eq('deal_id', deal.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(20);

      const pendingApprovals: CRMPendingApproval[] = (queueRows ?? []).map((row: any) => ({
        id: row.id,
        field_name: row.field_name,
        current_value: row.current_value,
        proposed_value: row.proposed_value,
        confidence: row.confidence,
        reason: row.reason,
        expires_at: row.expires_at,
      }));

      const context: CRMSlackNotifyContext = {
        org_id: state.event.org_id,
        user_id: state.event.user_id ?? '',
        deal_id: deal.id,
        meeting_id: meetingId,
      };

      const result = await notifySlackApproval(
        supabase,
        context,
        autoApplied,
        pendingApprovals,
        skippedFields,
      );

      return {
        success: true,
        output: {
          ...result,
          deal_id: deal.id,
          auto_applied_count: autoApplied.length,
          pending_count: pendingApprovals.length,
          skipped_count: skippedFields.length,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[slack-crm-notify] Error:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - start,
      };
    }
  },
};
