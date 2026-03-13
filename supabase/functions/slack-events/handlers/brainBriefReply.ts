/**
 * Brain Morning Brief Reply Handler (US-031)
 *
 * Handles user replies to the morning brief DM thread.
 * Detects "more" keyword (general or section-specific) and responds
 * with expanded details for the requested section.
 *
 * Thread detection: checks parent message for the `brain_morning_brief_marker`
 * block_id that the brain-morning-brief function includes.
 *
 * Supported commands:
 *   - "more" / "details"         → expanded view of all sections
 *   - "more meetings"            → detailed meeting info
 *   - "more deals"               → detailed deal info
 *   - "more tasks" / "more followups" → detailed task info
 *   - "more overnight"           → detailed overnight events
 *   - "more alerts"              → detailed integration alerts
 *   - "more auto"                → detailed auto-executed items
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { truncate } from '../../_shared/slackBlocks.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://app.use60.com';

type SlackBlock = { type: string; [key: string]: unknown };

/**
 * Check if a DM message is a reply to a brain morning brief thread.
 * Returns true if the parent message contains the brief marker block.
 */
export async function isBrainBriefThread(
  botToken: string,
  channel: string,
  threadTs: string,
): Promise<boolean> {
  try {
    // Fetch the parent message (thread root)
    const resp = await fetch('https://slack.com/api/conversations.history', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        latest: threadTs,
        inclusive: true,
        limit: 1,
      }),
    });

    const data = await resp.json();
    if (!data.ok || !data.messages?.length) return false;

    const parentMsg = data.messages[0];
    const blocks = parentMsg.blocks || [];

    // Check for the marker block_id
    return blocks.some((b: SlackBlock) => b.block_id === 'brain_morning_brief_marker');
  } catch (err) {
    console.warn('[brainBriefReply] Error checking thread parent:', err);
    return false;
  }
}

/**
 * Parse the user's reply to determine which section they want expanded.
 */
type BriefSection = 'all' | 'meetings' | 'deals' | 'tasks' | 'overnight' | 'alerts' | 'auto_exec';

function parseReplyIntent(text: string): BriefSection | null {
  const lower = text.toLowerCase().trim();

  // Must contain "more" or "details" or "expand"
  if (!/\b(more|details|expand|show)\b/.test(lower)) return null;

  if (/\b(meeting|calendar|call)\b/.test(lower)) return 'meetings';
  if (/\b(deal|pipeline|close)\b/.test(lower)) return 'deals';
  if (/\b(task|follow.?up|todo|overdue)\b/.test(lower)) return 'tasks';
  if (/\b(overnight|event|notification)\b/.test(lower)) return 'overnight';
  if (/\b(alert|integration|warning)\b/.test(lower)) return 'alerts';
  if (/\b(auto|exec|automat)\b/.test(lower)) return 'auto_exec';

  // Generic "more" → expand all
  return 'all';
}

/**
 * Handle a reply in a brain morning brief thread.
 * Fetches expanded data and posts a threaded reply.
 */
export async function handleBrainBriefReply(
  supabase: ReturnType<typeof createClient>,
  botToken: string,
  channel: string,
  threadTs: string,
  userId: string,
  orgId: string,
  text: string,
): Promise<void> {
  const section = parseReplyIntent(text);
  if (!section) return; // Not a "more" request, ignore

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekFromNow = new Date(today);
  weekFromNow.setDate(weekFromNow.getDate() + 7);
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const blocks: SlackBlock[] = [];

  // ── Meetings detail ──
  if (section === 'all' || section === 'meetings') {
    const { data: meetings } = await supabase
      .from('calendar_events')
      .select('id, title, start_time, end_time, description, contacts:contact_id (id, full_name, email, companies:company_id (name)), deals:deal_id (id, title, value, stage)')
      .eq('user_id', userId)
      .gte('start_time', today.toISOString())
      .lt('start_time', tomorrow.toISOString())
      .order('start_time', { ascending: true })
      .limit(15);

    if (meetings && meetings.length > 0) {
      blocks.push({
        type: 'header',
        text: { type: 'plain_text', text: `Today's Meetings (${meetings.length})`, emoji: false },
      });

      for (const m of meetings as any[]) {
        const start = new Date(m.start_time);
        const end = m.end_time ? new Date(m.end_time) : null;
        const timeStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const endStr = end ? end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
        const contact = m.contacts?.[0];
        const deal = m.deals?.[0];

        let details = `*${timeStr}${endStr ? ` - ${endStr}` : ''}*  ${m.title}`;
        if (contact?.full_name) details += `\nWith: ${contact.full_name}${contact.email ? ` (${contact.email})` : ''}`;
        if (contact?.companies?.name) details += `\nCompany: ${contact.companies.name}`;
        if (deal) details += `\nDeal: ${deal.title} (${deal.stage}) — $${(deal.value || 0).toLocaleString()}`;
        if (m.description) details += `\n_${truncate(m.description, 200)}_`;

        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: details } });
      }
      blocks.push({ type: 'divider' });
    } else if (section === 'meetings') {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'No meetings scheduled for today.' } });
    }
  }

  // ── Deals detail ──
  if (section === 'all' || section === 'deals') {
    const { data: deals } = await supabase
      .from('deals')
      .select('id, title, value, stage, close_date, health_status, owner_id')
      .eq('owner_id', userId)
      .in('stage', ['sql', 'opportunity', 'verbal', 'proposal', 'negotiation'])
      .not('close_date', 'is', null)
      .lte('close_date', weekFromNow.toISOString())
      .order('value', { ascending: false })
      .limit(10);

    if (deals && deals.length > 0) {
      blocks.push({
        type: 'header',
        text: { type: 'plain_text', text: `Deals Closing This Week (${deals.length})`, emoji: false },
      });

      for (const d of deals as any[]) {
        const closeDate = d.close_date ? new Date(d.close_date) : null;
        const daysLeft = closeDate
          ? Math.ceil((closeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        let line = `*${d.title}*  ${d.stage} — $${(d.value || 0).toLocaleString()}`;
        if (daysLeft !== null) line += `\nCloses in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
        if (d.health_status) line += ` | Health: ${d.health_status}`;
        line += `\n<${APP_URL}/deals/${d.id}|View Deal>`;

        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: line } });
      }
      blocks.push({ type: 'divider' });
    } else if (section === 'deals') {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'No deals closing this week.' } });
    }
  }

  // ── Tasks detail ──
  if (section === 'all' || section === 'tasks') {
    const { data: overdue } = await supabase
      .from('tasks')
      .select('id, title, due_date, deals:deal_id (title)')
      .eq('assigned_to', userId)
      .eq('completed', false)
      .lt('due_date', today.toISOString())
      .order('due_date', { ascending: true })
      .limit(15);

    const { data: dueToday } = await supabase
      .from('tasks')
      .select('id, title, deals:deal_id (title)')
      .eq('assigned_to', userId)
      .eq('completed', false)
      .gte('due_date', today.toISOString())
      .lt('due_date', tomorrow.toISOString())
      .limit(15);

    const hasAny = (overdue?.length || 0) + (dueToday?.length || 0) > 0;

    if (hasAny) {
      blocks.push({
        type: 'header',
        text: { type: 'plain_text', text: 'Follow-ups & Tasks', emoji: false },
      });

      if (overdue && overdue.length > 0) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Overdue (${overdue.length})*\n${
              overdue.map((t: any) => {
                const daysOver = Math.floor((today.getTime() - new Date(t.due_date).getTime()) / (1000 * 60 * 60 * 24));
                return `  - ${t.title} (${daysOver}d overdue)${t.deals?.title ? ` — _${t.deals.title}_` : ''}`;
              }).join('\n')
            }`,
          },
        });
      }

      if (dueToday && dueToday.length > 0) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Due Today (${dueToday.length})*\n${
              dueToday.map((t: any) => `  - ${t.title}${t.deals?.title ? ` — _${t.deals.title}_` : ''}`).join('\n')
            }`,
          },
        });
      }
      blocks.push({ type: 'divider' });
    } else if (section === 'tasks') {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'No overdue or due-today tasks.' } });
    }
  }

  // ── Overnight events detail ──
  if (section === 'all' || section === 'overnight') {
    const { data: batched } = await supabase
      .from('notification_queue')
      .select('notification_type, title, message, created_at')
      .eq('user_id', userId)
      .in('triage_status', ['batched', 'suppressed', 'delivered'])
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false })
      .limit(15);

    if (batched && batched.length > 0) {
      blocks.push({
        type: 'header',
        text: { type: 'plain_text', text: `Overnight Events (${batched.length})`, emoji: false },
      });

      for (const n of batched as any[]) {
        const time = new Date(n.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        let line = `*${time}* — ${n.title || n.notification_type}`;
        if (n.message) line += `\n${truncate(n.message, 300)}`;
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: line } });
      }
      blocks.push({ type: 'divider' });
    } else if (section === 'overnight') {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'No overnight events in the last 24 hours.' } });
    }
  }

  // ── Integration alerts detail ──
  if (section === 'all' || section === 'alerts') {
    const { data: alerts } = await supabase
      .from('command_centre_items')
      .select('id, title, summary, source_agent, created_at, urgency')
      .eq('user_id', userId)
      .eq('item_type', 'alert')
      .eq('status', 'open')
      .order('priority_score', { ascending: false })
      .limit(10);

    if (alerts && alerts.length > 0) {
      blocks.push({
        type: 'header',
        text: { type: 'plain_text', text: `Integration Alerts (${alerts.length})`, emoji: false },
      });

      for (const a of alerts as any[]) {
        const urgencyLabel = a.urgency === 'critical' ? 'CRITICAL' : a.urgency === 'high' ? 'HIGH' : '';
        let line = urgencyLabel ? `*[${urgencyLabel}]* ${a.title}` : `*${a.title}*`;
        line += `\nSource: ${a.source_agent}`;
        if (a.summary) line += `\n${truncate(a.summary, 300)}`;
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: line } });
      }
      blocks.push({ type: 'divider' });
    } else if (section === 'alerts') {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'No open integration alerts.' } });
    }
  }

  // ── Auto-executed items detail ──
  if (section === 'all' || section === 'auto_exec') {
    const { data: autoExec } = await supabase
      .from('command_centre_items')
      .select('id, title, summary, source_agent, resolved_at, resolution_channel')
      .eq('user_id', userId)
      .eq('resolution_channel', 'auto_exec')
      .gte('resolved_at', today.toISOString())
      .order('resolved_at', { ascending: false })
      .limit(15);

    if (autoExec && autoExec.length > 0) {
      blocks.push({
        type: 'header',
        text: { type: 'plain_text', text: `Auto-Executed Items (${autoExec.length})`, emoji: false },
      });

      for (const item of autoExec as any[]) {
        const time = item.resolved_at
          ? new Date(item.resolved_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
          : '';
        let line = time ? `*${time}* — ${item.title}` : `*${item.title}*`;
        line += `\nAgent: ${item.source_agent}`;
        if (item.summary) line += `\n${truncate(item.summary, 300)}`;
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: line } });
      }
      blocks.push({ type: 'divider' });
    } else if (section === 'auto_exec') {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'No auto-executed items since midnight.' } });
    }
  }

  // Post empty guard
  if (blocks.length === 0) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: 'No additional details to show.' } });
  }

  // Post threaded reply
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        thread_ts: threadTs,
        text: 'Expanded morning brief details',
        blocks: blocks.slice(0, 50), // Slack block limit
      }),
    });
  } catch (err) {
    console.error('[brainBriefReply] Error posting threaded reply:', err);
  }
}
