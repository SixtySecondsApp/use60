// supabase/functions/proactive-simulate/index.ts
// Platform admin tool: simulate proactive notifications (Slack + in-app) for a user.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { getAuthContext } from '../_shared/edgeAuth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const appUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://app.use60.com';
const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

type ProactiveSimulateFeature =
  | 'morning_brief'
  | 'sales_assistant_digest'
  | 'pre_meeting_nudge'
  | 'post_call_summary'
  | 'stale_deal_alert'
  | 'email_reply_alert'
  | 'hitl_followup_email'
  | 'ai_smart_suggestion'
  | 'orchestrator_smoke_test';

type NotificationCategory = 'workflow' | 'deal' | 'task' | 'meeting' | 'system' | 'team';
type NotificationType = 'info' | 'success' | 'warning' | 'error';

type SimulateRequest = {
  orgId: string;
  feature: ProactiveSimulateFeature;
  targetUserId?: string;
  sendSlack?: boolean;
  createInApp?: boolean;
  dryRun?: boolean;
  /** When false, uses real data from database + AI enrichment. Default true = hardcoded demo data. */
  simulationMode?: boolean;
  /** Optional entity IDs for real data mode */
  entityIds?: {
    dealId?: string;
    contactId?: string;
    meetingId?: string;
    emailThreadId?: string;
    emailId?: string;
  };
  /** For orchestrator_smoke_test: which sequences to test (default: all 9) */
  sequences?: string[];
};

// ============================================================================
// Deep Link Helpers
// ============================================================================

/** Generate Slack mrkdwn clickable link */
function link(type: 'deal' | 'contact' | 'meeting' | 'task' | 'calendar' | 'pipeline' | 'dashboard', id?: string): string {
  const paths: Record<string, string> = {
    deal: `/deals/${id}`,
    contact: `/contacts/${id}`,
    meeting: `/meetings/${id}`,
    task: `/tasks/${id}`,
    calendar: '/calendar',
    pipeline: '/pipeline',
    dashboard: '/dashboard',
  };
  return `${appUrl}${paths[type] || '/dashboard'}`;
}

/** Format a clickable entity link in Slack mrkdwn */
function mrkdwnLink(label: string, type: 'deal' | 'contact' | 'meeting' | 'task' | 'calendar' | 'pipeline' | 'dashboard', id?: string): string {
  return `<${link(type, id)}|${label}>`;
}

/** Format currency value */
function formatCurrency(value: number, currencyCode = 'GBP', locale = 'en-GB'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode, maximumFractionDigits: 0 }).format(value);
}

// ============================================================================
// AI Integration (Gemini Flash)
// ============================================================================

interface GeminiResponse {
  success: boolean;
  content?: string;
  error?: string;
}

/**
 * Call Gemini API for AI enrichment
 */
async function callGemini(prompt: string, systemInstructions?: string): Promise<GeminiResponse> {
  if (!geminiApiKey) {
    return { success: false, error: 'GEMINI_API_KEY not configured' };
  }

  try {
    const requestBody: any = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    };

    if (systemInstructions) {
      requestBody.systemInstruction = { parts: [{ text: systemInstructions }] };
    }

    const response = await fetch(
      `${GEMINI_API_BASE}/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Gemini API error: ${errorText}` };
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      return { success: false, error: 'No content in Gemini response' };
    }

    return { success: true, content };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown Gemini error' };
  }
}

/**
 * Parse JSON from AI response (handles markdown code blocks)
 */
function parseAIJson<T>(content: string): T | null {
  try {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

// ============================================================================
// Pre-Meeting Nudge Data Fetching & AI Enrichment
// ============================================================================

interface PreMeetingNudgeData {
  meeting: {
    id: string;
    title: string;
    startTime: string;
    minutesUntil: number;
  };
  contact?: {
    id: string;
    name: string;
    title?: string;
    email?: string;
    linkedinUrl?: string;
  };
  company?: {
    id: string;
    name: string;
    industry?: string;
    size?: string;
    website?: string;
    description?: string;
  };
  deal?: {
    id: string;
    name: string;
    value: number;
    stage: string;
    healthStatus?: string;
  };
  previousMeetings: Array<{
    title: string;
    date: string;
    outcome?: string;
  }>;
  aiEnrichment?: {
    prospectIntel: string;
    companyContext: string;
    talkingPoints: string[];
    riskFactors: string[];
    suggestedOpener: string;
  };
}

async function fetchPreMeetingNudgeData(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userId: string,
  meetingId?: string
): Promise<PreMeetingNudgeData | null> {
  const now = new Date();

  // If no meeting ID provided, find the next upcoming meeting
  let meetingQuery;
  if (meetingId) {
    meetingQuery = supabase
      .from('calendar_events')
      .select(`
        id, title, start_time, end_time,
        contact_id, deal_id,
        contacts:contact_id (id, full_name, title, email, linkedin_url, company_id,
          companies:company_id (id, name, industry, employee_count, website, description)
        ),
        deals:deal_id (id, title, value, stage, health_status)
      `)
      .eq('id', meetingId)
      .single();
  } else {
    // Find next upcoming meeting (any time in the future) for testing flexibility
    meetingQuery = supabase
      .from('calendar_events')
      .select(`
        id, title, start_time, end_time,
        contact_id, deal_id,
        contacts:contact_id (id, full_name, title, email, linkedin_url, company_id,
          companies:company_id (id, name, industry, employee_count, website, description)
        ),
        deals:deal_id (id, title, value, stage, health_status)
      `)
      .eq('user_id', userId)
      .gte('start_time', now.toISOString())
      .gt('attendees_count', 1)
      .order('start_time', { ascending: true })
      .limit(1)
      .maybeSingle();
  }

  const { data: meeting } = await meetingQuery;
  if (!meeting) return null;

  const contact = meeting.contacts as any;
  const company = contact?.companies as any;
  const deal = meeting.deals as any;

  const startTime = new Date(meeting.start_time);
  const minutesUntil = Math.round((startTime.getTime() - now.getTime()) / (60 * 1000));

  // Get previous meetings with this contact/company
  const previousMeetingsQuery = contact?.id
    ? supabase
        .from('calendar_events')
        .select('title, start_time')
        .eq('user_id', userId)
        .eq('contact_id', contact.id)
        .lt('start_time', now.toISOString())
        .order('start_time', { ascending: false })
        .limit(3)
    : supabase
        .from('calendar_events')
        .select('title, start_time')
        .eq('id', 'impossible-match'); // No results if no contact

  const { data: previousMeetings } = await previousMeetingsQuery;

  return {
    meeting: {
      id: meeting.id,
      title: meeting.title,
      startTime: meeting.start_time,
      minutesUntil,
    },
    contact: contact ? {
      id: contact.id,
      name: contact.full_name,
      title: contact.title,
      email: contact.email,
      linkedinUrl: contact.linkedin_url,
    } : undefined,
    company: company ? {
      id: company.id,
      name: company.name,
      industry: company.industry,
      size: company.employee_count,
      website: company.website,
      description: company.description,
    } : undefined,
    deal: deal ? {
      id: deal.id,
      name: deal.title,
      value: deal.value || 0,
      stage: deal.stage,
      healthStatus: deal.health_status,
    } : undefined,
    previousMeetings: (previousMeetings || []).map((m: any) => ({
      title: m.title,
      date: new Date(m.start_time).toLocaleDateString(),
    })),
  };
}

/**
 * Enrich pre-meeting data with AI-generated insights
 */
async function enrichPreMeetingWithAI(data: PreMeetingNudgeData): Promise<PreMeetingNudgeData> {
  const systemPrompt = `You are 60, a smart AI sales assistant. Your job is to help sales reps prepare for meetings by providing concise, actionable intelligence.

Be direct, specific, and helpful. Don't be generic or robotic. Sound like a knowledgeable colleague who's done their homework.`;

  const context = `
MEETING: "${data.meeting.title}" starting in ${data.meeting.minutesUntil} minutes

${data.contact ? `CONTACT:
- Name: ${data.contact.name}
- Title: ${data.contact.title || 'Unknown'}
- Email: ${data.contact.email || 'N/A'}
- LinkedIn: ${data.contact.linkedinUrl ? 'Available' : 'Not available'}` : 'No contact linked to this meeting.'}

${data.company ? `COMPANY:
- Name: ${data.company.name}
- Industry: ${data.company.industry || 'Unknown'}
- Size: ${data.company.size || 'Unknown'}
- Website: ${data.company.website || 'N/A'}
- Description: ${data.company.description || 'No description available'}` : ''}

${data.deal ? `DEAL:
- Name: ${data.deal.name}
- Value: ${data.deal.value ? formatCurrency(data.deal.value) : 'Not specified'}
- Stage: ${data.deal.stage}
- Health: ${data.deal.healthStatus || 'Unknown'}` : 'No deal linked.'}

PREVIOUS MEETINGS WITH THIS CONTACT: ${data.previousMeetings.length > 0
  ? data.previousMeetings.map(m => `${m.title} (${m.date})`).join(', ')
  : 'None recorded'}`;

  const prompt = `Based on this meeting context, provide pre-meeting intelligence.

${context}

Return a JSON object with:
- prospectIntel: 1-2 sentences about who this person is and what to know about them
- companyContext: 1-2 sentences about the company and why they might be a good fit
- talkingPoints: Array of 3-4 specific, actionable talking points for this meeting
- riskFactors: Array of 0-2 potential concerns or objections to be prepared for
- suggestedOpener: A natural conversation starter for this specific meeting

Be specific to this meeting, not generic. If limited info is available, say so briefly and focus on what IS known.

RESPOND ONLY WITH VALID JSON.`;

  const result = await callGemini(prompt, systemPrompt);

  if (result.success && result.content) {
    const aiData = parseAIJson<{
      prospectIntel: string;
      companyContext: string;
      talkingPoints: string[];
      riskFactors: string[];
      suggestedOpener: string;
    }>(result.content);

    if (aiData) {
      data.aiEnrichment = aiData;
    }
  }

  // Provide fallback if AI fails
  if (!data.aiEnrichment) {
    data.aiEnrichment = {
      prospectIntel: data.contact
        ? `Meeting with ${data.contact.name}${data.contact.title ? `, ${data.contact.title}` : ''}.`
        : 'Review meeting invite for attendee details.',
      companyContext: data.company
        ? `${data.company.name} operates in ${data.company.industry || 'their industry'}.`
        : 'Research the company before the call.',
      talkingPoints: [
        'Recap previous conversations and commitments',
        'Understand current priorities and challenges',
        'Identify clear next steps',
      ],
      riskFactors: data.deal?.healthStatus === 'at_risk'
        ? ['Deal marked as at-risk - address concerns directly']
        : [],
      suggestedOpener: 'Thanks for making time today. I wanted to pick up where we left off...',
    };
  }

  return data;
}

/**
 * Build Pre-Meeting Nudge Slack blocks with real data + AI enrichment
 */
function buildRealPreMeetingNudgeBlocks(data: PreMeetingNudgeData): { text: string; blocks: any[] } {
  const blocks: any[] = [];
  const ai = data.aiEnrichment!;

  // Header
  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: `📅 Meeting in ${data.meeting.minutesUntil} min: ${data.meeting.title}`, emoji: true },
  });

  // Context
  if (data.contact || data.company) {
    const contextParts: string[] = [];
    if (data.contact) {
      contextParts.push(`with ${mrkdwnLink(data.contact.name, 'contact', data.contact.id)}`);
      if (data.contact.title) contextParts.push(`(${data.contact.title})`);
    }
    if (data.company) {
      contextParts.push(`at ${data.company.name}`);
    }
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: contextParts.join(' ') } });
  }

  blocks.push({ type: 'divider' });

  // AI Intel Section
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*🎯 Quick Intel*\n${ai.prospectIntel}\n\n${ai.companyContext}`,
    },
  });

  // Talking Points
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*💬 Talking Points*\n' + ai.talkingPoints.map((tp, i) => `${i + 1}. ${tp}`).join('\n'),
    },
  });

  // Risk Factors (if any)
  if (ai.riskFactors.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*⚠️ Watch Out For*\n' + ai.riskFactors.map(r => `• ${r}`).join('\n'),
      },
    });
  }

  // Suggested Opener
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `💡 _Opener: "${ai.suggestedOpener}"_` }],
  });

  // Deal info if available
  if (data.deal) {
    blocks.push({ type: 'divider' });
    const dealHealthBadge = data.deal.healthStatus === 'at_risk' ? ' ⚠️' : '';
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*💰 Deal*: ${mrkdwnLink(data.deal.name, 'deal', data.deal.id)} — ${formatCurrency(data.deal.value)}${dealHealthBadge}`,
      },
    });
  }

  // Actions
  blocks.push({ type: 'divider' });
  const actionButtons: any[] = [];
  if (data.contact) {
    actionButtons.push({
      type: 'button',
      text: { type: 'plain_text', text: '👤 View Contact', emoji: true },
      url: link('contact', data.contact.id),
    });
  }
  if (data.deal) {
    actionButtons.push({
      type: 'button',
      text: { type: 'plain_text', text: '💼 Open Deal', emoji: true },
      url: link('deal', data.deal.id),
    });
  }
  actionButtons.push({
    type: 'button',
    text: { type: 'plain_text', text: '📋 View Calendar', emoji: true },
    url: link('calendar'),
  });
  blocks.push({ type: 'actions', elements: actionButtons });

  // Footer
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: '_60 AI-powered meeting prep_' }],
  });

  return {
    text: `Meeting in ${data.meeting.minutesUntil} min: ${data.meeting.title}`,
    blocks,
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function openDm(botToken: string, slackUserId: string): Promise<string> {
  const res = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ users: slackUserId, return_im: true }),
  });
  const payload = await res.json();
  if (!payload.ok || !payload.channel?.id) {
    throw new Error(payload.error || 'Failed to open DM');
  }
  return payload.channel.id as string;
}

async function postMessageWithBlocks(
  botToken: string,
  channel: string,
  text: string,
  blocks: unknown[]
): Promise<{ ts: string; channel: string }> {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, text, blocks }),
  });
  const payload = await res.json();
  if (!payload.ok || !payload.ts || !payload.channel) {
    throw new Error(payload.error || 'Failed to post Slack message');
  }
  return { ts: payload.ts as string, channel: payload.channel as string };
}

async function updateMessageBlocks(
  botToken: string,
  channel: string,
  ts: string,
  text: string,
  blocks: unknown[]
): Promise<void> {
  const res = await fetch('https://slack.com/api/chat.update', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, ts, text, blocks }),
  });
  const payload = await res.json();
  if (!payload.ok) {
    throw new Error(payload.error || 'Failed to update Slack message');
  }
}

async function getSlackForOrg(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<{
  slack_team_id: string;
  bot_access_token: string;
} | null> {
  const { data } = await supabase
    .from('slack_org_settings')
    .select('slack_team_id, bot_access_token')
    .eq('org_id', orgId)
    .eq('is_connected', true)
    .maybeSingle();

  if (!data?.slack_team_id || !data?.bot_access_token) return null;
  return { slack_team_id: data.slack_team_id as string, bot_access_token: data.bot_access_token as string };
}

async function getSlackUserIdForSixtyUser(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('slack_user_mappings')
    .select('slack_user_id')
    .eq('org_id', orgId)
    .eq('sixty_user_id', userId)
    .maybeSingle();

  return (data?.slack_user_id as string | undefined) || null;
}

// ============================================================================
// Real Data Fetchers (for simulationMode: false)
// ============================================================================

interface MorningBriefRealData {
  userName: string;
  date: string;
  currencyCode?: string;
  currencyLocale?: string;
  meetings: Array<{
    id: string;
    time: string;
    title: string;
    contactId?: string;
    contactName?: string;
    companyName?: string;
    dealId?: string;
    dealValue?: number;
    isImportant?: boolean;
  }>;
  tasks: {
    overdue: Array<{ id: string; title: string; daysOverdue: number; dealId?: string; dealName?: string }>;
    dueToday: Array<{ id: string; title: string; dealId?: string; dealName?: string }>;
  };
  deals: Array<{
    id: string;
    name: string;
    value: number;
    stage: string;
    closeDate?: string;
    daysUntilClose?: number;
    isAtRisk?: boolean;
    contactId?: string;
  }>;
  emailsToRespond: number;
  ghostRisks: Array<{ contactId: string; contactName: string; companyName?: string; daysSinceContact: number }>;
}

// ============================================================================
// Post-Call Summary Data Types
// ============================================================================

interface PostCallSummaryData {
  meeting: {
    id: string;
    title: string;
    startTime: string;
    endTime?: string;
    duration?: number; // minutes
  };
  contact?: {
    id: string;
    name: string;
    title?: string;
    companyId?: string;
    companyName?: string;
  };
  deal?: {
    id: string;
    name: string;
    value: number;
    stage: string;
  };
  summary?: {
    keyDecisions: string[];
    repCommitments: string[];
    prospectCommitments: string[];
    objections: string[];
    outcomeSignals: string[];
  };
  classification?: {
    outcome: string;
    hasForwardMovement: boolean;
    hasNextSteps: boolean;
    hasBudgetDiscussion: boolean;
    hasPricingDiscussion: boolean;
    hasObjection: boolean;
    detectedStage?: string;
  };
  actionItems: Array<{
    id: string;
    title: string;
    isSalesRepTask: boolean;
    priority?: string;
    deadline?: string;
    assigneeName?: string;
    synced: boolean;
  }>;
}

// ============================================================================
// Stale Deal Alert Data Types
// ============================================================================

interface StaleDealAlertData {
  deal: {
    id: string;
    name: string;
    value: number;
    stage: string;
    daysStale: number;
    closeDate?: string;
    healthStatus?: string;
  };
  contact?: {
    id: string;
    name: string;
    title?: string;
    email?: string;
  };
  company?: {
    id: string;
    name: string;
    industry?: string;
  };
  lastActivity?: {
    type: string;
    date: string;
    description?: string;
  };
  relationshipHealth?: {
    status: string;
    daysSinceContact: number;
  };
  toneSettings?: {
    formalityLevel: number;
    emojiUsage: string;
    toneStyle: string;
  };
  aiReengagement?: {
    subject: string;
    message: string;
    approach: string;
    nextSteps: string[];
  };
}

async function fetchMorningBriefData(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userId: string,
  userName: string
): Promise<MorningBriefRealData | null> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekFromNow = new Date(today);
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  // Get org currency settings
  const { data: org } = await supabase
    .from('organizations')
    .select('currency_code, currency_locale')
    .eq('id', orgId)
    .maybeSingle();

  // Get today's meetings
  const { data: meetings } = await supabase
    .from('calendar_events')
    .select(`
      id,
      title,
      start_time,
      end_time,
      contact_id,
      contacts:contact_id (id, full_name, company_id, companies:company_id (name)),
      deal_id,
      deals:deal_id (id, title, value, stage)
    `)
    .eq('user_id', userId)
    .gte('start_time', today.toISOString())
    .lt('start_time', tomorrow.toISOString())
    .order('start_time', { ascending: true })
    .limit(10);

  // Get overdue tasks
  const { data: overdueTasks } = await supabase
    .from('tasks')
    .select('id, title, due_date, deal_id, deals:deal_id (id, title)')
    .eq('assigned_to', userId)
    .eq('completed', false)
    .lt('due_date', today.toISOString())
    .order('due_date', { ascending: true })
    .limit(5);

  // Get due-today tasks
  const { data: dueTodayTasks } = await supabase
    .from('tasks')
    .select('id, title, deal_id, deals:deal_id (id, title)')
    .eq('assigned_to', userId)
    .eq('completed', false)
    .gte('due_date', today.toISOString())
    .lt('due_date', tomorrow.toISOString())
    .limit(5);

  // Get deals closing this week
  const { data: deals } = await supabase
    .from('deals')
    .select('id, title, value, stage, close_date, health_status, primary_contact_id')
    .eq('owner_id', userId)
    .in('stage', ['sql', 'opportunity', 'verbal', 'proposal', 'negotiation'])
    .not('close_date', 'is', null)
    .lte('close_date', weekFromNow.toISOString())
    .order('close_date', { ascending: true })
    .limit(5);

  // Get emails to respond count
  const { count: emailsToRespond } = await supabase
    .from('email_categorizations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('category', 'to_respond')
    .is('responded_at', null);

  // Get ghost risk contacts (from relationship_health_scores)
  const { data: ghostRisks } = await supabase
    .from('relationship_health_scores')
    .select('contact_id, days_since_last_contact, contacts:contact_id (id, full_name, company_id, companies:company_id (name))')
    .eq('user_id', userId)
    .eq('health_status', 'ghost_risk')
    .order('days_since_last_contact', { ascending: false })
    .limit(3);

  // Format meetings
  const formattedMeetings = (meetings || []).map((m: any) => {
    const startTime = new Date(m.start_time);
    const contact = m.contacts;
    const deal = m.deals;

    return {
      id: m.id,
      time: startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      title: m.title,
      contactId: contact?.id,
      contactName: contact?.full_name,
      companyName: contact?.companies?.name,
      dealId: deal?.id,
      dealValue: deal?.value,
      isImportant: deal?.stage === 'proposal' || deal?.stage === 'negotiation',
    };
  });

  // Format overdue tasks
  const formattedOverdue = (overdueTasks || []).map((t: any) => {
    const dueDate = new Date(t.due_date);
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    return {
      id: t.id,
      title: t.title,
      daysOverdue,
      dealId: t.deals?.id,
      dealName: t.deals?.title,
    };
  });

  // Format due today tasks
  const formattedDueToday = (dueTodayTasks || []).map((t: any) => ({
    id: t.id,
    title: t.title,
    dealId: t.deals?.id,
    dealName: t.deals?.title,
  }));

  // Format deals
  const formattedDeals = (deals || []).map((d: any) => {
    const closeDate = d.close_date ? new Date(d.close_date) : null;
    const daysUntilClose = closeDate
      ? Math.ceil((closeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      : undefined;
    return {
      id: d.id,
      name: d.title,
      value: d.value || 0,
      stage: d.stage,
      closeDate: d.close_date,
      daysUntilClose,
      isAtRisk: d.health_status === 'at_risk' || d.health_status === 'off_track',
      contactId: d.primary_contact_id,
    };
  });

  // Format ghost risks
  const formattedGhostRisks = (ghostRisks || []).map((r: any) => ({
    contactId: r.contact_id,
    contactName: r.contacts?.full_name || 'Unknown',
    companyName: r.contacts?.companies?.name,
    daysSinceContact: r.days_since_last_contact || 0,
  }));

  return {
    userName,
    date: today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    currencyCode: org?.currency_code,
    currencyLocale: org?.currency_locale,
    meetings: formattedMeetings,
    tasks: {
      overdue: formattedOverdue,
      dueToday: formattedDueToday,
    },
    deals: formattedDeals,
    emailsToRespond: emailsToRespond || 0,
    ghostRisks: formattedGhostRisks,
  };
}

/**
 * Fetch Post-Call Summary data from meeting analysis tables
 */
async function fetchPostCallSummaryData(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userId: string,
  meetingId?: string
): Promise<PostCallSummaryData | null> {
  const now = new Date();

  // If no meeting ID provided, find the most recent completed meeting
  let meetingQuery;
  if (meetingId) {
    meetingQuery = supabase
      .from('meetings')
      .select(`
        id, title, start_time, end_time,
        primary_contact_id,
        contacts:primary_contact_id (id, full_name, title, company_id,
          companies:company_id (id, name)
        ),
        deal_id,
        deals:deal_id (id, title, value, stage)
      `)
      .eq('id', meetingId)
      .single();
  } else {
    // Find the most recent meeting that ended in the last 2 hours
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    meetingQuery = supabase
      .from('meetings')
      .select(`
        id, title, start_time, end_time,
        primary_contact_id,
        contacts:primary_contact_id (id, full_name, title, company_id,
          companies:company_id (id, name)
        ),
        deal_id,
        deals:deal_id (id, title, value, stage)
      `)
      .eq('owner_user_id', userId) // Note: meetings uses owner_user_id
      .lte('end_time', now.toISOString())
      .gte('end_time', twoHoursAgo.toISOString())
      .order('end_time', { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  const { data: meeting } = await meetingQuery;
  if (!meeting) return null;

  const contact = meeting.contacts as any;
  const company = contact?.companies as any;
  const deal = meeting.deals as any;

  // Calculate duration
  const startTime = new Date(meeting.start_time);
  const endTime = meeting.end_time ? new Date(meeting.end_time) : new Date();
  const duration = Math.round((endTime.getTime() - startTime.getTime()) / (60 * 1000));

  // Fetch meeting structured summary
  const { data: structuredSummary } = await supabase
    .from('meeting_structured_summaries')
    .select('*')
    .eq('meeting_id', meeting.id)
    .maybeSingle();

  // Fetch meeting classification
  const { data: classification } = await supabase
    .from('meeting_classifications')
    .select('*')
    .eq('meeting_id', meeting.id)
    .maybeSingle();

  // Fetch action items (tasks detected from meeting)
  const { data: actionItems } = await supabase
    .from('meeting_action_items')
    .select('id, title, is_sales_rep_task, priority, deadline_date, assignee_name, synced_to_task')
    .eq('meeting_id', meeting.id)
    .order('created_at', { ascending: true });

  // Parse JSON fields from structured summary
  const parseJsonArray = (val: unknown): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(String);
    return [];
  };

  return {
    meeting: {
      id: meeting.id,
      title: meeting.title,
      startTime: meeting.start_time,
      endTime: meeting.end_time,
      duration,
    },
    contact: contact ? {
      id: contact.id,
      name: contact.full_name,
      title: contact.title,
      companyId: company?.id,
      companyName: company?.name,
    } : undefined,
    deal: deal ? {
      id: deal.id,
      name: deal.title,
      value: deal.value || 0,
      stage: deal.stage,
    } : undefined,
    summary: structuredSummary ? {
      keyDecisions: parseJsonArray(structuredSummary.key_decisions),
      repCommitments: parseJsonArray(structuredSummary.rep_commitments),
      prospectCommitments: parseJsonArray(structuredSummary.prospect_commitments),
      objections: parseJsonArray(structuredSummary.objections),
      outcomeSignals: parseJsonArray(structuredSummary.outcome_signals),
    } : undefined,
    classification: classification ? {
      outcome: classification.outcome || 'unknown',
      hasForwardMovement: classification.has_forward_movement || false,
      hasNextSteps: classification.has_next_steps || false,
      hasBudgetDiscussion: classification.has_budget_discussion || false,
      hasPricingDiscussion: classification.has_pricing_discussion || false,
      hasObjection: classification.has_objection || false,
      detectedStage: classification.detected_stage,
    } : undefined,
    actionItems: (actionItems || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      isSalesRepTask: item.is_sales_rep_task || false,
      priority: item.priority,
      deadline: item.deadline_date,
      assigneeName: item.assignee_name,
      synced: item.synced_to_task || false,
    })),
  };
}

/**
 * Build Post-Call Summary Slack blocks with real data
 */
function buildRealPostCallSummaryBlocks(data: PostCallSummaryData): { text: string; blocks: any[] } {
  const blocks: any[] = [];

  // Header
  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: `📞 Call Summary: ${data.meeting.title}`, emoji: true },
  });

  // Meeting context
  const contextParts: string[] = [];
  if (data.meeting.duration) {
    contextParts.push(`${data.meeting.duration} min call`);
  }
  if (data.contact) {
    contextParts.push(`with ${mrkdwnLink(data.contact.name, 'contact', data.contact.id)}`);
    if (data.contact.companyName) {
      contextParts.push(`at ${data.contact.companyName}`);
    }
  }
  if (contextParts.length > 0) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: contextParts.join(' ') } });
  }

  blocks.push({ type: 'divider' });

  // Outcome signals from classification
  if (data.classification) {
    const signals: string[] = [];
    if (data.classification.hasForwardMovement) signals.push('✅ Forward movement');
    if (data.classification.hasNextSteps) signals.push('📅 Next steps discussed');
    if (data.classification.hasBudgetDiscussion) signals.push('💰 Budget discussed');
    if (data.classification.hasPricingDiscussion) signals.push('💵 Pricing discussed');
    if (data.classification.hasObjection) signals.push('⚠️ Objections raised');

    if (signals.length > 0) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*🎯 Call Signals*\n${signals.join('  •  ')}` },
      });
    }

    // Outcome badge
    const outcomeEmoji = data.classification.outcome === 'positive' ? '🟢' :
                         data.classification.outcome === 'negative' ? '🔴' : '🟡';
    if (data.classification.outcome && data.classification.outcome !== 'unknown') {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `${outcomeEmoji} Overall outcome: *${data.classification.outcome}*` }],
      });
    }
  }

  // Key decisions
  if (data.summary?.keyDecisions.length) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*📋 Key Decisions*\n' + data.summary.keyDecisions.slice(0, 4).map(d => `• ${d}`).join('\n'),
      },
    });
  }

  // Commitments
  const commitments: string[] = [];
  if (data.summary?.repCommitments.length) {
    commitments.push('*Your commitments:*');
    data.summary.repCommitments.slice(0, 3).forEach(c => commitments.push(`• ${c}`));
  }
  if (data.summary?.prospectCommitments.length) {
    if (commitments.length > 0) commitments.push('');
    commitments.push('*Their commitments:*');
    data.summary.prospectCommitments.slice(0, 3).forEach(c => commitments.push(`• ${c}`));
  }
  if (commitments.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: commitments.join('\n') },
    });
  }

  // Objections (if any)
  if (data.summary?.objections.length) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*⚠️ Objections Raised*\n' + data.summary.objections.slice(0, 3).map(o => `• ${o}`).join('\n'),
      },
    });
  }

  // Action Items with task creation buttons
  if (data.actionItems.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*✅ Action Items (${data.actionItems.length})*` },
    });

    // Show each action item with a button to create task (if not already synced)
    const yourTasks = data.actionItems.filter(item => item.isSalesRepTask && !item.synced);
    const theirTasks = data.actionItems.filter(item => !item.isSalesRepTask && !item.synced);

    // Your tasks section
    if (yourTasks.length > 0) {
      blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: '_Your follow-ups:_' }] });
      yourTasks.slice(0, 5).forEach((item) => {
        const priorityBadge = item.priority === 'high' ? '🔴 ' : item.priority === 'medium' ? '🟡 ' : '';
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: `${priorityBadge}*${item.title}*` },
          accessory: {
            type: 'button',
            text: { type: 'plain_text', text: '➕ Create Task', emoji: true },
            action_id: 'create_task_from_assistant',
            value: JSON.stringify({
              title: item.title,
              dueInDays: 2,
              meetingId: data.meeting.id,
              dealId: data.deal?.id,
              contactId: data.contact?.id,
              source: 'post_call_summary',
            }),
            style: 'primary',
          },
        });
      });
    }

    // Their tasks / prospect follow-ups
    if (theirTasks.length > 0) {
      blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: '_Prospect follow-ups to track:_' }] });
      theirTasks.slice(0, 3).forEach((item) => {
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: `• ${item.title}${item.assigneeName ? ` (${item.assigneeName})` : ''}` },
        });
      });
    }

    // Add All Tasks button (for your tasks only)
    if (yourTasks.length > 1) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: `➕ Add all ${yourTasks.length} tasks`, emoji: true },
            action_id: 'add_all_tasks',
            value: JSON.stringify({
              tasks: yourTasks.map(t => ({
                title: t.title,
                dueInDays: 2,
                meetingId: data.meeting.id,
                dealId: data.deal?.id,
                contactId: data.contact?.id,
              })),
              source: 'post_call_summary',
            }),
            style: 'primary',
          },
        ],
      });
    }
  }

  // Deal link
  if (data.deal) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*💼 Deal*: ${mrkdwnLink(data.deal.name, 'deal', data.deal.id)} — ${formatCurrency(data.deal.value)} (${data.deal.stage})`,
      },
    });
  }

  // Action buttons
  blocks.push({ type: 'divider' });
  const actionButtons: any[] = [];
  actionButtons.push({
    type: 'button',
    text: { type: 'plain_text', text: '📝 View Meeting', emoji: true },
    url: link('meeting', data.meeting.id),
  });
  if (data.deal) {
    actionButtons.push({
      type: 'button',
      text: { type: 'plain_text', text: '💼 Open Deal', emoji: true },
      url: link('deal', data.deal.id),
    });
  }
  if (data.contact) {
    actionButtons.push({
      type: 'button',
      text: { type: 'plain_text', text: '👤 View Contact', emoji: true },
      url: link('contact', data.contact.id),
    });
  }
  blocks.push({ type: 'actions', elements: actionButtons });

  // Footer
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: '_60 AI-powered post-call analysis_' }],
  });

  return {
    text: `Post-call summary: ${data.meeting.title}`,
    blocks,
  };
}

/**
 * Fetch Stale Deal data for alert notification
 */
async function fetchStaleDealData(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userId: string,
  dealId?: string
): Promise<StaleDealAlertData | null> {
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // If no deal ID provided, find the most stale deal
  let dealQuery;
  if (dealId) {
    dealQuery = supabase
      .from('deals')
      .select(`
        id, title, value, stage, close_date, health_status, last_activity_at,
        primary_contact_id,
        contacts:primary_contact_id (id, full_name, title, email, company_id,
          companies:company_id (id, name, industry)
        )
      `)
      .eq('id', dealId)
      .single();
  } else {
    // Find deals with no activity for 14+ days
    dealQuery = supabase
      .from('deals')
      .select(`
        id, title, value, stage, close_date, health_status, last_activity_at,
        primary_contact_id,
        contacts:primary_contact_id (id, full_name, title, email, company_id,
          companies:company_id (id, name, industry)
        )
      `)
      .eq('owner_id', userId)
      .in('stage', ['sql', 'opportunity', 'verbal', 'proposal', 'negotiation'])
      .lt('last_activity_at', fourteenDaysAgo.toISOString())
      .order('last_activity_at', { ascending: true })
      .limit(1)
      .maybeSingle();
  }

  const { data: deal } = await dealQuery;
  if (!deal) return null;

  const contact = deal.contacts as any;
  const company = contact?.companies as any;

  // Calculate days stale
  const lastActivity = deal.last_activity_at ? new Date(deal.last_activity_at) : fourteenDaysAgo;
  const daysStale = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));

  // Get last activity details
  const { data: lastActivityRecord } = await supabase
    .from('activities')
    .select('type, happened_at, description')
    .eq('deal_id', deal.id)
    .order('happened_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Get relationship health if contact exists
  let relationshipHealth;
  if (contact?.id) {
    const { data: healthRecord } = await supabase
      .from('relationship_health_scores')
      .select('health_status, days_since_last_contact')
      .eq('contact_id', contact.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (healthRecord) {
      relationshipHealth = {
        status: healthRecord.health_status || 'unknown',
        daysSinceContact: healthRecord.days_since_last_contact || 0,
      };
    }
  }

  // Get user's tone settings
  const { data: toneRecord } = await supabase
    .from('user_tone_settings')
    .select('formality_level, emoji_usage, tone_style')
    .eq('user_id', userId)
    .eq('content_type', 'email')
    .maybeSingle();

  return {
    deal: {
      id: deal.id,
      name: deal.title,
      value: deal.value || 0,
      stage: deal.stage,
      daysStale,
      closeDate: deal.close_date,
      healthStatus: deal.health_status,
    },
    contact: contact ? {
      id: contact.id,
      name: contact.full_name,
      title: contact.title,
      email: contact.email,
    } : undefined,
    company: company ? {
      id: company.id,
      name: company.name,
      industry: company.industry,
    } : undefined,
    lastActivity: lastActivityRecord ? {
      type: lastActivityRecord.type,
      date: new Date(lastActivityRecord.happened_at).toLocaleDateString(),
      description: lastActivityRecord.description,
    } : undefined,
    relationshipHealth,
    toneSettings: toneRecord ? {
      formalityLevel: toneRecord.formality_level || 5,
      emojiUsage: toneRecord.emoji_usage || 'none',
      toneStyle: toneRecord.tone_style || 'professional',
    } : undefined,
  };
}

/**
 * Enrich stale deal data with AI-generated re-engagement message
 */
async function enrichStaleDealWithAI(data: StaleDealAlertData): Promise<StaleDealAlertData> {
  const toneDescription = data.toneSettings
    ? `Formality: ${data.toneSettings.formalityLevel}/10, Style: ${data.toneSettings.toneStyle}, Emoji: ${data.toneSettings.emojiUsage}`
    : 'Professional, no emojis';

  const systemPrompt = `You are 60, a smart AI sales assistant. Generate a brief, personalized re-engagement message for a deal that has gone cold.

TONE SETTINGS: ${toneDescription}
Be concise, genuine, and avoid sounding desperate. The message should feel personal, not templated.`;

  const context = `
DEAL: "${data.deal.name}"
- Value: ${formatCurrency(data.deal.value)}
- Stage: ${data.deal.stage}
- Days with no activity: ${data.deal.daysStale}

${data.contact ? `CONTACT:
- Name: ${data.contact.name}
- Title: ${data.contact.title || 'Unknown'}` : 'No primary contact linked.'}

${data.company ? `COMPANY: ${data.company.name}${data.company.industry ? ` (${data.company.industry})` : ''}` : ''}

${data.lastActivity ? `LAST ACTIVITY: ${data.lastActivity.type} on ${data.lastActivity.date}${data.lastActivity.description ? ` - "${data.lastActivity.description}"` : ''}` : 'No recent activity recorded.'}

${data.relationshipHealth ? `RELATIONSHIP STATUS: ${data.relationshipHealth.status} (${data.relationshipHealth.daysSinceContact} days since contact)` : ''}`;

  const prompt = `Based on this stale deal context, generate a personalized re-engagement strategy.

${context}

Return a JSON object with:
- subject: A short, compelling email subject line (max 50 chars)
- message: A brief re-engagement message (2-3 sentences max, suitable for email or LinkedIn)
- approach: One sentence explaining your re-engagement strategy
- nextSteps: Array of 2-3 specific next steps the sales rep should take

Be specific to this deal, not generic. Match the tone settings provided.

RESPOND ONLY WITH VALID JSON.`;

  const result = await callGemini(prompt, systemPrompt);

  if (result.success && result.content) {
    const aiData = parseAIJson<{
      subject: string;
      message: string;
      approach: string;
      nextSteps: string[];
    }>(result.content);

    if (aiData) {
      data.aiReengagement = aiData;
    }
  }

  // Provide fallback if AI fails
  if (!data.aiReengagement) {
    const contactName = data.contact?.name?.split(' ')[0] || 'there';
    data.aiReengagement = {
      subject: `Quick check-in on ${data.deal.name}`,
      message: `Hi ${contactName}, I wanted to check in and see if you've had any thoughts since we last spoke. Happy to answer any questions or schedule a quick call to discuss next steps.`,
      approach: 'Simple, low-pressure check-in to restart the conversation.',
      nextSteps: [
        `Send a brief follow-up email to ${data.contact?.name || 'the contact'}`,
        'Review the deal notes for any unaddressed concerns',
        'Consider offering additional value or resources',
      ],
    };
  }

  return data;
}

/**
 * Build Stale Deal Alert Slack blocks with real data + AI re-engagement
 */
function buildRealStaleDealAlertBlocks(data: StaleDealAlertData): { text: string; blocks: any[] } {
  const blocks: any[] = [];
  const ai = data.aiReengagement!;

  // Header
  const urgencyEmoji = data.deal.daysStale > 21 ? '🚨' : '⚠️';
  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: `${urgencyEmoji} Stale Deal Alert: ${data.deal.name}`, emoji: true },
  });

  // Deal stats
  const statsParts: string[] = [
    `*${data.deal.daysStale} days* with no activity`,
    `${formatCurrency(data.deal.value)} • ${data.deal.stage}`,
  ];
  if (data.deal.healthStatus === 'at_risk' || data.deal.healthStatus === 'off_track') {
    statsParts.push('🔴 At Risk');
  }
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: statsParts.join(' • ') } });

  // Contact/Company context
  if (data.contact || data.company) {
    const contextParts: string[] = [];
    if (data.contact) {
      contextParts.push(`with ${mrkdwnLink(data.contact.name, 'contact', data.contact.id)}`);
      if (data.contact.title) contextParts.push(`(${data.contact.title})`);
    }
    if (data.company) {
      contextParts.push(`at ${data.company.name}`);
    }
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: contextParts.join(' ') }] });
  }

  // Last activity
  if (data.lastActivity) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `📅 Last activity: ${data.lastActivity.type} on ${data.lastActivity.date}` }],
    });
  }

  blocks.push({ type: 'divider' });

  // AI Re-engagement Strategy
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `*💡 Re-engagement Strategy*\n${ai.approach}` },
  });

  // Suggested message
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*✍️ Suggested Message*\n_Subject: "${ai.subject}"_\n\n"${ai.message}"`,
    },
  });

  // Next steps with task buttons
  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: '*📋 Recommended Next Steps*' },
  });

  ai.nextSteps.slice(0, 3).forEach((step, i) => {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `${i + 1}. ${step}` },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: '➕ Create Task', emoji: true },
        action_id: 'create_task_from_assistant',
        value: JSON.stringify({
          title: step,
          dueInDays: 1,
          dealId: data.deal.id,
          contactId: data.contact?.id,
          source: 'stale_deal_alert',
        }),
        style: 'primary',
      },
    });
  });

  // Action buttons
  blocks.push({ type: 'divider' });
  const actionButtons: any[] = [
    {
      type: 'button',
      text: { type: 'plain_text', text: '💼 Open Deal', emoji: true },
      url: link('deal', data.deal.id),
    },
  ];
  if (data.contact) {
    actionButtons.push({
      type: 'button',
      text: { type: 'plain_text', text: '👤 View Contact', emoji: true },
      url: link('contact', data.contact.id),
    });
  }
  if (data.contact?.email) {
    actionButtons.push({
      type: 'button',
      text: { type: 'plain_text', text: '📧 Draft Email', emoji: true },
      url: `mailto:${data.contact.email}?subject=${encodeURIComponent(ai.subject)}`,
    });
  }
  blocks.push({ type: 'actions', elements: actionButtons });

  // Footer
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: '_60 AI-powered deal re-engagement_' }],
  });

  return {
    text: `Stale deal alert: ${data.deal.name} (${data.deal.daysStale} days inactive)`,
    blocks,
  };
}

// ============================================================================
// Email Reply Alert - Real Data + AI Reply Suggestion
// ============================================================================

interface EmailReplyAlertData {
  email: {
    id: string;
    externalId: string;
    subject: string;
    fromEmail: string;
    fromName?: string;
    snippet: string; // First ~200 chars of body
    receivedAt: string;
    threadId?: string;
    sentiment?: string;
    priority?: number;
    aiSummary?: string;
  };
  contact?: {
    id: string;
    name: string;
    title?: string;
    companyId?: string;
    companyName?: string;
  };
  deal?: {
    id: string;
    name: string;
    value: number;
    stage: string;
  };
  thread?: {
    id: string;
    subject: string;
    messageCount: number;
    isImportant: boolean;
  };
  toneSettings?: {
    formalityLevel: number;
    emojiUsage: string;
    toneStyle: string;
  };
  aiReplySuggestion?: {
    suggestedReply: string;
    keyPoints: string[];
    tone: string;
    urgency: 'low' | 'medium' | 'high';
  };
}

/**
 * Fetch email reply data for simulation
 */
async function fetchEmailReplyData(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userId: string,
  emailId?: string
): Promise<EmailReplyAlertData | null> {
  try {
    // Find a recent inbound email to respond to
    let emailQuery = supabase
      .from('emails')
      .select('*')
      .eq('user_id', userId)
      .eq('is_sent', false)
      .is('is_draft', false)
      .is('is_trash', false)
      .order('received_at', { ascending: false });

    if (emailId) {
      emailQuery = emailQuery.eq('id', emailId);
    } else {
      emailQuery = emailQuery.limit(1);
    }

    const { data: email } = await emailQuery.maybeSingle();
    if (!email) return null;

    // Get email thread if exists
    let thread: EmailReplyAlertData['thread'];
    if (email.thread_id) {
      const { data: threadData } = await supabase
        .from('email_threads')
        .select('id, subject, message_count, is_important')
        .eq('id', email.thread_id)
        .maybeSingle();
      if (threadData) {
        thread = {
          id: threadData.id,
          subject: threadData.subject,
          messageCount: threadData.message_count || 1,
          isImportant: threadData.is_important || false,
        };
      }
    }

    // Try to find a matching contact by email
    let contact: EmailReplyAlertData['contact'];
    const { data: contactData } = await supabase
      .from('contacts')
      .select('id, full_name, job_title, company_id, companies:company_id(name)')
      .eq('org_id', orgId)
      .eq('email', email.from_email)
      .maybeSingle();

    if (contactData) {
      contact = {
        id: contactData.id,
        name: contactData.full_name || email.from_name || email.from_email,
        title: contactData.job_title || undefined,
        companyId: contactData.company_id || undefined,
        companyName: (contactData.companies as any)?.name || undefined,
      };

      // If we have a contact, check for associated deals
      const { data: dealData } = await supabase
        .from('deals')
        .select('id, title, value, stage')
        .eq('primary_contact_id', contactData.id)
        .not('stage', 'in', '("closed_won","closed_lost")')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (dealData) {
        return {
          email: {
            id: email.id,
            externalId: email.external_id || email.id,
            subject: email.subject || '(No subject)',
            fromEmail: email.from_email,
            fromName: email.from_name || undefined,
            snippet: email.body_text?.substring(0, 300) || email.ai_summary || '',
            receivedAt: email.received_at || email.created_at || new Date().toISOString(),
            threadId: email.thread_id || undefined,
            sentiment: email.ai_sentiment || undefined,
            priority: email.ai_priority || undefined,
            aiSummary: email.ai_summary || undefined,
          },
          contact,
          deal: {
            id: dealData.id,
            name: dealData.title,
            value: dealData.value || 0,
            stage: dealData.stage,
          },
          thread,
        };
      }
    }

    // Return email data even without contact/deal match
    return {
      email: {
        id: email.id,
        externalId: email.external_id || email.id,
        subject: email.subject || '(No subject)',
        fromEmail: email.from_email,
        fromName: email.from_name || undefined,
        snippet: email.body_text?.substring(0, 300) || email.ai_summary || '',
        receivedAt: email.received_at || email.created_at || new Date().toISOString(),
        threadId: email.thread_id || undefined,
        sentiment: email.ai_sentiment || undefined,
        priority: email.ai_priority || undefined,
        aiSummary: email.ai_summary || undefined,
      },
      contact,
      thread,
    };
  } catch (error) {
    console.error('[proactive-simulate] Error fetching email reply data:', error);
    return null;
  }
}

/**
 * Enrich email reply data with AI-generated reply suggestion
 */
async function enrichEmailReplyWithAI(
  data: EmailReplyAlertData
): Promise<EmailReplyAlertData> {
  try {
    const toneInstructions = data.toneSettings
      ? `Match this tone: ${data.toneSettings.toneStyle}, formality level ${data.toneSettings.formalityLevel}/5, emoji usage: ${data.toneSettings.emojiUsage}`
      : 'Use a professional, friendly tone';

    const contextParts: string[] = [];
    if (data.contact) {
      contextParts.push(`Sender: ${data.contact.name}${data.contact.title ? ` (${data.contact.title})` : ''}`);
      if (data.contact.companyName) contextParts.push(`Company: ${data.contact.companyName}`);
    }
    if (data.deal) {
      contextParts.push(`Active deal: ${data.deal.name} ($${data.deal.value.toLocaleString()})`);
    }
    if (data.email.aiSummary) {
      contextParts.push(`Email summary: ${data.email.aiSummary}`);
    }

    const prompt = `You are 60, a smart sales assistant helping craft email replies.

Email received:
- Subject: "${data.email.subject}"
- From: ${data.email.fromName || data.email.fromEmail}
- Message: "${data.email.snippet}"
${contextParts.length > 0 ? `\nContext:\n${contextParts.join('\n')}` : ''}

${toneInstructions}

Provide a JSON response with:
{
  "suggestedReply": "A concise, helpful reply (2-3 sentences max)",
  "keyPoints": ["Key point 1 to address", "Key point 2", "Key point 3"],
  "tone": "The detected tone to match (e.g., 'friendly', 'formal', 'urgent')",
  "urgency": "low" | "medium" | "high"
}

Focus on:
1. Acknowledge their message
2. Address any questions or concerns
3. Suggest a clear next step`;

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': Deno.env.get('GEMINI_API_KEY') || '',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 500 },
      }),
    });

    if (!response.ok) {
      console.warn('[proactive-simulate] Gemini API error:', response.status);
      return data;
    }

    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return data;

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    const jsonStr = jsonMatch[1] || text;
    const parsed = JSON.parse(jsonStr.trim());

    data.aiReplySuggestion = {
      suggestedReply: parsed.suggestedReply || 'Thanks for your message. Let me review and get back to you shortly.',
      keyPoints: parsed.keyPoints || ['Review the request', 'Prepare response', 'Follow up promptly'],
      tone: parsed.tone || 'professional',
      urgency: parsed.urgency || 'medium',
    };

    return data;
  } catch (error) {
    console.error('[proactive-simulate] Error enriching email reply with AI:', error);
    // Return fallback
    data.aiReplySuggestion = {
      suggestedReply: 'Thanks for your message! Let me review this and get back to you shortly with more details.',
      keyPoints: ['Acknowledge their message', 'Review the request', 'Respond with next steps'],
      tone: 'professional',
      urgency: 'medium',
    };
    return data;
  }
}

/**
 * Build Email Reply Alert Slack blocks with real data + AI suggestion
 */
function buildRealEmailReplyAlertBlocks(data: EmailReplyAlertData): { text: string; blocks: any[] } {
  const blocks: any[] = [];
  const ai = data.aiReplySuggestion!;

  // Urgency styling
  const urgencyEmoji = ai.urgency === 'high' ? '🔴' : ai.urgency === 'medium' ? '🟡' : '🟢';
  const headerEmoji = ai.urgency === 'high' ? '🚨' : '📧';

  // Header
  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: `${headerEmoji} New Reply: ${data.email.subject}`, emoji: true },
  });

  // Sender info with contact link if available
  const senderName = data.email.fromName || data.email.fromEmail.split('@')[0];
  const senderLine = data.contact
    ? `*From:* ${mrkdwnLink(senderName, 'contact', data.contact.id)}${data.contact.title ? ` (${data.contact.title})` : ''}`
    : `*From:* ${senderName} <${data.email.fromEmail}>`;

  const companyLine = data.contact?.companyName ? ` at ${data.contact.companyName}` : '';
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: senderLine + companyLine },
  });

  // Urgency and sentiment
  const metaParts: string[] = [`${urgencyEmoji} ${ai.urgency.toUpperCase()} priority`];
  if (data.email.sentiment) {
    const sentimentEmoji = data.email.sentiment === 'positive' ? '😊' : data.email.sentiment === 'negative' ? '😟' : '😐';
    metaParts.push(`${sentimentEmoji} ${data.email.sentiment} tone`);
  }
  const timeAgo = formatTimeAgo(data.email.receivedAt);
  metaParts.push(`Received ${timeAgo}`);
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: metaParts.join(' • ') }],
  });

  // Deal context if exists
  if (data.deal) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `💼 Related deal: ${mrkdwnLink(data.deal.name, 'deal', data.deal.id)} (${formatCurrency(data.deal.value)})` }],
    });
  }

  blocks.push({ type: 'divider' });

  // Message preview
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `*📄 Message Preview*\n>"${truncateText(data.email.snippet, 200)}"` },
  });

  // Key points to address
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `*🎯 Key Points to Address*\n${ai.keyPoints.map((p) => `• ${p}`).join('\n')}` },
  });

  blocks.push({ type: 'divider' });

  // Suggested reply
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `*💡 Suggested Reply (${ai.tone} tone)*\n"${ai.suggestedReply}"` },
  });

  // Action buttons
  blocks.push({ type: 'divider' });
  const actionButtons: any[] = [
    {
      type: 'button',
      text: { type: 'plain_text', text: '➕ Create Reply Task', emoji: true },
      action_id: 'create_task_from_assistant',
      value: JSON.stringify({
        title: `Reply to ${senderName}: ${data.email.subject}`,
        dueInDays: ai.urgency === 'high' ? 0 : 1,
        contactId: data.contact?.id,
        dealId: data.deal?.id,
        source: 'email_reply_alert',
      }),
      style: 'primary',
    },
    {
      type: 'button',
      text: { type: 'plain_text', text: '📧 Open in Gmail', emoji: true },
      url: `https://mail.google.com/mail/u/0/#inbox/${data.email.externalId}`,
    },
  ];
  if (data.contact) {
    actionButtons.push({
      type: 'button',
      text: { type: 'plain_text', text: '👤 View Contact', emoji: true },
      url: link('contact', data.contact.id),
    });
  }
  blocks.push({ type: 'actions', elements: actionButtons });

  // Footer
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: '_60 AI email assistant — reply suggestions powered by your communication style_' }],
  });

  return {
    text: `New email from ${senderName}: ${data.email.subject}`,
    blocks,
  };
}

/**
 * Helper: Format time ago string
 */
function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  return `${diffDays} days ago`;
}

/**
 * Helper: Truncate text with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// ============================================================================
// AI Smart Suggestion - Dynamic, Context-Aware Proactive Insights
// ============================================================================

interface AISmartSuggestionData {
  user: {
    id: string;
    name: string;
    email?: string;
  };
  context: {
    // Calendar density
    meetingsToday: number;
    meetingsThisWeek: number;
    nextMeeting?: {
      id: string;
      title: string;
      startTime: string;
      contactName?: string;
    };
    // Pipeline health
    totalDealsActive: number;
    dealsAtRisk: number;
    dealsClosingSoon: number;
    pipelineValue: number;
    recentWins: number;
    recentLosses: number;
    // Task patterns
    tasksOverdue: number;
    tasksDueToday: number;
    tasksCompletedThisWeek: number;
    // Relationship health
    ghostRiskContacts: number;
    neglectedContacts: number;
    // Recent activity
    emailsSentThisWeek: number;
    meetingsAttendedThisWeek: number;
  };
  aiSuggestion?: {
    type: 'encouragement' | 'suggestion' | 'insight' | 'reminder' | 'coaching';
    message: string;
    emoji: string;
    action?: {
      label: string;
      type: 'deal' | 'contact' | 'task' | 'calendar' | 'pipeline' | 'email';
      id?: string;
    };
    secondaryActions?: Array<{
      label: string;
      type: 'deal' | 'contact' | 'task' | 'calendar' | 'pipeline';
      id?: string;
    }>;
  };
}

/**
 * Gather comprehensive user context for AI Smart Suggestion
 */
async function gatherUserContext(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userId: string,
  userName: string
): Promise<AISmartSuggestionData> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekFromNow = new Date(today);
  weekFromNow.setDate(weekFromNow.getDate() + 7);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Parallel fetch all context data
  const [
    meetingsTodayRes,
    meetingsWeekRes,
    nextMeetingRes,
    activeDealsRes,
    atRiskDealsRes,
    closingSoonDealsRes,
    recentWinsRes,
    recentLossesRes,
    overdueTasksRes,
    dueTodayTasksRes,
    completedTasksRes,
    ghostRiskRes,
    neglectedRes,
    emailsSentRes,
    meetingsAttendedRes,
  ] = await Promise.all([
    // Meetings today
    supabase
      .from('calendar_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('start_time', today.toISOString())
      .lt('start_time', tomorrow.toISOString()),

    // Meetings this week
    supabase
      .from('calendar_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('start_time', today.toISOString())
      .lt('start_time', weekFromNow.toISOString()),

    // Next meeting
    supabase
      .from('calendar_events')
      .select('id, title, start_time, contacts:contact_id(full_name)')
      .eq('user_id', userId)
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true })
      .limit(1)
      .maybeSingle(),

    // Active deals
    supabase
      .from('deals')
      .select('id, value', { count: 'exact' })
      .eq('user_id', userId)
      .not('stage', 'in', '("closed_won","closed_lost")'),

    // At-risk deals
    supabase
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('health_status', ['at_risk', 'off_track'])
      .not('stage', 'in', '("closed_won","closed_lost")'),

    // Deals closing soon (next 7 days)
    supabase
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .not('stage', 'in', '("closed_won","closed_lost")')
      .lte('close_date', weekFromNow.toISOString())
      .gte('close_date', today.toISOString()),

    // Recent wins (last 7 days)
    supabase
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('stage', 'closed_won')
      .gte('updated_at', weekAgo.toISOString()),

    // Recent losses (last 7 days)
    supabase
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('stage', 'closed_lost')
      .gte('updated_at', weekAgo.toISOString()),

    // Overdue tasks
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('completed', false)
      .lt('due_date', today.toISOString()),

    // Due today tasks
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('completed', false)
      .gte('due_date', today.toISOString())
      .lt('due_date', tomorrow.toISOString()),

    // Completed tasks this week
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('completed', true)
      .gte('completed_at', weekAgo.toISOString()),

    // Ghost risk contacts
    supabase
      .from('relationship_health_scores')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .eq('risk_type', 'ghost'),

    // Neglected contacts (no interaction 30+ days)
    supabase
      .from('relationship_health_scores')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .lte('days_since_last_interaction', -30),

    // Emails sent this week
    supabase
      .from('emails')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_sent', true)
      .gte('sent_at', weekAgo.toISOString()),

    // Meetings attended this week
    supabase
      .from('calendar_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .lt('end_time', new Date().toISOString())
      .gte('start_time', weekAgo.toISOString()),
  ]);

  // Calculate pipeline value
  const pipelineValue = activeDealsRes.data?.reduce((sum, d) => sum + (d.value || 0), 0) || 0;

  return {
    user: {
      id: userId,
      name: userName,
    },
    context: {
      meetingsToday: meetingsTodayRes.count || 0,
      meetingsThisWeek: meetingsWeekRes.count || 0,
      nextMeeting: nextMeetingRes.data
        ? {
            id: nextMeetingRes.data.id,
            title: nextMeetingRes.data.title,
            startTime: nextMeetingRes.data.start_time,
            contactName: (nextMeetingRes.data.contacts as any)?.full_name,
          }
        : undefined,
      totalDealsActive: activeDealsRes.count || 0,
      dealsAtRisk: atRiskDealsRes.count || 0,
      dealsClosingSoon: closingSoonDealsRes.count || 0,
      pipelineValue,
      recentWins: recentWinsRes.count || 0,
      recentLosses: recentLossesRes.count || 0,
      tasksOverdue: overdueTasksRes.count || 0,
      tasksDueToday: dueTodayTasksRes.count || 0,
      tasksCompletedThisWeek: completedTasksRes.count || 0,
      ghostRiskContacts: ghostRiskRes.count || 0,
      neglectedContacts: neglectedRes.count || 0,
      emailsSentThisWeek: emailsSentRes.count || 0,
      meetingsAttendedThisWeek: meetingsAttendedRes.count || 0,
    },
  };
}

/**
 * Generate AI Smart Suggestion using Gemini
 */
async function generateAISmartSuggestion(
  data: AISmartSuggestionData
): Promise<AISmartSuggestionData> {
  try {
    const ctx = data.context;

    const prompt = `You are 60, a smart AI sales assistant that helps sales reps be more productive. Based on the user's current context, provide ONE helpful, specific, and actionable suggestion. Your message should feel like a supportive colleague checking in.

**User Context for ${data.user.name}:**
- Calendar: ${ctx.meetingsToday} meetings today, ${ctx.meetingsThisWeek} this week
${ctx.nextMeeting ? `- Next meeting: "${ctx.nextMeeting.title}" ${ctx.nextMeeting.contactName ? `with ${ctx.nextMeeting.contactName}` : ''} starting soon` : '- No upcoming meetings scheduled'}
- Pipeline: ${ctx.totalDealsActive} active deals (${formatCurrency(ctx.pipelineValue)} total value)
- Deal health: ${ctx.dealsAtRisk} at risk, ${ctx.dealsClosingSoon} closing this week
- Recent results: ${ctx.recentWins} wins, ${ctx.recentLosses} losses (last 7 days)
- Tasks: ${ctx.tasksOverdue} overdue, ${ctx.tasksDueToday} due today, ${ctx.tasksCompletedThisWeek} completed this week
- Relationships: ${ctx.ghostRiskContacts} ghost risks, ${ctx.neglectedContacts} neglected contacts
- Activity: ${ctx.emailsSentThisWeek} emails sent, ${ctx.meetingsAttendedThisWeek} meetings attended this week

Based on this context, choose the MOST relevant suggestion type and provide a personalized message:

**Suggestion Types:**
- "encouragement": For positive momentum (wins, good productivity, hitting goals)
- "suggestion": For actionable opportunities (ghost risks to address, deals to focus on)
- "insight": For interesting patterns or observations (productivity trends, win rate)
- "reminder": For upcoming important events or deadlines
- "coaching": For gentle productivity or habit improvements

**Respond with JSON:**
{
  "type": "encouragement" | "suggestion" | "insight" | "reminder" | "coaching",
  "message": "Your personalized message (2-3 sentences, specific and actionable)",
  "emoji": "Single relevant emoji for the message type",
  "action": {
    "label": "Button text (optional, max 4 words)",
    "type": "deal" | "contact" | "task" | "calendar" | "pipeline" | "email"
  }
}

**Examples:**
- If recent wins: {"type": "encouragement", "message": "Amazing week! You've closed 2 deals worth $50K. Your close rate is 40% above average. Keep that momentum going!", "emoji": "🎉", "action": {"label": "View pipeline", "type": "pipeline"}}
- If ghost risks: {"type": "suggestion", "message": "Heads up: 3 contacts haven't responded in 14+ days. A quick check-in might prevent them from going cold.", "emoji": "👻", "action": {"label": "View ghost risks", "type": "contact"}}
- If overdue tasks: {"type": "coaching", "message": "You have 5 overdue tasks. Consider time-blocking 30 minutes today to knock out the quick wins.", "emoji": "⏰", "action": {"label": "View tasks", "type": "task"}}
- If meeting prep: {"type": "reminder", "message": "Your call with Sarah at Acme is in 45 minutes. Last time she mentioned budget concerns - might be worth addressing early.", "emoji": "📅", "action": {"label": "Prep meeting", "type": "calendar"}}

Be specific, use their actual numbers, and sound human - not robotic.`;

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': Deno.env.get('GEMINI_API_KEY') || '',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 400 },
      }),
    });

    if (!response.ok) {
      console.warn('[proactive-simulate] Gemini API error:', response.status);
      throw new Error('Gemini API error');
    }

    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response from Gemini');

    // Parse JSON from response
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    const jsonStr = jsonMatch[1] || text;
    const parsed = JSON.parse(jsonStr.trim());

    data.aiSuggestion = {
      type: parsed.type || 'insight',
      message: parsed.message || 'Keep up the great work! Your pipeline is looking healthy.',
      emoji: parsed.emoji || '💡',
      action: parsed.action,
    };

    return data;
  } catch (error) {
    console.error('[proactive-simulate] Error generating AI smart suggestion:', error);

    // Generate contextual fallback based on actual data
    const ctx = data.context;
    let fallback: AISmartSuggestionData['aiSuggestion'];

    if (ctx.recentWins > 0) {
      fallback = {
        type: 'encouragement',
        message: `Great momentum! You've closed ${ctx.recentWins} deal${ctx.recentWins > 1 ? 's' : ''} this week. Keep it up! 🎯`,
        emoji: '🎉',
        action: { label: 'View pipeline', type: 'pipeline' },
      };
    } else if (ctx.tasksOverdue > 3) {
      fallback = {
        type: 'coaching',
        message: `You have ${ctx.tasksOverdue} overdue tasks. Consider tackling the quick wins first to build momentum.`,
        emoji: '⏰',
        action: { label: 'View tasks', type: 'task' },
      };
    } else if (ctx.ghostRiskContacts > 0) {
      fallback = {
        type: 'suggestion',
        message: `${ctx.ghostRiskContacts} contact${ctx.ghostRiskContacts > 1 ? 's' : ''} might be going silent. A quick check-in could keep the conversation alive.`,
        emoji: '👻',
        action: { label: 'View contacts', type: 'contact' },
      };
    } else if (ctx.dealsClosingSoon > 0) {
      fallback = {
        type: 'reminder',
        message: `${ctx.dealsClosingSoon} deal${ctx.dealsClosingSoon > 1 ? 's' : ''} closing this week. Make sure you have clear next steps for each.`,
        emoji: '📅',
        action: { label: 'View pipeline', type: 'pipeline' },
      };
    } else {
      fallback = {
        type: 'insight',
        message: `Your pipeline looks healthy with ${ctx.totalDealsActive} active deals. Keep nurturing those relationships!`,
        emoji: '💪',
        action: { label: 'View pipeline', type: 'pipeline' },
      };
    }

    data.aiSuggestion = fallback;
    return data;
  }
}

/**
 * Build AI Smart Suggestion Slack blocks
 */
function buildRealAISmartSuggestionBlocks(data: AISmartSuggestionData): { text: string; blocks: any[] } {
  const blocks: any[] = [];
  const suggestion = data.aiSuggestion!;

  // Type-based styling
  const typeConfig: Record<string, { header: string; style: string }> = {
    encouragement: { header: '🌟 60 says...', style: 'Great news!' },
    suggestion: { header: '💡 60 suggests...', style: 'Quick tip' },
    insight: { header: '📊 60 noticed...', style: 'Insight' },
    reminder: { header: '⏰ 60 reminder', style: 'Heads up' },
    coaching: { header: '🎯 60 coaching tip', style: 'Pro tip' },
  };

  const config = typeConfig[suggestion.type] || typeConfig.insight;

  // Header
  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: config.header, emoji: true },
  });

  // Main message with emoji
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `${suggestion.emoji} ${suggestion.message}` },
  });

  // Context stats
  const ctx = data.context;
  const statsLine = [
    `📅 ${ctx.meetingsToday} meetings today`,
    `✅ ${ctx.tasksOverdue + ctx.tasksDueToday} tasks to do`,
    `💰 ${ctx.totalDealsActive} active deals`,
  ].join(' • ');

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: statsLine }],
  });

  // Action button if provided
  if (suggestion.action) {
    blocks.push({ type: 'divider' });

    const actionUrl = getActionUrl(suggestion.action.type, suggestion.action.id);
    const buttons: any[] = [
      {
        type: 'button',
        text: { type: 'plain_text', text: suggestion.action.label || 'Take action', emoji: true },
        url: actionUrl,
        style: 'primary',
      },
    ];

    // Add secondary actions if present
    if (suggestion.secondaryActions) {
      suggestion.secondaryActions.slice(0, 2).forEach((action) => {
        buttons.push({
          type: 'button',
          text: { type: 'plain_text', text: action.label, emoji: true },
          url: getActionUrl(action.type, action.id),
        });
      });
    }

    blocks.push({ type: 'actions', elements: buttons });
  }

  // Footer
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: '_Your AI sales assistant • Always watching your back_' }],
  });

  return {
    text: `60: ${suggestion.message}`,
    blocks,
  };
}

/**
 * Helper: Get action URL based on type
 */
function getActionUrl(type: string, id?: string): string {
  const urlMap: Record<string, string> = {
    deal: id ? `${appUrl}/deals/${id}` : `${appUrl}/pipeline`,
    contact: id ? `${appUrl}/contacts/${id}` : `${appUrl}/contacts`,
    task: id ? `${appUrl}/tasks/${id}` : `${appUrl}/tasks`,
    calendar: `${appUrl}/calendar`,
    pipeline: `${appUrl}/pipeline`,
    email: `https://mail.google.com`,
  };
  return urlMap[type] || `${appUrl}`;
}

function buildInAppPayload(feature: ProactiveSimulateFeature): {
  title: string;
  message: string;
  type: NotificationType;
  category: NotificationCategory;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
} {
  const meta: Record<ProactiveSimulateFeature, { title: string; message: string; category: NotificationCategory }> = {
    morning_brief: {
      title: 'Morning Brief (Simulated)',
      message: 'Your day is set. Review today’s meetings, tasks, and top deal priorities.',
      category: 'team',
    },
    sales_assistant_digest: {
      title: 'Sales Assistant Digest (Simulated)',
      message: 'You have new action items: respond to emails, address ghost risk, and prep upcoming meetings.',
      category: 'task',
    },
    pre_meeting_nudge: {
      title: 'Pre‑Meeting Nudge (Simulated)',
      message: 'Meeting starts soon — here are your top talking points and risks.',
      category: 'meeting',
    },
    post_call_summary: {
      title: 'Post‑Call Summary (Simulated)',
      message: 'Summary + suggested next steps are ready. Draft follow‑up available.',
      category: 'meeting',
    },
    stale_deal_alert: {
      title: 'Stale Deal Alert (Simulated)',
      message: 'A deal has gone quiet. Suggested next steps are ready.',
      category: 'deal',
    },
    email_reply_alert: {
      title: 'Email Reply Received (Simulated)',
      message: 'New inbound reply received. Suggested response and next steps ready.',
      category: 'task',
    },
    hitl_followup_email: {
      title: 'HITL Follow‑up Email (Simulated)',
      message: 'Approval requested for an AI-generated follow-up email draft.',
      category: 'workflow',
    },
    ai_smart_suggestion: {
      title: '60 Smart Suggestion',
      message: 'Your AI sales assistant has a suggestion for you.',
      category: 'team',
    },
    orchestrator_smoke_test: {
      title: 'Orchestrator Smoke Test',
      message: 'Running smoke tests for all event sequences.',
      category: 'system',
    },
  };

  const item = meta[feature];
  
  // Route email-related notifications to Email Action Center
  const isEmailRelated = feature === 'email_reply_alert' || feature === 'hitl_followup_email';
  const actionUrl = isEmailRelated ? '/email-actions' : '/platform/proactive-simulator';
  
  return {
    title: item.title,
    message: item.message,
    type: 'info',
    category: item.category,
    actionUrl,
    metadata: { source: 'proactive_simulator', feature },
  };
}

function baseBlocks(featureLabel: string, subtitle: string): any[] {
  return [
    { type: 'header', text: { type: 'plain_text', text: `⚡ Proactive 60 (Sim) — ${featureLabel}`, emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: subtitle } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `Sent from Proactive Simulator • ${new Date().toLocaleString()}` }] },
    { type: 'divider' },
  ];
}

// ============================================================================
// Enhanced Block Builders with Real Data + Clickable Links
// ============================================================================

function buildRealMorningBriefBlocks(data: MorningBriefRealData): { text: string; blocks: any[] } {
  const blocks: any[] = [];
  const currencyCode = data.currencyCode || 'GBP';
  const locale = data.currencyLocale || 'en-GB';
  const fmtCurrency = (v: number) => formatCurrency(v, currencyCode, locale);

  // Header
  blocks.push({ type: 'header', text: { type: 'plain_text', text: `☀️ Good morning, ${data.userName}!`, emoji: true } });
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${data.date}*\nHere's your day at a glance.` } });
  blocks.push({ type: 'divider' });

  // Stats overview
  const totalTasks = data.tasks.overdue.length + data.tasks.dueToday.length;
  blocks.push({
    type: 'section',
    fields: [
      { type: 'mrkdwn', text: `*📅 Meetings*\n${data.meetings.length} today` },
      { type: 'mrkdwn', text: `*✅ Tasks*\n${totalTasks} active` },
      { type: 'mrkdwn', text: `*👻 Ghost risk*\n${data.ghostRisks.length} contacts` },
      { type: 'mrkdwn', text: `*💰 Deals*\n${data.deals.length} closing soon` },
    ],
  });

  // Meetings with clickable links
  if (data.meetings.length > 0) {
    blocks.push({ type: 'divider' });
    const meetingsText = data.meetings.slice(0, 5).map((m) => {
      const parts: string[] = [`• *${m.time}* — ${m.title}`];
      if (m.contactName) {
        parts.push(`with ${mrkdwnLink(m.contactName, 'contact', m.contactId)}`);
      }
      if (m.dealValue) {
        parts.push(`(${fmtCurrency(m.dealValue)})`);
      }
      if (m.isImportant) {
        parts.push('🔥');
      }
      return parts.join(' ');
    }).join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*📅 Today's Meetings*\n\n${meetingsText}` },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'View Calendar', emoji: true },
        url: link('calendar'),
      },
    });
  }

  // Tasks with clickable links
  if (totalTasks > 0) {
    blocks.push({ type: 'divider' });
    const taskLines: string[] = [];
    if (data.tasks.overdue.length > 0) {
      taskLines.push('*⚠️ Overdue:*');
      data.tasks.overdue.slice(0, 3).forEach((t) => {
        const dealPart = t.dealId ? ` → ${mrkdwnLink(t.dealName || 'Deal', 'deal', t.dealId)}` : '';
        taskLines.push(`• ${mrkdwnLink(t.title, 'task', t.id)} _(${t.daysOverdue}d overdue)_${dealPart}`);
      });
    }
    if (data.tasks.dueToday.length > 0) {
      if (taskLines.length > 0) taskLines.push('');
      taskLines.push('*📋 Due today:*');
      data.tasks.dueToday.slice(0, 3).forEach((t) => {
        const dealPart = t.dealId ? ` → ${mrkdwnLink(t.dealName || 'Deal', 'deal', t.dealId)}` : '';
        taskLines.push(`• ${mrkdwnLink(t.title, 'task', t.id)}${dealPart}`);
      });
    }
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: taskLines.join('\n') } });
  }

  // Deals closing soon with clickable links
  if (data.deals.length > 0) {
    blocks.push({ type: 'divider' });
    const dealsText = data.deals.slice(0, 4).map((d) => {
      const riskBadge = d.isAtRisk ? ' ⚠️' : '';
      const closeInfo = d.daysUntilClose !== undefined ? ` _(${d.daysUntilClose}d)_` : '';
      return `• ${mrkdwnLink(d.name, 'deal', d.id)} — ${fmtCurrency(d.value)}${closeInfo}${riskBadge}`;
    }).join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*🎯 Deals closing this week*\n\n${dealsText}` },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'View Pipeline', emoji: true },
        url: link('pipeline'),
      },
    });
  }

  // Ghost risks with clickable links
  if (data.ghostRisks.length > 0) {
    blocks.push({ type: 'divider' });
    const ghostText = data.ghostRisks.slice(0, 3).map((g) => {
      const companyPart = g.companyName ? ` at ${g.companyName}` : '';
      return `• ${mrkdwnLink(g.contactName, 'contact', g.contactId)}${companyPart} — ${g.daysSinceContact}d since contact`;
    }).join('\n');
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*👻 Ghost Risk Contacts*\n\n${ghostText}` } });
  }

  // Emails to respond
  if (data.emailsToRespond > 0) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `📬 *${data.emailsToRespond}* email${data.emailsToRespond !== 1 ? 's' : ''} need${data.emailsToRespond === 1 ? 's' : ''} response` }] });
  }

  // Actions
  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'actions',
    elements: [
      { type: 'button', text: { type: 'plain_text', text: '📋 View Full Day', emoji: true }, url: link('calendar') },
      { type: 'button', text: { type: 'plain_text', text: '🎯 Go to Pipeline', emoji: true }, url: link('pipeline') },
    ],
  });

  // Context
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: '_Proactive 60 simulation with real data_' }] });

  return {
    text: `Good morning ${data.userName}! Here's your day at a glance.`,
    blocks,
  };
}

// ============================================================================
// Orchestrator Smoke Test
// ============================================================================

type EventType =
  | 'meeting_ended'
  | 'pre_meeting_90min'
  | 'email_received'
  | 'proposal_generation'
  | 'calendar_find_times'
  | 'stale_deal_revival'
  | 'campaign_daily_check'
  | 'coaching_weekly'
  | 'deal_risk_scan';

interface SmokeTestResult {
  event_type: string;
  status: 'passed' | 'failed' | 'paused';
  job_id?: string;
  steps_completed: number;
  total_steps: number;
  duration_ms: number;
  error?: string;
}

/**
 * Build test payload for each event type
 */
function getTestPayload(type: EventType, entityIds?: SimulateRequest['entityIds']): Record<string, unknown> {
  const now = Date.now();
  switch (type) {
    case 'meeting_ended':
      return {
        meeting_id: entityIds?.meetingId || 'smoke-test',
        title: 'Smoke Test Meeting',
        transcript_available: true,
        ended_at: new Date().toISOString(),
      };
    case 'pre_meeting_90min':
      return {
        meeting_id: entityIds?.meetingId || 'smoke-test',
        title: 'Upcoming Meeting',
        start_time: new Date(now + 90 * 60 * 1000).toISOString(),
      };
    case 'email_received':
      return {
        email_address: 'test@example.com',
        history_id: `smoke-${now}`,
      };
    case 'proposal_generation':
      return {
        deal_id: entityIds?.dealId || 'smoke-test',
        contact_id: entityIds?.contactId || 'smoke-test',
      };
    case 'calendar_find_times':
      return {
        contact_id: entityIds?.contactId || 'smoke-test',
        scheduling_request: 'Find 30 min next week',
      };
    case 'stale_deal_revival':
      return {
        deal_id: entityIds?.dealId || 'smoke-test',
      };
    case 'campaign_daily_check':
      return {};
    case 'coaching_weekly':
      return {};
    case 'deal_risk_scan':
      return {};
  }
}

/**
 * Run orchestrator smoke test for one or all event types
 */
async function runOrchestratorSmokeTest(
  orgId: string,
  targetUserId: string,
  entityIds?: SimulateRequest['entityIds'],
  sequencesToTest?: string[]
): Promise<{ results: SmokeTestResult[]; summary: any }> {
  const allEventTypes: EventType[] = [
    'meeting_ended',
    'pre_meeting_90min',
    'email_received',
    'proposal_generation',
    'calendar_find_times',
    'stale_deal_revival',
    'campaign_daily_check',
    'coaching_weekly',
    'deal_risk_scan',
  ];

  const eventTypes = sequencesToTest && sequencesToTest.length > 0
    ? (sequencesToTest.filter(s => allEventTypes.includes(s as EventType)) as EventType[])
    : allEventTypes;

  const results: SmokeTestResult[] = [];
  const TIMEOUT_PER_SEQUENCE = 30000; // 30 seconds

  // Run tests sequentially to avoid overwhelming the system
  for (const eventType of eventTypes) {
    const startTime = Date.now();

    try {
      const payload = getTestPayload(eventType, entityIds);

      // Fire synchronous event to agent-orchestrator
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_PER_SEQUENCE);

      const response = await fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: eventType,
          source: 'manual',
          org_id: orgId,
          user_id: targetUserId,
          payload,
          sync: true, // BLOCKING — wait for result
          idempotency_key: `smoke_test:${eventType}:${Date.now()}`,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const duration = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        results.push({
          event_type: eventType,
          status: 'failed',
          steps_completed: 0,
          total_steps: 0,
          duration_ms: duration,
          error: `HTTP ${response.status}: ${errorText}`,
        });
        continue;
      }

      const data = await response.json();

      // Determine status based on response
      let status: 'passed' | 'failed' | 'paused' = 'passed';
      if (data.error) {
        status = 'failed';
      } else if (data.status === 'paused' || data.pending_approvals?.length > 0) {
        // HITL sequences correctly paused — treat as passing
        status = 'paused';
      }

      results.push({
        event_type: eventType,
        status,
        job_id: data.job_id,
        steps_completed: data.steps_completed || 0,
        total_steps: data.total_steps || 0,
        duration_ms: duration,
        error: data.error,
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      results.push({
        event_type: eventType,
        status: 'failed',
        steps_completed: 0,
        total_steps: 0,
        duration_ms: duration,
        error: message,
      });
    }
  }

  // Calculate summary
  const summary = {
    total: results.length,
    passed: results.filter(r => r.status === 'passed').length,
    paused: results.filter(r => r.status === 'paused').length,
    failed: results.filter(r => r.status === 'failed').length,
    duration_ms: results.reduce((sum, r) => sum + r.duration_ms, 0),
  };

  return { results, summary };
}

function buildFeatureBlocks(feature: ProactiveSimulateFeature): { text: string; blocks: any[]; hitlMode?: boolean } {
  // ==========================================================================
  // DEMO SCENARIO: A day in the life with 60
  //
  // Key Deal: "Nexus Technologies" - $85,000 Enterprise Platform deal
  // Contact: Sarah Chen, VP of Operations
  // Stage: Proposal (closing this week)
  //
  // Secondary: "CloudSync Solutions" - $52,000 deal gone cold (18 days)
  // Ghost Risk: "Meridian Health" - Marcus Thompson hasn't responded
  // ==========================================================================

  switch (feature) {
    case 'morning_brief': {
      const blocks = [
        ...baseBlocks('☀️ Good morning!', "Here's your day at a glance — let's make it count."),
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*🎯 Top 3 priorities today:*\n1. Prep for *Nexus Technologies* call at 2pm — $85K deal closing this week\n2. Follow up on *CloudSync* proposal — no response in 18 days\n3. Address ghost risk: Marcus at Meridian Health (last contact: 14 days)',
          },
        },
        { type: 'divider' },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: '*📅 Meetings today*\n`2:00pm` Sarah Chen (Nexus)\n`4:30pm` Team pipeline review' },
            { type: 'mrkdwn', text: '*✅ Tasks due*\n3 tasks • 1 overdue\n_Send revised pricing to Nexus_' },
          ],
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: '*💰 Pipeline snapshot*\n$312K total • 4 deals\n2 closing this week' },
            { type: 'mrkdwn', text: '*⚠️ Needs attention*\n1 ghost risk\n1 stale deal (18+ days)' },
          ],
        },
        { type: 'divider' },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: '💡 _Your Nexus call is your highest-value meeting today. I\'ve prepared talking points — check your pre-meeting nudge 10 min before._' }],
        },
        {
          type: 'actions',
          elements: [
            { type: 'button', text: { type: 'plain_text', text: '📅 View Calendar', emoji: true }, url: `${appUrl}/calendar` },
            { type: 'button', text: { type: 'plain_text', text: '💼 Open Pipeline', emoji: true }, url: `${appUrl}/pipeline` },
          ],
        },
      ];
      return { text: '☀️ Good morning! Here\'s your day with 60', blocks };
    }

    case 'sales_assistant_digest': {
      const tasks = [
        { title: 'Send revised pricing to Sarah Chen (Nexus) — they asked for volume discount', dueInDays: 0, dealName: 'Nexus Technologies', value: 85000 },
        { title: 'Re-engage Marcus Thompson at Meridian Health — ghost risk 14 days', dueInDays: 0, dealName: 'Meridian Health', value: 42000 },
        { title: 'Follow up on CloudSync proposal — decision expected last week', dueInDays: 1, dealName: 'CloudSync Solutions', value: 52000 },
      ];

      const blocks: any[] = [
        ...baseBlocks('🔔 Action Items Detected', `I found *${tasks.length} items* that need your attention. One-click to add to your tasks:`),
      ];

      for (const t of tasks) {
        const urgency = t.dueInDays === 0 ? '🔴 *Urgent*' : '🟡 *Soon*';
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${urgency} — *${t.dealName}* ($${t.value.toLocaleString()})\n${t.title}`
          },
          accessory: {
            type: 'button',
            text: { type: 'plain_text', text: '➕ Add Task', emoji: true },
            action_id: 'create_task_from_assistant',
            value: JSON.stringify({ title: t.title, dueInDays: t.dueInDays, source: 'proactive_notification' }),
            style: 'primary',
          },
        });
      }

      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `💰 _These 3 deals represent *$${(85000+42000+52000).toLocaleString()}* in pipeline value._` }],
      });
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '➕ Add All 3 Tasks', emoji: true },
            action_id: 'add_all_tasks',
            value: JSON.stringify({ tasks }),
            style: 'primary',
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Dismiss', emoji: true },
            action_id: 'dismiss_tasks',
            value: JSON.stringify({ source: 'proactive_simulator' }),
          },
        ],
      });

      return { text: '🔔 60 found 3 action items that need your attention', blocks };
    }

    case 'pre_meeting_nudge': {
      const blocks = [
        ...baseBlocks('📞 Meeting in 10 minutes', '*Nexus Technologies* — Proposal Review with Sarah Chen'),
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*👤 About Sarah Chen*\nVP of Operations at Nexus Technologies\n• 8 years at Nexus, promoted from Director in 2022\n• Led their last 3 vendor selections\n• Active on LinkedIn — recently posted about "operational efficiency"',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*🏢 About Nexus Technologies*\nMid-market SaaS company • 180 employees • Series B ($24M)\n• Growing 40% YoY, expanding ops team\n• Current pain: manual processes slowing deal velocity\n• Evaluated 2 competitors last quarter (didn\'t buy)',
          },
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*🎯 Recommended talking points:*\n\n1️⃣ *Open with their growth* — "Congrats on the expansion. How is the ops team scaling?"\n\n2️⃣ *Address the volume discount ask* — You have room to offer 12% on 3-year commit\n\n3️⃣ *Uncover timeline pressure* — Their fiscal year ends in 6 weeks. Ask: "Is there budget timing we should factor in?"\n\n4️⃣ *Security question incoming* — They asked about SOC 2 last call. Proactively share the compliance doc.',
          },
        },
        { type: 'divider' },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: '📊 _Deal health: Strong • Last contact: 3 days ago • Win probability: 72%_' }],
        },
        {
          type: 'actions',
          elements: [
            { type: 'button', text: { type: 'plain_text', text: '👤 View Contact', emoji: true }, url: `${appUrl}/contacts` },
            { type: 'button', text: { type: 'plain_text', text: '💼 View Deal', emoji: true }, url: `${appUrl}/pipeline` },
            { type: 'button', text: { type: 'plain_text', text: '📄 Open SOC 2 Doc', emoji: true }, url: `${appUrl}/resources` },
          ],
        },
      ];
      return { text: '📞 Meeting with Sarah Chen (Nexus) starts in 10 minutes', blocks };
    }

    case 'post_call_summary': {
      const blocks: any[] = [
        ...baseBlocks('📝 Call Summary Ready', '*Nexus Technologies* — Proposal Review (42 min)'),
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Key Outcomes:*\n✅ Sarah confirmed budget is approved — $85K works\n✅ Timeline: Want to go live before fiscal year end (6 weeks)\n⚠️ *Blocker:* Security team needs to review. Sarah scheduling call this week.\n✅ Volume discount accepted — 12% on 3-year commit',
          },
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*📊 Call Analytics:*\n• Talk ratio: You 38% / Sarah 62% _(good listening!)_\n• Longest monologue: 2m 14s _(within ideal range)_\n• Questions asked: 12 _(strong discovery)_\n• Sentiment: Positive throughout, peaked when discussing ROI',
          },
        },
        { type: 'divider' },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '*🎯 Suggested follow-up tasks:*' },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '1. Send thank-you email with meeting recap + next steps' },
          accessory: {
            type: 'button',
            text: { type: 'plain_text', text: '➕ Add', emoji: true },
            action_id: 'create_task_from_assistant',
            value: JSON.stringify({ title: 'Send follow-up email to Sarah (Nexus) with meeting recap', dueInDays: 0, source: 'proactive_notification' }),
            style: 'primary',
          },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '2. Send SOC 2 Type II report + security questionnaire' },
          accessory: {
            type: 'button',
            text: { type: 'plain_text', text: '➕ Add', emoji: true },
            action_id: 'create_task_from_assistant',
            value: JSON.stringify({ title: 'Send security docs to Nexus (SOC 2 + questionnaire)', dueInDays: 0, source: 'proactive_notification' }),
            style: 'primary',
          },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '3. Schedule security review call with their IT team' },
          accessory: {
            type: 'button',
            text: { type: 'plain_text', text: '➕ Add', emoji: true },
            action_id: 'create_task_from_assistant',
            value: JSON.stringify({ title: 'Coordinate security review call — Nexus IT + our security team', dueInDays: 2, source: 'proactive_notification' }),
            style: 'primary',
          },
        },
        { type: 'divider' },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: '💡 _60 can draft your follow-up email. Want me to prepare it for your review?_' }],
        },
        {
          type: 'actions',
          elements: [
            { type: 'button', text: { type: 'plain_text', text: '✍️ Draft Follow-up', emoji: true }, action_id: 'draft_followup', style: 'primary' },
            { type: 'button', text: { type: 'plain_text', text: '📹 View Recording', emoji: true }, url: `${appUrl}/meetings` },
          ],
        },
      ];
      return { text: '📝 Call summary ready: Nexus Technologies (42 min)', blocks };
    }

    case 'stale_deal_alert': {
      const blocks = [
        ...baseBlocks('⚠️ Deal Going Cold', '*CloudSync Solutions* — $52,000 • Proposal Stage'),
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*🕐 18 days since last activity*\n\nLast contact: Email sent Dec 15 (proposal + pricing)\nContact: David Park, Head of IT\nExpected close: Was Dec 22 — now overdue',
          },
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*🔍 What I found:*\n• David hasn\'t opened your last 2 emails\n• Their company blog announced budget planning for Q1\n• A competitor (TechFlow) was mentioned in their recent job posting',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*✍️ Suggested re-engagement message:*\n\n_"Hi David — I know Q1 planning is in full swing. Quick question: is the platform evaluation still on your roadmap, or should we reconnect in a few weeks? Happy to adjust timing to fit your priorities."_',
          },
        },
        { type: 'divider' },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: '💡 _This message is soft and gives them an easy out — which often prompts a real response._' }],
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '📧 Send Re-engagement Email', emoji: true },
              action_id: 'create_task_from_assistant',
              value: JSON.stringify({ title: 'Send re-engagement email to David Park (CloudSync)', dueInDays: 0, source: 'stale_deal_alert' }),
              style: 'primary',
            },
            { type: 'button', text: { type: 'plain_text', text: '💼 View Deal', emoji: true }, url: `${appUrl}/pipeline` },
            { type: 'button', text: { type: 'plain_text', text: '👤 View Contact', emoji: true }, url: `${appUrl}/contacts` },
          ],
        },
      ];
      return { text: '⚠️ Deal alert: CloudSync Solutions hasn\'t responded in 18 days', blocks };
    }

    case 'email_reply_alert': {
      // Use a demo contact with logo
      const replyContact = DEMO_CONTACTS[Math.floor(Math.random() * DEMO_CONTACTS.length)];
      const replyDomain = replyContact.email.split('@')[1];
      const replyLogoUrl = `https://img.logo.dev/${replyDomain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ`;
      
      const blocks = [
        ...baseBlocks('📬 New Reply — High Priority', `*${replyContact.name}* from ${replyContact.company} just responded`),
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*From:* ${replyContact.name} (${replyContact.email})\n*Subject:* Re: ${replyContact.company} Proposal + Next Steps\n*Received:* 2 minutes ago`,
          },
          accessory: {
            type: 'image',
            image_url: replyLogoUrl,
            alt_text: `${replyContact.company} logo`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*📝 Summary:*\n_"Thanks for the call! This all looks good. Quick Qs: 1) Can we do quarterly billing instead of annual? 2) What\'s the onboarding timeline? Our team lead is anxious about the transition. Let\'s aim to wrap this up this month."_',
          },
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*🎯 Suggested reply points:*\n1. ✅ Quarterly billing is available (adds 3% — mention as option)\n2. ✅ Security review typically 3-5 business days\n3. 📅 Offer to schedule James + your security team call tomorrow\n4. 🤝 Reinforce the Jan 15th target — show urgency alignment',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*✍️ Draft reply:*\n_"Hi Sarah — great questions! Quick answers: quarterly billing is available (small 3% adjustment), and security reviews typically take 3-5 days. Happy to get James on a call with our security team tomorrow if that helps hit the 15th. Want me to send some times?"_',
          },
        },
        { type: 'divider' },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: '🔥 _This deal is hot — she\'s driving toward close. Fast response recommended._' }],
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '✍️ Reply Now', emoji: true },
              url: 'https://mail.google.com',
              style: 'primary',
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '➕ Add Follow-up Task', emoji: true },
              action_id: 'create_task_from_assistant',
              value: JSON.stringify({ title: 'Reply to Sarah (Nexus) — billing + security call scheduling', dueInDays: 0, source: 'email_reply_alert' }),
            },
            { type: 'button', text: { type: 'plain_text', text: '💼 View Deal', emoji: true }, url: `${appUrl}/pipeline` },
          ],
        },
      ];
      return { text: '📬 Sarah Chen (Nexus Technologies) just replied — high priority', blocks };
    }

    case 'hitl_followup_email': {
      // Use the same contact that will be used for the HITL approval
      const demoContact = DEMO_CONTACTS[Math.floor(Math.random() * DEMO_CONTACTS.length)];
      const firstName = demoContact.name.split(' ')[0];
      const domain = demoContact.email.split('@')[1];
      const logoUrl = `https://img.logo.dev/${domain}?token=pk_X-1ZO13GSgeOoUrIuJ6GMQ`;
      
      const blocks = [
        ...baseBlocks('✍️ Follow-up Email Ready', `*Review before sending* — ${demoContact.company} post-call follow-up`),
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*To:* ${demoContact.name} (${demoContact.email})\n*Subject:* Great call today — next steps for ${demoContact.company}`,
          },
          accessory: {
            type: 'image',
            image_url: logoUrl,
            alt_text: `${demoContact.company} logo`,
          },
        },
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*📝 Draft email:*\n\n_Hi ${firstName},_\n\n_Thanks for the great conversation today! I'm excited about the momentum we're building._\n\n_Quick recap of what we covered:_\n_• Discussed your current workflow challenges_\n_• Walked through our integration capabilities_\n_• Timeline: Pilot kickoff in the next 2 weeks_\n_• Next step: Technical demo with your team_\n\n_Would Thursday at 2pm work for the technical demo? I'll send over the prep materials beforehand._\n\n_Looking forward to working together!_\n\n_Best,_\n_Andrew_`,
          },
        },
        { type: 'divider' },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: '💡 _Tone: Professional but warm • Length: Concise • Personalized for your conversation_' }],
        },
      ];
      return { text: '✍️ 60 drafted your follow-up email — ready for review', blocks, hitlMode: true };
    }

    case 'ai_smart_suggestion': {
      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '💡 *Hey — quick thought from 60:*',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: "Congrats on the Nexus call today! 🎉 Sarah seemed really engaged, and you're on track to close this by the 15th.\n\nWhile you're in the zone, I noticed *CloudSync* has been quiet for 18 days. David Park hasn't opened your last email. A quick \"checking in\" message now could re-spark that conversation before it goes fully cold.\n\nWant me to draft something?",
          },
        },
        { type: 'divider' },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: '*Your week so far:*\n📞 4 calls completed\n📧 12 emails sent\n✅ 8 tasks done' },
            { type: 'mrkdwn', text: '*Pipeline health:*\n💰 $312K active\n🎯 2 deals closing soon\n⚠️ 1 at risk' },
          ],
        },
        { type: 'divider' },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '✍️ Draft CloudSync Email', emoji: true },
              action_id: 'create_task_from_assistant',
              value: JSON.stringify({ title: 'Send re-engagement email to David Park (CloudSync)', dueInDays: 0, source: 'ai_smart_suggestion' }),
              style: 'primary',
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '💼 View Pipeline', emoji: true },
              url: `${appUrl}/pipeline`,
            },
          ],
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: '_60 sends helpful nudges throughout your day based on your activity and pipeline health._' }],
        },
      ];
      return { text: '💡 60 has a suggestion for you', blocks };
    }
  }
}

function buildHitlBlocks(approvalId: string): any[] {
  const draft = buildSimulatedHitlFollowUpEmailDraft();
  const draftText = [
    `Subject: ${draft.subject}`,
    '',
    draft.body.trim(),
  ]
    .filter(Boolean)
    .join('\n');

  return [
    ...baseBlocks('HITL Follow‑up Email', '*Approval required.* Review and approve/edit this draft:'),
    { type: 'section', text: { type: 'mrkdwn', text: `\`\`\`\n${draftText}\n\`\`\`` } },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve', emoji: true },
          style: 'primary',
          action_id: `approve::email_draft::${approvalId}`,
          value: JSON.stringify({}),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Edit', emoji: true },
          action_id: `edit::email_draft::${approvalId}`,
          value: JSON.stringify({}),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Reject', emoji: true },
          style: 'danger',
          action_id: `reject::email_draft::${approvalId}`,
          value: JSON.stringify({}),
        },
      ],
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: '_This is a simulation. No email will be sent unless you wire a callback._' }],
    },
  ];
}

// Demo contacts for simulated emails
const DEMO_CONTACTS = [
  { name: 'Sarah Ellis-Barker', email: 'sarah@hamilton-barnes.co.uk', company: 'Hamilton Barnes' },
  { name: 'Dan Debnam', email: 'dan@conturae.com', company: 'Conturae' },
  { name: 'Anton Peruga', email: 'anton@resource-agent.ai', company: 'Resource Agent' },
  { name: 'Will Kellett', email: 'will.kellett@evolvegrp.io', company: 'Evolve Group' },
];

function buildSimulatedHitlFollowUpEmailDraft(): { subject: string; body: string; recipient: string; recipientName: string } {
  // Pick a random demo contact
  const contact = DEMO_CONTACTS[Math.floor(Math.random() * DEMO_CONTACTS.length)];
  const firstName = contact.name.split(' ')[0];
  
  return {
    subject: `Great call today — next steps for ${contact.company}`,
    recipient: contact.email,
    recipientName: contact.name,
    body: `Hi ${firstName},

Thanks so much for taking the time to chat today. It was great learning more about ${contact.company} and the challenges you're facing with your current workflow.

As we discussed, here's a quick recap of the next steps:

**1. Technical Demo** — I'll set up a session with your team to walk through the integration specifically for your use case.

**2. Success Criteria** — Let's nail down the specific metrics you'd like to track (you mentioned pipeline visibility and response times).

**3. Timeline** — Targeting a pilot kickoff in the next 2 weeks, with full rollout by end of month.

Would Thursday at 2pm work for the technical demo? I'll send over the prep materials beforehand.

Looking forward to working together!

Best,
Andrew`,
  };
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  try {
    const body = (await req.json()) as SimulateRequest;
    if (!body?.orgId) return json({ success: false, error: 'orgId is required' }, 400);
    if (!body?.feature) return json({ success: false, error: 'feature is required' }, 400);

    const authCtx = await getAuthContext(req, supabase, supabaseServiceKey);

    // Require platform admin for this simulator (safe by default)
    if (authCtx.mode === 'user' && !authCtx.isPlatformAdmin) {
      return json({ success: false, error: 'Unauthorized: platform admin required' }, 403);
    }

    const targetUserId = body.targetUserId || authCtx.userId;
    if (!targetUserId) return json({ success: false, error: 'targetUserId is required' }, 400);

    // Special handling for orchestrator_smoke_test
    if (body.feature === 'orchestrator_smoke_test') {
      const { results, summary } = await runOrchestratorSmokeTest(
        body.orgId,
        targetUserId,
        body.entityIds,
        body.sequences
      );

      return json({
        success: true,
        feature: 'orchestrator_smoke_test',
        results,
        summary,
      });
    }

    const sendSlack = body.sendSlack !== false;
    const createInApp = body.createInApp !== false;
    const dryRun = body.dryRun === true;

    const simulationMode = body.simulationMode !== false; // Default true (demo data)

    const debug: Record<string, unknown> = {
      orgId: body.orgId,
      feature: body.feature,
      targetUserId,
      sendSlack,
      createInApp,
      dryRun,
      simulationMode,
    };

    // Build planned outputs up-front (even in dry run)
    // Use real data when simulationMode is false
    let text: string;
    let blocks: any[];
    let hitlMode: boolean | undefined;

    // Merge top-level entity IDs into entityIds for backwards compatibility
    const entityIds = {
      ...body.entityIds,
      meetingId: body.entityIds?.meetingId || (body as any).meetingId,
      dealId: body.entityIds?.dealId || (body as any).dealId,
      contactId: body.entityIds?.contactId || (body as any).contactId,
      emailId: body.entityIds?.emailId || (body as any).emailId,
      emailThreadId: body.entityIds?.emailThreadId || (body as any).emailThreadId,
    };

    if (!simulationMode) {
      // Real data mode - fetch from database and build enhanced blocks
      switch (body.feature) {
        case 'morning_brief': {
          // Get user name
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', targetUserId)
            .maybeSingle();
          const userName = profile?.full_name || profile?.email?.split('@')[0] || 'there';

          const briefData = await fetchMorningBriefData(supabase, body.orgId, targetUserId, userName);
          if (briefData) {
            const realResult = buildRealMorningBriefBlocks(briefData);
            text = realResult.text;
            blocks = realResult.blocks;
          } else {
            text = '☀️ All clear — no meetings, tasks, or deals need attention right now.';
            blocks = [
              { type: 'section', text: { type: 'mrkdwn', text: '*☀️ All clear!*\nNo meetings, tasks, or deals need your attention right now.' } },
              { type: 'context', elements: [{ type: 'mrkdwn', text: '_60 AI morning brief — nothing actionable found_' }] },
            ];
          }
          break;
        }
        case 'pre_meeting_nudge': {
          // Fetch meeting data and enrich with AI
          const meetingId = entityIds.meetingId;
          const nudgeData = await fetchPreMeetingNudgeData(supabase, body.orgId, targetUserId, meetingId);
          if (nudgeData) {
            // Enrich with AI-generated insights
            const enrichedData = await enrichPreMeetingWithAI(nudgeData);
            const realResult = buildRealPreMeetingNudgeBlocks(enrichedData);
            text = realResult.text;
            blocks = realResult.blocks;
          } else {
            text = '📅 No upcoming meetings found in the next 30 minutes.';
            blocks = [
              { type: 'section', text: { type: 'mrkdwn', text: meetingId
                ? `*📅 Meeting not found*\nCould not find meeting \`${meetingId}\` in your calendar.`
                : '*📅 No upcoming meetings*\nNo meetings found in the next 30 minutes. Select a specific meeting to prep for.' } },
              { type: 'context', elements: [{ type: 'mrkdwn', text: '_60 AI pre-meeting prep_' }] },
            ];
          }
          break;
        }
        case 'post_call_summary': {
          // Fetch post-call summary data from meeting analysis tables
          const meetingId = entityIds.meetingId;
          const postCallData = await fetchPostCallSummaryData(supabase, body.orgId, targetUserId, meetingId);
          if (postCallData) {
            const realResult = buildRealPostCallSummaryBlocks(postCallData);
            text = realResult.text;
            blocks = realResult.blocks;
          } else {
            text = '📞 No recent meeting found for post-call summary.';
            blocks = [
              { type: 'section', text: { type: 'mrkdwn', text: meetingId
                ? `*📞 No analysis found*\nMeeting \`${meetingId}\` has no transcript or analysis available yet.`
                : '*📞 No recent meetings*\nNo recent meetings with transcripts found. Select a specific meeting.' } },
              { type: 'context', elements: [{ type: 'mrkdwn', text: '_60 AI post-call summary_' }] },
            ];
          }
          break;
        }
        case 'stale_deal_alert': {
          // Fetch stale deal data and enrich with AI re-engagement strategy
          const dealId = entityIds.dealId;
          const staleDealData = await fetchStaleDealData(supabase, body.orgId, targetUserId, dealId);
          if (staleDealData) {
            const enrichedData = await enrichStaleDealWithAI(staleDealData);
            const realResult = buildRealStaleDealAlertBlocks(enrichedData);
            text = realResult.text;
            blocks = realResult.blocks;
          } else {
            text = '💼 No stale deals found — your pipeline is active.';
            blocks = [
              { type: 'section', text: { type: 'mrkdwn', text: dealId
                ? `*💼 Deal not found*\nCould not find deal \`${dealId}\` or it has recent activity.`
                : '*💼 All deals active*\nNo stale deals found. Your pipeline looks healthy!' } },
              { type: 'context', elements: [{ type: 'mrkdwn', text: '_60 AI stale deal alert_' }] },
            ];
          }
          break;
        }
        case 'email_reply_alert': {
          // Fetch email reply data and enrich with AI reply suggestion
          const emailId = entityIds.emailId;
          const emailData = await fetchEmailReplyData(supabase, body.orgId, targetUserId, emailId);
          if (emailData) {
            const enrichedData = await enrichEmailReplyWithAI(emailData);
            const realResult = buildRealEmailReplyAlertBlocks(enrichedData);
            text = realResult.text;
            blocks = realResult.blocks;
          } else {
            text = '📧 No emails needing a reply right now.';
            blocks = [
              { type: 'section', text: { type: 'mrkdwn', text: '*📧 No emails need replies*\nNo unanswered emails found that need your attention.' } },
              { type: 'context', elements: [{ type: 'mrkdwn', text: '_60 AI email reply alert_' }] },
            ];
          }
          break;
        }
        case 'ai_smart_suggestion': {
          // Get user name for personalized context
          const { data: userProfile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', targetUserId)
            .maybeSingle();
          const smartUserName = userProfile?.full_name || userProfile?.email?.split('@')[0] || 'there';

          // Gather comprehensive user context and generate AI-powered smart suggestion
          const contextData = await gatherUserContext(supabase, body.orgId, targetUserId, smartUserName);
          const enrichedData = await generateAISmartSuggestion(contextData);
          const realResult = buildRealAISmartSuggestionBlocks(enrichedData);
          text = realResult.text;
          blocks = realResult.blocks;
          break;
        }
        default: {
          // Fall back to demo for features not yet implemented in real mode
          const fallback = buildFeatureBlocks(body.feature);
          text = fallback.text;
          blocks = fallback.blocks;
          hitlMode = fallback.hitlMode;
        }
      }
    } else {
      // Demo mode - use hardcoded data
      const demo = buildFeatureBlocks(body.feature);
      text = demo.text;
      blocks = demo.blocks;
      hitlMode = demo.hitlMode;
    }

    const inAppPayload = buildInAppPayload(body.feature);

    const result: any = {
      success: true,
      feature: body.feature,
      orgId: body.orgId,
      targetUserId,
      slack: { attempted: sendSlack, sent: false } as any,
      inApp: { attempted: createInApp, created: false } as any,
      hitl: {} as any,
      debug: { ...debug, plannedSlackText: text, plannedSlackBlocksCount: blocks.length },
    };

    if (dryRun) {
      result.debug.plannedSlackBlocks = blocks;
      result.debug.plannedInAppPayload = inAppPayload;
      return json(result);
    }

    // Slack send (if enabled)
    if (sendSlack) {
      const slack = await getSlackForOrg(supabase, body.orgId);
      if (!slack) {
        result.slack.error = 'Slack is not connected for this org';
      } else {
        const slackUserId = await getSlackUserIdForSixtyUser(supabase, body.orgId, targetUserId);
        if (!slackUserId) {
          result.slack.error = 'No Slack user mapping for target user (link Slack under Slack Settings → Personal Slack)';
        } else {
          const dmChannelId = await openDm(slack.bot_access_token, slackUserId);
          // Post base message
          const posted = await postMessageWithBlocks(slack.bot_access_token, dmChannelId, text, blocks);
          result.slack.sent = true;
          result.slack.channelId = posted.channel;
          result.slack.ts = posted.ts;

          // If this is a HITL simulation, create approval record and update message with action buttons.
          if (hitlMode) {
            // Create approval using the stored message identifiers.
            const draft = buildSimulatedHitlFollowUpEmailDraft();
            const originalContent = {
              subject: draft.subject,
              body: draft.body,
              // Slack modal looks for `recipient` (not `to`) for the "To:" context line
              recipient: draft.recipient,
              recipientName: draft.recipientName,
              recipientEmail: draft.recipient,
              to: draft.recipient,
            };

            const { data: approvalId, error: approvalError } = await supabase.rpc('create_hitl_approval', {
              p_org_id: body.orgId,
              p_user_id: targetUserId,
              p_resource_type: 'email_draft',
              p_resource_id: crypto.randomUUID(),
              p_resource_name: 'Simulated follow-up email',
              p_slack_team_id: slack.slack_team_id,
              p_slack_channel_id: posted.channel,
              p_slack_message_ts: posted.ts,
              p_original_content: originalContent,
              p_callback_type: null,
              p_callback_target: null,
              p_callback_metadata: { source: 'proactive_simulator' },
              p_expires_hours: 24,
              p_created_by: authCtx.userId,
              p_slack_thread_ts: null,
              p_metadata: { feature: 'hitl_followup_email', source: 'proactive_simulator' },
            });

            if (approvalError || !approvalId) {
              result.hitl.error = approvalError?.message || 'Failed to create HITL approval';
            } else {
              result.hitl.approvalId = approvalId as string;
              const hitlBlocks = buildHitlBlocks(approvalId as string);
              await updateMessageBlocks(slack.bot_access_token, posted.channel, posted.ts, text, hitlBlocks);
            }
          }
        }
      }
    }

    // In-app mirror (if enabled)
    if (createInApp) {
      // For HITL features, create approval record even without Slack
      // This ensures the Email Action Center can display the draft
      if (hitlMode && !result.hitl.approvalId) {
        const draft = buildSimulatedHitlFollowUpEmailDraft();
        const originalContent = {
          subject: draft.subject,
          body: draft.body,
          recipient: draft.recipient,
          recipientName: draft.recipientName,
          recipientEmail: draft.recipient,
          to: draft.recipient,
        };

        const { data: approvalId, error: approvalError } = await supabase.rpc('create_hitl_approval', {
          p_org_id: body.orgId,
          p_user_id: targetUserId,
          p_resource_type: 'email_draft',
          p_resource_id: crypto.randomUUID(),
          p_resource_name: `Follow-up email to ${draft.recipientName}`,
          p_slack_team_id: null,
          p_slack_channel_id: null,
          p_slack_message_ts: null,
          p_original_content: originalContent,
          p_callback_type: null,
          p_callback_target: null,
          p_callback_metadata: { source: 'proactive_simulator' },
          p_expires_hours: 24,
          p_created_by: authCtx.userId,
          p_slack_thread_ts: null,
          p_metadata: { feature: 'hitl_followup_email', source: 'proactive_simulator' },
        });

        if (approvalError || !approvalId) {
          result.hitl.error = approvalError?.message || 'Failed to create HITL approval';
        } else {
          result.hitl.approvalId = approvalId as string;
        }
      }

      const { data: inserted, error: insertError } = await supabase
        .from('notifications')
        .insert({
          user_id: targetUserId,
          title: inAppPayload.title,
          message: inAppPayload.message,
          type: inAppPayload.type,
          category: inAppPayload.category,
          metadata: inAppPayload.metadata || {},
          action_url: inAppPayload.actionUrl || null,
          read: false,
        })
        .select('id')
        .single();

      if (insertError) {
        result.inApp.error = insertError.message;
      } else {
        result.inApp.created = true;
        result.inApp.notificationId = inserted?.id as string | undefined;
      }
    }

    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[proactive-simulate] error:', message);
    return json({ success: false, error: message }, 500);
  }
});

