/**
 * integration-health-heartbeat (US-021)
 *
 * Cron-triggered edge function (every 2 hours at :15) that checks integration
 * health for all users and alerts when integrations are stale or broken.
 *
 * Checks:
 *   1. Google Calendar — calendar_last_synced_at >6h stale via user_sync_status
 *   2. Slack — bot_access_token exists and org is connected via slack_org_settings
 *   3. HubSpot — integration_credentials status for hubspot provider
 *   4. Fathom — token_expires_at in fathom_integrations, alert if expired
 *
 * For each failing integration per user:
 *   - Write to Command Centre (integration_alert, urgency: high)
 *   - Send Slack DM if Slack is connected
 *   - Deduplicate: skip if recent alert (same integration, last 24h) exists in CC
 *
 * Auth: accepts CRON_SECRET (x-cron-secret) or service-role Bearer token.
 * Deploy: npx supabase functions deploy integration-health-heartbeat --project-ref <ref> --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import {
  handleCorsPreflightRequest,
  errorResponse,
  jsonResponse,
} from '../_shared/corsHelper.ts';
import { sendSlackDM, logSlackDelivery } from '../_shared/proactive/deliverySlack.ts';
import { writeToCommandCentre } from '../_shared/commandCentre/writeAdapter.ts';
import { isCircuitOpen, recordSuccess, recordFailure } from '../_shared/circuitBreaker.ts';

// =============================================================================
// Config
// =============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL') || 'https://app.use60.com';

const JOB_NAME = 'integration-health-heartbeat';

/** Google Calendar sync considered stale after this many hours */
const GOOGLE_STALE_HOURS = 6;

/** Dedup window: don't alert for the same integration if alerted within this window */
const DEDUP_WINDOW_HOURS = 24;

// =============================================================================
// Types
// =============================================================================

interface IntegrationAlert {
  userId: string;
  orgId: string;
  integration: string;
  title: string;
  summary: string;
  context: Record<string, unknown>;
}

interface SyncStatusRow {
  user_id: string;
  calendar_last_synced_at: string | null;
}

interface OrgMemberRow {
  user_id: string;
  role: string;
}

interface IntegrationCredRow {
  organization_id: string;
  is_active: boolean;
  updated_at: string | null;
}

interface FathomIntegrationRow {
  id: string;
  user_id: string;
  token_expires_at: string;
  fathom_user_email: string | null;
}

// =============================================================================
// Check 1: Google Calendar stale sync
// =============================================================================

async function checkGoogleCalendarHealth(
  supabase: any
): Promise<IntegrationAlert[]> {
  const alerts: IntegrationAlert[] = [];

  try {
    const staleThreshold = new Date(Date.now() - GOOGLE_STALE_HOURS * 60 * 60 * 1000).toISOString();

    // Find users with active Google integration whose last calendar sync is stale
    const { data: staleUsers, error } = await supabase
      .from('user_sync_status')
      .select('user_id, calendar_last_synced_at')
      .lt('calendar_last_synced_at', staleThreshold);

    if (error) {
      console.error('[health-heartbeat] Google sync status query error:', error.message);
      return alerts;
    }

    if (!staleUsers?.length) return alerts;

    // For each stale user, verify they still have an active Google integration
    for (const row of staleUsers as SyncStatusRow[]) {
      const userId = row.user_id;

      const { data: integration } = await supabase
        .from('google_integrations')
        .select('id, user_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();

      if (!integration) continue; // No active integration, skip

      // Get org_id for this user
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      if (!membership?.org_id) continue;

      const lastSync = row.calendar_last_synced_at;
      const hoursStale = lastSync
        ? Math.round((Date.now() - new Date(lastSync as string).getTime()) / 3_600_000)
        : 999;

      alerts.push({
        userId,
        orgId: membership.org_id as string,
        integration: 'google_calendar',
        title: `Google Calendar sync stale (${hoursStale}h)`,
        summary: `Your Google Calendar hasn't synced in ${hoursStale} hours. Meetings may be missing from 60.`,
        context: {
          last_sync_at: lastSync,
          hours_stale: hoursStale,
          integration: 'google_calendar',
        },
      });
    }
  } catch (err) {
    console.error('[health-heartbeat] Google calendar check error:', String(err));
  }

  return alerts;
}

// =============================================================================
// Check 2: Slack connectivity
// =============================================================================

async function checkSlackHealth(
  supabase: any
): Promise<IntegrationAlert[]> {
  const alerts: IntegrationAlert[] = [];

  try {
    // Find orgs where Slack is marked connected but bot_access_token is missing
    const { data: brokenOrgs, error } = await supabase
      .from('slack_org_settings')
      .select('org_id')
      .eq('is_connected', true)
      .is('bot_access_token', null);

    if (error) {
      console.error('[health-heartbeat] Slack settings query error:', error.message);
      return alerts;
    }

    if (!brokenOrgs?.length) return alerts;

    for (const org of brokenOrgs as { org_id: string }[]) {
      // Get all members of this org to alert them
      const { data: members } = await supabase
        .from('organization_memberships')
        .select('user_id, role')
        .eq('org_id', org.org_id)
        .in('role', ['owner', 'admin']);

      if (!members?.length) continue;

      for (const member of members as OrgMemberRow[]) {
        alerts.push({
          userId: member.user_id,
          orgId: org.org_id,
          integration: 'slack',
          title: 'Slack integration missing bot token',
          summary: 'Slack is marked as connected but the bot token is missing. Please reconnect Slack in Settings.',
          context: {
            integration: 'slack',
            issue: 'bot_token_missing',
          },
        });
      }
    }
  } catch (err) {
    console.error('[health-heartbeat] Slack check error:', String(err));
  }

  return alerts;
}

// =============================================================================
// Check 3: HubSpot integration credentials
// =============================================================================

async function checkHubSpotHealth(
  supabase: any
): Promise<IntegrationAlert[]> {
  const alerts: IntegrationAlert[] = [];

  try {
    // Find orgs with HubSpot credentials that are inactive
    const { data: creds, error } = await supabase
      .from('integration_credentials')
      .select('organization_id, is_active, updated_at')
      .eq('provider', 'hubspot')
      .eq('is_active', false);

    if (error) {
      console.error('[health-heartbeat] HubSpot credentials query error:', error.message);
      return alerts;
    }

    if (!creds?.length) return alerts;

    for (const cred of creds as IntegrationCredRow[]) {
      // Alert admins/owners of this org
      const { data: members } = await supabase
        .from('organization_memberships')
        .select('user_id, role')
        .eq('org_id', cred.organization_id)
        .in('role', ['owner', 'admin']);

      if (!members?.length) continue;

      for (const member of members as OrgMemberRow[]) {
        alerts.push({
          userId: member.user_id,
          orgId: cred.organization_id,
          integration: 'hubspot',
          title: 'HubSpot integration inactive',
          summary: 'Your HubSpot connection is inactive. CRM data will not sync until it is reconnected.',
          context: {
            integration: 'hubspot',
            last_updated: cred.updated_at,
            issue: 'inactive',
          },
        });
      }
    }
  } catch (err) {
    console.error('[health-heartbeat] HubSpot check error:', String(err));
  }

  return alerts;
}

// =============================================================================
// Check 4: Fathom token expiry
// =============================================================================

async function checkFathomHealth(
  supabase: any
): Promise<IntegrationAlert[]> {
  const alerts: IntegrationAlert[] = [];

  try {
    const now = new Date().toISOString();

    // Find active Fathom integrations with expired tokens
    const { data: expired, error } = await supabase
      .from('fathom_integrations')
      .select('id, user_id, token_expires_at, fathom_user_email')
      .eq('is_active', true)
      .lt('token_expires_at', now);

    if (error) {
      console.error('[health-heartbeat] Fathom query error:', error.message);
      return alerts;
    }

    if (!expired?.length) return alerts;

    for (const integration of expired as FathomIntegrationRow[]) {
      // Get org_id for this user
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', integration.user_id)
        .limit(1)
        .maybeSingle();

      if (!membership?.org_id) continue;

      const expiresAt = new Date(integration.token_expires_at);
      const hoursExpired = Math.round((Date.now() - expiresAt.getTime()) / 3_600_000);

      alerts.push({
        userId: integration.user_id,
        orgId: membership.org_id as string,
        integration: 'fathom',
        title: `Fathom token expired (${hoursExpired}h ago)`,
        summary: `Your Fathom meeting recording token expired ${hoursExpired} hours ago. New meetings won't be captured until reconnected.`,
        context: {
          integration: 'fathom',
          token_expires_at: integration.token_expires_at,
          hours_expired: hoursExpired,
          fathom_email: integration.fathom_user_email,
        },
      });
    }
  } catch (err) {
    console.error('[health-heartbeat] Fathom check error:', String(err));
  }

  return alerts;
}

// =============================================================================
// Dedup: check for recent CC alert for this user+integration
// =============================================================================

async function hasRecentAlert(
  supabase: any,
  userId: string,
  integration: string
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('command_centre_items')
      .select('id')
      .eq('user_id', userId)
      .eq('source_agent', 'integration-health')
      .eq('item_type', 'alert')
      .in('status', ['open', 'ready'])
      .gte('created_at', since)
      .limit(1);

    if (error) {
      console.warn('[health-heartbeat] Dedup query error, proceeding with alert:', error.message);
      return false;
    }

    // Also check context->integration matches
    if (data && data.length > 0) {
      // We found a recent alert from this agent. To be more precise,
      // check context->integration via a separate query.
      const { data: exactMatch } = await supabase
        .from('command_centre_items')
        .select('id')
        .eq('user_id', userId)
        .eq('source_agent', 'integration-health')
        .eq('item_type', 'alert')
        .in('status', ['open', 'ready'])
        .gte('created_at', since)
        .contains('context', { integration })
        .limit(1);

      return (exactMatch?.length ?? 0) > 0;
    }

    return false;
  } catch (err) {
    console.warn('[health-heartbeat] Dedup check error, proceeding:', String(err));
    return false;
  }
}

// =============================================================================
// Process alert: write to CC + send Slack DM
// =============================================================================

async function processAlert(
  supabase: any,
  alert: IntegrationAlert,
  slackOrgMap: Map<string, { botToken: string; adminSlackUserId: string | null }>
): Promise<boolean> {
  // Dedup: check for recent matching alert
  const isDupe = await hasRecentAlert(supabase, alert.userId, alert.integration);
  if (isDupe) {
    console.log(
      `[health-heartbeat] Skipping duplicate alert: ${alert.integration} for user ${alert.userId}`
    );
    return false;
  }

  // Write to Command Centre
  const ccId = await writeToCommandCentre({
    org_id: alert.orgId,
    user_id: alert.userId,
    source_agent: 'integration-health',
    item_type: 'alert',
    title: alert.title,
    summary: alert.summary,
    context: alert.context,
    urgency: 'high',
  });

  if (ccId) {
    console.log(`[health-heartbeat] CC item created: ${ccId} for ${alert.integration} (user ${alert.userId})`);
  }

  // Send Slack DM if org has Slack connected
  const slackOrg = slackOrgMap.get(alert.orgId);
  if (slackOrg?.botToken) {
    // Get Slack user ID for this user
    const { data: mapping } = await supabase
      .from('slack_user_mappings')
      .select('slack_user_id')
      .eq('org_id', alert.orgId)
      .eq('sixty_user_id', alert.userId)
      .maybeSingle();

    const slackUserId = mapping?.slack_user_id as string | undefined;
    if (slackUserId) {
      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              `*Integration Alert: ${alert.title}*\n\n` +
              `${alert.summary}\n\n` +
              `<${APP_URL}/settings/integrations|Fix in Settings>`,
          },
        },
      ];

      const result = await sendSlackDM({
        botToken: slackOrg.botToken,
        slackUserId,
        text: alert.title,
        blocks,
      });

      // US-022: Log the delivery
      logSlackDelivery({
        userId: alert.userId,
        orgId: alert.orgId,
        messageType: 'integration_alert',
        channelId: result.channelId,
        success: result.success,
        errorMessage: result.error,
      });

      if (result.success) {
        console.log(`[health-heartbeat] Slack DM sent for ${alert.integration} to user ${alert.userId}`);
      } else {
        console.warn(`[health-heartbeat] Slack DM failed for ${alert.integration}: ${result.error}`);
      }
    }
  }

  return true;
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
    // Auth: cron secret or service role
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

    // Circuit breaker check (US-023)
    if (await isCircuitOpen(supabase, JOB_NAME)) {
      console.log(`[health-heartbeat] Circuit breaker OPEN — skipping execution`);
      return jsonResponse({ success: true, skipped: true, reason: 'circuit_open' }, req);
    }

    // Build Slack org lookup map
    const { data: slackOrgs } = await supabase
      .from('slack_org_settings')
      .select('org_id, bot_access_token, admin_slack_user_id')
      .eq('is_connected', true)
      .not('bot_access_token', 'is', null);

    const slackOrgMap = new Map<string, { botToken: string; adminSlackUserId: string | null }>();
    if (slackOrgs) {
      for (const org of slackOrgs as { org_id: string; bot_access_token: string; admin_slack_user_id: string | null }[]) {
        slackOrgMap.set(org.org_id, {
          botToken: org.bot_access_token,
          adminSlackUserId: org.admin_slack_user_id,
        });
      }
    }

    // Run all health checks in parallel
    const [googleAlerts, slackAlerts, hubspotAlerts, fathomAlerts] = await Promise.all([
      checkGoogleCalendarHealth(supabase),
      checkSlackHealth(supabase),
      checkHubSpotHealth(supabase),
      checkFathomHealth(supabase),
    ]);

    const allAlerts = [...googleAlerts, ...slackAlerts, ...hubspotAlerts, ...fathomAlerts];

    let alertsProcessed = 0;
    let alertsSkippedDedup = 0;
    const errors: string[] = [];

    for (const alert of allAlerts) {
      try {
        const processed = await processAlert(supabase, alert, slackOrgMap);
        if (processed) {
          alertsProcessed++;
        } else {
          alertsSkippedDedup++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[health-heartbeat] Alert processing error (${alert.integration}):`, msg);
        errors.push(`${alert.integration} user=${alert.userId}: ${msg}`);
      }
    }

    // Record success for circuit breaker
    await recordSuccess(supabase, JOB_NAME);

    console.log(
      `[health-heartbeat] Complete — found=${allAlerts.length}, processed=${alertsProcessed}, ` +
      `deduped=${alertsSkippedDedup}, errors=${errors.length} ` +
      `(google=${googleAlerts.length}, slack=${slackAlerts.length}, ` +
      `hubspot=${hubspotAlerts.length}, fathom=${fathomAlerts.length})`
    );

    return jsonResponse(
      {
        success: true,
        summary: {
          total_alerts: allAlerts.length,
          processed: alertsProcessed,
          skipped_dedup: alertsSkippedDedup,
          by_integration: {
            google_calendar: googleAlerts.length,
            slack: slackAlerts.length,
            hubspot: hubspotAlerts.length,
            fathom: fathomAlerts.length,
          },
        },
        errors: errors.length > 0 ? errors : undefined,
      },
      req
    );
  } catch (error) {
    console.error('[health-heartbeat] Fatal error:', error);

    // Record failure for circuit breaker
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await recordFailure(supabase, JOB_NAME);
    } catch (cbErr) {
      console.error('[health-heartbeat] Circuit breaker recordFailure error:', String(cbErr));
    }

    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      req,
      500
    );
  }
});
