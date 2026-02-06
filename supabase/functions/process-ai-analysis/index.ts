/**
 * Process AI Analysis
 *
 * Generates AI summary, action items, and coaching insights from transcript.
 * This is a lightweight function that runs after transcription completes.
 *
 * Input: { recording_id, bot_id? }
 * Prerequisites: Recording must have transcript_text populated
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { legacyCorsHeaders as corsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { analyzeTranscriptWithClaude, TranscriptAnalysis } from '../fathom-sync/aiAnalysis.ts';
import { isInternalEmail } from '../_shared/meetingbaas.ts';

interface ProcessAIAnalysisRequest {
  recording_id: string;
  bot_id?: string;
}

interface SpeakerInfo {
  speaker_id: number;
  email?: string;
  name?: string;
  is_internal: boolean;
  identification_method: 'email_match' | 'ai_inference' | 'manual' | 'unknown';
  confidence?: number;
  talk_time_seconds?: number;
  talk_time_percent?: number;
}

interface AttendeeInfo {
  email: string;
  name?: string;
  is_organizer?: boolean;
}

/**
 * Identify speakers from transcript utterances and attendee list
 */
function identifySpeakers(
  utterances: Array<{ speaker: number; start: number; end: number; text: string }>,
  attendees: AttendeeInfo[],
  internalDomain: string | null
): SpeakerInfo[] {
  const speakerIds = [...new Set(utterances.map(u => u.speaker))];

  // Calculate talk time per speaker
  const talkTimeBySpaker: Record<number, number> = {};
  for (const u of utterances) {
    talkTimeBySpaker[u.speaker] = (talkTimeBySpaker[u.speaker] || 0) + (u.end - u.start);
  }
  const totalTalkTime = Object.values(talkTimeBySpaker).reduce((a, b) => a + b, 0);

  // Match speakers to attendees (naive approach - by position)
  const speakers: SpeakerInfo[] = speakerIds.map((speakerId, index) => {
    const talkTime = talkTimeBySpaker[speakerId] || 0;
    const talkPercent = totalTalkTime > 0 ? (talkTime / totalTalkTime) * 100 : 0;

    const attendee = attendees[index];
    if (attendee) {
      const isInternal = internalDomain
        ? isInternalEmail(attendee.email, internalDomain)
        : false;

      return {
        speaker_id: speakerId,
        email: attendee.email,
        name: attendee.name,
        is_internal: isInternal,
        identification_method: 'email_match' as const,
        confidence: 0.5, // Low confidence for position-based matching
        talk_time_seconds: Math.round(talkTime),
        talk_time_percent: Math.round(talkPercent * 10) / 10,
      };
    }

    return {
      speaker_id: speakerId,
      is_internal: false,
      identification_method: 'unknown' as const,
      confidence: 0,
      talk_time_seconds: Math.round(talkTime),
      talk_time_percent: Math.round(talkPercent * 10) / 10,
    };
  });

  return speakers;
}

async function processAIAnalysis(
  supabase: SupabaseClient,
  recordingId: string,
  botId?: string
): Promise<{ success: boolean; error?: string }> {
  console.log('[ProcessAIAnalysis] Starting for recording:', recordingId);

  // Get recording with transcript
  const { data: recording, error: fetchError } = await supabase
    .from('recordings')
    .select(`
      *,
      organizations:org_id (
        id,
        name,
        company_domain
      )
    `)
    .eq('id', recordingId)
    .single();

  if (fetchError || !recording) {
    console.error('[ProcessAIAnalysis] Recording not found:', fetchError);
    return { success: false, error: 'Recording not found' };
  }

  if (!recording.transcript_text) {
    return { success: false, error: 'No transcript available for analysis' };
  }

  try {
    const internalDomain = recording.organizations?.company_domain || null;

    // Get attendees from calendar event if available
    let attendees: AttendeeInfo[] = [];
    if (recording.calendar_event_id) {
      const { data: calendarEvent } = await supabase
        .from('calendar_events')
        .select('attendees')
        .eq('id', recording.calendar_event_id)
        .maybeSingle();

      if (calendarEvent?.attendees) {
        attendees = calendarEvent.attendees;
      }
    }

    // Identify speakers from transcript
    const utterances = recording.transcript_json?.utterances || [];
    const speakers = identifySpeakers(utterances, attendees, internalDomain);

    console.log('[ProcessAIAnalysis] Identified speakers:', speakers.length);

    // Run enhanced AI analysis (sentiment, talk time, coaching)
    console.log('[ProcessAIAnalysis] Running AI analysis...');
    const enhancedAnalysis: TranscriptAnalysis = await analyzeTranscriptWithClaude(
      recording.transcript_text,
      {
        id: recordingId,
        title: recording.meeting_title || 'Meeting',
        meeting_start: recording.meeting_start_time || new Date().toISOString(),
        owner_email: null,
      },
      supabase,
      recording.user_id,
      recording.org_id
    );

    console.log('[ProcessAIAnalysis] Analysis complete:', {
      sentiment: enhancedAnalysis.sentiment.score,
      talkTimeRep: enhancedAnalysis.talkTime.repPct,
      coachRating: enhancedAnalysis.coaching.rating,
      actionItems: enhancedAnalysis.actionItems.length,
    });

    // Determine talk time judgement
    const getTalkTimeJudgement = (repPct: number): 'good' | 'high' | 'low' | null => {
      if (repPct >= 40 && repPct <= 60) return 'good';
      if (repPct > 60) return 'high';
      if (repPct < 40) return 'low';
      return null;
    };

    // Update recording with analysis results
    // Core fields that always exist
    const coreUpdate: Record<string, unknown> = {
      status: 'ready',
      summary: enhancedAnalysis.summary,
      speakers: speakers,
      speaker_identification_method: speakers[0]?.identification_method || 'unknown',
      updated_at: new Date().toISOString(),
    };

    // Extended analysis fields (may not exist on all environments)
    const extendedFields: Record<string, unknown> = {
      sentiment_score: enhancedAnalysis.sentiment.score,
      coach_rating: enhancedAnalysis.coaching.rating,
      coach_summary: enhancedAnalysis.coaching.summary,
      talk_time_rep_pct: enhancedAnalysis.talkTime.repPct,
      talk_time_customer_pct: enhancedAnalysis.talkTime.customerPct,
      talk_time_judgement: getTalkTimeJudgement(enhancedAnalysis.talkTime.repPct),
    };

    // Try full update first, fall back to core-only if columns don't exist
    const { error: fullUpdateError } = await supabase
      .from('recordings')
      .update({ ...coreUpdate, ...extendedFields })
      .eq('id', recordingId);

    if (fullUpdateError?.code === 'PGRST204') {
      console.warn('[ProcessAIAnalysis] Extended columns not available, updating core fields only');
      await supabase
        .from('recordings')
        .update(coreUpdate)
        .eq('id', recordingId);
    } else if (fullUpdateError) {
      console.error('[ProcessAIAnalysis] Recording update error:', fullUpdateError.message);
    }

    // Sync to meetings table
    if (botId) {
      const coreMeetingUpdate: Record<string, unknown> = {
        summary: enhancedAnalysis.summary,
        speakers: speakers,
        updated_at: new Date().toISOString(),
      };

      const extendedMeetingFields: Record<string, unknown> = {
        sentiment_score: enhancedAnalysis.sentiment.score,
        coach_rating: enhancedAnalysis.coaching.rating,
        coach_summary: enhancedAnalysis.coaching.summary,
        talk_time_rep_pct: enhancedAnalysis.talkTime.repPct,
        talk_time_customer_pct: enhancedAnalysis.talkTime.customerPct,
        talk_time_judgement: getTalkTimeJudgement(enhancedAnalysis.talkTime.repPct),
        processing_status: 'ready',
      };

      // Try full update first, fall back to core-only
      const { error: meetingError } = await supabase
        .from('meetings')
        .update({ ...coreMeetingUpdate, ...extendedMeetingFields })
        .eq('bot_id', botId)
        .eq('source_type', '60_notetaker');

      if (meetingError?.code === 'PGRST204') {
        console.warn('[ProcessAIAnalysis] Extended meeting columns not available, updating core fields only');
        await supabase
          .from('meetings')
          .update(coreMeetingUpdate)
          .eq('bot_id', botId)
          .eq('source_type', '60_notetaker');
      } else if (meetingError) {
        console.warn('[ProcessAIAnalysis] Failed to sync to meetings table:', meetingError.message);
      }

      // Insert action items
      if (enhancedAnalysis.actionItems.length > 0) {
        const { data: meeting } = await supabase
          .from('meetings')
          .select('id')
          .eq('bot_id', botId)
          .eq('source_type', '60_notetaker')
          .maybeSingle();

        if (meeting) {
          const actionItemsToInsert = enhancedAnalysis.actionItems.map(item => ({
            meeting_id: meeting.id,
            title: item.title,
            assignee_name: item.assignedTo,
            deadline_at: item.deadline ? new Date(item.deadline).toISOString() : null,
            priority: item.priority,
            completed: false,
            ai_confidence_score: item.confidence,
            ai_generated: true,
            created_at: new Date().toISOString(),
          }));

          await supabase.from('meeting_action_items').insert(actionItemsToInsert);
          console.log(`[ProcessAIAnalysis] Inserted ${actionItemsToInsert.length} action items`);
        }
      }
    }

    // Send notification
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (supabaseUrl && serviceRoleKey) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-recording-notification`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recording_id: recordingId,
            notification_type: 'recording_ready',
          }),
        });
        console.log('[ProcessAIAnalysis] Notification sent');
      } catch (err) {
        console.warn('[ProcessAIAnalysis] Notification error (non-blocking):', err);
      }
    }

    console.log('[ProcessAIAnalysis] Complete for recording:', recordingId);
    return { success: true };

  } catch (error) {
    console.error('[ProcessAIAnalysis] Error:', error);

    await supabase
      .from('recordings')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'AI analysis failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', recordingId);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'AI analysis failed',
    };
  }
}

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const body: ProcessAIAnalysisRequest = await req.json();

    if (!body.recording_id) {
      return new Response(
        JSON.stringify({ error: 'recording_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await processAIAnalysis(supabase, body.recording_id, body.bot_id);

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[ProcessAIAnalysis] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
