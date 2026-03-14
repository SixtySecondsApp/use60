import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

// ===== Types =====
type HeyReachEventType =
  | 'connection_request_sent'
  | 'connection_request_accepted'
  | 'message_sent'
  | 'message_reply_received'
  | 'inmail_sent'
  | 'inmail_reply_received'
  | 'follow_sent'
  | 'liked_post'
  | 'viewed_profile'
  | 'lead_tag_updated'

// Map webhook event names to our internal trigger types for ops rules
const EVENT_TO_TRIGGER: Record<string, string> = {
  connection_request_sent: 'heyreach_connection_sent',
  connection_request_accepted: 'heyreach_connection_accepted',
  message_sent: 'heyreach_message_sent',
  message_reply_received: 'heyreach_reply_received',
  inmail_sent: 'heyreach_inmail_sent',
  inmail_reply_received: 'heyreach_inmail_reply_received',
  follow_sent: 'heyreach_follow_sent',
  liked_post: 'heyreach_liked_post',
  viewed_profile: 'heyreach_viewed_profile',
  lead_tag_updated: 'heyreach_tag_updated',
}

// Map event types to human-readable status labels
const EVENT_TO_STATUS: Record<string, string> = {
  connection_request_sent: 'Connection Sent',
  connection_request_accepted: 'Connected',
  message_sent: 'Message Sent',
  message_reply_received: 'Replied',
  inmail_sent: 'InMail Sent',
  inmail_reply_received: 'InMail Replied',
  follow_sent: 'Followed',
  liked_post: 'Liked Post',
  viewed_profile: 'Viewed Profile',
  lead_tag_updated: 'Tag Updated',
}

// Rate limiting
const rateBuckets = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 300
const RATE_WINDOW_MS = 60_000

function checkRateLimit(orgId: string): boolean {
  const now = Date.now()
  const bucket = rateBuckets.get(orgId)
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(orgId, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  bucket.count++
  return bucket.count <= RATE_LIMIT
}

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  const cors = getCorsHeaders(req)

  try {
    // Only accept POST
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Auth: validate API key from query param
    const url = new URL(req.url)
    const webhookKey = url.searchParams.get('key')
    if (!webhookKey) {
      return new Response(JSON.stringify({ error: 'Missing webhook key' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const svc = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Look up org by webhook API key
    const { data: integration, error: intError } = await svc
      .from('heyreach_org_integrations')
      .select('org_id, is_active, is_connected')
      .eq('webhook_api_key', webhookKey)
      .maybeSingle()

    if (intError || !integration) {
      return new Response(JSON.stringify({ error: 'Invalid webhook key' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    if (!integration.is_active || !integration.is_connected) {
      return new Response(JSON.stringify({ error: 'Integration inactive' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const orgId = integration.org_id

    // Rate limit
    if (!checkRateLimit(orgId)) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Parse payload
    let payload: any
    try {
      const rawBody = await req.text()
      payload = rawBody ? JSON.parse(rawBody) : {}
    } catch (e: any) {
      return new Response(JSON.stringify({ error: `Invalid JSON: ${e.message}` }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[heyreach-webhook] Event received for org ${orgId}:`, JSON.stringify(payload).slice(0, 500))

    // Extract event info — HeyReach webhook payloads vary, normalize
    const eventType: string = payload.event_type || payload.eventType || payload.type || 'unknown'
    const leadData = payload.lead || payload.contact || payload
    const linkedinUrl: string | null = leadData.linkedin_url || leadData.linkedinUrl || leadData.profileUrl || leadData.professional_url || null
    const email: string | null = leadData.email || null
    const firstName: string | null = leadData.first_name || leadData.firstName || null
    const lastName: string | null = leadData.last_name || leadData.lastName || null
    const campaignId: string | null = payload.campaign_id || payload.campaignId || null
    const messagePreview: string | null = payload.message || payload.messageText || null

    // Update last_webhook_received_at
    await svc
      .from('heyreach_org_integrations')
      .update({ last_webhook_received_at: new Date().toISOString() })
      .eq('org_id', orgId)

    // Find linked campaign tables
    const campaignFilter = campaignId
      ? svc.from('heyreach_campaign_links').select('id, table_id, campaign_id, field_mapping, auto_sync_engagement').eq('org_id', orgId).eq('campaign_id', campaignId)
      : svc.from('heyreach_campaign_links').select('id, table_id, campaign_id, field_mapping, auto_sync_engagement').eq('org_id', orgId)

    const { data: links } = await campaignFilter

    // Try to match to existing rows in linked tables
    let matchedRows = 0
    for (const link of (links || [])) {
      if (!link.auto_sync_engagement) continue

      let matchedRowId: string | null = null

      // Try matching by LinkedIn URL first
      if (linkedinUrl) {
        const { data: rows } = await svc
          .from('dynamic_table_cells')
          .select('row_id, value')
          .eq('value', linkedinUrl)
          .limit(1)

        if (rows?.length) {
          // Verify this row belongs to the linked table
          const { data: row } = await svc
            .from('dynamic_table_rows')
            .select('id')
            .eq('id', rows[0].row_id)
            .eq('table_id', link.table_id)
            .maybeSingle()

          if (row) matchedRowId = row.id
        }
      }

      // Fallback: match by email
      if (!matchedRowId && email) {
        const { data: rows } = await svc
          .from('dynamic_table_cells')
          .select('row_id, value')
          .eq('value', email)
          .limit(1)

        if (rows?.length) {
          const { data: row } = await svc
            .from('dynamic_table_rows')
            .select('id')
            .eq('id', rows[0].row_id)
            .eq('table_id', link.table_id)
            .maybeSingle()

          if (row) matchedRowId = row.id
        }
      }

      if (!matchedRowId) continue
      matchedRows++

      // Get table columns to find or create engagement columns
      const { data: columns } = await svc
        .from('dynamic_table_columns')
        .select('id, key, column_type, label')
        .eq('table_id', link.table_id)

      const columnMap = new Map((columns || []).map(c => [c.key, c]))

      // Auto-create engagement columns if missing
      const engagementColumns = [
        { key: 'heyreach_status', name: 'HeyReach Status', type: 'text' },
        { key: 'heyreach_connection_status', name: 'Connection Status', type: 'text' },
        { key: 'heyreach_reply_count', name: 'Reply Count', type: 'number' },
        { key: 'heyreach_message_count', name: 'Messages Sent', type: 'number' },
        { key: 'heyreach_last_activity', name: 'Last LinkedIn Activity', type: 'date' },
        { key: 'heyreach_last_activity_type', name: 'Last Activity Type', type: 'text' },
      ]

      // Get max position for new columns
      const maxPosition = (columns || []).reduce((max, c: any) => Math.max(max, c.position || 0), 0)
      let newPosition = maxPosition + 1

      for (const col of engagementColumns) {
        if (!columnMap.has(col.key)) {
          const { data: newCol } = await svc
            .from('dynamic_table_columns')
            .insert({
              table_id: link.table_id,
              key: col.key,
              label: col.name,
              column_type: col.type,
              is_visible: true,
              position: newPosition++,
            })
            .select('id, key')
            .single()

          if (newCol) columnMap.set(newCol.key, newCol)
        }
      }

      // Update cells based on event type
      const now = new Date().toISOString()
      const cellUpdates: { column_key: string; value: string }[] = [
        { column_key: 'heyreach_status', value: EVENT_TO_STATUS[eventType] || eventType },
        { column_key: 'heyreach_last_activity', value: now },
        { column_key: 'heyreach_last_activity_type', value: eventType },
      ]

      // Event-specific updates
      if (eventType === 'connection_request_sent') {
        cellUpdates.push({ column_key: 'heyreach_connection_status', value: 'pending' })
      } else if (eventType === 'connection_request_accepted') {
        cellUpdates.push({ column_key: 'heyreach_connection_status', value: 'accepted' })
      } else if (eventType === 'message_reply_received' || eventType === 'inmail_reply_received') {
        // Increment reply count
        const replyCol = columnMap.get('heyreach_reply_count')
        if (replyCol) {
          const { data: existingCell } = await svc
            .from('dynamic_table_cells')
            .select('value')
            .eq('row_id', matchedRowId)
            .eq('column_id', replyCol.id)
            .maybeSingle()

          const currentCount = parseInt(existingCell?.value || '0', 10)
          cellUpdates.push({ column_key: 'heyreach_reply_count', value: String(currentCount + 1) })
        }
      } else if (eventType === 'message_sent' || eventType === 'inmail_sent') {
        const msgCol = columnMap.get('heyreach_message_count')
        if (msgCol) {
          const { data: existingCell } = await svc
            .from('dynamic_table_cells')
            .select('value')
            .eq('row_id', matchedRowId)
            .eq('column_id', msgCol.id)
            .maybeSingle()

          const currentCount = parseInt(existingCell?.value || '0', 10)
          cellUpdates.push({ column_key: 'heyreach_message_count', value: String(currentCount + 1) })
        }
      }

      // Upsert cells
      for (const update of cellUpdates) {
        const col = columnMap.get(update.column_key)
        if (!col) continue

        await svc
          .from('dynamic_table_cells')
          .upsert({
            row_id: matchedRowId,
            column_id: col.id,
            value: update.value,
            updated_at: now,
          }, { onConflict: 'row_id,column_id' })
      }

      // Evaluate matching ops rules for this event
      const triggerType = EVENT_TO_TRIGGER[eventType]
      if (triggerType) {
        const { data: rules } = await svc
          .from('ops_rules')
          .select('id, action_type, action_config, condition')
          .eq('table_id', link.table_id)
          .eq('trigger_type', triggerType)
          .eq('is_enabled', true)

        for (const rule of (rules || [])) {
          console.log(`[heyreach-webhook] Firing ops rule ${rule.id} (${rule.action_type}) for event ${eventType}`)

          // Fire-and-forget: invoke evaluate-ops-rule without awaiting
          fetch(`${supabaseUrl}/functions/v1/evaluate-ops-rule`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              rule_id: rule.id,
              row_id: matchedRowId,
              trigger_type: triggerType,
            }),
          }).catch(err => console.error(`[heyreach-webhook] evaluate-ops-rule error for rule ${rule.id}:`, err.message))
        }
      }
    }

    // Log to heyreach_sync_history
    await svc.from('heyreach_sync_history').insert({
      org_id: orgId,
      campaign_id: campaignId,
      table_id: links?.[0]?.table_id || null,
      sync_type: 'webhook_event',
      rows_processed: 1,
      rows_succeeded: matchedRows > 0 ? 1 : 0,
      rows_failed: matchedRows === 0 ? 1 : 0,
      metadata: {
        event_type: eventType,
        linkedin_url: linkedinUrl,
        email,
        matched: matchedRows > 0,
        message_preview: messagePreview?.slice(0, 200),
      },
    })

    // Log to integration_sync_logs
    await svc.from('integration_sync_logs').insert({
      org_id: orgId,
      integration_name: 'heyreach',
      operation: 'webhook',
      direction: 'inbound',
      entity_type: 'lead',
      entity_id: linkedinUrl || email,
      entity_name: [firstName, lastName].filter(Boolean).join(' ') || null,
      status: matchedRows > 0 ? 'success' : 'skipped',
      metadata: { event_type: eventType, campaign_id: campaignId, matched_rows: matchedRows },
    })

    return new Response(JSON.stringify({ success: true, matched_rows: matchedRows }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('[heyreach-webhook] Unhandled error:', e)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 200, // Return 200 even on error to prevent HeyReach from retrying unnecessarily
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})
