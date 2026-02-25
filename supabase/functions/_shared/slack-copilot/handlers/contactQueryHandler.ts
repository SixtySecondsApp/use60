// supabase/functions/_shared/slack-copilot/handlers/contactQueryHandler.ts
// Handles contact and company information queries (PRD-22, CONV-005, CC-005)

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { ClassifiedIntent, QueryContext, HandlerResult } from '../types.ts';
import { section, fields, actions, divider, context, appLink, truncate } from '../responseFormatter.ts';

export async function handleContactQuery(
  intent: ClassifiedIntent,
  queryContext: QueryContext,
  userId: string,
  supabase: SupabaseClient
): Promise<HandlerResult> {
  const { contacts, deals } = queryContext;

  if (!contacts || contacts.length === 0) {
    const name = intent.entities.contactName || intent.entities.companyName || 'that';
    return { text: `I couldn't find any contacts matching "${name}". Check the spelling or try a different name.` };
  }

  if (contacts.length === 1) {
    return handleSingleContact(contacts[0], deals, queryContext, userId, supabase);
  }

  // Multiple matches — list them
  const lines = contacts.slice(0, 5).map((c) => {
    const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown';
    return `• *${name}*${c.title ? ` — ${c.title}` : ''}${c.company ? ` at ${c.company}` : ''}`;
  });

  return {
    blocks: [
      section(`Found ${contacts.length} contacts:`),
      section(lines.join('\n')),
      context(['Be more specific — e.g. "Tell me about Sarah Chen at Acme"']),
    ],
  };
}

async function handleSingleContact(
  contact: QueryContext['contacts'][0],
  deals: QueryContext['deals'],
  queryContext: QueryContext,
  userId: string,
  supabase: SupabaseClient
): Promise<HandlerResult> {
  const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unknown';

  // --- Last interaction (meeting or activity) ---
  const activities = queryContext.activities || [];
  const meetings = queryContext.meetings || [];

  // Most recent meeting mentioning contact name or company
  const contactLower = fullName.toLowerCase();
  const companyLower = (contact.company || '').toLowerCase();

  const relatedMeeting = meetings
    .filter((m) => {
      const title = (m.title || '').toLowerCase();
      const summary = (m.summary || '').toLowerCase();
      return (
        title.includes(contactLower) ||
        summary.includes(contactLower) ||
        (companyLower && (title.includes(companyLower) || summary.includes(companyLower)))
      );
    })
    .sort((a, b) =>
      new Date(b.start_time || 0).getTime() - new Date(a.start_time || 0).getTime()
    )[0] || null;

  // Last email activity from the activities feed
  const lastEmail = activities
    .filter((a) => /email/i.test(a.type))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;

  // --- Associated deals (by contact association or company match) ---
  let associatedDeals: QueryContext['deals'] = [];

  // First try: deals explicitly linked via contact_id in metadata
  const linkedFromActivities = activities
    .map((a) => (a.metadata as Record<string, unknown>)?.deal_id as string | undefined)
    .filter(Boolean) as string[];

  if (linkedFromActivities.length > 0) {
    const linked = deals?.filter((d) => linkedFromActivities.includes(d.id)) || [];
    associatedDeals = linked;
  }

  // Fallback: company-name matching
  if (associatedDeals.length === 0 && contact.company) {
    associatedDeals = deals?.filter((d) =>
      d.title.toLowerCase().includes(companyLower)
    ).slice(0, 3) || [];
  }

  // If still nothing, query deals table directly for contact association
  if (associatedDeals.length === 0) {
    const { data: freshDeals } = await supabase
      .from('deals')
      .select('id, title, stage, value, health_status, close_date, owner_id')
      .eq('owner_id', userId)
      .ilike('title', `%${contact.company || fullName}%`)
      .not('stage', 'in', '("Closed Won","Closed Lost","closed_won","closed_lost")')
      .order('updated_at', { ascending: false })
      .limit(3);
    associatedDeals = freshDeals || [];
  }

  // --- Avg response time placeholder (from activities metadata) ---
  const emailActivities = activities.filter((a) => /email/i.test(a.type));
  let avgResponseTimeStr: string | null = null;
  if (emailActivities.length >= 2) {
    const times = emailActivities
      .slice(0, 10)
      .map((a) => (a.metadata as Record<string, unknown>)?.response_time_hours as number | undefined)
      .filter((v): v is number => typeof v === 'number');
    if (times.length > 0) {
      const avg = times.reduce((s, v) => s + v, 0) / times.length;
      avgResponseTimeStr = `${Math.round(avg)} hours`;
    }
  }

  // --- Build blocks ---
  const blocks: unknown[] = [];

  // Header: name, title, company
  const subtitle = [contact.title, contact.company ? `at ${contact.company}` : null]
    .filter(Boolean)
    .join(', ');
  blocks.push(section(`*${fullName}*${subtitle ? ` — ${subtitle}` : ''}`));

  // Contact details
  blocks.push(fields([
    { label: 'Email', value: contact.email || 'Not available' },
    { label: 'Company', value: contact.company || 'Unknown' },
  ]));

  // Last interaction
  if (relatedMeeting) {
    const meetingDate = relatedMeeting.start_time
      ? new Date(relatedMeeting.start_time).toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
        })
      : 'Unknown date';
    const interactionLine = `*Last interaction:* ${meetingDate} (${relatedMeeting.title || 'Meeting'})`;
    const summaryLine = relatedMeeting.summary
      ? `\n\n*FROM YOUR LAST CONVERSATION*\n_${truncate(relatedMeeting.summary, 300)}_`
      : '';
    blocks.push(divider());
    blocks.push(section(interactionLine + summaryLine));
  }

  // Last email
  if (lastEmail) {
    const emailDate = new Date(lastEmail.created_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric',
    });
    const emailStatus = (lastEmail.metadata as Record<string, unknown>)?.status as string | undefined;
    const statusLabel = emailStatus ? ` — ${emailStatus}` : '';
    blocks.push(section(`*Last email:* ${emailDate}${statusLabel}`));
  }

  // Avg response time
  if (avgResponseTimeStr) {
    blocks.push(context([`Avg response time: ${avgResponseTimeStr}`]));
  }

  // Associated deals
  if (associatedDeals.length > 0) {
    blocks.push(divider());
    const dealLines = associatedDeals.map((d) => {
      const value = d.value != null
        ? ` — ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(d.value)}`
        : '';
      return `• *${d.title}* (${d.stage}${value})`;
    });
    blocks.push(section(`*ASSOCIATED DEALS*\n${dealLines.join('\n')}`));
  }

  // Action buttons
  blocks.push(divider());
  blocks.push(
    actions([
      {
        text: 'Draft email',
        actionId: 'copilot_draft_email',
        value: JSON.stringify({ contactId: contact.id, contactName: fullName }),
        style: 'primary',
      },
      {
        text: 'View contact',
        actionId: 'copilot_open_contact',
        value: contact.id,
      },
      ...(associatedDeals.length > 0
        ? [{
            text: 'View deal',
            actionId: 'copilot_open_deal',
            value: associatedDeals[0].id,
          }]
        : []),
    ])
  );

  blocks.push(context([appLink(`/contacts/${contact.id}`, 'Open full profile in 60')]));

  return { blocks };
}
