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

// ============================================================================
// Constants
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

    // Get last 10 external meetings with a transcript
    const { data: meetings } = await supabase
      .from('meetings')
      .select('id, title, created_at, duration_minutes, company_id, transcript_text')
      .eq('owner_user_id', authContext.userId)
      .eq('org_id', membership.org_id)
      .not('transcript_text', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    // Enrich each meeting with attendees, company name, and meeting number
    const enrichedMeetings = [];

    for (const mtg of (meetings || [])) {
      // Get external attendees only
      const { data: attendees } = await supabase
        .from('meeting_attendees')
        .select('name, email, is_external')
        .eq('meeting_id', mtg.id)
        .eq('is_external', true);

      // Skip internal-only meetings
      if (!attendees || attendees.length === 0) continue;

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
  const { meeting_id, include_comparison, delivery } = body as {
    meeting_id?: string;
    include_comparison?: boolean;
    delivery?: string;
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
    if (!authContext.userId) {
      return errorResponse('Unauthorized', req, 401);
    }
    userId = authContext.userId;
  } catch (_err) {
    return errorResponse('Unauthorized', req, 401);
  }

  // Build the SSE stream
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        // ----------------------------------------------------------------
        // Step 1: Load meeting
        // ----------------------------------------------------------------
        sendEvent('step', { id: 'load_meeting', status: 'running', label: 'Loading meeting data' });

        const { data: meeting } = await supabase
          .from('meetings')
          .select('id, title, created_at, duration_minutes, company_id, org_id, owner_user_id, transcript_text, summary')
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
          .select('description, assignee_name, due_date, status')
          .eq('meeting_id', meeting_id);

        const analysis = {
          summary: (meeting.summary as string | null) ?? 'No summary available',
          actionItems: (actionItems ?? []).map((ai: {
            description: string | null;
            assignee_name: string | null;
          }) => ({
            task: ai.description ?? '',
            suggestedOwner: ai.assignee_name ?? undefined,
          })),
        };

        sendEvent('step', {
          id: 'load_analysis',
          status: 'complete',
          label: `${analysis.actionItems.length} action items found`,
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

        const { data: attendees } = await supabase
          .from('meeting_attendees')
          .select('name, email, is_external')
          .eq('meeting_id', meeting_id)
          .eq('is_external', true);

        const primaryAttendee = attendees?.[0] as
          | { name: string | null; email: string | null }
          | undefined;

        if (!primaryAttendee?.email) {
          sendEvent('error', { message: 'No external attendees found' });
          controller.close();
          return;
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
        // Step 5: RAG queries (return meetings only)
        // ----------------------------------------------------------------
        let followUpContext: {
          hasHistory: boolean;
          meetingNumber: number;
          sections: Record<string, { chunks: unknown[] }>;
          queryCredits: number;
        } | null = null;

        if (!meetingHistory.isFirstMeeting) {
          sendEvent('step', {
            id: 'rag_queries',
            status: 'running',
            label: `Querying history across ${meetingHistory.priorMeetingCount} meetings`,
          });

          const ragClient = createRAGClient({
            orgId: meeting.org_id as string,
            supabase,
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

        const { data: styleData } = await supabase
          .from('writing_styles')
          .select('metadata')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const writingStyle = (styleData?.metadata as Record<string, unknown> | null) ?? null;

        sendEvent('step', {
          id: 'writing_style',
          status: writingStyle ? 'complete' : 'skipped',
          label: writingStyle ? 'Writing style loaded' : 'No writing style available',
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
        // Final result event
        // ----------------------------------------------------------------
        const sectionsReturned = followUpContext
          ? Object.keys(followUpContext.sections).length
          : 0;

        const result = {
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
            },
            metadata: {
              meetingNumber: meetingHistory.priorMeetingCount + 1,
              ragQueriesRun: meetingHistory.isFirstMeeting ? 0 : 6,
              ragQueriesReturned: sectionsReturned,
              wordCount: email.wordCount,
              creditsConsumed: followUpContext?.queryCredits ?? 0,
              modelUsed: 'claude-sonnet-4-20250514',
            },
          },
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
