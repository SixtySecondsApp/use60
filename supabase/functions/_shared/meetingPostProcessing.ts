/**
 * Meeting Post-Processing Utilities
 *
 * Extracted from fathom-sync/services/transcriptService.ts
 * for use by the unified meetingWriter and all adapters.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

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
    console.log(`[meetingPostProcessing] Meeting ${meetingId} queued for indexing`)
  } catch (indexQueueError) {
    console.warn(`[meetingPostProcessing] Failed to queue meeting for indexing:`, indexQueueError instanceof Error ? indexQueueError.message : String(indexQueueError))
  }
}

/**
 * Condense a meeting summary into one-liners via edge function.
 * Non-blocking, fire-and-forget operation.
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
      console.warn(`[meetingPostProcessing] Condense summary failed: ${errorText}`)
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
      console.log(`[meetingPostProcessing] Condensed summary saved for meeting ${meetingId}`)
    }
  } catch (error) {
    // Non-fatal - don't throw
    console.warn(`[meetingPostProcessing] Error condensing summary:`, error instanceof Error ? error.message : String(error))
  }
}
