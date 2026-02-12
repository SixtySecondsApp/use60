/**
 * 60 Notetaker Ingestion Adapter
 *
 * Transforms MeetingBaaS/process-recording data into NormalizedMeetingData.
 *
 * FIXES applied by this adapter:
 * - Extracts participants from speakers[] for CRM (previously missing)
 * - Maps action item columns to canonical names (assignee_name, deadline_at, ai_confidence)
 * - Does NOT multiply coach_rating by 10 (keeps 1-10 scale)
 * - Sets ai_generated, needs_review, synced_to_task, category
 */

import type {
  NormalizedMeetingData,
  NormalizedParticipant,
  NormalizedActionItem,
  NormalizedAIAnalysis,
} from '../types.ts'
import type { TranscriptAnalysis } from '../../aiAnalysis.ts'

// ── Input Types ──────────────────────────────────────────────────────

export interface NotetakerAdapterInput {
  recording: any                         // Row from recordings table
  botId: string
  transcript: NotetakerTranscript
  aiSummary?: { summary?: string } | null  // Basic AI analysis (OpenAI)
  enhancedAnalysis?: TranscriptAnalysis | null  // Enhanced analysis (Claude)
  uploadResult?: { storagePath?: string; storageUrl?: string } | null
  attendees?: NotetakerAttendee[]
  speakers?: NotetakerSpeaker[]
}

interface NotetakerTranscript {
  text?: string
  utterances?: any[]
  [key: string]: unknown                 // Full transcript object stored as JSONB
}

interface NotetakerAttendee {
  name?: string
  email?: string
  is_organizer?: boolean
}

interface NotetakerSpeaker {
  speaker_id?: number | string
  name?: string
  email?: string
  is_internal?: boolean
  identification_method?: string
  confidence?: number
  talk_time_seconds?: number
  talk_time_percent?: number
}

// ── Adapter Function ─────────────────────────────────────────────────

export function adaptNotetakerMeeting(input: NotetakerAdapterInput): NormalizedMeetingData {
  const { recording, botId, transcript, aiSummary, enhancedAnalysis, uploadResult } = input

  // Calculate duration from utterances if available
  const durationSeconds = calculateDurationFromUtterances(transcript.utterances)
  const durationMinutes = durationSeconds ? Math.round(durationSeconds / 60) : null

  const data: NormalizedMeetingData = {
    // Identity
    provider: '60_notetaker',
    owner_user_id: recording.user_id,
    org_id: recording.org_id,

    // Core
    title: recording.meeting_title,
    summary: aiSummary?.summary || undefined,
    transcript_text: transcript.text || undefined,
    transcript_json: transcript,
    duration_minutes: durationMinutes || undefined,

    // Status
    source_type: '60_notetaker',
    processing_status: 'ready',

    // 60 Notetaker-specific
    recording_id: recording.id,
    bot_id: botId,
    meeting_platform: recording.meeting_platform,
    meeting_url: recording.meeting_url,
    speakers: input.speakers || undefined,
    recording_s3_key: uploadResult?.storagePath || undefined,
    recording_s3_url: uploadResult?.storageUrl || recording.recording_s3_url || undefined,
  }

  // Participants: extract from speakers + attendees (NEW — enables CRM)
  const participants = extractParticipants(input.attendees, input.speakers)
  if (participants.length > 0) {
    data.participants = participants
  }

  // Action items: from enhanced analysis (canonical column names)
  if (enhancedAnalysis?.actionItems && enhancedAnalysis.actionItems.length > 0) {
    data.action_items = enhancedAnalysis.actionItems.map(item => ({
      title: item.title,
      assignee_name: item.assignedTo || undefined,         // NOT 'assignee'
      assignee_email: item.assignedToEmail || undefined,
      deadline_at: item.deadline || undefined,              // NOT 'due_date'
      priority: item.priority || 'medium',
      category: item.category || 'general',
      ai_generated: true,                                   // was missing
      ai_confidence: item.confidence,                       // NOT 'confidence'
      needs_review: (item.confidence || 0) < 0.8,          // was missing
      completed: false,
      synced_to_task: false,                                // was missing
      timestamp_seconds: item.timestampSeconds ?? undefined,
    }))
  }

  // AI Analysis (coach_rating stays 1-10 — NOT multiplied by 10)
  if (enhancedAnalysis) {
    data.ai = adaptAIAnalysis(enhancedAnalysis)
  }

  return data
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Extract participants from speakers JSONB + attendees array.
 * This enables CRM integration for 60 Notetaker for the first time.
 */
function extractParticipants(
  attendees?: NotetakerAttendee[],
  speakers?: NotetakerSpeaker[]
): NormalizedParticipant[] {
  const participantMap = new Map<string, NormalizedParticipant>()

  // Source 1: Calendar attendees (have emails, most reliable)
  if (attendees) {
    for (const att of attendees) {
      if (att.email) {
        const key = att.email.toLowerCase()
        if (!participantMap.has(key)) {
          participantMap.set(key, {
            name: att.name || att.email.split('@')[0],
            email: key,
            isHost: att.is_organizer,
            role: att.is_organizer ? 'organizer' : 'attendee',
          })
        }
      }
    }
  }

  // Source 2: Identified speakers with emails
  if (speakers) {
    for (const speaker of speakers) {
      if (speaker.email) {
        const key = speaker.email.toLowerCase()
        if (!participantMap.has(key)) {
          participantMap.set(key, {
            name: speaker.name || `Speaker ${speaker.speaker_id ?? '?'}`,
            email: key,
            isExternal: speaker.is_internal === false ? true : undefined,
            role: 'speaker',
          })
        }
      }
    }
  }

  return Array.from(participantMap.values())
}

function adaptAIAnalysis(analysis: TranscriptAnalysis): NormalizedAIAnalysis {
  const ai: NormalizedAIAnalysis = {
    sentiment_score: analysis.sentiment.score,
    sentiment_reasoning: analysis.sentiment.reasoning,
    talk_time_rep_pct: analysis.talkTime.repPct,
    talk_time_customer_pct: analysis.talkTime.customerPct,
    talk_time_judgement: analysis.talkTime.assessment,
    coach_rating: analysis.coaching.rating,  // 1-10, NOT * 10
    coach_summary: JSON.stringify({
      summary: analysis.coaching.summary,
      strengths: analysis.coaching.strengths,
      improvements: analysis.coaching.improvements,
      evaluationBreakdown: analysis.coaching.evaluationBreakdown,
    }),
  }

  if (analysis.callType) {
    ai.call_type_id = analysis.callType.callTypeId || undefined
    ai.call_type_confidence = analysis.callType.confidence
    ai.call_type_reasoning = analysis.callType.reasoning
  }

  return ai
}

function calculateDurationFromUtterances(utterances?: any[]): number | null {
  if (!utterances || utterances.length === 0) return null

  let maxEndTime = 0
  for (const utt of utterances) {
    const end = utt.end_time || utt.end || 0
    if (end > maxEndTime) maxEndTime = end
  }

  return maxEndTime > 0 ? Math.round(maxEndTime) : null
}
