import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'
import { matchOrCreateContact } from './matching.ts'
import { scoreLinkedInLead, routeToOwner } from './scoring.ts'
import { generateLinkedInLeadDraft } from './drafting.ts'
import { createLeadTaskPackage } from './tasks.ts'
import { sendLeadNotification } from './notification.ts'

/**
 * LinkedIn Lead Ingest Orchestrator
 *
 * Pipeline: normalize → match → enrich → score → route → draft → tasks → notify
 *
 * Each step is fault-tolerant: failure in enrichment/scoring/drafting
 * does NOT block contact creation or notification.
 *
 * Called by webhook-linkedin (fire-and-forget) with service role auth.
 */

interface IngestRequest {
  lead: {
    notification_id: string
    lead_type: 'ad_form' | 'event_form'
    form_id: string
    submitted_at: string
    is_test: boolean
    campaign_name: string | null
    event_name: string | null
    ad_account_name: string | null
    associated_entity: string
    submitter_urn: string
    fields: Record<string, string>
    custom_fields: Record<string, string>
    raw_payload: Record<string, unknown>
  }
  lead_source_id: string
  org_id: string
  sync_run_id: string | null
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req)
  if (corsPreflightResponse) return corsPreflightResponse
  const corsHeaders = getCorsHeaders(req)

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const startTime = Date.now()

  try {
    const body: IngestRequest = await req.json()
    const { lead, lead_source_id, org_id, sync_run_id } = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    // Skip test leads in production
    if (lead.is_test && Deno.env.get('ENVIRONMENT') === 'production') {
      console.log(`[linkedin-lead-ingest] Skipping test lead ${lead.notification_id}`)
      await updateSyncRun(supabase, sync_run_id, { leads_duplicate: 1 })
      return jsonResponse({ status: 'skipped', reason: 'test_lead' }, corsHeaders)
    }

    const results: Record<string, unknown> = { notification_id: lead.notification_id }

    // Step 1: Route to owner
    let ownerId: string | null = null
    try {
      const routing = await routeToOwner(supabase, org_id, lead_source_id, lead.campaign_name)
      ownerId = routing.owner_id
      results.routing = routing
    } catch (err) {
      console.error('[linkedin-lead-ingest] Routing failed:', err)
      results.routing_error = err instanceof Error ? err.message : 'Unknown'
    }

    // Step 2: Match or create contact + company
    let matchResult
    try {
      matchResult = await matchOrCreateContact(supabase, lead, org_id, lead_source_id, ownerId)
      results.match = matchResult
    } catch (err) {
      console.error('[linkedin-lead-ingest] Matching failed:', err)
      await updateSyncRun(supabase, sync_run_id, { leads_failed: 1, error: err instanceof Error ? err.message : 'match_failed' })
      return jsonResponse({ status: 'error', step: 'matching', error: err instanceof Error ? err.message : 'Unknown' }, corsHeaders, 500)
    }

    // Step 3: Trigger LinkedIn enrichment (async, fire-and-forget)
    try {
      const enrichUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/enrichment-apify`
      fetch(enrichUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          action: 'linkedin-enrich',
          contact_id: matchResult.contact_id,
          org_id: org_id,
          linkedin_url: lead.fields.linkedin_url || null,
        }),
      }).catch((err) => console.warn('[linkedin-lead-ingest] Enrichment fire-and-forget failed:', err))
      results.enrichment = 'triggered'
    } catch {
      results.enrichment = 'skipped'
    }

    // Step 4: ICP Score
    let scoreResult
    try {
      const email = lead.fields.email || ''
      const domain = email.includes('@') ? email.split('@')[1] : null
      scoreResult = scoreLinkedInLead({
        company_name: lead.fields.company_name || null,
        company_size: lead.fields.company_size || null,
        industry: lead.fields.industry || null,
        job_title: lead.fields.job_title || null,
        domain,
        lead_type: lead.lead_type,
        campaign_name: lead.campaign_name,
        custom_fields: lead.custom_fields,
      })
      results.score = scoreResult
    } catch (err) {
      console.error('[linkedin-lead-ingest] Scoring failed:', err)
      scoreResult = { icp_score: 50, urgency: 'normal' as const, should_create_deal: false, score_breakdown: {} }
      results.score_error = err instanceof Error ? err.message : 'Unknown'
    }

    // Step 5: Create deal if high-fit
    let dealId: string | null = null
    if (scoreResult.should_create_deal && matchResult.company_id) {
      try {
        const { data: newDeal } = await supabase
          .from('deals')
          .insert({
            clerk_org_id: org_id,
            owner_id: ownerId,
            name: `${lead.fields.company_name || 'LinkedIn Lead'} — ${lead.campaign_name || 'Inbound'}`,
            stage: 'lead',
            source: 'linkedin',
            company_id: matchResult.company_id,
          })
          .select('id')
          .maybeSingle()
        dealId = newDeal?.id || null
        results.deal_id = dealId
      } catch (err) {
        console.warn('[linkedin-lead-ingest] Deal creation failed (non-fatal):', err)
      }
    }

    // Step 6: Draft follow-up email
    let draftResult
    try {
      draftResult = await generateLinkedInLeadDraft(
        supabase,
        {
          contact_name: [lead.fields.first_name, lead.fields.last_name].filter(Boolean).join(' ') || 'there',
          contact_title: lead.fields.job_title || null,
          company_name: lead.fields.company_name || null,
          email: lead.fields.email || '',
          lead_type: lead.lead_type,
          campaign_name: lead.campaign_name,
          event_name: lead.event_name,
          form_answers: lead.custom_fields,
          icp_score: scoreResult.icp_score,
          urgency: scoreResult.urgency,
        },
        org_id,
        ownerId
      )
      results.draft = { subject: draftResult.subject, model: draftResult.model_used }
    } catch (err) {
      console.error('[linkedin-lead-ingest] Draft generation failed:', err)
      draftResult = {
        subject: `Following up — ${lead.campaign_name || 'LinkedIn'}`,
        body: `Hi ${lead.fields.first_name || 'there'},\n\nThanks for your interest. Would you be open to a quick call?\n\nBest`,
        model_used: 'error_fallback',
      }
      results.draft_error = err instanceof Error ? err.message : 'Unknown'
    }

    // Step 7: Create task work package
    try {
      const contactName = [lead.fields.first_name, lead.fields.last_name].filter(Boolean).join(' ') || 'LinkedIn Lead'
      const taskResult = await createLeadTaskPackage(supabase, {
        contact_id: matchResult.contact_id,
        company_id: matchResult.company_id,
        deal_id: dealId,
        org_id,
        owner_id: ownerId,
        contact_name: contactName,
        company_name: lead.fields.company_name || null,
        icp_score: scoreResult.icp_score,
        urgency: scoreResult.urgency,
        lead_type: lead.lead_type,
        campaign_name: lead.campaign_name,
        is_new_contact: matchResult.is_new_contact,
        is_new_company: matchResult.is_new_company,
      })
      results.tasks = taskResult
    } catch (err) {
      console.error('[linkedin-lead-ingest] Task creation failed (non-fatal):', err)
      results.tasks_error = err instanceof Error ? err.message : 'Unknown'
    }

    // Step 8: Send Slack notification / command centre item
    try {
      const contactName = [lead.fields.first_name, lead.fields.last_name].filter(Boolean).join(' ') || 'LinkedIn Lead'
      const notificationResult = await sendLeadNotification(supabase, {
        org_id,
        owner_id: ownerId,
        contact_id: matchResult.contact_id,
        contact_name: contactName,
        contact_email: lead.fields.email || null,
        contact_title: lead.fields.job_title || null,
        company_name: lead.fields.company_name || null,
        company_id: matchResult.company_id,
        deal_id: dealId,
        icp_score: scoreResult.icp_score,
        urgency: scoreResult.urgency,
        lead_type: lead.lead_type,
        campaign_name: lead.campaign_name,
        event_name: lead.event_name,
        draft_subject: draftResult.subject,
        draft_body: draftResult.body,
        model_used: draftResult.model_used,
      })
      results.notification = notificationResult
    } catch (err) {
      console.error('[linkedin-lead-ingest] Notification failed (non-fatal):', err)
      results.notification_error = err instanceof Error ? err.message : 'Unknown'
    }

    // Step 9: Update sync run
    const durationMs = Date.now() - startTime
    const syncUpdate = matchResult.is_new_contact
      ? { leads_created: 1, completed_at: new Date().toISOString(), duration_ms: durationMs }
      : { leads_matched: 1, completed_at: new Date().toISOString(), duration_ms: durationMs }
    await updateSyncRun(supabase, sync_run_id, syncUpdate)

    console.log(`[linkedin-lead-ingest] Completed in ${durationMs}ms:`, JSON.stringify(results))

    return jsonResponse({ status: 'success', duration_ms: durationMs, ...results }, corsHeaders)
  } catch (error) {
    console.error('[linkedin-lead-ingest] Unhandled error:', error)
    return jsonResponse(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown' },
      corsHeaders,
      500
    )
  }
})

async function updateSyncRun(
  supabase: ReturnType<typeof createClient>,
  syncRunId: string | null,
  update: Record<string, unknown>
): Promise<void> {
  if (!syncRunId) return
  try {
    // Use RPC or raw update — increment counters
    const { error } = await supabase
      .from('linkedin_sync_runs')
      .update(update)
      .eq('id', syncRunId)
    if (error) console.warn('[linkedin-lead-ingest] Sync run update failed:', error.message)
  } catch {
    // Non-fatal
  }
}

function jsonResponse(data: unknown, corsHeaders: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
