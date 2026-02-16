/**
 * Action Items Service
 *
 * Handles processing and storing action items from Fathom meetings.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.4"

export interface FathomActionItem {
  description?: string
  title?: string
  recording_timestamp?: string
  recording_playback_url?: string
  playback_url?: string
  completed?: boolean
  user_generated?: boolean
  type?: string
  category?: string
  priority?: string
}

export interface ActionItemInsertResult {
  inserted: number
  skipped: number
  errors: number
}

/**
 * Parse recording timestamp from "HH:MM:SS" format to seconds
 */
function parseTimestampToSeconds(timestamp: string | undefined): number | null {
  if (!timestamp) return null

  const parts = timestamp.split(':')
  if (parts.length !== 3) return null

  const hours = parseInt(parts[0], 10)
  const minutes = parseInt(parts[1], 10)
  const seconds = parseInt(parts[2], 10)

  if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null

  return (hours * 3600) + (minutes * 60) + seconds
}

/**
 * Process and store action items from a Fathom meeting
 *
 * CRITICAL: Sets synced_to_task=false to prevent automatic task creation.
 * Tasks should only be created manually by users.
 */
export async function processActionItems(
  supabase: SupabaseClient,
  meetingId: string,
  actionItems: FathomActionItem[] | null | undefined
): Promise<ActionItemInsertResult> {
  const result: ActionItemInsertResult = {
    inserted: 0,
    skipped: 0,
    errors: 0,
  }

  // Handle various states of action_items
  if (actionItems === null) {
    console.log(`[action-items] Action items not yet available for meeting ${meetingId} (Fathom still processing)`)
    return result
  }

  if (!Array.isArray(actionItems)) {
    console.log(`[action-items] No action items array for meeting ${meetingId}`)
    return result
  }

  if (actionItems.length === 0) {
    console.log(`[action-items] Empty action items array for meeting ${meetingId}`)
    return result
  }

  console.log(`[action-items] Processing ${actionItems.length} action items for meeting ${meetingId}`)

  for (const actionItem of actionItems) {
    try {
      // Parse timestamp
      const timestampSeconds = parseTimestampToSeconds(actionItem.recording_timestamp)

      // Extract fields with fallbacks
      const playbackUrl = actionItem.recording_playback_url || actionItem.playback_url || null
      const title = actionItem.description || actionItem.title || (typeof actionItem === 'string' ? actionItem : 'Untitled Action Item')
      const completed = actionItem.completed || false
      const userGenerated = actionItem.user_generated || false

      // Check if this action item already exists (by title and timestamp to avoid duplicates)
      const { data: existingItem } = await supabase
        .from('meeting_action_items')
        .select('id')
        .eq('meeting_id', meetingId)
        .eq('title', title)
        .eq('timestamp_seconds', timestampSeconds)
        .single()

      if (existingItem) {
        result.skipped++
        continue
      }

      // Insert new action item
      const { error: actionItemError } = await supabase
        .from('meeting_action_items')
        .insert({
          meeting_id: meetingId,
          title: title,
          timestamp_seconds: timestampSeconds,
          category: actionItem.type || actionItem.category || 'action_item',
          priority: actionItem.priority || 'medium',
          ai_generated: !userGenerated, // Inverted: user_generated=false means AI generated
          completed: completed,
          synced_to_task: false, // CRITICAL: Prevent automatic task creation
          task_id: null, // No task created yet - manual creation only
          playback_url: playbackUrl,
        })

      if (actionItemError) {
        console.error(`[action-items] Failed to insert action item:`, actionItemError.message)
        result.errors++
      } else {
        result.inserted++
      }
    } catch (error) {
      console.error(`[action-items] Error processing action item:`, error instanceof Error ? error.message : String(error))
      result.errors++
    }
  }

  console.log(`[action-items] Processed: ${result.inserted} inserted, ${result.skipped} skipped, ${result.errors} errors`)
  return result
}

/**
 * Fetch action items from Fathom API for a specific recording
 * Used when action items are not included in the bulk meetings response
 */
export async function fetchRecordingActionItems(
  apiKey: string,
  recordingId: string | number
): Promise<FathomActionItem[] | null> {
  const url = `https://api.fathom.ai/external/v1/recordings/${recordingId}`

  // Try with Authorization: Bearer header first
  let resp = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })

  // Fallback to X-Api-Key header
  if (!resp.ok) {
    resp = await fetch(url, {
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
    })

    if (!resp.ok) {
      return null
    }
  }

  const data = await resp.json().catch(() => null)
  if (!data) return null

  if (data?.action_items && Array.isArray(data.action_items)) {
    return data.action_items
  }

  return null
}
