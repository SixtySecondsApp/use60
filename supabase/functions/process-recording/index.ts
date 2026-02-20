/**
 * Process Recording Edge Function
 *
 * Processes a completed recording through the full analysis pipeline:
 * 1. Download recording from MeetingBaaS
 * 2. Transcribe using AssemblyAI (or MeetingBaaS/Gladia fallback)
 * 3. Identify speakers using email matching + AI inference
 * 4. Generate AI summary with highlights and action items
 * 5. Update recording with results
 * 6. Trigger CRM sync and notifications
 *
 * Endpoint: POST /functions/v1/process-recording
 *
 * @see supabase/migrations/20260104100000_meetingbaas_core_tables.sql
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { S3Client, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3';
import { legacyCorsHeaders as corsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { checkCreditBalance } from '../_shared/costTracking.ts';
import {
  createMeetingBaaSClient,
  extractDomain,
  isInternalEmail,
  formatDuration,
} from '../_shared/meetingbaas.ts';
// Import AI analysis function from fathom-sync for sentiment, talk time, and coaching
import { analyzeTranscriptWithClaude, TranscriptAnalysis } from '../fathom-sync/aiAnalysis.ts';
import { syncRecordingToMeeting } from '../_shared/recordingCompleteSync.ts';
import { formatUtterancesToTranscriptText, type SpeakerNameMap } from '../_shared/transcriptFormatter.ts';

// =============================================================================
// Types
// =============================================================================

interface ProcessRecordingRequest {
  recording_id: string;
  bot_id?: string;
  // Optional URLs passed from webhook - use these instead of fetching from MeetingBaaS API
  video_url?: string;
  audio_url?: string;
  // Transcript data passed from transcript.ready webhook - use this instead of calling MeetingBaaS API
  transcript?: {
    text: string;
    utterances: Array<{
      speaker: number;
      start: number;
      end: number;
      text: string;
      confidence?: number;
    }>;
  };
}

interface TranscriptUtterance {
  speaker: number;
  start: number;
  end: number;
  text: string;
  confidence?: number;
}

interface TranscriptData {
  text: string;
  utterances: TranscriptUtterance[];
  speakers?: { id: number; count: number }[];
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

interface RecordingHighlight {
  timestamp: number;
  text: string;
  type: 'key_point' | 'decision' | 'action_item' | 'question' | 'objection';
}

interface ActionItem {
  text: string;
  assignee?: string;
  due_date?: string;
}

interface AIAnalysis {
  summary: string;
  highlights: RecordingHighlight[];
  action_items: ActionItem[];
  speakers: SpeakerInfo[];
}

interface AttendeeInfo {
  email: string;
  name?: string;
  is_organizer?: boolean;
}

// =============================================================================
// AssemblyAI Transcription Service
// =============================================================================

async function transcribeWithAssemblyAI(audioUrl: string): Promise<TranscriptData> {
  const apiKey = Deno.env.get('ASSEMBLYAI_API_KEY');
  if (!apiKey) {
    throw new Error('ASSEMBLYAI_API_KEY not configured');
  }

  console.log('[ProcessRecording] Starting AssemblyAI transcription...');

  // Step 1: Submit transcription request
  const submitResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      speech_models: ['universal-3-pro', 'universal-2'],
      speaker_labels: true,
    }),
  });

  if (!submitResponse.ok) {
    const error = await submitResponse.text();
    throw new Error(`AssemblyAI submit error: ${error}`);
  }

  const { id: transcriptId } = await submitResponse.json();
  console.log(`[ProcessRecording] AssemblyAI transcript ID: ${transcriptId}`);

  // Step 2: Poll for results
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes with 5s intervals

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
      headers: { 'Authorization': apiKey },
    });

    if (!pollResponse.ok) {
      attempts++;
      continue;
    }

    const result = await pollResponse.json();

    if (result.status === 'completed') {
      console.log('[ProcessRecording] AssemblyAI transcription complete');

      // Map AssemblyAI utterances to our format
      // AssemblyAI uses speaker labels like "A", "B", "C"... — map to numeric IDs
      const utterances: TranscriptUtterance[] = (result.utterances || []).map((u: any) => ({
        speaker: u.speaker ? u.speaker.charCodeAt(0) - 'A'.charCodeAt(0) : 0,
        start: (u.start || 0) / 1000, // AssemblyAI uses ms, we use seconds
        end: (u.end || 0) / 1000,
        text: u.text || '',
        confidence: u.confidence,
      }));

      return {
        text: result.text || '',
        utterances,
      };
    } else if (result.status === 'error') {
      throw new Error(`AssemblyAI transcription failed: ${result.error}`);
    }

    attempts++;
  }

  throw new Error('AssemblyAI transcription timed out');
}

// =============================================================================
// Speaker Identification
// =============================================================================

function identifySpeakers(
  utterances: TranscriptUtterance[],
  attendees: AttendeeInfo[],
  internalDomain: string | null
): SpeakerInfo[] {
  // Get unique speaker IDs
  const speakerIds = [...new Set(utterances.map((u) => u.speaker))];

  // Calculate talk time per speaker
  const talkTimeBySpaker: Record<number, number> = {};
  for (const u of utterances) {
    talkTimeBySpaker[u.speaker] = (talkTimeBySpaker[u.speaker] || 0) + (u.end - u.start);
  }
  const totalTalkTime = Object.values(talkTimeBySpaker).reduce((a, b) => a + b, 0);

  // Try to match speakers to attendees based on position/count
  // This is a heuristic - in practice, we may need AI inference
  const speakers: SpeakerInfo[] = speakerIds.map((speakerId, index) => {
    const talkTime = talkTimeBySpaker[speakerId] || 0;
    const talkPercent = totalTalkTime > 0 ? (talkTime / totalTalkTime) * 100 : 0;

    // Try to match to attendee by index (naive approach)
    const attendee = attendees[index];
    if (attendee) {
      const isInternal = internalDomain && attendee.email
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

// =============================================================================
// AI Analysis
// =============================================================================

async function generateAIAnalysis(
  transcript: TranscriptData,
  speakers: SpeakerInfo[],
  meetingTitle: string,
  attendees: AttendeeInfo[]
): Promise<AIAnalysis> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    console.warn('[ProcessRecording] OPENAI_API_KEY not configured, using basic analysis');
    return {
      summary: generateBasicSummary(transcript, meetingTitle),
      highlights: extractBasicHighlights(transcript),
      action_items: [],
      speakers,
    };
  }

  console.log('[ProcessRecording] Generating AI analysis...');

  // Format transcript for AI
  const formattedTranscript = transcript.utterances
    .slice(0, 500) // Limit to first 500 utterances for context
    .map((u) => {
      const speaker = speakers.find((s) => s.speaker_id === u.speaker);
      const speakerName = speaker?.name || `Speaker ${u.speaker + 1}`;
      const timestamp = formatTimestamp(u.start);
      return `[${timestamp}] ${speakerName}: ${u.text}`;
    })
    .join('\n');

  const attendeeList = attendees
    .map((a) => `${a.name || a.email} (${a.is_organizer ? 'Organizer' : 'Attendee'})`)
    .join(', ');

  const prompt = `Analyze this sales meeting transcript and provide a structured summary.

Meeting: ${meetingTitle}
Attendees: ${attendeeList || 'Unknown'}

Transcript:
${formattedTranscript}

Provide a JSON response with:
1. "summary": A 2-3 paragraph overview of the meeting (what was discussed, outcomes, next steps)
2. "highlights": Array of key moments with timestamps, each with:
   - "timestamp": seconds from start
   - "text": brief description
   - "type": one of "key_point", "decision", "action_item", "question", "objection"
3. "action_items": Array of action items with:
   - "text": the action item
   - "assignee": who should do it (if mentioned)

Limit highlights to 10 most important moments.
Return only valid JSON, no markdown.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a sales meeting analyst. Analyze transcripts and extract key information. Always respond with valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      console.log('[ProcessRecording] AI analysis complete');
      return {
        summary: analysis.summary || '',
        highlights: (analysis.highlights || []).slice(0, 10),
        action_items: analysis.action_items || [],
        speakers,
      };
    }
  } catch (error) {
    console.error('[ProcessRecording] AI analysis error:', error);
  }

  // Fallback to basic analysis
  return {
    summary: generateBasicSummary(transcript, meetingTitle),
    highlights: extractBasicHighlights(transcript),
    action_items: [],
    speakers,
  };
}

function generateBasicSummary(transcript: TranscriptData, meetingTitle: string): string {
  const wordCount = transcript.text.split(/\s+/).length;
  const durationMinutes = transcript.utterances.length > 0
    ? Math.round((transcript.utterances[transcript.utterances.length - 1].end -
        transcript.utterances[0].start) / 60)
    : 0;

  return `This meeting "${meetingTitle}" lasted approximately ${durationMinutes} minutes and covered approximately ${wordCount} words of discussion. The transcript is available for full review.`;
}

function extractBasicHighlights(transcript: TranscriptData): RecordingHighlight[] {
  const highlights: RecordingHighlight[] = [];

  // Look for question marks
  for (const u of transcript.utterances) {
    if (u.text.includes('?') && u.text.length > 20) {
      highlights.push({
        timestamp: Math.round(u.start),
        text: u.text.substring(0, 100),
        type: 'question',
      });
      if (highlights.length >= 5) break;
    }
  }

  return highlights;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// =============================================================================
// HITL Flagging
// =============================================================================

async function checkAndFlagForHITL(
  supabase: SupabaseClient,
  recordingId: string,
  speakers: SpeakerInfo[],
  attendees: AttendeeInfo[]
): Promise<boolean> {
  // Check if speaker identification confidence is low
  const lowConfidenceSpeakers = speakers.filter(
    (s) => s.identification_method === 'unknown' || (s.confidence && s.confidence < 0.7)
  );

  if (lowConfidenceSpeakers.length > 0 && attendees.length > 0) {
    console.log('[ProcessRecording] Flagging for HITL: speaker confirmation needed');

    await supabase
      .from('recordings')
      .update({
        hitl_required: true,
        hitl_type: 'speaker_confirmation',
        hitl_data: {
          speakers: lowConfidenceSpeakers,
          possible_attendees: attendees,
          reason: 'Low confidence speaker identification',
        },
      })
      .eq('id', recordingId);

    return true;
  }

  return false;
}

// =============================================================================
// Main Processing Pipeline
// =============================================================================

async function processRecording(
  supabase: SupabaseClient,
  recordingId: string,
  botId?: string,
  videoUrl?: string,
  audioUrl?: string,
  providedTranscript?: ProcessRecordingRequest['transcript']
): Promise<{ success: boolean; error?: string }> {
  console.log('[ProcessRecording] Starting pipeline for recording:', recordingId);

  // Get recording details
  const { data: recording, error: fetchError } = await supabase
    .from('recordings')
    .select(
      `
      *,
      organizations:org_id (
        id,
        name,
        company_domain,
        recording_settings
      )
    `
    )
    .eq('id', recordingId)
    .single();

  if (fetchError || !recording) {
    console.error('[ProcessRecording] Recording not found:', fetchError);
    return { success: false, error: 'Recording not found' };
  }

  const effectiveBotId = botId || recording.bot_id;
  if (!effectiveBotId) {
    return { success: false, error: 'No bot ID associated with recording' };
  }

  try {
    // Update status to processing
    const { error: statusError } = await supabase
      .from('recordings')
      .update({ status: 'processing' })
      .eq('id', recordingId);

    if (statusError) {
      console.error('[ProcessRecording] Failed to update status to processing:', statusError.message);
    }

    const internalDomain = recording.organizations?.company_domain || null;

    // Step 1: Resolve recording URL
    // Priority: 1) Already in S3, 2) URLs from webhook/request, 3) MeetingBaaS bot status API
    console.log('[ProcessRecording] Step 1: Resolving recording URL...');
    const meetingBaaSClient = createMeetingBaaSClient();

    let recordingMediaUrl: string | null = null;

    // Priority 1: Recording already uploaded to S3 (e.g., by webhook handler)
    if (recording.recording_s3_key) {
      console.log('[ProcessRecording] Step 1: Recording already in S3:', recording.recording_s3_key);
      // Generate a fresh signed GET URL so external services (AssemblyAI) can download it
      try {
        const s3Client = new S3Client({
          region: Deno.env.get('AWS_REGION') || 'eu-west-2',
          credentials: {
            accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
            secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
          },
        });
        const getCmd = new GetObjectCommand({
          Bucket: Deno.env.get('AWS_S3_BUCKET') || 'use60-application',
          Key: recording.recording_s3_key,
        });
        recordingMediaUrl = await getSignedUrl(s3Client, getCmd, { expiresIn: 60 * 60 * 2 }); // 2 hours
        console.log('[ProcessRecording] Step 1: Generated fresh signed GET URL');
      } catch (s3Err) {
        console.warn('[ProcessRecording] Step 1: Failed to generate signed URL, falling back to stored URL:', s3Err);
        recordingMediaUrl = recording.recording_s3_url || null;
      }
    }

    // Priority 2: URLs passed directly (from webhook bot.completed payload or manual trigger)
    if (!recordingMediaUrl) {
      const passedUrl = videoUrl || audioUrl;
      if (passedUrl) {
        console.log('[ProcessRecording] Step 1: Using URL from request:', passedUrl.substring(0, 80) + '...');
        recordingMediaUrl = passedUrl;
      }
    }

    // Priority 3: Try MeetingBaaS recording endpoint (GET /v2/bots/{botId}/recording)
    if (!recordingMediaUrl) {
      console.log('[ProcessRecording] Step 1: Trying MeetingBaaS recording endpoint...');
      try {
        const { data: recData, error: recError } = await meetingBaaSClient.getRecording(effectiveBotId);
        if (recError) {
          console.warn('[ProcessRecording] Step 1: Recording endpoint error:', recError.message);
        } else if (recData?.url) {
          recordingMediaUrl = recData.url;
          console.log('[ProcessRecording] Step 1: Got URL from recording endpoint');
        }
      } catch (err) {
        console.warn('[ProcessRecording] Step 1: Recording endpoint failed:', err);
      }
    }

    // Priority 4: Try MeetingBaaS bot status API (GET /v2/bots/{botId}) as last resort
    if (!recordingMediaUrl) {
      console.log('[ProcessRecording] Step 1: Trying MeetingBaaS bot status API...');
      try {
        const { data: botData } = await meetingBaaSClient.getBotStatus(effectiveBotId);
        const botDataAny = botData as Record<string, unknown> | undefined;
        console.log('[ProcessRecording] Step 1: Bot status keys:', Object.keys(botDataAny || {}));
        const botVideoUrl = (botDataAny?.video_url || botDataAny?.video || botDataAny?.mp4) as string | undefined;
        const botAudioUrl = (botDataAny?.audio_url || botDataAny?.audio) as string | undefined;
        const botRecordingUrl = botDataAny?.recording_url as string | undefined;
        const output = botDataAny?.output as Record<string, unknown> | undefined;
        const outputVideoUrl = (output?.video_url || output?.video || output?.mp4) as string | undefined;
        recordingMediaUrl = botVideoUrl || botAudioUrl || botRecordingUrl || outputVideoUrl || null;
        if (recordingMediaUrl) {
          console.log('[ProcessRecording] Step 1: Got URL from bot status API');
        } else {
          console.warn('[ProcessRecording] Step 1: No recording URL in bot status. Keys:', Object.keys(botDataAny || {}));
        }
      } catch (err) {
        console.warn('[ProcessRecording] Step 1: Bot status API failed:', err);
      }
    }

    if (!recordingMediaUrl) {
      throw new Error(
        'No recording URL available. The recording URL is delivered via webhook (bot.completed event). ' +
        'Ensure MeetingBaaS webhooks are correctly configured and sending events to the meetingbaas-webhook endpoint. ' +
        'Alternatively, pass video_url or audio_url in the request body.'
      );
    }

    const recordingData = { url: recordingMediaUrl, expires_at: '' };

    // Step 1.5: Resolve S3 storage info
    // NOTE: S3 upload is NOT done here — Edge Functions cannot handle large file transfers
    // (memory + CPU time limits). The video URL from MeetingBaaS is used directly for
    // transcription. S3 upload is handled separately by upload-recording-to-s3 function.
    const uploadResult = {
      success: true,
      storagePath: recording.recording_s3_key || null,
      storageUrl: recording.recording_s3_url || recordingMediaUrl,
    };
    if (recording.recording_s3_key) {
      console.log('[ProcessRecording] Step 1.5: Recording already in S3:', recording.recording_s3_key);
    } else {
      console.log('[ProcessRecording] Step 1.5: No S3 upload — using source URL directly for transcription');
    }

    // Step 2: Get transcript
    // Priority: 1) Already saved in DB (from poll-stuck-bots or webhook), 2) AssemblyAI
    console.log('[ProcessRecording] Step 2: Getting transcript...');
    let transcript: TranscriptData;

    // Priority 1: Check if transcript already exists in DB (pre-fetched by poll-stuck-bots)
    if (recording.transcript_json && recording.transcript_text) {
      const savedTranscript = recording.transcript_json as TranscriptData;
      if (savedTranscript.text && savedTranscript.utterances?.length > 0) {
        console.log(`[ProcessRecording] Step 2: Using existing transcript from DB (${savedTranscript.text.length} chars, ${savedTranscript.utterances.length} utterances)`);
        transcript = savedTranscript;
      } else {
        console.log('[ProcessRecording] Step 2: DB transcript incomplete, using AssemblyAI');
        transcript = await transcribeWithAssemblyAI(recordingData.url);
      }
    } else {
      // Priority 2: Transcribe with AssemblyAI
      console.log('[ProcessRecording] Step 2: No transcript in DB, using AssemblyAI');
      transcript = await transcribeWithAssemblyAI(recordingData.url);
    }

    // Get attendees: Priority 1 = recordings.attendees (stored at deploy time)
    // Priority 2 = calendar_events.attendees (legacy fallback)
    let attendees: AttendeeInfo[] = [];
    if (recording.attendees && Array.isArray(recording.attendees) && recording.attendees.length > 0) {
      attendees = recording.attendees;
      console.log(`[ProcessRecording] Using ${attendees.length} attendees from recording record`);
    } else if (recording.calendar_event_id) {
      const { data: calendarEvent } = await supabase
        .from('calendar_events')
        .select('attendees')
        .eq('id', recording.calendar_event_id)
        .maybeSingle();

      if (calendarEvent?.attendees) {
        attendees = calendarEvent.attendees;
        console.log(`[ProcessRecording] Using ${attendees.length} attendees from calendar event`);
      }
    }

    // Step 3: Identify speakers
    console.log('[ProcessRecording] Step 3: Identifying speakers...');
    let speakers = identifySpeakers(transcript.utterances, attendees, internalDomain);

    // Step 4: Generate AI analysis
    console.log('[ProcessRecording] Step 4: Generating AI analysis...');
    const analysis = await generateAIAnalysis(
      transcript,
      speakers,
      recording.meeting_title || 'Meeting',
      attendees
    );

    // Update speakers with any AI enhancements
    speakers = analysis.speakers;

    // Step 4.25: Format transcript_text with speaker names and timestamps
    // Produces [HH:MM:SS] Speaker Name: text — compatible with Fathom/Fireflies rendering
    const speakerNameMap: SpeakerNameMap = {};
    for (const s of speakers) {
      speakerNameMap[s.speaker_id] = s.name || `Speaker ${s.speaker_id + 1}`;
    }
    const formattedTranscriptText = formatUtterancesToTranscriptText(
      transcript.utterances,
      speakerNameMap
    );
    if (formattedTranscriptText) {
      console.log(`[ProcessRecording] Formatted transcript: ${formattedTranscriptText.length} chars, ${transcript.utterances.length} utterances`);
    }

    // Step 4.5: Run enhanced AI analysis for sentiment, talk time, and coaching
    // Uses the same analysis pipeline as Fathom recordings for consistency
    console.log('[ProcessRecording] Step 4.5: Running enhanced AI analysis...');
    let enhancedAnalysis: TranscriptAnalysis | null = null;

    // Check credit balance before AI analysis
    let creditsAvailable = true;
    if (recording.org_id) {
      try {
        const creditCheck = await checkCreditBalance(supabase, recording.org_id);
        if (!creditCheck.allowed) {
          console.warn('[ProcessRecording] Skipping AI analysis: insufficient credits for org', recording.org_id);
          creditsAvailable = false;
        }
      } catch (e) {
        // fail open: continue with AI analysis if credit check fails
      }
    }

    if (creditsAvailable) {
      try {
        enhancedAnalysis = await analyzeTranscriptWithClaude(
          transcript.text,
          {
            id: recordingId,
            title: recording.meeting_title || 'Meeting',
            meeting_start: recording.meeting_start_time || new Date().toISOString(),
            owner_email: null, // Will be populated from user if needed
          },
          supabase,
          recording.user_id,
          recording.org_id
        );
        console.log('[ProcessRecording] Enhanced AI analysis complete:', {
          sentiment: enhancedAnalysis.sentiment.score,
          talkTimeRep: enhancedAnalysis.talkTime.repPct,
          coachRating: enhancedAnalysis.coaching.rating,
          actionItems: enhancedAnalysis.actionItems.length,
        });
      } catch (aiError) {
        console.warn('[ProcessRecording] Enhanced AI analysis failed (non-fatal):', aiError);
        // Continue with basic analysis only
      }
    }

    // Step 5: Check for HITL needs
    const needsHITL = await checkAndFlagForHITL(supabase, recordingId, speakers, attendees);

    // Step 6: Calculate meeting duration
    const durationSeconds = transcript.utterances.length > 0
      ? Math.round(
          transcript.utterances[transcript.utterances.length - 1].end -
            transcript.utterances[0].start
        )
      : null;

    // Step 7: Update recording with all results
    console.log('[ProcessRecording] Step 7: Saving results...');

    // Determine talk time judgement based on rep percentage
    const getTalkTimeJudgement = (repPct: number): 'good' | 'high' | 'low' | null => {
      if (repPct >= 40 && repPct <= 60) return 'good';
      if (repPct > 60) return 'high';
      if (repPct < 40) return 'low';
      return null;
    };

    const recordingUpdate: Record<string, unknown> = {
      status: 'ready',
      // Use our storage URL if available, fallback to original media URL
      recording_s3_url: uploadResult.storageUrl || recordingMediaUrl,
      recording_s3_key: uploadResult.storagePath || null,
      transcript_json: transcript,
      transcript_text: formattedTranscriptText || transcript.text,
      summary: analysis.summary,
      highlights: analysis.highlights,
      action_items: analysis.action_items,
      speakers: speakers,
      speaker_identification_method: speakers[0]?.identification_method || 'unknown',
      meeting_duration_seconds: durationSeconds,
      updated_at: new Date().toISOString(),
    };

    // Add enhanced AI analysis fields if available
    if (enhancedAnalysis) {
      recordingUpdate.sentiment_score = enhancedAnalysis.sentiment.score;
      recordingUpdate.coach_rating = enhancedAnalysis.coaching.rating; // 1-10 scale (matches frontend display)
      recordingUpdate.coach_summary = enhancedAnalysis.coaching.summary;
      recordingUpdate.talk_time_rep_pct = enhancedAnalysis.talkTime.repPct;
      recordingUpdate.talk_time_customer_pct = enhancedAnalysis.talkTime.customerPct;
      recordingUpdate.talk_time_judgement = getTalkTimeJudgement(enhancedAnalysis.talkTime.repPct);
    }

    const { error: recordingUpdateError } = await supabase
      .from('recordings')
      .update(recordingUpdate)
      .eq('id', recordingId);

    if (recordingUpdateError) {
      console.error('[ProcessRecording] CRITICAL: Failed to save recording results:', recordingUpdateError.message);
      console.error('[ProcessRecording] Update payload keys:', Object.keys(recordingUpdate));
      throw new Error(`Failed to save recording results: ${recordingUpdateError.message}`);
    }
    console.log('[ProcessRecording] Step 7: Recording saved successfully');

    // Step 7.5: Sync to unified meetings table for 60_notetaker source
    console.log('[ProcessRecording] Step 7.5: Syncing to meetings table...');
    const meetingUpdate: Record<string, unknown> = {
      title: recording.meeting_title,
      summary: analysis.summary,
      transcript_text: formattedTranscriptText || transcript.text,
      transcript_json: transcript,
      duration_minutes: durationSeconds ? Math.round(durationSeconds / 60) : null,
      processing_status: 'ready',
      recording_s3_key: uploadResult.storagePath || null,
      recording_s3_url: uploadResult.storageUrl || recordingMediaUrl,
      speakers: speakers,
      provider: '60_notetaker',
      updated_at: new Date().toISOString(),
    };

    // Add enhanced AI analysis fields to meeting
    if (enhancedAnalysis) {
      meetingUpdate.sentiment_score = enhancedAnalysis.sentiment.score;
      meetingUpdate.coach_rating = enhancedAnalysis.coaching.rating; // 1-10 scale (matches frontend display)
      meetingUpdate.coach_summary = enhancedAnalysis.coaching.summary;
      meetingUpdate.talk_time_rep_pct = enhancedAnalysis.talkTime.repPct;
      meetingUpdate.talk_time_customer_pct = enhancedAnalysis.talkTime.customerPct;
      meetingUpdate.talk_time_judgement = getTalkTimeJudgement(enhancedAnalysis.talkTime.repPct);
    }

    const { error: meetingError } = await supabase
      .from('meetings')
      .update(meetingUpdate)
      .eq('bot_id', effectiveBotId)
      .eq('source_type', '60_notetaker');

    if (meetingError) {
      console.warn('[ProcessRecording] Failed to sync to meetings table (non-fatal):', meetingError.message);
    } else {
      console.log('[ProcessRecording] Successfully synced to meetings table');
    }

    // Step 7.6: Insert action items to meeting_action_items if enhanced analysis available
    if (enhancedAnalysis && enhancedAnalysis.actionItems.length > 0) {
      console.log('[ProcessRecording] Step 7.6: Inserting action items...');
      try {
        // Get the meeting ID for the action items
        const { data: meeting } = await supabase
          .from('meetings')
          .select('id')
          .eq('bot_id', effectiveBotId)
          .eq('source_type', '60_notetaker')
          .maybeSingle();

        if (meeting) {
          const actionItemsToInsert = enhancedAnalysis.actionItems.map((item) => ({
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

          const { error: actionError } = await supabase
            .from('meeting_action_items')
            .insert(actionItemsToInsert);

          if (actionError) {
            console.warn('[ProcessRecording] Failed to insert action items:', actionError.message);
          } else {
            console.log(`[ProcessRecording] Inserted ${actionItemsToInsert.length} action items`);
          }
        }
      } catch (actionError) {
        console.warn('[ProcessRecording] Action items insertion error (non-fatal):', actionError);
      }
    }

    // Step 8: Update bot deployment status
    const { error: deployError } = await supabase
      .from('bot_deployments')
      .update({
        status: 'completed',
      })
      .eq('bot_id', effectiveBotId);

    if (deployError) {
      console.warn('[ProcessRecording] Failed to update bot deployment status (non-fatal):', deployError.message);
    }

    // Step 9: Trigger CRM sync
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (supabaseUrl && serviceRoleKey) {
      try {
        const crmSyncResponse = await fetch(`${supabaseUrl}/functions/v1/sync-recording-to-crm`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recording_id: recordingId,
          }),
        });

        if (crmSyncResponse.ok) {
          const crmResult = await crmSyncResponse.json();
          console.log('[ProcessRecording] CRM sync completed:', crmResult);
        } else {
          console.warn('[ProcessRecording] CRM sync failed:', await crmSyncResponse.text());
        }
      } catch (err) {
        console.warn('[ProcessRecording] CRM sync error (non-blocking):', err);
      }
    }

    // Step 10: Sync S3 URLs to meetings and generate thumbnail
    console.log('[ProcessRecording] Step 10: Syncing S3 URLs and generating thumbnail...');
    await syncRecordingToMeeting({
      recording_id: recordingId,
      bot_id: effectiveBotId,
      supabase,
    });

    // Step 11: Send recording ready notification
    if (supabaseUrl && serviceRoleKey) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-recording-notification`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recording_id: recordingId,
            notification_type: 'recording_ready',
          }),
        });
        console.log('[ProcessRecording] Recording ready notification sent');
      } catch (err) {
        console.warn('[ProcessRecording] Notification error (non-blocking):', err);
      }
    }

    // Step 12: Fire-and-forget: trigger orchestrator for post-meeting workflow
    try {
      // Fetch the meeting record to get all required fields
      const { data: meeting } = await supabase
        .from('meetings')
        .select('id, title, owner_user_id, org_id, contact_id, attendees_count')
        .eq('bot_id', effectiveBotId)
        .eq('source_type', '60_notetaker')
        .maybeSingle();

      // Only trigger for real meetings (2+ attendees)
      if (meeting && (meeting.attendees_count || 0) > 1) {
        fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'meeting_ended',
            source: 'edge:process-recording',
            org_id: meeting.org_id || recording.org_id,
            user_id: meeting.owner_user_id || recording.user_id,
            payload: {
              meeting_id: meeting.id,
              contact_id: meeting.contact_id || null,
              title: meeting.title,
              transcript_available: true,
            },
            idempotency_key: `meeting_ended:${meeting.id}`,
          }),
        }).catch(err => console.error('[ProcessRecording] Orchestrator call failed:', err));
      }
    } catch (err) {
      console.error('[ProcessRecording] Failed to trigger orchestrator:', err);
      // Don't fail the pipeline — this is additive
    }

    console.log('[ProcessRecording] Pipeline complete for recording:', recordingId);

    return { success: true };
  } catch (error) {
    console.error('[ProcessRecording] Pipeline error:', error);

    // Update recording with error status
    const errorMessage = error instanceof Error ? error.message : 'Processing failed';
    const { error: failUpdateError } = await supabase
      .from('recordings')
      .update({
        status: 'failed',
        error_message: errorMessage,
      })
      .eq('id', recordingId);

    if (failUpdateError) {
      console.error('[ProcessRecording] Failed to update error status:', failUpdateError.message);
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Processing failed',
    };
  }
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    const preflightResponse = handleCorsPreflightRequest(req);
    if (preflightResponse) return preflightResponse;
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // This function can be called with service role key for webhook processing
    // or with user JWT for manual processing
    const authHeader = req.headers.get('Authorization');

    // Create Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      // Use service role for internal processing
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!,
      authHeader
        ? {
            global: {
              headers: { Authorization: authHeader },
            },
          }
        : undefined
    );

    const body: ProcessRecordingRequest = await req.json();

    if (!body.recording_id) {
      return new Response(
        JSON.stringify({ error: 'recording_id is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const result = await processRecording(
      supabase,
      body.recording_id,
      body.bot_id,
      body.video_url,
      body.audio_url,
      body.transcript
    , body.video_url, body.audio_url);

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[ProcessRecording] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
