/**
 * Meeting Integration Module for Voice Recordings
 * Creates meeting records from voice recordings and runs meeting intelligence
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4"
import { logAICostEvent } from "../_shared/costTracking.ts"

interface VoiceRecording {
  id: string
  user_id: string
  org_id: string
  title: string
  created_at: string
  duration_seconds: number | null
  recording_type: string
}

interface Speaker {
  id: number
  name: string
  initials?: string
}

interface TranscriptSegment {
  speaker: string
  speaker_id: number
  text: string
  start_time: number
  end_time: number
  confidence?: number
}

interface MeetingIntelligenceResult {
  meeting_id: string
  sentiment_score: number | null
  sentiment_reasoning: string | null
  talk_time_rep_pct: number | null
  talk_time_customer_pct: number | null
  talk_time_judgement: string | null
  coach_rating: number | null
}

/**
 * Create a meeting record from a voice recording
 * Called when voice recording type is 'meeting' and transcription completes
 */
export async function createMeetingFromVoiceRecording(
  supabase: ReturnType<typeof createClient>,
  recording: VoiceRecording,
  transcript: string,
  summary: string,
  speakers: Speaker[],
  transcriptSegments: TranscriptSegment[]
): Promise<MeetingIntelligenceResult | null> {
  try {
    console.log(`Creating meeting from voice recording: ${recording.id}`)

    // Calculate meeting end time from duration
    const meetingStart = new Date(recording.created_at)
    const durationSeconds = recording.duration_seconds || 0
    const meetingEnd = new Date(meetingStart.getTime() + durationSeconds * 1000)
    const durationMinutes = Math.ceil(durationSeconds / 60)

    // Calculate talk time from transcript segments
    const talkTimeAnalysis = calculateTalkTime(speakers, transcriptSegments)

    // Create meeting record
    // CRITICAL: meetings uses owner_user_id, NOT user_id!
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .insert({
        source_type: 'voice',
        voice_recording_id: recording.id,
        owner_user_id: recording.user_id,
        org_id: recording.org_id,
        title: recording.title,
        meeting_start: meetingStart.toISOString(),
        meeting_end: meetingEnd.toISOString(),
        duration_minutes: durationMinutes,
        transcript_text: transcript,
        summary: summary,
        // Talk time from segment analysis
        talk_time_rep_pct: talkTimeAnalysis.repPct,
        talk_time_customer_pct: talkTimeAnalysis.customerPct,
        talk_time_judgement: talkTimeAnalysis.assessment,
      })
      .select('id')
      .single()

    if (meetingError) {
      console.error('Failed to create meeting:', meetingError)
      return null
    }

    const meetingId = meeting.id
    console.log(`Created meeting ${meetingId} from voice recording ${recording.id}`)

    // Update voice_recording with meeting_id reference (bidirectional link)
    const { error: updateError } = await supabase
      .from('voice_recordings')
      .update({ meeting_id: meetingId })
      .eq('id', recording.id)

    if (updateError) {
      console.warn('Failed to update voice_recording with meeting_id:', updateError)
      // Non-fatal, continue
    }

    // Create meeting attendees from speakers
    await createMeetingAttendees(supabase, meetingId, speakers)

    // Run Claude AI analysis for sentiment and coaching
    const intelligenceResult = await runMeetingIntelligence(
      supabase,
      meetingId,
      recording,
      transcript,
      summary
    )

    return {
      meeting_id: meetingId,
      sentiment_score: intelligenceResult?.sentiment?.score || null,
      sentiment_reasoning: intelligenceResult?.sentiment?.reasoning || null,
      talk_time_rep_pct: talkTimeAnalysis.repPct,
      talk_time_customer_pct: talkTimeAnalysis.customerPct,
      talk_time_judgement: talkTimeAnalysis.assessment,
      coach_rating: intelligenceResult?.coaching?.rating || null,
    }
  } catch (error) {
    console.error('Error creating meeting from voice recording:', error)
    return null
  }
}

/**
 * Calculate talk time percentages from transcript segments
 */
function calculateTalkTime(
  speakers: Speaker[],
  segments: TranscriptSegment[]
): { repPct: number; customerPct: number; assessment: string } {
  if (!segments || segments.length === 0) {
    return { repPct: 50, customerPct: 50, assessment: 'Unable to calculate talk time' }
  }

  // Calculate duration per speaker
  const speakerDurations: Record<number, number> = {}
  let totalDuration = 0

  for (const segment of segments) {
    const duration = (segment.end_time || segment.start_time + 5) - segment.start_time
    speakerDurations[segment.speaker_id] = (speakerDurations[segment.speaker_id] || 0) + duration
    totalDuration += duration
  }

  if (totalDuration === 0) {
    return { repPct: 50, customerPct: 50, assessment: 'Unable to calculate talk time' }
  }

  // Assume first speaker (index 0) is the rep, others are customers
  const repDuration = speakerDurations[0] || 0
  const customerDuration = totalDuration - repDuration

  const repPct = Math.round((repDuration / totalDuration) * 100)
  const customerPct = 100 - repPct

  // Generate assessment
  let assessment = 'Balanced conversation'
  if (repPct > 70) {
    assessment = 'Rep talked significantly more - consider more active listening'
  } else if (repPct > 60) {
    assessment = 'Rep talked more - good for demos, watch for discovery calls'
  } else if (repPct < 30) {
    assessment = 'Customer dominated conversation - great for discovery'
  } else if (repPct < 40) {
    assessment = 'Good listening ratio - customer had space to share'
  }

  return { repPct, customerPct, assessment }
}

/**
 * Create meeting attendees from speakers
 */
async function createMeetingAttendees(
  supabase: ReturnType<typeof createClient>,
  meetingId: string,
  speakers: Speaker[]
): Promise<void> {
  if (!speakers || speakers.length === 0) return

  const attendees = speakers.map((speaker, index) => ({
    meeting_id: meetingId,
    name: speaker.name || `Speaker ${index + 1}`,
    email: null, // Voice recordings don't have email info
    // First speaker is assumed to be internal (the user), others are external
    is_external: index !== 0,
    role: index === 0 ? 'host' : 'attendee',
  }))

  const { error } = await supabase
    .from('meeting_attendees')
    .insert(attendees)

  if (error) {
    console.warn('Failed to create meeting attendees:', error)
  } else {
    console.log(`Created ${attendees.length} meeting attendees`)
  }
}

/**
 * Run Claude AI analysis for meeting intelligence
 * Simplified version focused on sentiment and coaching
 */
async function runMeetingIntelligence(
  supabase: ReturnType<typeof createClient>,
  meetingId: string,
  recording: VoiceRecording,
  transcript: string,
  summary: string
): Promise<{
  sentiment: { score: number; reasoning: string } | null
  coaching: { rating: number; summary: string } | null
} | null> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicApiKey) {
    console.warn('ANTHROPIC_API_KEY not configured, skipping meeting intelligence')
    return null
  }

  const model = Deno.env.get('CLAUDE_MODEL') || 'claude-haiku-4-5-20251001'

  const prompt = `Analyze this voice recording transcript and provide sentiment analysis and coaching insights.

RECORDING CONTEXT:
- Title: ${recording.title}
- Date: ${new Date(recording.created_at).toISOString().split('T')[0]}
- Duration: ${Math.ceil((recording.duration_seconds || 0) / 60)} minutes

SUMMARY:
${summary}

TRANSCRIPT:
${transcript.substring(0, 10000)}${transcript.length > 10000 ? '...(truncated)' : ''}

Analyze and provide:

1. SENTIMENT: Overall tone of the conversation
   - Score: -1.0 (very negative) to 1.0 (very positive)
   - Reasoning: Brief explanation

2. COACHING: Sales performance assessment
   - Rating: 1-10 scale
   - Summary: 2-3 sentence assessment

Return ONLY valid JSON:
{
  "sentiment": {
    "score": 0.65,
    "reasoning": "Generally positive conversation with good engagement"
  },
  "coaching": {
    "rating": 7,
    "summary": "Good overall performance with strong discovery questions. Could improve on securing clearer next steps."
  }
}

Return ONLY the JSON, no other text.`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      console.error('Claude API error:', response.status)
      return null
    }

    const data = await response.json()
    // Log AI cost event (fire-and-forget)
    if (data.usage && recording.user_id) {
      logAICostEvent(
        supabase, recording.user_id, recording.org_id ?? null,
        'anthropic', model,
        data.usage.input_tokens || 0, data.usage.output_tokens || 0,
        'voice_meeting_intelligence',
        undefined,
        { source: 'agent_automated', agentType: 'voice-transcribe-poll' },
      ).catch((e: unknown) => console.warn('[voice-transcribe-poll] cost log error:', e))
    }
    const content = data.content[0]?.text || ''

    // Parse JSON response
    let jsonText = content.trim()
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?$/g, '')
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '').replace(/```\n?$/g, '')
    }

    const parsed = JSON.parse(jsonText)

    // Update meeting with intelligence results
    const { error: updateError } = await supabase
      .from('meetings')
      .update({
        sentiment_score: parsed.sentiment?.score || null,
        sentiment_reasoning: parsed.sentiment?.reasoning || null,
        coach_rating: parsed.coaching?.rating || null,
      })
      .eq('id', meetingId)

    if (updateError) {
      console.warn('Failed to update meeting with intelligence:', updateError)
    }

    return {
      sentiment: parsed.sentiment || null,
      coaching: parsed.coaching || null,
    }
  } catch (error) {
    console.error('Meeting intelligence error:', error)
    return null
  }
}
