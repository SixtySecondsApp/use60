/**
 * check-commitment-deadlines — BA-004a + BA-004b
 *
 * Cron-triggered edge function that scans for overdue and approaching
 * commitments in deal_memory_events. Groups results by org, respecting
 * each org's proactive agent preferences (TRINITY-007 gate).
 *
 * BA-004b additions:
 *   - Sends grouped Slack alerts into each user's daily thread
 *   - Creates command_centre_items for overdue/approaching commitments
 *   - Cron schedule: daily at 09:00 UTC
 *
 * Requires service role auth (called by cron / fleet orchestrator).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import { isAbilityEnabledForOrg } from '../_shared/proactive/cronPreferenceGate.ts';
import { getDailyThreadTs } from '../_shared/slack/dailyThread.ts';
import { sendSlackDM } from '../_shared/proactive/deliverySlack.ts';
import { writeMultipleItems } from '../_shared/commandCentre/writeAdapter.ts';
import type { WriteItemParams } from '../_shared/commandCentre/types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommitmentRow {
  id: string;
  org_id: string;
  deal_id: string;
  summary: string;
  detail: Record<string, unknown>;
  source_timestamp: string;
}

interface OrgResult {
  org_id: string;
  overdue: CommitmentRow[];
  approaching: CommitmentRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute how many days overdue or remaining for a commitment. */
function daysFromNow(deadline: string, now: Date): number {
  const deadlineDate = new Date(deadline);
  const diffMs = deadlineDate.getTime() - now.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/** Build a mrkdwn Slack message for overdue + approaching commitments. */
function buildSlackBlocks(
  overdue: Array<CommitmentRow & { dealName: string }>,
  approaching: Array<CommitmentRow & { dealName: string }>,
  now: Date,
): any[] {
  const blocks: any[] = [];

  if (overdue.length > 0) {
    blocks.push({
      type: 'header',
      text: { type: 'plain_text', text: 'Overdue Commitments', emoji: false },
    });

    const lines = overdue.map((c) => {
      const daysOver = Math.abs(daysFromNow(c.detail.deadline as string, now));
      return `*${c.summary}*\n_${c.dealName}_ — ${daysOver} day${daysOver !== 1 ? 's' : ''} overdue`;
    });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: lines.join('\n\n') },
    });
  }

  if (approaching.length > 0) {
    if (overdue.length > 0) {
      blocks.push({ type: 'divider' });
    }

    blocks.push({
      type: 'header',
      text: { type: 'plain_text', text: 'Commitments Due Within 48h', emoji: false },
    });

    const lines = approaching.map((c) => {
      const daysLeft = daysFromNow(c.detail.deadline as string, now);
      const label = daysLeft <= 0 ? 'due today' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`;
      return `*${c.summary}*\n_${c.dealName}_ — ${label}`;
    });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: lines.join('\n\n') },
    });
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  // Auth: service role only (cron-triggered)
  const authHeader = req.headers.get('Authorization');
  if (!isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY)) {
    return errorResponse('Unauthorized — service role required', req, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // -----------------------------------------------------------------------
    // 1. Fetch all active pending commitments that have a deadline
    // -----------------------------------------------------------------------

    const { data: commitments, error: fetchError } = await supabase
      .from('deal_memory_events')
      .select('id, org_id, deal_id, summary, detail, source_timestamp')
      .eq('event_type', 'commitment_made')
      .eq('is_active', true)
      .filter('detail->>status', 'eq', 'pending')
      .not('detail->>deadline', 'is', null);

    if (fetchError) {
      console.error('[check-commitment-deadlines] Query error:', fetchError.message);
      return errorResponse(fetchError.message, req, 500);
    }

    if (!commitments || commitments.length === 0) {
      console.log('[check-commitment-deadlines] No pending commitments with deadlines found');
      return jsonResponse({ orgs_processed: 0, overdue: 0, approaching: 0, cc_items: 0, slack_sent: 0 }, req);
    }

    console.log(`[check-commitment-deadlines] Found ${commitments.length} pending commitments with deadlines`);

    // -----------------------------------------------------------------------
    // 2. Bucket into overdue / approaching and group by org_id
    // -----------------------------------------------------------------------

    const orgMap = new Map<string, OrgResult>();

    for (const row of commitments as CommitmentRow[]) {
      const deadline = row.detail?.deadline as string | undefined;
      if (!deadline) continue;

      const deadlineDate = new Date(deadline);
      if (isNaN(deadlineDate.getTime())) {
        console.warn(`[check-commitment-deadlines] Invalid deadline for event ${row.id}: ${deadline}`);
        continue;
      }

      let bucket: 'overdue' | 'approaching' | null = null;

      if (deadlineDate.getTime() < now.getTime()) {
        bucket = 'overdue';
      } else if (deadlineDate.getTime() < in48h.getTime()) {
        bucket = 'approaching';
      }

      if (!bucket) continue;

      if (!orgMap.has(row.org_id)) {
        orgMap.set(row.org_id, { org_id: row.org_id, overdue: [], approaching: [] });
      }

      orgMap.get(row.org_id)![bucket].push(row);
    }

    // -----------------------------------------------------------------------
    // 3. Process each org — gate, resolve deal names, send alerts, create CC items
    // -----------------------------------------------------------------------

    let orgsProcessed = 0;
    let totalOverdue = 0;
    let totalApproaching = 0;
    let totalCcItems = 0;
    let totalSlackSent = 0;

    for (const [orgId, orgResult] of orgMap) {
      // TRINITY-007: Check org preference gate before processing
      const gate = await isAbilityEnabledForOrg(supabase, orgId, 'commitment_deadline_scan');
      if (!gate.allowed) {
        console.log(`[check-commitment-deadlines] ${gate.reason} — skipping`);
        continue;
      }

      orgsProcessed++;
      totalOverdue += orgResult.overdue.length;
      totalApproaching += orgResult.approaching.length;

      console.log(
        `[check-commitment-deadlines] Org ${orgId}: ${orgResult.overdue.length} overdue, ${orgResult.approaching.length} approaching`,
      );

      // -------------------------------------------------------------------
      // 3a. Resolve deal names for all commitments in this org
      // -------------------------------------------------------------------

      const allCommitments = [...orgResult.overdue, ...orgResult.approaching];
      const dealIds = [...new Set(allCommitments.map((c) => c.deal_id))];

      const { data: deals } = await supabase
        .from('deals')
        .select('id, name')
        .in('id', dealIds);

      const dealNameMap = new Map<string, string>();
      for (const deal of deals || []) {
        dealNameMap.set(deal.id, deal.name || 'Untitled Deal');
      }

      const enrichedOverdue = orgResult.overdue.map((c) => ({
        ...c,
        dealName: dealNameMap.get(c.deal_id) || 'Untitled Deal',
      }));
      const enrichedApproaching = orgResult.approaching.map((c) => ({
        ...c,
        dealName: dealNameMap.get(c.deal_id) || 'Untitled Deal',
      }));

      // -------------------------------------------------------------------
      // 3b. Find org members to notify
      // -------------------------------------------------------------------

      const { data: orgMembers } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('org_id', orgId);

      if (!orgMembers || orgMembers.length === 0) {
        console.warn(`[check-commitment-deadlines] No org members found for org ${orgId}`);
        continue;
      }

      // -------------------------------------------------------------------
      // 3c. Send Slack alerts into each user's daily thread
      // -------------------------------------------------------------------

      for (const member of orgMembers) {
        const userId = member.user_id;

        try {
          // Get daily thread for this user
          const threadTs = await getDailyThreadTs(userId, orgId, supabase);

          // Get Slack credentials
          const { data: slackOrg } = await supabase
            .from('slack_org_settings')
            .select('bot_access_token')
            .eq('org_id', orgId)
            .eq('is_connected', true)
            .maybeSingle();

          if (!slackOrg?.bot_access_token) {
            console.log(`[check-commitment-deadlines] No Slack bot token for org ${orgId}`);
            continue;
          }

          const { data: slackMapping } = await supabase
            .from('slack_user_mappings')
            .select('slack_user_id')
            .eq('org_id', orgId)
            .eq('sixty_user_id', userId)
            .maybeSingle();

          if (!slackMapping?.slack_user_id) {
            console.log(`[check-commitment-deadlines] No Slack mapping for user ${userId}`);
            continue;
          }

          // Build and send Slack message
          const blocks = buildSlackBlocks(enrichedOverdue, enrichedApproaching, now);

          if (blocks.length > 0) {
            const slackResult = await sendSlackDM({
              botToken: slackOrg.bot_access_token,
              slackUserId: slackMapping.slack_user_id,
              text: `Commitment Deadline Alert: ${enrichedOverdue.length} overdue, ${enrichedApproaching.length} approaching`,
              blocks,
              ...(threadTs ? { thread_ts: threadTs } : {}),
            });

            if (slackResult.success) {
              totalSlackSent++;
              console.log(`[check-commitment-deadlines] Slack alert sent to user ${userId} in org ${orgId}`);
            } else {
              console.warn(`[check-commitment-deadlines] Slack send failed for user ${userId}: ${slackResult.error}`);
            }
          }
        } catch (slackErr) {
          // Slack failures must not break the pipeline
          console.error(`[check-commitment-deadlines] Slack error for user ${userId}:`, slackErr);
        }
      }

      // -------------------------------------------------------------------
      // 3d. Create CC items for overdue + approaching commitments
      // -------------------------------------------------------------------

      const ccItems: WriteItemParams[] = [];

      for (const c of enrichedOverdue) {
        const daysOver = Math.abs(daysFromNow(c.detail.deadline as string, now));
        // Find the first org member to assign to (deal owner preferred)
        const assignUserId = orgMembers[0]?.user_id;
        if (!assignUserId) continue;

        ccItems.push({
          org_id: orgId,
          user_id: assignUserId,
          source_agent: 'commitment-tracker' as any,
          item_type: 'alert',
          title: `Overdue: ${c.summary}`,
          summary: `${c.dealName} — ${daysOver} day${daysOver !== 1 ? 's' : ''} overdue. Deadline was ${c.detail.deadline}.`,
          context: {
            commitment_event_id: c.id,
            deal_id: c.deal_id,
            deal_name: c.dealName,
            deadline: c.detail.deadline,
            days_overdue: daysOver,
            bucket: 'overdue',
          },
          urgency: 'high',
          deal_id: c.deal_id,
          source_event_id: c.id,
          due_date: c.detail.deadline as string,
        });
      }

      for (const c of enrichedApproaching) {
        const daysLeft = daysFromNow(c.detail.deadline as string, now);
        const assignUserId = orgMembers[0]?.user_id;
        if (!assignUserId) continue;

        ccItems.push({
          org_id: orgId,
          user_id: assignUserId,
          source_agent: 'commitment-tracker' as any,
          item_type: 'alert',
          title: `Due soon: ${c.summary}`,
          summary: `${c.dealName} — ${daysLeft <= 0 ? 'due today' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`}. Deadline: ${c.detail.deadline}.`,
          context: {
            commitment_event_id: c.id,
            deal_id: c.deal_id,
            deal_name: c.dealName,
            deadline: c.detail.deadline,
            days_remaining: Math.max(0, daysLeft),
            bucket: 'approaching',
          },
          urgency: 'normal',
          deal_id: c.deal_id,
          source_event_id: c.id,
          due_date: c.detail.deadline as string,
        });
      }

      if (ccItems.length > 0) {
        try {
          const ids = await writeMultipleItems(ccItems);
          totalCcItems += ids.length;
          console.log(`[check-commitment-deadlines] Created ${ids.length} CC items for org ${orgId}`);
        } catch (ccErr) {
          // CC failures must not break the pipeline
          console.error(`[check-commitment-deadlines] CC write error for org ${orgId}:`, ccErr);
        }
      }
    }

    const result = {
      orgs_processed: orgsProcessed,
      overdue: totalOverdue,
      approaching: totalApproaching,
      cc_items: totalCcItems,
      slack_sent: totalSlackSent,
    };

    console.log(
      `[check-commitment-deadlines] Complete: ${orgsProcessed} orgs, ${totalOverdue} overdue, ${totalApproaching} approaching, ${totalCcItems} CC items, ${totalSlackSent} Slack msgs`,
    );

    return jsonResponse(result, req);
  } catch (error) {
    console.error('[check-commitment-deadlines] Unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResponse(message, req, 500);
  }
});
