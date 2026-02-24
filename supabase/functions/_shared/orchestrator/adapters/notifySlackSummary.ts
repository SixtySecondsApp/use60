/**
 * Notify Slack Summary Adapter
 *
 * Final step in the meeting_ended sequence (Wave 4).
 * Collects outputs from all upstream steps and sends:
 * 1. A rich Meeting Debrief Block Kit message to Slack
 * 2. An email draft approval message (if draft-followup-email produced one)
 *
 * Upstream outputs consumed:
 * - classify-call-type: { call_type_name, is_sales }
 * - extract-action-items: { action_items: [...], itemsCreated }
 * - detect-intents: { commitments, buying_signals, follow_up_items }
 * - coaching-micro-feedback: { talk_ratio, overall_score, insights, recommendations }
 * - suggest-next-actions: { actions }
 * - draft-followup-email: { email_draft, to, contact_name, subject }
 * - update-crm-from-meeting: { deal_id, deal_name, changes_applied, field_changes }
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';
import {
  buildMeetingDebriefMessage,
  type MeetingDebriefData,
  section,
  context,
  divider,
  actions,
} from '../../slackBlocks.ts';
import { deliverToSlack } from '../../proactive/deliverySlack.ts';
import type { ProactiveNotificationPayload } from '../../proactive/types.ts';

/**
 * Parse the meeting.summary field which may be:
 * - Plain string: return as-is
 * - JSON with markdown_formatted: extract and clean for Slack
 * - JSON without markdown_formatted: use template_name or stringify
 */
function parseMeetingSummary(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') {
    // Try parsing as JSON
    try {
      const parsed = JSON.parse(raw);
      return extractSummaryText(parsed);
    } catch {
      return raw; // Already a plain string
    }
  }
  if (typeof raw === 'object') {
    return extractSummaryText(raw as Record<string, unknown>);
  }
  return String(raw);
}

function extractSummaryText(obj: Record<string, unknown>): string {
  // Primary: markdown_formatted field
  if (obj.markdown_formatted && typeof obj.markdown_formatted === 'string') {
    return cleanMarkdownForSlack(obj.markdown_formatted);
  }
  // Fallback: summary field
  if (obj.summary && typeof obj.summary === 'string') {
    return obj.summary;
  }
  // Fallback: text field
  if (obj.text && typeof obj.text === 'string') {
    return obj.text;
  }
  return '';
}

/**
 * Clean markdown formatting for Slack Block Kit compatibility.
 * Slack uses mrkdwn which differs from standard markdown.
 */
function cleanMarkdownForSlack(md: string): string {
  return md
    // Remove markdown headers (### Title → *Title*)
    .replace(/^#{1,6}\s+/gm, '')
    // Convert markdown bold **text** → Slack mrkdwn *text*
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    // Remove markdown links with timestamps [Text](url?timestamp=0)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Trim to reasonable length for Slack (max ~500 chars for summary)
    .substring(0, 600)
    // Add ellipsis if truncated
    .replace(/\s+\S*$/, '') + (md.length > 600 ? '...' : '');
}

export const notifySlackSummaryAdapter: SkillAdapter = {
  name: 'notify-slack-summary',
  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const meetingId = state.event.payload.meeting_id as string;
      const meetingTitle = (state.event.payload.title as string) || 'Meeting';

      // --- Gather upstream outputs ---
      const callType = state.outputs['classify-call-type'] as any;
      const actionItemsOutput = state.outputs['extract-action-items'] as any;
      const intentsOutput = state.outputs['detect-intents'] as any;
      const coachingOutput = state.outputs['coaching-micro-feedback'] as any;
      const emailOutput = state.outputs['draft-followup-email'] as any;
      const crmUpdateOutput = state.outputs['update-crm-from-meeting'] as any;

      // --- Get meeting metadata ---
      const supabase = getServiceClient();
      const { data: meeting } = await supabase
        .from('meetings')
        .select('summary, duration_minutes, meeting_start')
        .eq('id', meetingId)
        .maybeSingle();

      // --- Parse summary (handles JSON with markdown_formatted) ---
      const summaryText = parseMeetingSummary(meeting?.summary)
        || 'Meeting completed. See action items below.';

      // --- Build action items for Block Kit ---
      const actionItems = (actionItemsOutput?.action_items || [])
        .slice(0, 5)
        .map((item: any) => ({
          task: item.title || item.task || 'Untitled',
          suggestedOwner: item.assignee_name || undefined,
          dueInDays: item.deadline_at
            ? Math.max(1, Math.ceil((new Date(item.deadline_at).getTime() - Date.now()) / 86400000))
            : 3,
        }));

      // --- Derive sentiment from coaching/intents ---
      let sentiment: 'positive' | 'neutral' | 'challenging' = 'neutral';
      let sentimentScore = 50;

      if (coachingOutput?.overall_score != null) {
        // Coaching returns 0-1 scale; normalize to 0-100 for display and thresholds
        const raw = coachingOutput.overall_score;
        sentimentScore = raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
        sentiment = sentimentScore >= 70 ? 'positive' : sentimentScore >= 40 ? 'neutral' : 'challenging';
      } else if (intentsOutput?.buying_signals?.length > 0) {
        sentiment = 'positive';
        sentimentScore = 70;
      }

      // --- Build coaching insight ---
      let coachingInsight = '';
      if (coachingOutput?.recommendations?.length > 0) {
        const rec = coachingOutput.recommendations[0];
        coachingInsight = typeof rec === 'string' ? rec : rec.action || rec.text || '';
      } else if (coachingOutput?.insights?.length > 0) {
        const first = coachingOutput.insights[0];
        coachingInsight = typeof first === 'string' ? first : first.text || first.action || '';
      }

      // --- Key quotes from intents ---
      const keyQuotes: string[] = [];
      if (intentsOutput?.buying_signals?.length > 0) {
        const signal = intentsOutput.buying_signals[0];
        const quote = signal.source_quote || signal.phrase || signal.text;
        if (quote) keyQuotes.push(quote);
      }

      // --- Get attendees ---
      const attendees: string[] = [];
      if (state.event.payload.attendees) {
        for (const a of state.event.payload.attendees as any[]) {
          attendees.push(a.name || a.email || 'Unknown');
        }
      }
      if (attendees.length === 0 && emailOutput?.contact_name) {
        attendees.push(emailOutput.contact_name);
      }

      // --- Get deal info from context ---
      const deal = state.context.tier2?.contact?.deal || state.context.tier2?.deal;

      // =================================================================
      // 1. Send Meeting Debrief to Slack
      // =================================================================

      // Build base debrief message using standard builder
      const appUrl = Deno.env.get('APP_URL') || 'https://app.use60.com';
      const debriefData: MeetingDebriefData = {
        meetingTitle,
        meetingId,
        attendees,
        duration: meeting?.duration_minutes || state.event.payload.duration_minutes || 30,
        dealName: deal?.name,
        dealId: deal?.id,
        dealStage: deal?.stage,
        summary: summaryText,
        sentiment,
        sentimentScore,
        talkTimeRep: coachingOutput?.talk_ratio || 50,
        talkTimeCustomer: coachingOutput?.talk_ratio ? (100 - coachingOutput.talk_ratio) : 50,
        actionItems,
        coachingInsight,
        keyQuotes,
        appUrl,
      };

      const debriefMessage = buildMeetingDebriefMessage(debriefData);
      let blocks = [...debriefMessage.blocks];

      // --- Append CRM Update Section (if changes were applied) ---
      if (crmUpdateOutput && !crmUpdateOutput.skipped && crmUpdateOutput.changes_applied > 0) {
        const fieldsUpdated = crmUpdateOutput.changes_applied || 0;
        const fieldChanges = crmUpdateOutput.field_changes || [];

        // Add divider before CRM section
        blocks.push(divider());

        // CRM section header
        blocks.push(section(`*📋 CRM Updated* — ${fieldsUpdated} field${fieldsUpdated !== 1 ? 's' : ''} updated`));

        // Show high-confidence changes inline (max 3)
        const highConfidenceChanges = fieldChanges
          .filter((c: any) => c.confidence === 'high')
          .slice(0, 3);

        if (highConfidenceChanges.length > 0) {
          const changeLines = highConfidenceChanges.map((change: any) => {
            const fieldName = change.field || change.field_name || 'Unknown';
            const newValue = change.new_value;
            // Format the value for display
            let displayValue = String(newValue);
            if (typeof newValue === 'number' && fieldName.toLowerCase().includes('value')) {
              displayValue = `$${newValue.toLocaleString()}`;
            }
            if (displayValue.length > 50) {
              displayValue = displayValue.substring(0, 50) + '...';
            }
            return `• *${fieldName}*: ${displayValue}`;
          });

          blocks.push(section(changeLines.join('\n')));
        }

        // Add "View CRM Changes" and "Undo" buttons
        if (deal?.id) {
          blocks.push(actions([
            {
              text: 'View CRM Changes',
              actionId: 'view_crm_changes',
              value: deal.id,
              url: `${appUrl}/deals/${deal.id}`,
            },
            {
              text: 'Undo',
              actionId: `undo_crm_update::${deal.id}`,
              value: deal.id,
            },
          ]));
        }
      }

      // Get bot token and Slack user ID for delivery
      const { data: slackIntegration } = await supabase
        .from('slack_integrations')
        .select('access_token')
        .eq('user_id', state.event.user_id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      const { data: slackMapping } = await supabase
        .from('slack_user_mappings')
        .select('slack_user_id')
        .eq('org_id', state.event.org_id)
        .eq('sixty_user_id', state.event.user_id)
        .maybeSingle();

      const botToken = slackIntegration?.access_token;
      const recipientSlackUserId = slackMapping?.slack_user_id;

      let slackDelivered = false;
      let deliveryError: string | undefined;

      if (!botToken) {
        console.warn('[notify-slack-summary] No Slack bot token found for user');
        deliveryError = 'No Slack integration';
      } else if (!recipientSlackUserId) {
        console.warn('[notify-slack-summary] No Slack user mapping found');
        deliveryError = 'No Slack user mapping';
      } else {
        // Route through proactive delivery layer (handles quiet hours + rate limiting)
        const payload: ProactiveNotificationPayload = {
          type: 'meeting_ended',
          orgId: state.event.org_id,
          recipientUserId: state.event.user_id,
          recipientSlackUserId,
          entityType: 'meeting',
          entityId: meetingId,
          title: `Meeting Debrief: ${meetingTitle}`,
          message: debriefMessage.text,
          blocks,
          metadata: {
            meeting_id: meetingId,
            sentiment,
            action_items_count: actionItems.length,
            crm_fields_updated: crmFieldsUpdated,
          },
          priority: 'medium',
        };

        const deliveryResult = await deliverToSlack(supabase, payload, botToken);
        slackDelivered = deliveryResult.sent;
        deliveryError = deliveryResult.error;

        if (!slackDelivered) {
          console.warn(
            `[notify-slack-summary] Slack debrief delivery blocked/failed: ${deliveryError}`
          );
        }
      }

      // Insert agent_activity record (in-app mirroring)
      const crmFieldsUpdated = crmUpdateOutput && !crmUpdateOutput.skipped
        ? crmUpdateOutput.changes_applied || 0
        : 0;

      try {
        const { error: activityError } = await supabase.rpc('insert_agent_activity', {
          p_user_id: state.event.user_id,
          p_org_id: state.event.org_id,
          p_sequence_type: 'meeting_ended',
          p_title: `Meeting Debrief: ${meetingTitle}`,
          p_summary: summaryText.slice(0, 500),
          p_metadata: {
            meeting_id: meetingId,
            sentiment,
            sentiment_score: sentimentScore,
            action_items_count: actionItems.length,
            crm_fields_updated: crmFieldsUpdated,
            delivery_method: slackDelivered ? 'slack' : 'in_app_only',
            delivery_error: deliveryError,
          },
          p_job_id: null,
        });

        if (activityError) {
          console.error('[notify-slack-summary] Failed to insert agent_activity:', activityError);
        } else {
          console.log('[notify-slack-summary] Agent activity recorded');
        }
      } catch (actErr) {
        console.error('[notify-slack-summary] Error inserting agent_activity:', actErr);
      }

      // =================================================================
      // 2. Send Email Draft Approval to Slack (if draft exists)
      // =================================================================
      let emailApprovalDelivered = false;
      if (emailOutput?.email_draft && !emailOutput?.skipped) {
        const draft = emailOutput.email_draft;
        const contactName = emailOutput.contact_name || draft.to;

        // Build a simple Slack message with the email draft for review
        const emailBlocks = [
          {
            type: 'header',
            text: { type: 'plain_text', text: ':email:  Draft Follow-Up Email Ready', emoji: true },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*To:* ${contactName} (${draft.to})\n*Subject:* ${draft.subject}`,
            },
          },
          { type: 'divider' },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: (draft.body || '').substring(0, 2900), // Slack block text limit
            },
          },
          { type: 'divider' },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `${draft.ai_generated ? ':sparkles: AI-generated' : ':pencil: Template'} | Meeting: ${meetingTitle} | Reply in 60 or your email client to send`,
              },
            ],
          },
        ];

        if (botToken && recipientSlackUserId) {
          try {
            const emailPayload: ProactiveNotificationPayload = {
              type: 'hitl_followup_email',
              orgId: state.event.org_id,
              recipientUserId: state.event.user_id,
              recipientSlackUserId,
              entityType: 'meeting',
              entityId: meetingId,
              title: 'Draft Follow-Up Email Ready',
              message: `Draft follow-up email for ${contactName}: ${draft.subject}`,
              blocks: emailBlocks,
              metadata: {
                meeting_id: meetingId,
                contact_name: contactName,
                to: draft.to,
                subject: draft.subject,
                ai_generated: draft.ai_generated,
              },
              priority: 'medium',
            };

            const emailDeliveryResult = await deliverToSlack(supabase, emailPayload, botToken);
            emailApprovalDelivered = emailDeliveryResult.sent;

            if (!emailApprovalDelivered) {
              console.warn(`[notify-slack-summary] Email draft Slack delivery blocked/failed: ${emailDeliveryResult.error}`);
            } else {
              console.log(`[notify-slack-summary] Email draft sent to Slack for review — to=${draft.to}, subject=${draft.subject}`);
            }
          } catch (emailErr) {
            console.error('[notify-slack-summary] Email draft Slack error:', emailErr);
          }
        } else {
          console.warn('[notify-slack-summary] Skipping email draft delivery — missing bot token or Slack user ID');
        }
      }

      console.log(
        `[notify-slack-summary] Delivery complete: ` +
        `debrief=${slackDelivered}, email_draft=${emailApprovalDelivered}, ` +
        `action_items=${actionItems.length}, ` +
        `crm_fields_updated=${crmFieldsUpdated}, ` +
        `sentiment=${sentiment}, ` +
        `call_type=${callType?.call_type_name || 'unknown'}`
      );

      return {
        success: true,
        output: {
          delivered: slackDelivered,
          email_draft_delivered: emailApprovalDelivered,
          delivery_method: slackDelivered ? 'slack' : 'in_app_only',
          delivery_error: deliveryError,
          action_items_count: actionItems.length,
          crm_fields_updated: crmFieldsUpdated,
          sentiment,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[notify-slack-summary] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};
