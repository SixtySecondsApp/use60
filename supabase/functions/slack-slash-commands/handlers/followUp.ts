// supabase/functions/slack-slash-commands/handlers/followUp.ts
// Handler for /sixty follow-up <person/company> - HITL follow-up email draft

import {
  buildFollowUpDraftMessage,
  buildSearchResultsPickerMessage,
  type FollowUpDraftData,
  type SlackMessage,
} from '../../_shared/slackBlocks.ts';
import { searchContacts, type ContactResult } from '../../_shared/slackSearch.ts';
import { buildErrorResponse } from '../../_shared/slackAuth.ts';
import type { CommandContext } from '../index.ts';

// Anthropic API key for AI-generated drafts
const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') || '';

interface MeetingContext {
  id: string;
  title: string;
  startTime: string;
  summary?: string;
  actionItems?: string[];
}

interface DealContext {
  id: string;
  name: string;
  value: number;
  stage: string;
}

/**
 * Handle /sixty follow-up <target> command
 * Target is a person name, email, or company name
 */
export async function handleFollowUp(ctx: CommandContext, target: string): Promise<SlackMessage> {
  const { supabase, userContext, orgConnection, appUrl, payload } = ctx;
  const userId = userContext.userId;
  const orgId = userContext.orgId;

  if (!orgId) {
    return buildErrorResponse('Unable to determine your organization. Please contact support.');
  }

  try {
    // Search for contacts matching the target
    const searchResult = await searchContacts(supabase, orgId, target, {
      limit: 5,
      includeCrmFallback: true,
      confidenceThreshold: 0.6,
    });

    if (searchResult.results.length === 0) {
      const crmNote = searchResult.crmAvailable
        ? '\n\nWe searched both Sixty and HubSpot.'
        : '';

      return buildErrorResponse(
        `No contacts found matching "${target}".${crmNote}\n\nTry:\n• Full name (e.g., "John Smith")\n• Email address\n• Company name`
      );
    }

    // Get org settings for currency
    const { currencyCode, currencyLocale } = await getOrgCurrency(supabase, orgId);

    // If single result or exact match, proceed with draft generation
    if (searchResult.results.length === 1) {
      return await buildFollowUpForContact(ctx, searchResult.results[0]);
    }

    // Check for exact match
    const exactMatch = searchResult.results.find(c =>
      c.email?.toLowerCase() === target.toLowerCase() ||
      c.full_name?.toLowerCase() === target.toLowerCase()
    );

    if (exactMatch) {
      return await buildFollowUpForContact(ctx, exactMatch);
    }

    // Multiple ambiguous results - show picker
    return buildSearchResultsPickerMessage({
      query: target,
      entityType: 'contact',
      results: searchResult.results.map(c => ({
        id: c.id,
        primaryText: c.full_name || c.email || 'Unknown',
        secondaryText: c.company || undefined,
        metadata: c.source === 'hubspot' ? 'HubSpot' : undefined,
      })),
      sources: searchResult.sources,
      crmAvailable: searchResult.crmAvailable,
      appUrl,
    });

  } catch (error) {
    console.error('Error in handleFollowUp:', error);
    return buildErrorResponse('Failed to create follow-up draft. Please try again.');
  }
}

/**
 * Build follow-up draft for a specific contact
 */
async function buildFollowUpForContact(
  ctx: CommandContext,
  contact: ContactResult
): Promise<SlackMessage> {
  const { supabase, userContext, appUrl, payload } = ctx;
  const userId = userContext.userId;
  const orgId = userContext.orgId;

  // Gather context for the follow-up
  const [lastMeeting, deal, recentActivities] = await Promise.all([
    getLastMeeting(ctx, contact, userId),
    getActiveDeal(ctx, contact, userId),
    getRecentActivities(ctx, contact.id, userId),
  ]);

  // Generate follow-up draft using AI
  const draft = await generateFollowUpDraft({
    recipientName: contact.full_name || contact.email?.split('@')[0] || 'there',
    recipientEmail: contact.email || '',
    company: contact.company,
    lastMeeting,
    deal,
    recentActivities,
  });

  // Calculate confidence score
  const confidenceScore = calculateConfidence(contact, lastMeeting, deal);

  // Create HITL approval record
  const approvalId = crypto.randomUUID();

  try {
    await supabase.from('hitl_pending_approvals').insert({
      id: approvalId,
      org_id: orgId,
      user_id: userId,
      created_by: userId,
      resource_type: 'follow_up',
      resource_id: contact.id,
      resource_name: `Follow-up: ${contact.full_name || contact.email}`,
      slack_team_id: payload.team_id,
      slack_channel_id: null, // Will be updated when Slack responds
      slack_message_ts: null,
      slack_thread_ts: null,
      status: 'pending',
      original_content: {
        recipientEmail: contact.email,
        recipientName: contact.full_name,
        company: contact.company,
        subject: draft.subject,
        body: draft.body,
      },
      callback_type: 'edge_function',
      callback_target: 'hitl-send-followup-email',
      callback_metadata: {
        orgId,
        userId,
        contactId: contact.id,
        dealId: deal?.id,
        source: 'slash_command',
      },
      metadata: {
        source: 'slack_follow_up_command',
        contactName: contact.full_name,
        companyName: contact.company,
        confidence: confidenceScore,
      },
    });
  } catch (error) {
    console.error('Error creating HITL approval:', error);
    // Continue anyway - the draft is still useful
  }

  // Build the follow-up draft message
  const data: FollowUpDraftData = {
    approvalId,
    recipient: {
      name: contact.full_name || contact.email?.split('@')[0] || 'Unknown',
      email: contact.email || '',
      company: contact.company,
    },
    subject: draft.subject,
    body: draft.body,
    context: {
      dealName: deal?.name,
      dealId: deal?.id,
      lastMeetingDate: lastMeeting?.startTime,
      lastMeetingTitle: lastMeeting?.title,
    },
    confidence: confidenceScore,
    appUrl,
  };

  return buildFollowUpDraftMessage(data);
}

/**
 * Get the last meeting with this contact
 */
async function getLastMeeting(
  ctx: CommandContext,
  contact: ContactResult,
  userId: string
): Promise<MeetingContext | null> {
  try {
    // Search meetings by contact email in attendees or by company in title
    const query = supabase => {
      let q = supabase
        .from('meetings')
        .select('id, title, start_time, summary')
        .eq('owner_user_id', userId)
        .order('start_time', { ascending: false })
        .limit(1);

      // Try to filter by contact email in attendees or company in title
      if (contact.email) {
        q = q.or(`title.ilike.%${contact.company || contact.email.split('@')[1]?.split('.')[0]}%`);
      } else if (contact.company) {
        q = q.ilike('title', `%${contact.company}%`);
      }

      return q;
    };

    const { data } = await query(ctx.supabase).maybeSingle();

    if (!data) return null;

    // Get action items from meeting_transcripts or meeting_summaries
    const { data: summaryData } = await ctx.supabase
      .from('meeting_summaries')
      .select('action_items')
      .eq('meeting_id', data.id)
      .maybeSingle();

    const actionItems = Array.isArray(summaryData?.action_items)
      ? summaryData.action_items.map((a: any) => a.task || a.description || String(a))
      : [];

    return {
      id: data.id,
      title: data.title || 'Meeting',
      startTime: data.start_time,
      summary: data.summary,
      actionItems,
    };
  } catch (error) {
    console.error('Error getting last meeting:', error);
    return null;
  }
}

/**
 * Get active deal for this contact
 */
async function getActiveDeal(
  ctx: CommandContext,
  contact: ContactResult,
  userId: string
): Promise<DealContext | null> {
  try {
    // First check if contact has an active deal linked
    if (contact.active_deal_id) {
      const { data } = await ctx.supabase
        .from('deals')
        .select('id, name, value, deal_stages ( name )')
        .eq('id', contact.active_deal_id)
        .maybeSingle();

      if (data) {
        return {
          id: data.id,
          name: data.name,
          value: data.value || 0,
          stage: (data as any).deal_stages?.name || 'Active',
        };
      }
    }

    // Search for deals by company name
    if (contact.company) {
      const { data } = await ctx.supabase
        .from('deals')
        .select('id, name, value, deal_stages ( name )')
        .or(`company.ilike.%${contact.company}%,name.ilike.%${contact.company}%`)
        .not('status', 'eq', 'closed_won')
        .not('status', 'eq', 'closed_lost')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        return {
          id: data.id,
          name: data.name,
          value: data.value || 0,
          stage: (data as any).deal_stages?.name || 'Active',
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error getting active deal:', error);
    return null;
  }
}

/**
 * Get recent activities with this contact
 */
async function getRecentActivities(
  ctx: CommandContext,
  contactId: string,
  userId: string
): Promise<string[]> {
  try {
    const { data } = await ctx.supabase
      .from('activities')
      .select('activity_type, notes, activity_date')
      .eq('contact_id', contactId)
      .order('activity_date', { ascending: false })
      .limit(3);

    if (!data || data.length === 0) return [];

    return data.map((a: any) => {
      const type = formatActivityType(a.activity_type);
      const date = new Date(a.activity_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${date}: ${type}${a.notes ? ` - ${a.notes.slice(0, 50)}` : ''}`;
    });
  } catch (error) {
    console.error('Error getting recent activities:', error);
    return [];
  }
}

/**
 * Format activity type for display
 */
function formatActivityType(type: string): string {
  const typeMap: Record<string, string> = {
    call: 'Call',
    email: 'Email',
    meeting: 'Meeting',
    note: 'Note',
    task: 'Task',
    demo: 'Demo',
  };
  return typeMap[type?.toLowerCase()] || type || 'Activity';
}

/**
 * Calculate confidence score based on available context
 */
function calculateConfidence(
  contact: ContactResult,
  meeting: MeetingContext | null,
  deal: DealContext | null
): number {
  let score = 50; // Base score

  // More context = higher confidence
  if (contact.email) score += 10;
  if (contact.company) score += 10;
  if (meeting) score += 15;
  if (meeting?.summary) score += 10;
  if (deal) score += 5;

  return Math.min(score, 95);
}

/**
 * Generate follow-up email draft using AI
 */
async function generateFollowUpDraft(input: {
  recipientName: string;
  recipientEmail: string;
  company?: string;
  lastMeeting: MeetingContext | null;
  deal: DealContext | null;
  recentActivities: string[];
}): Promise<{ subject: string; body: string }> {
  // Build context for the prompt
  const contextParts: string[] = [];

  if (input.company) {
    contextParts.push(`Company: ${input.company}`);
  }

  if (input.lastMeeting) {
    const meetingDate = new Date(input.lastMeeting.startTime).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    contextParts.push(`Last meeting: ${input.lastMeeting.title} (${meetingDate})`);
    if (input.lastMeeting.summary) {
      contextParts.push(`Summary: ${input.lastMeeting.summary.slice(0, 300)}`);
    }
    if (input.lastMeeting.actionItems && input.lastMeeting.actionItems.length > 0) {
      contextParts.push(`Action items:\n${input.lastMeeting.actionItems.slice(0, 4).map(a => `- ${a}`).join('\n')}`);
    }
  }

  if (input.deal) {
    contextParts.push(`Active deal: ${input.deal.name} (${input.deal.stage})`);
  }

  if (input.recentActivities.length > 0) {
    contextParts.push(`Recent activities:\n${input.recentActivities.slice(0, 3).join('\n')}`);
  }

  // Default subject
  const defaultSubject = input.lastMeeting
    ? `Following up: ${input.lastMeeting.title}`
    : input.deal
    ? `Following up on ${input.deal.name}`
    : input.company
    ? `Following up - ${input.company}`
    : 'Following up';

  // Fallback draft without AI
  if (!anthropicApiKey) {
    const body = buildFallbackDraft(input);
    return { subject: defaultSubject, body };
  }

  try {
    // Get current date for accurate date references in email
    const today = new Date();
    const currentDateStr = today.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        temperature: 0.5,
        system: `You write concise, friendly follow-up emails for sales professionals.
Keep emails brief (3-5 short paragraphs max).
Be professional but warm.
Reference specific context when available.
End with a clear next step or call to action.
Return ONLY valid JSON with { "subject": "...", "body": "..." }`,
        messages: [
          {
            role: 'user',
            content: `Draft a follow-up email.

TODAY'S DATE: ${currentDateStr}
Use this date when making any date references like "tomorrow", "next week", "this Friday", etc.

RECIPIENT: ${input.recipientName}${input.company ? ` at ${input.company}` : ''}
${contextParts.length > 0 ? '\nCONTEXT:\n' + contextParts.join('\n\n') : '\n(No prior context available - write a general check-in follow-up)'}

Return JSON: { "subject": "...", "body": "..." }`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Anthropic API error:', error);
      throw new Error(`Anthropic API error: ${error}`);
    }

    const result = await response.json();
    const content = result.content?.[0]?.text || '';

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      subject: String(parsed.subject || defaultSubject).slice(0, 200),
      body: String(parsed.body || '').slice(0, 5000),
    };
  } catch (error) {
    console.error('Error generating AI draft:', error);
    // Fallback to deterministic draft
    const body = buildFallbackDraft(input);
    return { subject: defaultSubject, body };
  }
}

/**
 * Build a fallback draft without AI
 */
function buildFallbackDraft(input: {
  recipientName: string;
  company?: string;
  lastMeeting: MeetingContext | null;
  deal: DealContext | null;
  recentActivities: string[];
}): string {
  const greeting = `Hi ${input.recipientName},`;

  let opening: string;
  if (input.lastMeeting) {
    const meetingDate = new Date(input.lastMeeting.startTime).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    opening = `Thanks again for your time on ${meetingDate}. I wanted to follow up on our conversation.`;
  } else if (input.deal) {
    opening = `I wanted to check in on ${input.deal.name} and see how things are progressing on your end.`;
  } else {
    opening = `I hope this message finds you well. I wanted to follow up and see how things are going.`;
  }

  let nextSteps = '';
  if (input.lastMeeting?.actionItems && input.lastMeeting.actionItems.length > 0) {
    nextSteps = `\n\nAs discussed, here are the next steps:\n${input.lastMeeting.actionItems.slice(0, 3).map(a => `• ${a}`).join('\n')}`;
  }

  const closing = `\n\nPlease let me know if you have any questions or if there's anything I can help with.`;
  const signoff = `\n\nBest,`;

  return `${greeting}\n\n${opening}${nextSteps}${closing}${signoff}`;
}

/**
 * Get org currency settings
 */
async function getOrgCurrency(
  supabase: any,
  orgId: string
): Promise<{ currencyCode: string; currencyLocale: string }> {
  const { data: orgSettings } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .maybeSingle();

  if (orgSettings?.settings) {
    const settings = orgSettings.settings as Record<string, unknown>;
    return {
      currencyCode: (settings.currency_code as string) || 'USD',
      currencyLocale: (settings.currency_locale as string) || 'en-US',
    };
  }

  return { currencyCode: 'USD', currencyLocale: 'en-US' };
}
