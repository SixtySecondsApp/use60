/**
 * Fathom Ingestion Adapter
 *
 * Transforms Fathom API call objects into NormalizedMeetingData.
 */

import type {
  NormalizedMeetingData,
  NormalizedParticipant,
  NormalizedActionItem,
  NormalizedAIAnalysis,
} from '../types.ts'
import type { TranscriptAnalysis } from '../../aiAnalysis.ts'

// ── Input Types ──────────────────────────────────────────────────────

export interface FathomAdapterInput {
  call: any                              // Fathom API call/recording object
  orgId: string | null
  ownerUserId: string
  ownerEmail: string | null
  fathomUserId: string
  thumbnailUrl?: string | null
  summaryText?: string | null
  calendarInvitees?: FathomCalendarInvitee[]
  nativeActionItems?: FathomActionItem[]
  aiAnalysis?: TranscriptAnalysis | null
  markAsHistorical?: boolean
  transcriptText?: string | null
  transcriptStatus?: string
  summaryStatus?: string
}

interface FathomCalendarInvitee {
  name: string
  email?: string
  is_external?: boolean
  is_host?: boolean
}

interface FathomActionItem {
  title?: string
  description?: string
  recording_timestamp?: string         // "HH:MM:SS"
  recording_playback_url?: string
  playback_url?: string
  completed?: boolean
  user_generated?: boolean
  type?: string
  category?: string
  priority?: string
}

// ── Adapter Function ─────────────────────────────────────────────────

export function adaptFathomMeeting(input: FathomAdapterInput): NormalizedMeetingData {
  const { call, orgId, ownerUserId, ownerEmail, fathomUserId } = input

  const recordingId = call.recording_id || call.id
  const durationMinutes = calculateDurationMinutes(
    call.recording_start_time || call.scheduled_start_time,
    call.recording_end_time || call.scheduled_end_time
  )

  const embedUrl = recordingId ? buildEmbedUrl(recordingId) : null

  // Determine statuses
  const transcriptStatus = input.transcriptStatus || (input.transcriptText ? 'complete' : 'pending')
  const summaryStatus = input.summaryStatus || (input.summaryText ? 'complete' : 'pending')

  const data: NormalizedMeetingData = {
    // Identity
    provider: 'fathom',
    owner_user_id: ownerUserId,
    org_id: orgId,

    // Dedup key
    fathom_recording_id: recordingId ? String(recordingId) : undefined,

    // Core
    title: call.title || call.meeting_title,
    meeting_start: call.recording_start_time || call.scheduled_start_time,
    meeting_end: call.recording_end_time || call.scheduled_end_time,
    duration_minutes: durationMinutes,
    owner_email: ownerEmail || call.recorded_by?.email || call.host_email || null,
    summary: input.summaryText || undefined,
    transcript_text: input.transcriptText || undefined,

    // Status
    transcript_status: transcriptStatus,
    summary_status: summaryStatus,
    sync_status: 'synced',
    last_synced_at: new Date().toISOString(),

    // Fathom-specific
    fathom_user_id: fathomUserId,
    team_name: call.recorded_by?.team || undefined,
    share_url: call.share_url,
    calls_url: call.url,
    transcript_doc_url: call.transcript || undefined,
    fathom_embed_url: embedUrl || undefined,
    thumbnail_url: input.thumbnailUrl || undefined,
    thumbnail_status: input.thumbnailUrl ? 'ready' : 'pending',
    fathom_created_at: call.created_at || undefined,
    transcript_language: call.transcript_language || 'en',
    calendar_invitees_type: normalizeInviteesType(
      call.calendar_invitees_domains_type || call.calendar_invitees_type
    ),
    is_historical_import: input.markAsHistorical,
  }

  // Participants from calendar invitees
  if (input.calendarInvitees && input.calendarInvitees.length > 0) {
    data.participants = input.calendarInvitees.map(inv => ({
      name: inv.name,
      email: inv.email,
      isExternal: inv.is_external,
      isHost: inv.is_host,
      role: inv.is_host ? 'host' : 'attendee',
    }))
  }

  // Action items: merge native Fathom items + AI-generated items
  const actionItems: NormalizedActionItem[] = []

  // Native Fathom action items
  if (input.nativeActionItems && input.nativeActionItems.length > 0) {
    for (const item of input.nativeActionItems) {
      const title = item.description || item.title || 'Untitled Action Item'
      const timestampSeconds = parseTimestampToSeconds(item.recording_timestamp)

      actionItems.push({
        title,
        timestamp_seconds: timestampSeconds ?? undefined,
        category: item.type || item.category || 'general',
        priority: validatePriority(item.priority),
        ai_generated: !(item.user_generated),
        completed: item.completed ?? false,
        synced_to_task: false,
        playback_url: item.recording_playback_url || item.playback_url || undefined,
      })
    }
  }

  // AI-generated action items
  if (input.aiAnalysis?.actionItems) {
    for (const item of input.aiAnalysis.actionItems) {
      actionItems.push({
        title: item.title,
        assignee_name: item.assignedTo || undefined,
        assignee_email: item.assignedToEmail || undefined,
        deadline_at: item.deadline || undefined,
        category: item.category || 'general',
        priority: validatePriority(item.priority),
        ai_generated: true,
        ai_confidence: item.confidence,
        needs_review: item.confidence < 0.8,
        completed: false,
        synced_to_task: false,
        timestamp_seconds: item.timestampSeconds ?? undefined,
      })
    }
  }

  if (actionItems.length > 0) {
    data.action_items = actionItems
  }

  // AI Analysis
  if (input.aiAnalysis) {
    data.ai = adaptAIAnalysis(input.aiAnalysis)
  }

  return data
}

// ── Helpers ──────────────────────────────────────────────────────────

function adaptAIAnalysis(analysis: TranscriptAnalysis): NormalizedAIAnalysis {
  const ai: NormalizedAIAnalysis = {
    sentiment_score: analysis.sentiment.score,
    sentiment_reasoning: analysis.sentiment.reasoning,
    talk_time_rep_pct: analysis.talkTime.repPct,
    talk_time_customer_pct: analysis.talkTime.customerPct,
    talk_time_judgement: analysis.talkTime.assessment,
    coach_rating: analysis.coaching.rating,  // already 1-10
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

function calculateDurationMinutes(start?: string, end?: string): number {
  if (!start || !end) return 0
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  if (isNaN(startMs) || isNaN(endMs)) return 0
  return Math.round((endMs - startMs) / 60000)
}

function buildEmbedUrl(recordingId: string): string | null {
  if (!recordingId) return null
  return `https://fathom.video/embed/${recordingId}`
}

function normalizeInviteesType(type?: string): string | undefined {
  if (!type) return undefined
  const normalized = type.toLowerCase().trim()
  if (['internal', 'external', 'mixed', 'unknown'].includes(normalized)) {
    return normalized
  }
  return undefined
}

function parseTimestampToSeconds(timestamp?: string): number | null {
  if (!timestamp) return null
  const parts = timestamp.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return null
}

function validatePriority(priority?: string): 'high' | 'medium' | 'low' {
  const normalized = String(priority || 'medium').toLowerCase()
  if (['high', 'medium', 'low'].includes(normalized)) return normalized as any
  return 'medium'
}
