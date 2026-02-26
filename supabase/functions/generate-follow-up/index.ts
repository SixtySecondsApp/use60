/**
 * Generate Follow-Up — FU-008
 *
 * Edge function that generates follow-up emails on demand with real-time
 * progress streaming via SSE.
 *
 * Endpoints:
 *   GET  / — returns the last 10 external meetings with transcripts (FU-009)
 *   POST / — generates a follow-up email with SSE step-by-step progress
 *
 * SSE events emitted during POST:
 *   step   — progress update for each pipeline stage
 *   result — final composed email + metadata
 *   error  — terminal error; stream closes immediately after
 *
 * Deploy with --no-verify-jwt (staging ES256 JWT issue).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { getAuthContext } from '../_shared/edgeAuth.ts';
import { detectMeetingHistory } from '../_shared/rag/historyDetector.ts';
import { createRAGClient } from '../_shared/rag/ragClient.ts';
import { getFollowUpContext } from '../_shared/follow-up/ragQueries.ts';
import {
  composeReturnMeetingFollowUp,
  composeFirstMeetingFollowUp,
} from '../_shared/follow-up/composer.ts';
import { sendSlackDM } from '../_shared/proactive/deliverySlack.ts';

// ============================================================================
// Constants
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Extract key topics from meeting summary text.
 * Simple keyword extraction — looks for capitalized phrases, product names, and common topic markers.
 */
function extractKeyTopics(summary: string): string[] {
  if (!summary || summary.length < 20) return [];
  // Split into sentences and take the first noun phrase of each as a "topic"
  const sentences = summary.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const topics: string[] = [];
  for (const sentence of sentences.slice(0, 8)) {
    // Look for phrases after common topic markers
    const match = sentence.match(/(?:discussed|covered|talked about|reviewed|mentioned|explored|addressed)\s+(.{5,60}?)(?:[,.]|$)/i);
    if (match) {
      topics.push(match[1].trim().replace(/^(?:the|a|an)\s+/i, ''));
    }
  }
  // Deduplicate and limit
  return [...new Set(topics)].slice(0, 5);
}

/**
 * Extract buying signals from meeting summary text.
 * Looks for budget mentions, timeline confirmations, stakeholder buy-in, next step commitments.
 */
function extractBuyingSignals(summary: string): string[] {
  if (!summary || summary.length < 20) return [];
  const signals: string[] = [];
  const lower = summary.toLowerCase();

  if (/budget|pricing|cost|invest|spend|\$|£|€/.test(lower)) signals.push('Budget discussion');
  if (/timeline|deadline|by\s+(q[1-4]|january|february|march|april|may|june|july|august|september|october|november|december)/i.test(lower)) signals.push('Timeline mentioned');
  if (/pilot|trial|poc|proof of concept/.test(lower)) signals.push('Pilot/trial interest');
  if (/next\s*step|follow[\s-]*up|schedule|book|calendar/.test(lower)) signals.push('Next steps committed');
  if (/decision[\s-]*maker|stakeholder|leadership|board|ceo|cto|vp|director/.test(lower)) signals.push('Stakeholder involvement');
  if (/contract|agreement|proposal|quote|sow|statement of work/.test(lower)) signals.push('Commercial progression');
  if (/competitor|alternative|other\s+vendor|also\s+looking/.test(lower)) signals.push('Competitive evaluation');

  return signals;
}

// ============================================================================
// Entry point
// ============================================================================

serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(req);

  // Support GET for recent meetings list, POST for generation
  if (req.method === 'GET') {
    return handleRecentMeetings(req, corsHeaders);
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  return handleGenerateFollowUp(req, corsHeaders);
});

// ============================================================================
// GET handler: recent meetings list (for FU-009)
// ============================================================================

async function handleRecentMeetings(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const authContext = await getAuthContext(req, supabase, SUPABASE_SERVICE_ROLE_KEY);
    if (!authContext.userId) {
      return errorResponse('Unauthorized', req, 401);
    }

    // Get user's org
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', authContext.userId)
      .limit(1)
      .maybeSingle();

    if (!membership?.org_id) {
      return errorResponse('No org found', req, 400);
    }

    // Get last 20 meetings owned by this user — any with a transcript or summary
    const { data: meetingsWithTranscript } = await supabase
      .from('meetings')
      .select('id, title, created_at, duration_minutes, company_id, transcript_text, summary')
      .eq('owner_user_id', authContext.userId)
      .eq('org_id', membership.org_id)
      .not('transcript_text', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20);

    // Also grab meetings with just a summary (no raw transcript stored)
    const { data: meetingsWithSummary } = await supabase
      .from('meetings')
      .select('id, title, created_at, duration_minutes, company_id, transcript_text, summary')
      .eq('owner_user_id', authContext.userId)
      .eq('org_id', membership.org_id)
      .is('transcript_text', null)
      .not('summary', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    // Merge and deduplicate, transcript-first
    const seenIds = new Set<string>();
    const meetings: typeof meetingsWithTranscript = [];
    for (const m of [...(meetingsWithTranscript || []), ...(meetingsWithSummary || [])]) {
      if (!seenIds.has(m.id)) { seenIds.add(m.id); meetings.push(m); }
    }
    meetings.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Enrich each meeting with attendees, company name, and meeting number
    const enrichedMeetings = [];

    for (const mtg of meetings.slice(0, 10)) {
      // Get all attendees — prefer external flag, fall back to all non-empty emails
      const { data: allAttendees } = await supabase
        .from('meeting_attendees')
        .select('name, email, is_external')
        .eq('meeting_id', mtg.id);

      const externalAttendees = (allAttendees || []).filter((a: { is_external: boolean }) => a.is_external);
      let attendees: Array<{ name: string | null; email: string | null }> =
        externalAttendees.length > 0
          ? externalAttendees
          : (allAttendees || []).filter((a: { email: string | null }) => !!a.email);

      // Fallback: meeting_contacts → contacts table
      if (attendees.length === 0) {
        const { data: mc } = await supabase
          .from('meeting_contacts')
          .select('contacts(first_name, last_name, email)')
          .eq('meeting_id', mtg.id)
          .limit(3);
        attendees = (mc || [])
          .map((row: any) => row.contacts)
          .filter((c: any) => c?.email)
          .map((c: any) => ({
            name: [c.first_name, c.last_name].filter(Boolean).join(' ') || null,
            email: c.email,
          }));
      }

      // Resolve company name
      let companyName: string | null = null;
      if (mtg.company_id) {
        const { data: company } = await supabase
          .from('companies')
          .select('name')
          .eq('id', mtg.company_id)
          .maybeSingle();
        companyName = company?.name ?? null;
      }

      // Count prior transcribed meetings for this company to derive meeting number
      let meetingNumber = 1;
      if (mtg.company_id) {
        const { count } = await supabase
          .from('meetings')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', mtg.company_id)
          .eq('org_id', membership.org_id)
          .not('transcript_text', 'is', null)
          .lte('created_at', mtg.created_at);
        meetingNumber = count ?? 1;
      }

      enrichedMeetings.push({
        id: mtg.id,
        title: mtg.title,
        date: mtg.created_at,
        durationMinutes: mtg.duration_minutes,
        attendees: attendees.map((a: { name: string | null; email: string | null }) => ({
          name: a.name,
          email: a.email,
        })),
        companyName,
        meetingNumber,
        hasTranscript: true,
      });
    }

    return new Response(JSON.stringify({ meetings: enrichedMeetings }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[generate-follow-up] GET error:', err instanceof Error ? err.message : String(err));
    return errorResponse(
      err instanceof Error ? err.message : 'Internal server error',
      req,
      500,
    );
  }
}

// ============================================================================
// POST handler: generate follow-up with SSE streaming
// ============================================================================

async function handleGenerateFollowUp(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { meeting_id, include_comparison, delivery, regenerate_guidance, cached_rag_context, version } = body as {
    meeting_id?: string;
    include_comparison?: boolean;
    delivery?: string;
    regenerate_guidance?: string;
    cached_rag_context?: {
      hasHistory: boolean;
      meetingNumber: number;
      sections: Record<string, { chunks: unknown[] }>;
      queryCredits: number;
    };
    version?: number;
  };

  if (!meeting_id) {
    return errorResponse('meeting_id required', req, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Authenticate before opening the stream so we can return a normal 401 if
  // auth fails (browsers handle SSE errors poorly once the stream is open).
  let userId: string;
  try {
    const authContext = await getAuthContext(req, supabase, SUPABASE_SERVICE_ROLE_KEY);
    console.log('[generate-follow-up] authContext:', { mode: authContext.mode, userId: authContext.userId, bodyUserId: (body as any).user_id });
    if (authContext.mode === 'service_role' && (body as any).user_id) {
      // Allow service-role callers to specify user_id (for cron/internal triggers)
      userId = (body as any).user_id;
    } else if (!authContext.userId) {
      return errorResponse('Unauthorized', req, 401);
    } else {
      userId = authContext.userId;
    }
  } catch (authErr) {
    console.error('[generate-follow-up] auth error:', authErr);
    return errorResponse('Unauthorized', req, 401);
  }

  // Build the SSE stream
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const stepTimers = new Map<string, number>();
      const sendEvent = (event: string, data: Record<string, unknown>) => {
        if (event === 'step' && data.id) {
          if (data.status === 'running') {
            stepTimers.set(data.id as string, Date.now());
          } else if (data.status === 'complete' || data.status === 'skipped') {
            const startTime = stepTimers.get(data.id as string);
            if (startTime) {
              data.durationMs = Date.now() - startTime;
            }
          }
        }
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      const warnings: Array<{ severity: 'info' | 'warn'; message: string }> = [];

      try {
        // ----------------------------------------------------------------
        // Step 1: Load meeting
        // ----------------------------------------------------------------
        sendEvent('step', { id: 'load_meeting', status: 'running', label: 'Loading meeting data' });

        const { data: meeting } = await supabase
          .from('meetings')
          .select('id, title, created_at, duration_minutes, company_id, org_id, owner_user_id, transcript_text, summary, sentiment_score, summary_oneliner')
          .eq('id', meeting_id)
          .single();

        if (!meeting) {
          sendEvent('error', { message: 'Meeting not found' });
          controller.close();
          return;
        }

        if (!meeting.transcript_text && !meeting.summary) {
          sendEvent('error', { message: 'Meeting has no transcript — cannot generate follow-up' });
          controller.close();
          return;
        }

        sendEvent('step', { id: 'load_meeting', status: 'complete', label: 'Meeting loaded' });

        // ----------------------------------------------------------------
        // Step 2: Load meeting analysis (action items)
        // ----------------------------------------------------------------
        sendEvent('step', {
          id: 'load_analysis',
          status: 'running',
          label: 'Loading transcript analysis',
        });

        const { data: actionItems } = await supabase
          .from('meeting_action_items')
          .select('title, assignee_name, deadline_at, completed')
          .eq('meeting_id', meeting_id);

        const sentimentScore = typeof meeting.sentiment_score === 'number' ? meeting.sentiment_score as number : null;
        const analysis = {
          summary: (meeting.summary as string | null) ?? 'No summary available',
          actionItems: (actionItems ?? []).map((ai: {
            title: string | null;
            assignee_name: string | null;
          }) => ({
            task: ai.title ?? '',
            suggestedOwner: ai.assignee_name ?? undefined,
          })),
          sentiment: sentimentScore !== null
            ? (sentimentScore > 0.5 ? 'positive' : sentimentScore < -0.5 ? 'challenging' : 'neutral')
            : undefined,
          keyTopics: extractKeyTopics((meeting.summary as string | null) ?? ''),
          buyingSignals: extractBuyingSignals((meeting.summary as string | null) ?? ''),
        };

        if (!sentimentScore && sentimentScore !== 0) {
          warnings.push({ severity: 'info', message: 'No sentiment score — email tone is not calibrated to meeting mood' });
        }

        sendEvent('step', {
          id: 'load_analysis',
          status: 'complete',
          label: `${analysis.actionItems.length} action items, ${analysis.keyTopics?.length || 0} topics, ${analysis.buyingSignals?.length || 0} signals`,
          detail: `${analysis.actionItems.length} action items`,
        });

        // ----------------------------------------------------------------
        // Step 3: Load external attendees
        // ----------------------------------------------------------------
        sendEvent('step', {
          id: 'load_attendees',
          status: 'running',
          label: 'Loading attendees',
        });

        // 1. Try meeting_attendees (is_external = true)
        const { data: extAttendees } = await supabase
          .from('meeting_attendees')
          .select('name, email, is_external')
          .eq('meeting_id', meeting_id)
          .eq('is_external', true);

        let primaryAttendee: { name: string | null; email: string | null } | undefined =
          extAttendees?.[0];

        // 2. Fallback: meeting_contacts → contacts (two separate queries to avoid join hangs)
        if (!primaryAttendee?.email) {
          const { data: mcRows } = await supabase
            .from('meeting_contacts')
            .select('contact_id')
            .eq('meeting_id', meeting_id)
            .limit(3);
          if (mcRows && mcRows.length > 0) {
            const contactIds = (mcRows as Array<{ contact_id: string }>).map((r) => r.contact_id);
            const { data: contactRows } = await supabase
              .from('contacts')
              .select('first_name, last_name, email')
              .in('id', contactIds)
              .not('email', 'is', null)
              .limit(1);
            const c = contactRows?.[0] as { first_name: string | null; last_name: string | null; email: string | null } | undefined;
            if (c?.email) {
              primaryAttendee = {
                name: [c.first_name, c.last_name].filter(Boolean).join(' ') || null,
                email: c.email,
              };
            }
          }
        }

        // 3. Fallback: any non-rep attendee in meeting_attendees
        if (!primaryAttendee?.email) {
          const { data: anyAttendees } = await supabase
            .from('meeting_attendees')
            .select('name, email')
            .eq('meeting_id', meeting_id)
            .neq('email', '');
          const nonOwner = (anyAttendees ?? []).find(
            (a: { email: string | null }) => a.email && !a.email?.endsWith('@sixtyseconds.video')
          ) ?? (anyAttendees ?? [])[0];
          if (nonOwner?.email) primaryAttendee = nonOwner;
        }

        // 4. Soft fallback: continue with placeholder so generation still works in the demo
        if (!primaryAttendee?.email) {
          primaryAttendee = { name: 'your prospect', email: 'prospect@example.com' };
        }

        if (primaryAttendee?.email === 'prospect@example.com') {
          warnings.push({ severity: 'warn', message: 'No attendee found — using placeholder recipient' });
        }

        // Try to get contact profile photo from LinkedIn enrichment cache
        let contactPhotoUrl: string | undefined;
        if (primaryAttendee?.email && primaryAttendee.email !== 'prospect@example.com') {
          try {
            const { data: enrichedRows } = await supabase
              .from('dynamic_table_rows')
              .select('source_data')
              .ilike('source_data->>email', primaryAttendee.email)
              .not('source_data->linkedin->>profilePic', 'is', null)
              .limit(1);
            const pic = (enrichedRows?.[0]?.source_data as any)?.linkedin?.profilePic;
            if (pic && typeof pic === 'string' && pic.startsWith('http')) {
              contactPhotoUrl = pic;
            }
          } catch {
            // Non-critical — continue without photo
          }
        }

        let companyName: string | undefined;
        if (meeting.company_id) {
          const { data: co } = await supabase
            .from('companies')
            .select('name')
            .eq('id', meeting.company_id)
            .maybeSingle();
          companyName = (co?.name as string | null) ?? undefined;
        }

        sendEvent('step', {
          id: 'load_attendees',
          status: 'complete',
          label: `Primary: ${primaryAttendee.name ?? primaryAttendee.email}`,
        });

        // ----------------------------------------------------------------
        // Step 4: Detect meeting history
        // ----------------------------------------------------------------
        sendEvent('step', {
          id: 'history_check',
          status: 'running',
          label: 'Checking meeting history',
        });

        const meetingHistory = await detectMeetingHistory(
          supabase,
          meeting_id,
          meeting.company_id as string | null,
          meeting.org_id as string,
        );

        sendEvent('step', {
          id: 'history_check',
          status: 'complete',
          label: meetingHistory.isFirstMeeting
            ? 'First meeting'
            : `${meetingHistory.priorMeetingCount} prior meetings`,
          detail: `${meetingHistory.priorMeetingCount} prior meetings`,
        });

        // ----------------------------------------------------------------
        // Step 5: RAG queries (return meetings only) — skip if cached
        // ----------------------------------------------------------------
        let followUpContext: {
          hasHistory: boolean;
          meetingNumber: number;
          sections: Record<string, { chunks: unknown[] }>;
          queryCredits: number;
        } | null = null;

        if (cached_rag_context) {
          // Regeneration path: reuse cached context from first generation
          followUpContext = cached_rag_context;
          sendEvent('step', {
            id: 'rag_queries',
            status: 'complete',
            label: 'Using cached RAG context (regeneration)',
            detail: `${Object.keys(cached_rag_context.sections).length}/6 queries (cached)`,
          });
        } else if (!meetingHistory.isFirstMeeting) {
          sendEvent('step', {
            id: 'rag_queries',
            status: 'running',
            label: `Querying history across ${meetingHistory.priorMeetingCount} meetings`,
          });

          const ragClient = createRAGClient({
            orgId: meeting.org_id as string,
          });

          followUpContext = await getFollowUpContext(
            null, // deal_id — not available at this call site
            [],   // contact_ids — omitted
            meeting_id,
            meetingHistory.priorMeetingCount + 1,
            ragClient,
            meeting.company_id as string | null,
          );

          const sectionsReturned = Object.keys(followUpContext.sections).length;

          if (followUpContext) {
            const totalQueries = 6;
            const returnedQueries = Object.keys(followUpContext.sections).length;
            if (returnedQueries < totalQueries && returnedQueries > 0) {
              warnings.push({ severity: 'info', message: `RAG returned ${returnedQueries}/${totalQueries} query categories` });
            } else if (returnedQueries === 0 && !meetingHistory.isFirstMeeting) {
              warnings.push({ severity: 'warn', message: 'RAG returned no historical context despite prior meetings existing' });
            }
          }

          sendEvent('step', {
            id: 'rag_queries',
            status: 'complete',
            label: `${sectionsReturned} of 6 queries returned context`,
            detail: `${sectionsReturned}/6 queries`,
          });
        } else {
          sendEvent('step', {
            id: 'rag_queries',
            status: 'skipped',
            label: 'First meeting — composing from transcript only',
          });
        }

        // ----------------------------------------------------------------
        // Step 6: Load writing style
        // ----------------------------------------------------------------
        sendEvent('step', {
          id: 'writing_style',
          status: 'running',
          label: 'Loading rep writing style',
        });

        const { data: styleRow } = await supabase
          .from('user_writing_styles')
          .select('name, tone_description, style_metadata')
          .eq('user_id', userId)
          .eq('is_default', true)
          .maybeSingle();

        // Also load words_to_avoid from tone settings
        const { data: toneSettings } = await supabase
          .from('user_tone_settings')
          .select('words_to_avoid')
          .eq('user_id', userId)
          .eq('content_type', 'email')
          .maybeSingle();

        let writingStyle = null;
        if (styleRow) {
          const meta = (styleRow as any).style_metadata || {};
          // style_metadata stores values both flat (older saves) and nested under tone/vocabulary/greetings_signoffs
          const tone = meta.tone || {};
          const vocabulary = meta.vocabulary || {};
          const greetingsSignoffs = meta.greetings_signoffs || {};
          writingStyle = {
            name: (styleRow as any).name || 'Default',
            toneDescription: (styleRow as any).tone_description || '',
            formality: tone.formality ?? meta.formality ?? 3,
            directness: tone.directness ?? meta.directness ?? 3,
            warmth: tone.warmth ?? meta.warmth ?? 3,
            commonPhrases: Array.isArray(vocabulary.common_phrases) ? vocabulary.common_phrases
              : Array.isArray(meta.common_phrases) ? meta.common_phrases : [],
            signoffs: Array.isArray(greetingsSignoffs.signoffs) ? greetingsSignoffs.signoffs
              : Array.isArray(meta.signoffs) ? meta.signoffs : [],
            wordsToAvoid: Array.isArray((toneSettings as any)?.words_to_avoid)
              ? (toneSettings as any).words_to_avoid : [],
          };
        }

        if (!writingStyle) {
          warnings.push({ severity: 'warn', message: 'No writing style found — email uses default tone' });
        }

        sendEvent('step', {
          id: 'writing_style',
          status: writingStyle ? 'complete' : 'skipped',
          label: writingStyle
            ? `Style loaded: ${(writingStyle as any).name}`
            : 'No writing style available',
        });

        // ----------------------------------------------------------------
        // Step 7: Load user and org context for sender info
        // ----------------------------------------------------------------
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', userId)
          .maybeSingle();

        const { data: org } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', meeting.org_id as string)
          .maybeSingle();

        // ----------------------------------------------------------------
        // Step 8: Compose email
        // ----------------------------------------------------------------
        sendEvent('step', {
          id: 'compose',
          status: 'running',
          label: 'Composing follow-up email',
        });

        const composeInput = {
          meeting: {
            id: meeting_id,
            title: (meeting.title as string | null) ?? 'Meeting',
            transcript: (meeting.transcript_text as string | null)?.substring(0, 3000),
          },
          analysis,
          recipient: {
            name: primaryAttendee.name ?? primaryAttendee.email!,
            email: primaryAttendee.email!,
            companyName,
          },
          deal: null,
          writingStyle,
          senderFirstName: (userProfile?.first_name as string | null) ?? 'Team',
          senderLastName: (userProfile?.last_name as string | null) ?? undefined,
          orgName: (org?.name as string | null) ?? undefined,
          regenerateGuidance: regenerate_guidance ?? undefined,
        };

        let email: { to: string; subject: string; body: string; wordCount: number };

        if (followUpContext?.hasHistory) {
          email = await composeReturnMeetingFollowUp(composeInput, followUpContext as Parameters<typeof composeReturnMeetingFollowUp>[1]);
        } else {
          email = await composeFirstMeetingFollowUp(composeInput);
        }

        sendEvent('step', {
          id: 'compose',
          status: 'complete',
          label: `${email.wordCount} words`,
          detail: `${email.wordCount} words`,
        });

        // ----------------------------------------------------------------
        // Step 9: Comparison variant (optional)
        // ----------------------------------------------------------------
        let emailWithoutHistory: {
          to: string;
          subject: string;
          body: string;
          wordCount: number;
        } | null = null;

        if (include_comparison && followUpContext?.hasHistory) {
          sendEvent('step', {
            id: 'compose_comparison',
            status: 'running',
            label: 'Composing comparison (without history)',
          });

          emailWithoutHistory = await composeFirstMeetingFollowUp(composeInput);

          sendEvent('step', {
            id: 'compose_comparison',
            status: 'complete',
            label: `${emailWithoutHistory.wordCount} words (without history)`,
          });
        }

        // ----------------------------------------------------------------
        // Step 10: Slack delivery (optional)
        // ----------------------------------------------------------------
        let slackSent = false;
        if (delivery === 'slack') {
          sendEvent('step', { id: 'slack_delivery', status: 'running', label: 'Sending to Slack for approval' });

          // Get bot token from org settings
          const { data: slackOrg } = await supabase
            .from('slack_org_settings')
            .select('bot_access_token')
            .eq('org_id', meeting.org_id as string)
            .eq('is_connected', true)
            .maybeSingle();

          // Get Slack user ID from mappings
          const { data: slackMapping } = await supabase
            .from('slack_user_mappings')
            .select('slack_user_id')
            .eq('sixty_user_id', userId)
            .maybeSingle();

          if (slackOrg?.bot_access_token && slackMapping?.slack_user_id) {
            const truncatedBody = email.body.length > 2500
              ? email.body.slice(0, 2497) + '...'
              : email.body;

            // FUV3-004: Version-aware header for regenerations
            const currentVersion = version ?? 1;
            const headerText = currentVersion > 1
              ? `Follow-Up Email Ready for Review (v${currentVersion})`
              : 'Follow-Up Email Ready for Review';

            // FUV3-004: Button value for quick-adjust buttons
            const nextVersion = currentVersion + 1;
            const adjustButtonValue = JSON.stringify({ meeting_id, version: nextVersion });

            const blocks = [
              {
                type: 'header',
                text: { type: 'plain_text', text: headerText, emoji: true },
              },
              { type: 'divider' },
              {
                type: 'section',
                fields: [
                  { type: 'mrkdwn', text: `*To:*\n${email.to}` },
                  { type: 'mrkdwn', text: `*Subject:*\n${email.subject}` },
                ],
              },
              { type: 'divider' },
              {
                type: 'section',
                text: { type: 'mrkdwn', text: truncatedBody },
              },
              { type: 'divider' },
              {
                type: 'context',
                elements: [{ type: 'mrkdwn', text: 'After approving, you\'ll get a link to open the draft directly in Gmail.' }],
              },
              {
                type: 'actions',
                elements: [
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: 'Approve & Create Draft', emoji: true },
                    style: 'primary',
                    action_id: 'followup_approve',
                    value: JSON.stringify({ meeting_id, to: email.to, subject: email.subject, body: email.body.slice(0, 1800) }),
                  },
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: 'Edit', emoji: true },
                    action_id: 'followup_edit',
                    value: meeting_id,
                  },
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: 'Dismiss', emoji: true },
                    action_id: 'followup_dismiss',
                    value: meeting_id,
                  },
                ],
              },
              {
                type: 'actions',
                elements: [
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: 'Shorter', emoji: true },
                    action_id: 'followup_adjust_shorter',
                    value: adjustButtonValue,
                  },
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: 'More Formal', emoji: true },
                    action_id: 'followup_adjust_formal',
                    value: adjustButtonValue,
                  },
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: 'More Casual', emoji: true },
                    action_id: 'followup_adjust_casual',
                    value: adjustButtonValue,
                  },
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: 'Add Next Steps', emoji: true },
                    action_id: 'followup_adjust_nextsteps',
                    value: adjustButtonValue,
                  },
                ],
              },
            ];

            const slackResult = await sendSlackDM({
              botToken: slackOrg.bot_access_token as string,
              slackUserId: slackMapping.slack_user_id as string,
              blocks,
              text: `Follow-up email ready for ${email.to}: ${email.subject}`,
              ...(contactPhotoUrl && { icon_url: contactPhotoUrl }),
              ...(primaryAttendee?.name && { username: `60 — ${primaryAttendee.name}` }),
            });

            slackSent = slackResult.success;
            sendEvent('step', {
              id: 'slack_delivery',
              status: slackSent ? 'complete' : 'failed',
              label: slackSent ? 'Sent to Slack DM' : `Slack delivery failed: ${slackResult.error || 'Unknown'}`,
            });
          } else {
            sendEvent('step', {
              id: 'slack_delivery',
              status: 'failed',
              label: !slackOrg?.bot_access_token
                ? 'Slack not connected for this org'
                : 'No Slack user mapping found',
            });
          }
        }

        // ----------------------------------------------------------------
        // Final result event
        // ----------------------------------------------------------------
        const sectionsReturned = followUpContext
          ? Object.keys(followUpContext.sections).length
          : 0;

        // Build RAG summary with actual findings (not just counts)
        const ragSummary: Record<string, string[]> = {};
        if (followUpContext?.hasHistory) {
          for (const [sectionId, sectionResult] of Object.entries(followUpContext.sections)) {
            const chunks = (sectionResult as any)?.chunks;
            if (Array.isArray(chunks) && chunks.length > 0) {
              // Take first 2 chunks, truncate to 120 chars each
              ragSummary[sectionId] = chunks.slice(0, 2).map(
                (c: any) => {
                  const text = typeof c.text === 'string' ? c.text.trim() : String(c);
                  return text.length > 120 ? text.slice(0, 117) + '...' : text;
                }
              );
            }
          }
        }

        const result = {
          isRegeneration: !!regenerate_guidance,
          slackSent: delivery === 'slack' ? slackSent : undefined,
          cachedRagContext: followUpContext ?? undefined,
          email: {
            to: email.to,
            subject: email.subject,
            body: email.body,
            bodyWithoutHistory: emailWithoutHistory?.body ?? null,
            subjectWithoutHistory: emailWithoutHistory?.subject ?? null,
            contextUsed: {
              transcript: !!(meeting.transcript_text as string | null),
              priorMeetings: meetingHistory.priorMeetingCount,
              commitmentsFound:
                (followUpContext?.sections?.['prior_commitments']?.chunks?.length as number) ?? 0,
              concernsFound:
                (followUpContext?.sections?.['prospect_concerns']?.chunks?.length as number) ?? 0,
              commercialSignals: !!followUpContext?.sections?.['commercial_history'],
              stakeholderChanges: !!followUpContext?.sections?.['stakeholder_context'],
              writingStyle: !!writingStyle,
              ragSummary,
            },
            metadata: {
              meetingNumber: meetingHistory.priorMeetingCount + 1,
              ragQueriesRun: meetingHistory.isFirstMeeting ? 0 : 6,
              ragQueriesReturned: sectionsReturned,
              wordCount: email.wordCount,
              creditsConsumed: followUpContext?.queryCredits ?? 0,
              modelUsed: 'claude-sonnet-4-20250514',
              threadDetected: false, // FUV3-005: updated to true when draft created as reply-in-thread
            },
          },
          warnings: warnings.length > 0 ? warnings : undefined,
        };

        sendEvent('result', result);
        controller.close();
      } catch (err) {
        console.error(
          '[generate-follow-up] stream error:',
          err instanceof Error ? err.message : String(err),
        );
        try {
          const encoder2 = new TextEncoder();
          controller.enqueue(
            encoder2.encode(
              `event: error\ndata: ${JSON.stringify({
                message: err instanceof Error ? err.message : 'Generation failed',
              })}\n\n`,
            ),
          );
        } catch (_) {
          // controller may already be closed
        }
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
}
