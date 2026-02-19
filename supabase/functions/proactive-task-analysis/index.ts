/**
 * Proactive Task Analysis Edge Function
 * 
 * PROACTIVE-004: Analyze overdue tasks, offer to complete or reschedule.
 * 
 * Runs as a daily cron job and:
 * 1. Identifies overdue and due-today tasks
 * 2. For email follow-up tasks, offers to draft email
 * 3. For research tasks, offers to run research sequence
 * 4. Sends Slack with task summary and quick actions
 * 5. Auto-completes task and notifies if user confirms
 * 
 * @see docs/PRD_PROACTIVE_AI_TEAMMATE.md
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

// ============================================================================
// Types
// ============================================================================

interface TaskAnalysisResult {
  userId: string;
  userName: string;
  organizationId: string;
  overdueTasks: TaskItem[];
  dueTodayTasks: TaskItem[];
  suggestedActions: TaskAction[];
}

interface TaskItem {
  id: string;
  title: string;
  description?: string;
  due_date: string;
  priority?: string;
  task_type?: string;
  contact_id?: string;
  contact_name?: string;
  deal_id?: string;
  deal_name?: string;
  days_overdue: number;
}

interface TaskAction {
  taskId: string;
  taskTitle: string;
  actionType: 'draft_email' | 'run_research' | 'reschedule' | 'complete';
  description: string;
  sequenceKey?: string;
  estimatedMinutes?: number;
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
    const { action = 'analyze_and_notify', userId, organizationId } = body;

    let response;

    switch (action) {
      case 'analyze_and_notify':
        response = await analyzeAndNotifyAllUsers(supabase);
        break;

      case 'analyze_user':
        if (!userId) throw new Error('userId required');
        response = await analyzeUserTasks(supabase, userId, organizationId);
        break;

      case 'execute_action':
        response = await executeTaskAction(supabase, body);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[proactive-task-analysis] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// Analyze All Users
// ============================================================================

async function analyzeAndNotifyAllUsers(supabase: any): Promise<{
  success: boolean;
  usersAnalyzed: number;
  notificationsSent: number;
  results: TaskAnalysisResult[];
}> {
  console.log('[TaskAnalysis] Starting analysis for all users...');

  // Get users with pending tasks
  const { data: usersWithTasks } = await supabase
    .from('tasks')
    .select('assigned_to')
    .eq('status', 'pending')
    .not('assigned_to', 'is', null);

  const uniqueUserIds = [...new Set((usersWithTasks || []).map((t: any) => t.assigned_to))];
  
  console.log(`[TaskAnalysis] Found ${uniqueUserIds.length} users with pending tasks`);

  const results: TaskAnalysisResult[] = [];
  let notificationsSent = 0;

  for (const userId of uniqueUserIds) {
    try {
      const result = await analyzeUserTasks(supabase, userId as string);
      
      if (result.overdueTasks.length > 0 || result.dueTodayTasks.length > 0) {
        results.push(result);
        
        // Send notification
        const sent = await sendTaskNotification(supabase, result);
        if (sent) notificationsSent++;
      }
    } catch (err) {
      console.error(`[TaskAnalysis] Failed for user ${userId}:`, err);
    }
  }

  console.log(`[TaskAnalysis] Complete. Users: ${results.length}, Notifications: ${notificationsSent}`);

  return {
    success: true,
    usersAnalyzed: uniqueUserIds.length,
    notificationsSent,
    results,
  };
}

// ============================================================================
// Analyze User Tasks
// ============================================================================

async function analyzeUserTasks(
  supabase: any,
  userId: string,
  organizationId?: string
): Promise<TaskAnalysisResult> {
  console.log(`[TaskAnalysis] Analyzing tasks for user ${userId}`);

  // Get user info
  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', userId)
    .single();

  const userName = profile 
    ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() 
    : 'User';

  // Get org if not provided
  if (!organizationId) {
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    organizationId = membership?.org_id;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Get overdue tasks
  const { data: overdueRaw } = await supabase
    .from('tasks')
    .select(`
      id, title, description, due_date, priority, task_type,
      contact_id, deal_id,
      contacts:contact_id(first_name, last_name),
      deals:deal_id(name)
    `)
    .eq('assigned_to', userId)
    .eq('status', 'pending')
    .lt('due_date', today.toISOString())
    .order('due_date', { ascending: true })
    .limit(10);

  // Get tasks due today
  const { data: dueTodayRaw } = await supabase
    .from('tasks')
    .select(`
      id, title, description, due_date, priority, task_type,
      contact_id, deal_id,
      contacts:contact_id(first_name, last_name),
      deals:deal_id(name)
    `)
    .eq('assigned_to', userId)
    .eq('status', 'pending')
    .gte('due_date', today.toISOString())
    .lt('due_date', tomorrow.toISOString())
    .order('priority', { ascending: false })
    .limit(10);

  // Transform tasks
  const overdueTasks: TaskItem[] = (overdueRaw || []).map((t: any) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    due_date: t.due_date,
    priority: t.priority,
    task_type: t.task_type,
    contact_id: t.contact_id,
    contact_name: t.contacts 
      ? `${t.contacts.first_name || ''} ${t.contacts.last_name || ''}`.trim() 
      : undefined,
    deal_id: t.deal_id,
    deal_name: t.deals?.name,
    days_overdue: Math.floor((today.getTime() - new Date(t.due_date).getTime()) / (1000 * 60 * 60 * 24)),
  }));

  const dueTodayTasks: TaskItem[] = (dueTodayRaw || []).map((t: any) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    due_date: t.due_date,
    priority: t.priority,
    task_type: t.task_type,
    contact_id: t.contact_id,
    contact_name: t.contacts 
      ? `${t.contacts.first_name || ''} ${t.contacts.last_name || ''}`.trim() 
      : undefined,
    deal_id: t.deal_id,
    deal_name: t.deals?.name,
    days_overdue: 0,
  }));

  // Generate suggested actions
  const suggestedActions = generateSuggestedActions([...overdueTasks, ...dueTodayTasks]);

  return {
    userId,
    userName,
    organizationId: organizationId || '',
    overdueTasks,
    dueTodayTasks,
    suggestedActions,
  };
}

// ============================================================================
// Generate Suggested Actions
// ============================================================================

function generateSuggestedActions(tasks: TaskItem[]): TaskAction[] {
  const actions: TaskAction[] = [];

  for (const task of tasks) {
    const titleLower = task.title.toLowerCase();
    const typeLower = (task.task_type || '').toLowerCase();

    // Email follow-up tasks
    if (
      titleLower.includes('email') || 
      titleLower.includes('follow-up') || 
      titleLower.includes('follow up') ||
      typeLower === 'email' ||
      typeLower === 'follow_up'
    ) {
      actions.push({
        taskId: task.id,
        taskTitle: task.title,
        actionType: 'draft_email',
        description: `Draft a follow-up email${task.contact_name ? ` for ${task.contact_name}` : ''}`,
        sequenceKey: 'seq-post-meeting-followup-pack',
        estimatedMinutes: 3,
      });
    }

    // Research tasks
    else if (
      titleLower.includes('research') ||
      titleLower.includes('look up') ||
      titleLower.includes('find out') ||
      typeLower === 'research'
    ) {
      actions.push({
        taskId: task.id,
        taskTitle: task.title,
        actionType: 'run_research',
        description: `Run research${task.contact_name ? ` on ${task.contact_name}` : ''}`,
        sequenceKey: 'lead-research',
        estimatedMinutes: 2,
      });
    }

    // All tasks can be rescheduled
    if (task.days_overdue > 0) {
      actions.push({
        taskId: task.id,
        taskTitle: task.title,
        actionType: 'reschedule',
        description: `Reschedule to tomorrow (${task.days_overdue} days overdue)`,
        estimatedMinutes: 1,
      });
    }
  }

  // Limit to 5 most impactful actions
  return actions.slice(0, 5);
}

// ============================================================================
// Send Slack Notification
// ============================================================================

async function sendTaskNotification(
  supabase: any,
  result: TaskAnalysisResult
): Promise<boolean> {
  try {
    // Check if user has Slack connected
    const { data: slackAuth } = await supabase
      .from('slack_auth')
      .select('access_token, channel_id')
      .eq('user_id', result.userId)
      .maybeSingle();

    if (!slackAuth?.access_token) {
      return false;
    }

    const blocks: any[] = [];

    // Header
    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📋 Task Reminder`,
        emoji: true,
      },
    });

    // Summary
    const summaryParts = [];
    if (result.overdueTasks.length > 0) {
      summaryParts.push(`🔴 ${result.overdueTasks.length} overdue`);
    }
    if (result.dueTodayTasks.length > 0) {
      summaryParts.push(`🟡 ${result.dueTodayTasks.length} due today`);
    }

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: summaryParts.join(' • '),
      },
    });

    blocks.push({ type: 'divider' });

    // Show top overdue tasks
    const topTasks = [...result.overdueTasks, ...result.dueTodayTasks].slice(0, 3);
    
    for (const task of topTasks) {
      const emoji = task.days_overdue > 0 ? '🔴' : '🟡';
      const overdueLabel = task.days_overdue > 0 
        ? ` _(${task.days_overdue}d overdue)_` 
        : '';
      
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *${task.title}*${overdueLabel}${task.contact_name ? `\n${task.contact_name}` : ''}`,
        },
      });
    }

    // Suggested actions
    if (result.suggestedActions.length > 0) {
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '💡 *I can help with:*',
        },
      });

      const actionButtons = result.suggestedActions.slice(0, 3).map((action, idx) => ({
        type: 'button',
        text: {
          type: 'plain_text',
          text: action.description.length > 30 
            ? action.description.substring(0, 28) + '..' 
            : action.description,
          emoji: true,
        },
        action_id: `task_action_${action.taskId}_${action.actionType}`,
        value: JSON.stringify(action),
      }));

      blocks.push({
        type: 'actions',
        elements: actionButtons,
      });
    }

    // Footer
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: '_Reply here to ask about any task • <https://app.use60.com/tasks|View all tasks>_',
      }],
    });

    // Send to Slack
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackAuth.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: slackAuth.channel_id || result.userId,
        blocks,
        text: `Task reminder: ${result.overdueTasks.length} overdue, ${result.dueTodayTasks.length} due today`,
      }),
    });

    const slackResult = await response.json();
    
    if (slackResult.ok) {
      // Log engagement event
      await supabase.rpc('log_copilot_engagement', {
        p_org_id: result.organizationId,
        p_user_id: result.userId,
        p_event_type: 'message_sent',
        p_trigger_type: 'proactive',
        p_channel: 'slack',
        p_metadata: {
          overdue_count: result.overdueTasks.length,
          due_today_count: result.dueTodayTasks.length,
          actions_suggested: result.suggestedActions.length,
        },
      });
    }

    return slackResult.ok === true;

  } catch (err) {
    console.error('[TaskAnalysis] Slack notification failed:', err);
    return false;
  }
}

// ============================================================================
// Execute Task Action
// ============================================================================

async function executeTaskAction(
  supabase: any,
  params: {
    userId: string;
    taskId: string;
    actionType: string;
    sequenceKey?: string;
  }
): Promise<{ success: boolean; result?: any; error?: string }> {
  const { userId, taskId, actionType, sequenceKey } = params;

  try {
    switch (actionType) {
      case 'draft_email':
      case 'run_research':
        // Call copilot to run the sequence
        const { data, error } = await supabase.functions.invoke('api-copilot/chat', {
          body: {
            message: actionType === 'draft_email' 
              ? `Draft a follow-up email for task ${taskId}`
              : `Research the contact for task ${taskId}`,
            context: { userId, taskId },
          },
        });
        
        if (error) throw error;
        return { success: true, result: data };

      case 'reschedule':
        // Reschedule to tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);

        const { error: updateError } = await supabase
          .from('tasks')
          .update({ due_date: tomorrow.toISOString() })
          .eq('id', taskId)
          .eq('assigned_to', userId);

        if (updateError) throw updateError;
        return { success: true, result: { rescheduledTo: tomorrow.toISOString() } };

      case 'complete':
        const { error: completeError } = await supabase
          .from('tasks')
          .update({ 
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', taskId)
          .eq('assigned_to', userId);

        if (completeError) throw completeError;
        return { success: true, result: { completed: true } };

      default:
        throw new Error(`Unknown action type: ${actionType}`);
    }
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
