import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

/**
 * LinkedIn Lead Reconciliation (polling job)
 *
 * Runs periodically (cron every 15min) to catch missed webhook deliveries.
 * Polls LinkedIn leadFormResponses API for each active org/form,
 * compares against linkedin_sync_runs, and feeds missed leads into the ingest pipeline.
 */

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req)
  if (corsPreflightResponse) return corsPreflightResponse
  const corsHeaders = getCorsHeaders(req)

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const startTime = Date.now()

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    // Get all active LinkedIn integrations with credentials
    const { data: activeIntegrations } = await supabase
      .from('linkedin_org_integrations')
      .select('org_id, last_sync_at')
      .eq('is_active', true)
      .eq('is_connected', true)

    if (!activeIntegrations || activeIntegrations.length === 0) {
      return jsonResponse({ status: 'no_active_integrations' }, corsHeaders)
    }

    const results: Array<{ org_id: string; polled: number; new_leads: number; errors: string[] }> = []

    for (const integration of activeIntegrations) {
      const orgResult = { org_id: integration.org_id, polled: 0, new_leads: 0, errors: [] as string[] }

      try {
        // Get credentials
        const { data: creds } = await supabase
          .from('integration_credentials')
          .select('credentials')
          .eq('organization_id', integration.org_id)
          .eq('provider', 'linkedin')
          .eq('is_active', true)
          .maybeSingle()

        if (!creds?.credentials) {
          orgResult.errors.push('No credentials found')
          results.push(orgResult)
          continue
        }

        const credentials = creds.credentials as Record<string, unknown>
        const accessToken = credentials.access_token as string
        if (!accessToken) {
          orgResult.errors.push('No access token')
          results.push(orgResult)
          continue
        }

        // Check token expiry
        const tokenExpiresAt = credentials.token_expires_at as string
        if (tokenExpiresAt && new Date(tokenExpiresAt) < new Date()) {
          orgResult.errors.push('Access token expired')
          results.push(orgResult)
          continue
        }

        // Get active lead sources for this org
        const { data: leadSources } = await supabase
          .from('linkedin_lead_sources')
          .select('id, form_id, source_type, campaign_name')
          .eq('org_id', integration.org_id)
          .eq('is_active', true)

        if (!leadSources || leadSources.length === 0) {
          results.push(orgResult)
          continue
        }

        // Poll each form for recent leads
        const sinceTimestamp = integration.last_sync_at
          ? new Date(integration.last_sync_at).getTime()
          : Date.now() - 60 * 60 * 1000 // Default: last 1 hour

        for (const source of leadSources) {
          try {
            const leads = await pollLinkedInLeads(accessToken, source.form_id, sinceTimestamp)
            orgResult.polled += leads.length

            for (const lead of leads) {
              // Check if we already processed this lead
              const notificationId = lead.id || `${source.form_id}_${lead.submittedAt}`
              const { data: existing } = await supabase
                .from('linkedin_sync_runs')
                .select('id')
                .eq('notification_id', notificationId)
                .maybeSingle()

              if (existing) continue // Already processed

              // Create sync run and enqueue
              const { data: syncRun } = await supabase
                .from('linkedin_sync_runs')
                .insert({
                  org_id: integration.org_id,
                  run_type: 'poll_reconciliation',
                  notification_id: notificationId,
                  leads_received: 1,
                  started_at: new Date().toISOString(),
                })
                .select('id')
                .single()

              // Enqueue via linkedin-lead-ingest
              const ingestUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/linkedin-lead-ingest`
              await fetch(ingestUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                },
                body: JSON.stringify({
                  lead: normalizePolledLead(lead, source),
                  lead_source_id: source.id,
                  org_id: integration.org_id,
                  sync_run_id: syncRun?.id,
                }),
              })

              orgResult.new_leads++
            }
          } catch (err) {
            orgResult.errors.push(`Form ${source.form_id}: ${err instanceof Error ? err.message : 'Unknown'}`)
          }
        }

        // Update last sync timestamp
        await supabase
          .from('linkedin_org_integrations')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('org_id', integration.org_id)
      } catch (err) {
        orgResult.errors.push(err instanceof Error ? err.message : 'Unknown')
      }

      results.push(orgResult)
    }

    const durationMs = Date.now() - startTime
    const totalNewLeads = results.reduce((sum, r) => sum + r.new_leads, 0)
    console.log(`[linkedin-lead-reconcile] Completed in ${durationMs}ms: ${totalNewLeads} new leads found across ${results.length} orgs`)

    return jsonResponse({ status: 'success', duration_ms: durationMs, orgs: results.length, new_leads: totalNewLeads, results }, corsHeaders)
  } catch (error) {
    console.error('[linkedin-lead-reconcile] Error:', error)
    return jsonResponse({ status: 'error', error: error instanceof Error ? error.message : 'Unknown' }, corsHeaders, 500)
  }
})

async function pollLinkedInLeads(
  accessToken: string,
  formId: string,
  sinceTimestamp: number
): Promise<Array<Record<string, unknown>>> {
  // LinkedIn Lead Sync API: GET leadFormResponses with field projection
  const fields = 'id,submittedAt,leadType,owner,submitter,versionedLeadGenFormUrn,formResponse,associatedEntity,testLead,ownerInfo,associatedEntityInfo,leadMetadataInfo'
  const url = `https://api.linkedin.com/rest/leadFormResponses?q=owner&owner=(sponsoredAccount:urn:li:sponsoredAccount:${formId})&submittedAfter=${sinceTimestamp}&fields=${fields}&count=100`

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202402',
      'X-Restli-Protocol-Version': '2.0.0',
    },
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`LinkedIn API error ${resp.status}: ${errText}`)
  }

  const data = await resp.json()
  return data?.elements || []
}

function normalizePolledLead(
  lead: Record<string, unknown>,
  source: { id: string; form_id: string; source_type: string; campaign_name: string | null }
) {
  const formResponse = lead.formResponse as Record<string, unknown> | undefined
  const fields: Record<string, string> = {}
  const customFields: Record<string, string> = {}

  if (formResponse?.leadFormFields && Array.isArray(formResponse.leadFormFields)) {
    for (const field of formResponse.leadFormFields as Array<{ fieldType: string; value: string }>) {
      const STANDARD_FIELDS: Record<string, string> = {
        FIRST_NAME: 'first_name', LAST_NAME: 'last_name', EMAIL: 'email',
        COMPANY_NAME: 'company_name', JOB_TITLE: 'job_title', PHONE_NUMBER: 'phone',
        COUNTRY: 'country', LINKEDIN_PROFILE_URL: 'linkedin_url',
        COMPANY_SIZE: 'company_size', INDUSTRY: 'industry',
      }
      const mapped = STANDARD_FIELDS[field.fieldType]
      if (mapped) fields[mapped] = field.value
      else customFields[field.fieldType] = field.value
    }
  }

  const leadType = lead.leadType as string
  const ownerInfo = lead.ownerInfo as Record<string, unknown> | undefined
  const entityInfo = lead.associatedEntityInfo as Record<string, unknown> | undefined
  const metadataInfo = lead.leadMetadataInfo as Record<string, unknown> | undefined

  return {
    notification_id: String(lead.id || `poll_${source.form_id}_${lead.submittedAt}`),
    lead_type: leadType === 'EVENTS' ? 'event_form' : 'ad_form',
    form_id: String(lead.versionedLeadGenFormUrn || source.form_id),
    submitted_at: lead.submittedAt ? new Date(Number(lead.submittedAt)).toISOString() : new Date().toISOString(),
    is_test: Boolean(lead.testLead),
    campaign_name: String(metadataInfo?.name || source.campaign_name || ''),
    event_name: leadType === 'EVENTS' ? String(entityInfo?.name || '') : null,
    ad_account_name: String(ownerInfo?.name || ''),
    associated_entity: String(lead.associatedEntity || ''),
    submitter_urn: String(lead.submitter || ''),
    fields,
    custom_fields: customFields,
    raw_payload: lead,
  }
}

function jsonResponse(data: unknown, corsHeaders: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
