/**
 * demo-prep-briefing — On-demand pre-meeting briefing generator with SSE streaming.
 *
 * Accepts POST { meeting_id, delivery: 'slack' | 'preview' } and returns a
 * Server-Sent Events stream. Each pipeline step emits a `step` event so the
 * client can render live progress. The final event is `complete` and carries
 * the full briefing (Slack blocks + markdown + metadata).
 *
 * Auth: JWT-protected. User must belong to an organisation.
 * Deploy: --no-verify-jwt (staging ES256 issue — auth is validated internally).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders } from '../_shared/corsHelper.ts';
import { detectMeetingHistory } from '../_shared/meeting-prep/historyDetector.ts';
import { getHistoricalContext, createRAGClient } from '../_shared/meeting-prep/ragQueries.ts';
import {
  buildReturnMeetingPrompt,
  buildReturnMeetingSlackBlocks,
  buildReturnMeetingMarkdown,
  buildFirstMeetingPrompt,
  buildFirstMeetingSlackBlocks,
  buildFirstMeetingMarkdown,
  RETURN_MEETING_SYSTEM_PROMPT,
  FIRST_MEETING_SYSTEM_PROMPT,
} from '../_shared/meeting-prep/briefingComposer.ts';
import type { GenerationStep } from '../_shared/meeting-prep/types.ts';
import { logAICostEvent, extractAnthropicUsage } from '../_shared/costTracking.ts';

// ---- SSE helpers ------------------------------------------------------------

/**
 * Encode a single SSE event frame. Each frame is:
 *   data: <json>\n\n
 * The double newline signals end-of-event to the browser EventSource API.
 */
function sseEvent(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

// ---- Step tracker -----------------------------------------------------------

/**
 * Tracks pipeline steps and emits SSE events as each step transitions state.
 * Implements the StepTracker interface from types.ts without importing it
 * directly to keep the class self-contained (the interface is structural).
 */
class StepTrackerImpl {
  private readonly steps: GenerationStep[] = [];
  private readonly stepTimers = new Map<string, number>();
  private readonly sendEvent: (data: Uint8Array) => void;

  constructor(sendEvent: (data: Uint8Array) => void) {
    this.sendEvent = sendEvent;
  }

  start(id: string, label: string): void {
    this.stepTimers.set(id, Date.now());
    const step: GenerationStep = { id, label, status: 'running' };
    this.steps.push(step);
    this.sendEvent(sseEvent({ type: 'step', step }));
  }

  complete(id: string, detail?: string): void {
    const step = this.steps.find((s) => s.id === id);
    if (step) {
      step.status = 'complete';
      if (detail !== undefined) step.detail = detail;
      step.duration_ms = Date.now() - (this.stepTimers.get(id) ?? Date.now());
      this.sendEvent(sseEvent({ type: 'step', step }));
    }
  }

  skip(id: string, detail?: string): void {
    const step: GenerationStep = { id, label: id, status: 'skipped', detail };
    this.steps.push(step);
    this.sendEvent(sseEvent({ type: 'step', step }));
  }

  fail(id: string, detail?: string): void {
    const step = this.steps.find((s) => s.id === id);
    if (step) {
      step.status = 'failed';
      if (detail !== undefined) step.detail = detail;
      step.duration_ms = Date.now() - (this.stepTimers.get(id) ?? Date.now());
      this.sendEvent(sseEvent({ type: 'step', step }));
    }
  }

  getSteps(): GenerationStep[] {
    return this.steps;
  }
}

// ---- Attendee parsing helpers -----------------------------------------------

/**
 * Extract lowercased email strings from a calendar_events.attendees JSONB value.
 * Handles both plain-string emails and {email, name} object shapes.
 */
function extractAttendeeEmails(attendees: unknown): string[] {
  if (!Array.isArray(attendees)) return [];
  const emails: string[] = [];
  for (const a of attendees) {
    if (typeof a === 'string' && a.includes('@')) {
      emails.push(a.toLowerCase());
    } else if (a && typeof a === 'object' && 'email' in a) {
      const email = (a as { email?: unknown }).email;
      if (typeof email === 'string' && email) emails.push(email.toLowerCase());
    }
  }
  return emails;
}

/**
 * Extract display names from a calendar_events.attendees JSONB value.
 * Falls back to email address when no name is available.
 */
function extractAttendeeNames(attendees: unknown): string[] {
  if (!Array.isArray(attendees)) return [];
  const names: string[] = [];
  for (const a of attendees) {
    if (typeof a === 'string') {
      names.push(a);
    } else if (a && typeof a === 'object') {
      const obj = a as Record<string, unknown>;
      const name =
        (typeof obj.name === 'string' && obj.name) ||
        (typeof obj.displayName === 'string' && obj.displayName) ||
        (typeof obj.email === 'string' && obj.email) ||
        'Unknown';
      names.push(name);
    }
  }
  return names;
}

// ---- Main handler -----------------------------------------------------------

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS pre-flight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // ---- Auth ---------------------------------------------------------------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // User client — validates the caller's JWT and scopes reads to their rows.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Service client — broader queries that need to bypass RLS (cost tracking,
    // Slack integration lookup, etc.). Never exposed to the caller.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ---- Request body -------------------------------------------------------
    let body: { meeting_id?: unknown; delivery?: unknown };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { meeting_id, delivery = 'preview' } = body;

    if (!meeting_id || typeof meeting_id !== 'string') {
      return new Response(JSON.stringify({ error: 'meeting_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (delivery !== 'slack' && delivery !== 'preview') {
      return new Response(
        JSON.stringify({ error: "delivery must be 'slack' or 'preview'" }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // ---- Org membership -----------------------------------------------------
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    const orgId: string | null = membership?.org_id ?? null;
    if (!orgId) {
      return new Response(JSON.stringify({ error: 'No organization found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---- SSE stream ---------------------------------------------------------
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Uint8Array): void => {
          try {
            controller.enqueue(data);
          } catch {
            // Stream may already be closed — swallow silently.
          }
        };

        const tracker = new StepTrackerImpl(send);
        const startTime = Date.now();

        try {
          // ---- Step 1: Load meeting context ----------------------------------
          tracker.start('load_context', 'Loading meeting context');

          // calendar_events uses user_id (not owner_user_id) — see CLAUDE.md
          const { data: meeting, error: meetingError } = await supabase
            .from('calendar_events')
            .select(
              'id, title, start_time, end_time, attendees, attendees_count, is_internal',
            )
            .eq('id', meeting_id)
            .eq('user_id', user.id)
            .maybeSingle();

          if (meetingError || !meeting) {
            tracker.fail(
              'load_context',
              meetingError?.message ?? 'Meeting not found or not accessible',
            );
            send(sseEvent({ type: 'error', message: 'Meeting not found' }));
            controller.close();
            return;
          }

          tracker.complete('load_context', meeting.title ?? 'Untitled meeting');

          const rawAttendees: unknown = meeting.attendees;
          const attendeeEmails = extractAttendeeEmails(rawAttendees);
          const attendeeNames = extractAttendeeNames(rawAttendees);

          // Exclude the user's own email/name from external attendee lists.
          // attendeeEmails and attendeeNames are parallel arrays (same index = same person).
          // This prevents the rep appearing in "Who You're Meeting" and inflating
          // the prior-meeting count with their own calendar history.
          const userEmail = user.email?.toLowerCase() ?? '';
          const externalAttendeeEmails = userEmail
            ? attendeeEmails.filter(e => e !== userEmail)
            : attendeeEmails;
          const externalAttendeeNames = userEmail
            ? attendeeNames.filter((_, i) => attendeeEmails[i] !== userEmail)
            : attendeeNames;

          console.log(
            `[demo-prep-briefing] Meeting "${meeting.title}" — ${attendeeEmails.length} attendee(s) (${externalAttendeeEmails.length} external)`,
          );

          // ---- Step 2: Check meeting history --------------------------------
          tracker.start('history_check', 'Checking meeting history');

          const meetingHistory = await detectMeetingHistory(
            supabase,
            meeting_id,
            externalAttendeeEmails,
            user.id,
            orgId,
          );

          tracker.complete(
            'history_check',
            meetingHistory.isReturnMeeting
              ? `${meetingHistory.priorMeetingCount} prior meeting(s) found`
              : 'First meeting with these attendees',
          );

          // ---- Step 3: RAG queries (return meetings only) -------------------
          type HistoricalCtx = Awaited<ReturnType<typeof getHistoricalContext>>;
          let historicalContext: HistoricalCtx | null = null;

          if (meetingHistory.isReturnMeeting && meetingHistory.priorMeetingCount > 0) {
            tracker.start(
              'rag_queries',
              `Querying transcript history across ${meetingHistory.priorMeetingCount} meeting(s)`,
            );

            try {
              const ragClient = createRAGClient(orgId);
              // Pass null for contactId — we don't resolve the primary contact
              // for the demo flow. Queries will be scoped by owner_user_id only.
              historicalContext = await getHistoricalContext(
                null,
                user.id,
                ragClient,
              );
              // Override the meeting count with the actual value from historyDetector
              // (ragQueries initialises it to 0 — caller is responsible for setting it).
              historicalContext.meetingCount = meetingHistory.priorMeetingCount;

              const sectionsReturned = Object.keys(historicalContext.sections).length;
              tracker.complete(
                'rag_queries',
                `${sectionsReturned} of 8 queries returned results`,
              );
            } catch (err) {
              const detail = err instanceof Error ? err.message : 'RAG query failed';
              tracker.fail('rag_queries', detail);
              console.error('[demo-prep-briefing] RAG error (continuing without history):', err);
              // Degrade gracefully — proceed as first meeting rather than hard-failing.
            }
          } else {
            tracker.skip('rag_queries', 'First meeting — no history to query');
          }

          // ---- Step 4: Compose briefing with AI -----------------------------
          tracker.start('compose', 'Composing briefing with AI');

          const meetingTitle = meeting.title ?? 'Meeting';
          const meetingTime = new Date(meeting.start_time).toLocaleString('en-GB', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          });

          // Company name is simplified for the demo path — the cron-triggered
          // flow resolves it from contacts/HubSpot. Here we fall back to a
          // generic label so all downstream formatters still have a value.
          const companyName = 'Company';

          const isReturn =
            meetingHistory.isReturnMeeting &&
            historicalContext !== null &&
            historicalContext.hasHistory;

          let promptText: string;
          let systemPrompt: string;

          if (isReturn && historicalContext !== null) {
            systemPrompt = RETURN_MEETING_SYSTEM_PROMPT;

            const attendeeProfilesStr = externalAttendeeNames.map((n) => `- ${n}`).join('\n');
            const attendeeComparisonStr =
              meetingHistory.attendeeHistory
                .map((ah) =>
                  ah.classification === 'new'
                    ? `- ${ah.email}: NEW`
                    : `- ${ah.email}: RETURNING (${ah.meetingsAttended} prior)`,
                )
                .join('\n') || 'No comparison data available';

            promptText = buildReturnMeetingPrompt({
              meetingTitle,
              meetingTime,
              meetingNumber: meetingHistory.priorMeetingCount + 1,
              companyName,
              dealStage: null,
              daysInStage: null,
              dealAmount: null,
              attendeeProfiles: attendeeProfilesStr,
              attendeeComparison: attendeeComparisonStr,
              historicalContext,
              hubspotContext: '',
              companyNews: '',
            });
          } else {
            systemPrompt = FIRST_MEETING_SYSTEM_PROMPT;

            promptText = buildFirstMeetingPrompt({
              meetingTitle,
              meetingTime,
              companyName,
              attendeeProfiles: externalAttendeeNames.map((n) => `- ${n}`).join('\n') ||
                '- No attendee information available',
              companySnapshot: 'No company data available for this meeting',
              icpFitNotes: '',
              dealSource: null,
              companyNews: '',
            });
          }

          // Call Claude (gracefully degrades when ANTHROPIC_API_KEY is absent)
          const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
          let briefing: Record<string, unknown>;

          if (apiKey) {
            const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 1500,
                temperature: 0.3,
                system: systemPrompt,
                messages: [{ role: 'user', content: promptText }],
              }),
            });

            if (!claudeResponse.ok) {
              const errText = await claudeResponse.text().catch(() => '');
              throw new Error(
                `Claude API returned ${claudeResponse.status}: ${errText}`,
              );
            }

            const claudeResult = await claudeResponse.json();
            const textContent: string | undefined = claudeResult.content?.[0]?.text;

            // Claude is instructed to return raw JSON — extract it from the
            // response text in case it wraps it in a markdown code block.
            const jsonMatch = textContent?.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
              throw new Error(
                'Claude response contained no JSON object. Raw content: ' +
                  (textContent?.slice(0, 200) ?? '(empty)'),
              );
            }

            briefing = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

            // Fire-and-forget cost tracking — never block the stream on this.
            const usage = extractAnthropicUsage(claudeResult);
            logAICostEvent(
              supabase,
              user.id,
              orgId,
              'anthropic',
              'claude-haiku-4-5-20251001',
              usage.inputTokens,
              usage.outputTokens,
              'pre-meeting-briefing-demo',
              { meeting_id },
            ).catch((err) => {
              console.warn('[demo-prep-briefing] Cost tracking failed (non-fatal):', err);
            });
          } else {
            // Stub briefing when no API key is configured (e.g. local dev)
            console.warn(
              '[demo-prep-briefing] ANTHROPIC_API_KEY not set — returning stub briefing',
            );
            briefing = {
              executive_summary:
                `Briefing for "${meetingTitle}". AI generation is unavailable — ANTHROPIC_API_KEY not configured.`,
              story_so_far: isReturn
                ? 'Previous meetings were detected but AI synthesis is unavailable.'
                : null,
              attendees: externalAttendeeNames.map((n) => ({ name: n })),
            };
          }

          tracker.complete('compose');

          // ---- Build formatted output ----------------------------------------
          const meetingNumber = meetingHistory.priorMeetingCount + 1;

          const slackBlocks = isReturn
            ? buildReturnMeetingSlackBlocks(
                briefing,
                meetingTitle,
                meetingTime,
                meetingNumber,
                companyName,
              )
            : buildFirstMeetingSlackBlocks(briefing, meetingTitle, meetingTime, companyName);

          const markdown = isReturn
            ? buildReturnMeetingMarkdown(briefing, meetingTitle, meetingNumber, companyName)
            : buildFirstMeetingMarkdown(briefing, meetingTitle, companyName);

          // ---- Step 5: Slack delivery (optional) ----------------------------
          if (delivery === 'slack') {
            tracker.start('deliver', 'Sending to Slack');

            const { data: slackIntegration } = await supabase
              .from('slack_integrations')
              .select('access_token')
              .eq('user_id', user.id)
              .eq('is_active', true)
              .limit(1)
              .maybeSingle();

            const { data: slackMapping } = await supabase
              .from('slack_user_mappings')
              .select('slack_user_id')
              .eq('org_id', orgId)
              .eq('sixty_user_id', user.id)
              .maybeSingle();

            if (slackIntegration?.access_token && slackMapping?.slack_user_id) {
              const slackResp = await fetch('https://slack.com/api/chat.postMessage', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${slackIntegration.access_token}`,
                },
                body: JSON.stringify({
                  channel: slackMapping.slack_user_id,
                  text:
                    (briefing.executive_summary as string | undefined) ??
                    `Pre-meeting brief: ${meetingTitle}`,
                  blocks: slackBlocks,
                  unfurl_links: false,
                  unfurl_media: false,
                }),
              });

              const slackResult = await slackResp.json() as { ok: boolean; error?: string };
              if (slackResult.ok) {
                tracker.complete('deliver', 'Sent to Slack DM');
              } else {
                tracker.fail('deliver', `Slack API error: ${slackResult.error ?? 'unknown'}`);
              }
            } else {
              tracker.fail(
                'deliver',
                !slackIntegration?.access_token
                  ? 'No active Slack integration found'
                  : 'No Slack user mapping found for this account',
              );
            }
          }

          // ---- Final complete event ------------------------------------------
          const totalTime = Date.now() - startTime;

          // Credit estimate: 0.5 base + 0.0625 per RAG query credit consumed.
          const ragQueryCredits = historicalContext?.queryCredits ?? 0;
          const creditsConsumed = ragQueryCredits * 0.0625 + 0.5;

          send(
            sseEvent({
              type: 'complete',
              briefing: {
                slack_blocks: slackBlocks,
                markdown,
                metadata: {
                  meeting_number: meetingNumber,
                  prior_meetings_found: meetingHistory.priorMeetingCount,
                  rag_queries_run: historicalContext !== null ? 8 : 0,
                  rag_queries_returned: historicalContext !== null
                    ? Object.keys(historicalContext.sections).length
                    : 0,
                  attendees_enriched: externalAttendeeEmails.length,
                  credits_consumed: creditsConsumed,
                  generation_time_ms: totalTime,
                  model_used: 'claude-haiku-4-5-20251001',
                  is_return_meeting: isReturn,
                },
              },
              steps: tracker.getSteps(),
            }),
          );

          console.log(
            `[demo-prep-briefing] Complete in ${totalTime}ms — ` +
              `return=${isReturn}, rag_sections=${historicalContext !== null ? Object.keys(historicalContext.sections).length : 0}`,
          );
        } catch (err) {
          console.error('[demo-prep-briefing] Pipeline error:', err);
          send(
            sseEvent({
              type: 'error',
              message: err instanceof Error ? err.message : 'Unknown error',
            }),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    console.error('[demo-prep-briefing] Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
