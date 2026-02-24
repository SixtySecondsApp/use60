// supabase/functions/slack-slash-commands/handlers/meetingBrief.ts
// Handler for /sixty meeting-brief [next|today|<name>] - Meeting prep

import { buildMeetingPrepMessage, type MeetingPrepData, type SlackMessage } from '../../_shared/slackBlocks.ts';
import { buildErrorResponse, openModal } from '../../_shared/slackAuth.ts';
import type { CommandContext } from '../index.ts';

interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  user_id: string;
  attendee_emails?: string[];
  meeting_url?: string;
  description?: string;
}

interface Contact {
  id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  email?: string;
  company?: string;
  is_decision_maker?: boolean;
}

interface Deal {
  id: string;
  name: string;
  value: number;
  stage_id?: string;
  probability?: number;
  deal_stages?: { name: string };
}

/**
 * Handle /sixty meeting-brief [target] command
 * Target can be: "next" (default), "today", or a meeting name search
 */
export async function handleMeetingBrief(ctx: CommandContext, target: string): Promise<SlackMessage> {
  const { supabase, userContext, orgConnection, appUrl, payload } = ctx;
  const userId = userContext.userId;
  const orgId = userContext.orgId;

  const targetLower = target.toLowerCase().trim();

  try {
    let meeting: CalendarEvent | null = null;

    if (targetLower === 'next' || targetLower === '') {
      // Get next upcoming meeting
      meeting = await getNextMeeting(ctx, userId);
    } else if (targetLower === 'today') {
      // Get today's meetings and show picker if multiple
      const todayMeetings = await getTodayMeetings(ctx, userId);

      if (todayMeetings.length === 0) {
        return buildErrorResponse('No meetings scheduled for today.');
      }

      if (todayMeetings.length === 1) {
        meeting = todayMeetings[0];
      } else {
        // Multiple meetings - show picker modal
        return buildMeetingPickerResponse(todayMeetings);
      }
    } else {
      // Search for meeting by name
      meeting = await searchMeetingByName(ctx, userId, targetLower);
    }

    if (!meeting) {
      return buildErrorResponse(
        targetLower === 'next'
          ? 'No upcoming meetings found.\n\nSchedule a meeting or check your calendar sync.'
          : `No meeting found matching "${target}".\n\nTry:\n• \`/sixty meeting-brief next\` for your next meeting\n• \`/sixty meeting-brief today\` to pick from today's meetings`
      );
    }

    // Check business relevance before full prep
    const relevance = await checkMeetingRelevance(ctx, meeting);

    if (relevance === 'personal') {
      return {
        blocks: [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `This looks like a personal appointment — I'll skip the meeting brief for *${meeting.title}*.`,
          },
        }],
        text: `Skipping personal meeting: ${meeting.title}`,
      };
    }

    if (relevance === 'unknown') {
      return buildRelevanceQuestion(meeting);
    }

    // Build meeting prep data
    const prepData = await buildMeetingPrepData(ctx, meeting);
    return buildMeetingPrepMessage(prepData);

  } catch (error) {
    console.error('Error in handleMeetingBrief:', error);
    return buildErrorResponse('Failed to prepare meeting brief. Please try again.');
  }
}

/**
 * Get the next upcoming meeting
 */
async function getNextMeeting(ctx: CommandContext, userId: string): Promise<CalendarEvent | null> {
  const now = new Date();

  const { data } = await ctx.supabase
    .from('calendar_events')
    .select('id, title, start_time, end_time, user_id, attendee_emails, meeting_url, description')
    .eq('user_id', userId)
    .gte('start_time', now.toISOString())
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle();

  return data as CalendarEvent | null;
}

/**
 * Get all meetings for today
 */
async function getTodayMeetings(ctx: CommandContext, userId: string): Promise<CalendarEvent[]> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const { data } = await ctx.supabase
    .from('calendar_events')
    .select('id, title, start_time, end_time, user_id, attendee_emails, meeting_url, description')
    .eq('user_id', userId)
    .gte('start_time', todayStart.toISOString())
    .lte('start_time', todayEnd.toISOString())
    .order('start_time', { ascending: true });

  return (data || []) as CalendarEvent[];
}

/**
 * Search for meeting by name
 */
async function searchMeetingByName(ctx: CommandContext, userId: string, query: string): Promise<CalendarEvent | null> {
  const now = new Date();

  const { data } = await ctx.supabase
    .from('calendar_events')
    .select('id, title, start_time, end_time, user_id, attendee_emails, meeting_url, description')
    .eq('user_id', userId)
    .gte('start_time', now.toISOString())
    .ilike('title', `%${query}%`)
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle();

  return data as CalendarEvent | null;
}

/**
 * Build response for meeting picker (when multiple today)
 */
function buildMeetingPickerResponse(meetings: CalendarEvent[]): SlackMessage {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '📅 Select a Meeting', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `You have ${meetings.length} meetings today. Select one for a prep brief:`,
      },
    },
    { type: 'divider' },
  ];

  // Add meeting buttons (max 5)
  meetings.slice(0, 5).forEach(meeting => {
    const startTime = new Date(meeting.start_time);
    const timeStr = startTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${timeStr}* - ${meeting.title}`,
      },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Get Brief', emoji: true },
        action_id: 'meeting_brief_select',
        value: meeting.id,
      },
    });
  });

  return {
    blocks,
    text: `Select a meeting for prep brief - ${meetings.length} meetings today`,
  };
}

/**
 * Quick relevance check: is this meeting business-related?
 * Uses title patterns + CRM contact lookup to classify.
 */
async function checkMeetingRelevance(
  ctx: CommandContext,
  meeting: CalendarEvent
): Promise<'business' | 'personal' | 'unknown'> {
  // Check title against personal patterns first
  if (PERSONAL_PATTERNS.some(p => p.test(meeting.title))) return 'personal';

  // Check title against business patterns
  if (BUSINESS_PATTERNS.some(p => p.test(meeting.title))) return 'business';

  // Check if any attendees are known CRM contacts
  const attendeeEmails = parseAttendeeEmails(meeting.attendee_emails);
  const externalEmails = filterExternalAttendees(attendeeEmails);

  if (externalEmails.length > 0) {
    const contacts = await getContactsByEmail(ctx, externalEmails);
    if (contacts.length > 0) return 'business';
  }

  // No deal, no CRM contacts, no recognizable title → ask user
  return 'unknown';
}

/**
 * Build a Slack response asking the user if they need prep for an unclassified meeting.
 */
function buildRelevanceQuestion(meeting: CalendarEvent): SlackMessage {
  const startTime = new Date(meeting.start_time);
  const timeStr = startTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Research brief ready for *${meeting.title}* at ${timeStr}. 3 talking points prepared.`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Yes, prep this meeting', emoji: true },
            style: 'primary',
            action_id: 'meeting_prep_confirm',
            value: meeting.id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'No thanks, it\'s personal', emoji: true },
            action_id: 'meeting_prep_skip',
            value: meeting.id,
          },
        ],
      },
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: "_I wasn't sure if this is a work meeting — let me know and I'll prep a brief for you._",
        }],
      },
    ],
    text: `Should I prep for "${meeting.title}"?`,
  };
}

/**
 * Build complete meeting prep data
 */
async function buildMeetingPrepData(ctx: CommandContext, meeting: CalendarEvent): Promise<MeetingPrepData> {
  const { supabase, userContext, appUrl } = ctx;
  const userId = userContext.userId;

  // Parse attendee emails
  const attendeeEmails = parseAttendeeEmails(meeting.attendee_emails);
  const externalAttendees = filterExternalAttendees(attendeeEmails);

  // Get contacts
  const contacts = await getContactsByEmail(ctx, externalAttendees);
  const primaryContact = contacts[0];

  // Get company info
  let companyName = extractCompanyFromEmails(externalAttendees);
  let deal: Deal | null = null;
  let lastMeetingNotes: string | null = null;
  let meetingHistory: MeetingPrepData['meetingHistory'] = [];

  if (primaryContact?.company) {
    companyName = primaryContact.company;
  }

  if (companyName) {
    // Get deal
    deal = await getDealForCompany(ctx, companyName, userId);

    // Get meeting history
    meetingHistory = await getMeetingHistory(ctx, companyName, userId);

    // Get last meeting notes
    const lastNotes = await getLastMeetingNotes(ctx, companyName, userId);
    lastMeetingNotes = lastNotes?.notes || null;
  }

  // Get currency settings
  const { currencyCode, currencyLocale } = await getOrgCurrency(supabase, userContext.orgId);

  // Calculate time until meeting
  const meetingStart = new Date(meeting.start_time);
  const now = new Date();
  const minutesUntil = Math.max(0, Math.round((meetingStart.getTime() - now.getTime()) / (1000 * 60)));

  // Build attendees list
  const attendees: MeetingPrepData['attendees'] = contacts.map(c => ({
    name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || 'Unknown',
    title: c.title,
    isDecisionMaker: c.is_decision_maker,
  }));

  // Add any attendees not in contacts
  externalAttendees.forEach(email => {
    if (!contacts.find(c => c.email?.toLowerCase() === email.toLowerCase())) {
      attendees.push({
        name: email.split('@')[0].replace(/[._]/g, ' '),
        title: undefined,
      });
    }
  });

  // Build prep data
  const prepData: MeetingPrepData = {
    meetingId: meeting.id,
    meetingTitle: meeting.title || 'Meeting',
    meetingTime: meetingStart.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
    minutesUntil,
    attendees: attendees.slice(0, 4), // Max 4 attendees to show
    companyName: companyName || undefined,
    companyIndustry: undefined, // Could fetch from companies table
    dealName: deal?.name,
    dealValue: deal?.value,
    dealStage: deal?.deal_stages?.name || (deal?.stage_id ? 'Active' : undefined),
    dealProbability: deal?.probability,
    lastMeetingNotes,
    meetingHistory: meetingHistory.slice(0, 3),
    talkingPoints: generateTalkingPoints(deal, companyName, lastMeetingNotes, meeting.title, externalAttendees.length > 0, contacts.length > 0),
    riskSignals: [], // Could add risk detection
    stageQuestions: deal ? getStageQuestions(deal.deal_stages?.name || deal.stage_id) : undefined,
    meetingUrl: meeting.meeting_url,
    currencyCode,
    currencyLocale,
    appUrl,
  };

  return prepData;
}

/**
 * Parse attendee emails from various formats
 */
function parseAttendeeEmails(attendees: unknown): string[] {
  if (!attendees) return [];
  if (Array.isArray(attendees)) {
    return attendees.map(a => {
      if (typeof a === 'string') return a;
      if (typeof a === 'object' && a !== null) {
        return (a as any).email || (a as any).emailAddress?.address || '';
      }
      return '';
    }).filter(Boolean);
  }
  return [];
}

/**
 * Filter to external attendees only (exclude common internal domains)
 */
function filterExternalAttendees(emails: string[]): string[] {
  const internalDomains = ['use60.com', 'sixty.ai', 'gmail.com'];
  return emails.filter(email => {
    const domain = email.split('@')[1]?.toLowerCase();
    return domain && !internalDomains.includes(domain);
  });
}

/**
 * Extract company name from email domains
 */
function extractCompanyFromEmails(emails: string[]): string | null {
  for (const email of emails) {
    const domain = email.split('@')[1];
    if (domain && !['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].includes(domain.toLowerCase())) {
      const company = domain.split('.')[0];
      return company.charAt(0).toUpperCase() + company.slice(1);
    }
  }
  return null;
}

/**
 * Get contacts by email
 */
async function getContactsByEmail(ctx: CommandContext, emails: string[]): Promise<Contact[]> {
  if (emails.length === 0) return [];

  const { data } = await ctx.supabase
    .from('contacts')
    .select('id, full_name, first_name, last_name, title, email, company, is_decision_maker')
    .in('email', emails.map(e => e.toLowerCase()));

  return (data || []) as Contact[];
}

/**
 * Get deal for company
 */
async function getDealForCompany(ctx: CommandContext, companyName: string, userId: string): Promise<Deal | null> {
  const { data } = await ctx.supabase
    .from('deals')
    .select('id, name, value, stage_id, probability, deal_stages ( name )')
    .or(`company.ilike.%${companyName}%,name.ilike.%${companyName}%`)
    .not('status', 'eq', 'closed_won')
    .not('status', 'eq', 'closed_lost')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data as Deal | null;
}

/**
 * Get meeting history with outcomes
 */
async function getMeetingHistory(
  ctx: CommandContext,
  companyName: string,
  userId: string
): Promise<MeetingPrepData['meetingHistory']> {
  const { data: meetings } = await ctx.supabase
    .from('meetings')
    .select(`
      id,
      title,
      start_time,
      meeting_classifications ( outcome )
    `)
    .ilike('title', `%${companyName}%`)
    .eq('owner_user_id', userId)
    .order('start_time', { ascending: false })
    .limit(5);

  if (!meetings || meetings.length === 0) return [];

  return meetings.map((m: any) => ({
    date: new Date(m.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    title: m.title,
    outcome: m.meeting_classifications?.[0]?.outcome || 'neutral',
  }));
}

/**
 * Get last meeting notes
 */
async function getLastMeetingNotes(ctx: CommandContext, companyName: string, userId: string): Promise<{ notes: string } | null> {
  const { data } = await ctx.supabase
    .from('meetings')
    .select('summary')
    .ilike('title', `%${companyName}%`)
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.summary) return null;
  return { notes: data.summary.substring(0, 300) };
}

/**
 * Get org currency settings
 */
async function getOrgCurrency(
  supabase: any,
  orgId: string | undefined
): Promise<{ currencyCode: string; currencyLocale: string }> {
  if (!orgId) return { currencyCode: 'USD', currencyLocale: 'en-US' };

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

/**
 * Infer meeting purpose from title, deal association, and attendee signals.
 * Checks business relevance first — personal meetings are skipped, unknown meetings prompt a question.
 */
type MeetingPurpose = 'sales' | 'service' | 'internal' | 'personal' | 'unknown' | 'general';

// Titles that are clearly personal / non-business
const PERSONAL_PATTERNS = [
  /\b(doctor|dentist|gp|physio|therapist|counsell?or|optician|vet)\b/i,
  /\b(school run|pickup|drop.?off|childcare|daycare|nursery)\b/i,
  /\b(haircut|salon|barber|gym|yoga|pilates|massage)\b/i,
  /\b(lunch with|dinner with|coffee with|drinks with)\b/i,
  /\b(home visit|house viewing|plumber|electrician|builder)\b/i,
  /\b(birthday|anniversary|wedding|funeral|ceremony)\b/i,
  /\b(flight|hotel|holiday|vacation|leave)\b/i,
  /\bpersonal\b/i,
  /\bblock(ed)?\s*(time|out|calendar)\b/i,
  /\b(focus time|do not disturb|busy|out of office)\b/i,
];

// Titles that are clearly business-related
const BUSINESS_PATTERNS = [
  /\b(demo|discovery|proposal|negotiation|pricing|pitch|close|renewal|qbr)\b/i,
  /\b(pipeline|forecast|deal|revenue|quarter|sprint|standup|retro|planning)\b/i,
  /\b(onboarding|kickoff|kick-off|implementation|training|review)\b/i,
  /\b(interview|candidate|hiring)\b/i,
  /\b(board|investor|advisory|partner)\b/i,
];

function inferMeetingPurpose(
  meetingTitle: string,
  deal: Deal | null,
  hasExternalAttendees: boolean,
  hasKnownContacts?: boolean
): MeetingPurpose {
  const title = meetingTitle.toLowerCase();

  // Step 1: Check if clearly personal — skip entirely
  if (PERSONAL_PATTERNS.some(p => p.test(meetingTitle))) return 'personal';

  // Step 2: Sales signals — deal exists, or title contains sales keywords
  if (deal) return 'sales';
  const salesKeywords = ['demo', 'discovery', 'proposal', 'negotiation', 'pricing', 'pitch', 'close', 'pipeline', 'prospect', 'renewal'];
  if (salesKeywords.some(kw => title.includes(kw))) return 'sales';

  // Step 3: Internal signals — no external attendees, or internal keywords
  const internalKeywords = ['standup', 'stand-up', 'sync', '1:1', 'one-on-one', 'retro', 'sprint', 'planning', 'team', 'all-hands', 'huddle'];
  if (!hasExternalAttendees || internalKeywords.some(kw => title.includes(kw))) return 'internal';

  // Step 4: Service / professional keywords
  const serviceKeywords = ['onboarding', 'kickoff', 'kick-off', 'implementation', 'training', 'support', 'check-in', 'checkin', 'consultation', 'assessment', 'intake', 'welcome', 'introduction', 'orientation'];
  if (serviceKeywords.some(kw => title.includes(kw))) return 'service';

  // Step 5: Known CRM contacts = probably business even without matching keywords
  if (hasKnownContacts) return 'general';

  // Step 6: Title matches business patterns
  if (BUSINESS_PATTERNS.some(p => p.test(meetingTitle))) return 'general';

  // Step 7: Can't determine — ask the user
  return 'unknown';
}

/**
 * Generate talking points adapted to the meeting purpose
 */
function generateTalkingPoints(
  deal: Deal | null,
  companyName: string | null,
  lastNotes: string | null,
  meetingTitle?: string,
  hasExternalAttendees?: boolean,
  hasKnownContacts?: boolean
): string[] {
  const purpose = inferMeetingPurpose(meetingTitle || '', deal, hasExternalAttendees ?? true, hasKnownContacts);
  const points: string[] = [];

  // Personal and unknown meetings return empty — handled by caller
  if (purpose === 'personal' || purpose === 'unknown') {
    return points;
  }

  if (purpose === 'sales') {
    if (deal) {
      points.push(`Review ${deal.name} deal status and next steps`);
      if (deal.probability && deal.probability < 50) {
        points.push('Address concerns and obstacles');
      }
    }
    if (lastNotes) {
      points.push('Follow up on action items from last meeting');
    }
    if (points.length === 0) {
      points.push('Understand their priorities and current challenges');
      points.push('Identify how we can help and agree on next steps');
    }
  } else if (purpose === 'service') {
    points.push('Understand their needs and current situation');
    points.push('Explain what to expect and answer any questions');
    if (lastNotes) {
      points.push('Follow up on items from last conversation');
    } else {
      points.push('Discuss next steps and timeline');
    }
  } else if (purpose === 'internal') {
    points.push('Review progress and any blockers');
    if (lastNotes) {
      points.push('Follow up on action items from last session');
    }
    points.push('Align on priorities and next steps');
  } else {
    // General
    points.push('Build rapport and understand context');
    if (lastNotes) {
      points.push('Follow up on items from last conversation');
    }
    points.push('Clarify goals and agree on next steps');
  }

  return points.slice(0, 3);
}

/**
 * Get stage-specific questions
 */
function getStageQuestions(stageName: string | null | undefined): string[] | undefined {
  if (!stageName) return undefined;

  const stageQuestions: Record<string, string[]> = {
    'discovery': [
      'What are your top priorities for this quarter?',
      'Who else is involved in this decision?',
      'What would success look like for you?',
    ],
    'demo': [
      'What specific challenges are you hoping to solve?',
      'How does this compare to your current process?',
      'What questions do you have about the demo?',
    ],
    'proposal': [
      'Does the proposal address your key requirements?',
      "What's your timeline for making a decision?",
      'Are there any concerns we should discuss?',
    ],
    'negotiation': [
      'What would help move this forward today?',
      'Are there any final obstacles we need to address?',
      'What does your approval process look like?',
    ],
  };

  const normalizedStage = stageName.toLowerCase();
  for (const [key, questions] of Object.entries(stageQuestions)) {
    if (normalizedStage.includes(key)) {
      return questions;
    }
  }

  return undefined;
}
