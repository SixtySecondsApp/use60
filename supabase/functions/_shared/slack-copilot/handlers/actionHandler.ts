// supabase/functions/_shared/slack-copilot/handlers/actionHandler.ts
// Handles action requests: draft email, draft check-in, create task, schedule meeting (PRD-22, CONV-006, CC-013)

import type { ClassifiedIntent, QueryContext, HandlerResult } from '../types.ts';
import { section, actions, divider, context, appLink } from '../responseFormatter.ts';

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------

export async function handleActionRequest(
  intent: ClassifiedIntent,
  queryContext: QueryContext,
  anthropicApiKey: string | null,
  modelId?: string
): Promise<HandlerResult> {
  switch (intent.entities.actionType) {
    case 'draft_email':
      return handleDraftEmail(intent, queryContext, anthropicApiKey, modelId);
    case 'draft_check_in':
      return handleDraftCheckIn(intent, queryContext, anthropicApiKey, modelId);
    case 'create_task':
      return handleCreateTask(intent, queryContext);
    case 'schedule_meeting':
      return handleScheduleMeeting(intent, queryContext);
    case 'send_email':
      return handleSendConfirmation(intent);
    default:
      return { text: "Choose: draft email, create task, or schedule meeting." };
  }
}

// ---------------------------------------------------------------------------
// Prompt template
// ---------------------------------------------------------------------------

const DRAFT_EMAIL_PROMPT = `You are drafting an email for a sales rep. Use the context below to write a personalized, conversational email.

DEAL CONTEXT:
- Deal: {dealName} ({stage}, {value})
- Contact: {contactName} ({contactTitle} at {company})
- Last interaction: {lastInteractionDate}
- Days since last contact: {daysSinceContact}

HISTORICAL CONTEXT (from meeting transcripts):
{ragContext}

WRITING GUIDELINES:
- Sound human, not AI-generated
- Reference specific details from past conversations
- Keep it under 150 words
- Include a clear next step or ask
- Match a professional but warm tone

Draft the email with subject line.`;

// ---------------------------------------------------------------------------
// handleDraftEmail — enhanced with RAG context
// ---------------------------------------------------------------------------

async function handleDraftEmail(
  intent: ClassifiedIntent,
  queryContext: QueryContext,
  anthropicApiKey: string | null,
  modelId?: string
): Promise<HandlerResult> {
  const { deals, contacts, meetings } = queryContext;
  const resolvedModelId = modelId ?? 'claude-haiku-4-5-20251001';

  const deal = deals?.[0];
  const contact = contacts?.[0];

  if (!deal && !contact) {
    return { text: "I need more context to draft an email. Try: \"Draft a follow-up for [deal name]\" or \"Draft an email to [contact name]\"." };
  }

  const recipientName = contact
    ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
    : deal?.title || 'them';

  if (anthropicApiKey) {
    try {
      const { draft, ragUsed, contactFound } = await generateEmailDraftEnhanced(
        intent, queryContext, anthropicApiKey, resolvedModelId
      );

      const contextFooter = buildContextFooter(ragUsed, true, contactFound);

      return buildDraftResult({
        recipientName,
        draft,
        deal,
        contact,
        contextFooter,
      });
    } catch (err) {
      console.error('[actionHandler] Draft generation failed:', err);
    }
  }

  // Fallback without AI
  const lastMeeting = meetings?.[0];
  return {
    blocks: [
      section(`I'd draft a follow-up for *${recipientName}*, but I need the AI service to generate it.`),
      ...(lastMeeting?.summary ? [section(`Based on your last meeting: _${lastMeeting.summary.substring(0, 200)}_`)] : []),
      context([
        'Try again in a moment, or draft it manually in the app.',
        [deal ? appLink(`/deals/${deal.id}`, 'View Deal') : '', contact ? appLink(`/contacts/${contact.id}`, 'View Contact') : ''].filter(Boolean).join(' | '),
      ].filter(Boolean) as string[]),
    ],
  };
}

// ---------------------------------------------------------------------------
// handleDraftCheckIn — batch mode for stale deals
// ---------------------------------------------------------------------------

async function handleDraftCheckIn(
  intent: ClassifiedIntent,
  queryContext: QueryContext,
  anthropicApiKey: string | null,
  modelId?: string
): Promise<HandlerResult> {
  const resolvedModelId = modelId ?? 'claude-haiku-4-5-20251001';
  const deals = queryContext.deals || [];

  // Identify deals that have had activity in the last 14 days
  const recentActivityDealIds = new Set<string>();
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  for (const activity of (queryContext.activities || [])) {
    const dealId = (activity.metadata as Record<string, unknown>)?.deal_id as string | undefined;
    if (dealId) {
      const activityDate = new Date(activity.created_at);
      if (activityDate >= fourteenDaysAgo) {
        recentActivityDealIds.add(dealId);
      }
    }
  }

  const staleDeals = deals.filter((d) => !recentActivityDealIds.has(d.id));

  if (staleDeals.length === 0) {
    return { text: "All your deals have had recent activity in the last 14 days. No check-ins needed right now." };
  }

  // Draft for the first stale deal (up to 3); surface one at a time in Slack thread
  const target = staleDeals.slice(0, 3)[0];

  // Find a matching contact for this deal
  const contact = queryContext.contacts?.[0] ?? null;

  if (!anthropicApiKey) {
    return {
      blocks: [
        section(`*Check-in needed:* ${staleDeals.length} deal${staleDeals.length > 1 ? 's have' : ' has'} gone quiet for 14+ days.`),
        section(`Starting with: *${target.title}*`),
        context(['AI service unavailable — draft this one manually.', appLink(`/deals/${target.id}`, 'View Deal')]),
      ],
    };
  }

  try {
    const checkInIntent: ClassifiedIntent = {
      ...intent,
      entities: {
        ...intent.entities,
        dealName: target.title,
        rawQuery: `Draft a check-in email for ${target.title}`,
      },
    };

    const checkInContext: QueryContext = {
      ...queryContext,
      deals: [target],
      contacts: contact ? [contact] : [],
    };

    const { draft, ragUsed, contactFound } = await generateEmailDraftEnhanced(
      checkInIntent, checkInContext, anthropicApiKey, resolvedModelId
    );

    const recipientName = contact
      ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
      : target.title;

    const remaining = staleDeals.length - 1;
    const contextFooter = buildContextFooter(ragUsed, true, contactFound);
    const footerParts: string[] = [contextFooter];
    if (remaining > 0) {
      footerParts.push(`${remaining} more stale deal${remaining > 1 ? 's' : ''} waiting — approve or skip to see the next.`);
    }

    return buildDraftResult({
      recipientName,
      draft,
      deal: target,
      contact,
      contextFooter: footerParts.join('  ·  '),
      isCheckIn: true,
      remainingCount: remaining,
    });
  } catch (err) {
    console.error('[actionHandler] Check-in draft generation failed:', err);
    return { text: `Failed to generate check-in draft for ${target.title}. Please try again.` };
  }
}

// ---------------------------------------------------------------------------
// Email generation — enhanced prompt with RAG context
// ---------------------------------------------------------------------------

interface DraftResult {
  draft: string;
  ragUsed: boolean;
  contactFound: boolean;
}

async function generateEmailDraftEnhanced(
  intent: ClassifiedIntent,
  queryContext: QueryContext,
  apiKey: string,
  modelId: string
): Promise<DraftResult> {
  const deal = queryContext.deals?.[0];
  const contact = queryContext.contacts?.[0];
  const meetings = queryContext.meetings || [];

  const contactFound = !!contact;
  const ragUsed = meetings.length > 0;

  // Build RAG context from meeting transcripts/summaries
  const ragContext = meetings.length > 0
    ? meetings
        .slice(0, 3)
        .map((m, i) => {
          const dateStr = m.start_time
            ? new Date(m.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : `Meeting ${i + 1}`;
          return `[${dateStr}] ${m.title || 'Meeting'}: ${(m.summary || '').substring(0, 400)}`;
        })
        .join('\n\n')
    : 'No meeting transcripts available.';

  // Calculate days since last contact
  const lastActivity = queryContext.activities?.[0];
  const daysSinceContact = lastActivity
    ? Math.floor((Date.now() - new Date(lastActivity.created_at).getTime()) / 86_400_000)
    : null;
  const lastInteractionDate = lastActivity
    ? new Date(lastActivity.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : meetings[0]?.start_time
      ? new Date(meetings[0].start_time).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'Unknown';

  // Fill prompt template
  const filledPrompt = DRAFT_EMAIL_PROMPT
    .replace('{dealName}', deal?.title || 'Unknown Deal')
    .replace('{stage}', deal?.stage || 'Unknown Stage')
    .replace('{value}', deal?.value != null ? `$${deal.value.toLocaleString()}` : 'Value unknown')
    .replace('{contactName}', contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : 'Unknown Contact')
    .replace('{contactTitle}', contact?.title || 'Unknown Title')
    .replace('{company}', contact?.company || deal?.title || 'Unknown Company')
    .replace('{lastInteractionDate}', lastInteractionDate)
    .replace('{daysSinceContact}', daysSinceContact != null ? `${daysSinceContact} days` : 'Unknown')
    .replace('{ragContext}', ragContext);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 500,
      system: `You are a sales email assistant. Today's date: ${today}. Write concise, human-sounding emails with a clear subject line and body. Format your response as:\nSubject: <subject line>\n\n<email body>`,
      messages: [{
        role: 'user',
        content: filledPrompt + `\n\nAdditional context from user: ${intent.entities.rawQuery || 'Draft a follow-up'}`,
      }],
    }),
  });

  if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);
  const data = await response.json();
  const draft = data.content?.[0]?.text || 'Unable to generate draft.';

  return { draft, ragUsed, contactFound };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildContextFooter(ragUsed: boolean, dealFound: boolean, contactFound: boolean): string {
  return [
    ragUsed ? 'Meeting transcripts via RAG' : null,
    dealFound ? 'Deal record' : null,
    contactFound ? 'Contact profile' : null,
  ]
    .filter(Boolean)
    .map((s) => `${s} \u2713`)
    .join(' \u00b7 ');
}

interface BuildDraftOptions {
  recipientName: string;
  draft: string;
  deal: QueryContext['deals'][0] | null | undefined;
  contact: QueryContext['contacts'][0] | null | undefined;
  contextFooter: string;
  isCheckIn?: boolean;
  remainingCount?: number;
}

function buildDraftResult(opts: BuildDraftOptions): HandlerResult {
  const { recipientName, draft, deal, contact, contextFooter, isCheckIn = false, remainingCount = 0 } = opts;

  const label = isCheckIn ? 'Check-in Draft' : 'Draft Follow-up';

  // Parse subject and body from generated draft when present
  const subjectMatch = draft.match(/^Subject:\s*(.+)/im);
  const subject = subjectMatch ? subjectMatch[1].trim() : `Follow-up with ${recipientName}`;
  const body = subjectMatch ? draft.replace(/^Subject:.+\n*/im, '').trim() : draft;

  const draftButtonValue = JSON.stringify({
    deal_id: deal?.id,
    contact_email: contact?.email,
    subject,
    body,
  });
  const editValue = JSON.stringify({ deal_id: deal?.id, draft_id: `draft_${Date.now()}` });
  const regenValue = JSON.stringify({ deal_id: deal?.id });
  const skipValue = JSON.stringify({ deal_id: deal?.id });

  const appLinks = [
    deal ? appLink(`/deals/${deal.id}`, 'View Deal') : '',
    contact ? appLink(`/contacts/${contact.id}`, 'View Contact') : '',
  ].filter(Boolean).join(' | ');

  const contextParts: string[] = [];
  if (contextFooter) contextParts.push(contextFooter);
  if (appLinks) contextParts.push(appLinks);
  if (isCheckIn && remainingCount > 0) {
    contextParts.push(`Approve or skip to queue the next check-in.`);
  }

  return {
    blocks: [
      section(`*${label} for ${recipientName}:*`),
      divider(),
      section(draft),
      divider(),
      actions([
        { text: 'Send', actionId: 'copilot_send_email', value: draftButtonValue, style: 'primary' },
        { text: 'Edit', actionId: 'copilot_edit_email', value: editValue },
        { text: 'Regenerate', actionId: 'copilot_regenerate_email', value: regenValue },
        { text: 'Skip', actionId: 'copilot_skip_email', value: skipValue },
      ]),
      context(contextParts.filter(Boolean) as string[]),
    ],
    pendingAction: {
      type: 'send_email',
      data: {
        draft,
        subject,
        body,
        dealId: deal?.id,
        contactId: contact?.id,
        recipientEmail: contact?.email,
        isCheckIn,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// handleCreateTask
// ---------------------------------------------------------------------------

function handleCreateTask(intent: ClassifiedIntent, queryContext: QueryContext): HandlerResult {
  const rawQuery = intent.entities.rawQuery || '';
  const deal = queryContext.deals?.[0];

  const taskMatch = rawQuery.match(/(?:create|add|make)\s+(?:a\s+)?task\s+(?:to\s+)?(.+)/i);
  const taskTitle = taskMatch ? taskMatch[1].replace(/\.$/, '').trim() : rawQuery;

  const taskLinks = [
    appLink('/tasks', 'View Tasks'),
    deal ? appLink(`/deals/${deal.id}`, 'View Deal') : '',
  ].filter(Boolean).join(' | ');

  return {
    blocks: [
      section(`*Create Task:*\n${taskTitle}${deal ? `\nDeal: ${deal.title}` : ''}`),
      actions([
        { text: 'Create Task', actionId: 'copilot_create_task', value: JSON.stringify({ title: taskTitle, dealId: deal?.id }), style: 'primary' },
        { text: 'Edit First', actionId: 'copilot_edit_task', value: JSON.stringify({ title: taskTitle, dealId: deal?.id }) },
        { text: 'Cancel', actionId: 'copilot_dismiss', value: 'dismiss' },
      ]),
      context([taskLinks]),
    ],
    pendingAction: {
      type: 'create_task',
      data: { title: taskTitle, dealId: deal?.id },
    },
  };
}

// ---------------------------------------------------------------------------
// handleScheduleMeeting
// ---------------------------------------------------------------------------

function handleScheduleMeeting(_intent: ClassifiedIntent, queryContext: QueryContext): HandlerResult {
  const contact = queryContext.contacts?.[0];
  const contactName = contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : null;

  return {
    blocks: [
      section(contactName
        ? `Schedule a meeting with *${contactName}* in the app. Use /sixty calendar to check availability.`
        : "Meeting creation is in the app. Use /sixty calendar to check availability."),
      context([
        'Use `/sixty calendar` to see your schedule, or ask me "show my meetings this week".',
        [appLink('/calendar', 'View Calendar'), contact ? appLink(`/contacts/${contact.id}`, 'View Contact') : ''].filter(Boolean).join(' | '),
      ]),
    ],
  };
}

// ---------------------------------------------------------------------------
// handleSendConfirmation
// ---------------------------------------------------------------------------

function handleSendConfirmation(_intent: ClassifiedIntent): HandlerResult {
  return {
    text: "To send an email, first draft one with \"Draft a follow-up for [deal]\" and then approve it.",
  };
}
