// supabase/functions/_shared/slack-copilot/handlers/contactQueryHandler.ts
// Handles contact and company information queries (PRD-22, CONV-005)

import type { ClassifiedIntent, QueryContext, HandlerResult } from '../types.ts';
import { section, fields, divider, context, appLink } from '../responseFormatter.ts';

export async function handleContactQuery(
  intent: ClassifiedIntent,
  queryContext: QueryContext
): Promise<HandlerResult> {
  const { contacts, deals } = queryContext;

  if (!contacts || contacts.length === 0) {
    const name = intent.entities.contactName || intent.entities.companyName || 'that';
    return { text: `I couldn't find any contacts matching "${name}". Check the spelling or try a different name.` };
  }

  if (contacts.length === 1) {
    return handleSingleContact(contacts[0], deals);
  }

  // Multiple matches — list them
  const lines = contacts.slice(0, 5).map((c) => {
    const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown';
    return `• ${appLink(`/contacts/${c.id}`, name)}${c.title ? ` — ${c.title}` : ''}${c.company ? ` at ${c.company}` : ''}`;
  });

  return {
    blocks: [
      section(`Found ${contacts.length} contacts:`),
      section(lines.join('\n')),
      context(['Be more specific — e.g. "Tell me about Sarah Chen at Acme"']),
    ],
  };
}

function handleSingleContact(
  contact: QueryContext['contacts'][0],
  deals: QueryContext['deals']
): HandlerResult {
  const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unknown';

  // Find related deals (by company match)
  const relatedDeals = deals?.filter((d) =>
    contact.company && d.title.toLowerCase().includes(contact.company.toLowerCase())
  ).slice(0, 3) || [];

  const blocks = [
    section(`*${fullName}*`),
    fields([
      { label: 'Title', value: contact.title || 'Unknown' },
      { label: 'Company', value: contact.company || 'Unknown' },
      { label: 'Email', value: contact.email || 'Not available' },
    ]),
  ];

  if (relatedDeals.length > 0) {
    blocks.push(divider());
    blocks.push(section('*Related Deals:*'));
    const dealLines = relatedDeals.map((d) => `• ${appLink(`/deals/${d.id}`, d.title)} — ${d.stage}`);
    blocks.push(section(dealLines.join('\n')));
  }

  blocks.push(divider());
  blocks.push(context([appLink(`/contacts/${contact.id}`, 'View full profile')]));

  return { blocks };
}
