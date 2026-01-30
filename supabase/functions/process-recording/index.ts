/**
 * Process Recording Edge Function
 *
 * Processes a completed recording through the full analysis pipeline:
 * 1. Download recording from MeetingBaaS
 * 2. Transcribe using AssemblyAI (or MeetingBaaS fallback)
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
import { S3Client, PutObjectCommand, HeadObjectCommand } from 'npm:@aws-sdk/client-s3@3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3';
import { legacyCorsHeaders as corsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import {
  createMeetingBaaSClient,
  extractDomain,
  isInternalEmail,
  formatDuration,
} from '../_shared/meetingbaas.ts';
// Import AI analysis function from fathom-sync for sentiment, talk time, and coaching
import { analyzeTranscriptWithClaude, TranscriptAnalysis } from '../fathom-sync/aiAnalysis.ts';
import { syncRecordingToMeeting } from '../_shared/recordingCompleteSync.ts';

// =============================================================================
// Storage Upload Helper
// =============================================================================

interface UploadRecordingResult {
  success: boolean;
  storageUrl?: string;
  storagePath?: string;
  error?: string;
}

/**
 * Download recording from MeetingBaaS and upload to AWS S3
 * Bucket: use60-application (eu-west-2)
 * Folder structure: /meeting-recordings/{org_id}/{user_id}/{recording_id}/recording.mp4
 */
async function uploadRecordingToStorage(
  supabase: SupabaseClient,
  recordingUrl: string,
  orgId: string,
  userId: string,
  recordingId: string
): Promise<UploadRecordingResult> {
  console.log('[ProcessRecording] Downloading recording from MeetingBaaS...');

  try {
    // Initialize S3 client
    const s3Client = new S3Client({
      region: Deno.env.get('AWS_REGION') || 'eu-west-2',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      },
    });

    const bucketName = Deno.env.get('AWS_S3_BUCKET') || 'use60-application';

    // Download the recording
    const response = await fetch(recordingUrl);
    if (!response.ok) {
      throw new Error(`Failed to download recording: ${response.status}`);
    }

    // Get content type and determine file extension
    const contentType = response.headers.get('content-type') || 'video/mp4';
    let fileExtension = 'mp4';
    if (contentType.includes('webm')) {
      fileExtension = 'webm';
    } else if (contentType.includes('audio')) {
      fileExtension = contentType.includes('wav') ? 'wav' : 'mp3';
    }

    // Create S3 key: meeting-recordings/{org_id}/{user_id}/{recording_id}/recording.{ext}
    const s3Key = `meeting-recordings/${orgId}/${userId}/${recordingId}/recording.${fileExtension}`;

    console.log(`[ProcessRecording] Uploading to S3: s3://${bucketName}/${s3Key}`);

    // Get the recording data as array buffer
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Upload to S3
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: uint8Array,
      ContentType: contentType,
      Metadata: {
        'org-id': orgId,
        'user-id': userId,
        'recording-id': recordingId,
      },
    });

    await s3Client.send(putCommand);

    // Generate a signed URL (7 days expiry)
    const getCommand = new HeadObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
    });

    const signedUrl = await getSignedUrl(s3Client, getCommand, {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
    });

    console.log(`[ProcessRecording] S3 upload successful: ${s3Key}`);

    return {
      success: true,
      storageUrl: signedUrl,
      storagePath: s3Key,
    };
  } catch (error) {
    console.error('[ProcessRecording] S3 upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

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
// Transcription Services (AssemblyAI primary)
// =============================================================================

interface TranscriptResult {
  text: string;
  utterances: TranscriptUtterance[];
  speakers?: { id: number; count: number }[];
}

/**
 * Transcribe audio using Deepgram (primary provider)
 * Free tier: 45 hours/month
 */
async function transcribeWithDeepgram(audioUrl: string): Promise<TranscriptResult> {
  const deepgramApiKey = Deno.env.get('DEEPGRAM_API_KEY');
  if (!deepgramApiKey) {
    throw new Error('DEEPGRAM_API_KEY not configured');
  }

  console.log('[ProcessRecording] Starting Deepgram transcription...');

  const response = await fetch(
    'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&punctuate=true&utterances=true',
    {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: audioUrl }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Deepgram API error: ${error}`);
  }

  const result = await response.json();
  const channel = result.results?.channels?.[0];
  const alternatives = channel?.alternatives?.[0];

  if (!alternatives) {
    throw new Error('Deepgram returned no transcription');
  }

  console.log('[ProcessRecording] Deepgram transcription complete');

  // Convert Deepgram utterances format to our standard format
  const utterances: TranscriptUtterance[] = (result.results?.utterances || []).map((u: any) => ({
    speaker: u.speaker ?? 0,
    start: u.start ?? 0,
    end: u.end ?? 0,
    text: u.transcript ?? '',
    confidence: u.confidence,
  }));

  // If no utterances but we have words with speakers, build utterances from words
  if (utterances.length === 0 && alternatives.words?.length > 0) {
    let currentSpeaker = -1;
    let currentUtterance: TranscriptUtterance | null = null;

    for (const word of alternatives.words) {
      if (word.speaker !== currentSpeaker) {
        if (currentUtterance) {
          utterances.push(currentUtterance);
        }
        currentSpeaker = word.speaker ?? 0;
        currentUtterance = {
          speaker: currentSpeaker,
          start: word.start ?? 0,
          end: word.end ?? 0,
          text: word.punctuated_word || word.word || '',
          confidence: word.confidence,
        };
      } else if (currentUtterance) {
        currentUtterance.end = word.end ?? currentUtterance.end;
        currentUtterance.text += ' ' + (word.punctuated_word || word.word || '');
      }
    }
    if (currentUtterance) {
      utterances.push(currentUtterance);
    }
  }

  return {
    text: alternatives.transcript || '',
    utterances,
  };
}

/**
 * Transcribe audio using Gladia (fallback provider)
 */
async function transcribeWithGladia(audioUrl: string): Promise<TranscriptResult> {
  const gladiaApiKey = Deno.env.get('GLADIA_API_KEY');
  if (!gladiaApiKey) {
    throw new Error('GLADIA_API_KEY not configured');
  }

  console.log('[ProcessRecording] Starting Gladia transcription...');

  // Step 1: Request transcription
  const transcriptResponse = await fetch('https://api.gladia.io/v2/transcription', {
    method: 'POST',
    headers: {
      'x-gladia-key': gladiaApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      diarization: true,
      diarization_config: {
        min_speakers: 2,
        max_speakers: 10,
      },
    }),
  });

  if (!transcriptResponse.ok) {
    const error = await transcriptResponse.text();
    throw new Error(`Gladia API error: ${error}`);
  }

  const { result_url } = await transcriptResponse.json();

  // Step 2: Poll for results
  let result = null;
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes with 5s intervals

  while (!result && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const statusResponse = await fetch(result_url, {
      headers: { 'x-gladia-key': gladiaApiKey },
    });

    if (!statusResponse.ok) {
      attempts++;
      continue;
    }

    const status = await statusResponse.json();

    if (status.status === 'done') {
      result = status.result;
    } else if (status.status === 'error') {
      throw new Error(`Gladia transcription failed: ${status.error}`);
    }

    attempts++;
  }

  if (!result) {
    throw new Error('Gladia transcription timed out');
  }

  console.log('[ProcessRecording] Gladia transcription complete');

  return {
    text: result.transcription?.full_transcript || '',
    utterances: (result.transcription?.utterances || []).map((u: any) => ({
      speaker: u.speaker ?? 0,
      start: u.start ?? 0,
      end: u.end ?? 0,
      text: u.text ?? '',
      confidence: u.confidence,
    })),
    speakers: result.transcription?.speakers,
  };
}

/**
 * Transcribe audio using AssemblyAI (primary provider)
 * Uses universal speech model with speaker diarization
 */
async function transcribeWithAssemblyAI(audioUrl: string): Promise<TranscriptResult> {
  const assemblyAiApiKey = Deno.env.get('ASSEMBLYAI_API_KEY');
  if (!assemblyAiApiKey) {
    throw new Error('ASSEMBLYAI_API_KEY not configured');
  }

  console.log('[ProcessRecording] Starting AssemblyAI transcription...');

  try {
    // Import AssemblyAI SDK (using npm: specifier for Deno compatibility)
    const { AssemblyAI } = await import('npm:assemblyai@^4.0.0');

    const client = new AssemblyAI({
      apiKey: assemblyAiApiKey,
    });

    const params = {
      audio: audioUrl, // S3 URL or MeetingBaaS URL
      speech_model: 'universal', // As per user's example
      speaker_labels: true, // Enable speaker diarization
      punctuate: true,
      format_text: true,
    };

    const transcript = await client.transcripts.transcribe(params);

    if (!transcript.text) {
      throw new Error('AssemblyAI returned no transcription');
    }

    console.log('[ProcessRecording] AssemblyAI transcription complete');

    // Convert AssemblyAI format to our standard format
    // AssemblyAI utterances have start/end in milliseconds, convert to seconds
    const utterances: TranscriptUtterance[] = (transcript.utterances || []).map((u: any) => ({
      speaker: u.speaker ?? 0,
      start: (u.start ?? 0) / 1000, // Convert ms to seconds
      end: (u.end ?? 0) / 1000, // Convert ms to seconds
      text: u.text || '',
      confidence: u.confidence,
    }));

    // Extract speaker information if available
    const speakers = transcript.speakers?.map((s: any, idx: number) => ({
      id: idx,
      count: 0, // Will be calculated from utterances
    }));

    // Count utterances per speaker
    if (speakers) {
      utterances.forEach((u) => {
        const speaker = speakers.find((s) => s.id === u.speaker);
        if (speaker) {
          speaker.count++;
        }
      });
    }

    return {
      text: transcript.text,
      utterances,
      speakers,
    };
  } catch (error) {
    console.error('[ProcessRecording] AssemblyAI transcription error:', error);
    throw new Error(
      `AssemblyAI API error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Main transcription function - uses AssemblyAI as primary provider
 */
async function transcribeAudio(audioUrl: string): Promise<TranscriptResult> {
  // Use AssemblyAI as primary provider
  const assemblyAiKey = Deno.env.get('ASSEMBLYAI_API_KEY');
  if (assemblyAiKey) {
    try {
      return await transcribeWithAssemblyAI(audioUrl);
    } catch (error) {
      console.warn('[ProcessRecording] AssemblyAI failed:', error);
      throw error; // Fail fast - no fallback for now
    }
  }

  throw new Error('ASSEMBLYAI_API_KEY not configured');
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
    await supabase
      .from('recordings')
      .update({ status: 'processing' })
      .eq('id', recordingId);

    const settings = recording.organizations?.recording_settings;
    const internalDomain = recording.organizations?.company_domain || null;

    // Step 1: Determine media URL for transcription
    // Priority: 1) Already uploaded S3 URL, 2) Compress-callback S3 URL, 3) Passed video/audio URL, 4) Fallback to MeetingBaaS API
    let mediaUrlForTranscription: string | null = null;
    let uploadResult: UploadRecordingResult = { success: false };

    // Check if S3 upload already done by webhook handler (legacy field)
    if (recording.recording_s3_url) {
      console.log('[ProcessRecording] Step 1: Using existing S3 URL for transcription');
      mediaUrlForTranscription = recording.recording_s3_url;
      uploadResult = {
        success: true,
        storageUrl: recording.recording_s3_url,
        storagePath: recording.recording_s3_key,
      };
    } else if (recording.s3_video_url || recording.s3_audio_url) {
      // Use S3 URLs from compress-callback (permanent storage)
      const s3Url = recording.s3_audio_url || recording.s3_video_url;
      console.log('[ProcessRecording] Step 1: Using S3 URL from compress-callback for transcription');
      mediaUrlForTranscription = s3Url!;
      uploadResult = {
        success: true,
        storageUrl: recording.s3_video_url || null,
        storagePath: null,
      };
    } else if (videoUrl || audioUrl) {
      // Use URLs passed from webhook
      const passedUrl = videoUrl || audioUrl;
      console.log('[ProcessRecording] Step 1: Using passed URL from webhook');
      mediaUrlForTranscription = passedUrl!;

      // Upload to S3 since webhook didn't do it
      console.log('[ProcessRecording] Step 1.5: Uploading to storage...');
      uploadResult = await uploadRecordingToStorage(
        supabase,
        passedUrl!,
        recording.org_id,
        recording.user_id,
        recordingId
      );
    } else {
      // Fallback: Try MeetingBaaS API (may fail for old recordings)
      console.log('[ProcessRecording] Step 1: Fetching recording from MeetingBaaS API...');
      const meetingBaaSClient = createMeetingBaaSClient();
      const { data: recordingData, error: recordingError } =
        await meetingBaaSClient.getRecording(effectiveBotId);

      if (recordingError || !recordingData) {
        throw new Error(recordingError?.message || 'Failed to get recording from MeetingBaaS');
      }

      mediaUrlForTranscription = recordingData.url;

      // Upload to S3
      console.log('[ProcessRecording] Step 1.5: Uploading to storage...');
      uploadResult = await uploadRecordingToStorage(
        supabase,
        recordingData.url,
        recording.org_id,
        recording.user_id,
        recordingId
      );
    }

    if (!mediaUrlForTranscription) {
      throw new Error('No media URL available for processing');
    }

    // Log upload result
    if (!uploadResult.success) {
      console.warn('[ProcessRecording] Storage upload failed - will continue with original URL:', uploadResult.error);
    }

    // Step 2: Get transcript
    console.log('[ProcessRecording] Step 2: Getting transcript...');
    
    // Update transcription status to processing
    await supabase
      .from('recordings')
      .update({
        transcription_status: 'processing',
        transcription_provider: 'assemblyai',
      })
      .eq('id', recordingId);

    let transcript: TranscriptData;

    // Use provided transcript if available (passed from transcript.ready webhook)
    if (providedTranscript && providedTranscript.text && providedTranscript.utterances) {
      console.log('[ProcessRecording] Using transcript provided from webhook');
      transcript = {
        text: providedTranscript.text,
        utterances: providedTranscript.utterances.map((u) => ({
          speaker: u.speaker,
          start: u.start,
          end: u.end,
          text: u.text,
          confidence: u.confidence,
        })),
      };
    } else {
      // No transcript provided in webhook - try MeetingBaaS API first
      console.log('[ProcessRecording] No transcript provided, trying MeetingBaaS API...');

      try {
        const meetingBaaSClient = createMeetingBaaSClient();
        const { data: transcriptData, error: transcriptError } =
          await meetingBaaSClient.getTranscript(effectiveBotId);

        if (transcriptData && transcriptData.text && transcriptData.utterances) {
          console.log('[ProcessRecording] Got transcript from MeetingBaaS API');
          transcript = {
            text: transcriptData.text,
            utterances: transcriptData.utterances.map((u) => ({
              speaker: u.speaker,
              start: u.start,
              end: u.end,
              text: u.text,
              confidence: u.confidence,
            })),
          };
        } else {
          console.warn('[ProcessRecording] MeetingBaaS transcript API returned no data:', transcriptError?.message);
          // Fall back to external transcription service
          console.log('[ProcessRecording] Falling back to external transcription service...');
          const transcriptionUrl = uploadResult.success ? uploadResult.storageUrl! : mediaUrlForTranscription;
          transcript = await transcribeAudio(transcriptionUrl);
        }
      } catch (meetingBaaSError) {
        console.warn('[ProcessRecording] MeetingBaaS transcript API failed:', meetingBaaSError);
        // Fall back to external transcription service
        console.log('[ProcessRecording] Falling back to external transcription service...');
        const transcriptionUrl = uploadResult.success ? uploadResult.storageUrl! : mediaUrlForTranscription;
        transcript = await transcribeAudio(transcriptionUrl);
      }
    }

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

    // Step 4.5: Run enhanced AI analysis for sentiment, talk time, and coaching
    // Uses the same analysis pipeline as Fathom recordings for consistency
    console.log('[ProcessRecording] Step 4.5: Running enhanced AI analysis...');
    let enhancedAnalysis: TranscriptAnalysis | null = null;
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
      recording_s3_url: uploadResult.storageUrl || mediaUrlForTranscription,
      recording_s3_key: uploadResult.storagePath || null,
      transcript_json: transcript,
      transcript_text: transcript.text,
      transcription_provider: 'assemblyai',
      transcription_status: 'complete',
      transcription_error: null,
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

    await supabase
      .from('recordings')
      .update(recordingUpdate)
      .eq('id', recordingId);

    // Step 7.5: Sync to unified meetings table for 60_notetaker source
    console.log('[ProcessRecording] Step 7.5: Syncing to meetings table...');
    const meetingUpdate: Record<string, unknown> = {
      title: recording.meeting_title,
      summary: analysis.summary,
      transcript_text: transcript.text,
      transcript_json: transcript,
      duration_minutes: durationSeconds ? Math.round(durationSeconds / 60) : null,
      processing_status: 'ready',
      recording_s3_key: uploadResult.storagePath || null,
      recording_s3_url: uploadResult.storageUrl || mediaUrlForTranscription,
      speakers: speakers,
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
    await supabase
      .from('bot_deployments')
      .update({
        status: 'completed',
      })
      .eq('bot_id', effectiveBotId);

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

    console.log('[ProcessRecording] Pipeline complete for recording:', recordingId);

    return { success: true };
  } catch (error) {
    console.error('[ProcessRecording] Pipeline error:', error);

    // Update recording with error status
    const errorMessage = error instanceof Error ? error.message : 'Processing failed';
    await supabase
      .from('recordings')
      .update({
        status: 'failed',
        error_message: errorMessage,
        transcription_status: 'failed',
        transcription_error: errorMessage,
      })
      .eq('id', recordingId);

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
    );

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
