/**
 * Shared Meeting Analysis Pipeline Orchestrator
 *
 * Chains together all AI analysis steps for a meeting:
 *  1. Basic analysis (sentiment, talk time, coaching, call type) via analyzeTranscriptWithClaude
 *  2. Structured summary via meeting-process-structured-summary edge function
 *  3. Scorecard via meeting-generate-scorecard edge function
 *  4. Queues the meeting for Gemini semantic indexing
 *
 * Designed to be called fire-and-forget from webhook handlers and
 * awaited from reprocess flows where the caller wants the result.
 *
 * Each step has its own credit check so a low-credit org can still get
 * as far as the balance allows.
 */

import { analyzeTranscriptWithClaude } from '../fathom-sync/aiAnalysis.ts'
import { checkCreditBalance } from './costTracking.ts'

export interface PipelineResult {
  basicAnalysis: boolean
  structuredSummary: boolean
  scorecard: boolean
  indexQueued: boolean
  totalCreditsUsed: number
  errors: string[]
}

/**
 * Run the full meeting analysis pipeline for a single meeting.
 *
 * @param supabaseClient  Service-role Supabase client
 * @param meetingId       UUID of the meeting row
 * @param orgId           UUID of the owning organisation
 * @param userId          UUID of the meeting owner (for cost tracking)
 * @param options.force   Re-run even if basic analysis already exists
 */
export async function runFullMeetingAnalysisPipeline(
  supabaseClient: any,
  meetingId: string,
  orgId: string,
  userId: string,
  options?: { force?: boolean }
): Promise<PipelineResult> {
  const result: PipelineResult = {
    basicAnalysis: false,
    structuredSummary: false,
    scorecard: false,
    indexQueued: false,
    totalCreditsUsed: 0,
    errors: [],
  }

  // ------------------------------------------------------------------
  // 1. Fetch meeting record
  // ------------------------------------------------------------------
  const { data: meeting, error: meetingError } = await supabaseClient
    .from('meetings')
    .select('id, title, meeting_start, transcript_text, owner_user_id, sentiment_score, org_id')
    .eq('id', meetingId)
    .maybeSingle()

  if (meetingError) {
    result.errors.push(`Failed to fetch meeting: ${meetingError.message}`)
    console.error(`[Pipeline] Failed to fetch meeting ${meetingId}:`, meetingError.message)
    return result
  }

  if (!meeting) {
    result.errors.push(`Meeting not found: ${meetingId}`)
    return result
  }

  if (!meeting.transcript_text) {
    result.errors.push('No transcript available — skipping pipeline')
    console.log(`[Pipeline] Meeting ${meetingId} has no transcript yet — skipping pipeline`)
    return result
  }

  // ------------------------------------------------------------------
  // 2. Basic analysis (idempotent: skip if already done, unless force)
  // ------------------------------------------------------------------
  const alreadyAnalysed = meeting.sentiment_score !== null
  if (alreadyAnalysed && !options?.force) {
    console.log(`[Pipeline] Meeting ${meetingId} already has basic analysis — skipping (use force to override)`)
    result.basicAnalysis = true
  } else {
    try {
      const creditCheck = await checkCreditBalance(supabaseClient, orgId)
      if (!creditCheck.allowed) {
        result.errors.push('Basic analysis blocked: insufficient credits')
        console.warn(`[Pipeline] Meeting ${meetingId} basic analysis blocked — credits exhausted`)
      } else {
        await analyzeTranscriptWithClaude(
          meeting.transcript_text,
          {
            id: meeting.id,
            title: meeting.title,
            meeting_start: meeting.meeting_start,
            owner_email: null,
          },
          supabaseClient,
          userId,
          orgId
        )
        result.basicAnalysis = true
        console.log(`[Pipeline] Meeting ${meetingId} basic analysis complete`)
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e)
      result.errors.push(`Basic analysis failed: ${msg}`)
      console.error(`[Pipeline] Meeting ${meetingId} basic analysis error:`, msg)
    }
  }

  // ------------------------------------------------------------------
  // 3. Structured summary (independent credit check)
  // ------------------------------------------------------------------
  try {
    const creditCheck = await checkCreditBalance(supabaseClient, orgId)
    if (!creditCheck.allowed) {
      result.errors.push('Structured summary blocked: insufficient credits')
    } else {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      const resp = await fetch(`${supabaseUrl}/functions/v1/meeting-process-structured-summary`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meetingId,
          forceReprocess: options?.force ?? false,
        }),
      })
      result.structuredSummary = resp.ok
      if (!resp.ok) {
        const body = await resp.text().catch(() => '')
        result.errors.push(`Structured summary HTTP ${resp.status}: ${body.substring(0, 200)}`)
        console.error(`[Pipeline] Meeting ${meetingId} structured summary failed (${resp.status}):`, body.substring(0, 200))
      } else {
        console.log(`[Pipeline] Meeting ${meetingId} structured summary complete`)
      }
    }
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    result.errors.push(`Structured summary failed: ${msg}`)
    console.error(`[Pipeline] Meeting ${meetingId} structured summary error:`, msg)
  }

  // ------------------------------------------------------------------
  // 4. Scorecard (independent credit check)
  // ------------------------------------------------------------------
  try {
    const creditCheck = await checkCreditBalance(supabaseClient, orgId)
    if (!creditCheck.allowed) {
      result.errors.push('Scorecard blocked: insufficient credits')
    } else {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      const resp = await fetch(`${supabaseUrl}/functions/v1/meeting-generate-scorecard`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ meetingId }),
      })
      result.scorecard = resp.ok
      if (!resp.ok) {
        const body = await resp.text().catch(() => '')
        result.errors.push(`Scorecard HTTP ${resp.status}: ${body.substring(0, 200)}`)
        console.error(`[Pipeline] Meeting ${meetingId} scorecard failed (${resp.status}):`, body.substring(0, 200))
      } else {
        console.log(`[Pipeline] Meeting ${meetingId} scorecard complete`)
      }
    }
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    result.errors.push(`Scorecard failed: ${msg}`)
    console.error(`[Pipeline] Meeting ${meetingId} scorecard error:`, msg)
  }

  // ------------------------------------------------------------------
  // 5. Queue for Gemini semantic indexing
  // ------------------------------------------------------------------
  try {
    const { error: queueError } = await supabaseClient
      .from('meeting_index_queue')
      .insert({
        meeting_id: meetingId,
        status: 'pending',
        priority: 0,
        attempts: 0,
        max_attempts: 3,
      })

    if (queueError) {
      // Ignore unique-constraint violations — already queued is fine
      if (!queueError.message.includes('unique') && !queueError.message.includes('duplicate')) {
        result.errors.push(`Index queue failed: ${queueError.message}`)
        console.warn(`[Pipeline] Meeting ${meetingId} index queue error:`, queueError.message)
      } else {
        console.log(`[Pipeline] Meeting ${meetingId} already in index queue — skipping`)
      }
    } else {
      result.indexQueued = true
      console.log(`[Pipeline] Meeting ${meetingId} queued for Gemini indexing`)
    }
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    result.errors.push(`Index queue failed: ${msg}`)
    console.error(`[Pipeline] Meeting ${meetingId} index queue error:`, msg)
  }

  console.log(`[Pipeline] Meeting ${meetingId} pipeline complete:`, JSON.stringify(result))
  return result
}
