/**
 * Proactive Pipeline Analysis Edge Function
 *
 * PROACTIVE-002: Daily analysis of pipeline health, sends insights via Slack.
 * AC-005: Also creates Action Centre items for HITL approval.
 *
 * Runs as a cron job (daily at 9am, configurable per org) and:
 * 1. Analyzes each user's pipeline for stalling deals, overdue tasks
 * 2. Identifies opportunities where agent can add value
 * 3. Creates Action Centre items for user approval (AC-005)
 * 4. Sends summary to Slack with action options
 * 5. Tracks which insights get actioned
 *
 * @see docs/PRD_PROACTIVE_AI_TEAMMATE.md
 * @see docs/project-requirements/PRD_ACTION_CENTRE.md
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

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
        // Analyze all users (cron mode) or specific user
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

async function analyzeAllUsers(supabase: any): Promise<{ success: boolean; summaries: UserPipelineSummary[] }> {
  console.log('[Pipeline] Starting analysis for all users...');

  // Get all organization memberships first
  const { data: memberships, error: membershipsError } = await supabase
    .from('organization_memberships')
    .select('user_id, org_id');

  if (membershipsError) {
    throw new Error(`Failed to fetch memberships: ${membershipsError.message}`);
  }

  // Deduplicate by user (take first org per user)
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
      if (summary.insights.length > 0) {
        summaries.push(summary);
      }
    } catch (err) {
      console.error(`[Pipeline] Failed to analyze user ${userId}:`, err);
    }
  }

  console.log(`[Pipeline] Analysis complete. ${summaries.length} users with insights.`);

  // Send notifications for users with insights
  if (summaries.length > 0) {
    await sendPipelineNotifications(supabase, summaries);
  }

  return { success: true, summaries };
}

// ============================================================================
// Analyze Single User Pipeline
// ============================================================================

async function analyzeUserPipeline(
  supabase: any,
  userId: string,
  organizationId: string
): Promise<UserPipelineSummary> {
  console.log(`[Pipeline] Analyzing pipeline for user ${userId}...`);

  // Fetch user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name, email')
    .eq('id', userId)
    .single();

  const userName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'User';
  const userEmail = profile?.email || '';

  // Initialize summary
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
  };

  // 1. Find stale deals (no activity in 7+ days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: staleDeals } = await supabase
    .from('deals')
    .select('id, name, value, stage_id, last_activity_at, deal_stages(name)')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .not('status', 'eq', 'won')
    .not('status', 'eq', 'lost')
    .lt('last_activity_at', sevenDaysAgo.toISOString());

  for (const deal of staleDeals || []) {
    summary.staleDealCount++;
    summary.totalPipelineValue += deal.value || 0;
    
    const daysSinceActivity = Math.floor(
      (Date.now() - new Date(deal.last_activity_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    summary.insights.push({
      type: 'stale_deal',
      severity: daysSinceActivity > 14 ? 'critical' : daysSinceActivity > 10 ? 'high' : 'medium',
      title: `${deal.name} - No activity in ${daysSinceActivity} days`,
      description: `This ${deal.deal_stages?.name || 'deal'} hasn't had any activity recently.`,
      dealId: deal.id,
      dealName: deal.name,
      value: deal.value,
      suggestedAction: 'Send a follow-up email',
      sequenceKey: 'seq-post-meeting-followup-pack',
    });
  }

  // 2. Find overdue tasks
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
    
    const contactName = task.contacts 
      ? `${task.contacts.first_name || ''} ${task.contacts.last_name || ''}`.trim()
      : null;

    summary.insights.push({
      type: 'overdue_task',
      severity: 'high',
      title: `Overdue: ${task.title}`,
      description: contactName ? `Task for ${contactName}` : 'Task is past due',
      contactId: task.contact_id,
      contactName,
      dealId: task.deal_id,
      suggestedAction: 'Complete or reschedule this task',
    });
  }

  // 3. Find deals closing soon (within 7 days)
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  const { data: closingSoon } = await supabase
    .from('deals')
    .select('id, name, value, expected_close_date, deal_stages(name)')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .not('status', 'eq', 'won')
    .not('status', 'eq', 'lost')
    .gte('expected_close_date', today.toISOString())
    .lte('expected_close_date', sevenDaysFromNow.toISOString());

  for (const deal of closingSoon || []) {
    const daysUntilClose = Math.floor(
      (new Date(deal.expected_close_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    summary.insights.push({
      type: 'closing_soon',
      severity: daysUntilClose <= 2 ? 'critical' : 'high',
      title: `${deal.name} - Closing in ${daysUntilClose} days`,
      description: `${deal.deal_stages?.name || 'Deal'} worth ${formatCurrency(deal.value)}`,
      dealId: deal.id,
      dealName: deal.name,
      value: deal.value,
      suggestedAction: 'Review and prep for close',
      sequenceKey: 'seq-next-meeting-command-center',
    });
  }

  // 4. Count today's meetings
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

  // 5. Identify at-risk deals (based on health score if available)
  const { data: atRiskDeals } = await supabase
    .from('deals')
    .select('id, name, value, health_score, deal_stages(name)')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .not('status', 'eq', 'won')
    .not('status', 'eq', 'lost')
    .lt('health_score', 50);

  for (const deal of atRiskDeals || []) {
    summary.dealsAtRisk++;
    
    summary.insights.push({
      type: 'at_risk',
      severity: deal.health_score < 25 ? 'critical' : 'high',
      title: `${deal.name} - Health score ${deal.health_score}%`,
      description: `This ${deal.deal_stages?.name || 'deal'} needs attention`,
      dealId: deal.id,
      dealName: deal.name,
      value: deal.value,
      suggestedAction: 'Run deal rescue analysis',
      sequenceKey: 'seq-deal-rescue-pack',
    });
  }

  // Sort insights by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  summary.insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Limit to top 10 insights
  summary.insights = summary.insights.slice(0, 10);

  console.log(`[Pipeline] Found ${summary.insights.length} insights for user ${userId}`);

  // AC-005: Create Action Centre items for insights
  if (summary.insights.length > 0) {
    await createActionCentreItems(supabase, summary);
  }

  return summary;
}

// ============================================================================
// Send Slack Notifications
// ============================================================================

async function sendPipelineNotifications(
  supabase: any,
  summaries: UserPipelineSummary[]
): Promise<{ success: boolean; notificationsSent: number }> {
  let notificationsSent = 0;

  for (const summary of summaries) {
    try {
      // Check if user has Slack connected
      const { data: slackAuth } = await supabase
        .from('slack_auth')
        .select('access_token, channel_id')
        .eq('user_id', summary.userId)
        .maybeSingle();

      if (!slackAuth?.access_token) {
        console.log(`[Pipeline] User ${summary.userId} has no Slack connected, skipping`);
        continue;
      }

      // Build Slack message
      const blocks = buildPipelineSlackMessage(summary);

      // Send to Slack
      const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${slackAuth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: slackAuth.channel_id || summary.userId,
          blocks,
          text: `Pipeline Pulse: ${summary.insights.length} items need your attention`,
        }),
      });

      if (slackResponse.ok) {
        notificationsSent++;
        
        // Log engagement event
        await supabase.rpc('log_copilot_engagement', {
          p_org_id: summary.organizationId,
          p_user_id: summary.userId,
          p_event_type: 'message_sent',
          p_trigger_type: 'proactive',
          p_channel: 'slack',
          p_metadata: {
            insight_count: summary.insights.length,
            stale_deals: summary.staleDealCount,
            overdue_tasks: summary.overdueTaskCount,
          },
        });
      }
    } catch (err) {
      console.error(`[Pipeline] Failed to send notification to ${summary.userId}:`, err);
    }
  }

  return { success: true, notificationsSent };
}

// ============================================================================
// Build Slack Message
// ============================================================================

function buildPipelineSlackMessage(summary: UserPipelineSummary): any[] {
  const blocks: any[] = [];

  // Header
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `🎯 Good morning, ${summary.userName.split(' ')[0]}!`,
      emoji: true,
    },
  });

  // Summary section
  const summaryParts = [];
  if (summary.meetingsToday > 0) {
    summaryParts.push(`📅 ${summary.meetingsToday} meeting${summary.meetingsToday > 1 ? 's' : ''} today`);
  }
  if (summary.staleDealCount > 0) {
    summaryParts.push(`⚠️ ${summary.staleDealCount} stale deal${summary.staleDealCount > 1 ? 's' : ''}`);
  }
  if (summary.overdueTaskCount > 0) {
    summaryParts.push(`📋 ${summary.overdueTaskCount} overdue task${summary.overdueTaskCount > 1 ? 's' : ''}`);
  }

  if (summaryParts.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: summaryParts.join(' • '),
      },
    });
  }

  blocks.push({ type: 'divider' });

  // Top insights (max 5)
  const topInsights = summary.insights.slice(0, 5);
  
  for (const insight of topInsights) {
    const severityEmoji = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🟢',
    }[insight.severity];

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${severityEmoji} *${insight.title}*\n${insight.description}`,
      },
      accessory: insight.suggestedAction ? {
        type: 'button',
        text: {
          type: 'plain_text',
          text: insight.suggestedAction.length > 20 
            ? insight.suggestedAction.substring(0, 18) + '...' 
            : insight.suggestedAction,
          emoji: true,
        },
        action_id: `pipeline_action_${insight.dealId || insight.contactId || 'generic'}`,
        value: JSON.stringify({
          type: insight.type,
          dealId: insight.dealId,
          contactId: insight.contactId,
          sequenceKey: insight.sequenceKey,
        }),
      } : undefined,
    });
  }

  // Footer with more actions
  if (summary.insights.length > 5) {
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `_+${summary.insights.length - 5} more items need attention_`,
      }],
    });
  }

  // SS-002: Add "View in App" button linking to Action Centre
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '📥 Action Centre',
          emoji: true,
        },
        url: `https://app.use60.com/action-centre`,
        action_id: 'open_action_centre',
        style: 'primary',
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '📊 Open Dashboard',
          emoji: true,
        },
        url: `https://app.use60.com/pipeline`,
        action_id: 'open_dashboard',
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '💬 Ask Copilot',
          emoji: true,
        },
        action_id: 'open_copilot',
      },
    ],
  });

  return blocks;
}

// ============================================================================
// Helpers
// ============================================================================

function formatCurrency(value: number | null | undefined): string {
  if (!value) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// ============================================================================
// AC-005: Create Action Centre Items
// ============================================================================

/**
 * Creates Action Centre items for pipeline insights that need user action.
 * These appear in the user's personal Action Centre for HITL approval.
 */
async function createActionCentreItems(
  supabase: any,
  summary: UserPipelineSummary
): Promise<number> {
  let itemsCreated = 0;

  for (const insight of summary.insights) {
    // Map insight type to action type
    const actionTypeMap: Record<string, string> = {
      'stale_deal': 'alert',
      'overdue_task': 'task',
      'at_risk': 'alert',
      'closing_soon': 'alert',
      'no_activity': 'insight',
    };

    // Map severity to risk level
    const riskLevelMap: Record<string, string> = {
      'critical': 'high',
      'high': 'medium',
      'medium': 'low',
      'low': 'info',
    };

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

      if (!error) {
        itemsCreated++;
      } else {
        console.error(`[Pipeline] Failed to create action centre item:`, error);
      }
    } catch (err) {
      console.error(`[Pipeline] Error creating action centre item:`, err);
    }
  }

  if (itemsCreated > 0) {
    console.log(`[Pipeline] Created ${itemsCreated} Action Centre items for user ${summary.userId}`);
  }

  return itemsCreated;
}
