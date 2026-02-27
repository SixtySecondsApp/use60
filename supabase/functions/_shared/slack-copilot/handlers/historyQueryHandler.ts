// supabase/functions/_shared/slack-copilot/handlers/historyQueryHandler.ts
// Handles history and meeting timeline queries (PRD-22, CONV-005, CC-010)
//
// RAG upgrade: when a deal name is identified and RAG is available, this handler
// queries the meeting-analytics vector store for rich deal narratives (conversation
// summary, commitments, objections, priorities) and renders a MEETING ARC view.
// Falls back to the structured DB approach if RAG is unavailable or returns nothing.

import type { ClassifiedIntent, QueryContext, HandlerResult } from '../types.ts';
import { section, divider, context, actions, appLink, truncate } from '../responseFormatter.ts';
import { createRAGClient } from '../../memory/ragClient.ts';
import type { RAGResult } from '../../memory/types.ts';

// ---------------------------------------------------------------------------
// RAG query definitions — focused on the 4 sections needed for deal history
// ---------------------------------------------------------------------------

interface DealHistoryQuery {
  id: 'conversation_summary' | 'commitments' | 'objections_concerns' | 'prospect_priorities';
  query: string;
}

const DEAL_HISTORY_QUERIES: DealHistoryQuery[] = [
  {
    id: 'conversation_summary',
    query: 'Summarise what has been discussed across all previous meetings with this company. Focus on key decisions, concerns raised, and where things stand.',
  },
  {
    id: 'commitments',
    query: 'What specific commitments or promises were made by either side? Include deadlines if mentioned.',
  },
  {
    id: 'objections_concerns',
    query: 'What objections, concerns, or hesitations has the prospect raised? How were they addressed?',
  },
  {
    id: 'prospect_priorities',
    query: 'What does the prospect care most about? What are their stated priorities, pain points, and success criteria?',
  },
];

const RAG_QUERY_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Public handler
// ---------------------------------------------------------------------------

export async function handleHistoryQuery(
  intent: ClassifiedIntent,
  queryContext: QueryContext,
  orgId?: string,
  userId?: string,
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

  // Deal history query — attempt RAG-powered MEETING ARC if we have enough context
  if (intent.entities.dealName && orgId) {
    const deal = queryContext.deals?.find((d) =>
      d.title.toLowerCase().includes((intent.entities.dealName || '').toLowerCase())
    );
    return handleDealHistory(intent.entities.dealName, deal ?? null, meetings, activities, orgId);
  }

  // General history
  return handleRecentActivity(meetings, activities);
}

// ---------------------------------------------------------------------------
// RAG-powered deal history (MEETING ARC)
// ---------------------------------------------------------------------------

async function handleDealHistory(
  dealName: string,
  deal: QueryContext['deals'][0] | null,
  meetings: QueryContext['meetings'],
  activities: QueryContext['activities'],
  orgId: string,
): Promise<HandlerResult> {
  // Attempt RAG queries with timeout guard
  let ragSections: Partial<Record<DealHistoryQuery['id'], RAGResult>> = {};

  try {
    const ragClient = createRAGClient({ orgId });

    const queryPromises = DEAL_HISTORY_QUERIES.map(async (q) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('RAG query timeout')), RAG_QUERY_TIMEOUT_MS);
      });

      try {
        const result = await Promise.race([
          ragClient.query({ query: q.query }),
          timeout,
        ]);
        return { id: q.id, result };
      } catch (err) {
        console.warn(`[historyQueryHandler] RAG query "${q.id}" failed:`, err instanceof Error ? err.message : String(err));
        return { id: q.id, result: null };
      } finally {
        clearTimeout(timer);
      }
    });

    const settled = await Promise.allSettled(queryPromises);
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled' && outcome.value.result && outcome.value.result.chunks.length > 0) {
        ragSections[outcome.value.id] = outcome.value.result;
      }
    }
  } catch (err) {
    console.warn('[historyQueryHandler] RAG client creation failed, falling back to DB:', err instanceof Error ? err.message : String(err));
  }

  const hasRagData = Object.keys(ragSections).length > 0;

  if (hasRagData) {
    return buildMeetingArcResponse(dealName, deal, meetings, ragSections);
  }

  // Graceful fallback — structured DB data
  return buildDbFallbackResponse(dealName, deal, meetings, activities);
}

// ---------------------------------------------------------------------------
// Build the MEETING ARC narrative from RAG results
// ---------------------------------------------------------------------------

function buildMeetingArcResponse(
  dealName: string,
  deal: QueryContext['deals'][0] | null,
  meetings: QueryContext['meetings'],
  ragSections: Partial<Record<DealHistoryQuery['id'], RAGResult>>,
): HandlerResult {
  const blocks: unknown[] = [];

  // Header
  const headerText = deal
    ? `*${deal.title}* — Deal History`
    : `*${dealName}* — Deal History`;
  blocks.push(section(headerText));

  // Meeting arc timeline from DB meetings
  if (meetings && meetings.length > 0) {
    const sorted = [...meetings].sort((a, b) => {
      const aTime = a.start_time ? new Date(a.start_time).getTime() : 0;
      const bTime = b.start_time ? new Date(b.start_time).getTime() : 0;
      return aTime - bTime;
    });

    const firstDate = sorted[0].start_time
      ? new Date(sorted[0].start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null;
    const lastDate = sorted[sorted.length - 1].start_time
      ? new Date(sorted[sorted.length - 1].start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null;

    if (firstDate && lastDate && sorted.length > 1) {
      blocks.push(context([`${sorted.length} meetings · ${firstDate} → ${lastDate}`]));
    } else if (sorted.length === 1 && firstDate) {
      blocks.push(context([`1 meeting · ${firstDate}`]));
    }

    // Meeting arc lines
    const arcLines: string[] = [];
    sorted.forEach((m, i) => {
      const isLast = i === sorted.length - 1;
      const prefix = isLast ? '└─' : '├─';
      const dateStr = m.start_time
        ? new Date(m.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        : 'Unknown date';
      const attendeesStr = m.attendees_count > 0 ? ` · ${m.attendees_count} attendees` : '';
      const meetingLink = appLink(`/meetings/${m.id}`, m.title || 'Untitled');
      arcLines.push(`${prefix} ${dateStr} — ${meetingLink}${attendeesStr}`);
      if (m.summary) {
        const indent = isLast ? '   ' : '│  ';
        arcLines.push(`${indent} _${truncate(m.summary, 120)}_`);
      }
    });

    if (arcLines.length > 0) {
      blocks.push(section(`*MEETING ARC*\n${arcLines.join('\n')}`));
    }
  }

  blocks.push(divider());

  // Deal narrative from RAG conversation_summary
  const summary = ragSections['conversation_summary'];
  if (summary && summary.chunks.length > 0) {
    const narrativeText = summary.chunks.slice(0, 3).map((c) => c.text).join('\n\n');
    blocks.push(section(`*Deal Narrative*\n${truncate(narrativeText, 600)}`));
  }

  // Commitments
  const commitments = ragSections['commitments'];
  if (commitments && commitments.chunks.length > 0) {
    const commitText = commitments.chunks.slice(0, 2).map((c) => `• ${truncate(c.text, 150)}`).join('\n');
    blocks.push(section(`*Open Commitments*\n${commitText}`));
  }

  // Objections / concerns — why they might have gone dark
  const objections = ragSections['objections_concerns'];
  if (objections && objections.chunks.length > 0) {
    const objText = objections.chunks.slice(0, 2).map((c) => `• ${truncate(c.text, 150)}`).join('\n');
    blocks.push(section(`*Objections & Concerns*\n${objText}`));
  }

  // Prospect priorities
  const priorities = ragSections['prospect_priorities'];
  if (priorities && priorities.chunks.length > 0) {
    const priorityText = priorities.chunks.slice(0, 2).map((c) => `• ${truncate(c.text, 150)}`).join('\n');
    blocks.push(section(`*What Matters to Them*\n${priorityText}`));
  }

  blocks.push(divider());

  // Actionable insight footer
  blocks.push(section('*Actionable Insight* — Use the context above to re-engage with precision. Reference something specific from your last conversation.'));

  // Action buttons
  const dealIdValue = deal ? JSON.stringify({ deal_id: deal.id, deal_name: deal.title }) : JSON.stringify({ deal_name: dealName });
  blocks.push(actions([
    {
      text: 'Draft re-engagement',
      actionId: 'copilot_draft_email',
      value: dealIdValue,
      style: 'primary',
    },
    ...(deal ? [{
      text: 'View deal',
      actionId: 'copilot_open_deal',
      value: deal.id,
    }] : []),
    {
      text: 'Check for signals',
      actionId: 'copilot_trigger_enrichment',
      value: dealIdValue,
    },
  ]));

  return { blocks };
}

// ---------------------------------------------------------------------------
// Structured DB fallback when RAG is unavailable or returns nothing
// ---------------------------------------------------------------------------

function buildDbFallbackResponse(
  dealName: string,
  deal: QueryContext['deals'][0] | null,
  meetings: QueryContext['meetings'],
  activities: QueryContext['activities'],
): HandlerResult {
  const blocks: unknown[] = [];

  const headerText = deal
    ? `*${deal.title}* — Deal History`
    : `*${dealName}* — Deal History`;
  blocks.push(section(headerText));

  if (deal) {
    blocks.push(section(`Stage: ${deal.stage || 'Unknown'} · Status: ${deal.health_status || 'No status'}`));
  }

  if (meetings && meetings.length > 0) {
    const sorted = [...meetings].sort((a, b) => {
      const aTime = a.start_time ? new Date(a.start_time).getTime() : 0;
      const bTime = b.start_time ? new Date(b.start_time).getTime() : 0;
      return bTime - aTime; // newest first for fallback
    });

    const meetingLines = sorted.slice(0, 6).map((m) => {
      const dateStr = m.start_time
        ? new Date(m.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'Unknown date';
      const attendeesStr = m.attendees_count > 0 ? ` · ${m.attendees_count} attendees` : '';
      return `• ${appLink(`/meetings/${m.id}`, m.title || 'Untitled')} — ${dateStr}${attendeesStr}`;
    });

    blocks.push(section(`*Meetings (${meetings.length})*\n${meetingLines.join('\n')}`));
  } else {
    blocks.push(section('No meetings found for this deal.'));
  }

  // Recent activities
  const dealActivities = (activities || []).filter((a) => {
    const meta = a.metadata as Record<string, unknown>;
    return deal ? meta.deal_id === deal.id : (a.subject || '').toLowerCase().includes(dealName.toLowerCase());
  }).slice(0, 4);

  if (dealActivities.length > 0) {
    const actLines = dealActivities.map((a) =>
      `• ${a.type} — ${truncate(a.subject || 'Activity', 60)} — ${new Date(a.created_at).toLocaleDateString()}`
    );
    blocks.push(section(`*Recent Activity*\n${actLines.join('\n')}`));
  }

  blocks.push(divider());

  const dealIdValue = deal ? JSON.stringify({ deal_id: deal.id, deal_name: deal.title }) : JSON.stringify({ deal_name: dealName });
  blocks.push(actions([
    {
      text: 'Draft re-engagement',
      actionId: 'copilot_draft_email',
      value: dealIdValue,
      style: 'primary',
    },
    ...(deal ? [{
      text: 'View deal',
      actionId: 'copilot_open_deal',
      value: deal.id,
    }] : []),
    {
      text: 'Check for signals',
      actionId: 'copilot_trigger_enrichment',
      value: dealIdValue,
    },
  ]));

  return { blocks };
}

// ---------------------------------------------------------------------------
// Contact last-interaction view (unchanged)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Meeting schedule view (unchanged)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// General recent activity view (unchanged)
// ---------------------------------------------------------------------------

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
