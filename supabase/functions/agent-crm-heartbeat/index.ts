/**
 * agent-crm-heartbeat (CRM-010)
 *
 * Cron-triggered edge function (every 4 hours) that monitors CRM approval queue
 * health and sends reminder/warning DMs via Slack.
 *
 * Checks:
 * 1. Stale approvals (>24h pending): Send reminder DM to the rep (grouped per user).
 * 2. Expired approvals (past expires_at): Mark status='expired'.
 * 3. Error rate: Count DLQ entries from crm_update in last 24h; alert org admin if >5%.
 * 4. Queue depth: Warn if a user has more pending items than max_pending_approvals.
 *
 * Auth: accepts CRON_SECRET (x-cron-secret header) or service-role Bearer token.
 * Deploy: npx supabase functions deploy agent-crm-heartbeat --project-ref <ref> --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import {
  handleCorsPreflightRequest,
  errorResponse,
  jsonResponse,
} from '../_shared/corsHelper.ts';
import { sendSlackDM } from '../_shared/proactive/deliverySlack.ts';
import { writeToCommandCentre } from '../_shared/commandCentre/writeAdapter.ts';

// =============================================================================
// Config
// =============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL') || 'https://app.use60.com';

/** Approvals pending longer than this get a reminder DM */
const STALE_HOURS = 24;

/** Error rate above this triggers admin alert (5%) */
const ERROR_RATE_THRESHOLD = 0.05;

/** Fallback when agent config is unavailable */
const DEFAULT_MAX_PENDING = 10;

// =============================================================================
// Types
// =============================================================================

interface OrgSlackSettings {
  org_id: string;
  bot_access_token: string;
  admin_slack_user_id: string | null;
}

interface PendingApprovalRow {
  id: string;
  user_id: string;
  deal_id: string | null;
  field_name: string;
  created_at: string;
  expires_at: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Read max_pending_approvals from agent_config_defaults (platform default).
 * agent_config_defaults has no org_id — it's platform-wide.
 * Falls back to DEFAULT_MAX_PENDING if the key is missing.
 */
async function getMaxPendingApprovals(
  supabase: ReturnType<typeof createClient>
): Promise<number> {
  const { data } = await supabase
    .from('agent_config_defaults')
    .select('config_value')
    .eq('agent_type', 'crm_update')
    .eq('config_key', 'max_pending_approvals')
    .maybeSingle();

  const value = data?.config_value;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return DEFAULT_MAX_PENDING;
}

/**
 * Get the Slack user ID for a given app user within an org.
 * Returns null if no mapping exists.
 */
async function getSlackUserId(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('slack_user_mappings')
    .select('slack_user_id')
    .eq('org_id', orgId)
    .eq('sixty_user_id', userId)
    .maybeSingle();

  return data?.slack_user_id ?? null;
}

// =============================================================================
// Check 1: Send stale-approval reminder DMs (grouped per user)
// =============================================================================

async function sendStaleReminders(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  botToken: string,
  staleThreshold: Date,
  appUrl: string
): Promise<{ remindersSent: number; errors: string[] }> {
  const { data: staleRows, error } = await supabase
    .from('crm_approval_queue')
    .select('id, user_id, field_name, deal_id, created_at, expires_at')
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .lt('created_at', staleThreshold.toISOString());

  if (error) {
    return { remindersSent: 0, errors: [`stale query: ${error.message}`] };
  }

  if (!staleRows?.length) return { remindersSent: 0, errors: [] };

  // Group by user_id
  const byUser = new Map<string, PendingApprovalRow[]>();
  for (const row of staleRows as PendingApprovalRow[]) {
    const arr = byUser.get(row.user_id) ?? [];
    arr.push(row);
    byUser.set(row.user_id, arr);
  }

  let remindersSent = 0;
  const errors: string[] = [];
  const now = new Date();

  for (const [userId, rows] of byUser.entries()) {
    try {
      const slackUserId = await getSlackUserId(supabase, orgId, userId);
      if (!slackUserId) continue;

      const count = rows.length;

      // Find oldest to report hours stale
      const oldestMs = Math.min(...rows.map((r) => new Date(r.created_at).getTime()));
      const hoursStale = Math.round((now.getTime() - oldestMs) / 3_600_000);

      // Show up to 5 field names
      const fieldList = rows
        .slice(0, 5)
        .map((r) => `• ${r.field_name.replace(/_/g, ' ')}`)
        .join('\n');
      const more = count > 5 ? `\n_…and ${count - 5} more_` : '';

      // Use the deal_id of the oldest item for a deep link
      const dealId = rows.find((r) => r.deal_id)?.deal_id;
      const dealLink = dealId ? `<${appUrl}/deals/${dealId}|Review in app>` : `<${appUrl}/pipeline|Review in app>`;

      const text = `Reminder: ${count} CRM field update${count !== 1 ? 's' : ''} awaiting your approval (oldest: ${hoursStale}h)`;
      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              `*Reminder: ${count} CRM update${count !== 1 ? 's' : ''} need your approval*\n` +
              `Oldest has been waiting *${hoursStale}h*.\n\n` +
              fieldList + more + `\n\n${dealLink}`,
          },
        },
      ];

      const result = await sendSlackDM({ botToken, slackUserId, text, blocks });
      if (result.success) {
        remindersSent++;
        console.log(`[crm-heartbeat] Stale reminder → user ${userId} (${count} items, oldest ${hoursStale}h)`);

        // Dual-write to Command Centre: stale CRM approvals need attention
        try {
          const ccFieldList = rows
            .slice(0, 3)
            .map((r) => r.field_name.replace(/_/g, ' '))
            .join(', ');
          const ccMore = count > 3 ? ` and ${count - 3} more` : '';

          await writeToCommandCentre({
            org_id: orgId,
            user_id: userId,
            source_agent: 'crm_update',
            item_type: 'crm_update',
            title: `${count} CRM update${count !== 1 ? 's' : ''} awaiting approval (oldest: ${hoursStale}h)`,
            summary: `Fields pending: ${ccFieldList}${ccMore}`,
            context: {
              pending_count: count,
              hours_stale: hoursStale,
              field_names: rows.map((r) => r.field_name),
              approval_ids: rows.map((r) => r.id),
            },
            deal_id: dealId ?? undefined,
            urgency: hoursStale >= 48 ? 'high' : 'normal',
          });
        } catch (ccErr) {
          // CC failure must not break the agent's primary flow
          console.error('[crm-heartbeat] CC write failed for stale reminder user', userId, String(ccErr));
        }
      } else {
        errors.push(`DM failed user=${userId}: ${result.error}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Reminder user=${userId}: ${msg}`);
    }
  }

  return { remindersSent, errors };
}

// =============================================================================
// Check 2: Expire approvals that are past their expires_at
// =============================================================================

async function expireOverdueApprovals(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  now: Date
): Promise<{ expiredCount: number; error?: string }> {
  const { data, error } = await supabase
    .from('crm_approval_queue')
    .update({ status: 'expired' })
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .lt('expires_at', now.toISOString())
    .select('id');

  if (error) return { expiredCount: 0, error: `expire update: ${error.message}` };

  const expiredCount = data?.length ?? 0;
  if (expiredCount > 0) {
    console.log(`[crm-heartbeat] Marked ${expiredCount} expired approvals for org ${orgId}`);
  }
  return { expiredCount };
}

// =============================================================================
// Check 3: CRM update error rate alert (uses fleet_dead_letter_queue)
// =============================================================================

async function checkCrmErrorRate(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  botToken: string,
  adminSlackUserId: string | null,
  now: Date,
  appUrl: string
): Promise<{ alertSent: boolean; error?: string }> {
  if (!adminSlackUserId) return { alertSent: false };

  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Total crm_update-related events dispatched: count fleet_event_routes triggers
  // We approximate total vs failed using fleet_dead_letter_queue.
  // "total" = pending + failed DLQ items for meeting_ended crm sequences
  const [totalRes, failedRes] = await Promise.all([
    supabase
      .from('crm_field_updates')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', since),

    supabase
      .from('fleet_dead_letter_queue')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('status', ['pending', 'abandoned'])
      .gte('created_at', since),
  ]);

  const total = totalRes.count ?? 0;
  const failed = failedRes.count ?? 0;

  // Need at least 10 events to compute a meaningful rate
  if (total < 10) return { alertSent: false };

  const errorRate = total > 0 ? failed / total : 0;
  if (errorRate <= ERROR_RATE_THRESHOLD) return { alertSent: false };

  const pct = Math.round(errorRate * 100);
  const text = `CRM update error rate alert: ${pct}% failure rate in last 24h (${failed}/${total})`;
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'CRM Update Error Alert', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*${pct}% of CRM updates failed* in the last 24 hours ` +
          `(${failed} failed of ${total} total).\n` +
          `<${appUrl}/settings/integrations|View integration settings>`,
      },
    },
  ];

  const result = await sendSlackDM({ botToken, slackUserId: adminSlackUserId, text, blocks });
  if (result.success) {
    console.log(`[crm-heartbeat] Error rate alert → admin (${pct}% / ${failed} of ${total})`);
  }
  return { alertSent: result.success, error: result.error };
}

// =============================================================================
// Check 4: Queue depth warning per user
// =============================================================================

async function checkQueueDepth(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  botToken: string,
  maxPending: number,
  appUrl: string
): Promise<{ warningsSent: number; errors: string[] }> {
  const { data: rows, error } = await supabase
    .from('crm_approval_queue')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('status', 'pending');

  if (error) return { warningsSent: 0, errors: [`depth query: ${error.message}`] };
  if (!rows?.length) return { warningsSent: 0, errors: [] };

  // Count per user
  const countByUser = new Map<string, number>();
  for (const row of rows as { user_id: string }[]) {
    countByUser.set(row.user_id, (countByUser.get(row.user_id) ?? 0) + 1);
  }

  let warningsSent = 0;
  const errors: string[] = [];

  for (const [userId, count] of countByUser.entries()) {
    if (count <= maxPending) continue;

    try {
      const slackUserId = await getSlackUserId(supabase, orgId, userId);
      if (!slackUserId) continue;

      const text = `Queue depth warning: ${count} CRM approvals pending (limit: ${maxPending})`;
      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              `*CRM Approval Queue Warning*\n` +
              `You have *${count} pending CRM updates* (limit: ${maxPending}).\n` +
              `New AI-proposed changes will queue up until you review the backlog.\n` +
              `<${appUrl}/pipeline|Review queue>`,
          },
        },
      ];

      const result = await sendSlackDM({ botToken, slackUserId, text, blocks });
      if (result.success) {
        warningsSent++;
        console.log(`[crm-heartbeat] Queue depth warning → user ${userId} (${count} items)`);
      } else {
        errors.push(`Depth DM failed user=${userId}: ${result.error}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Depth user=${userId}: ${msg}`);
    }
  }

  return { warningsSent, errors };
}

// =============================================================================
// Main handler
// =============================================================================

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');

    if (
      !verifyCronSecret(req, cronSecret) &&
      !isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY)
    ) {
      return errorResponse('Unauthorized', req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const now = new Date();
    const staleThreshold = new Date(now.getTime() - STALE_HOURS * 60 * 60 * 1000);

    let totalReminders = 0;
    let totalExpired = 0;
    let totalErrorAlerts = 0;
    let totalDepthWarnings = 0;
    const errors: string[] = [];

    // Read platform-wide config once (no org_id on agent_config_defaults)
    const maxPending = await getMaxPendingApprovals(supabase);

    // Get all orgs with Slack connected
    const { data: slackOrgs, error: orgsError } = await supabase
      .from('slack_org_settings')
      .select('org_id, bot_access_token, admin_slack_user_id')
      .eq('is_connected', true)
      .not('bot_access_token', 'is', null);

    if (orgsError) {
      throw new Error(`Failed to fetch Slack orgs: ${orgsError.message}`);
    }

    if (!slackOrgs?.length) {
      console.log('[crm-heartbeat] No Slack-connected orgs — nothing to do');
      return jsonResponse(
        { success: true, reminders: 0, expired: 0, errorAlerts: 0, depthWarnings: 0 },
        req
      );
    }

    for (const org of slackOrgs as OrgSlackSettings[]) {
      const orgId = org.org_id;
      const botToken = org.bot_access_token;

      try {
        // Check 1: stale reminder DMs
        const stale = await sendStaleReminders(supabase, orgId, botToken, staleThreshold, APP_URL);
        totalReminders += stale.remindersSent;
        errors.push(...stale.errors);

        // Check 2: expire overdue approvals
        const expired = await expireOverdueApprovals(supabase, orgId, now);
        totalExpired += expired.expiredCount;
        if (expired.error) errors.push(`Org ${orgId} expire: ${expired.error}`);

        // Check 3: error rate alert
        const errCheck = await checkCrmErrorRate(
          supabase, orgId, botToken, org.admin_slack_user_id, now, APP_URL
        );
        if (errCheck.alertSent) totalErrorAlerts++;
        if (errCheck.error) errors.push(`Org ${orgId} error rate: ${errCheck.error}`);

        // Check 4: queue depth warnings
        const depth = await checkQueueDepth(supabase, orgId, botToken, maxPending, APP_URL);
        totalDepthWarnings += depth.warningsSent;
        errors.push(...depth.errors);
      } catch (orgErr) {
        const msg = orgErr instanceof Error ? orgErr.message : String(orgErr);
        console.error(`[crm-heartbeat] Org ${orgId} error:`, msg);
        errors.push(`Org ${orgId}: ${msg}`);
      }
    }

    console.log(
      `[crm-heartbeat] Complete — reminders=${totalReminders}, expired=${totalExpired}, ` +
      `errorAlerts=${totalErrorAlerts}, depthWarnings=${totalDepthWarnings}, errors=${errors.length}`
    );

    return jsonResponse(
      {
        success: true,
        reminders: totalReminders,
        expired: totalExpired,
        errorAlerts: totalErrorAlerts,
        depthWarnings: totalDepthWarnings,
        errors: errors.length > 0 ? errors : undefined,
      },
      req
    );
  } catch (error) {
    console.error('[crm-heartbeat] Fatal error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      req,
      500
    );
  }
});
