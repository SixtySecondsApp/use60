// supabase/functions/_shared/slack-copilot/handlers/historyQueryHandler.ts
// Handles history and meeting timeline queries (PRD-22, CONV-005)

import type { ClassifiedIntent, QueryContext, HandlerResult } from '../types.ts';
import { section, divider, context, appLink, truncate } from '../responseFormatter.ts';

export async function handleHistoryQuery(
  intent: ClassifiedIntent,
  queryContext: QueryContext
): Promise<HandlerResult> {
  const { meetings, activities, contacts } = queryContext;
  const query = (intent.entities.rawQuery || '').toLowerCase();

  // "When did I last talk to [person]?"
  if (intent.entities.contactName) {
    return handleLastInteraction(intent.entities.contactName, meetings, activities, contacts);
  }

  // "Show my meetings this week"
  if (/meetings?\s+(?:this|next|today|tomorrow)/i.test(query)) {
    return handleMeetingSchedule(meetings, query);
  }

  // General history
  return handleRecentActivity(meetings, activities);
}

function handleLastInteraction(
  contactName: string,
  meetings: QueryContext['meetings'],
  activities: QueryContext['activities'],
  contacts: QueryContext['contacts']
): HandlerResult {
  // Find matching contact
  const contact = contacts?.find((c) => {
    const fullName = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
    return fullName.includes(contactName.toLowerCase());
  });

  // Find meetings mentioning this contact
  const relevantMeetings = meetings?.filter((m) => {
    const title = (m.title || '').toLowerCase();
    const summary = (m.summary || '').toLowerCase();
    return title.includes(contactName.toLowerCase()) || summary.includes(contactName.toLowerCase());
  }) || [];

  if (relevantMeetings.length === 0 && !contact) {
    return { text: `I couldn't find any recent interactions with "${contactName}". Check the name or try their full name.` };
  }

  const blocks = [];

  if (contact) {
    blocks.push(section(
      `*${contact.first_name || ''} ${contact.last_name || ''}*${contact.title ? ` — ${contact.title}` : ''}${contact.company ? ` at ${contact.company}` : ''}`
    ));
  }

  if (relevantMeetings.length > 0) {
    const lastMeeting = relevantMeetings[0];
    const meetingDate = lastMeeting.start_time
      ? new Date(lastMeeting.start_time).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
      : 'Unknown date';

    blocks.push(section(`*Last Meeting:* ${appLink(`/meetings/${lastMeeting.id}`, lastMeeting.title || 'Untitled')} — ${meetingDate}`));

    if (lastMeeting.summary) {
      blocks.push(section(`_${truncate(lastMeeting.summary, 300)}_`));
    }

    if (relevantMeetings.length > 1) {
      blocks.push(context([`${relevantMeetings.length - 1} more meeting${relevantMeetings.length > 2 ? 's' : ''} in the past week`]));
    }
  } else {
    blocks.push(section(`No meetings found with ${contactName} in the past week.`));
  }

  if (contact) {
    blocks.push(divider());
    blocks.push(context([appLink(`/contacts/${contact.id}`, 'View full contact profile')]));
  }

  return { blocks };
}

function handleMeetingSchedule(meetings: QueryContext['meetings'], query: string): HandlerResult {
  if (!meetings || meetings.length === 0) {
    return { text: 'No meetings found for this period.' };
  }

  const now = new Date();
  const isUpcoming = /(?:next|tomorrow|upcoming)/i.test(query);

  const filtered = isUpcoming
    ? meetings.filter((m) => m.start_time && new Date(m.start_time) > now)
    : meetings;

  if (filtered.length === 0) {
    return { text: isUpcoming ? 'No upcoming meetings scheduled.' : 'No meetings found this week.' };
  }

  const lines = filtered.slice(0, 8).map((m) => {
    const date = m.start_time
      ? new Date(m.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : 'TBD';
    return `• ${appLink(`/meetings/${m.id}`, m.title || 'Untitled')} — ${date} (${m.attendees_count} attendees)`;
  });

  return {
    blocks: [
      section(`*${isUpcoming ? 'Upcoming' : 'This Week\'s'} Meetings* (${filtered.length})`),
      section(lines.join('\n')),
      ...(filtered.length > 8 ? [context([`${filtered.length - 8} more. ${appLink('/calendar', 'View calendar')}`])] : []),
    ],
  };
}

function handleRecentActivity(
  meetings: QueryContext['meetings'],
  activities: QueryContext['activities']
): HandlerResult {
  const blocks = [];
  const items: Array<{ date: Date; text: string }> = [];

  for (const m of (meetings || []).slice(0, 5)) {
    if (m.start_time) {
      items.push({
        date: new Date(m.start_time),
        text: `:calendar: ${appLink(`/meetings/${m.id}`, m.title || 'Meeting')} — ${new Date(m.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
      });
    }
  }

  for (const a of (activities || []).slice(0, 5)) {
    items.push({
      date: new Date(a.created_at),
      text: `:clipboard: ${a.type} — ${truncate(a.subject || 'Activity', 60)} — ${new Date(a.created_at).toLocaleDateString()}`,
    });
  }

  items.sort((a, b) => b.date.getTime() - a.date.getTime());

  if (items.length === 0) {
    return { text: 'No recent activity found this week.' };
  }

  blocks.push(section('*Recent Activity (Past 7 Days):*'));
  blocks.push(section(items.slice(0, 8).map((i) => i.text).join('\n')));
  blocks.push(divider());
  blocks.push(context([`${appLink('/calendar', 'View Calendar')} | ${appLink('/activity', 'View All Activity')}`]));

  return { blocks };
}
