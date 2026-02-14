/**
 * Transcript Service
 *
 * Handles transcript fetching, AI analysis, and summary condensation
 * for Fathom meeting recordings.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { calculateTranscriptFetchCooldownMinutes } from './helpers.ts'
import { fetchTranscriptFromFathom, fetchTranscriptStructuredFromFathom, fetchSummaryFromFathom, type TranscriptSegment } from '../../_shared/fathomTranscript.ts'
import { analyzeTranscriptWithClaude, deduplicateActionItems, type TranscriptAnalysis } from '../aiAnalysis.ts'

/**
 * Extract storable summary text from Fathom API response.
 * Fathom may return:
 *   - { summary: "plain text" }
 *   - { summary: { template_name, markdown_formatted } }
 *   - { template_name, markdown_formatted } (summary IS the root object)
 * Returns JSON string for objects (frontend parses), plain string for text, or null.
 */
function extractSummaryText(data: any): string | null {
  if (!data) return null
  // Case 1: data.summary exists
  if (data.summary) {
    if (typeof data.summary === 'string') return data.summary
    if (data.summary.markdown_formatted) return JSON.stringify(data.summary)
  }
  // Case 2: data itself has markdown_formatted (no summary wrapper)
  if (data.markdown_formatted) return JSON.stringify(data)
  // Case 3: data itself is a non-empty string
  if (typeof data === 'string' && data.length > 0) return data
  return null
}

/**
 * Extract human-readable summary text for AI condensation.
 */
function extractReadableSummary(data: any): string | null {
  if (!data) return null
  if (data.summary?.markdown_formatted) return data.summary.markdown_formatted
  if (typeof data.summary === 'string') return data.summary
  if (data.markdown_formatted) return data.markdown_formatted
  if (typeof data === 'string') return data
  return null
}

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
        timestamp_seconds: item.timestampSeconds ?? null,
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
        // Still fetch summary if missing before returning
        if (!meeting.summary) {
          const recordingId = call.recording_id || call.id || meeting.fathom_recording_id
          if (recordingId) {
            console.log(`📋 Meeting ${meeting.id} has transcript+AI but no summary — fetching from Fathom (recording: ${recordingId})`)
            try {
              const summaryData = await fetchSummaryFromFathom(integration.access_token, String(recordingId))
              console.log(`📋 Summary API response for meeting ${meeting.id}:`, JSON.stringify(summaryData)?.substring(0, 500))
              const summaryText = extractSummaryText(summaryData)
              if (summaryText) {
                await supabase
                  .from('meetings')
                  .update({ summary: summaryText })
                  .eq('id', meeting.id)
                console.log(`✅ Summary fetched and stored for meeting ${meeting.id} (${summaryText.length} chars)`)

                const readableSummary = extractReadableSummary(summaryData)
                if (readableSummary) {
                  condenseMeetingSummary(supabase, meeting.id, readableSummary, meeting.title || 'Meeting')
                    .catch(() => undefined)
                }
              } else {
                console.log(`ℹ️  Summary response had no extractable text for meeting ${meeting.id}`)
              }
            } catch (err) {
              console.warn(`⚠️  Failed to fetch summary for meeting ${meeting.id}:`, err instanceof Error ? err.message : String(err))
            }
          }
        }
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
      const structuredResult = await fetchTranscriptStructuredFromFathom(accessToken, String(recordingId))

      if (!structuredResult?.text) {
        console.log(`ℹ️  Transcript not yet available for meeting ${meeting.id} (recording ID: ${recordingId}) - will retry later`)
        return
      }

      transcript = structuredResult.text
      console.log(`✅ Successfully fetched transcript for meeting ${meeting.id} (${transcript.length} characters)`)

      // Enrich participants from transcript speaker emails (non-fatal)
      if (structuredResult.segments.length > 0) {
        try {
          await enrichParticipantsFromTranscriptEmails(
            supabase, meeting.id, structuredResult.segments, meeting.owner_user_id || userId
          )
        } catch (enrichErr) {
          console.warn(`⚠️  Failed to enrich participants from transcript emails:`, enrichErr instanceof Error ? enrichErr.message : String(enrichErr))
        }
      }

      // Fetch enhanced summary
      let summaryData: any = null
      try {
        summaryData = await fetchSummaryFromFathom(accessToken, String(recordingId))
        console.log(`📋 Summary API response for meeting ${meeting.id} (new transcript path):`, JSON.stringify(summaryData)?.substring(0, 500))
      } catch (error) {
        console.error(`⚠️  Failed to fetch enhanced summary for meeting ${meeting.id}:`, error instanceof Error ? error.message : String(error))
      }

      // Extract summary text using shared helper
      const summaryText = extractSummaryText(summaryData)
      if (summaryText) {
        console.log(`✅ Summary extracted for meeting ${meeting.id} (${summaryText.length} chars)`)
      }

      // Store transcript immediately
      await supabase
        .from('meetings')
        .update({
          transcript_text: transcript,
          ...(summaryText ? { summary: summaryText } : {}),
        })
        .eq('id', meeting.id)

      // Queue for AI search indexing
      console.log(`🔍 Queueing meeting ${meeting.id} for AI search indexing`)
      await queueMeetingForIndexing(supabase, meeting.id, meeting.owner_user_id || userId)

      // Condense summary (non-blocking) — use readable text for AI condensation
      const readableSummary = extractReadableSummary(summaryData) || meeting.summary
      if (readableSummary && typeof readableSummary === 'string' && readableSummary.length > 0) {
        condenseMeetingSummary(supabase, meeting.id, readableSummary, meeting.title || 'Meeting')
          .catch(() => undefined)
      }
    } else {
      // Existing transcript - ensure queued for indexing
      console.log(`🔍 Queueing existing transcript meeting ${meeting.id} for AI search indexing`)
      await queueMeetingForIndexing(supabase, meeting.id, meeting.owner_user_id || userId)

      // Fetch summary if missing (transcript exists but summary was not available at first sync)
      if (!meeting.summary) {
        const recordingId = call.recording_id || call.id || meeting.fathom_recording_id
        if (recordingId) {
          console.log(`📋 Meeting ${meeting.id} has transcript but no summary (else path) — fetching from Fathom (recording: ${recordingId})`)
          try {
            const summaryData = await fetchSummaryFromFathom(integration.access_token, String(recordingId))
            console.log(`📋 Summary API response for meeting ${meeting.id} (else path):`, JSON.stringify(summaryData)?.substring(0, 500))
            const summaryText = extractSummaryText(summaryData)
            if (summaryText) {
              await supabase
                .from('meetings')
                .update({ summary: summaryText })
                .eq('id', meeting.id)
              console.log(`✅ Summary fetched and stored for meeting ${meeting.id} (${summaryText.length} chars)`)

              const readableSummary = extractReadableSummary(summaryData)
              if (readableSummary) {
                condenseMeetingSummary(supabase, meeting.id, readableSummary, meeting.title || 'Meeting')
                  .catch(() => undefined)
              }
            } else {
              console.log(`ℹ️  Summary response had no extractable text for meeting ${meeting.id}`)
            }
          } catch (err) {
            console.warn(`⚠️  Failed to fetch summary for meeting ${meeting.id}:`, err instanceof Error ? err.message : String(err))
          }
        }
      } else if (!meeting.summary_oneliner) {
        // Condense existing summary if not already done
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

    // Generate fallback summary from AI analysis if Fathom didn't provide one
    const { data: currentMeeting } = await supabase
      .from('meetings')
      .select('summary')
      .eq('id', meeting.id)
      .single()

    if (!currentMeeting?.summary && analysis.coaching?.summary) {
      console.log(`📝 Generating fallback summary from AI analysis for meeting ${meeting.id}`)
      const fallbackSummary = analysis.coaching.summary
      await supabase
        .from('meetings')
        .update({ summary: fallbackSummary })
        .eq('id', meeting.id)
      console.log(`✅ Fallback summary stored for meeting ${meeting.id} (${fallbackSummary.length} chars)`)

      // Condense the fallback summary
      condenseMeetingSummary(supabase, meeting.id, fallbackSummary, meeting.title || 'Meeting')
        .catch(() => undefined)
    }

    // Trigger orchestrator for post-meeting workflows (fire-and-forget)
    const orchestratorOrgId = meetingOrgId
    if (orchestratorOrgId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      if (supabaseUrl && serviceRoleKey) {
        fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'meeting_ended',
            source: 'edge:fathom-sync',
            org_id: orchestratorOrgId,
            user_id: meeting.owner_user_id || userId,
            payload: {
              meeting_id: meeting.id,
              title: meeting.title,
              transcript_available: true,
            },
            idempotency_key: `meeting_ended:${meeting.id}`,
          }),
        }).catch(err => console.error('[fathom-sync] Orchestrator trigger failed:', err))
        console.log(`🚀 Orchestrator triggered for meeting ${meeting.id} (source: fathom-sync)`)
      }
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

// ── CRM enrichment from transcript speaker emails ──────────────────

/**
 * Extract unique speaker emails from transcript segments
 */
function extractUniqueSpeakerEmails(
  segments: TranscriptSegment[]
): Array<{ name: string; email: string }> {
  const seen = new Set<string>()
  const result: Array<{ name: string; email: string }> = []
  for (const seg of segments) {
    if (seg.speaker_email && !seen.has(seg.speaker_email.toLowerCase())) {
      seen.add(seg.speaker_email.toLowerCase())
      result.push({ name: seg.speaker_name || '', email: seg.speaker_email })
    }
  }
  return result
}

/**
 * Enrich meeting participants with emails discovered in transcript.
 * Conservative: adds unknown speakers as meeting_attendees or links
 * existing contacts via meeting_contacts. Does NOT auto-create contacts.
 */
async function enrichParticipantsFromTranscriptEmails(
  supabase: SupabaseClient,
  meetingId: string,
  segments: TranscriptSegment[],
  userId: string
): Promise<void> {
  const speakerEmails = extractUniqueSpeakerEmails(segments)
  if (speakerEmails.length === 0) return

  console.log(`[transcript-service] Found ${speakerEmails.length} speaker email(s) in transcript for meeting ${meetingId}`)

  for (const speaker of speakerEmails) {
    try {
      // Check if already tracked as meeting_attendee
      const { data: existingAttendee } = await supabase
        .from('meeting_attendees')
        .select('id')
        .eq('meeting_id', meetingId)
        .eq('email', speaker.email)
        .limit(1)
        .maybeSingle()

      if (existingAttendee) continue // Already tracked

      // Check if this email matches an existing contact
      const { data: existingContact } = await supabase
        .from('contacts')
        .select('id')
        .eq('email', speaker.email)
        .eq('owner_id', userId)
        .limit(1)
        .maybeSingle()

      if (existingContact) {
        // Link existing contact to meeting if not already linked
        const { error: linkError } = await supabase
          .from('meeting_contacts')
          .upsert({
            meeting_id: meetingId,
            contact_id: existingContact.id,
            is_primary: false,
            role: 'speaker',
          }, { onConflict: 'meeting_id,contact_id' })

        if (!linkError) {
          console.log(`[transcript-service] Linked existing contact ${speaker.email} to meeting ${meetingId}`)
        }
        continue
      }

      // New speaker not in calendar_invitees or contacts — add as meeting_attendee
      const { error: insertError } = await supabase
        .from('meeting_attendees')
        .insert({
          meeting_id: meetingId,
          name: speaker.name,
          email: speaker.email,
          is_external: true,
          role: 'speaker',
        })

      if (!insertError) {
        console.log(`[transcript-service] Added transcript speaker ${speaker.email} as attendee for meeting ${meetingId}`)
      }
    } catch (err) {
      // Non-fatal per speaker
      console.warn(`[transcript-service] Error enriching speaker ${speaker.email}:`, err instanceof Error ? err.message : String(err))
    }
  }
}
