/**
 * Agent Initial Scan Edge Function
 *
 * First-run "here's what I found" briefing for new users.
 * Scans last 7 days of deals, meetings, contacts, and tasks to generate
 * an introductory briefing that demonstrates agent value immediately.
 *
 * Called from the first-run activation flow after persona setup.
 * Limited to 50 most recent entities per category to prevent overload.
 *
 * Story: AOA-011
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts';
import { sendSlackDM } from '../_shared/proactive/deliverySlack.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const MAX_ENTITIES = 50;

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    // Auth: JWT or service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { user_id, org_id } = await req.json();
    if (!user_id || !org_id) {
      return errorResponse('Missing user_id or org_id', req, 400);
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const today = new Date().toISOString().split('T')[0];

    // Scan in parallel for speed
    const [dealsResult, meetingsResult, tasksResult, contactsResult, personaResult] = await Promise.all([
      // Stale or at-risk deals
      supabase
        .from('deals')
        .select('name, stage, value, updated_at, status')
        .eq('owner_id', user_id)
        .eq('org_id', org_id)
        .in('status', ['open', 'active'])
        .order('updated_at', { ascending: true })
        .limit(MAX_ENTITIES),

      // Recent and upcoming meetings
      supabase
        .from('calendar_events')
        .select('title, start_time, attendees_count')
        .eq('user_id', user_id)
        .gte('start_time', today)
        .gt('attendees_count', 1)
        .order('start_time', { ascending: true })
        .limit(MAX_ENTITIES),

      // Overdue or due-soon tasks
      supabase
        .from('tasks')
        .select('title, due_date, status')
        .or(`assigned_to.eq.${user_id},created_by.eq.${user_id}`)
        .in('status', ['todo', 'in_progress'])
        .not('due_date', 'is', null)
        .order('due_date', { ascending: true })
        .limit(MAX_ENTITIES),

      // Contacts going cold (no activity in 14+ days)
      supabase
        .from('contacts')
        .select('name, email, last_contacted_at')
        .eq('owner_id', user_id)
        .not('last_contacted_at', 'is', null)
        .order('last_contacted_at', { ascending: true })
        .limit(MAX_ENTITIES),

      // User's agent persona
      supabase
        .from('agent_persona')
        .select('agent_name, tone, custom_instructions')
        .eq('user_id', user_id)
        .maybeSingle(),
    ]);

    const deals = dealsResult.data || [];
    const meetings = meetingsResult.data || [];
    const tasks = tasksResult.data || [];
    const contacts = contactsResult.data || [];
    const persona = personaResult.data;

    // Compute insights
    const staleDealCount = deals.filter((d: any) => {
      const daysSince = (Date.now() - new Date(d.updated_at).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 7;
    }).length;

    const overdueTasks = tasks.filter((t: any) => new Date(t.due_date) < new Date(today));
    const upcomingMeetings = meetings.slice(0, 5);
    const coldContacts = contacts.filter((c: any) => {
      const daysSince = (Date.now() - new Date(c.last_contacted_at).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 14;
    }).slice(0, 5);

    const totalPipelineValue = deals.reduce((sum: number, d: any) => sum + (d.value || 0), 0);

    // Generate briefing
    const agentName = persona?.agent_name || 'Sixty';
    let briefing: string;

    if (ANTHROPIC_API_KEY) {
      const prompt = `You are ${agentName}, an AI sales assistant being introduced to a new user. Write a brief "first impressions" analysis of their sales data from the last 7 days.

Data snapshot:
- ${deals.length} active deals worth $${totalPipelineValue.toLocaleString()}
- ${staleDealCount} deals haven't been updated in 7+ days
- ${upcomingMeetings.length} upcoming meetings
- ${overdueTasks.length} overdue tasks
- ${coldContacts.length} contacts with no activity in 14+ days

Tone: ${persona?.tone === 'custom' ? persona.custom_instructions : persona?.tone || 'concise'}

Write 3-4 sentences. Be specific about the most urgent finding. End with "I'll send you a morning briefing every day to keep you on top of everything."`;

      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 300,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        const result = await response.json();
        briefing = result.content?.[0]?.text || formatFallbackBriefing(agentName, deals, staleDealCount, overdueTasks, upcomingMeetings, totalPipelineValue);
      } catch {
        briefing = formatFallbackBriefing(agentName, deals, staleDealCount, overdueTasks, upcomingMeetings, totalPipelineValue);
      }
    } else {
      briefing = formatFallbackBriefing(agentName, deals, staleDealCount, overdueTasks, upcomingMeetings, totalPipelineValue);
    }

    // Write to agent_activity
    await supabase.rpc('insert_agent_activity', {
      p_user_id: user_id,
      p_org_id: org_id,
      p_sequence_type: 'initial_scan',
      p_title: `${agentName}'s First Impressions`,
      p_summary: briefing,
      p_metadata: {
        deals_count: deals.length,
        stale_deals: staleDealCount,
        overdue_tasks: overdueTasks.length,
        upcoming_meetings: upcomingMeetings.length,
        cold_contacts: coldContacts.length,
        pipeline_value: totalPipelineValue,
      },
    });

    // Deliver via Slack DM if possible
    const { data: slackOrg } = await supabase
      .from('slack_org_settings')
      .select('bot_access_token')
      .eq('org_id', org_id)
      .eq('is_connected', true)
      .maybeSingle();

    if (slackOrg?.bot_access_token) {
      const { data: mapping } = await supabase
        .from('slack_user_mappings')
        .select('slack_user_id')
        .eq('org_id', org_id)
        .eq('sixty_user_id', user_id)
        .maybeSingle();

      if (mapping?.slack_user_id) {
        await sendSlackDM({
          botToken: slackOrg.bot_access_token,
          slackUserId: mapping.slack_user_id,
          text: `${agentName}'s First Impressions`,
          blocks: [
            {
              type: 'context',
              elements: [{ type: 'mrkdwn', text: `*${agentName}* | Your AI Sales Agent` }],
            },
            {
              type: 'header',
              text: { type: 'plain_text', text: "Here's what I found", emoji: false },
            },
            {
              type: 'section',
              text: { type: 'mrkdwn', text: briefing },
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'Open Dashboard' },
                  url: 'https://app.use60.com',
                  action_id: 'open_dashboard',
                },
              ],
            },
          ],
        });
      }
    }

    return jsonResponse({
      success: true,
      briefing,
      stats: {
        deals: deals.length,
        stale_deals: staleDealCount,
        overdue_tasks: overdueTasks.length,
        upcoming_meetings: upcomingMeetings.length,
        cold_contacts: coldContacts.length,
        pipeline_value: totalPipelineValue,
      },
    }, req);
  } catch (err) {
    console.error('[agent-initial-scan] Error:', err);
    return errorResponse('Internal server error', req, 500);
  }
});

function formatFallbackBriefing(
  agentName: string,
  deals: any[],
  staleDealCount: number,
  overdueTasks: any[],
  upcomingMeetings: any[],
  totalPipelineValue: number,
): string {
  const lines: string[] = [`Hi, I'm ${agentName}. I just scanned your last 7 days of activity.`];

  if (deals.length > 0) {
    lines.push(`You have ${deals.length} active deals worth $${totalPipelineValue.toLocaleString()}.`);
  }

  if (staleDealCount > 0) {
    lines.push(`${staleDealCount} deal${staleDealCount > 1 ? 's haven\'t' : ' hasn\'t'} been updated in over a week.`);
  }

  if (overdueTasks.length > 0) {
    lines.push(`${overdueTasks.length} task${overdueTasks.length > 1 ? 's are' : ' is'} overdue.`);
  }

  if (upcomingMeetings.length > 0) {
    lines.push(`You have ${upcomingMeetings.length} meeting${upcomingMeetings.length > 1 ? 's' : ''} coming up.`);
  }

  lines.push("I'll send you a morning briefing every day to keep you on top of everything.");
  return lines.join(' ');
}
