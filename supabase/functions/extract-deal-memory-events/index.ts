/**
 * extract-deal-memory-events — MW-001
 *
 * Parses meeting transcripts into structured deal_memory_events using the
 * shared memory writer pipeline (RAG + Claude structuring).
 *
 * POST /extract-deal-memory-events
 * {
 *   meeting_id: string,
 *   deal_id: string,
 *   org_id: string
 * }
 *
 * Matches fleet route: sequence_key='deal_memory_extraction',
 *                      skill='extract-deal-memory-events'
 *
 * Deploy with --no-verify-jwt (staging ES256 JWT issue).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { extractEventsFromMeeting } from '../_shared/memory/writer.ts';
import { shouldRegenerateSnapshot, generateSnapshot } from '../_shared/memory/snapshot.ts';
import { RAGClient } from '../_shared/memory/ragClient.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    const body = await req.json().catch(() => ({}));
    const { meeting_id, deal_id, org_id } = body as {
      meeting_id?: string;
      deal_id?: string;
      org_id?: string;
    };

    if (!meeting_id || !deal_id || !org_id) {
      return errorResponse('meeting_id, deal_id, and org_id are required', req, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Load meeting to get date for RAG window
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('id, created_at, transcript_text, summary')
      .eq('id', meeting_id)
      .maybeSingle();

    if (meetingError || !meeting) {
      return errorResponse(
        meetingError?.message ?? `Meeting ${meeting_id} not found`,
        req,
        404,
      );
    }

    if (!meeting.transcript_text && !meeting.summary) {
      return jsonResponse(
        { success: true, events_created: 0, message: 'No transcript or summary — skipped' },
        corsHeaders,
      );
    }

    // Resolve Anthropic API key from org's user_settings
    const { data: apiKeySetting } = await supabase
      .from('user_settings')
      .select('value')
      .eq('org_id', org_id)
      .eq('key', 'anthropic_api_key')
      .maybeSingle();

    const anthropicApiKey =
      (apiKeySetting?.value as string) ?? Deno.env.get('ANTHROPIC_API_KEY') ?? '';

    if (!anthropicApiKey) {
      return errorResponse('No Anthropic API key configured', req, 400);
    }

    // Build RAG client scoped to this org
    const ragClient = new RAGClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, org_id);

    // Extract meeting date for the RAG window
    const meetingDate = meeting.created_at
      ? new Date(meeting.created_at).toISOString().split('T')[0]
      : undefined;

    // Run the extraction pipeline
    const events = await extractEventsFromMeeting({
      meetingId: meeting_id,
      dealId: deal_id,
      orgId: org_id,
      supabase,
      ragClient,
      anthropicApiKey,
      meetingDate,
      extractedBy: 'extract-deal-memory-events',
    });

    console.log(
      `[extract-deal-memory-events] Extracted ${events.length} events for deal ${deal_id} from meeting ${meeting_id}`,
    );

    // Check if we should regenerate the deal snapshot
    let snapshotRegenerated = false;
    const shouldRegen = await shouldRegenerateSnapshot({
      dealId: deal_id,
      orgId: org_id,
      supabase,
    });

    if (shouldRegen) {
      const snapshot = await generateSnapshot({
        dealId: deal_id,
        orgId: org_id,
        supabase,
        ragClient,
        anthropicApiKey,
        generatedBy: 'event_threshold',
      });
      snapshotRegenerated = snapshot !== null;
      console.log(
        `[extract-deal-memory-events] Snapshot regeneration ${snapshotRegenerated ? 'succeeded' : 'skipped/failed'} for deal ${deal_id}`,
      );
    }

    return jsonResponse(
      {
        success: true,
        events_created: events.length,
        event_types: events.map((e) => e.event_type),
        snapshot_regenerated: snapshotRegenerated,
      },
      corsHeaders,
    );
  } catch (err) {
    console.error(
      '[extract-deal-memory-events] Error:',
      err instanceof Error ? err.message : String(err),
    );
    return errorResponse(
      err instanceof Error ? err.message : 'Internal server error',
      req,
      500,
    );
  }
});
