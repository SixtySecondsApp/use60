// supabase/functions/slack-meeting-prep/index.ts
// Posts Pre-Meeting Prep Cards to Slack 10 mins before meetings
// Supports both manual trigger and cron-based proactive delivery

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { buildMeetingPrepMessage, type MeetingPrepData } from '../_shared/slackBlocks.ts';
import { getAuthContext, requireOrgRole, verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import {
  getSlackOrgSettings,
  getNotificationFeatureSettings,
  getSlackRecipient,
  shouldSendNotification,
  recordNotificationSent,
  deliverToInApp,
  loadProactiveContext,
  type ProactiveContext,
} from '../_shared/proactive/index.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
const appUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://use60.com';

async function getOrgMoneyConfig(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<{ currencyCode: string; currencyLocale: string }> {
  try {
    const { data } = await supabase
      .from('organizations')
      .select('currency_code, currency_locale')
      .eq('id', orgId)
      .single();

    const currencyCode = ((data as any)?.currency_code as string | null | undefined) || 'GBP';
    const currencyLocale =
      ((data as any)?.currency_locale as string | null | undefined) ||
      (currencyCode === 'USD'
        ? 'en-US'
        : currencyCode === 'EUR'
          ? 'en-IE'
          : currencyCode === 'AUD'
            ? 'en-AU'
            : currencyCode === 'CAD'
              ? 'en-CA'
              : 'en-GB');

    return { currencyCode: currencyCode.toUpperCase(), currencyLocale };
  } catch {
    return { currencyCode: 'GBP', currencyLocale: 'en-GB' };
  }
}

interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  user_id: string;
  attendee_emails?: string[];
  meeting_url?: string;
  org_id: string;
}

/**
 * Extract email addresses from the JSONB attendees array.
 * calendar_events stores attendees as [{email, responseStatus, ...}]
 * but the rest of the code expects a flat string[] of emails.
 */
function extractAttendeeEmails(attendees: Array<{ email?: string }> | null): string[] {
  if (!attendees || !Array.isArray(attendees)) return [];
  return attendees
    .map((a) => a.email)
    .filter((e): e is string => !!e);
}

interface Contact {
  id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  email?: string;
  is_decision_maker?: boolean;
}

interface Company {
  id: string;
  name: string;
  industry?: string;
  size?: string;
  stage?: string;
}

interface Deal {
  id: string;
  title: string;
  value: number;
  stage: string;
  win_probability?: number;
  created_at: string;
}

/**
 * Get upcoming meetings (8-12 mins from now for proactive, or custom window)
 */
async function getUpcomingMeetings(
  supabase: ReturnType<typeof createClient>,
  orgId?: string,
  minutesBefore: number = 10,
  windowMinutes: number = 4
): Promise<CalendarEvent[]> {
  const now = new Date();
  const windowStart = new Date(now.getTime() + (minutesBefore - windowMinutes) * 60 * 1000);
  const windowEnd = new Date(now.getTime() + (minutesBefore + windowMinutes) * 60 * 1000);

  let query = supabase
    .from('calendar_events')
    .select('id, title, start_time, user_id, attendees, meeting_url, org_id')
    .gte('start_time', windowStart.toISOString())
    .lte('start_time', windowEnd.toISOString());

  if (orgId) {
    query = query.eq('org_id', orgId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching upcoming meetings:', error);
    return [];
  }

  // Personal email domains — attendees from these are likely family/friends
  const personalDomains = new Set([
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk',
    'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com',
    'icloud.com', 'me.com', 'mac.com', 'aol.com',
    'protonmail.com', 'proton.me', 'fastmail.com',
    'btinternet.com', 'sky.com', 'virginmedia.com',
    'msn.com', 'mail.com', 'zoho.com',
  ]);

  // Title patterns that indicate personal/non-sales calendar events
  const skipPatterns = [
    'birthday', 'bday', 'b-day',
    'holiday', 'bank holiday', 'public holiday',
    'out of office', 'ooo', 'vacation', 'pto',
    'lunch', 'gym', 'dentist', 'doctor', 'hospital', 'scan',
    'focus time', 'do not book', 'blocked',
    'date night', 'anniversary', 'wedding',
    'school run', 'nursery', 'childcare', 'nanny',
    'vaccination', 'vet',
  ];

  // Convert attendees JSONB array to flat email list and filter out noise
  return (data || [])
    .map((row: any) => ({
      ...row,
      attendee_emails: extractAttendeeEmails(row.attendees),
    }))
    .filter((row: any) => {
      const titleLower = (row.title || '').toLowerCase();
      if (skipPatterns.some(p => titleLower.includes(p))) {
        console.log(`[slack-meeting-prep] Skipping calendar noise: "${row.title}"`);
        return false;
      }
      // Must have at least 1 attendee beyond the owner
      if (!row.attendee_emails || row.attendee_emails.length <= 1) {
        console.log(`[slack-meeting-prep] Skipping solo/no-attendee meeting: "${row.title}"`);
        return false;
      }
      // All external attendees are personal email domains — not a prospect meeting
      const selfEmail = row.attendee_emails.find((e: string) => e.includes('@sixtyseconds.'));
      const selfDomain = selfEmail?.split('@')[1]?.toLowerCase() || '';
      const businessAttendees = row.attendee_emails.filter((email: string) => {
        const domain = email.split('@')[1]?.toLowerCase() || '';
        return !personalDomains.has(domain) && domain !== selfDomain;
      });
      if (businessAttendees.length === 0) {
        console.log(`[slack-meeting-prep] Skipping personal/internal meeting: "${row.title}"`);
        return false;
      }
      return true;
    });
}

/**
 * Get contacts by email
 */
async function getContactsByEmail(
  supabase: ReturnType<typeof createClient>,
  emails: string[]
): Promise<Contact[]> {
  if (!emails || emails.length === 0) return [];

  const { data } = await supabase
    .from('contacts')
    .select('id, full_name, first_name, last_name, title, email, is_decision_maker')
    .in('email', emails.map(e => e.toLowerCase()));

  return data || [];
}

/**
 * Get company for contacts
 */
async function getCompanyForContact(
  supabase: ReturnType<typeof createClient>,
  contactId: string
): Promise<Company | null> {
  const { data } = await supabase
    .from('contacts')
    .select(`
      companies:company_id (
        id,
        name,
        industry,
        size,
        stage
      )
    `)
    .eq('id', contactId)
    .single();

  return (data?.companies as Company) || null;
}

/**
 * Get deal for company
 */
async function getDealForCompany(
  supabase: ReturnType<typeof createClient>,
  companyName: string,
  userId: string
): Promise<Deal | null> {
  const { data } = await supabase
    .from('deals')
    .select('id, title, value, stage, win_probability, created_at')
    .ilike('title', `%${companyName}%`)
    .eq('user_id', userId)
    .in('stage', ['sql', 'opportunity', 'verbal'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return data;
}

/**
 * Get last meeting notes
 */
async function getLastMeetingNotes(
  supabase: ReturnType<typeof createClient>,
  companyName: string,
  userId: string
): Promise<{ notes: string; date: string } | null> {
  const { data } = await supabase
    .from('meetings')
    .select('summary, created_at')
    .ilike('title', `%${companyName}%`)
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!data?.summary) return null;

  return {
    notes: data.summary.substring(0, 500),
    date: new Date(data.created_at).toLocaleDateString(),
  };
}

/**
 * Get full meeting history with structured summaries
 */
async function getMeetingHistory(
  supabase: ReturnType<typeof createClient>,
  companyName: string,
  userId: string,
  limit: number = 5
): Promise<Array<{ date: string; title: string; outcome?: 'positive' | 'neutral' | 'negative'; keyTopics?: string[] }>> {
  const { data: meetings } = await supabase
    .from('meetings')
    .select(`
      id,
      title,
      start_time,
      meeting_structured_summaries (
        outcome_signals,
        topics_discussed
      ),
      meeting_classifications (
        outcome
      )
    `)
    .ilike('title', `%${companyName}%`)
    .eq('owner_user_id', userId)
    .order('start_time', { ascending: false })
    .limit(limit);

  if (!meetings || meetings.length === 0) return [];

  return meetings.map((m: any) => {
    const summary = m.meeting_structured_summaries?.[0];
    const classification = m.meeting_classifications?.[0];

    return {
      date: new Date(m.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      title: m.title,
      outcome: classification?.outcome || (summary?.outcome_signals?.overall_sentiment > 60 ? 'positive' : summary?.outcome_signals?.overall_sentiment < 40 ? 'negative' : 'neutral'),
      keyTopics: summary?.topics_discussed?.slice(0, 3) || [],
    };
  });
}

/**
 * Get deal risk signals
 */
async function getDealRiskSignals(
  supabase: ReturnType<typeof createClient>,
  dealId: string
): Promise<Array<{ type: string; severity: 'low' | 'medium' | 'high' | 'critical'; description: string }>> {
  const { data } = await supabase
    .from('deal_risk_signals')
    .select('signal_type, severity, title, description')
    .eq('deal_id', dealId)
    .eq('status', 'active')
    .order('severity', { ascending: false })
    .limit(5);

  if (!data || data.length === 0) return [];

  return data.map((signal: any) => ({
    type: signal.signal_type,
    severity: signal.severity,
    description: signal.title || signal.description,
  }));
}

/**
 * Get previous objections from structured summaries
 */
async function getPreviousObjections(
  supabase: ReturnType<typeof createClient>,
  companyName: string,
  userId: string
): Promise<Array<{ objection: string; resolution?: string; resolved: boolean }>> {
  const { data: meetings } = await supabase
    .from('meetings')
    .select(`
      meeting_structured_summaries (
        objections_raised
      )
    `)
    .ilike('title', `%${companyName}%`)
    .eq('owner_user_id', userId)
    .order('start_time', { ascending: false })
    .limit(10);

  if (!meetings) return [];

  const objections: Array<{ objection: string; resolution?: string; resolved: boolean }> = [];
  const seenObjections = new Set<string>();

  for (const meeting of meetings) {
    const summary = (meeting as any).meeting_structured_summaries?.[0];
    if (summary?.objections_raised) {
      for (const obj of summary.objections_raised) {
        const key = obj.objection?.toLowerCase() || '';
        if (key && !seenObjections.has(key)) {
          seenObjections.add(key);
          objections.push({
            objection: obj.objection,
            resolution: obj.response || obj.resolution,
            resolved: !!obj.resolved || !!obj.response,
          });
        }
      }
    }
  }

  return objections.slice(0, 5);
}

/**
 * Get scorecard template for meeting type
 */
async function getScorecardTemplate(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  dealStage: string | null
): Promise<{ checklistItems: string[]; scriptSteps: Array<{ stepName: string; topics: string[] }> } | null> {
  // Map deal stage to meeting type
  const meetingTypeMap: Record<string, string> = {
    sql: 'discovery',
    opportunity: 'demo',
    verbal: 'negotiation',
    signed: 'closing',
  };

  const meetingType = dealStage ? meetingTypeMap[dealStage.toLowerCase()] || 'general' : 'general';

  const { data } = await supabase
    .from('coaching_scorecard_templates')
    .select('checklist_items, script_flow')
    .eq('org_id', orgId)
    .eq('meeting_type', meetingType)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!data) return null;

  return {
    checklistItems: data.checklist_items?.map((item: any) => item.question) || [],
    scriptSteps: data.script_flow?.map((step: any) => ({
      stepName: step.step_name,
      topics: step.expected_topics || [],
    })) || [],
  };
}

/**
 * Get stage-appropriate questions
 */
function getStageQuestions(dealStage: string | null): string[] {
  const stageQuestions: Record<string, string[]> = {
    sql: [
      'What specific challenges are you trying to solve?',
      'Who else is involved in this decision?',
      'What does your timeline look like?',
      'What happens if you don\'t solve this problem?',
    ],
    opportunity: [
      'What feedback do you have on the proposal?',
      'Are there any concerns we haven\'t addressed?',
      'What would success look like for your team?',
      'Who else needs to see this before you can move forward?',
    ],
    verbal: [
      'What\'s the process for getting final approval?',
      'Are there any remaining blockers we should address?',
      'What does your implementation timeline look like?',
      'Is there anything that could delay the contract?',
    ],
    closing: [
      'When can we expect the signed agreement?',
      'Do you need anything else from us before signing?',
      'What are the next steps for onboarding?',
      'Who should we connect with for implementation?',
    ],
  };

  return stageQuestions[dealStage?.toLowerCase() || ''] || [
    'What are your main priorities for this call?',
    'What questions do you have for us?',
    'What would make this meeting successful for you?',
  ];
}

/**
 * Get recent activities
 */
async function getRecentActivities(
  supabase: ReturnType<typeof createClient>,
  companyName: string,
  userId: string
): Promise<string> {
  const { data } = await supabase
    .from('activities')
    .select('type, notes, created_at')
    .ilike('company_name', `%${companyName}%`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!data || data.length === 0) return '';

  return data.map((a) => {
    const date = new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const notes = a.notes ? `: ${a.notes.substring(0, 50)}` : '';
    return `- ${date}: ${a.type}${notes}`;
  }).join('\n');
}

/**
 * Generate talking points with AI (enhanced with risk signals, objections, and proactive context)
 */
async function generateTalkingPoints(
  meetingTitle: string,
  company: Company | null,
  deal: Deal | null,
  lastMeetingNotes: string | null,
  attendees: string[],
  riskSignals: Array<{ type: string; severity: string; description: string }> = [],
  previousObjections: Array<{ objection: string; resolution?: string; resolved: boolean }> = [],
  proactiveCtx?: ProactiveContext | null
): Promise<string[]> {
  if (!anthropicApiKey) {
    return [
      'Review any previous discussions and follow up on open items',
      'Understand their current priorities and challenges',
      'Identify next steps to move the conversation forward',
    ];
  }

  try {
    // Build enhanced context
    const riskContext = riskSignals.length > 0
      ? `\nRISK SIGNALS TO ADDRESS:\n${riskSignals.slice(0, 3).map(r => `- [${r.severity.toUpperCase()}] ${r.description}`).join('\n')}`
      : '';

    const objectionContext = previousObjections.length > 0
      ? `\nPREVIOUS OBJECTIONS:\n${previousObjections.slice(0, 3).map(o => {
          const status = o.resolved ? '(resolved)' : '(UNRESOLVED)';
          return `- ${status} ${o.objection}${o.resolution ? ` - Response: ${o.resolution}` : ''}`;
        }).join('\n')}`
      : '';

    // Build personalized system prompt
    const userName = proactiveCtx
      ? `${proactiveCtx.user.firstName}${proactiveCtx.user.lastName ? ' ' + proactiveCtx.user.lastName : ''}`
      : 'the sales rep';
    const userTitle = proactiveCtx?.user.title || '';
    const orgName = proactiveCtx?.org.name || '';

    const systemPrompt = proactiveCtx
      ? `You are a sales preparation assistant helping ${userName}${userTitle ? ` (${userTitle}` : ''}${orgName ? ` at ${orgName}` : ''}${userTitle ? ')' : ''} prepare for an upcoming meeting.
Generate 3-4 specific, actionable talking points. Write in second person ("You should...", "Ask about...").
Consider deal risks, previous objections, and the user's role when crafting recommendations.
Return ONLY valid JSON.`
      : 'You are a sales preparation assistant. Generate 3-4 specific, actionable talking points for an upcoming meeting. Consider any deal risks and previous objections when crafting your recommendations. Return ONLY valid JSON.';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        temperature: 0.5,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Generate meeting prep talking points:

MEETING: ${meetingTitle}
${proactiveCtx ? `YOUR ROLE: ${userName}${userTitle ? `, ${userTitle}` : ''}${orgName ? ` at ${orgName}` : ''}` : ''}
COMPANY: ${company?.name || 'Unknown'}
${company?.industry ? `Industry: ${company.industry}` : ''}
${deal ? `DEAL: ${deal.title} - Stage: ${deal.stage} - Value: $${deal.value?.toLocaleString()}` : ''}
ATTENDEES: ${attendees.join(', ')}
${lastMeetingNotes ? `PREVIOUS MEETING NOTES: ${lastMeetingNotes}` : ''}${riskContext}${objectionContext}

Generate specific talking points that:
1. Address any identified risks proactively
2. Handle or prevent unresolved objections
3. Move the deal forward based on current stage
4. Build on previous conversations

Return JSON: { "talkingPoints": ["point1", "point2", "point3", "point4"] }`
        }],
      }),
    });

    if (!response.ok) {
      throw new Error('AI API error');
    }

    const result = await response.json();
    const content = result.content[0]?.text;
    const parsed = JSON.parse(content);
    return parsed.talkingPoints || [];
  } catch (error) {
    console.error('Error generating talking points:', error);
    const fallbackPoints = [
      'Review any previous discussions and follow up on open items',
      'Understand their current priorities and challenges',
      'Identify next steps to move the conversation forward',
    ];

    if (riskSignals.some(r => r.severity === 'high' || r.severity === 'critical')) {
      fallbackPoints.unshift('Address any timeline or budget concerns directly');
    }

    return fallbackPoints.slice(0, 4);
  }
}

/**
 * Get Slack config for org
 */
async function getSlackConfig(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<{ botToken: string; deliveryMethod: string; channelId?: string } | null> {
  const { data: orgSettings } = await supabase
    .from('slack_org_settings')
    .select('bot_access_token')
    .eq('org_id', orgId)
    .eq('is_connected', true)
    .single();

  if (!orgSettings?.bot_access_token) return null;

  const { data: notifSettings } = await supabase
    .from('slack_notification_settings')
    .select('delivery_method, channel_id')
    .eq('org_id', orgId)
    .eq('feature', 'meeting_prep')
    .eq('is_enabled', true)
    .single();

  if (!notifSettings) return null;

  return {
    botToken: orgSettings.bot_access_token,
    deliveryMethod: notifSettings.delivery_method || 'dm',
    channelId: notifSettings.channel_id,
  };
}

/**
 * Get Slack user ID for a Sixty user
 */
async function getSlackUserId(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  sixtyUserId: string
): Promise<string | undefined> {
  const { data } = await supabase
    .from('slack_user_mappings')
    .select('slack_user_id')
    .eq('org_id', orgId)
    .eq('sixty_user_id', sixtyUserId)
    .single();

  return data?.slack_user_id;
}

/**
 * Get user profile
 */
async function getUserProfile(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<{ fullName: string; email: string } | null> {
  const { data } = await supabase
    .from('profiles')
    .select('first_name, last_name, email')
    .eq('id', userId)
    .single();

  if (!data) return null;
  const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ') || data.email || 'User';
  return { fullName, email: data.email || '' };
}

/**
 * Send Slack DM
 */
async function sendSlackDM(
  botToken: string,
  userId: string,
  message: { blocks: unknown[]; text: string }
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const openResponse = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ users: userId }),
  });

  const openResult = await openResponse.json();
  if (!openResult.ok) {
    return { ok: false, error: openResult.error };
  }

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: openResult.channel.id,
      blocks: message.blocks,
      text: message.text,
    }),
  });

  return response.json();
}

/**
 * Post to Slack channel
 */
async function postToSlack(
  botToken: string,
  channel: string,
  message: { blocks: unknown[]; text: string }
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      blocks: message.blocks,
      text: message.text,
    }),
  });

  return response.json();
}

/**
 * Process a single meeting prep
 */
async function processMeetingPrep(
  supabase: ReturnType<typeof createClient>,
  event: CalendarEvent,
  isTest: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if already sent (skip in test mode)
    if (!isTest) {
      const { data: existingSent } = await supabase
        .from('slack_notifications_sent')
        .select('id')
        .eq('org_id', event.org_id)
        .eq('feature', 'meeting_prep')
        .eq('entity_id', event.id)
        .limit(1);

      if (existingSent && existingSent.length > 0) {
        return { success: true }; // Already sent
      }
    }

    // Get Slack config
    const slackConfig = await getSlackConfig(supabase, event.org_id);
    if (!slackConfig) {
      return { success: false, error: 'Slack not configured' };
    }

    // Get user profile
    const userProfile = await getUserProfile(supabase, event.user_id);
    if (!userProfile) {
      return { success: false, error: 'User not found' };
    }

    // Get Slack user ID
    const slackUserId = await getSlackUserId(supabase, event.org_id, event.user_id);

    // Get contacts from attendees
    const contacts = await getContactsByEmail(supabase, event.attendee_emails || []);

    // Get company from first contact
    let company: Company | null = null;
    if (contacts.length > 0) {
      company = await getCompanyForContact(supabase, contacts[0].id);
    }

    // Get deal
    let deal: Deal | null = null;
    if (company) {
      deal = await getDealForCompany(supabase, company.name, event.user_id);
    }

    // Get last meeting notes (fallback)
    let lastMeetingData: { notes: string; date: string } | null = null;
    if (company) {
      lastMeetingData = await getLastMeetingNotes(supabase, company.name, event.user_id);
    }

    // Get recent activities
    let recentActivities = '';
    if (company) {
      recentActivities = await getRecentActivities(supabase, company.name, event.user_id);
    }

    // Load proactive context for personalized talking points
    let proactiveCtx: ProactiveContext | null = null;
    try {
      proactiveCtx = await loadProactiveContext(supabase, event.org_id, event.user_id);
    } catch (e) {
      console.warn('[slack-meeting-prep] Failed to load proactive context:', (e as any)?.message);
    }

    // ==========================================
    // ENHANCED DATA: Meeting History, Risks, Objections, Templates
    // ==========================================

    // Get full meeting history with structured summaries
    let meetingHistory: Array<{ date: string; title: string; outcome?: 'positive' | 'neutral' | 'negative'; keyTopics?: string[] }> = [];
    if (company) {
      meetingHistory = await getMeetingHistory(supabase, company.name, event.user_id, 5);
    }

    // Get deal risk signals
    let riskSignals: Array<{ type: string; severity: 'low' | 'medium' | 'high' | 'critical'; description: string }> = [];
    if (deal) {
      riskSignals = await getDealRiskSignals(supabase, deal.id);
    }

    // Get previous objections
    let previousObjections: Array<{ objection: string; resolution?: string; resolved: boolean }> = [];
    if (company) {
      previousObjections = await getPreviousObjections(supabase, company.name, event.user_id);
    }

    // Get scorecard template for checklist/script reminders
    let checklistReminders: string[] = [];
    let scriptSteps: Array<{ stepName: string; topics: string[] }> = [];
    const template = await getScorecardTemplate(supabase, event.org_id, deal?.stage || null);
    if (template) {
      checklistReminders = template.checklistItems;
      scriptSteps = template.scriptSteps;
    }

    // Get stage-appropriate questions
    const stageQuestions = getStageQuestions(deal?.stage || null);

    // ==========================================

    // Generate talking points with enhanced context + proactive personalization
    const talkingPoints = await generateTalkingPoints(
      event.title,
      company,
      deal,
      lastMeetingData?.notes || null,
      contacts.map(c => c.full_name || `${c.first_name} ${c.last_name}`.trim() || c.email || 'Unknown'),
      riskSignals,
      previousObjections,
      proactiveCtx
    );

    // Calculate days in pipeline
    let daysInPipeline: number | undefined;
    if (deal) {
      daysInPipeline = Math.ceil((Date.now() - new Date(deal.created_at).getTime()) / (1000 * 60 * 60 * 24));
    }

    const money = await getOrgMoneyConfig(supabase, event.org_id);

    // Build prep data with enhanced fields
    const prepData: MeetingPrepData = {
      meetingTitle: event.title,
      meetingId: event.id,
      userName: userProfile.fullName,
      slackUserId,
      currencyCode: money.currencyCode,
      currencyLocale: money.currencyLocale,
      attendees: contacts.map((c) => ({
        name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown',
        title: c.title,
        isDecisionMaker: c.is_decision_maker,
      })),
      company: company || { name: 'Unknown Company' },
      deal: deal ? {
        name: deal.title,
        id: deal.id,
        value: deal.value,
        stage: deal.stage,
        winProbability: deal.win_probability,
        daysInPipeline,
      } : undefined,
      lastMeetingNotes: lastMeetingData?.notes,
      lastMeetingDate: lastMeetingData?.date,
      talkingPoints,
      meetingUrl: event.meeting_url || undefined,
      appUrl,
      // Enhanced data
      meetingHistory: meetingHistory.length > 0 ? meetingHistory : undefined,
      riskSignals: riskSignals.length > 0 ? riskSignals : undefined,
      previousObjections: previousObjections.length > 0 ? previousObjections : undefined,
      stageQuestions: stageQuestions.length > 0 ? stageQuestions : undefined,
      checklistReminders: checklistReminders.length > 0 ? checklistReminders : undefined,
      scriptSteps: scriptSteps.length > 0 ? scriptSteps : undefined,
    };

    // Build and send message
    const message = buildMeetingPrepMessage(prepData);

    let result: { ok: boolean; ts?: string; error?: string };
    let recipientId: string;

    if (slackConfig.deliveryMethod === 'dm' && slackUserId) {
      result = await sendSlackDM(slackConfig.botToken, slackUserId, message);
      recipientId = slackUserId;
    } else if (slackConfig.channelId) {
      result = await postToSlack(slackConfig.botToken, slackConfig.channelId, message);
      recipientId = slackConfig.channelId;
    } else {
      return { success: false, error: 'No delivery target' };
    }

    if (!result.ok) {
      return { success: false, error: result.error };
    }

    // Record sent notification (skip in test mode to allow repeated testing)
    if (!isTest) {
      await supabase.from('slack_notifications_sent').insert({
        org_id: event.org_id,
        feature: 'meeting_prep',
        entity_type: 'prep',
        entity_id: event.id,
        recipient_type: slackConfig.deliveryMethod === 'dm' ? 'user' : 'channel',
        recipient_id: recipientId,
        slack_ts: result.ts,
        slack_channel_id: recipientId,
      });
    }

    // Mirror to in-app notifications (best-effort)
    try {
      await deliverToInApp(supabase, {
        type: 'meeting_prep',
        orgId: event.org_id,
        recipientUserId: event.user_id,
        recipientSlackUserId: slackUserId || undefined,
        title: `Meeting soon: ${event.title || 'Upcoming meeting'}`,
        message: 'Your meeting prep is ready — talking points, risks, and reminders inside.',
        actionUrl: '/calendar',
        inAppCategory: 'meeting',
        inAppType: 'info',
        entityType: 'calendar_event',
        entityId: event.id,
        metadata: {
          eventId: event.id,
          startTime: event.start_time,
          source: 'slack_meeting_prep',
        },
      });
    } catch (e) {
      console.warn('[slack-meeting-prep] Failed to create in-app notification:', (e as any)?.message || e);
    }

    return { success: true };
  } catch (error) {
    console.error('Error processing meeting prep:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a lightweight 30-min heads-up DM before a meeting.
 * The full briefing arrives at the 10-min mark.
 */
async function send30MinHeadsUp(
  supabase: ReturnType<typeof createClient>,
  meeting: CalendarEvent
): Promise<void> {
  try {
    const slackConfig = await getSlackConfig(supabase, meeting.org_id);
    if (!slackConfig) return;

    const userProfile = await getUserProfile(supabase, meeting.user_id);
    if (!userProfile) return;

    const slackUserId = await getSlackUserId(supabase, meeting.org_id, meeting.user_id);
    if (!slackUserId) return;

    // Try to find a company for context
    const contacts = await getContactsByEmail(supabase, meeting.attendee_emails || []);
    let company: Company | null = null;
    if (contacts.length > 0) {
      company = await getCompanyForContact(supabase, contacts[0].id);
    }

    const meetingTime = new Date(meeting.start_time).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const blocks: unknown[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'Meeting in 30 minutes', emoji: false },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `*${meeting.title}* at ${meetingTime}` },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Your full briefing will arrive in ~20 min. Here\u2019s a quick heads up:',
        },
      },
    ];

    if (company) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Company:* ${company.name}${company.industry ? ` | ${company.industry}` : ''}`,
        },
      });
    }

    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Get Full Briefing Now', emoji: false },
          action_id: 'prep_briefing::trigger_early',
          value: meeting.id,
          style: 'primary',
        },
      ],
    });

    const result = await sendSlackDM(slackConfig.botToken, slackUserId, {
      blocks,
      text: `Meeting in 30 minutes: ${meeting.title}`,
    });

    if (result.ok) {
      await supabase.from('slack_notifications_sent').insert({
        org_id: meeting.org_id,
        feature: 'meeting_prep_30min',
        entity_type: 'prep',
        entity_id: meeting.id,
        recipient_type: 'user',
        recipient_id: slackUserId,
        slack_ts: result.ts,
        slack_channel_id: slackUserId,
      });
      console.log(`[slack-meeting-prep] 30-min heads-up sent for "${meeting.title}"`);
    } else {
      console.error(`[slack-meeting-prep] 30-min heads-up failed for "${meeting.title}":`, result.error);
    }
  } catch (error) {
    console.error(`[slack-meeting-prep] Error sending 30-min heads-up for "${meeting.title}":`, error);
  }
}

/**
 * Resurface snoozed prep briefings whose snooze window has elapsed.
 */
async function resurfaceSnoozedBriefings(
  supabase: ReturnType<typeof createClient>
): Promise<void> {
  try {
    const { data: snoozedItems, error } = await supabase
      .from('slack_snoozed_items')
      .select('id, org_id, user_id, entity_id, entity_type, original_context, snooze_until')
      .eq('entity_type', 'prep_briefing')
      .lte('snooze_until', new Date().toISOString())
      .is('resurfaced_at', null);

    if (error) {
      console.error('[slack-meeting-prep] Error fetching snoozed items:', error);
      return;
    }
    if (!snoozedItems || snoozedItems.length === 0) return;

    console.log(`[slack-meeting-prep] Resurfacing ${snoozedItems.length} snoozed briefings`);

    for (const item of snoozedItems) {
      try {
        const slackConfig = await getSlackConfig(supabase, item.org_id);
        if (!slackConfig) continue;

        const slackUserId = await getSlackUserId(supabase, item.org_id, item.user_id);
        if (!slackUserId) continue;

        const ctx = (item.original_context || {}) as Record<string, unknown>;
        const meetingTitle = (ctx.meetingTitle as string) || 'Upcoming meeting';
        const meetingTime = (ctx.meetingTime as string) || '';

        // Try to get meeting URL from calendar_events
        let meetingUrl: string | undefined;
        if (item.entity_id) {
          const { data: calEvent } = await supabase
            .from('calendar_events')
            .select('meeting_url')
            .eq('id', item.entity_id)
            .maybeSingle();
          meetingUrl = calEvent?.meeting_url || undefined;
        }

        const blocks: unknown[] = [
          {
            type: 'header',
            text: { type: 'plain_text', text: 'Reminder: Meeting coming up', emoji: false },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `*${meetingTitle}*${meetingTime ? ` at ${meetingTime}` : ''}`,
              },
            ],
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Your meeting is starting soon. Here are the key points:',
            },
          },
        ];

        const actionElements: unknown[] = [];
        if (meetingUrl) {
          actionElements.push({
            type: 'button',
            text: { type: 'plain_text', text: 'Join Meeting', emoji: false },
            url: meetingUrl,
            action_id: 'prep_briefing::join_meeting',
          });
        }
        actionElements.push({
          type: 'button',
          text: { type: 'plain_text', text: 'View Full Briefing', emoji: false },
          url: `${appUrl}/calendar`,
          action_id: 'prep_briefing::view_briefing',
        });

        blocks.push({ type: 'actions', elements: actionElements });

        const result = await sendSlackDM(slackConfig.botToken, slackUserId, {
          blocks,
          text: `Reminder: ${meetingTitle} is coming up`,
        });

        if (result.ok) {
          await supabase
            .from('slack_snoozed_items')
            .update({ resurfaced_at: new Date().toISOString() })
            .eq('id', item.id);
          console.log(`[slack-meeting-prep] Resurfaced snoozed briefing for "${meetingTitle}"`);
        }
      } catch (innerErr) {
        console.error(`[slack-meeting-prep] Error resurfacing snoozed item ${item.id}:`, innerErr);
      }
    }
  } catch (error) {
    console.error('[slack-meeting-prep] Error in resurfaceSnoozedBriefings:', error);
  }
}

/**
 * Check for meetings that ended ~1 hour ago with no recording.
 * Sends a post-meeting check-in via Slack DM.
 */
async function checkPostMeetingRecordings(
  supabase: ReturnType<typeof createClient>
): Promise<void> {
  try {
    const now = new Date();
    // Meetings that started 60-75 min ago (should have ended by now)
    const windowStart = new Date(now.getTime() - 75 * 60 * 1000);
    const windowEnd = new Date(now.getTime() - 60 * 60 * 1000);

    const personalDomains = new Set([
      'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk',
      'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com',
      'icloud.com', 'me.com', 'mac.com', 'aol.com',
      'protonmail.com', 'proton.me', 'fastmail.com',
      'btinternet.com', 'sky.com', 'virginmedia.com',
      'msn.com', 'mail.com', 'zoho.com',
    ]);

    const { data: recentMeetings, error } = await supabase
      .from('calendar_events')
      .select('id, title, start_time, user_id, attendees, meeting_url, org_id')
      .gte('start_time', windowStart.toISOString())
      .lte('start_time', windowEnd.toISOString());

    if (error) {
      console.error('[slack-meeting-prep] Error fetching post-meeting events:', error);
      return;
    }
    if (!recentMeetings || recentMeetings.length === 0) return;

    // Filter to external meetings only (same logic as getUpcomingMeetings)
    const externalMeetings = recentMeetings
      .map((row: any) => ({
        ...row,
        attendee_emails: extractAttendeeEmails(row.attendees),
      }))
      .filter((row: any) => {
        if (!row.attendee_emails || row.attendee_emails.length <= 1) return false;
        const selfEmail = row.attendee_emails.find((e: string) => e.includes('@sixtyseconds.'));
        const selfDomain = selfEmail?.split('@')[1]?.toLowerCase() || '';
        const businessAttendees = row.attendee_emails.filter((email: string) => {
          const domain = email.split('@')[1]?.toLowerCase() || '';
          return !personalDomains.has(domain) && domain !== selfDomain;
        });
        return businessAttendees.length > 0;
      }) as CalendarEvent[];

    if (externalMeetings.length === 0) return;

    console.log(`[slack-meeting-prep] Checking ${externalMeetings.length} meetings for post-meeting follow-up`);

    for (const meeting of externalMeetings) {
      try {
        // Check if already sent
        const { data: existing } = await supabase
          .from('slack_notifications_sent')
          .select('id')
          .eq('org_id', meeting.org_id)
          .eq('feature', 'post_meeting_check')
          .eq('entity_id', meeting.id)
          .limit(1);

        if (existing && existing.length > 0) continue;

        // Check if a recording exists via the meetings table
        const { data: meetingRecord } = await supabase
          .from('meetings')
          .select('id, recording_url')
          .eq('calendar_event_id', meeting.id)
          .maybeSingle();

        let hasRecording = !!meetingRecord?.recording_url;

        // Also check the recordings table if we found a meeting row
        if (!hasRecording && meetingRecord) {
          const { data: recording } = await supabase
            .from('recordings')
            .select('id')
            .eq('meeting_id', meetingRecord.id)
            .limit(1);
          hasRecording = !!(recording && recording.length > 0);
        }

        // If there IS a recording, skip — no need to ask
        if (hasRecording) continue;

        // No recording found — send check-in
        const slackConfig = await getSlackConfig(supabase, meeting.org_id);
        if (!slackConfig) continue;

        const slackUserId = await getSlackUserId(supabase, meeting.org_id, meeting.user_id);
        if (!slackUserId) continue;

        const meetingTime = new Date(meeting.start_time).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        const blocks: unknown[] = [
          {
            type: 'header',
            text: { type: 'plain_text', text: 'How did your meeting go?', emoji: false },
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: `*${meeting.title}* at ${meetingTime}` },
            ],
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'I noticed there\u2019s no recording for this meeting. How did it go?',
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Went Well', emoji: false },
                action_id: 'prep_briefing::post_meeting_went_well',
                value: meeting.id,
                style: 'primary',
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'No-Show', emoji: false },
                action_id: 'prep_briefing::post_meeting_no_show',
                value: meeting.id,
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'They Cancelled', emoji: false },
                action_id: 'prep_briefing::post_meeting_cancelled',
                value: meeting.id,
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Technical Issue', emoji: false },
                action_id: 'prep_briefing::post_meeting_technical_issue',
                value: meeting.id,
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Forgot to Record', emoji: false },
                action_id: 'prep_briefing::post_meeting_forgot_to_record',
                value: meeting.id,
              },
            ],
          },
        ];

        const result = await sendSlackDM(slackConfig.botToken, slackUserId, {
          blocks,
          text: `How did your meeting go? ${meeting.title}`,
        });

        if (result.ok) {
          await supabase.from('slack_notifications_sent').insert({
            org_id: meeting.org_id,
            feature: 'post_meeting_check',
            entity_type: 'prep',
            entity_id: meeting.id,
            recipient_type: 'user',
            recipient_id: slackUserId,
            slack_ts: result.ts,
            slack_channel_id: slackUserId,
          });
          console.log(`[slack-meeting-prep] Post-meeting check sent for "${meeting.title}"`);
        }
      } catch (innerErr) {
        console.error(`[slack-meeting-prep] Error processing post-meeting for "${meeting.title}":`, innerErr);
      }
    }
  } catch (error) {
    console.error('[slack-meeting-prep] Error in checkPostMeetingRecordings:', error);
  }
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const cronSecret = Deno.env.get('CRON_SECRET') || undefined;
    const auth = await getAuthContext(req, supabase, supabaseServiceKey, { cronSecret });

    // Check for manual trigger with specific event
    let targetEventId: string | null = null;
    let targetMeetingId: string | null = null;
    let targetOrgId: string | null = null;
    let isTest = false;

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      targetEventId = body.eventId || null;
      // Also accept meetingId for backwards compatibility with test UI
      targetMeetingId = body.meetingId || null;
      targetOrgId = body.orgId || null;
      isTest = body.isTest === true;
    }

    // External release hardening:
    // - User-auth calls MUST target a specific org or event.
    // - Only org admins (or platform admins) can manually trigger.
    if (auth.mode === 'user') {
      if (!targetEventId && !targetMeetingId && !targetOrgId) {
        return new Response(
          JSON.stringify({ error: 'orgId, eventId, or meetingId required for manual trigger' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (targetOrgId && auth.userId && !auth.isPlatformAdmin) {
        await requireOrgRole(supabase, targetOrgId, auth.userId, ['owner', 'admin']);
      }
    }

    let meetings: CalendarEvent[];

    if (targetEventId) {
      // Process specific calendar event
      const { data } = await supabase
        .from('calendar_events')
        .select('id, title, start_time, user_id, attendees, meeting_url, org_id')
        .eq('id', targetEventId)
        .single();

      meetings = data ? [{
        ...data,
        attendee_emails: extractAttendeeEmails((data as any).attendees),
      }] : [];
    } else if (targetMeetingId && isTest) {
      // Test mode: Look up meeting from meetings table and create a virtual calendar event
      // This allows testing with meetings that don't have corresponding calendar events
      const { data: meeting } = await supabase
        .from('meetings')
        .select('id, title, meeting_start, owner_user_id, owner_email, org_id, attendee_emails, meeting_url, company_id')
        .eq('id', targetMeetingId)
        .single();

      if (meeting) {
        // Get company name if available
        let companyName: string | null = null;
        if (meeting.company_id) {
          const { data: company } = await supabase
            .from('companies')
            .select('name')
            .eq('id', meeting.company_id)
            .single();
          companyName = company?.name || null;
        }

        // Create a virtual calendar event from the meeting
        const virtualEvent: CalendarEvent = {
          id: meeting.id,
          title: meeting.title || companyName || 'Meeting',
          start_time: meeting.meeting_start,
          user_id: meeting.owner_user_id,
          attendee_emails: meeting.attendee_emails || [],
          meeting_url: meeting.meeting_url || undefined,
          org_id: meeting.org_id || targetOrgId!,
        };
        meetings = [virtualEvent];
      } else {
        meetings = [];
      }
    } else {
      // Get upcoming meetings (8-12 mins from now for proactive 10-min nudge)
      // Check org settings for custom minutes_before if available
      let minutesBefore = 10;
      if (targetOrgId) {
        const settings = await getNotificationFeatureSettings(
          supabase,
          targetOrgId,
          'meeting_prep'
        );
        if (settings?.thresholds?.minutes_before) {
          minutesBefore = settings.thresholds.minutes_before as number;
        }
      }
      meetings = await getUpcomingMeetings(supabase, targetOrgId || undefined, minutesBefore, 4);
    }

    // Process 10-min meetings (the existing pass)
    let results: Array<{ success: boolean; error?: string }> = [];
    if (meetings.length > 0) {
      results = await Promise.all(
        meetings.map((meeting) => processMeetingPrep(supabase, meeting, isTest))
      );

      const successCount = results.filter((r) => r.success).length;
      const failedCount = results.filter((r) => !r.success).length;
      console.log(`Meeting prep sent: ${successCount} success, ${failedCount} failed`);
    }

    // --- 30-min-before early delivery ---
    if (!targetEventId && !targetMeetingId) {
      // Check for meetings 25-35 min from now (30-min window)
      const earlyMeetings = await getUpcomingMeetings(supabase, targetOrgId || undefined, 30, 5);

      // Filter out any already sent (using 'meeting_prep_30min' feature key)
      const newEarlyMeetings: CalendarEvent[] = [];
      for (const m of earlyMeetings) {
        const { data: existing } = await supabase
          .from('slack_notifications_sent')
          .select('id')
          .eq('org_id', m.org_id)
          .eq('feature', 'meeting_prep_30min')
          .eq('entity_id', m.id)
          .limit(1);

        if (!existing || existing.length === 0) {
          newEarlyMeetings.push(m);
        }
      }

      if (newEarlyMeetings.length > 0) {
        console.log(`[slack-meeting-prep] Processing ${newEarlyMeetings.length} meetings for 30-min-before delivery`);
        for (const meeting of newEarlyMeetings) {
          // Send a lightweight heads-up (not the full prep — that comes at 10 min)
          await send30MinHeadsUp(supabase, meeting);
        }
      }
    }

    // --- Resurface snoozed prep briefings ---
    if (!targetEventId && !targetMeetingId) {
      await resurfaceSnoozedBriefings(supabase);
    }

    // --- Post-meeting follow-up (1 hour after ended meetings) ---
    if (!targetEventId && !targetMeetingId) {
      await checkPostMeetingRecordings(supabase);
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: meetings.length,
        successCount: results.filter((r) => r.success).length,
        failedCount: results.filter((r) => !r.success).length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in meeting prep:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
