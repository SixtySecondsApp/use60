/**
 * Transcript Service
 *
 * Handles transcript fetching, AI analysis, and summary condensation
 * for Fathom meeting recordings.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { calculateTranscriptFetchCooldownMinutes } from './helpers.ts'
import { fetchTranscriptFromFathom, fetchSummaryFromFathom } from '../../_shared/fathomTranscript.ts'
import { analyzeTranscriptWithClaude, deduplicateActionItems, type TranscriptAnalysis } from '../aiAnalysis.ts'

/**
 * Condense a meeting summary into one-liners via edge function
 * Non-blocking, fire-and-forget operation
 */
export async function condenseMeetingSummary(
  supabase: SupabaseClient,
  meetingId: string,
  summary: string,
  title: string
): Promise<void> {
  try {
    const functionUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/condense-meeting-summary`

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary,
        meetingTitle: title,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.warn(`[transcript-service] Condense summary failed: ${errorText}`)
      return
    }

    const data = await response.json()

    if (data.success && data.meeting_about && data.next_steps) {
      await supabase
        .from('meetings')
        .update({
          summary_oneliner: data.meeting_about,
          next_steps_oneliner: data.next_steps,
        })
        .eq('id', meetingId)
      console.log(`[transcript-service] Condensed summary saved for meeting ${meetingId}`)
    }
  } catch (error) {
    // Non-fatal - don't throw
    console.warn(`[transcript-service] Error condensing summary:`, error instanceof Error ? error.message : String(error))
  }
}

/**
 * Queue a meeting for AI search indexing
 */
export async function queueMeetingForIndexing(
  supabase: SupabaseClient,
  meetingId: string,
  userId: string
): Promise<void> {
  try {
    await supabase
      .from('meeting_index_queue')
      .upsert({
        meeting_id: meetingId,
        user_id: userId,
        priority: 0,
      }, { onConflict: 'meeting_id' })
    console.log(`✅ Meeting ${meetingId} queued for indexing`)
  } catch (indexQueueError) {
    console.warn(`⚠️  Failed to queue meeting for indexing:`, indexQueueError instanceof Error ? indexQueueError.message : String(indexQueueError))
  }
}

/**
 * Store AI-generated action items from transcript analysis
 */
export async function storeAIActionItems(
  supabase: SupabaseClient,
  meetingId: string,
  aiActionItems: any[],
  existingFathomActionItems: any[]
): Promise<number> {
  // Deduplicate AI action items against Fathom's
  const uniqueAIActionItems = deduplicateActionItems(aiActionItems, existingFathomActionItems)

  if (uniqueAIActionItems.length === 0) {
    return 0
  }

  let storedCount = 0
  for (const item of uniqueAIActionItems) {
    const { error } = await supabase
      .from('meeting_action_items')
      .insert({
        meeting_id: meetingId,
        title: item.title,
        priority: item.priority,
        category: item.category,
        assignee_name: item.assignedTo || null,
        assignee_email: item.assignedToEmail || null,
        deadline_at: item.deadline ? new Date(item.deadline).toISOString() : null,
        ai_generated: true,
        ai_confidence: item.confidence,
        needs_review: item.confidence < 0.8,
        completed: false,
        synced_to_task: false,
        task_id: null,
        timestamp_seconds: null,
        playback_url: null,
      })

    if (error) {
      console.error(`[transcriptService] Failed to insert AI action item for meeting ${meetingId}:`, error.code, error.message)
    } else {
      storedCount++
    }
  }

  return storedCount
}

/**
 * Auto-fetch transcript and summary, then analyze with Claude AI
 * Includes smart retry logic for Fathom's async processing
 */
export async function autoFetchTranscriptAndAnalyze(
  supabase: SupabaseClient,
  userId: string,
  integration: any,
  meeting: any,
  call: any
): Promise<void> {
  try {
    // Get recording ID from multiple possible sources
    const recordingId = call.recording_id || call.id || meeting.fathom_recording_id

    if (!recordingId) {
      console.log(`⚠️  No recording ID available for meeting ${meeting.id} - skipping transcript fetch`)
      return
    }

    // Track retry attempts with adaptive backoff
    const fetchAttempts = meeting.transcript_fetch_attempts || 0
    const cooldownMinutes = calculateTranscriptFetchCooldownMinutes(fetchAttempts)

    // Check if we already have transcript AND AI analysis completed
    if (meeting.transcript_text) {
      const hasAIAnalysis = meeting.sentiment_score !== null || meeting.talk_time_rep_pct !== null

      const { data: existingActionItems, error: aiCheckError } = await supabase
        .from('meeting_action_items')
        .select('id')
        .eq('meeting_id', meeting.id)
        .limit(1)

      if (aiCheckError) {
        console.warn(`⚠️  Error checking action items for meeting ${meeting.id}:`, aiCheckError.message)
      }

      if (hasAIAnalysis && existingActionItems && existingActionItems.length > 0) {
        console.log(`✅ Meeting ${meeting.id} already has AI analysis and action items - skipping`)
        return
      }

      if (!hasAIAnalysis) {
        console.log(`🤖 Meeting ${meeting.id} has transcript but missing AI analysis - will run analysis`)
      }
    }

    // Check cooldown for transcript fetch
    if (!meeting.transcript_text && meeting.last_transcript_fetch_at) {
      const lastAttempt = new Date(meeting.last_transcript_fetch_at)
      const now = new Date()
      const minutesSinceLastAttempt = (now.getTime() - lastAttempt.getTime()) / (1000 * 60)

      if (isFinite(minutesSinceLastAttempt) && minutesSinceLastAttempt >= 0 && minutesSinceLastAttempt < cooldownMinutes) {
        const waitMinutes = Math.ceil(cooldownMinutes - minutesSinceLastAttempt)
        console.log(`⏳ Transcript fetch cooldown active for meeting ${meeting.id} - waiting ${waitMinutes} more minutes`)
      }
    }

    // Fetch or use existing transcript
    let transcript: string | null = meeting.transcript_text

    if (!transcript) {
      console.log(`📄 Attempting to fetch transcript for meeting ${meeting.id} (recording ID: ${recordingId}, attempt ${fetchAttempts + 1})`)

      // Update fetch tracking BEFORE attempting fetch
      await supabase
        .from('meetings')
        .update({
          transcript_fetch_attempts: fetchAttempts + 1,
          last_transcript_fetch_at: new Date().toISOString(),
        })
        .eq('id', meeting.id)

      const accessToken = integration.access_token
      transcript = await fetchTranscriptFromFathom(accessToken, String(recordingId))

      if (!transcript) {
        console.log(`ℹ️  Transcript not yet available for meeting ${meeting.id} (recording ID: ${recordingId}) - will retry later`)
        return
      }

      console.log(`✅ Successfully fetched transcript for meeting ${meeting.id} (${transcript.length} characters)`)

      // Fetch enhanced summary
      let summaryData: any = null
      try {
        summaryData = await fetchSummaryFromFathom(accessToken, String(recordingId))
        if (summaryData) {
          console.log(`✅ Successfully fetched enhanced summary for meeting ${meeting.id}`)
        }
      } catch (error) {
        console.error(`⚠️  Failed to fetch enhanced summary for meeting ${meeting.id}:`, error instanceof Error ? error.message : String(error))
      }

      // Store transcript immediately
      await supabase
        .from('meetings')
        .update({
          transcript_text: transcript,
          summary: summaryData?.summary || meeting.summary,
        })
        .eq('id', meeting.id)

      // Queue for AI search indexing
      console.log(`🔍 Queueing meeting ${meeting.id} for AI search indexing`)
      await queueMeetingForIndexing(supabase, meeting.id, meeting.owner_user_id || userId)

      // Condense summary (non-blocking)
      const finalSummary = summaryData?.summary || meeting.summary
      if (finalSummary && finalSummary.length > 0) {
        condenseMeetingSummary(supabase, meeting.id, finalSummary, meeting.title || 'Meeting')
          .catch(() => undefined)
      }
    } else {
      // Existing transcript - ensure queued for indexing
      console.log(`🔍 Queueing existing transcript meeting ${meeting.id} for AI search indexing`)
      await queueMeetingForIndexing(supabase, meeting.id, meeting.owner_user_id || userId)

      // Condense existing summary if not already done
      if (meeting.summary && !meeting.summary_oneliner) {
        condenseMeetingSummary(supabase, meeting.id, meeting.summary, meeting.title || 'Meeting')
          .catch(() => undefined)
      }
    }

    // Run AI analysis on transcript
    if (!transcript || transcript.trim().length === 0) {
      console.log(`⚠️  Skipping AI analysis for meeting ${meeting.id} - no transcript available`)
      return
    }

    console.log(`🤖 Starting AI analysis for meeting ${meeting.id} (transcript length: ${transcript.length} chars)`)

    const meetingOrgId = meeting.org_id || null

    const analysis: TranscriptAnalysis = await analyzeTranscriptWithClaude(
      transcript,
      {
        id: meeting.id,
        title: meeting.title,
        meeting_start: meeting.meeting_start,
        owner_email: meeting.owner_email,
      },
      supabase,
      meeting.owner_user_id || userId,
      meetingOrgId
    )
    console.log(`✅ AI analysis completed for meeting ${meeting.id}`)

    // Build update object with AI metrics
    const updateData: Record<string, any> = {
      talk_time_rep_pct: analysis.talkTime.repPct,
      talk_time_customer_pct: analysis.talkTime.customerPct,
      talk_time_judgement: analysis.talkTime.assessment,
      sentiment_score: analysis.sentiment.score,
      sentiment_reasoning: analysis.sentiment.reasoning,
      coach_rating: analysis.coaching.rating,
      coach_summary: JSON.stringify({
        summary: analysis.coaching.summary,
        strengths: analysis.coaching.strengths,
        improvements: analysis.coaching.improvements,
        evaluationBreakdown: analysis.coaching.evaluationBreakdown,
      }),
    }

    // Add call type classification if available
    if (analysis.callType) {
      updateData.call_type_id = analysis.callType.callTypeId
      updateData.call_type_confidence = analysis.callType.confidence
      updateData.call_type_reasoning = analysis.callType.reasoning
      console.log(`📋 Call type classified: ${analysis.callType.callTypeName} (confidence: ${(analysis.callType.confidence * 100).toFixed(1)}%)`)
    }

    // Update meeting with AI metrics
    const { data: updateResult, error: updateError } = await supabase
      .from('meetings')
      .update(updateData)
      .eq('id', meeting.id)
      .select()

    if (updateError) {
      throw new Error(`Failed to store AI metrics: ${updateError.message}`)
    }

    if (!updateResult || updateResult.length === 0) {
      throw new Error(`Failed to update meeting ${meeting.id} - no rows affected`)
    }

    // Store AI-generated action items
    const existingActionItems = call.action_items || []
    const storedCount = await storeAIActionItems(supabase, meeting.id, analysis.actionItems, existingActionItems)
    if (storedCount > 0) {
      console.log(`✅ Stored ${storedCount} AI-generated action items for meeting ${meeting.id}`)
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const isMissingApiKey = errorMessage.includes('ANTHROPIC_API_KEY')

    console.error(`❌ Error in autoFetchTranscriptAndAnalyze for meeting ${meeting?.id || 'unknown'}:`, errorMessage)

    if (isMissingApiKey) {
      console.error(`🚨 CRITICAL: ANTHROPIC_API_KEY is not configured in edge function environment variables`)
      console.error(`   Please set ANTHROPIC_API_KEY in Supabase Dashboard → Edge Functions → fathom-sync → Settings → Secrets`)
    }

    if (error instanceof Error && error.stack) {
      console.error(`Stack trace:`, error.stack.substring(0, 500))
    }
  }
}
