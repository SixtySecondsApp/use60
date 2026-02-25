/**
 * prepBriefing.ts — Slack interactive action handlers for the pre-meeting briefing.
 *
 * Action IDs follow the pattern: prep_briefing::{action}
 * Value carries the calendar_events UUID for the meeting.
 *
 * Actions:
 *   booking_confirm  — Draft and send a booking confirmation email to all external attendees
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

// ---- Types ------------------------------------------------------------------

export interface PrepBriefingActionResult {
  success: boolean;
  responseText: string;
  error?: string;
}

// ---- Helpers ----------------------------------------------------------------

/** Extract external attendee emails and names from a calendar_events.attendees JSONB value. */
function extractExternalAttendees(
  attendees: unknown,
  repEmail: string,
): Array<{ email: string; name: string }> {
  if (!Array.isArray(attendees)) return [];
  const repLower = repEmail.toLowerCase();
  const result: Array<{ email: string; name: string }> = [];

  for (const a of attendees) {
    let email = '';
    let name = '';

    if (typeof a === 'string' && a.includes('@')) {
      email = a.toLowerCase();
      name = email;
    } else if (a && typeof a === 'object') {
      const obj = a as Record<string, unknown>;
      email = typeof obj.email === 'string' ? obj.email.toLowerCase() : '';
      name = (typeof obj.name === 'string' && obj.name) ||
             (typeof obj.displayName === 'string' && obj.displayName) ||
             email;
    }

    if (email && email !== repLower) {
      result.push({ email, name });
    }
  }

  return result;
}

/** Format a UTC date string for display: "Tuesday 17 February at 2:00pm" */
function formatMeetingTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Europe/London',
  });
}

/** Ask Claude Haiku to draft the email body (plain text). */
async function draftEmail(
  repName: string,
  attendeeFirstName: string,
  meetingTitle: string,
  meetingTime: string,
): Promise<{ subject: string; body: string }> {
  if (!anthropicKey) {
    // Fallback template when no API key
    return {
      subject: `Looking forward to our call`,
      body: `Hi ${attendeeFirstName},\n\nJust wanted to confirm our call on ${meetingTime}.\n\nLooking forward to connecting — if anything comes up and you need to reschedule, please do let me know in advance so we can find another time.\n\nSee you then!\n\n${repName}`,
    };
  }

  const prompt = `Write a short, warm booking confirmation email from a sales rep to a prospect.

Context:
- Rep first name: ${repName}
- Prospect first name: ${attendeeFirstName}
- Meeting: ${meetingTitle}
- When: ${meetingTime}

Requirements:
- 3-4 sentences maximum. Conversational, not corporate.
- Confirm the meeting is in the diary
- Express genuine enthusiasm for the conversation (specific to context if possible)
- Ask them to let you know in advance if they can't make it
- Sign off with just the rep's first name: ${repName}
- NO subject line prefix like "Re:" or "Subject:"

Return ONLY a JSON object: { "subject": "...", "body": "..." }
Subject should be short and direct. Body should be plain text with \\n for line breaks.
Do NOT use em-dashes, smart quotes, or Unicode characters. Use plain hyphens and straight quotes only.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      temperature: 0.4,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(`Claude API error: ${response.status}`);

  const result = await response.json() as {
    content?: Array<{ text?: string }>;
  };
  const text = result.content?.[0]?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude returned no JSON');

  return JSON.parse(match[0]) as { subject: string; body: string };
}

/** Send email via email-send-as-rep edge function (service-role call). */
async function sendEmail(
  userId: string,
  orgId: string,
  to: string,
  subject: string,
  body: string,
  draft = false,
): Promise<void> {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/email-send-as-rep`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseServiceKey}`,
        apikey: supabaseServiceKey,
      },
      body: JSON.stringify({ userId, org_id: orgId, to, subject, body, draft }),
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || `email-send-as-rep returned ${response.status}`);
  }
}

// ---- Main handler -----------------------------------------------------------

export async function handlePrepBriefingAction(
  actionSuffix: string,
  slackUserId: string,
  meetingId: string,
  triggerId?: string,
  slackContext?: { channelId?: string; messageTs?: string; teamId?: string },
): Promise<PrepBriefingActionResult> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Resolve Slack user → rep user
  const { data: mapping } = await supabase
    .from('slack_user_mappings')
    .select('sixty_user_id, org_id')
    .eq('slack_user_id', slackUserId)
    .maybeSingle();

  if (!mapping?.sixty_user_id || !mapping?.org_id) {
    return { success: false, responseText: '', error: 'Could not identify your account — is your Slack connected?' };
  }

  const repUserId: string = mapping.sixty_user_id;
  const orgId: string = mapping.org_id;

  // Load rep profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name, email')
    .eq('id', repUserId)
    .maybeSingle();

  const repFirstName = profile?.first_name || 'The team';
  const repEmail = profile?.email || '';

  // Load meeting
  const { data: meeting } = await supabase
    .from('calendar_events')
    .select('title, start_time, attendees')
    .eq('id', meetingId)
    .maybeSingle();

  if (!meeting) {
    return { success: false, responseText: '', error: 'Meeting not found' };
  }

  const externalAttendees = extractExternalAttendees(meeting.attendees, repEmail);
  if (externalAttendees.length === 0) {
    return { success: false, responseText: '', error: 'No external attendees found for this meeting' };
  }

  const meetingTime = formatMeetingTime(meeting.start_time);
  const meetingTitle = meeting.title || 'our call';

  switch (actionSuffix) {
    case 'booking_confirm': {
      const errors: string[] = [];
      let sentCount = 0;

      for (const attendee of externalAttendees) {
        const firstName = attendee.name.split(' ')[0] || attendee.name;

        try {
          const { subject, body } = await draftEmail(repFirstName, firstName, meetingTitle, meetingTime);
          await sendEmail(repUserId, orgId, attendee.email, subject, body, true);
          sentCount++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[prepBriefing] Failed to send to ${attendee.email}:`, msg);
          errors.push(`${attendee.email}: ${msg}`);
        }
      }

      if (sentCount === 0) {
        return {
          success: false,
          responseText: '',
          error: `Failed to send: ${errors.join(', ')}`,
        };
      }

      const names = externalAttendees.slice(0, 3).map(a => a.name.split(' ')[0]).join(', ');
      return {
        success: true,
        responseText: `Email draft created for ${names} — open Gmail drafts to review and send.`,
      };
    }

    case 'ask_question': {
      if (!triggerId || !slackContext?.teamId) {
        return { success: false, responseText: '', error: 'Missing trigger_id or team context' };
      }

      // Look up bot token for this Slack workspace
      const { data: orgSettings } = await supabase
        .from('slack_org_settings')
        .select('bot_access_token')
        .eq('slack_team_id', slackContext.teamId)
        .eq('is_connected', true)
        .maybeSingle();

      const botToken = orgSettings?.bot_access_token as string | null;
      if (!botToken) {
        return { success: false, responseText: '', error: 'Slack bot token not found for this workspace' };
      }

      const privateMetadata = JSON.stringify({
        meetingId,
        channelId: slackContext.channelId || '',
        messageTs: slackContext.messageTs || '',
      });

      const modalResponse = await fetch('https://slack.com/api/views.open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${botToken}`,
        },
        body: JSON.stringify({
          trigger_id: triggerId,
          view: {
            type: 'modal',
            callback_id: 'prep_briefing_ask_modal',
            private_metadata: privateMetadata,
            title: { type: 'plain_text', text: 'Ask a Question' },
            submit: { type: 'plain_text', text: 'Ask' },
            close: { type: 'plain_text', text: 'Cancel' },
            blocks: [
              {
                type: 'input',
                block_id: 'question_block',
                element: {
                  type: 'plain_text_input',
                  action_id: 'question_input',
                  multiline: true,
                  placeholder: {
                    type: 'plain_text',
                    text: 'What do you want to know about this prospect or their company?',
                  },
                },
                label: { type: 'plain_text', text: 'Your question' },
              },
            ],
          },
        }),
      });

      const modalResult = await modalResponse.json() as { ok: boolean; error?: string };
      if (!modalResult.ok) {
        console.error('[prepBriefing] views.open failed:', modalResult.error);
        return { success: false, responseText: '', error: `Could not open modal: ${modalResult.error}` };
      }

      return { success: true, responseText: '' };
    }

    default:
      return { success: false, responseText: '', error: `Unknown action: ${actionSuffix}` };
  }
}

// ---- Ask Question submission handler ----------------------------------------

export async function handlePrepBriefingAskSubmission(
  payload: any,
): Promise<void> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Parse modal private_metadata
  let meetingId: string;
  let channelId: string;
  let messageTs: string;
  try {
    const meta = JSON.parse(payload.view?.private_metadata || '{}');
    meetingId = meta.meetingId || '';
    channelId = meta.channelId || '';
    messageTs = meta.messageTs || '';
  } catch {
    console.error('[prepBriefing ask] Failed to parse private_metadata');
    return;
  }

  if (!meetingId || !channelId) {
    console.error('[prepBriefing ask] Missing meetingId or channelId');
    return;
  }

  // Extract the question from view state
  const question: string =
    payload.view?.state?.values?.question_block?.question_input?.value || '';
  if (!question.trim()) return;

  // Resolve Slack user → rep
  const slackUserId: string = payload.user?.id || '';
  const teamId: string = payload.team?.id || payload.view?.team_id || '';

  const { data: mapping } = await supabase
    .from('slack_user_mappings')
    .select('sixty_user_id, org_id')
    .eq('slack_user_id', slackUserId)
    .maybeSingle();

  if (!mapping?.sixty_user_id) {
    console.error('[prepBriefing ask] Could not resolve Slack user:', slackUserId);
    return;
  }

  // Load meeting context
  const { data: meeting } = await supabase
    .from('calendar_events')
    .select('title, company_name, deal_id')
    .eq('id', meetingId)
    .maybeSingle();

  const companyName = meeting?.company_name || 'the company';
  const dealId = meeting?.deal_id || null;

  // Get bot token for posting back to Slack
  const { data: orgSettings } = await supabase
    .from('slack_org_settings')
    .select('bot_access_token')
    .eq('slack_team_id', teamId)
    .eq('is_connected', true)
    .maybeSingle();

  const botToken = orgSettings?.bot_access_token as string | null;
  if (!botToken) {
    console.error('[prepBriefing ask] No bot token for team:', teamId);
    return;
  }

  const exaKey = Deno.env.get('EXA_API_KEY');

  // Parallel: Exa search + (placeholder for future RAG)
  const exaSearchPromise = exaKey
    ? fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: { 'x-api-key': exaKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `${companyName} ${question}`,
          type: 'auto',
          numResults: 5,
          contents: { text: { maxCharacters: 1200 } },
        }),
      })
        .then(r => r.json() as Promise<{ results?: Array<{ title?: string; url?: string; text?: string }> }>)
        .catch(err => {
          console.warn('[prepBriefing ask] Exa error:', err);
          return { results: [] };
        })
    : Promise.resolve({ results: [] });

  const [exaData] = await Promise.all([exaSearchPromise]);

  const exaResults = (exaData.results || []).map(r => ({
    title: r.title || '',
    url: r.url || '',
    snippet: (r.text || '').slice(0, 800),
  }));

  // Build context for Claude
  const sourcesText = exaResults.length > 0
    ? exaResults
        .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.url}`)
        .join('\n\n')
    : 'No web search results available.';

  const claudePrompt = `You are a sales intelligence assistant. A sales rep is asking a question about a prospect before a meeting.

Company: ${companyName}
Question: ${question}

Web search context:
${sourcesText}

Answer the question concisely and directly — 2-4 sentences max. Only use information from the provided context. If the context doesn't answer the question, say so plainly. No filler phrases.`;

  let answer = 'I could not find a clear answer to that question from available sources.';

  if (anthropicKey) {
    try {
      const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 400,
          temperature: 0.3,
          messages: [{ role: 'user', content: claudePrompt }],
        }),
      });

      if (claudeResp.ok) {
        const claudeData = await claudeResp.json() as { content?: Array<{ text?: string }> };
        answer = claudeData.content?.[0]?.text?.trim() || answer;
      }
    } catch (err) {
      console.error('[prepBriefing ask] Claude error:', err);
    }
  }

  // Build source context line
  const sourceContext = exaResults.length > 0
    ? `Sources: ${exaResults.slice(0, 3).map((r, i) => `<${r.url}|[${i + 1}]>`).join(' ')}`
    : 'No sources available';

  // Post answer to the original Slack thread
  const slackPostBody = {
    channel: channelId,
    thread_ts: messageTs,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Q: ${question}*` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: answer },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: sourceContext }],
      },
    ],
  };

  const postResp = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${botToken}`,
    },
    body: JSON.stringify(slackPostBody),
  });

  const postResult = await postResp.json() as { ok: boolean; error?: string };
  if (!postResult.ok) {
    console.error('[prepBriefing ask] chat.postMessage failed:', postResult.error);
  } else {
    console.log('[prepBriefing ask] Answer posted to thread:', channelId, messageTs);
  }
}
