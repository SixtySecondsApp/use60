import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4"
import { captureException } from "../_shared/sentryEdge.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Check if an error is an HTML gateway error (e.g., Cloudflare 500)
 */
function isHtmlGatewayError(error: any): boolean {
  const message = String(error?.message || '')
  return (
    message.includes('<html>') ||
    message.includes('<!DOCTYPE') ||
    message.includes('Internal Server Error') ||
    message.includes('502 Bad Gateway') ||
    message.includes('503 Service Unavailable') ||
    message.includes('504 Gateway Timeout')
  )
}

/**
 * Parse error message for better user feedback
 */
function parseErrorMessage(error: any): string {
  const rawMessage = String(error?.message || error || 'Unknown error')
  if (isHtmlGatewayError(error)) {
    return 'Database temporarily unavailable. Please try again.'
  }
  if (rawMessage.length > 200) {
    return rawMessage.substring(0, 200) + '... (truncated)'
  }
  return rawMessage
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Execute database operation with retry for gateway errors
 */
async function executeWithRetry<T>(
  operation: () => Promise<{ data: T | null; error: any }>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<{ data: T | null; error: any }> {
  let lastError: any = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await operation()

    if (!result.error) {
      return result
    }

    if (isHtmlGatewayError(result.error)) {
      lastError = result.error
      console.warn(
        `[meetings-webhook] Gateway error on attempt ${attempt + 1}/${maxRetries}, retrying...`
      )
      await sleep(initialDelayMs * Math.pow(2, attempt))
      continue
    }

    return result
  }

  return { data: null, error: lastError }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const data = await req.json()
    switch (data.topic) {
      case 'summary':
        return await handleSummary(supabase, data)
      case 'action_items':
        return await handleActionItems(supabase, data)
      case 'transcript':
        return await handleTranscript(supabase, data)
      default:
        throw new Error(`Unknown topic: ${data.topic}`)
    }
  } catch (error) {
    await captureException(error, {
      tags: {
        function: 'meetings-webhook',
        integration: 'fathom',
      },
    });
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

function extractIds(data: any) {
  let shareId = data.shareId || data.share_id
  let callsId = data.callsId || data.calls_id

  // Extract from recording URLs if not provided
  if (!shareId && data.recording?.recording_share_url) {
    const shareMatch = data.recording.recording_share_url.match(/share\/([^\/\?]+)/)
    if (shareMatch) shareId = shareMatch[1]
  }
  if (!callsId && data.recording?.recording_url) {
    const callsMatch = data.recording.recording_url.match(/calls\/(\d+)/)
    if (callsMatch) callsId = callsMatch[1]
  }

  // Extract from playback URL for action items
  if (!shareId && data.action_item?.recording_playback_url) {
    const shareMatch = data.action_item.recording_playback_url.match(/share\/([^\/\?]+)/)
    if (shareMatch) shareId = shareMatch[1]
  }

  // Extract from transcript URL
  if (!shareId && data.transcript_url) {
    const shareMatch = data.transcript_url.match(/share\/([^\/\?]+)/)
    if (shareMatch) shareId = shareMatch[1]
  }

  return { shareId, callsId }
}

function parseTimestamp(timestamp: string): number {
  // Parse "hh:mm:ss" or "mm:ss" format to seconds
  if (!timestamp) return 0
  
  const parts = timestamp.split(':').map(p => parseInt(p))
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }
  return parseInt(timestamp) || 0
}

async function handleSummary(supabase: any, data: any) {
  try {
    const { shareId, callsId } = extractIds(data)
    
    if (!shareId) {
      throw new Error('Missing shareId')
    }

    // Parse external domains
    let externalDomains: string[] = []
    if (data.meeting?.external_domains) {
      if (typeof data.meeting.external_domains === 'number') {
        // If it's just a count, we'll extract domains from invitees
        externalDomains = data.meeting.invitees
          ?.filter((inv: any) => !inv.email.endsWith('@sixtyseconds.video'))
          .map((inv: any) => inv.email.split('@')[1])
          .filter((domain: string, index: number, self: string[]) => self.indexOf(domain) === index)
          || []
      } else if (Array.isArray(data.meeting.external_domains)) {
        externalDomains = data.meeting.external_domains
      }
    }

    // Try to find user by email, but don't fail if not found
    // For test data, we'll just use null which the RLS policies allow
    let userId = null
    if (data.fathom_user?.email) {
      const { data: userData } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', data.fathom_user.email)
        .single()
      
      if (userData) {
        userId = userData.id
      }
    }

    // Resolve org_id (required for multi-tenant uniqueness)
    let orgId: string | null = null
    if (userId) {
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      orgId = membership?.org_id || null
    }
    if (!orgId) {
      throw new Error('Missing org_id for meeting upsert')
    }

    // Create meeting details
    const meetingDetails = {
      shareUrl: data.recording.recording_share_url,
      callsUrl: data.recording.recording_url
    }

    // Upsert meeting with retry for gateway errors
    const { data: meeting, error: meetingError } = await executeWithRetry(() =>
      supabase
        .from('meetings')
        .upsert({
          org_id: orgId,
          fathom_recording_id: shareId,
          title: data.meeting.title,
          share_url: data.recording.recording_share_url,
          calls_url: data.recording.recording_url,
          meeting_start: data.meeting.scheduled_start_time,
          meeting_end: data.meeting.scheduled_end_time,
          duration_minutes: data.recording.recording_duration_in_minutes,
          owner_user_id: userId,
          owner_email: data.fathom_user?.email || 'unknown@example.com',
          team_name: data.fathom_user?.team || 'Sales',
          summary: data.ai_summary,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'org_id,fathom_recording_id'
        })
        .select()
        .single()
    )

    if (meetingError) {
      throw new Error(`Failed to upsert meeting: ${parseErrorMessage(meetingError)}`)
    }

    // Upsert attendees
    if (data.meeting.invitees && meeting) {
      for (const invitee of data.meeting.invitees) {
        const isExternal = !invitee.email.endsWith('@sixtyseconds.video')
        
        await supabase
          .from('meeting_attendees')
          .upsert({
            meeting_id: meeting.id,
            name: invitee.name,
            email: invitee.email,
            is_external: isExternal
          }, {
            onConflict: 'meeting_id,email'
          })
      }
    }

    // Upsert metrics
    if (meeting) {
      await supabase
        .from('meeting_metrics')
        .upsert({
          meeting_id: meeting.id,
          sentiment_score: data.sentiment_score,
          coach_rating: data.coach_rating,
          coach_summary: data.coach_summary,
          talk_time_rep_pct: data.talk_time_rep_pct,
          talk_time_customer_pct: data.talk_time_customer_pct,
          talk_time_judgement: data.talk_time_judgement
        }, {
          onConflict: 'meeting_id'
        })
    }

    return new Response(
      JSON.stringify({ success: true, meetingId: meeting?.id }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    throw error
  }
}

async function handleActionItems(supabase: any, data: any) {
  try {
    const { shareId } = extractIds(data)
    
    if (!shareId) {
      throw new Error('Missing shareId')
    }

    // Get meeting by shareId
    const { data: meeting } = await supabase
      .from('meetings')
      .select('id')
      .eq('fathom_recording_id', shareId)
      .single()

    if (!meeting) {
      throw new Error(`Meeting not found for shareId: ${shareId}`)
    }

    // Parse timestamp
    let timestampSeconds = 0
    if (data.action_item?.recording_timestamp) {
      timestampSeconds = parseTimestamp(data.action_item.recording_timestamp)
    } else if (data.action_item?.recording_playback_url) {
      // Try to extract from URL
      const match = data.action_item.recording_playback_url.match(/timestamp=(\d+)/)
      if (match) {
        timestampSeconds = parseInt(match[1])
      }
    }

    // Calculate deadline
    let deadlineAt = null
    if (data.deadline_days) {
      const deadline = new Date()
      deadline.setDate(deadline.getDate() + data.deadline_days)
      deadlineAt = deadline.toISOString()
    }

    // Insert action item
    const { error: actionError } = await supabase
      .from('meeting_action_items')
      .insert({
        meeting_id: meeting.id,
        title: data.action_item.description,
        assignee_name: data.assignee?.name,
        assignee_email: data.assignee?.email,
        priority: data.priority || 'medium',
        category: data.assignee?.team,
        deadline_at: deadlineAt,
        completed: data.action_item.completed || false,
        ai_generated: data.action_item.ai_generated || false,
        timestamp_seconds: timestampSeconds,
        playback_url: data.action_item.recording_playback_url
      })

    if (actionError) throw actionError

    return new Response(
      JSON.stringify({ success: true }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    throw error
  }
}

async function handleTranscript(supabase: any, data: any) {
  try {
    const { shareId } = extractIds(data)
    
    if (!shareId) {
      throw new Error('Missing shareId')
    }

    // Update meeting with transcript URL
    const { error: updateError } = await supabase
      .from('meetings')
      .update({
        transcript_doc_url: data.transcript_url,
        updated_at: new Date().toISOString()
      })
      .eq('fathom_recording_id', shareId)

    if (updateError) throw updateError

    return new Response(
      JSON.stringify({ success: true }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    throw error
  }
}