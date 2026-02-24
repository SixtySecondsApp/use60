/**
 * SLACK-017: Task Reminder Proactive Notifications
 *
 * Sends DM to each user with tasks due today and overdue tasks.
 * Each task has Complete, Snooze, and context buttons.
 *
 * Runs daily at 08:30 UTC via Vercel cron.
 * Skips if user already received morning brief with same tasks (cross-dedup).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import { handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts';
import {
  getSlackOrgSettings,
  getSlackRecipients,
  shouldSendNotification,
  recordNotificationSent,
  deliverToSlack,
  deliverToInApp,
} from '../_shared/proactive/index.ts';
import {
  header,
  section,
  divider,
  actions,
  context,
  safeMrkdwn,
  safeHeaderText,
  truncate,
  type SlackBlock,
  type SlackMessage,
} from '../_shared/slackBlocks.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://app.use60.com';

function buildTaskReminderMessage(data: {
  userName: string;
  overdue: Array<{ id: string; title: string; daysOverdue: number; dealName?: string }>;
  dueToday: Array<{ id: string; title: string; dealName?: string }>;
}): SlackMessage {
  const blocks: SlackBlock[] = [];
  const totalTasks = data.overdue.length + data.dueToday.length;

  blocks.push(header(safeHeaderText(`📋 Task Reminder`)));
  blocks.push(section(safeMrkdwn(
    `Hey ${data.userName}, you have *${totalTasks} task${totalTasks !== 1 ? 's' : ''}* needing attention.`
  )));
  blocks.push(divider());

  // Overdue tasks
  if (data.overdue.length > 0) {
    blocks.push(section(safeMrkdwn(`*Overdue*`)));
    for (const t of data.overdue.slice(0, 5)) {
      const dealCtx = t.dealName ? ` — ${truncate(t.dealName, 30)}` : '';
      blocks.push(section(safeMrkdwn(
        `*${truncate(t.title, 80)}*${dealCtx}\nOverdue by ${t.daysOverdue} day${t.daysOverdue !== 1 ? 's' : ''}`
      )));
      blocks.push(actions([
        { text: 'Complete', actionId: 'task_complete', value: JSON.stringify({ taskId: t.id }) },
        { text: 'Snooze', actionId: `snooze::task::${t.id}`, value: JSON.stringify({ entityType: 'task', entityId: t.id, entityName: t.title, duration: '1d' }) },
      ]));
    }
  }

  // Due today tasks
  if (data.dueToday.length > 0) {
    if (data.overdue.length > 0) blocks.push(divider());
    blocks.push(section(safeMrkdwn(`*Due today*`)));
    for (const t of data.dueToday.slice(0, 5)) {
      const dealCtx = t.dealName ? ` — ${truncate(t.dealName, 30)}` : '';
      blocks.push(section(safeMrkdwn(`• *${truncate(t.title, 80)}*${dealCtx}`)));
    }
  }

  blocks.push(divider());
  blocks.push(actions([
    { text: 'View All Tasks', actionId: 'view_tasks', value: 'tasks', url: `${APP_URL}/tasks` },
  ]));

  return {
    blocks,
    text: `Task reminder: ${totalTasks} task${totalTasks !== 1 ? 's' : ''} need attention`,
  };
}

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');
    if (!verifyCronSecret(req, cronSecret) && !isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY)) {
      return errorResponse('Unauthorized', req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: slackOrgs } = await supabase
      .from('slack_org_settings')
      .select('org_id, bot_access_token')
      .eq('is_connected', true)
      .not('bot_access_token', 'is', null);

    if (!slackOrgs?.length) {
      return jsonResponse({ success: true, remindersSent: 0 }, req);
    }

    let totalReminders = 0;
    const errors: string[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    for (const org of slackOrgs) {
      try {
        const slackSettings = await getSlackOrgSettings(supabase, org.org_id);
        if (!slackSettings) continue;

        const recipients = await getSlackRecipients(supabase, org.org_id);

        for (const recipient of recipients) {
          try {
            // Check dedupe
            const shouldSend = await shouldSendNotification(
              supabase,
              'morning_brief', // Reuse morning_brief dedupe type for task reminders
              org.org_id,
              recipient.slackUserId,
              'task_reminder'
            );
            if (!shouldSend) continue;

            // Check user preference
            const { data: userPref } = await supabase
              .from('slack_user_preferences')
              .select('is_enabled')
              .eq('user_id', recipient.userId)
              .eq('org_id', org.org_id)
              .eq('feature', 'task_reminders')
              .maybeSingle();

            if (userPref && !userPref.is_enabled) continue;

            // SLACK-021: Cross-dedup — check if morning brief was already sent today
            const { data: briefSent } = await supabase
              .from('slack_notifications_sent')
              .select('id')
              .eq('feature', 'morning_brief')
              .eq('org_id', org.org_id)
              .eq('recipient_id', recipient.slackUserId)
              .gte('sent_at', today.toISOString())
              .limit(1);

            if (briefSent && briefSent.length > 0) {
              continue; // Morning brief already covered tasks
            }

            // Fetch overdue tasks
            const { data: overdueTasks } = await supabase
              .from('tasks')
              .select('id, title, due_date, deals:deal_id (title)')
              .eq('assigned_to', recipient.userId)
              .eq('completed', false)
              .lt('due_date', today.toISOString())
              .order('due_date', { ascending: true })
              .limit(10);

            // Fetch due-today tasks
            const { data: dueTodayTasks } = await supabase
              .from('tasks')
              .select('id, title, deals:deal_id (title)')
              .eq('assigned_to', recipient.userId)
              .eq('completed', false)
              .gte('due_date', today.toISOString())
              .lt('due_date', tomorrow.toISOString())
              .limit(10);

            const overdue = (overdueTasks || []).map((t: any) => ({
              id: t.id,
              title: t.title,
              daysOverdue: Math.floor((today.getTime() - new Date(t.due_date).getTime()) / (1000 * 60 * 60 * 24)),
              dealName: t.deals?.title,
            }));

            const dueToday = (dueTodayTasks || []).map((t: any) => ({
              id: t.id,
              title: t.title,
              dealName: t.deals?.title,
            }));

            if (overdue.length === 0 && dueToday.length === 0) continue;

            const slackMessage = buildTaskReminderMessage({
              userName: recipient.name || 'there',
              overdue,
              dueToday,
            });

            const slackResult = await deliverToSlack(
              supabase,
              {
                type: 'morning_brief',
                orgId: org.org_id,
                recipientUserId: recipient.userId,
                recipientSlackUserId: recipient.slackUserId,
                title: 'Task Reminder',
                message: slackMessage.text || 'Tasks need attention',
                blocks: slackMessage.blocks,
                actionUrl: `${APP_URL}/tasks`,
                inAppCategory: 'team',
                inAppType: 'info',
                metadata: { overdueCount: overdue.length, dueTodayCount: dueToday.length },
              },
              slackSettings.botAccessToken
            );

            if (slackResult.sent) {
              await recordNotificationSent(
                supabase,
                'morning_brief',
                org.org_id,
                recipient.slackUserId,
                slackResult.channelId,
                slackResult.ts,
                'task_reminder'
              );
              totalReminders++;
            }

            await deliverToInApp(supabase, {
              type: 'morning_brief',
              orgId: org.org_id,
              recipientUserId: recipient.userId,
              recipientSlackUserId: recipient.slackUserId,
              title: 'Task Reminder',
              message: slackMessage.text || 'Tasks need attention',
              actionUrl: `${APP_URL}/tasks`,
              inAppCategory: 'team',
              inAppType: 'info',
              metadata: { overdueCount: overdue.length, dueTodayCount: dueToday.length },
            });
          } catch (userError) {
            console.error(`[slack-task-reminders] Error for user ${recipient.userId}:`, userError);
            errors.push(`User ${recipient.userId}: ${userError instanceof Error ? userError.message : 'Unknown'}`);
          }
        }
      } catch (orgError) {
        console.error(`[slack-task-reminders] Error for org ${org.org_id}:`, orgError);
        errors.push(`Org ${org.org_id}: ${orgError instanceof Error ? orgError.message : 'Unknown'}`);
      }
    }

    return jsonResponse({
      success: true,
      remindersSent: totalReminders,
      errors: errors.length > 0 ? errors : undefined,
    }, req);
  } catch (error) {
    console.error('[slack-task-reminders] Fatal error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal server error', req, 500);
  }
});
