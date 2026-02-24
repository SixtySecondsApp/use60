// supabase/functions/_shared/slack-copilot/handlers/actionHandler.ts
// Handles action requests: draft email, create task, schedule meeting (PRD-22, CONV-006)

import type { ClassifiedIntent, QueryContext, HandlerResult } from '../types.ts';
import { section, actions, divider, context } from '../responseFormatter.ts';

export async function handleActionRequest(
  intent: ClassifiedIntent,
  queryContext: QueryContext,
  anthropicApiKey: string | null
): Promise<HandlerResult> {
  switch (intent.entities.actionType) {
    case 'draft_email':
      return handleDraftEmail(intent, queryContext, anthropicApiKey);
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

async function handleDraftEmail(
  intent: ClassifiedIntent,
  queryContext: QueryContext,
  anthropicApiKey: string | null
): Promise<HandlerResult> {
  const { deals, contacts, meetings } = queryContext;

  // Find the most relevant deal or contact
  const deal = deals?.[0];
  const contact = contacts?.[0];
  const lastMeeting = meetings?.[0];

  if (!deal && !contact) {
    return { text: "I need more context to draft an email. Try: \"Draft a follow-up for [deal name]\" or \"Draft an email to [contact name]\"." };
  }

  const recipientName = contact
    ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
    : deal?.title || 'them';

  // Generate draft with AI if available
  if (anthropicApiKey) {
    try {
      const draft = await generateEmailDraft(intent, queryContext, anthropicApiKey);
      return {
        blocks: [
          section(`*Draft Follow-up for ${recipientName}:*`),
          divider(),
          section(draft),
          divider(),
          actions([
            { text: 'Approve & Send', actionId: 'copilot_send_email', value: JSON.stringify({ draft, dealId: deal?.id, contactId: contact?.id }), style: 'primary' },
            { text: 'Edit', actionId: 'copilot_edit_draft', value: JSON.stringify({ draft, dealId: deal?.id }) },
            { text: 'Dismiss', actionId: 'copilot_dismiss', value: 'dismiss' },
          ]),
          context(['I\'ll hold this draft until you approve. Reply with edits if you want changes.']),
        ],
        pendingAction: {
          type: 'send_email',
          data: { draft, dealId: deal?.id, contactId: contact?.id, recipientEmail: contact?.email },
        },
      };
    } catch (err) {
      console.error('[actionHandler] Draft generation failed:', err);
    }
  }

  // Fallback without AI
  return {
    blocks: [
      section(`I'd draft a follow-up for *${recipientName}*, but I need the AI service to generate it.`),
      ...(lastMeeting?.summary ? [section(`Based on your last meeting: _${lastMeeting.summary.substring(0, 200)}_`)] : []),
      context(['Try again in a moment, or draft it manually in the app.']),
    ],
  };
}

async function generateEmailDraft(
  intent: ClassifiedIntent,
  queryContext: QueryContext,
  apiKey: string
): Promise<string> {
  const deal = queryContext.deals?.[0];
  const contact = queryContext.contacts?.[0];
  const lastMeeting = queryContext.meetings?.[0];

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const contextParts: string[] = [];
  if (deal) contextParts.push(`Deal: ${deal.title} (Stage: ${deal.stage})`);
  if (contact) contextParts.push(`Contact: ${contact.first_name} ${contact.last_name}, ${contact.title} at ${contact.company}`);
  if (lastMeeting?.summary) contextParts.push(`Last meeting summary: ${lastMeeting.summary.substring(0, 500)}`);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: `You are a sales email assistant. Write concise, professional follow-up emails. Today's date: ${today}. Keep emails under 150 words. Be warm but direct. Include a clear next step or CTA.`,
      messages: [{
        role: 'user',
        content: `Draft a follow-up email based on:\n${contextParts.join('\n')}\n\nUser request: ${intent.entities.rawQuery || 'Draft a follow-up'}`,
      }],
    }),
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  const data = await response.json();
  return data.content?.[0]?.text || 'Unable to generate draft.';
}

function handleCreateTask(intent: ClassifiedIntent, queryContext: QueryContext): HandlerResult {
  const rawQuery = intent.entities.rawQuery || '';
  const deal = queryContext.deals?.[0];

  // Extract task description from the message
  const taskMatch = rawQuery.match(/(?:create|add|make)\s+(?:a\s+)?task\s+(?:to\s+)?(.+)/i);
  const taskTitle = taskMatch ? taskMatch[1].replace(/\.$/, '').trim() : rawQuery;

  return {
    blocks: [
      section(`*Create Task:*\n${taskTitle}${deal ? `\nDeal: ${deal.title}` : ''}`),
      actions([
        { text: 'Create Task', actionId: 'copilot_create_task', value: JSON.stringify({ title: taskTitle, dealId: deal?.id }), style: 'primary' },
        { text: 'Edit First', actionId: 'copilot_edit_task', value: JSON.stringify({ title: taskTitle, dealId: deal?.id }) },
        { text: 'Cancel', actionId: 'copilot_dismiss', value: 'dismiss' },
      ]),
    ],
    pendingAction: {
      type: 'create_task',
      data: { title: taskTitle, dealId: deal?.id },
    },
  };
}

function handleScheduleMeeting(_intent: ClassifiedIntent, queryContext: QueryContext): HandlerResult {
  const contact = queryContext.contacts?.[0];
  const contactName = contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : null;

  return {
    blocks: [
      section(contactName
        ? `Schedule a meeting with *${contactName}* in the app. Use /sixty calendar to check availability.`
        : "Meeting creation is in the app. Use /sixty calendar to check availability."),
      context(['Use `/sixty calendar` to see your schedule, or ask me "show my meetings this week".']),
    ],
  };
}

function handleSendConfirmation(intent: ClassifiedIntent): HandlerResult {
  return {
    text: "To send an email, first draft one with \"Draft a follow-up for [deal]\" and then approve it.",
  };
}
