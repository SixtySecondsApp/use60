import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'

// ---------------------------------------------------------------------------
// LinkedIn Conversion Trigger
//
// Receives pipeline milestone events and queues conversion events for
// streaming to LinkedIn. Called by:
//   - Deal stage change triggers (via health_recalc_queue or direct)
//   - Meeting lifecycle events
//   - Lead qualification events
//   - Manual trigger from UI
//
// Actions:
//   trigger_milestone  — Queue a conversion event for a specific milestone
//   trigger_deal_won   — Shorthand for closed_won with deal amount
//   scan_recent        — Scan recent pipeline changes and queue any missing events
// ---------------------------------------------------------------------------

type Action = 'trigger_milestone' | 'trigger_deal_won' | 'scan_recent'

interface RequestBody {
  action: Action
  org_id?: string
  milestone_event?: string
  deal_id?: string
  contact_id?: string
  meeting_id?: string
  lead_id?: string
  // scan params
  hours_back?: number
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getContactForDeal(
  client: ReturnType<typeof createClient>,
  dealId: string
): Promise<{ contact_id: string; email: string; first_name: string; last_name: string; company_name: string } | null> {
  const { data } = await client
    .from('deal_contacts')
    .select('contact_id, contacts(id, email, first_name, last_name, company_name)')
    .eq('deal_id', dealId)
    .order('confidence', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data?.contacts) return null
  const c = data.contacts as { id: string; email: string; first_name: string; last_name: string; company_name: string }
  return { contact_id: c.id, email: c.email, first_name: c.first_name, last_name: c.last_name, company_name: c.company_name }
}

async function getContactForMeeting(
  client: ReturnType<typeof createClient>,
  meetingId: string
): Promise<{ contact_id: string; deal_id: string | null } | null> {
  const { data: meeting } = await client
    .from('meetings')
    .select('deal_id')
    .eq('id', meetingId)
    .maybeSingle()

  if (!meeting?.deal_id) return null

  const contact = await getContactForDeal(client, meeting.deal_id)
  if (!contact) return null

  return { contact_id: contact.contact_id, deal_id: meeting.deal_id }
}

async function isLinkedInSourced(
  client: ReturnType<typeof createClient>,
  contactId: string | null,
  leadId: string | null
): Promise<boolean> {
  // Check lead source
  if (leadId) {
    const { data } = await client
      .from('leads')
      .select('utm_source, external_source, source_channel')
      .eq('id', leadId)
      .maybeSingle()
    if (data && (data.utm_source === 'linkedin' || data.external_source === 'linkedin' || data.source_channel?.startsWith('linkedin'))) {
      return true
    }
  }

  // Check contact source
  if (contactId) {
    const { data } = await client
      .from('contacts')
      .select('source')
      .eq('id', contactId)
      .maybeSingle()
    if (data?.source && (data.source === 'linkedin_lead_gen' || data.source.startsWith('linkedin'))) {
      return true
    }
  }

  return false
}

// ---------------------------------------------------------------------------
// Queue conversion event via DB function
// ---------------------------------------------------------------------------

async function queueConversion(
  client: ReturnType<typeof createClient>,
  orgId: string,
  milestone: string,
  refs: { deal_id?: string; contact_id?: string; meeting_id?: string; lead_id?: string }
): Promise<string | null> {
  const { data, error } = await client.rpc('queue_linkedin_conversion_event', {
    p_org_id: orgId,
    p_milestone: milestone,
    p_deal_id: refs.deal_id || null,
    p_contact_id: refs.contact_id || null,
    p_meeting_id: refs.meeting_id || null,
    p_lead_id: refs.lead_id || null,
  })

  if (error) {
    console.error(`[conversion-trigger] Failed to queue ${milestone}:`, error.message)
    return null
  }

  return data as string | null
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  try {
    // Service role or authenticated user
    const authHeader = req.headers.get('Authorization')
    const internalCall = req.headers.get('x-internal-call')
    const cronSecret = req.headers.get('x-cron-secret')
    const isCron = cronSecret === Deno.env.get('CRON_SECRET')
    const isInternal = internalCall === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Auth
    let userId: string | null = null
    if (!isCron && !isInternal) {
      if (!authHeader) return errorResponse('Unauthorized', req, 401)
      const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: { user }, error } = await userClient.auth.getUser()
      if (error || !user) return errorResponse('Unauthorized', req, 401)
      userId = user.id
    }

    const body: RequestBody = await req.json()
    const { action } = body

    switch (action) {
      // ---------------------------------------------------------------
      // TRIGGER MILESTONE
      // ---------------------------------------------------------------
      case 'trigger_milestone': {
        if (!body.org_id || !body.milestone_event) {
          return errorResponse('org_id and milestone_event are required', req, 400)
        }

        const validMilestones = ['qualified_lead', 'meeting_booked', 'meeting_held', 'proposal_sent', 'closed_won']
        if (!validMilestones.includes(body.milestone_event)) {
          return errorResponse(`Invalid milestone. Must be one of: ${validMilestones.join(', ')}`, req, 400)
        }

        // Resolve contact if only deal_id provided
        let contactId = body.contact_id
        if (!contactId && body.deal_id) {
          const contact = await getContactForDeal(serviceClient, body.deal_id)
          contactId = contact?.contact_id
        }

        // Resolve contact/deal if only meeting_id provided
        let dealId = body.deal_id
        if (!contactId && body.meeting_id) {
          const meetingInfo = await getContactForMeeting(serviceClient, body.meeting_id)
          contactId = meetingInfo?.contact_id
          dealId = meetingInfo?.deal_id ?? dealId
        }

        const eventId = await queueConversion(serviceClient, body.org_id, body.milestone_event, {
          deal_id: dealId,
          contact_id: contactId,
          meeting_id: body.meeting_id,
          lead_id: body.lead_id,
        })

        return jsonResponse({
          queued: !!eventId,
          event_id: eventId,
          milestone: body.milestone_event,
        }, req)
      }

      // ---------------------------------------------------------------
      // TRIGGER DEAL WON — Convenience for closed_won with deal amount
      // ---------------------------------------------------------------
      case 'trigger_deal_won': {
        if (!body.deal_id) return errorResponse('deal_id is required', req, 400)

        // Get deal details
        const { data: deal } = await serviceClient
          .from('deals')
          .select('id, clerk_org_id, value, currency')
          .eq('id', body.deal_id)
          .maybeSingle()

        if (!deal) return errorResponse('Deal not found', req, 404)

        const contact = await getContactForDeal(serviceClient, deal.id)

        const eventId = await queueConversion(serviceClient, deal.clerk_org_id, 'closed_won', {
          deal_id: deal.id,
          contact_id: contact?.contact_id,
        })

        // If deal has an amount, update the event value
        if (eventId && deal.value) {
          await serviceClient
            .from('linkedin_conversion_events')
            .update({
              value_amount: deal.value,
              value_currency: deal.currency || 'USD',
            })
            .eq('id', eventId)
        }

        return jsonResponse({
          queued: !!eventId,
          event_id: eventId,
          deal_amount: deal.value,
        }, req)
      }

      // ---------------------------------------------------------------
      // SCAN RECENT — Look for pipeline events that should be conversion events
      // ---------------------------------------------------------------
      case 'scan_recent': {
        if (!body.org_id) return errorResponse('org_id is required', req, 400)
        const hoursBack = body.hours_back ?? 24
        const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString()

        const queued: string[] = []

        // 1. Scan deal stage changes for closed_won
        const { data: wonDeals } = await serviceClient
          .from('deals')
          .select('id, clerk_org_id')
          .eq('clerk_org_id', body.org_id)
          .not('closed_won_date', 'is', null)
          .gte('closed_won_date', since)

        for (const deal of wonDeals ?? []) {
          const contact = await getContactForDeal(serviceClient, deal.id)
          if (contact && await isLinkedInSourced(serviceClient, contact.contact_id, null)) {
            const eventId = await queueConversion(serviceClient, deal.clerk_org_id, 'closed_won', {
              deal_id: deal.id,
              contact_id: contact.contact_id,
            })
            if (eventId) queued.push(eventId)
          }
        }

        // 2. Scan recent meetings for meeting_booked / meeting_held
        const { data: recentMeetings } = await serviceClient
          .from('meetings')
          .select('id, deal_id, owner_user_id, status, created_at, meeting_date')
          .eq('org_id', body.org_id)
          .gte('created_at', since)

        for (const meeting of recentMeetings ?? []) {
          if (!meeting.deal_id) continue
          const contact = await getContactForDeal(serviceClient, meeting.deal_id)
          if (!contact) continue
          if (!await isLinkedInSourced(serviceClient, contact.contact_id, null)) continue

          // meeting_booked
          const bookedId = await queueConversion(serviceClient, body.org_id, 'meeting_booked', {
            deal_id: meeting.deal_id,
            contact_id: contact.contact_id,
            meeting_id: meeting.id,
          })
          if (bookedId) queued.push(bookedId)

          // meeting_held (if status indicates completed)
          if (meeting.status === 'completed' || meeting.status === 'held') {
            const heldId = await queueConversion(serviceClient, body.org_id, 'meeting_held', {
              deal_id: meeting.deal_id,
              contact_id: contact.contact_id,
              meeting_id: meeting.id,
            })
            if (heldId) queued.push(heldId)
          }
        }

        return jsonResponse({
          scanned: true,
          hours_back: hoursBack,
          events_queued: queued.length,
          event_ids: queued,
        }, req)
      }

      default:
        return errorResponse(`Unknown action: ${action}`, req, 400)
    }
  } catch (err) {
    console.error('[linkedin-conversion-trigger]', err)
    return errorResponse(err instanceof Error ? err.message : 'Internal error', req, 500)
  }
})
