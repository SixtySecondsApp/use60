/**
 * Slack Morning Brief Edge Function
 * 
 * Sends daily morning brief DMs to sales reps with:
 * - Today's meetings
 * - Overdue and due-today tasks
 * - Deals closing this week
 * - Emails needing response
 * - AI-generated insights and priorities
 * 
 * Runs daily via cron (scheduled for 8am user timezone, with dedupe to prevent duplicates).
 * Mirrors all Slack notifications into in-app notifications.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import { getCorsHeaders, handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts';
import {
  getSlackOrgSettings,
  getNotificationFeatureSettings,
  getSlackRecipients,
  shouldSendNotification,
  recordNotificationSent,
  deliverToSlack,
  deliverToInApp,
} from '../_shared/proactive/index.ts';
import { buildMorningBriefMessage, type MorningBriefData } from '../_shared/slackBlocks.ts';
import { runSkill } from '../_shared/skillsRuntime.ts';
import { InstantlyClient } from '../_shared/instantly.ts';
import {
  loadCCBriefItems,
  convertCCItemsToPriorities,
  convertCCItemsToInsights,
} from '../_shared/commandCentre/briefingAdapter.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://app.use60.com';

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    // SECURITY: Fail-closed authentication
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');
    const isCronAuth = verifyCronSecret(req, cronSecret);
    const isServiceRole = isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY);

    if (!isCronAuth && !isServiceRole) {
      console.error('[slack-morning-brief] Unauthorized access attempt');
      return errorResponse('Unauthorized', req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Get all orgs with Slack connected
    const { data: slackOrgs } = await supabase
      .from('slack_org_settings')
      .select('org_id, bot_access_token, slack_team_id')
      .eq('is_connected', true)
      .not('bot_access_token', 'is', null);

    if (!slackOrgs?.length) {
      return jsonResponse({
        success: true,
        message: 'No Slack-connected orgs found',
        briefsSent: 0,
      }, req);
    }

    let totalBriefsSent = 0;
    const errors: string[] = [];

    // Process each org
    for (const org of slackOrgs) {
      try {
        // Check if morning brief is enabled
        const settings = await getNotificationFeatureSettings(
          supabase,
          org.org_id,
          'morning_brief'
        );

        if (!settings?.isEnabled) {
          continue;
        }

        // Get Slack org settings
        const slackSettings = await getSlackOrgSettings(supabase, org.org_id);
        if (!slackSettings) continue;

        // Get recipients with briefing preferences (SLACK-013)
        const recipients = await getSlackRecipients(supabase, org.org_id);

        // Fetch user briefing preferences for per-user timing
        const { data: userPrefs } = await supabase
          .from('slack_user_mappings')
          .select('sixty_user_id, preferred_briefing_time, preferred_timezone')
          .eq('org_id', org.org_id)
          .not('sixty_user_id', 'is', null);

        const prefsMap = new Map<string, { time: string; tz: string }>();
        for (const p of userPrefs || []) {
          if (p.sixty_user_id) {
            prefsMap.set(p.sixty_user_id, {
              time: p.preferred_briefing_time || '08:00',
              tz: p.preferred_timezone || 'America/New_York',
            });
          }
        }

        // Process each recipient
        for (const recipient of recipients) {
          try {
            // SLACK-013: Check if it's the right time for this user
            const userPref = prefsMap.get(recipient.userId);
            if (!isWithinBriefingWindow(userPref?.time || '08:00', userPref?.tz || 'America/New_York')) {
              continue; // Not time yet for this user
            }

            // Check dedupe (one brief per day per user)
            const shouldSend = await shouldSendNotification(
              supabase,
              'morning_brief',
              org.org_id,
              recipient.slackUserId,
              undefined
            );

            if (!shouldSend) {
              continue; // Already sent today
            }

            // SLACK-008: Fetch previous snapshot for delta detection
            const previousSnapshot = await getPreviousSnapshot(
              supabase,
              org.org_id,
              recipient.userId
            );

            // Build morning brief data (with delta tags from previous snapshot)
            const briefData = await buildMorningBriefData(
              supabase,
              org.org_id,
              recipient.userId,
              recipient.name || recipient.email || 'there',
              previousSnapshot
            );

            if (!briefData) {
              continue; // No data to show (all clear)
            }

            // CC8-006: Check config flag to decide source for priorities/insights
            // When 'command_centre' source is active and CC has 3+ items, skip the
            // legacy AI skill so CC-derived priorities are not overwritten.
            let ccSourceActive = false;
            try {
              const { data: morningBriefSourceConfig } = await supabase.rpc('resolve_agent_config', {
                p_org_id: org.org_id,
                p_user_id: recipient.userId,
                p_agent_type: 'morning_briefing',
                p_config_key: 'morning_brief_source',
              });

              const briefSource: string = morningBriefSourceConfig ?? 'legacy';

              if (briefSource === 'command_centre') {
                // Load CC items and use them if there are enough to be meaningful
                try {
                  const ccItems = await loadCCBriefItems(supabase, recipient.userId, 15);
                  if (ccItems.total >= 3) {
                    briefData.priorities = convertCCItemsToPriorities(ccItems);
                    briefData.insights = convertCCItemsToInsights(ccItems);
                    ccSourceActive = true;
                    console.log(
                      `[slack-morning-brief] CC source: ${ccItems.total} items (${ccItems.critical.length} critical, ${ccItems.high.length} high, ${ccItems.normal.length} normal) for user ${recipient.userId}`,
                    );
                  } else {
                    // Fall back to legacy if CC has fewer than 3 items (transition safety net)
                    console.log(
                      `[slack-morning-brief] CC source: only ${ccItems.total} items — falling back to legacy for user ${recipient.userId}`,
                    );
                  }
                } catch (ccError) {
                  console.warn('[slack-morning-brief] CC items load failed, falling back to legacy:', ccError);
                }
              }
            } catch (configError) {
              console.warn('[slack-morning-brief] Config flag read failed, using legacy path:', configError);
            }

            // Generate AI insights using skills (legacy path — skipped when CC source is active)
            if (!ccSourceActive) {
              try {
                const skillResult = await runSkill(
                  supabase,
                  'suggest_next_actions',
                  {
                    activityContext: JSON.stringify(briefData),
                    recentActivities: JSON.stringify(briefData.meetings.slice(0, 5)),
                    existingTasks: JSON.stringify([...briefData.tasks.overdue, ...briefData.tasks.dueToday]),
                  },
                  org.org_id,
                  recipient.userId
                );

                if (skillResult.success && skillResult.output) {
                  if (Array.isArray(skillResult.output)) {
                    briefData.priorities = skillResult.output
                      .slice(0, 3)
                      .map((item: any) => item.title || item.action || String(item));
                  } else if (skillResult.output.priorities) {
                    briefData.priorities = skillResult.output.priorities;
                  }
                  if (skillResult.output.insights) {
                    briefData.insights = skillResult.output.insights;
                  }
                }
              } catch (skillError) {
                console.warn('[slack-morning-brief] Skill execution failed, using defaults:', skillError);
              }
            } // end if (!ccSourceActive)

            // Build Slack message
            const slackMessage = buildMorningBriefMessage(briefData);

            // Deliver to Slack
            const slackResult = await deliverToSlack(
              supabase,
              {
                type: 'morning_brief',
                orgId: org.org_id,
                recipientUserId: recipient.userId,
                recipientSlackUserId: recipient.slackUserId,
                title: `Good morning, ${briefData.userName}!`,
                message: slackMessage.text || 'Here\'s your day at a glance.',
                blocks: slackMessage.blocks,
                actionUrl: `${APP_URL}/calendar`,
                inAppCategory: 'team',
                inAppType: 'info',
                metadata: {
                  meetingsCount: briefData.meetings.length,
                  tasksCount: briefData.tasks.overdue.length + briefData.tasks.dueToday.length,
                  dealsCount: briefData.deals.length,
                },
              },
              slackSettings.botAccessToken
            );

            // Record notification sent + store snapshot for delta detection
            if (slackResult.sent) {
              await recordNotificationSent(
                supabase,
                'morning_brief',
                org.org_id,
                recipient.slackUserId,
                slackResult.channelId,
                slackResult.ts,
                undefined
              );

              // SLACK-008: Store snapshot for next day's delta comparison
              await storeSnapshot(supabase, org.org_id, recipient.userId, briefData);
            }

            // Mirror to in-app
            await deliverToInApp(supabase, {
              type: 'morning_brief',
              orgId: org.org_id,
              recipientUserId: recipient.userId,
              recipientSlackUserId: recipient.slackUserId,
              title: `Good morning, ${briefData.userName}!`,
              message: slackMessage.text || 'Here\'s your day at a glance.',
              actionUrl: `${APP_URL}/calendar`,
              inAppCategory: 'team',
              inAppType: 'info',
              metadata: {
                meetingsCount: briefData.meetings.length,
                tasksCount: briefData.tasks.overdue.length + briefData.tasks.dueToday.length,
                dealsCount: briefData.deals.length,
              },
            });

            if (slackResult.sent) {
              totalBriefsSent++;
            } else {
              errors.push(`Failed to send to ${recipient.email || recipient.userId}: ${slackResult.error}`);
            }

            // Fire coaching_weekly orchestrator event (Mondays only, non-blocking)
            if (new Date().getDay() === 1) {
              try {
                const today = new Date().toISOString().split('T')[0];
                fetch(`${SUPABASE_URL}/functions/v1/agent-orchestrator`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    type: 'coaching_weekly',
                    source: 'cron:weekly',
                    org_id: org.org_id,
                    user_id: recipient.userId,
                    payload: {},
                    idempotency_key: `coaching_weekly:${recipient.userId}:${today}`,
                  }),
                }).catch(err => console.warn('[slack-morning-brief] coaching_weekly fire-and-forget failed:', err));
              } catch (err) {
                console.warn('[slack-morning-brief] Non-fatal: coaching_weekly event failed:', err);
              }
            }

            // Fire campaign_daily_check orchestrator event (daily, non-blocking)
            // Only fire if org has Instantly integration configured
            try {
              const { data: instantlyCreds } = await supabase
                .from('integration_credentials')
                .select('credentials')
                .eq('organization_id', org.org_id)
                .eq('integration_name', 'instantly')
                .maybeSingle();

              if (instantlyCreds?.credentials?.api_key) {
                const today = new Date().toISOString().split('T')[0];
                fetch(`${SUPABASE_URL}/functions/v1/agent-orchestrator`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    type: 'campaign_daily_check',
                    source: 'cron:morning',
                    org_id: org.org_id,
                    user_id: recipient.userId,
                    payload: {},
                    idempotency_key: `campaign_daily_check:${recipient.userId}:${today}`,
                  }),
                }).catch(err => console.warn('[slack-morning-brief] campaign_daily_check fire-and-forget failed:', err));
              }
            } catch (err) {
              console.warn('[slack-morning-brief] Non-fatal: campaign_daily_check event failed:', err);
            }
          } catch (userError) {
            console.error(`[slack-morning-brief] Error processing user ${recipient.userId}:`, userError);
            errors.push(`User ${recipient.userId}: ${userError instanceof Error ? userError.message : 'Unknown error'}`);
          }
        }
      } catch (orgError) {
        console.error(`[slack-morning-brief] Error processing org ${org.org_id}:`, orgError);
        errors.push(`Org ${org.org_id}: ${orgError instanceof Error ? orgError.message : 'Unknown error'}`);
      }
    }

    return jsonResponse({
      success: true,
      briefsSent: totalBriefsSent,
      errors: errors.length > 0 ? errors : undefined,
    }, req);
  } catch (error) {
    console.error('[slack-morning-brief] Fatal error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      req,
      500
    );
  }
});

/**
 * SLACK-013: Check if current UTC time is within ±7min of a user's preferred briefing time
 */
function isWithinBriefingWindow(preferredTime: string, timezone: string): boolean {
  try {
    const now = new Date();
    // Get current time in user's timezone
    const userNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const userHour = userNow.getHours();
    const userMinute = userNow.getMinutes();

    // Parse preferred time (HH:MM format)
    const [prefHour, prefMinute] = preferredTime.split(':').map(Number);

    // Check if within ±7 minute window (covers 15-min cron intervals)
    const userMinutes = userHour * 60 + userMinute;
    const prefMinutes = prefHour * 60 + prefMinute;
    const diff = Math.abs(userMinutes - prefMinutes);

    return diff <= 7 || diff >= (24 * 60 - 7); // Handle midnight wrap
  } catch (e) {
    console.warn(`[slack-morning-brief] Invalid timezone ${timezone}, defaulting to allow:`, e);
    return true;
  }
}

/**
 * SLACK-008: Get previous day's briefing snapshot for delta detection
 */
async function getPreviousSnapshot(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userId: string
): Promise<BriefingSnapshot | null> {
  const { data } = await supabase
    .from('daily_digest_analyses')
    .select('input_snapshot')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('digest_type', 'user')
    .eq('source', 'morning_brief')
    .order('digest_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.input_snapshot) return null;
  return data.input_snapshot as BriefingSnapshot;
}

/**
 * SLACK-008: Store snapshot after sending brief
 */
async function storeSnapshot(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userId: string,
  briefData: MorningBriefData
): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const snapshot: BriefingSnapshot = {
    dealStages: Object.fromEntries(briefData.deals.map(d => [d.id, d.stage])),
    dealValues: Object.fromEntries(briefData.deals.map(d => [d.id, d.value])),
    dealIds: briefData.deals.map(d => d.id),
    overdueTaskIds: briefData.tasks.overdue.map(t => t.id).filter(Boolean) as string[],
    meetingIds: briefData.meetings.map(m => m.id).filter(Boolean) as string[],
    campaignIds: briefData.campaigns?.map(c => c.id).filter(Boolean) as string[] || [],
  };

  await supabase
    .from('daily_digest_analyses')
    .upsert({
      org_id: orgId,
      user_id: userId,
      digest_date: today.toISOString().split('T')[0],
      digest_type: 'user',
      source: 'morning_brief',
      timezone: 'UTC',
      window_start: today.toISOString(),
      window_end: tomorrow.toISOString(),
      input_snapshot: snapshot,
      highlights: {},
      rendered_text: '',
    }, {
      onConflict: 'org_id,digest_date,digest_type,user_id',
      ignoreDuplicates: false,
    });
}

/**
 * SLACK-011: Fetch Instantly campaign stats for morning brief
 */
async function getInstantlyCampaigns(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<MorningBriefData['campaigns']> {
  // Check if Instantly is configured
  const { data: creds } = await supabase
    .from('integration_credentials')
    .select('credentials')
    .eq('organization_id', orgId)
    .eq('integration_name', 'instantly')
    .maybeSingle();

  if (!creds?.credentials?.api_key) return undefined;

  try {
    const client = new InstantlyClient({ apiKey: creds.credentials.api_key });

    // Fetch active campaigns
    const campaigns = await client.request<any>({
      method: 'GET',
      path: '/api/v2/campaigns',
      query: { status: 1, limit: 10 }, // status=1 = active
    });

    const items = campaigns?.items || campaigns || [];
    if (!Array.isArray(items) || items.length === 0) return undefined;

    const result: NonNullable<MorningBriefData['campaigns']> = [];

    for (const c of items.slice(0, 5)) {
      // Get campaign analytics
      let analytics: any = null;
      try {
        analytics = await client.request<any>({
          method: 'GET',
          path: `/api/v2/campaigns/${c.id}/analytics`,
        });
      } catch {
        // Skip analytics if endpoint fails
      }

      const newReplies = analytics?.replies_count || 0;
      const totalSent = analytics?.emails_sent_count || 0;
      const bounceCount = analytics?.bounced_count || 0;
      const bounceRate = totalSent > 0 ? (bounceCount / totalSent) * 100 : 0;
      const completionPct = analytics?.completion_percentage || 0;

      // Only include campaigns with notable events
      const hasNotableEvent = newReplies > 0 || bounceRate > 5 || completionPct >= 90;
      if (!hasNotableEvent && result.length >= 2) continue;

      result.push({
        id: c.id,
        name: c.name || 'Unnamed campaign',
        newReplies,
        totalSent,
        bounceRate: Math.round(bounceRate * 10) / 10,
        completionPct: Math.round(completionPct),
        isNotable: hasNotableEvent,
      });
    }

    return result.length > 0 ? result : undefined;
  } catch (err) {
    console.warn('[slack-morning-brief] Failed to fetch Instantly campaigns:', err);
    return undefined;
  }
}

interface BriefingSnapshot {
  dealStages: Record<string, string>;
  dealValues: Record<string, number>;
  dealIds: string[];
  overdueTaskIds: string[];
  meetingIds: string[];
  campaignIds: string[];
}

/**
 * SIG-010: Fetch signal watch data for the morning brief.
 *
 * Returns top 3 heating-up deals (via get_hot_deals RPC) and top 3
 * cooling-down deals (falling trend, lowest temperature first).
 * Gracefully returns empty arrays if the signal tables don't exist yet.
 */
async function getSignalWatchData(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
): Promise<MorningBriefData['signalWatch']> {
  interface HotDealRow {
    deal_id: string;
    deal_name: string;
    deal_value: number | null;
    temperature: number;
    trend: string;
    signal_count_24h: number;
  }

  interface TemperatureRow {
    deal_id: string;
    org_id: string;
    temperature: number;
    trend: string;
    signal_count_24h: number;
  }

  // 1. Hot (heating-up) deals: use existing get_hot_deals RPC
  const heatingUp: NonNullable<MorningBriefData['signalWatch']>['heatingUp'] = [];
  try {
    const { data: hotDeals, error: hotErr } = await supabase.rpc('get_hot_deals', {
      p_org_id: orgId,
      p_threshold: 0.5,
      p_limit: 3,
    }) as { data: HotDealRow[] | null; error: { message: string } | null };

    if (hotErr) {
      if (!hotErr.message.includes('relation') && !hotErr.message.includes('does not exist') && !hotErr.message.includes('function')) {
        console.warn('[slack-morning-brief] get_hot_deals error:', hotErr.message);
      }
    } else {
      for (const d of hotDeals ?? []) {
        heatingUp.push({
          deal_id: d.deal_id,
          deal_name: d.deal_name,
          deal_value: d.deal_value ?? null,
          temperature: d.temperature,
          trend: d.trend,
          signal_count_24h: d.signal_count_24h ?? 0,
        });
      }
    }
  } catch (e) {
    console.warn('[slack-morning-brief] get_hot_deals threw (non-fatal):', e);
  }

  // 2. Cooling-down deals: falling trend, lowest temperature first
  const coolingDown: NonNullable<MorningBriefData['signalWatch']>['coolingDown'] = [];
  try {
    const { data: coolingRows, error: coolErr } = await supabase
      .from('deal_signal_temperature')
      .select('deal_id, org_id, temperature, trend, signal_count_24h')
      .eq('org_id', orgId)
      .eq('trend', 'falling')
      .order('temperature', { ascending: true })
      .limit(3) as { data: TemperatureRow[] | null; error: { message: string } | null };

    if (coolErr) {
      if (!coolErr.message.includes('relation') && !coolErr.message.includes('does not exist')) {
        console.warn('[slack-morning-brief] cooling deals query error:', coolErr.message);
      }
    } else if ((coolingRows ?? []).length > 0) {
      const coolingDealIds = (coolingRows ?? []).map((r) => r.deal_id);
      const { data: dealRows } = await supabase
        .from('deals')
        .select('id, name, value')
        .in('id', coolingDealIds);

      const dealNameMap = new Map<string, { name: string; value: number | null }>();
      for (const d of dealRows ?? []) {
        dealNameMap.set(d.id, { name: d.name, value: d.value ?? null });
      }

      for (const r of coolingRows ?? []) {
        const dealInfo = dealNameMap.get(r.deal_id);
        coolingDown.push({
          deal_id: r.deal_id,
          deal_name: dealInfo?.name ?? 'Unknown deal',
          deal_value: dealInfo?.value ?? null,
          temperature: r.temperature,
          trend: r.trend,
          signal_count_24h: r.signal_count_24h ?? 0,
        });
      }
    }
  } catch (e) {
    console.warn('[slack-morning-brief] cooling deals query threw (non-fatal):', e);
  }

  if (heatingUp.length === 0 && coolingDown.length === 0) {
    return undefined;
  }

  return { heatingUp, coolingDown };
}

/**
 * Build morning brief data for a user
 */
async function buildMorningBriefData(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userId: string,
  userName: string,
  previousSnapshot?: BriefingSnapshot | null
): Promise<MorningBriefData | null> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekFromNow = new Date(today);
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  // Get org currency settings
  const { data: org } = await supabase
    .from('organizations')
    .select('currency_code, currency_locale')
    .eq('id', orgId)
    .single();

  // Parallel data fetching for performance
  const [meetingsResult, overdueResult, dueTodayResult, dealsResult, emailsResult] = await Promise.all([
    // Get today's meetings
    supabase
      .from('calendar_events')
      .select(`
        id,
        title,
        start_time,
        end_time,
        contacts:contact_id (id, full_name, companies:company_id (name)),
        deals:deal_id (id, title, value, stage)
      `)
      .eq('user_id', userId)
      .gte('start_time', today.toISOString())
      .lt('start_time', tomorrow.toISOString())
      .order('start_time', { ascending: true }),

    // Get overdue tasks
    supabase
      .from('tasks')
      .select('id, title, due_date, deals:deal_id (title)')
      .eq('assigned_to', userId)
      .eq('completed', false)
      .lt('due_date', today.toISOString())
      .order('due_date', { ascending: true })
      .limit(10),

    // Get due-today tasks
    supabase
      .from('tasks')
      .select('id, title, deals:deal_id (title)')
      .eq('assigned_to', userId)
      .eq('completed', false)
      .gte('due_date', today.toISOString())
      .lt('due_date', tomorrow.toISOString())
      .limit(10),

    // Get deals closing this week
    supabase
      .from('deals')
      .select('id, title, value, stage, close_date, health_status')
      .eq('owner_id', userId)
      .in('stage', ['sql', 'opportunity', 'verbal', 'proposal', 'negotiation'])
      .not('close_date', 'is', null)
      .lte('close_date', weekFromNow.toISOString())
      .order('close_date', { ascending: true })
      .limit(5),

    // Get emails to respond count
    supabase
      .from('email_categorizations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('category', 'to_respond')
      .is('responded_at', null),
  ]);

  const meetings = meetingsResult.data;
  const overdueTasks = overdueResult.data;
  const dueTodayTasks = dueTodayResult.data;
  const deals = dealsResult.data;
  const emailsToRespond = emailsResult.count;

  // Load engagement patterns for today's meeting contacts (non-blocking, best-effort)
  // Maps contact_id → engagement pattern for use in meeting formatting
  const meetingContactEngagementMap = new Map<string, {
    avg_response_time_hours: number | null;
    best_email_day: string | null;
    best_email_hour: number | null;
    response_trend: string | null;
  }>();

  try {
    // Extract unique contact IDs from today's meetings
    const meetingContactIds = (meetings || [])
      .flatMap((m: any) => m.contacts ?? [])
      .map((c: any) => c?.id)
      .filter((id: string | undefined): id is string => !!id);

    const uniqueContactIds = [...new Set(meetingContactIds)];

    if (uniqueContactIds.length > 0) {
      const { data: patterns } = await supabase
        .from('contact_engagement_patterns')
        .select('contact_id, avg_response_time_hours, best_email_day, best_email_hour, response_trend')
        .eq('org_id', orgId)
        .in('contact_id', uniqueContactIds);

      for (const p of patterns || []) {
        meetingContactEngagementMap.set(p.contact_id, {
          avg_response_time_hours: p.avg_response_time_hours ?? null,
          best_email_day: p.best_email_day ?? null,
          best_email_hour: p.best_email_hour ?? null,
          response_trend: p.response_trend ?? null,
        });
      }
    }
  } catch (patternErr) {
    console.warn('[slack-morning-brief] Could not load meeting contact engagement patterns:', patternErr);
  }

  // Get last activity date per deal for staleness detection (SLACK-014)
  const dealIds = (deals || []).map((d: any) => d.id);
  let dealLastActivity: Record<string, Date> = {};
  if (dealIds.length > 0) {
    const { data: activities } = await supabase
      .from('activities')
      .select('deal_id, created_at')
      .in('deal_id', dealIds)
      .order('created_at', { ascending: false });

    if (activities) {
      for (const a of activities) {
        if (a.deal_id && !dealLastActivity[a.deal_id]) {
          dealLastActivity[a.deal_id] = new Date(a.created_at);
        }
      }
    }
  }

  // SLACK-011: Fetch Instantly campaigns (non-blocking)
  let campaigns: MorningBriefData['campaigns'];
  try {
    campaigns = await getInstantlyCampaigns(supabase, orgId);
  } catch {
    // Skip campaigns if fetch fails
  }

  // SIG-010: Fetch signal watch data (heating-up and cooling-down deals)
  let signalWatch: MorningBriefData['signalWatch'];
  try {
    signalWatch = await getSignalWatchData(supabase, orgId);
  } catch (sigErr) {
    console.warn('[slack-morning-brief] Could not load signal watch data (non-fatal):', sigErr);
  }

  // Format meetings (include IDs for actionable buttons - SLACK-003)
  const formattedMeetings = (meetings || []).map((m: any) => {
    const startTime = new Date(m.start_time);
    const contact = m.contacts?.[0];
    const deal = m.deals?.[0];

    // Attach engagement pattern if available for this meeting's primary contact
    const contactEngagement = contact?.id
      ? meetingContactEngagementMap.get(contact.id) ?? null
      : null;

    return {
      id: m.id,
      time: startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      title: m.title,
      contactName: contact?.full_name,
      companyName: contact?.companies?.name,
      dealValue: deal?.value,
      dealStage: deal?.stage,
      isImportant: deal?.stage === 'proposal' || deal?.stage === 'negotiation',
      engagementPattern: contactEngagement,
    };
  });

  // Format tasks (include IDs for actionable buttons - SLACK-003)
  const formattedOverdueTasks = (overdueTasks || []).map((t: any) => {
    const dueDate = new Date(t.due_date);
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    return {
      id: t.id,
      title: t.title,
      daysOverdue,
      dealName: t.deals?.title,
    };
  });

  const formattedDueTodayTasks = (dueTodayTasks || []).map((t: any) => ({
    id: t.id,
    title: t.title,
    dealName: t.deals?.title,
  }));

  // Format deals (include activity gap for staleness detection - SLACK-014)
  const formattedDeals = (deals || []).map((d: any) => {
    const closeDate = d.close_date ? new Date(d.close_date) : null;
    const daysUntilClose = closeDate
      ? Math.ceil((closeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      : undefined;
    const lastActivity = dealLastActivity[d.id];
    const daysSinceActivity = lastActivity
      ? Math.floor((today.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
      : undefined;

    // SLACK-014: Deal movement detection — compare against previous snapshot
    let deltaTag: string | undefined;
    if (previousSnapshot) {
      const prevStage = previousSnapshot.dealStages[d.id];
      const prevValue = previousSnapshot.dealValues[d.id];
      const isNewDeal = !previousSnapshot.dealIds.includes(d.id);

      if (isNewDeal) {
        deltaTag = 'NEW';
      } else if (prevStage && prevStage !== d.stage) {
        deltaTag = `STAGE: ${prevStage} → ${d.stage}`;
      } else if (prevValue !== undefined && prevValue !== d.value) {
        deltaTag = d.value > prevValue ? 'VALUE UP' : 'VALUE DOWN';
      } else if (daysSinceActivity && daysSinceActivity > 5 &&
                 !(previousSnapshot.dealIds.includes(d.id) && daysSinceActivity <= 6)) {
        deltaTag = 'STALE';
      }
    }

    return {
      name: d.title,
      id: d.id,
      value: d.value || 0,
      stage: d.stage,
      closeDate: d.close_date,
      daysUntilClose,
      daysSinceActivity,
      isAtRisk: d.health_status === 'at_risk' || d.health_status === 'off_track',
      deltaTag,
    };
  });

  // SLACK-009: Priority scoring — sort deals by urgency
  formattedDeals.sort((a, b) => {
    const scoreA = (a.value || 0) * (a.isAtRisk ? 3 : 1) * (a.daysSinceActivity && a.daysSinceActivity > 5 ? 2 : 1);
    const scoreB = (b.value || 0) * (b.isAtRisk ? 3 : 1) * (b.daysSinceActivity && b.daysSinceActivity > 5 ? 2 : 1);
    return scoreB - scoreA;
  });

  // SLACK-009: Priority scoring — sort overdue tasks by days overdue
  formattedOverdueTasks.sort((a, b) => b.daysOverdue - a.daysOverdue);

  // SLACK-010: All-clear detection
  const hasActionableItems =
    formattedOverdueTasks.length > 0 ||
    formattedDeals.some(d => d.isAtRisk || (d.daysSinceActivity && d.daysSinceActivity > 5)) ||
    (emailsToRespond || 0) > 5;

  // If nothing actionable and no meetings, consider returning minimal brief
  if (!hasActionableItems && formattedMeetings.length === 0 && formattedDeals.length === 0) {
    return null; // Will trigger "all clear" in the caller
  }

  return {
    userName,
    date: today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    currencyCode: org?.currency_code,
    currencyLocale: org?.currency_locale,
    meetings: formattedMeetings,
    tasks: {
      overdue: formattedOverdueTasks,
      dueToday: formattedDueTodayTasks,
    },
    deals: formattedDeals,
    emailsToRespond: emailsToRespond || 0,
    insights: [],
    priorities: [],
    campaigns,
    signalWatch,
    appUrl: APP_URL,
  };
}
