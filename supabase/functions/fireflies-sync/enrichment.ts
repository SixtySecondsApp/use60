/**
 * Fireflies Meeting Enrichment Module
 *
 * Handles post-sync enrichment for Fireflies meetings:
 * 1. Runs Claude AI analysis (coaching, sentiment, action items)
 * 2. Delegates all DB writes to the shared adapter + writer pipeline
 *    (participants, contacts, action items, CRM linking, indexing)
 * 3. Condenses summary to one-liners (non-blocking)
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { analyzeTranscriptWithClaude, type TranscriptAnalysis } from '../_shared/aiAnalysis.ts'
import { condenseMeetingSummary } from '../fathom-sync/services/transcriptService.ts'
import { adaptFirefliesMeeting, writeMeetingData } from '../_shared/ingestion/index.ts'
import type { FirefliesTranscript } from './index.ts'

interface MeetingRecord {
  id: string
  external_id: string
  title: string
  meeting_start: string
  transcript_text: string
  owner_email: string | null
  org_id: string | null
  owner_user_id: string
  summary: string | null
}

// ─── Orchestrator ─────────────────────────────────────────────────────

/**
 * Enrich a single Fireflies meeting with participants, AI analysis, and action items.
 * Non-fatal: errors are logged but don't prevent the meeting from being synced.
 */
export async function enrichFirefliesMeeting(
  supabase: SupabaseClient,
  meeting: MeetingRecord,
  transcript: FirefliesTranscript,
  userId: string,
  orgId: string | null
): Promise<void> {
  console.log(`[fireflies-enrich] Starting enrichment for meeting ${meeting.id} (${meeting.title})`)

  // 1. Run Claude AI analysis (coaching, sentiment reasoning, enhanced action items)
  let analysis: TranscriptAnalysis | null = null
  try {
    const transcriptText = meeting.transcript_text
    if (!transcriptText || transcriptText.trim().length === 0) {
      console.log(`[fireflies-enrich] No transcript text for meeting ${meeting.id} - skipping AI analysis`)
    } else {
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
      if (!anthropicKey) {
        console.warn(`[fireflies-enrich] ANTHROPIC_API_KEY not configured - skipping AI analysis`)
      } else {
        console.log(`[fireflies-enrich] Running AI analysis for meeting ${meeting.id} (${transcriptText.length} chars)`)
        analysis = await analyzeTranscriptWithClaude(
          transcriptText,
          {
            id: meeting.id,
            title: meeting.title,
            meeting_start: meeting.meeting_start,
            owner_email: meeting.owner_email,
          },
          supabase,
          userId,
          orgId || undefined
        )
        console.log(`[fireflies-enrich] AI analysis completed for meeting ${meeting.id}`)
      }
    }
  } catch (err) {
    console.error(`[fireflies-enrich] AI analysis failed for ${meeting.id}:`,
      err instanceof Error ? `${err.message}\n${err.stack}` : String(err))
  }

  // 2. Build enriched normalized data and write via adapter+writer
  try {
    const enriched = adaptFirefliesMeeting({
      transcript,
      userId,
      orgId,
      ownerEmail: meeting.owner_email,
      aiAnalysis: analysis,
      nativeActionItemTexts: transcript.summary?.action_items,
    })
    const writeResult = await writeMeetingData(supabase, enriched, {
      isUpdate: true,
      companySource: 'fireflies_sync',
    })
    console.log(`[fireflies-enrich] Writer completed for meeting ${meeting.id}: ${writeResult.actionItemsStored ?? 0} action items stored`)
    if (writeResult.errors.length > 0) {
      console.warn(`[fireflies-enrich] Non-fatal write errors for ${meeting.id}:`, writeResult.errors)
    }
  } catch (err) {
    console.error(`[fireflies-enrich] Adapter/writer failed for ${meeting.id}:`,
      err instanceof Error ? `${err.message}\n${err.stack}` : String(err))
  }

  // 3. Condense summary to one-liners (non-blocking)
  if (meeting.summary) {
    condenseMeetingSummary(supabase, meeting.id, meeting.summary, meeting.title || 'Meeting')
      .catch(() => undefined)
  }
}

