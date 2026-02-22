/**
 * agent-eod-synthesis (EOD-007)
 *
 * Cron-triggered edge function (every 15 minutes) that delivers end-of-day
 * synthesis to users whose EOD delivery time falls within the current 15-minute
 * window in their local timezone.
 *
 * For each eligible user the function:
 *   1. Fetches today's scorecard via get_daily_scorecard() RPC
 *   2. Builds open items (pending replies, overdue tasks, action items)
 *   3. Builds tomorrow's calendar preview
 *   4. Generates the overnight agent plan
 *   5. Renders Slack Block Kit EOD message via buildEODSynthesisMessage()
 *   6. Sends the DM via Slack and writes delivery record to eod_deliveries
 *
 * Auth: accepts CRON_SECRET (x-cron-secret header) or service-role Bearer token.
 * Deploy: npx supabase functions deploy agent-eod-synthesis --project-ref <ref> --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import {
  handleCorsPreflightRequest,
  errorResponse,
  jsonResponse,
} from '../_shared/corsHelper.ts';
import { buildEODSynthesisMessage } from '../_shared/slackBlocks.ts';
import { getOpenItems, getTomorrowPreview } from '../_shared/orchestrator/adapters/eodSynthesis.ts';
import { generateOvernightPlan } from '../_shared/orchestrator/adapters/eodOvernight.ts';

// =============================================================================
// Config
// =============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://app.use60.com';

// EOD delivery window width in minutes — cron fires every 15 min
const DELIVERY_WINDOW_MINUTES = 15;

// =============================================================================
// Types
// =============================================================================

interface UserDeliveryTarget {
  user_id: string;
  org_id: string;
  timezone: string;
  eod_time: string; // HH:MM local
  working_days: string[];
  slack_user_id: string | null;
  slack_bot_token: string | null;
  detail_level: string;
  currency_code: string | null;
  currency_locale: string | null;
  user_name: string;
}

interface DeliveryResult {
  user_id: string;
  org_id: string;
  delivered: boolean;
  skipped?: string;
  error?: string;
}

interface BatchResult {
  users_evaluated: number;
  users_delivered: number;
  users_skipped: number;
  users_errored: number;
  results: DeliveryResult[];
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

    const body = await req.json().catch(() => ({}));
    // Allow single-user override for testing / on-demand delivery
    const singleUserId: string | undefined = body.user_id;

    console.log('[agent-eod-synthesis] Starting EOD synthesis delivery run...');

    const now = new Date();
    const targets = singleUserId
      ? await getSingleUserTarget(supabase, singleUserId)
      : await getEligibleUsers(supabase, now);

    console.log(`[agent-eod-synthesis] ${targets.length} user(s) eligible for EOD delivery`);

    const result: BatchResult = {
      users_evaluated: targets.length,
      users_delivered: 0,
      users_skipped: 0,
      users_errored: 0,
      results: [],
    };

    for (const target of targets) {
      const deliveryResult = await deliverEOD(supabase, target, now);
      result.results.push(deliveryResult);

      if (deliveryResult.delivered) {
        result.users_delivered++;
      } else if (deliveryResult.error) {
        result.users_errored++;
      } else {
        result.users_skipped++;
      }
    }

    console.log(
      `[agent-eod-synthesis] Complete: ${result.users_delivered} delivered, ` +
      `${result.users_skipped} skipped, ${result.users_errored} errored`
    );

    return jsonResponse(result, req);

  } catch (error) {
    console.error('[agent-eod-synthesis] Fatal error:', error);
    return errorResponse((error as Error).message, req, 500);
  }
});

// =============================================================================
// User eligibility
// =============================================================================

/**
 * Returns users whose eod_time falls within the current 15-minute window
 * in their local timezone, have not yet received a delivery today, and
 * have the EOD agent enabled for their org.
 */
async function getEligibleUsers(
  supabase: ReturnType<typeof createClient>,
  now: Date
): Promise<UserDeliveryTarget[]> {
  // Fetch all users with time preferences
  const { data: prefs, error: prefsErr } = await supabase
    .from('user_time_preferences')
    .select('user_id, org_id, timezone, eod_time, working_days');

  if (prefsErr) {
    console.error('[agent-eod-synthesis] Failed to fetch time prefs:', prefsErr.message);
    return [];
  }

  if (!prefs || prefs.length === 0) return [];

  // Get today's delivery date for each user (using their timezone)
  // and filter to those in the current 15-minute delivery window
  const eligible: string[] = [];
  const userLocalDates: Record<string, string> = {};

  for (const pref of prefs) {
    try {
      // Convert current UTC time to user's local time
      const localNow = new Date(now.toLocaleString('en-US', { timeZone: pref.timezone }));
      const localHH = localNow.getHours();
      const localMM = localNow.getMinutes();
      const [eodHH, eodMM] = pref.eod_time.split(':').map(Number);

      // Check if current local time falls within the delivery window
      const currentMinutes = localHH * 60 + localMM;
      const targetMinutes = eodHH * 60 + eodMM;
      const delta = currentMinutes - targetMinutes;

      if (delta >= 0 && delta < DELIVERY_WINDOW_MINUTES) {
        // Check working days
        const dayName = localNow.toLocaleDateString('en-US', { weekday: 'short' });
        const workingDays: string[] = Array.isArray(pref.working_days)
          ? pref.working_days
          : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

        if (workingDays.some(d => d.toLowerCase() === dayName.toLowerCase())) {
          eligible.push(pref.user_id);
          // Local date for deduplication check
          userLocalDates[pref.user_id] = localNow.toISOString().split('T')[0];
        }
      }
    } catch (tzErr) {
      console.warn(`[agent-eod-synthesis] Timezone error for user ${pref.user_id}:`, tzErr);
    }
  }

  if (eligible.length === 0) return [];

  // Filter out users who already received a delivery today
  const todayDates = [...new Set(Object.values(userLocalDates))];
  const { data: existingDeliveries } = await supabase
    .from('eod_deliveries')
    .select('user_id, delivery_date')
    .in('user_id', eligible)
    .in('delivery_date', todayDates)
    .not('delivered_at', 'is', null);

  const alreadyDelivered = new Set(
    (existingDeliveries || []).map(d => `${d.user_id}::${d.delivery_date}`)
  );

  const undeliveredUserIds = eligible.filter(uid => {
    const date = userLocalDates[uid];
    return !alreadyDelivered.has(`${uid}::${date}`);
  });

  if (undeliveredUserIds.length === 0) return [];

  return buildTargets(supabase, undeliveredUserIds, userLocalDates);
}

async function getSingleUserTarget(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<UserDeliveryTarget[]> {
  const now = new Date();
  const localDates: Record<string, string> = {
    [userId]: now.toISOString().split('T')[0],
  };
  return buildTargets(supabase, [userId], localDates);
}

async function buildTargets(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
  localDates: Record<string, string>
): Promise<UserDeliveryTarget[]> {
  // Fetch profiles (name, slack_user_id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, full_name, slack_user_id')
    .in('id', userIds);

  const profileMap: Record<string, { name: string; slack_user_id: string | null }> = {};
  for (const p of profiles || []) {
    profileMap[p.id] = {
      name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'there',
      slack_user_id: p.slack_user_id || null,
    };
  }

  // Fetch org Slack bot tokens (via slack_integrations or similar)
  const { data: prefs } = await supabase
    .from('user_time_preferences')
    .select('user_id, org_id, timezone, eod_time, working_days')
    .in('user_id', userIds);

  const orgIds = [...new Set((prefs || []).map((p: any) => p.org_id))];

  const { data: slackConnections } = await supabase
    .from('slack_connections')
    .select('org_id, bot_token')
    .in('org_id', orgIds);

  const slackBotMap: Record<string, string> = {};
  for (const conn of slackConnections || []) {
    slackBotMap[conn.org_id] = conn.bot_token;
  }

  // Fetch EOD config overrides (detail_level per org/user)
  const { data: configOverrides } = await supabase
    .from('agent_config_overrides')
    .select('org_id, config_key, config_value')
    .eq('agent_type', 'eod_synthesis')
    .in('config_key', ['detail_level', 'eod_enabled'])
    .in('org_id', orgIds);

  const orgConfig: Record<string, Record<string, unknown>> = {};
  for (const override of configOverrides || []) {
    if (!orgConfig[override.org_id]) orgConfig[override.org_id] = {};
    orgConfig[override.org_id][override.config_key] = override.config_value;
  }

  const targets: UserDeliveryTarget[] = [];
  for (const pref of prefs || []) {
    const profile = profileMap[pref.user_id];
    const orgCfg = orgConfig[pref.org_id] || {};

    // Skip if org has disabled EOD
    if (orgCfg.eod_enabled === false || orgCfg.eod_enabled === 'false') continue;

    targets.push({
      user_id: pref.user_id,
      org_id: pref.org_id,
      timezone: pref.timezone || 'America/Chicago',
      eod_time: pref.eod_time || '17:00',
      working_days: Array.isArray(pref.working_days) ? pref.working_days : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      slack_user_id: profile?.slack_user_id ?? null,
      slack_bot_token: slackBotMap[pref.org_id] ?? null,
      detail_level: typeof orgCfg.detail_level === 'string' ? orgCfg.detail_level : 'full',
      currency_code: null,
      currency_locale: null,
      user_name: profile?.name ?? 'there',
    });
  }

  return targets;
}

// =============================================================================
// EOD Delivery
// =============================================================================

/**
 * Generate and deliver the EOD synthesis for a single user.
 * Writes a delivery record to eod_deliveries regardless of success.
 */
async function deliverEOD(
  supabase: ReturnType<typeof createClient>,
  target: UserDeliveryTarget,
  now: Date
): Promise<DeliveryResult> {
  const localDate = new Date(
    now.toLocaleString('en-US', { timeZone: target.timezone })
  ).toISOString().split('T')[0];

  const orgId = target.org_id as unknown as string;

  // Pre-create delivery record (pending) so we can track failures
  const { data: deliveryRow, error: insertErr } = await supabase
    .from('eod_deliveries')
    .upsert({
      user_id: target.user_id,
      org_id: orgId,
      delivery_date: localDate,
      // delivered_at left null until we actually send
    }, { onConflict: 'user_id,delivery_date' })
    .select('id')
    .maybeSingle();

  if (insertErr) {
    console.warn(`[eod] Failed to create delivery row for user ${target.user_id}:`, insertErr.message);
  }

  try {
    // -------------------------------------------------------------------------
    // 1. Scorecard
    // -------------------------------------------------------------------------
    const { data: scorecardData, error: scorecardErr } = await supabase.rpc(
      'get_daily_scorecard',
      {
        p_user_id: target.user_id,
        p_org_id: orgId,
        p_date: localDate,
      }
    );

    if (scorecardErr) {
      console.warn(`[eod] Scorecard RPC error for user ${target.user_id}:`, scorecardErr.message);
    }

    const scorecard = scorecardData || {
      date: localDate,
      timezone: target.timezone,
      meetings_completed: 0,
      meetings_no_show: 0,
      emails_sent: 0,
      crm_updates_count: 0,
      tasks_completed: 0,
      deals_created_count: 0,
      deals_created_value: 0,
      pipeline_value_today: 0,
      pipeline_value_change: 0,
    };

    // -------------------------------------------------------------------------
    // 2. Open items
    // -------------------------------------------------------------------------
    let openItems;
    try {
      openItems = await getOpenItems(supabase as any, target.user_id, orgId);
    } catch (openItemsErr) {
      console.warn(`[eod] Open items error for user ${target.user_id}:`, openItemsErr);
      openItems = {
        pending_replies: [],
        unsent_drafts: 0,
        incomplete_actions: [],
        overdue_tasks: [],
        total_attention_items: 0,
      };
    }

    // -------------------------------------------------------------------------
    // 3. Tomorrow preview
    // -------------------------------------------------------------------------
    let tomorrowPreview;
    try {
      tomorrowPreview = await getTomorrowPreview(supabase as any, target.user_id, orgId);
    } catch (tpErr) {
      console.warn(`[eod] Tomorrow preview error for user ${target.user_id}:`, tpErr);
      tomorrowPreview = undefined;
    }

    // -------------------------------------------------------------------------
    // 4. Overnight plan
    // -------------------------------------------------------------------------
    let overnightPlan;
    try {
      overnightPlan = await generateOvernightPlan(supabase as any, target.user_id, orgId);
    } catch (opErr) {
      console.warn(`[eod] Overnight plan error for user ${target.user_id}:`, opErr);
      overnightPlan = undefined;
    }

    // -------------------------------------------------------------------------
    // 5. Build Slack message
    // -------------------------------------------------------------------------
    const message = buildEODSynthesisMessage({
      userName: target.user_name,
      slackUserId: target.slack_user_id ?? undefined,
      date: localDate,
      scorecard,
      openItems,
      tomorrowPreview: tomorrowPreview && tomorrowPreview.total_meetings > 0
        ? tomorrowPreview
        : undefined,
      overnightPlan: overnightPlan && overnightPlan.total_items > 0
        ? overnightPlan
        : undefined,
      detailLevel: target.detail_level === 'summary' ? 'summary' : 'full',
      currencyCode: target.currency_code ?? undefined,
      currencyLocale: target.currency_locale ?? undefined,
      appUrl: APP_URL,
    });

    // -------------------------------------------------------------------------
    // 6. Send via Slack DM
    // -------------------------------------------------------------------------
    if (!target.slack_bot_token || !target.slack_user_id) {
      // No Slack connection — store in DB but mark as delivered (in-app only)
      console.log(`[eod] No Slack connection for user ${target.user_id} — in-app only`);

      await updateDeliveryRecord(supabase, target.user_id, localDate, {
        scorecard,
        open_items: openItems,
        tomorrow_preview: tomorrowPreview,
        overnight_plan: overnightPlan,
      });

      return { user_id: target.user_id, org_id: orgId, delivered: true };
    }

    const slackResp = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${target.slack_bot_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: target.slack_user_id,
        blocks: message.blocks,
        text: message.text,
      }),
    });

    const slackBody = await slackResp.json().catch(() => ({}));

    if (!slackBody.ok) {
      console.error(
        `[eod] Slack send failed for user ${target.user_id}: ${slackBody.error}`
      );
      return {
        user_id: target.user_id,
        org_id: orgId,
        delivered: false,
        error: `slack_error:${slackBody.error}`,
      };
    }

    // -------------------------------------------------------------------------
    // 7. Write delivery record
    // -------------------------------------------------------------------------
    await updateDeliveryRecord(supabase, target.user_id, localDate, {
      scorecard,
      open_items: openItems,
      tomorrow_preview: tomorrowPreview,
      overnight_plan: overnightPlan,
    });

    console.log(`[eod] Delivered EOD to user ${target.user_id} (${localDate})`);
    return { user_id: target.user_id, org_id: orgId, delivered: true };

  } catch (err) {
    console.error(`[eod] Error delivering to user ${target.user_id}:`, err);
    return {
      user_id: target.user_id,
      org_id: orgId,
      delivered: false,
      error: String(err),
    };
  }
}

async function updateDeliveryRecord(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  deliveryDate: string,
  sections: {
    scorecard: unknown;
    open_items: unknown;
    tomorrow_preview: unknown;
    overnight_plan: unknown;
  }
): Promise<void> {
  const { error } = await supabase
    .from('eod_deliveries')
    .update({
      delivered_at: new Date().toISOString(),
      scorecard: sections.scorecard,
      open_items: sections.open_items,
      tomorrow_preview: sections.tomorrow_preview ?? null,
      overnight_plan: sections.overnight_plan ?? null,
    })
    .eq('user_id', userId)
    .eq('delivery_date', deliveryDate);

  if (error) {
    console.warn(`[eod] Failed to update delivery record for user ${userId}:`, error.message);
  }
}
