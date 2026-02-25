// supabase/functions/slack-post-meeting/index.ts
// Posts AI Meeting Debrief to Slack when a meeting transcript is indexed

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import {
  buildMeetingDebriefMessage,
  buildHITLApprovalMessage,
  type MeetingDebriefData,
  type HITLApprovalData,
} from '../_shared/slackBlocks.ts';
import { getAuthContext, requireOrgRole } from '../_shared/edgeAuth.ts';
import { loadProactiveContext, type ProactiveContext } from '../_shared/proactive/orgContext.ts';
import { extractEventsFromMeeting } from '../_shared/memory/writer.ts';
import { createRAGClient } from '../_shared/memory/ragClient.ts';
import { detectMeetingHistory } from '../_shared/rag/historyDetector.ts';
import { getFollowUpContext } from '../_shared/follow-up/ragQueries.ts';
import { composeReturnMeetingFollowUp, composeFirstMeetingFollowUp } from '../_shared/follow-up/composer.ts';
import type { ComposeInput } from '../_shared/follow-up/composer.ts';
import { logAICostEvent, logFlatRateCostEvent, checkBudgetCap } from '../_shared/costTracking.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
const appUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://use60.com';

interface MeetingData {
  id: string;
  title: string;
  transcript?: string;
  summary?: string;
  duration_minutes?: number;
  attendees?: string[];
  owner_user_id: string;
  org_id?: string | null;
  company_id?: string | null;
  deal?: {
    id: string;
    name: string;
    stage_id: string;
    value: number;
  };
}

function extractJsonObject(text: string): string | null {
  if (!text) return null;
  let s = String(text).trim();

  // Strip fenced code blocks: ```json ... ``` or ``` ... ```
  if (s.startsWith('```')) {
    s = s.replace(/^```[a-zA-Z0-9_-]*\s*/m, '').replace(/```$/m, '').trim();
  }

  // If still not valid JSON, try to locate the first {...} object.
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) return s.slice(start, end + 1).trim();
  return null;
}

/**
 * Call Anthropic API for meeting analysis
 */
async function analyzeMeeting(meeting: MeetingData): Promise<{
  summary: string;
  sentiment: 'positive' | 'neutral' | 'challenging';
  sentimentScore: number;
  talkTimeRep: number;
  talkTimeCustomer: number;
  actionItems: Array<{ task: string; suggestedOwner?: string; dueInDays: number }>;
  coachingInsight: string;
  keyQuotes: string[];
}> {
  // Fail-soft: this is a Slack notification. If AI is not configured, still send a useful message.
  if (!anthropicApiKey) {
    return {
      summary: meeting.summary || 'Meeting summary unavailable',
      sentiment: 'neutral',
      sentimentScore: 50,
      talkTimeRep: 40,
      talkTimeCustomer: 60,
      actionItems: [],
      coachingInsight: 'Review the meeting summary and add follow-up tasks.',
      keyQuotes: [],
    };
  }

  // If no transcript AND no summary, skip AI analysis — there's nothing to analyze.
  if (!meeting.transcript && !meeting.summary) {
    console.log('[slack-post-meeting] No transcript or summary available — skipping AI analysis');
    return {
      summary: 'No recording was captured for this meeting. Connect 60 Notetaker or Fathom to get full meeting intelligence.',
      sentiment: 'neutral',
      sentimentScore: 50,
      talkTimeRep: 50,
      talkTimeCustomer: 50,
      actionItems: [],
      coachingInsight: 'No transcript available — review your notes and add follow-up tasks manually.',
      keyQuotes: [],
    };
  }

  const transcript = meeting.transcript || meeting.summary || '';
  const attendees = meeting.attendees?.join(', ') || 'Unknown attendees';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      temperature: 0.5,
      system: `You are a sales meeting analyst creating concise Slack notifications for sales teams.
Your goal is to provide an actionable meeting summary that helps:
1. Sales managers quickly understand meeting outcomes without watching recordings
2. Sales reps get immediate coaching feedback
3. Teams stay aligned on deal progress

Focus on brevity, action-orientation, and constructive coaching.
Return ONLY valid JSON with no additional text.`,
      messages: [{
        role: 'user',
        content: `Analyze this sales meeting and provide a Slack-ready summary:

MEETING: ${meeting.title}
ATTENDEES: ${attendees}
DURATION: ${meeting.duration_minutes || 30} minutes
${meeting.deal ? `DEAL: ${meeting.deal.name} (Stage: ${meeting.deal.stage_id}, Value: $${meeting.deal.value?.toLocaleString()})` : ''}

TRANSCRIPT:
${transcript.substring(0, 15000)}

Return your analysis as JSON with this exact structure:
{
  "summary": "2-3 sentence summary of the meeting",
  "sentiment": "positive" | "neutral" | "challenging",
  "sentimentScore": 0-100,
  "talkTimeRep": 0-100,
  "talkTimeCustomer": 0-100,
  "actionItems": [{ "task": "string", "suggestedOwner": "string", "dueInDays": 1-14 }],
  "coachingInsight": "One specific tip for the sales rep",
  "keyQuotes": ["Notable customer quote"]
}`
      }]
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const result = await response.json();
  const content = result.content[0]?.text;

  try {
    const candidate = extractJsonObject(content) ?? content;
    return JSON.parse(candidate);
  } catch {
    console.error('Failed to parse AI response:', content);
    // Return default structure
    return {
      summary: meeting.summary || 'Meeting summary unavailable',
      sentiment: 'neutral',
      sentimentScore: 50,
      talkTimeRep: 40,
      talkTimeCustomer: 60,
      actionItems: [],
      coachingInsight: 'Review the meeting recording for detailed insights.',
      keyQuotes: [],
    };
  }
}

/**
 * Generate a follow-up email draft (HITL content).
 * Uses rich proactive context (writing style, tone, org) and the 5-section
 * methodology from the post-meeting-followup-drafter skill.
 * Fail-soft: return a deterministic draft if AI isn't configured.
 */
async function generateFollowUpDraft(input: {
  meetingTitle: string;
  attendeeNameOrEmail: string;
  summary: string;
  actionItems: Array<{ task: string; dueInDays: number }>;
  context: ProactiveContext;
  companyName?: string;
  dealName?: string;
  dealStage?: string;
  sentiment?: 'positive' | 'neutral' | 'challenging';
  keyQuotes?: string[];
  transcript?: string;
}): Promise<{ subject: string; body: string }> {
  const { context: ctx } = input;
  const firstName = ctx.user.firstName || 'there';
  const lastName = ctx.user.lastName || '';
  const signoff = ctx.writingStyle?.signoffs?.[0] || ctx.toneSettings?.emailSignOff || 'Best';
  const fallbackSubject = `Following up: ${input.meetingTitle}`;

  if (!anthropicApiKey) {
    const bullets = input.actionItems.slice(0, 4).map((a) => `- ${a.task}`).join('\n');
    const body = `Hi ${input.attendeeNameOrEmail},\n\nThanks again for your time today.\n\nQuick recap:\n${input.summary}\n\nProposed next steps:\n${bullets || '- Confirm next steps and timeline'}\n\n${signoff},\n${firstName}`;
    return { subject: fallbackSubject, body };
  }

  try {
    const today = new Date();
    const currentDateStr = today.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Build writing style instructions
    const ws = ctx.writingStyle;
    const ts = ctx.toneSettings;
    const wordsToAvoid = ts?.wordsToAvoid?.length
      ? ts.wordsToAvoid
      : [];

    let styleBlock = '';
    if (ws) {
      styleBlock = `WRITING STYLE: ${ws.toneDescription || ws.name}
- Formality: ${ws.formality}/5, Directness: ${ws.directness}/5, Warmth: ${ws.warmth}/5
${ws.commonPhrases.length ? `- Common phrases the user uses: ${ws.commonPhrases.join(', ')}` : ''}
- Sign off with: "${signoff}"
${wordsToAvoid.length ? `- NEVER use these words/phrases: ${wordsToAvoid.join(', ')}` : ''}`;
    }

    // Tone calibration based on sentiment
    const sentiment = input.sentiment || 'neutral';
    let toneCalibration = '';
    if (sentiment === 'positive') {
      toneCalibration = '- Warm, confident, forward-looking. Direct CTA.';
    } else if (sentiment === 'challenging') {
      toneCalibration = '- Empathetic, direct, solution-oriented. Address the top concern.';
    } else {
      toneCalibration = '- Professional, helpful. Value-add CTA.';
    }

    const systemPrompt = `You are writing a follow-up email AS ${firstName} ${lastName}, from their first-person perspective.
This email will be sent from ${firstName}'s email account — write it exactly as they would type it.

${styleBlock}

EMAIL STRUCTURE (5 sections):
1. Opening + Recap (2-3 sentences) — reference something specific from the meeting
2. "What We Heard" (3-5 bullets) — mirror the recipient's own words/concerns back to them
3. Decisions + Commitments (if any were made)
4. Next Steps (2-3 items with owners and dates)
5. CTA — single specific ask, NOT "let me know if you have questions"

TONE CALIBRATION:
- Meeting sentiment was ${sentiment}
${toneCalibration}

RULES:
- Write in FIRST PERSON as ${firstName} — never say "${firstName} and I" or "our team and I"
- Keep under 200 words
- Use the recipient's language, not sales jargon
- Do NOT re-pitch features. This is a recap, not a sales pitch.
- Every next step needs an owner and a date

Return ONLY valid JSON: { "subject": "...", "body": "..." }`;

    // Build enriched user message
    const keyQuotesBlock = input.keyQuotes?.length
      ? `\nKEY QUOTES FROM RECIPIENT:\n${input.keyQuotes.map((q) => `- "${q}"`).join('\n')}`
      : '';

    const transcriptBlock = input.transcript
      ? `\nTRANSCRIPT EXCERPT:\n${input.transcript.substring(0, 3000)}`
      : '';

    const userMessage = `Draft a follow-up email.

TODAY'S DATE: ${currentDateStr}
SENDER: ${firstName} ${lastName} (${ctx.org.name})
MEETING: ${input.meetingTitle}
RECIPIENT: ${input.attendeeNameOrEmail}
${input.companyName ? `COMPANY: ${input.companyName}` : ''}
${input.dealName ? `DEAL: ${input.dealName}${input.dealStage ? ` (${input.dealStage})` : ''}` : ''}
MEETING SENTIMENT: ${sentiment}
SUMMARY: ${input.summary}${keyQuotesBlock}
NEXT STEPS:
${input.actionItems.slice(0, 6).map((a) => `- ${a.task}`).join('\n') || '- Confirm next steps'}${transcriptBlock}

Return JSON: { "subject": "...", "body": "..." }`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        temperature: 0.5,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${error}`);
    }

    const result = await response.json();
    const content = result.content?.[0]?.text || '';
    const candidate = extractJsonObject(content) ?? content;
    const parsed = JSON.parse(candidate);

    return {
      subject: String(parsed.subject || fallbackSubject).slice(0, 200),
      body: String(parsed.body || '').slice(0, 5000),
    };
  } catch (e) {
    console.warn('[slack-post-meeting] generateFollowUpDraft AI failed, using fallback:', (e as any)?.message);
    const bullets = input.actionItems.slice(0, 4).map((a) => `- ${a.task}`).join('\n');
    const body = `Hi ${input.attendeeNameOrEmail},\n\nThanks again for your time today.\n\nQuick recap:\n${input.summary}\n\nProposed next steps:\n${bullets || '- Confirm next steps and timeline'}\n\n${signoff},\n${firstName}`;
    return { subject: fallbackSubject, body };
  }
}

/**
 * Get Slack bot token for org
 */
async function getSlackConfig(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  options?: { isTest?: boolean }
): Promise<{
  botToken: string;
  slackTeamId: string;
  settings: {
    channelId?: string;
    deliveryMethod: string;
    dmAudience?: string;
    stakeholderSlackIds?: string[];
  };
} | null> {
  // Get org Slack settings
  const { data: orgSettings } = await supabase
    .from('slack_org_settings')
    .select('bot_access_token, slack_team_id')
    .eq('org_id', orgId)
    .eq('is_connected', true)
    .single();

  if (!orgSettings?.bot_access_token || !orgSettings?.slack_team_id) {
    console.log('No Slack connection for org:', orgId);
    return null;
  }

  // Get notification settings for meeting_debrief
  const { data: notifSettings } = await supabase
    .from('slack_notification_settings')
    .select('channel_id, delivery_method, is_enabled, dm_audience, stakeholder_slack_ids')
    .eq('org_id', orgId)
    .eq('feature', 'meeting_debrief')
    .maybeSingle();

  if (!notifSettings || notifSettings.is_enabled === false) {
    console.log('Meeting debrief notifications not enabled for org:', orgId);
    if (options?.isTest) {
      // Allow test sends from the demo UI even if org hasn't configured meeting_debrief yet.
      return {
        botToken: orgSettings.bot_access_token,
        settings: {
          deliveryMethod: 'dm',
          channelId: undefined,
        },
      };
    }
    return null;
  }

  return {
    botToken: orgSettings.bot_access_token,
    slackTeamId: orgSettings.slack_team_id,
    settings: {
      channelId: notifSettings.channel_id,
      deliveryMethod: notifSettings.delivery_method || 'channel',
      dmAudience: (notifSettings as any)?.dm_audience || 'owner',
      stakeholderSlackIds: ((notifSettings as any)?.stakeholder_slack_ids as string[] | null | undefined) || [],
    },
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
 * Post message to Slack
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

async function listChannels(botToken: string): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch('https://slack.com/api/conversations.list?limit=200&types=public_channel,private_channel', {
    headers: { Authorization: `Bearer ${botToken}` },
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Failed to list channels');
  return (json.channels || []).map((c: any) => ({ id: c.id, name: c.name }));
}

async function joinChannel(botToken: string, channel: string): Promise<void> {
  const res = await fetch('https://slack.com/api/conversations.join', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel }),
  });
  const json = await res.json();
  if (!json.ok && json.error !== 'method_not_supported_for_channel_type') {
    throw new Error(json.error || 'Failed to join channel');
  }
}

/**
 * Send DM to Slack user
 */
async function sendSlackDM(
  botToken: string,
  userId: string,
  message: { blocks: unknown[]; text: string }
): Promise<{ ok: boolean; ts?: string; error?: string; channelId?: string }> {
  // Open DM channel
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

  // Send message to DM channel
  const dmChannelId = openResult.channel.id as string | undefined;
  const res = await postToSlack(botToken, openResult.channel.id, message);
  return { ...res, channelId: dmChannelId };
}

async function createInAppNotification(
  supabase: ReturnType<typeof createClient>,
  params: {
    userId: string;
    meetingId: string;
    title: string;
    message: string;
    actionUrl: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await supabase.from('notifications').insert({
    user_id: params.userId,
    title: params.title,
    message: params.message,
    type: 'info',
    category: 'meeting',
    entity_type: 'meeting_debrief',
    entity_id: params.meetingId,
    action_url: params.actionUrl,
    metadata: {
      ...params.metadata,
      source: 'slack_post_meeting',
      ai_generated: true,
    },
  });
}

/**
 * Record sent notification
 */
async function recordNotification(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  meetingId: string,
  recipientType: string,
  recipientId: string,
  slackTs: string,
  channelId: string
): Promise<void> {
  await supabase.from('slack_notifications_sent').insert({
    org_id: orgId,
    feature: 'meeting_debrief',
    entity_type: 'meeting',
    entity_id: meetingId,
    recipient_type: recipientType,
    recipient_id: recipientId,
    slack_ts: slackTs,
    slack_channel_id: channelId,
  });
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const body = await req.json().catch(() => ({} as any));
    const meetingId = typeof body.meetingId === 'string' ? body.meetingId : null;
    const orgId = typeof body.orgId === 'string' ? body.orgId : null;
    const isTest = body.isTest === true;
    const dryRun = body.dryRun === true;
    const requestId = crypto.randomUUID();
    console.log('[slack-post-meeting] start', { requestId, meetingId, orgId, isTest: !!isTest });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const cronSecret = Deno.env.get('CRON_SECRET') || undefined;
    const auth = await getAuthContext(req, supabase, supabaseServiceKey, { cronSecret });
    console.log('[slack-post-meeting] auth', { requestId, mode: auth.mode, userId: auth.userId, isPlatformAdmin: auth.isPlatformAdmin });

    // External release hardening: user-auth calls must target a specific org + meeting.
    if (auth.mode === 'user' && auth.userId && !auth.isPlatformAdmin) {
      if (!orgId) {
        return new Response(
          JSON.stringify({ error: 'Org ID required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (!meetingId && !isTest) {
        return new Response(
          JSON.stringify({ error: 'meetingId required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      await requireOrgRole(
        supabase,
        orgId,
        auth.userId,
        isTest ? ['owner', 'admin', 'member', 'readonly'] : ['owner', 'admin']
      );
    }

    // Cron/service-role mode: scan for eligible meetings and invoke single-meeting sends.
    if ((auth.mode === 'cron' || auth.mode === 'service_role') && !meetingId && !isTest) {
      const orgScope = orgId || null;
      const maxMeetings = typeof body.maxMeetings === 'number' ? Math.max(1, Math.min(25, body.maxMeetings)) : 10;

      const orgsToProcess = orgScope
        ? [{ org_id: orgScope }]
        : (await supabase
            .from('slack_org_settings')
            .select('org_id')
            .eq('is_connected', true)
            .not('bot_access_token', 'is', null)).data || [];

      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const results: Array<{ orgId: string; meetingId: string; ok: boolean; error?: string }> = [];

      for (const o of orgsToProcess) {
        const oid = (o as any).org_id as string | undefined;
        if (!oid) continue;

        const { data: candidates, error: candErr } = await supabase
          .from('meetings')
          .select('id, meeting_start')
          .eq('org_id', oid)
          .or('transcript_text.not.is.null,summary.not.is.null')
          .gte('meeting_start', since.toISOString())
          .order('meeting_start', { ascending: false })
          .limit(maxMeetings * 2);

        if (candErr) {
          results.push({ orgId: oid, meetingId: 'n/a', ok: false, error: candErr.message });
          continue;
        }

        for (const m of candidates || []) {
          if (results.length >= maxMeetings) break;

          // Skip if already sent
          const { data: existingSent } = await supabase
            .from('slack_notifications_sent')
            .select('id')
            .eq('org_id', oid)
            .eq('feature', 'meeting_debrief')
            .eq('entity_id', m.id)
            .limit(1);

          if (existingSent && existingSent.length > 0) {
            continue;
          }

          if (dryRun) {
            results.push({ orgId: oid, meetingId: m.id, ok: true });
            continue;
          }

          try {
            const resp = await fetch(`${supabaseUrl}/functions/v1/slack-post-meeting`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({ meetingId: m.id, orgId: oid }),
            });

            const payload = await resp.json().catch(() => ({}));
            if (!resp.ok || payload?.success === false) {
              results.push({
                orgId: oid,
                meetingId: m.id,
                ok: false,
                error: payload?.error || `HTTP ${resp.status}`,
              });
            } else {
              results.push({ orgId: oid, meetingId: m.id, ok: true });
            }
          } catch (e: any) {
            results.push({ orgId: oid, meetingId: m.id, ok: false, error: e?.message || 'Unknown error' });
          }
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          mode: auth.mode,
          dryRun,
          attempted: results.length,
          sent: results.filter((r) => r.ok).length,
          failed: results.filter((r) => !r.ok).length,
          results,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch meeting data (schema-safe: our `meetings` table does NOT have `deal_id`, `attendees`, or `transcript`)
    // and there is no PostgREST relationship `meetings -> deals`.
    let meeting: any | null = null;
    let meetingError: any | null = null;

    if (meetingId) {
      const res = await supabase
        .from('meetings')
        .select(`
          id,
          title,
          transcript_text,
          summary,
          duration_minutes,
          owner_user_id,
          company_id,
          meeting_attendees (
            name,
            email,
            is_external
          )
        `)
        .eq('id', meetingId)
        .single();
      meeting = res.data;
      meetingError = res.error;
    }

    if ((meetingError || !meeting) && !isTest) {
      // Avoid returning 404 here because it gets misinterpreted as "function not deployed" on the client.
      // Instead, return a structured error with HTTP 200 so the UI can show the real failure reason.
      console.error('Meeting not found:', meetingError);
      return new Response(
        JSON.stringify({ success: false, error: 'Meeting not found', details: meetingError }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If this is a test run and we couldn't fetch a real meeting, synthesize minimal sample data.
    if (!meeting) {
      meeting = {
        id: meetingId || 'test-meeting',
        title: 'Test Meeting Debrief',
        transcript_text:
          'Sample transcript: We discussed goals, pricing, timeline, and next steps. Customer asked about onboarding, integrations, and contract terms.',
        summary: 'Sample meeting summary.',
        duration_minutes: 30,
        owner_user_id: null,
        company_id: null,
        meeting_attendees: [{ name: 'Sample Customer', email: 'customer@example.com', is_external: true }],
      };
    }

    const effectiveOrgId = orgId;
    if (!effectiveOrgId) {
      return new Response(
        JSON.stringify({ error: 'Org ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already sent (skip for tests)
    if (!isTest && meetingId) {
      const { data: existingSent } = await supabase
        .from('slack_notifications_sent')
        .select('id')
        .eq('org_id', effectiveOrgId)
        .eq('feature', 'meeting_debrief')
        .eq('entity_id', meetingId)
        .limit(1);

      if (existingSent && existingSent.length > 0) {
        console.log('Meeting debrief already sent for:', meetingId);
        return new Response(
          JSON.stringify({ success: true, message: 'Already sent' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get Slack configuration (in test mode we allow fallback delivery even if meeting_debrief isn't configured yet)
    const slackConfig = await getSlackConfig(supabase, effectiveOrgId, { isTest: !!isTest });
    if (!slackConfig) {
      return new Response(
        JSON.stringify({ success: false, error: 'Slack not configured or feature disabled', requestId }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Best-effort: attach a related deal by company name (our schema doesn't have meeting->deal FK)
    let deal: MeetingData['deal'] | undefined = undefined;
    try {
      if (meeting.company_id) {
        const { data: company } = await supabase
          .from('companies')
          .select('name')
          .eq('id', meeting.company_id)
          .maybeSingle();

        const companyName = (company as any)?.name as string | undefined;
        if (companyName) {
          const { data: deals } = await supabase
            .from('deals')
            .select('id, name, value, stage_id')
            .ilike('company', `%${companyName}%`)
            .order('updated_at', { ascending: false })
            .limit(1);

          const d0 = (deals as any[])?.[0];
          if (d0) {
            deal = { id: d0.id, name: d0.name, stage_id: d0.stage_id, value: d0.value };
          }
        }
      }
    } catch (e) {
      // Non-fatal: deal enrichment is optional
      console.log('Deal enrichment skipped:', (e as any)?.message || e);
    }

    const attendees: string[] = Array.isArray(meeting.meeting_attendees)
      ? meeting.meeting_attendees
          .map((a: any) => (a?.email ? `${a?.name || 'Attendee'} <${a.email}>` : a?.name))
          .filter(Boolean)
      : [];

    // Analyze meeting with AI
    console.log('Analyzing meeting:', meetingId || meeting?.id);
    const analysis = await analyzeMeeting({
      id: meeting.id,
      title: meeting.title || 'Untitled Meeting',
      transcript: meeting.transcript_text || undefined,
      summary: meeting.summary || undefined,
      duration_minutes: meeting.duration_minutes || 30,
      attendees,
      owner_user_id: meeting.owner_user_id || auth.userId || 'unknown',
      company_id: meeting.company_id || null,
      deal,
    });

    // Fire-and-forget deal memory extraction — runs in background, does not block Slack delivery
    const dealId = (deal as { id?: string } | undefined)?.id;
    if (dealId) {
      const memoryAnthropicKey = Deno.env.get('ANTHROPIC_API_KEY') || '';
      if (memoryAnthropicKey) {
        const ragClient = createRAGClient();
        extractEventsFromMeeting({
          meetingId: meeting.id,
          dealId,
          orgId: effectiveOrgId,
          supabase,
          ragClient,
          anthropicApiKey: memoryAnthropicKey,
          extractedBy: 'slack-post-meeting',
        }).catch((err) => {
          console.error('[slack-post-meeting] Deal memory extraction failed (non-blocking):', err);
        });
      }
    }

    // Build Slack message
    const debriefData: MeetingDebriefData = {
      meetingTitle: meeting.title || 'Untitled Meeting',
      meetingId: meeting.id,
      attendees,
      duration: meeting.duration_minutes || 30,
      dealName: (deal as { name?: string } | undefined)?.name,
      dealId: (deal as { id?: string } | undefined)?.id,
      dealStage: (deal as { stage_id?: string } | undefined)?.stage_id,
      summary: analysis.summary,
      sentiment: analysis.sentiment,
      sentimentScore: analysis.sentimentScore,
      talkTimeRep: analysis.talkTimeRep,
      talkTimeCustomer: analysis.talkTimeCustomer,
      actionItems: analysis.actionItems,
      coachingInsight: analysis.coachingInsight,
      appUrl,
    };

    const slackMessage = buildMeetingDebriefMessage(debriefData);

    // Send to Slack
    let result: { ok: boolean; ts?: string; error?: string } | null = null;
    let recipientId: string | undefined;
    let recipientType: string | undefined;
    let channelId: string | undefined;
    let dmResults: Array<{ slackUserId: string; ok: boolean; ts?: string; error?: string; channelId?: string }> | undefined;

    const deliveryMethodRaw = String(slackConfig.settings.deliveryMethod || 'channel');
    const deliveryMethod =
      deliveryMethodRaw === 'dm' || deliveryMethodRaw === 'both' || deliveryMethodRaw === 'channel'
        ? (deliveryMethodRaw as 'channel' | 'dm' | 'both')
        : ('channel' as const);
    const sendToDm = deliveryMethod === 'dm' || deliveryMethod === 'both';
    const sendToChannel = deliveryMethod === 'channel' || deliveryMethod === 'both';

    if (sendToDm) {
      // DM recipients: meeting owner and/or configured stakeholders
      const dmAudienceRaw = String(slackConfig.settings.dmAudience || 'owner');
      const dmAudience =
        dmAudienceRaw === 'owner' || dmAudienceRaw === 'stakeholders' || dmAudienceRaw === 'both'
          ? (dmAudienceRaw as 'owner' | 'stakeholders' | 'both')
          : ('owner' as const);

      const includeOwner = dmAudience === 'owner' || dmAudience === 'both';
      const includeStakeholders = dmAudience === 'stakeholders' || dmAudience === 'both';

      const recipients = new Set<string>();

      // Safety: in test mode, DM only the requester (avoid spamming stakeholders)
      if (isTest) {
        const requesterUserId = auth.userId;
        if (requesterUserId) {
          const requesterSlackId = await getSlackUserId(supabase, effectiveOrgId, requesterUserId);
          if (requesterSlackId) recipients.add(requesterSlackId);
        }
      } else {
        if (includeOwner) {
          const ownerUserId = meeting.owner_user_id || auth.userId;
          if (ownerUserId) {
            const ownerSlackId = await getSlackUserId(supabase, effectiveOrgId, ownerUserId);
            if (ownerSlackId) recipients.add(ownerSlackId);
          }
        }
        if (includeStakeholders) {
          for (const sid of (slackConfig.settings.stakeholderSlackIds || []).filter(Boolean)) {
            recipients.add(String(sid));
          }
        }
      }

      const recipientSlackIds = Array.from(recipients);
      if (recipientSlackIds.length === 0) {
        if (sendToChannel && slackConfig.settings.channelId) {
          // Fall back to channel delivery if configured
        } else {
          return new Response(
            JSON.stringify({
              success: false,
              error: isTest ? 'No Slack mapping for requester (cannot DM test)' : 'No DM recipients configured/mapped',
              requestId,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      if (recipientSlackIds.length > 0) {
        dmResults = [];
        for (const slackUserId of recipientSlackIds) {
          const dmRes = await sendSlackDM(slackConfig.botToken, slackUserId, slackMessage);
          dmResults.push({ slackUserId, ...dmRes });
        }

        const firstOk = dmResults.find((r) => r.ok);
        if (firstOk) {
          result = { ok: true, ts: firstOk.ts };
          recipientId = firstOk.slackUserId;
          recipientType = 'user';
          channelId = firstOk.channelId; // DM channel id
        } else {
          // All DMs failed; if we can send to channel and have a channel, fall through to channel send below.
          if (!sendToChannel) {
            return new Response(
              JSON.stringify({
                success: false,
                error: dmResults[0]?.error || 'Slack DM failed',
                requestId,
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      }
    }

    // If DM path intentionally fell back to channel in test mode, execute the channel send now.
    if (!result && sendToChannel) {
      // Send to channel
      if (!slackConfig.settings.channelId) {
        if (!isTest) {
          return new Response(
            JSON.stringify({ success: false, error: 'No channel configured', requestId }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const channels = await listChannels(slackConfig.botToken);
        const preferred =
          channels.find((c) => c.name === 'general') ||
          channels.find((c) => c.name === 'random') ||
          channels[0];
        if (!preferred) {
          return new Response(
            JSON.stringify({ success: false, error: 'No channels available for Slack bot', requestId }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        slackConfig.settings.channelId = preferred.id;
      }
      result = await postToSlack(slackConfig.botToken, slackConfig.settings.channelId, slackMessage);
      if (!result.ok && result.error === 'not_in_channel') {
        try {
          await joinChannel(slackConfig.botToken, slackConfig.settings.channelId);
        } catch {
          // ignore
        }
        result = await postToSlack(slackConfig.botToken, slackConfig.settings.channelId, slackMessage);
      }
      recipientId = slackConfig.settings.channelId;
      recipientType = 'channel';
      channelId = slackConfig.settings.channelId;
    }

    if (!result || !result.ok) {
      console.error('Slack API error:', result?.error || 'unknown');
      return new Response(
        JSON.stringify({
          success: false,
          error: result?.error || 'Slack API error',
          requestId,
          ...(result?.error === 'invalid_blocks' ? { debug: { slackMessage } } : {}),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Record the notification (skip for tests to avoid requiring a real meeting id)
    if (!isTest && meetingId) {
      if (recipientType === 'user' && dmResults && dmResults.length > 0) {
        for (const r of dmResults.filter((x) => x.ok && x.ts && x.channelId)) {
          await recordNotification(
            supabase,
            effectiveOrgId,
            meetingId,
            'user',
            r.slackUserId,
            r.ts || '',
            r.channelId || ''
          );
        }
      } else {
        await recordNotification(
          supabase,
          effectiveOrgId,
          meetingId,
          recipientType,
          recipientId,
          result.ts || '',
          channelId
        );
      }
    }

    // Mirror to in-app (best-effort) for the meeting owner
    try {
      if (!isTest && meeting.owner_user_id) {
        await createInAppNotification(supabase, {
          userId: meeting.owner_user_id,
          meetingId: meeting.id,
          title: `Post-call summary: ${meeting.title || 'Meeting'}`,
          message: analysis.summary,
          actionUrl: `/meetings`,
          metadata: {
            meetingId: meeting.id,
            sentiment: analysis.sentiment,
            sentimentScore: analysis.sentimentScore,
            actionItemsCount: analysis.actionItems?.length || 0,
          },
        });
      }
    } catch (e) {
      console.warn('[slack-post-meeting] Failed to create in-app notification:', (e as any)?.message || e);
    }

    // HITL follow-up email approval (best-effort): DM owner with approve/edit/reject
    try {
      if (!isTest && meeting.owner_user_id) {
        // Edge case guards (FU-015)
        const hasTranscript = !!(meeting.transcript_text || meeting.summary);
        const meetingDuration = meeting.duration_minutes || 0;
        const isNoShow = meetingDuration < 2;

        if (!hasTranscript) {
          console.log('[slack-post-meeting] Skipping follow-up: no transcript available for meeting', meeting.id);
          // Skip follow-up generation — no transcript to compose from
        } else if (isNoShow) {
          console.log('[slack-post-meeting] Skipping follow-up: meeting appears to be a no-show (duration < 2 min)', meeting.id);
          // Skip follow-up generation — meeting was too short
        } else {
        const ownerSlackId = await getSlackUserId(supabase, effectiveOrgId, meeting.owner_user_id);
        const externalAttendee = Array.isArray(meeting.meeting_attendees)
          ? (meeting.meeting_attendees as any[]).find((a) => a?.is_external && a?.email)
          : null;

        // Determine CC list (all other external attendees)
        const allExternalAttendees = Array.isArray(meeting.meeting_attendees)
          ? (meeting.meeting_attendees as any[]).filter((a) => a?.is_external && a?.email)
          : [];
        const ccAttendees = allExternalAttendees.filter(
          (a) => a.email !== externalAttendee?.email
        );
        const ccEmails = ccAttendees.map((a: any) => a.email).filter(Boolean);

        if (ownerSlackId && externalAttendee?.email) {
          // Load user writing style and org context for personalized email
          const proactiveContext = await loadProactiveContext(supabase, effectiveOrgId, meeting.owner_user_id);

          // Resolve company name from the company_id lookup done earlier
          let companyName: string | undefined;
          try {
            if (meeting.company_id) {
              const { data: co } = await supabase
                .from('companies')
                .select('name')
                .eq('id', meeting.company_id)
                .maybeSingle();
              companyName = (co as any)?.name || undefined;
            }
          } catch { /* non-fatal */ }

          // Detect if this is a return meeting
          const meetingHistory = await detectMeetingHistory(
            supabase,
            meeting.id,
            meeting.company_id || null,
            effectiveOrgId,
          );

          let draft: { subject: string; body: string };
          let ragContextForMetadata: any = null;

          try {
            if (!meetingHistory.isFirstMeeting) {
              // Return meeting — use RAG-enhanced composer
              console.log('[slack-post-meeting] RAG path: return meeting detected, priorMeetingCount:', meetingHistory.priorMeetingCount);
              const ragClient = createRAGClient({ orgId: effectiveOrgId });
              const followUpContext = await getFollowUpContext(
                (deal as any)?.id || null,
                [], // contact IDs — not easily available here
                meeting.id,
                meetingHistory.priorMeetingCount + 1, // current meeting is +1
                ragClient,
                meeting.company_id || null,
              );
              ragContextForMetadata = followUpContext;

              const composeInput: ComposeInput = {
                meeting: {
                  id: meeting.id,
                  title: meeting.title || 'Meeting',
                  transcript: meeting.transcript_text?.substring(0, 3000),
                },
                analysis: {
                  summary: analysis.summary,
                  actionItems: (analysis.actionItems || []).map((a: any) => ({
                    task: a.task,
                    suggestedOwner: a.suggestedOwner,
                    dueInDays: a.dueInDays,
                  })),
                  keyQuotes: analysis.keyQuotes,
                  sentiment: analysis.sentiment,
                },
                recipient: {
                  name: externalAttendee?.name || externalAttendee?.email,
                  email: externalAttendee.email,
                  companyName,
                },
                deal: deal ? {
                  name: (deal as any)?.name,
                  stage: (deal as any)?.stage_id,
                  value: (deal as any)?.value,
                } : null,
                writingStyle: proactiveContext.writingStyle ? {
                  toneDescription: proactiveContext.writingStyle.toneDescription,
                  formality: proactiveContext.writingStyle.formality,
                  directness: proactiveContext.writingStyle.directness,
                  warmth: proactiveContext.writingStyle.warmth,
                  commonPhrases: proactiveContext.writingStyle.commonPhrases,
                  signoffs: proactiveContext.writingStyle.signoffs,
                  wordsToAvoid: proactiveContext.toneSettings?.wordsToAvoid,
                } : null,
                senderFirstName: proactiveContext.user.firstName || 'there',
                senderLastName: proactiveContext.user.lastName,
                orgName: proactiveContext.org.name,
              };

              if (followUpContext.hasHistory) {
                console.log('[slack-post-meeting] RAG path: composing return meeting follow-up with history');
                const composed = await composeReturnMeetingFollowUp(composeInput, followUpContext);
                draft = { subject: composed.subject, body: composed.body };
              } else {
                console.log('[slack-post-meeting] RAG path: return meeting but no RAG history found, using first-meeting composer');
                const composed = await composeFirstMeetingFollowUp(composeInput);
                draft = { subject: composed.subject, body: composed.body };
              }
            } else {
              // First meeting — use the existing generateFollowUpDraft
              console.log('[slack-post-meeting] RAG path: first meeting, using standard generateFollowUpDraft');
              draft = await generateFollowUpDraft({
                meetingTitle: meeting.title || 'Meeting',
                attendeeNameOrEmail: externalAttendee?.name || externalAttendee?.email,
                summary: analysis.summary,
                actionItems: (analysis.actionItems || []).map((a: any) => ({ task: a.task, dueInDays: a.dueInDays })),
                context: proactiveContext,
                companyName,
                dealName: (deal as any)?.name,
                dealStage: (deal as any)?.stage_id,
                sentiment: analysis.sentiment,
                keyQuotes: analysis.keyQuotes,
                transcript: meeting.transcript_text?.substring(0, 3000),
              });
            }
          } catch (ragErr) {
            console.warn('[slack-post-meeting] RAG-enhanced draft failed, falling back to generateFollowUpDraft:', (ragErr as any)?.message || ragErr);
            draft = await generateFollowUpDraft({
              meetingTitle: meeting.title || 'Meeting',
              attendeeNameOrEmail: externalAttendee?.name || externalAttendee?.email,
              summary: analysis.summary,
              actionItems: (analysis.actionItems || []).map((a: any) => ({ task: a.task, dueInDays: a.dueInDays })),
              context: proactiveContext,
              companyName,
              dealName: (deal as any)?.name,
              dealStage: (deal as any)?.stage_id,
              sentiment: analysis.sentiment,
              keyQuotes: analysis.keyQuotes,
              transcript: meeting.transcript_text?.substring(0, 3000),
            });
          }

          // Track credits for follow-up generation (best-effort)
          try {
            if (ragContextForMetadata && ragContextForMetadata.queryCredits > 0) {
              // RAG queries — flat rate per query batch
              await logFlatRateCostEvent(
                supabase,
                meeting.owner_user_id,
                effectiveOrgId,
                'rag_api',
                'follow-up-queries',
                ragContextForMetadata.queryCredits,
                'followup_rag_queries',
                {
                  meetingId: meeting.id,
                  queriesReturned: Object.keys(ragContextForMetadata.sections).length,
                  isReturnMeeting: true,
                },
              );
            }
            // The Sonnet composition cost is tracked inside composer.ts via the Anthropic API call
            // We don't double-track it here — the API response usage is logged by the caller
          } catch (creditErr) {
            console.warn('[slack-post-meeting] Credit tracking failed (non-fatal):', (creditErr as any)?.message);
          }

          const approvalId = crypto.randomUUID();
          const hitlData: HITLApprovalData = {
            approvalId,
            resourceType: 'email_draft',
            resourceId: meeting.id,
            resourceName: 'Follow-up Email',
            content: {
              recipientEmail: externalAttendee.email,
              subject: draft.subject,
              body: draft.body,
              cc: ccEmails.length > 0 ? ccEmails : undefined,
            },
            context: {
              meetingTitle: meeting.title || undefined,
              meetingId: meeting.id,
              contactName: externalAttendee?.name || externalAttendee?.email,
              dealName: (deal as any)?.name,
              dealId: (deal as any)?.id,
            },
            contextBadge: ragContextForMetadata ? {
              transcript: true,
              priorMeetings: meetingHistory.priorMeetingCount,
              commitmentsTracked: ragContextForMetadata.sections?.prior_commitments?.chunks?.length || 0,
              dealContext: !!deal,
              writingStyle: !!proactiveContext.writingStyle,
              credits: ragContextForMetadata.queryCredits || 0,
            } : {
              transcript: true,
              priorMeetings: 0,
              commitmentsTracked: 0,
              dealContext: !!deal,
              writingStyle: !!proactiveContext.writingStyle,
            },
            appUrl,
          };

          const hitlMessage = buildHITLApprovalMessage(hitlData);
          const dmRes = await sendSlackDM(slackConfig.botToken, ownerSlackId, hitlMessage);
          if (dmRes.ok && dmRes.ts && dmRes.channelId) {
            await supabase.from('hitl_pending_approvals').insert({
              id: approvalId,
              org_id: effectiveOrgId,
              user_id: meeting.owner_user_id,
              created_by: meeting.owner_user_id,
              resource_type: 'email_draft',
              resource_id: meeting.id,
              resource_name: 'Follow-up Email',
              slack_team_id: slackConfig.slackTeamId,
              slack_channel_id: dmRes.channelId,
              slack_message_ts: dmRes.ts,
              slack_thread_ts: null,
              status: 'pending',
              original_content: hitlData.content,
              callback_type: 'edge_function',
              callback_target: 'hitl-send-followup-email',
              callback_metadata: {
                orgId: effectiveOrgId,
                meetingId: meeting.id,
                userId: meeting.owner_user_id,
                ragContext: ragContextForMetadata ? JSON.stringify(ragContextForMetadata) : null,
              },
              metadata: {
                source: 'slack_post_meeting',
                meetingTitle: meeting.title,
                isReturnMeeting: !meetingHistory.isFirstMeeting,
                priorMeetingCount: meetingHistory.priorMeetingCount,
              },
            });

            // In-app mirror: approval requested
            await supabase.from('notifications').insert({
              user_id: meeting.owner_user_id,
              title: 'Approval needed: follow-up email',
              message: `Review and approve the follow-up email draft for "${meeting.title || 'your meeting'}".`,
              type: 'info',
              category: 'workflow',
              entity_type: 'email_draft',
              entity_id: meeting.id,
              action_url: '/meetings',
              metadata: {
                approval_id: approvalId,
                meeting_id: meeting.id,
                source: 'hitl',
              },
            });
          }
        }
        } // end else (hasTranscript && !isNoShow)
      }
    } catch (e) {
      console.warn('[slack-post-meeting] HITL follow-up setup failed:', (e as any)?.message || e);
    }

    console.log('Meeting debrief posted successfully:', meetingId || meeting?.id, { channelId, recipientType });
    return new Response(
      JSON.stringify({ 
        success: true, 
        slackTs: result.ts, 
        channelId,
        recipientType,
        deliveryMethod: recipientType === 'user' ? 'dm' : 'channel',
        dmResults: dmResults
          ? {
              attempted: dmResults.length,
              successCount: dmResults.filter((r) => r.ok).length,
              failedCount: dmResults.filter((r) => !r.ok).length,
            }
          : undefined,
        requestId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error posting meeting debrief:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
