/**
 * Proactive Pipeline Analysis Edge Function (enhanced — BRF-007)
 *
 * Daily analysis of pipeline health with enhanced morning briefing:
 * - Pipeline math (gap to target, coverage ratio, projected close)
 * - Quarter phase context (build / progress / close)
 * - Highest-leverage action recommendation
 * - Overnight activity summary ("while you slept")
 * - Existing signals: stale deals, overdue tasks, at-risk deals
 *
 * Also creates Action Centre items for HITL approval (AC-005).
 *
 * Runs as a cron job and can be called directly for a single user.
 *
 * @see docs/PRD_PROACTIVE_AI_TEAMMATE.md
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import {
  buildEnhancedMorningBriefMessage,
  type EnhancedMorningBriefData,
  type PipelineMathSummary,
  type QuarterPhaseSummary,
  type OvernightEventSummary,
  type ActionRecommendationSummary,
} from '../_shared/slackBlocks.ts';
import {
  detectQuarterPhase,
  recommendHighestLeverageAction,
  type DealSummary,
  type PipelineMathInput,
} from '../_shared/orchestrator/adapters/pipelineMath.ts';
import { getOvernightSummary } from '../_shared/orchestrator/adapters/overnightSummary.ts';

// ============================================================================
// Types
// ============================================================================

interface PipelineInsight {
  type: 'stale_deal' | 'overdue_task' | 'at_risk' | 'closing_soon' | 'no_activity';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  dealId?: string;
  dealName?: string;
  contactId?: string;
  contactName?: string;
  suggestedAction?: string;
  sequenceKey?: string;
  value?: number;
}

interface UserPipelineSummary {
  userId: string;
  userName: string;
  userEmail: string;
  organizationId: string;
  insights: PipelineInsight[];
  totalPipelineValue: number;
  dealsAtRisk: number;
  staleDealCount: number;
  overdueTaskCount: number;
  meetingsToday: number;
  // Enhanced fields (BRF-007)
  pipelineMath: PipelineMathSummary | null;
  quarterPhase: QuarterPhaseSummary | null;
  topAction: ActionRecommendationSummary | null;
  overnightEvents: OvernightEventSummary[];
  briefingFormat: 'detailed' | 'summary';
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const { action = 'analyze', userId, organizationId } = body;

    let response;

    switch (action) {
      case 'analyze':
        if (userId && organizationId) {
          response = await analyzeUserPipeline(supabase, userId, organizationId);
        } else {
          response = await analyzeAllUsers(supabase);
        }
        break;

      case 'send_notifications':
        response = await sendPipelineNotifications(supabase, body.summaries);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[proactive-pipeline-analysis] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// Analyze All Users (Cron Mode)
// ============================================================================

async function analyzeAllUsers(supabase: ReturnType<typeof createClient>): Promise<{ success: boolean; summaries: UserPipelineSummary[] }> {
  console.log('[Pipeline] Starting enhanced analysis for all users...');

  const { data: memberships, error: membershipsError } = await supabase
    .from('organization_memberships')
    .select('user_id, org_id');

  if (membershipsError) {
    throw new Error(`Failed to fetch memberships: ${membershipsError.message}`);
  }

  const userOrgMap = new Map<string, string>();
  for (const m of memberships || []) {
    if (!userOrgMap.has(m.user_id)) {
      userOrgMap.set(m.user_id, m.org_id);
    }
  }

  console.log(`[Pipeline] Found ${userOrgMap.size} users with org memberships`);

  const summaries: UserPipelineSummary[] = [];

  for (const [userId, orgId] of userOrgMap) {
    if (!orgId) continue;
    try {
      const summary = await analyzeUserPipeline(supabase, userId, orgId);
      if (summary.insights.length > 0 || summary.pipelineMath) {
        summaries.push(summary);
      }
    } catch (err) {
      console.error(`[Pipeline] Failed to analyze user ${userId}:`, err);
    }
  }

  console.log(`[Pipeline] Analysis complete. ${summaries.length} users with insights.`);

  if (summaries.length > 0) {
    await sendPipelineNotifications(supabase, summaries);
  }

  return { success: true, summaries };
}

// ============================================================================
// Analyze Single User Pipeline (Enhanced — BRF-007)
// ============================================================================

async function analyzeUserPipeline(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  organizationId: string
): Promise<UserPipelineSummary> {
  console.log(`[Pipeline] Enhanced analysis for user ${userId}...`);

  // Fetch user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name, email')
    .eq('id', userId)
    .maybeSingle();

  const userName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'User';
  const userEmail = profile?.email || '';

  const summary: UserPipelineSummary = {
    userId,
    userName,
    userEmail,
    organizationId,
    insights: [],
    totalPipelineValue: 0,
    dealsAtRisk: 0,
    staleDealCount: 0,
    overdueTaskCount: 0,
    meetingsToday: 0,
    pipelineMath: null,
    quarterPhase: null,
    topAction: null,
    overnightEvents: [],
    briefingFormat: 'detailed',
  };

  // -------------------------------------------------------------------------
  // 1. Resolve briefing config from agent_config
  // -------------------------------------------------------------------------
  const [briefingFormatConfig, quarterStartConfig] = await Promise.all([
    supabase.rpc('resolve_agent_config', {
      p_org_id: organizationId,
      p_user_id: userId,
      p_agent_type: 'morning_briefing',
      p_config_key: 'briefing_format',
    }),
    supabase.rpc('resolve_agent_config', {
      p_org_id: organizationId,
      p_user_id: userId,
      p_agent_type: 'morning_briefing',
      p_config_key: 'quarter_start_month',
    }),
  ]);

  const rawFormat = briefingFormatConfig.data;
  summary.briefingFormat =
    (typeof rawFormat === 'string' && rawFormat.replace(/"/g, '') === 'summary')
      ? 'summary'
      : 'detailed';

  const quarterStartMonth = quarterStartConfig.data
    ? parseInt(String(quarterStartConfig.data).replace(/"/g, ''), 10) || 1
    : 1;

  // -------------------------------------------------------------------------
  // 2. Calculate pipeline math via RPC (BRF-003)
  // -------------------------------------------------------------------------
  try {
    const { data: mathData, error: mathError } = await supabase.rpc(
      'calculate_pipeline_math',
      {
        p_org_id: organizationId,
        p_user_id: userId,
        p_period: 'quarterly',
      }
    );

    if (mathError) {
      console.warn(`[Pipeline] calculate_pipeline_math failed for user ${userId}:`, mathError.message);
    } else if (mathData) {
      const m = mathData as Record<string, unknown>;
      summary.pipelineMath = {
        target: (m.target as number) ?? null,
        closed_so_far: (m.closed_so_far as number) ?? 0,
        pct_to_target: (m.pct_to_target as number) ?? null,
        total_pipeline: (m.total_pipeline as number) ?? 0,
        weighted_pipeline: (m.weighted_pipeline as number) ?? 0,
        coverage_ratio: (m.coverage_ratio as number) ?? null,
        gap_amount: (m.gap_amount as number) ?? null,
        projected_close: (m.projected_close as number) ?? null,
        deals_at_risk: (m.deals_at_risk as number) ?? 0,
      };
      summary.totalPipelineValue = summary.pipelineMath.total_pipeline;
      summary.dealsAtRisk = summary.pipelineMath.deals_at_risk;
    }
  } catch (mathErr) {
    console.error(`[Pipeline] Pipeline math error for user ${userId}:`, mathErr);
  }

  // -------------------------------------------------------------------------
  // 3. Detect quarter phase (BRF-004)
  // -------------------------------------------------------------------------
  const phaseResult = detectQuarterPhase(quarterStartMonth);
  summary.quarterPhase = {
    phase: phaseResult.phase,
    label: phaseResult.label,
    weekOfQuarter: phaseResult.weekOfQuarter,
    weeksRemaining: phaseResult.weeksRemaining,
    description: phaseResult.description,
  };

  // -------------------------------------------------------------------------
  // 4. Get overnight summary (BRF-006)
  // -------------------------------------------------------------------------
  try {
    const overnightResult = await getOvernightSummary(supabase, userId, organizationId);
    summary.overnightEvents = overnightResult.events.slice(0, 5).map(e => ({
      type: e.type,
      description: e.description,
      deal_name: e.deal_name,
      severity: e.severity,
    }));
  } catch (overnightErr) {
    console.warn(`[Pipeline] Overnight summary failed for user ${userId}:`, overnightErr);
  }

  // -------------------------------------------------------------------------
  // 5. Standard pipeline signals: stale deals, overdue tasks, at-risk, closing soon
  // -------------------------------------------------------------------------
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: staleDeals } = await supabase
    .from('deals')
    .select('id, name, value, stage_id, last_activity_at, deal_stages(name, default_probability)')
    .eq('owner_id', userId)
    .eq('org_id', organizationId)
    .not('status', 'eq', 'won')
    .not('status', 'eq', 'lost')
    .lt('last_activity_at', sevenDaysAgo.toISOString());

  const dealSummaries: DealSummary[] = [];

  for (const deal of staleDeals || []) {
    summary.staleDealCount++;
    if (!summary.pipelineMath) summary.totalPipelineValue += deal.value || 0;

    const daysSinceActivity = deal.last_activity_at
      ? Math.floor((Date.now() - new Date(deal.last_activity_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    dealSummaries.push({
      deal_id: deal.id,
      deal_name: deal.name,
      deal_value: deal.value || 0,
      current_stage: (deal.deal_stages as any)?.name || 'Unknown',
      stage_probability: (deal.deal_stages as any)?.default_probability || 0,
      expected_close_date: null,
      days_since_last_activity: daysSinceActivity,
      health_score: null,
      risk_score: null,
      company_name: null,
      primary_contact_name: null,
    });

    summary.insights.push({
      type: 'stale_deal',
      severity: daysSinceActivity && daysSinceActivity > 14
        ? 'critical'
        : daysSinceActivity && daysSinceActivity > 10
        ? 'high'
        : 'medium',
      title: `${deal.name} - No activity in ${daysSinceActivity ?? '?'} days`,
      description: `This ${(deal.deal_stages as any)?.name || 'deal'} hasn't had any activity recently.`,
      dealId: deal.id,
      dealName: deal.name,
      value: deal.value,
      suggestedAction: 'Send a follow-up email',
      sequenceKey: 'seq-post-meeting-followup-pack',
    });
  }

  // Overdue tasks
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: overdueTasks } = await supabase
    .from('tasks')
    .select('id, title, due_date, contact_id, deal_id, contacts(first_name, last_name)')
    .eq('assigned_to', userId)
    .eq('status', 'pending')
    .lt('due_date', today.toISOString());

  for (const task of overdueTasks || []) {
    summary.overdueTaskCount++;
    const contactName = (task.contacts as any)
      ? `${(task.contacts as any).first_name || ''} ${(task.contacts as any).last_name || ''}`.trim()
      : null;

    summary.insights.push({
      type: 'overdue_task',
      severity: 'high',
      title: `Overdue: ${task.title}`,
      description: contactName ? `Task for ${contactName}` : 'Task is past due',
      contactId: task.contact_id,
      contactName: contactName ?? undefined,
      dealId: task.deal_id,
      suggestedAction: 'Complete or reschedule this task',
    });
  }

  // Deals closing soon (within 7 days)
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  const { data: closingSoon } = await supabase
    .from('deals')
    .select('id, name, value, expected_close_date, deal_stages(name, default_probability)')
    .eq('owner_id', userId)
    .eq('org_id', organizationId)
    .not('status', 'eq', 'won')
    .not('status', 'eq', 'lost')
    .gte('expected_close_date', today.toISOString().split('T')[0])
    .lte('expected_close_date', sevenDaysFromNow.toISOString().split('T')[0]);

  for (const deal of closingSoon || []) {
    const daysUntilClose = Math.floor(
      (new Date(deal.expected_close_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    dealSummaries.push({
      deal_id: deal.id,
      deal_name: deal.name,
      deal_value: deal.value || 0,
      current_stage: (deal.deal_stages as any)?.name || 'Unknown',
      stage_probability: (deal.deal_stages as any)?.default_probability || 50,
      expected_close_date: deal.expected_close_date,
      days_since_last_activity: null,
      health_score: null,
      risk_score: null,
      company_name: null,
      primary_contact_name: null,
    });

    summary.insights.push({
      type: 'closing_soon',
      severity: daysUntilClose <= 2 ? 'critical' : 'high',
      title: `${deal.name} - Closing in ${daysUntilClose} days`,
      description: `${(deal.deal_stages as any)?.name || 'Deal'} worth $${(deal.value || 0).toLocaleString()}`,
      dealId: deal.id,
      dealName: deal.name,
      value: deal.value,
      suggestedAction: 'Review and prep for close',
      sequenceKey: 'seq-next-meeting-command-center',
    });
  }

  // Today's meetings
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const { count: meetingCount } = await supabase
    .from('calendar_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('start_time', today.toISOString())
    .lt('start_time', tomorrow.toISOString())
    .gt('attendees_count', 1);

  summary.meetingsToday = meetingCount || 0;

  // At-risk deals (health_score < 50)
  const { data: atRiskDeals } = await supabase
    .from('deals')
    .select('id, name, value, health_score, risk_score, deal_stages(name, default_probability)')
    .eq('owner_id', userId)
    .eq('org_id', organizationId)
    .not('status', 'eq', 'won')
    .not('status', 'eq', 'lost')
    .lt('health_score', 50);

  for (const deal of atRiskDeals || []) {
    if (!summary.pipelineMath) summary.dealsAtRisk++;

    dealSummaries.push({
      deal_id: deal.id,
      deal_name: deal.name,
      deal_value: deal.value || 0,
      current_stage: (deal.deal_stages as any)?.name || 'Unknown',
      stage_probability: (deal.deal_stages as any)?.default_probability || 0,
      expected_close_date: null,
      days_since_last_activity: null,
      health_score: deal.health_score,
      risk_score: deal.risk_score,
      company_name: null,
      primary_contact_name: null,
    });

    summary.insights.push({
      type: 'at_risk',
      severity: deal.health_score < 25 ? 'critical' : 'high',
      title: `${deal.name} - Health score ${deal.health_score}%`,
      description: `This ${(deal.deal_stages as any)?.name || 'deal'} needs attention`,
      dealId: deal.id,
      dealName: deal.name,
      value: deal.value,
      suggestedAction: 'Run deal rescue analysis',
      sequenceKey: 'seq-deal-rescue-pack',
    });
  }

  // -------------------------------------------------------------------------
  // 6. Top action recommendation (BRF-004)
  // -------------------------------------------------------------------------
  if (summary.pipelineMath && dealSummaries.length > 0) {
    try {
      const mathInput: PipelineMathInput = {
        target: summary.pipelineMath.target,
        closed_so_far: summary.pipelineMath.closed_so_far,
        weighted_pipeline: summary.pipelineMath.weighted_pipeline,
        total_pipeline: summary.pipelineMath.total_pipeline,
        coverage_ratio: summary.pipelineMath.coverage_ratio,
        gap_amount: summary.pipelineMath.gap_amount,
        projected_close: summary.pipelineMath.projected_close,
        deals_at_risk: summary.pipelineMath.deals_at_risk,
        deals_by_stage: {},
      };

      const actionRec = recommendHighestLeverageAction(mathInput, phaseResult, dealSummaries);
      summary.topAction = {
        action: actionRec.action,
        rationale: actionRec.rationale,
        target_deal_name: actionRec.target_deal_name,
        urgency: actionRec.urgency,
        category: actionRec.category,
      };
    } catch (actionErr) {
      console.warn(`[Pipeline] Action recommendation failed for user ${userId}:`, actionErr);
    }
  }

  // Sort insights by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  summary.insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  summary.insights = summary.insights.slice(0, 10);

  console.log(`[Pipeline] User ${userId}: ${summary.insights.length} insights, pipeline=${summary.totalPipelineValue}`);

  // AC-005: Create Action Centre items
  if (summary.insights.length > 0) {
    await createActionCentreItems(supabase, summary);
  }

  return summary;
}

// ============================================================================
// Send Slack Notifications (Enhanced)
// ============================================================================

async function sendPipelineNotifications(
  supabase: ReturnType<typeof createClient>,
  summaries: UserPipelineSummary[]
): Promise<{ success: boolean; notificationsSent: number }> {
  let notificationsSent = 0;

  for (const summary of summaries) {
    try {
      const { data: slackAuth } = await supabase
        .from('slack_auth')
        .select('access_token, channel_id')
        .eq('user_id', summary.userId)
        .maybeSingle();

      if (!slackAuth?.access_token) {
        console.log(`[Pipeline] User ${summary.userId} has no Slack connected, skipping`);
        continue;
      }

      // Build enhanced Slack message
      const briefingData: EnhancedMorningBriefData = {
        userName: summary.userName,
        date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
        meetings: [],  // Populated below from calendar_events if needed
        tasks: {
          overdue: summary.insights
            .filter(i => i.type === 'overdue_task')
            .map(i => ({
              title: i.title.replace('Overdue: ', ''),
              daysOverdue: 1,
              dealName: i.dealName,
              contactId: i.contactId,
            })),
          dueToday: [],
        },
        deals: summary.insights
          .filter(i => i.dealId)
          .map(i => ({
            name: i.dealName || 'Unknown Deal',
            id: i.dealId!,
            value: i.value || 0,
            stage: 'Unknown',
            isAtRisk: i.type === 'at_risk',
            daysSinceActivity: undefined,
          })),
        emailsToRespond: 0,
        insights: [],
        priorities: [],
        appUrl: Deno.env.get('APP_URL') || 'https://app.use60.com',
        // Enhanced fields
        pipelineMath: summary.pipelineMath,
        quarterPhase: summary.quarterPhase,
        overnightEvents: summary.overnightEvents,
        topAction: summary.topAction,
        briefingFormat: summary.briefingFormat,
      };

      const message = buildEnhancedMorningBriefMessage(briefingData);

      const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${slackAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: slackAuth.channel_id || summary.userId,
          blocks: message.blocks,
          text: message.text || `Pipeline Pulse: ${summary.insights.length} items need your attention`,
        }),
      });

      if (slackResponse.ok) {
        notificationsSent++;
      }
    } catch (err) {
      console.error(`[Pipeline] Failed to send notification to ${summary.userId}:`, err);
    }
  }

  return { success: true, notificationsSent };
}

// ============================================================================
// AC-005: Create Action Centre Items
// ============================================================================

async function createActionCentreItems(
  supabase: ReturnType<typeof createClient>,
  summary: UserPipelineSummary
): Promise<number> {
  let itemsCreated = 0;

  const actionTypeMap: Record<string, string> = {
    stale_deal: 'alert',
    overdue_task: 'task',
    at_risk: 'alert',
    closing_soon: 'alert',
    no_activity: 'insight',
  };

  const riskLevelMap: Record<string, string> = {
    critical: 'high',
    high: 'medium',
    medium: 'low',
    low: 'info',
  };

  for (const insight of summary.insights) {
    try {
      const { error } = await supabase.rpc('create_action_centre_item', {
        p_user_id: summary.userId,
        p_org_id: summary.organizationId,
        p_action_type: actionTypeMap[insight.type] || 'insight',
        p_risk_level: riskLevelMap[insight.severity] || 'low',
        p_title: insight.title,
        p_description: insight.description,
        p_source_type: 'proactive',
        p_source_id: `pipeline-${insight.type}-${insight.dealId || insight.contactId || Date.now()}`,
        p_preview_data: {
          dealId: insight.dealId,
          dealName: insight.dealName,
          contactId: insight.contactId,
          contactName: insight.contactName,
          value: insight.value,
          sequenceKey: insight.sequenceKey,
          insightType: insight.type,
          suggestedAction: insight.suggestedAction,
        },
        p_deal_id: insight.dealId || null,
        p_contact_id: insight.contactId || null,
      });

      if (!error) itemsCreated++;
    } catch (err) {
      console.error(`[Pipeline] Error creating action centre item:`, err);
    }
  }

  return itemsCreated;
}
