import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { HubSpotClient, HubSpotError } from '../_shared/hubspot.ts'

type QueueJob = {
  id: string
  org_id: string
  clerk_org_id: string | null
  job_type:
    | 'sync_contact'
    | 'sync_deal'
    | 'sync_task'
    | 'push_note'
    | 'sync_quote'
    | 'sync_line_item'
    | 'poll_form_submissions'
    | 'ensure_properties'
    | 'sync_custom_object'
  priority: number
  attempts: number
  max_attempts: number
  run_after: string
  payload: any
  dedupe_key: string | null
  created_at: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Helper for logging sync operations to integration_sync_logs table
async function logSyncOperation(
  supabase: any,
  args: {
    orgId: string
    userId?: string | null
    operation: 'sync' | 'create' | 'update' | 'delete' | 'push' | 'pull' | 'webhook' | 'error'
    direction: 'inbound' | 'outbound'
    entityType: string
    entityId?: string | null
    entityName?: string | null
    status?: 'success' | 'failed' | 'skipped'
    errorMessage?: string | null
    metadata?: Record<string, unknown>
    batchId?: string | null
  }
): Promise<void> {
  try {
    await supabase.rpc('log_integration_sync', {
      p_org_id: args.orgId,
      p_user_id: args.userId ?? null,
      p_integration_name: 'hubspot',
      p_operation: args.operation,
      p_direction: args.direction,
      p_entity_type: args.entityType,
      p_entity_id: args.entityId ?? null,
      p_entity_name: args.entityName ?? null,
      p_status: args.status ?? 'success',
      p_error_message: args.errorMessage ?? null,
      p_metadata: args.metadata ?? {},
      p_batch_id: args.batchId ?? null,
    })
  } catch (e) {
    // Non-fatal: log to console but don't fail the sync
    console.error('[hubspot-process-queue] Failed to log sync operation:', e)
  }
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function refreshHubSpotToken(args: {
  clientId: string
  clientSecret: string
  refreshToken: string
}): Promise<{ accessToken: string; refreshToken: string; expiresAtIso: string }> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: args.clientId,
    client_secret: args.clientSecret,
    refresh_token: args.refreshToken,
  })

  const resp = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const text = await resp.text()
  const json = safeJsonParse(text) ?? { raw: text }
  if (!resp.ok) {
    const msg = json?.message || json?.error_description || json?.error || text || 'Token refresh failed'
    throw new Error(String(msg))
  }

  const accessToken = String(json.access_token || '')
  const refreshToken = String(json.refresh_token || args.refreshToken)
  const expiresIn = Number(json.expires_in || 1800)
  const expiresAtIso = new Date(Date.now() + expiresIn * 1000).toISOString()

  if (!accessToken) throw new Error('HubSpot refresh response missing access_token')
  return { accessToken, refreshToken, expiresAtIso }
}

async function getAccessTokenForOrg(supabase: any, orgId: string): Promise<string> {
  const { data: creds, error } = await supabase
    .from('hubspot_org_credentials')
    .select('access_token, refresh_token, token_expires_at')
    .eq('org_id', orgId)
    .single()

  if (error || !creds) throw new Error(`Missing HubSpot credentials for org ${orgId}`)

  const accessToken = String(creds.access_token || '')
  const refreshToken = String(creds.refresh_token || '')
  const expiresAt = new Date(String(creds.token_expires_at || 0)).getTime()

  // Refresh if expiring within 2 minutes
  if (expiresAt && expiresAt - Date.now() > 2 * 60 * 1000) {
    return accessToken
  }

  const clientId = Deno.env.get('HUBSPOT_CLIENT_ID') || ''
  const clientSecret = Deno.env.get('HUBSPOT_CLIENT_SECRET') || ''
  if (!clientId || !clientSecret) throw new Error('Missing HUBSPOT_CLIENT_ID/HUBSPOT_CLIENT_SECRET')
  if (!refreshToken) throw new Error('Missing HubSpot refresh token')

  const refreshed = await refreshHubSpotToken({ clientId, clientSecret, refreshToken })

  await supabase
    .from('hubspot_org_credentials')
    .update({
      access_token: refreshed.accessToken,
      refresh_token: refreshed.refreshToken,
      token_expires_at: refreshed.expiresAtIso,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', orgId)

  return refreshed.accessToken
}

async function ensureProperties(client: HubSpotClient): Promise<void> {
  // Minimal set to support mapping + intelligence writeback.
  const requiredByType: Record<string, Array<{ name: string; label: string; type: string; fieldType: string }>> = {
    contacts: [
      { name: 'sixty_icp_fit_score', label: 'Sixty ICP Fit Score', type: 'number', fieldType: 'number' },
      { name: 'sixty_intent_signals', label: 'Sixty Intent Signals', type: 'string', fieldType: 'textarea' },
      { name: 'sixty_next_steps', label: 'Sixty Next Steps', type: 'string', fieldType: 'textarea' },
      { name: 'sixty_last_meeting_summary', label: 'Sixty Last Meeting Summary', type: 'string', fieldType: 'textarea' },
      { name: 'sixty_relationship_health', label: 'Sixty Relationship Health', type: 'enumeration', fieldType: 'select' },
    ],
    deals: [
      { name: 'sixty_deal_id', label: 'Sixty Deal ID', type: 'string', fieldType: 'text' },
      { name: 'sixty_risk_level', label: 'Sixty Risk Level', type: 'enumeration', fieldType: 'select' },
      { name: 'sixty_momentum_score', label: 'Sixty Momentum Score', type: 'number', fieldType: 'number' },
      { name: 'sixty_next_steps', label: 'Sixty Next Steps', type: 'string', fieldType: 'textarea' },
      { name: 'sixty_health_score', label: 'Sixty Health Score', type: 'number', fieldType: 'number' },
    ],
    tasks: [{ name: 'sixty_task_id', label: 'Sixty Task ID', type: 'string', fieldType: 'text' }],
    quotes: [{ name: 'sixty_quote_id', label: 'Sixty Quote ID', type: 'string', fieldType: 'text' }],
    line_items: [],
  }

  for (const [objectType, required] of Object.entries(requiredByType)) {
    if (required.length === 0) continue

    const existing = await client.request<{ results: Array<{ name: string }> }>({
      method: 'GET',
      path: `/crm/v3/properties/${objectType}`,
      retries: 2,
    })

    const existingNames = new Set((existing?.results || []).map((r) => r.name))

    for (const prop of required) {
      if (existingNames.has(prop.name)) continue

      const body: any = {
        name: prop.name,
        label: prop.label,
        type: prop.type,
        fieldType: prop.fieldType,
        groupName: 'contactinformation',
      }

      if (prop.name === 'sixty_relationship_health') {
        body.type = 'enumeration'
        body.fieldType = 'select'
        body.options = [
          { label: 'Great', value: 'great' },
          { label: 'Good', value: 'good' },
          { label: 'Neutral', value: 'neutral' },
          { label: 'At Risk', value: 'at_risk' },
        ]
      }

      if (prop.name === 'sixty_risk_level') {
        body.type = 'enumeration'
        body.fieldType = 'select'
        body.options = [
          { label: 'Low', value: 'low' },
          { label: 'Medium', value: 'medium' },
          { label: 'High', value: 'high' },
          { label: 'Critical', value: 'critical' },
        ]
      }

      // groupName is required by HubSpot but differs per object; set a safe default per object type
      if (objectType === 'deals') body.groupName = 'deal_information'
      if (objectType === 'tasks') body.groupName = 'task_information'
      if (objectType === 'quotes') body.groupName = 'quote_information'

      await client.request({
        method: 'POST',
        path: `/crm/v3/properties/${objectType}`,
        body,
        retries: 2,
      })
    }
  }
}

async function getOrgMemberUserIds(supabase: any, orgId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('organization_memberships')
    .select('user_id')
    .eq('org_id', orgId)

  if (error) throw new Error(`Failed to list org members: ${error.message}`)
  return (data || []).map((r: any) => String(r.user_id))
}

async function upsertMapping(supabase: any, args: { orgId: string; objectType: string; hubspotId: string; sixtyId?: string | null; sixtyKey?: string | null; hubspotModifiedAt?: string | null }) {
  await supabase
    .from('hubspot_object_mappings')
    .upsert(
      {
        org_id: args.orgId,
        object_type: args.objectType,
        hubspot_id: args.hubspotId,
        sixty_id: args.sixtyId ?? null,
        sixty_key: args.sixtyKey ?? null,
        last_synced_at: new Date().toISOString(),
        last_seen_hubspot_modified_at: args.hubspotModifiedAt ?? null,
      },
      { onConflict: 'org_id,object_type,hubspot_id' }
    )
    .catch(() => {})
}

async function handleSyncContact(params: {
  supabase: any
  client: HubSpotClient
  orgId: string
  payload: any
  connectedByUserId: string | null
}) {
  // Inbound (HubSpot -> Sixty)
  if (params.payload?.hubspot_contact_id) {
    const id = String(params.payload.hubspot_contact_id)
    const hs = await params.client.request<any>({
      method: 'GET',
      path: `/crm/v3/objects/contacts/${encodeURIComponent(id)}`,
      query: { properties: ['email', 'firstname', 'lastname', 'phone', 'company', 'jobtitle', 'hs_lastmodifieddate'].join(',') },
      retries: 2,
    })

    const props = hs?.properties || {}
    const email = props.email ? String(props.email).toLowerCase() : null
    if (!email) return

    // Use org connector user as owner for now (org-wide integration)
    const ownerId = params.connectedByUserId
    if (!ownerId) return

    // Contacts table has unique email; keep existing ownership if already present.
    const { data: existing } = await params.supabase
      .from('contacts')
      .select('id, owner_id, updated_at')
      .eq('email', email)
      .maybeSingle()

    // LWW: if local updated_at is newer than hubspot lastmodifieddate, skip update.
    const hsModified = props.hs_lastmodifieddate ? new Date(String(props.hs_lastmodifieddate)).getTime() : null
    const localUpdated = existing?.updated_at ? new Date(String(existing.updated_at)).getTime() : null
    if (hsModified && localUpdated && localUpdated > hsModified) return

    const upsertBody: any = {
      email,
      first_name: props.firstname ?? null,
      last_name: props.lastname ?? null,
      phone: props.phone ?? null,
      company: props.company ?? null,
      title: props.jobtitle ?? null,
      owner_id: existing?.owner_id ?? ownerId,
      updated_at: new Date().toISOString(),
    }

    const { data: contactRow } = await params.supabase
      .from('contacts')
      .upsert(upsertBody, { onConflict: 'email' })
      .select('id')
      .maybeSingle()

    if (contactRow?.id) {
      await upsertMapping(params.supabase, {
        orgId: params.orgId,
        objectType: 'contact',
        hubspotId: id,
        sixtyId: String(contactRow.id),
        sixtyKey: email,
        hubspotModifiedAt: props.hs_lastmodifieddate ?? null,
      })

      // Log successful inbound contact sync
      const displayName = [props.firstname, props.lastname].filter(Boolean).join(' ') || email
      await logSyncOperation(params.supabase, {
        orgId: params.orgId,
        userId: params.connectedByUserId,
        operation: existing?.id ? 'update' : 'create',
        direction: 'inbound',
        entityType: 'contact',
        entityId: String(contactRow.id),
        entityName: `${displayName} (${email})`,
        metadata: { hubspot_id: id },
      })
    }

    return
  }

  // Outbound (Sixty -> HubSpot)
  if (params.payload?.sixty_contact_id) {
    const contactId = String(params.payload.sixty_contact_id)
    const { data: contact } = await params.supabase
      .from('contacts')
      .select('id, email, first_name, last_name, phone, company, title, updated_at, health_score, engagement_level, last_ai_analysis')
      .eq('id', contactId)
      .maybeSingle()

    if (!contact?.email) return

    // Search by email; if exists, PATCH; else POST.
    const search = await params.client.request<any>({
      method: 'POST',
      path: '/crm/v3/objects/contacts/search',
      body: {
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: String(contact.email).toLowerCase() }] }],
        properties: ['email', 'hs_lastmodifieddate'],
        limit: 1,
      },
      retries: 2,
    })

    const found = search?.results?.[0]
    const properties: any = {
      email: String(contact.email).toLowerCase(),
      firstname: contact.first_name ?? '',
      lastname: contact.last_name ?? '',
      phone: contact.phone ?? '',
      company: contact.company ?? '',
      jobtitle: contact.title ?? '',
    }

    // AI writeback (best-effort, configurable in HubSpot settings later)
    if ((contact as any).health_score != null) properties.sixty_icp_fit_score = Number((contact as any).health_score)
    if ((contact as any).last_ai_analysis) properties.sixty_intent_signals = String((contact as any).last_ai_analysis)
    if ((contact as any).engagement_level) properties.sixty_relationship_health = String((contact as any).engagement_level).toLowerCase()

    if (found?.id) {
      const hsModified = found?.properties?.hs_lastmodifieddate ? new Date(String(found.properties.hs_lastmodifieddate)).getTime() : null
      const localUpdated = contact.updated_at ? new Date(String(contact.updated_at)).getTime() : null
      if (hsModified && localUpdated && hsModified > localUpdated) return

      await params.client.request({
        method: 'PATCH',
        path: `/crm/v3/objects/contacts/${encodeURIComponent(String(found.id))}`,
        body: { properties },
        retries: 2,
      })

      await upsertMapping(params.supabase, {
        orgId: params.orgId,
        objectType: 'contact',
        hubspotId: String(found.id),
        sixtyId: String(contact.id),
        sixtyKey: String(contact.email).toLowerCase(),
        hubspotModifiedAt: found?.properties?.hs_lastmodifieddate ?? null,
      })

      // Log successful outbound contact update
      const displayName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email
      await logSyncOperation(params.supabase, {
        orgId: params.orgId,
        operation: 'update',
        direction: 'outbound',
        entityType: 'contact',
        entityId: String(contact.id),
        entityName: `${displayName} (${contact.email})`,
        metadata: { hubspot_id: String(found.id) },
      })
    } else {
      const created = await params.client.request<any>({
        method: 'POST',
        path: '/crm/v3/objects/contacts',
        body: { properties },
        retries: 2,
      })

      if (created?.id) {
        await upsertMapping(params.supabase, {
          orgId: params.orgId,
          objectType: 'contact',
          hubspotId: String(created.id),
          sixtyId: String(contact.id),
          sixtyKey: String(contact.email).toLowerCase(),
          hubspotModifiedAt: created?.properties?.hs_lastmodifieddate ?? null,
        })

        // Log successful outbound contact creation
        const displayName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email
        await logSyncOperation(params.supabase, {
          orgId: params.orgId,
          operation: 'create',
          direction: 'outbound',
          entityType: 'contact',
          entityId: String(contact.id),
          entityName: `${displayName} (${contact.email})`,
          metadata: { hubspot_id: String(created.id) },
        })
      }
    }
  }
}

async function handleSyncDeal(params: {
  supabase: any
  client: HubSpotClient
  orgId: string
  payload: any
  memberUserIds: string[]
}) {
  const settingsRow = await params.supabase.from('hubspot_settings').select('settings').eq('org_id', params.orgId).maybeSingle()
  const settings = (settingsRow?.data as any)?.settings || {}
  const stageMap: Record<string, string> = settings?.pipelineStageMapping || {}
  const reverseStageMap: Record<string, string> = settings?.sixtyStageToHubspot || {}

  // Inbound: pull HubSpot deal and update Sixty deal by sixty_deal_id property
  if (params.payload?.hubspot_deal_id) {
    const hsId = String(params.payload.hubspot_deal_id)
    const hs = await params.client.request<any>({
      method: 'GET',
      path: `/crm/v3/objects/deals/${encodeURIComponent(hsId)}`,
      query: {
        properties: ['dealname', 'amount', 'dealstage', 'pipeline', 'closedate', 'hs_lastmodifieddate', 'sixty_deal_id'].join(','),
      },
      retries: 2,
    })

    const props = hs?.properties || {}
    const sixtyDealId = props.sixty_deal_id ? String(props.sixty_deal_id) : null
    if (!sixtyDealId) return

    // Load Sixty deal
    const { data: deal } = await params.supabase
      .from('deals')
      .select('id, updated_at, stage_id, name, value, owner_id, company, expected_close_date')
      .eq('id', sixtyDealId)
      .maybeSingle()
    if (!deal?.id) return

    // Ensure deal owner is in org (defense-in-depth)
    if (deal.owner_id && !params.memberUserIds.includes(String(deal.owner_id))) return

    const hsModified = props.hs_lastmodifieddate ? new Date(String(props.hs_lastmodifieddate)).getTime() : null
    const localUpdated = deal.updated_at ? new Date(String(deal.updated_at)).getTime() : null
    if (hsModified && localUpdated && localUpdated > hsModified) return

    const patch: any = {
      name: props.dealname ?? deal.name,
      value: props.amount != null && props.amount !== '' ? Number(props.amount) : deal.value,
      expected_close_date: props.closedate ? new Date(String(props.closedate)).toISOString().split('T')[0] : deal.expected_close_date,
      updated_at: new Date().toISOString(),
    }

    // Stage mapping (HubSpot dealstage -> Sixty stage_id)
    const hsStage = props.dealstage ? String(props.dealstage) : null
    if (hsStage && stageMap[hsStage]) patch.stage_id = stageMap[hsStage]

    await params.supabase.from('deals').update(patch).eq('id', deal.id)

    await upsertMapping(params.supabase, {
      orgId: params.orgId,
      objectType: 'deal',
      hubspotId: hsId,
      sixtyId: String(deal.id),
      sixtyKey: null,
      hubspotModifiedAt: props.hs_lastmodifieddate ?? null,
    })

    // Log successful inbound deal sync
    const dealDisplayName = `${props.dealname || deal.name}${props.amount ? ` $${Number(props.amount).toLocaleString()}` : ''}`
    await logSyncOperation(params.supabase, {
      orgId: params.orgId,
      operation: 'update',
      direction: 'inbound',
      entityType: 'deal',
      entityId: String(deal.id),
      entityName: dealDisplayName,
      metadata: { hubspot_id: hsId },
    })

    return
  }

  // Outbound: push Sixty deal to HubSpot using custom property sixty_deal_id
  if (params.payload?.sixty_deal_id) {
    const dealId = String(params.payload.sixty_deal_id)
    const { data: deal } = await params.supabase
      .from('deals')
      .select('id, name, company, value, expected_close_date, stage_id, owner_id, updated_at, primary_contact_id, risk_level, momentum_score, health_score, next_steps')
      .eq('id', dealId)
      .maybeSingle()

    if (!deal?.id) return
    if (deal.owner_id && !params.memberUserIds.includes(String(deal.owner_id))) return

    // Search by custom property (exact match)
    const search = await params.client.request<any>({
      method: 'POST',
      path: '/crm/v3/objects/deals/search',
      body: {
        filterGroups: [{ filters: [{ propertyName: 'sixty_deal_id', operator: 'EQ', value: String(deal.id) }] }],
        properties: ['hs_lastmodifieddate', 'sixty_deal_id'],
        limit: 1,
      },
      retries: 2,
    })

    const found = search?.results?.[0]
    const properties: any = {
      dealname: deal.name,
      amount: String(deal.value ?? 0),
      sixty_deal_id: String(deal.id),
    }
    if (deal.expected_close_date) properties.closedate = new Date(String(deal.expected_close_date)).getTime()

    // AI/health signals (best-effort)
    if ((deal as any).risk_level) properties.sixty_risk_level = String((deal as any).risk_level).toLowerCase()
    if ((deal as any).momentum_score != null) properties.sixty_momentum_score = Number((deal as any).momentum_score)
    if ((deal as any).health_score != null) properties.sixty_health_score = Number((deal as any).health_score)
    if ((deal as any).next_steps) properties.sixty_next_steps = String((deal as any).next_steps)

    // Reverse stage mapping (Sixty stage_id -> HubSpot dealstage)
    if (deal.stage_id && reverseStageMap[String(deal.stage_id)]) {
      properties.dealstage = reverseStageMap[String(deal.stage_id)]
    }

    if (found?.id) {
      const hsModified = found?.properties?.hs_lastmodifieddate ? new Date(String(found.properties.hs_lastmodifieddate)).getTime() : null
      const localUpdated = deal.updated_at ? new Date(String(deal.updated_at)).getTime() : null
      if (hsModified && localUpdated && hsModified > localUpdated) return

      await params.client.request({
        method: 'PATCH',
        path: `/crm/v3/objects/deals/${encodeURIComponent(String(found.id))}`,
        body: { properties },
        retries: 2,
      })

      await upsertMapping(params.supabase, {
        orgId: params.orgId,
        objectType: 'deal',
        hubspotId: String(found.id),
        sixtyId: String(deal.id),
        hubspotModifiedAt: found?.properties?.hs_lastmodifieddate ?? null,
      })

      // Log successful outbound deal update
      const dealDisplayName = `${deal.name}${deal.value ? ` $${Number(deal.value).toLocaleString()}` : ''}`
      await logSyncOperation(params.supabase, {
        orgId: params.orgId,
        operation: 'update',
        direction: 'outbound',
        entityType: 'deal',
        entityId: String(deal.id),
        entityName: dealDisplayName,
        metadata: { hubspot_id: String(found.id) },
      })
    } else {
      const created = await params.client.request<any>({
        method: 'POST',
        path: '/crm/v3/objects/deals',
        body: { properties },
        retries: 2,
      })

      if (created?.id) {
        await upsertMapping(params.supabase, {
          orgId: params.orgId,
          objectType: 'deal',
          hubspotId: String(created.id),
          sixtyId: String(deal.id),
          hubspotModifiedAt: created?.properties?.hs_lastmodifieddate ?? null,
        })

        // Log successful outbound deal creation
        const dealDisplayName = `${deal.name}${deal.value ? ` $${Number(deal.value).toLocaleString()}` : ''}`
        await logSyncOperation(params.supabase, {
          orgId: params.orgId,
          operation: 'create',
          direction: 'outbound',
          entityType: 'deal',
          entityId: String(deal.id),
          entityName: dealDisplayName,
          metadata: { hubspot_id: String(created.id) },
        })
      }
    }

    // Associate deal to contact if we have a mapping for primary_contact_id
    if (deal.primary_contact_id) {
      const { data: mapping } = await params.supabase
        .from('hubspot_object_mappings')
        .select('hubspot_id')
        .eq('org_id', params.orgId)
        .eq('object_type', 'contact')
        .eq('sixty_id', deal.primary_contact_id)
        .maybeSingle()

      if (mapping?.hubspot_id && (found?.id || undefined)) {
        const dealHsId = String(found?.id || '')
        const contactHsId = String(mapping.hubspot_id)
        if (dealHsId) {
          // v4 default association
          await params.client
            .request({
              method: 'PUT',
              path: `/crm/v4/objects/deals/${encodeURIComponent(dealHsId)}/associations/default/contacts/${encodeURIComponent(contactHsId)}`,
              retries: 2,
            })
            .catch(() => {})
        }
      }
    }
  }
}

async function handleSyncTask(params: {
  supabase: any
  client: HubSpotClient
  orgId: string
  payload: any
  memberUserIds: string[]
}) {
  // Inbound: HubSpot task -> Sixty task (by sixty_task_id if present)
  if (params.payload?.hubspot_task_id) {
    const hsId = String(params.payload.hubspot_task_id)
    const hs = await params.client.request<any>({
      method: 'GET',
      path: `/crm/v3/objects/tasks/${encodeURIComponent(hsId)}`,
      query: { properties: ['hs_task_subject', 'hs_task_body', 'hs_timestamp', 'hs_task_status', 'hs_lastmodifieddate', 'sixty_task_id'].join(',') },
      retries: 2,
    })
    const props = hs?.properties || {}
    const sixtyTaskId = props.sixty_task_id ? String(props.sixty_task_id) : null
    if (!sixtyTaskId) return

    const { data: task } = await params.supabase
      .from('tasks')
      .select('id, assigned_to, updated_at')
      .eq('id', sixtyTaskId)
      .maybeSingle()
    if (!task?.id) return
    if (task.assigned_to && !params.memberUserIds.includes(String(task.assigned_to))) return

    const hsModified = props.hs_lastmodifieddate ? new Date(String(props.hs_lastmodifieddate)).getTime() : null
    const localUpdated = task.updated_at ? new Date(String(task.updated_at)).getTime() : null
    if (hsModified && localUpdated && localUpdated > hsModified) return

    const dueIso = props.hs_timestamp ? new Date(Number(props.hs_timestamp)).toISOString() : null
    const status = props.hs_task_status ? String(props.hs_task_status).toLowerCase() : null
    const completed = status === 'completed'

    await params.supabase
      .from('tasks')
      .update({
        title: props.hs_task_subject ?? undefined,
        description: props.hs_task_body ?? undefined,
        due_date: dueIso,
        completed,
        completed_at: completed ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sixtyTaskId)

    await upsertMapping(params.supabase, {
      orgId: params.orgId,
      objectType: 'task',
      hubspotId: hsId,
      sixtyId: sixtyTaskId,
      hubspotModifiedAt: props.hs_lastmodifieddate ?? null,
    })

    // Log successful inbound task sync
    await logSyncOperation(params.supabase, {
      orgId: params.orgId,
      operation: 'update',
      direction: 'inbound',
      entityType: 'task',
      entityId: sixtyTaskId,
      entityName: props.hs_task_subject || 'Task',
      metadata: { hubspot_id: hsId, status: props.hs_task_status },
    })
    return
  }

  // Outbound: Sixty task -> HubSpot task
  if (params.payload?.sixty_task_id) {
    const taskId = String(params.payload.sixty_task_id)
    const { data: task } = await params.supabase
      .from('tasks')
      .select('id, title, description, due_date, completed, updated_at, assigned_to, deal_id, contact_id')
      .eq('id', taskId)
      .maybeSingle()
    if (!task?.id) return
    if (task.assigned_to && !params.memberUserIds.includes(String(task.assigned_to))) return

    const properties: any = {
      hs_task_subject: task.title,
      hs_task_body: task.description || '',
      sixty_task_id: String(task.id),
    }
    if (task.due_date) properties.hs_timestamp = new Date(String(task.due_date)).getTime()
    if (task.completed) properties.hs_task_status = 'COMPLETED'

    // Search by custom property
    const search = await params.client.request<any>({
      method: 'POST',
      path: '/crm/v3/objects/tasks/search',
      body: {
        filterGroups: [{ filters: [{ propertyName: 'sixty_task_id', operator: 'EQ', value: String(task.id) }] }],
        properties: ['hs_lastmodifieddate', 'sixty_task_id'],
        limit: 1,
      },
      retries: 2,
    })

    const found = search?.results?.[0]
    if (found?.id) {
      const hsModified = found?.properties?.hs_lastmodifieddate ? new Date(String(found.properties.hs_lastmodifieddate)).getTime() : null
      const localUpdated = task.updated_at ? new Date(String(task.updated_at)).getTime() : null
      if (hsModified && localUpdated && hsModified > localUpdated) return

      await params.client.request({
        method: 'PATCH',
        path: `/crm/v3/objects/tasks/${encodeURIComponent(String(found.id))}`,
        body: { properties },
        retries: 2,
      })

      await upsertMapping(params.supabase, {
        orgId: params.orgId,
        objectType: 'task',
        hubspotId: String(found.id),
        sixtyId: String(task.id),
        hubspotModifiedAt: found?.properties?.hs_lastmodifieddate ?? null,
      })

      // Log successful outbound task update
      await logSyncOperation(params.supabase, {
        orgId: params.orgId,
        operation: 'update',
        direction: 'outbound',
        entityType: 'task',
        entityId: String(task.id),
        entityName: task.title || 'Task',
        metadata: { hubspot_id: String(found.id), completed: task.completed },
      })
    } else {
      const created = await params.client.request<any>({
        method: 'POST',
        path: '/crm/v3/objects/tasks',
        body: { properties },
        retries: 2,
      })
      if (created?.id) {
        await upsertMapping(params.supabase, {
          orgId: params.orgId,
          objectType: 'task',
          hubspotId: String(created.id),
          sixtyId: String(task.id),
          hubspotModifiedAt: created?.properties?.hs_lastmodifieddate ?? null,
        })

        // Log successful outbound task creation
        await logSyncOperation(params.supabase, {
          orgId: params.orgId,
          operation: 'create',
          direction: 'outbound',
          entityType: 'task',
          entityId: String(task.id),
          entityName: task.title || 'Task',
          metadata: { hubspot_id: String(created.id), completed: task.completed },
        })
      }
    }

    // Associations (best-effort): task -> contact/deal
    // Requires we already know the hubspot ids for those entities.
    const hsTaskId = String(found?.id || '')
    if (!hsTaskId) return

    if (task.contact_id) {
      const { data: cMap } = await params.supabase
        .from('hubspot_object_mappings')
        .select('hubspot_id')
        .eq('org_id', params.orgId)
        .eq('object_type', 'contact')
        .eq('sixty_id', task.contact_id)
        .maybeSingle()
      if (cMap?.hubspot_id) {
        await params.client
          .request({
            method: 'PUT',
            path: `/crm/v4/objects/tasks/${encodeURIComponent(hsTaskId)}/associations/default/contacts/${encodeURIComponent(String(cMap.hubspot_id))}`,
            retries: 2,
          })
          .catch(() => {})
      }
    }

    if (task.deal_id) {
      const { data: dMap } = await params.supabase
        .from('hubspot_object_mappings')
        .select('hubspot_id')
        .eq('org_id', params.orgId)
        .eq('object_type', 'deal')
        .eq('sixty_id', task.deal_id)
        .maybeSingle()
      if (dMap?.hubspot_id) {
        await params.client
          .request({
            method: 'PUT',
            path: `/crm/v4/objects/tasks/${encodeURIComponent(hsTaskId)}/associations/default/deals/${encodeURIComponent(String(dMap.hubspot_id))}`,
            retries: 2,
          })
          .catch(() => {})
      }
    }
  }
}

async function handlePushNote(params: { supabase: any; client: HubSpotClient; orgId: string; payload: any }) {
  // Create note (append-only) and associate to contact/deal if mappings exist.
  // Supports:
  // - payload.body / payload.note_body
  // - payload.meeting_id (fetch meeting + compose note)
  let body = String(params.payload?.body || params.payload?.note_body || '')

  let derivedContactId: string | null = null
  let derivedDealId: string | null = null

  if (!body && params.payload?.meeting_id) {
    const meetingId = String(params.payload.meeting_id)
    const { data: meeting } = await params.supabase
      .from('meetings')
      .select('id, title, summary, next_steps_oneliner, share_url, meeting_start, primary_contact_id, contact_id')
      .eq('id', meetingId)
      .maybeSingle()

    if (!meeting?.id || !meeting.summary) return

    const title = meeting.title ? String(meeting.title) : 'Meeting'
    const when = meeting.meeting_start ? new Date(String(meeting.meeting_start)).toLocaleString() : ''
    const link = meeting.share_url ? String(meeting.share_url) : ''

    body =
      `<strong>${escapeHtml(title)}</strong>` +
      (when ? `<br/><em>${escapeHtml(when)}</em>` : '') +
      `<br/><br/>` +
      `${escapeHtml(String(meeting.summary))}` +
      (meeting.next_steps_oneliner ? `<br/><br/><strong>Next steps</strong><br/>${escapeHtml(String(meeting.next_steps_oneliner))}` : '') +
      (link ? `<br/><br/><a href="${escapeAttr(link)}">Open recording</a>` : '')

    derivedContactId = meeting.primary_contact_id ? String(meeting.primary_contact_id) : meeting.contact_id ? String(meeting.contact_id) : null
  }

  if (!body) return

  const ts = params.payload?.timestamp ? new Date(String(params.payload.timestamp)).getTime() : Date.now()
  const created = await params.client.request<any>({
    method: 'POST',
    path: '/crm/v3/objects/notes',
    body: { properties: { hs_note_body: body, hs_timestamp: ts } },
    retries: 2,
  })

  const noteId = created?.id ? String(created.id) : null
  if (!noteId) return

  const contactSixtyId = params.payload?.contact_id ? String(params.payload.contact_id) : derivedContactId
  const dealSixtyId = params.payload?.deal_id ? String(params.payload.deal_id) : derivedDealId
  const contactHubspotId = params.payload?.hubspot_contact_id ? String(params.payload.hubspot_contact_id) : null
  const dealHubspotId = params.payload?.hubspot_deal_id ? String(params.payload.hubspot_deal_id) : null

  let cId = contactHubspotId
  if (!cId && contactSixtyId) {
    const { data } = await params.supabase
      .from('hubspot_object_mappings')
      .select('hubspot_id')
      .eq('org_id', params.orgId)
      .eq('object_type', 'contact')
      .eq('sixty_id', contactSixtyId)
      .maybeSingle()
    cId = data?.hubspot_id ? String(data.hubspot_id) : null
  }

  let dId = dealHubspotId
  if (!dId && dealSixtyId) {
    const { data } = await params.supabase
      .from('hubspot_object_mappings')
      .select('hubspot_id')
      .eq('org_id', params.orgId)
      .eq('object_type', 'deal')
      .eq('sixty_id', dealSixtyId)
      .maybeSingle()
    dId = data?.hubspot_id ? String(data.hubspot_id) : null
  }

  if (cId) {
    await params.client
      .request({
        method: 'PUT',
        path: `/crm/v4/objects/notes/${encodeURIComponent(noteId)}/associations/default/contacts/${encodeURIComponent(cId)}`,
        retries: 2,
      })
      .catch(() => {})
  }
  if (dId) {
    await params.client
      .request({
        method: 'PUT',
        path: `/crm/v4/objects/notes/${encodeURIComponent(noteId)}/associations/default/deals/${encodeURIComponent(dId)}`,
        retries: 2,
      })
      .catch(() => {})
  }

  await upsertMapping(params.supabase, { orgId: params.orgId, objectType: 'note', hubspotId: noteId })
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(input: string): string {
  return escapeHtml(input).replace(/`/g, '&#96;')
}

async function handlePollFormSubmissions(params: { supabase: any; client: HubSpotClient; orgId: string; payload: any; connectedByUserId: string | null }) {
  // Read form_ingestion settings - enabled_forms is an array of form IDs
  const { data: settingsRow } = await params.supabase.from('hubspot_settings').select('settings').eq('org_id', params.orgId).maybeSingle()
  const settings = (settingsRow as any)?.settings || (settingsRow as any)?.data?.settings || {}

  // Support both new format (form_ingestion.enabled_forms) and old format (settings.forms)
  let enabledFormIds: string[] = []

  // New format: form_ingestion.enabled_forms is an array of form IDs
  if (settings?.form_ingestion?.enabled_forms && Array.isArray(settings.form_ingestion.enabled_forms)) {
    enabledFormIds = settings.form_ingestion.enabled_forms.filter((id: any) => typeof id === 'string' && id.length > 0)
  }
  // Legacy format: settings.forms is an array of { form_guid, enabled }
  else if (Array.isArray(settings?.forms)) {
    enabledFormIds = settings.forms
      .filter((f: any) => f?.form_guid && (f.enabled ?? true))
      .map((f: any) => String(f.form_guid))
  }

  if (!enabledFormIds.length) {
    console.log('[handlePollFormSubmissions] No enabled forms configured for org:', params.orgId)
    return
  }

  console.log('[handlePollFormSubmissions] Polling', enabledFormIds.length, 'forms for org:', params.orgId)

  // sync cursor stored in hubspot_org_sync_state.cursors.forms[form_guid] = after
  const { data: syncStateRow } = await params.supabase.from('hubspot_org_sync_state').select('cursors').eq('org_id', params.orgId).maybeSingle()
  const cursors = (syncStateRow as any)?.cursors || (syncStateRow as any)?.data?.cursors || {}
  const formCursors = (cursors?.forms && typeof cursors.forms === 'object') ? cursors.forms : {}

  for (const formId of enabledFormIds) {
    const formGuid = String(formId)
    let after = formCursors[formGuid] ? String(formCursors[formGuid]) : null

    console.log('[handlePollFormSubmissions] Fetching submissions for form:', formGuid, 'after:', after)

    // Try the new Marketing API first, fall back to legacy if needed
    let resp: any
    try {
      resp = await params.client.request<any>({
        method: 'GET',
        path: `/marketing/v3/forms/${encodeURIComponent(formGuid)}/submissions`,
        query: { limit: 50, ...(after ? { after } : {}) },
        retries: 2,
      })
    } catch (e: any) {
      // Fall back to legacy endpoint if new one fails
      console.log('[handlePollFormSubmissions] New API failed, trying legacy endpoint:', e.message)
      resp = await params.client.request<any>({
        method: 'GET',
        path: `/form-integrations/v1/submissions/forms/${encodeURIComponent(formGuid)}`,
        query: { limit: 50, ...(after ? { after } : {}) },
        retries: 2,
      })
    }

    const results: any[] = Array.isArray(resp?.results) ? resp.results : []
    console.log('[handlePollFormSubmissions] Form:', formGuid, 'returned', results.length, 'submissions')

    if (!results.length) {
      console.log('[handlePollFormSubmissions] No new submissions for form:', formGuid)
      continue
    }

    for (const submission of results) {
      const conversionId = submission?.conversionId ? String(submission.conversionId) : null
      if (!conversionId) continue

      // Dedupe by external_id mapping
      const { data: existing } = await params.supabase
        .from('leads')
        .select('id')
        .eq('external_source', 'hubspot')
        .eq('external_id', conversionId)
        .maybeSingle()
      if (existing?.id) continue

      const values: Array<{ name: string; value: any }> = Array.isArray(submission?.values) ? submission.values : []
      const getVal = (k: string) => values.find((v) => String(v.name).toLowerCase() === k.toLowerCase())?.value

      const email = getVal('email') ? String(getVal('email')).toLowerCase() : null
      const firstName = getVal('firstname') ? String(getVal('firstname')) : null
      const lastName = getVal('lastname') ? String(getVal('lastname')) : null
      const phone = getVal('phone') ? String(getVal('phone')) : null

      const submittedAtMs = submission?.submittedAt ? Number(submission.submittedAt) : Date.now()
      const submittedAtIso = new Date(submittedAtMs).toISOString()

      const ownerId = params.connectedByUserId
      const leadInsert: any = {
        external_source: 'hubspot',
        external_id: conversionId,
        external_occured_at: submittedAtIso,
        contact_email: email,
        contact_first_name: firstName,
        contact_last_name: lastName,
        contact_name: [firstName, lastName].filter(Boolean).join(' ') || null,
        contact_phone: phone,
        meeting_title: null,
        meeting_url: submission?.pageUrl || null,
        metadata: {
          hubspot_form_guid: formGuid,
          hubspot_values: values,
          page_url: submission?.pageUrl || null,
        },
        owner_id: ownerId,
        priority: 'normal',
        status: 'new',
      }

      const { data: createdLead, error: leadError } = await params.supabase.from('leads').insert(leadInsert).select('id').maybeSingle()
      if (leadError) {
        console.error('[handlePollFormSubmissions] Failed to insert lead:', leadError.message)
      } else if (createdLead?.id) {
        console.log('[handlePollFormSubmissions] Created lead:', createdLead.id, 'from form submission:', conversionId)
        // Log successful form submission ingestion
        await logSyncOperation(params.supabase, {
          orgId: params.orgId,
          userId: params.connectedByUserId,
          operation: 'pull',
          direction: 'inbound',
          entityType: 'form_submission',
          entityId: createdLead.id,
          entityName: email ? `Form: ${email}` : `Form submission ${conversionId}`,
          metadata: { hubspot_form_id: formGuid, conversion_id: conversionId },
        })
      }

      // Auto task follow-up (best effort)
      if (ownerId) {
        await params.supabase
          .from('tasks')
          .insert({
            title: `Follow up: HubSpot form submission`,
            description: email ? `New HubSpot form submission from ${email}` : 'New HubSpot form submission',
            due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            task_type: 'follow_up',
            priority: 'high',
            assigned_to: ownerId,
            created_by: ownerId,
            status: 'todo',
            source: 'hubspot',
            contact_email: email,
          })
          .catch(() => {})
      }

      // track mapping for submission
      await upsertMapping(params.supabase, {
        orgId: params.orgId,
        objectType: 'form_submission',
        hubspotId: conversionId,
        sixtyKey: conversionId,
      })
    }

    // Advance cursor if provided
    const nextAfter = resp?.paging?.next?.after ? String(resp.paging.next.after) : null
    if (nextAfter) {
      formCursors[formGuid] = nextAfter
    }
  }

  // Persist cursors
  const newCursors = { ...(cursors || {}), forms: formCursors }
  await params.supabase.from('hubspot_org_sync_state').update({ cursors: newCursors, updated_at: new Date().toISOString() }).eq('org_id', params.orgId)
}

function mapProposalStatusToHubSpotQuoteStatus(status: string | null): string | null {
  const s = (status || '').toLowerCase().trim()
  if (!s) return null
  if (s.includes('draft')) return 'DRAFT'
  if (s.includes('sent')) return 'APPROVAL_NOT_NEEDED'
  if (s.includes('signed') || s.includes('won')) return 'APPROVAL_APPROVED'
  if (s.includes('lost') || s.includes('rejected')) return 'APPROVAL_REJECTED'
  return null
}

function mapHubSpotQuoteStatusToProposalStatus(status: string | null): string | null {
  const s = (status || '').toUpperCase().trim()
  if (!s) return null
  if (s === 'DRAFT') return 'draft'
  if (s === 'APPROVAL_NOT_NEEDED' || s === 'APPROVAL_PENDING') return 'sent'
  if (s === 'APPROVAL_APPROVED') return 'signed'
  if (s === 'APPROVAL_REJECTED') return 'rejected'
  return null
}

async function handleSyncQuote(params: {
  supabase: any
  client: HubSpotClient
  orgId: string
  payload: any
  memberUserIds: string[]
}) {
  // Inbound: HubSpot quote -> Sixty proposal (via custom property sixty_quote_id)
  if (params.payload?.hubspot_quote_id) {
    const hsId = String(params.payload.hubspot_quote_id)
    const hs = await params.client.request<any>({
      method: 'GET',
      path: `/crm/v3/objects/quotes/${encodeURIComponent(hsId)}`,
      query: { properties: ['hs_title', 'hs_status', 'hs_lastmodifieddate', 'sixty_quote_id'].join(',') },
      retries: 2,
    })
    const props = hs?.properties || {}
    const sixtyId = props.sixty_quote_id ? String(props.sixty_quote_id) : null
    if (!sixtyId) return

    const { data: proposal } = await params.supabase.from('proposals').select('id, status, updated_at').eq('id', sixtyId).maybeSingle()
    if (!proposal?.id) return

    const hsModified = props.hs_lastmodifieddate ? new Date(String(props.hs_lastmodifieddate)).getTime() : null
    const localUpdated = proposal.updated_at ? new Date(String(proposal.updated_at)).getTime() : null
    if (hsModified && localUpdated && localUpdated > hsModified) return

    const mapped = mapHubSpotQuoteStatusToProposalStatus(props.hs_status ? String(props.hs_status) : null)
    if (mapped && mapped !== proposal.status) {
      await params.supabase.from('proposals').update({ status: mapped, updated_at: new Date().toISOString() }).eq('id', proposal.id)
    }

    await upsertMapping(params.supabase, { orgId: params.orgId, objectType: 'quote', hubspotId: hsId, sixtyId })
    return
  }

  // Outbound: Sixty proposal -> HubSpot quote
  if (params.payload?.sixty_proposal_id) {
    const proposalId = String(params.payload.sixty_proposal_id)
    const { data: proposal } = await params.supabase
      .from('proposals')
      .select('id, title, status, updated_at, contact_id, meeting_id')
      .eq('id', proposalId)
      .maybeSingle()
    if (!proposal?.id) return

    // Try to find a related deal to associate (best-effort)
    let sixtyDealId: string | null = null
    let sixtyDealValue: number | null = null
    let sixtyContactId: string | null = proposal.contact_id ? String(proposal.contact_id) : null
    if (!sixtyContactId && proposal.meeting_id) {
      const { data: meeting } = await params.supabase
        .from('meetings')
        .select('primary_contact_id, contact_id')
        .eq('id', proposal.meeting_id)
        .maybeSingle()
      sixtyContactId = meeting?.primary_contact_id ? String(meeting.primary_contact_id) : meeting?.contact_id ? String(meeting.contact_id) : null
    }

    if (sixtyContactId) {
      const { data: deal } = await params.supabase
        .from('deals')
        .select('id, owner_id, updated_at, value')
        .eq('primary_contact_id', sixtyContactId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (deal?.id) {
        if (!deal.owner_id || params.memberUserIds.includes(String(deal.owner_id))) {
          sixtyDealId = String(deal.id)
          sixtyDealValue = deal.value != null ? Number(deal.value) : null
        }
      }
    }

    // Search by sixty_quote_id
    const search = await params.client.request<any>({
      method: 'POST',
      path: '/crm/v3/objects/quotes/search',
      body: {
        filterGroups: [{ filters: [{ propertyName: 'sixty_quote_id', operator: 'EQ', value: String(proposal.id) }] }],
        properties: ['hs_lastmodifieddate', 'sixty_quote_id', 'hs_status'],
        limit: 1,
      },
      retries: 2,
    })

    const found = search?.results?.[0]
    const properties: any = {
      hs_title: proposal.title || 'Proposal',
      sixty_quote_id: String(proposal.id),
    }
    const hsStatus = mapProposalStatusToHubSpotQuoteStatus(proposal.status ? String(proposal.status) : null)
    if (hsStatus) properties.hs_status = hsStatus

    let quoteHsId: string | null = null
    if (found?.id) {
      const hsModified = found?.properties?.hs_lastmodifieddate ? new Date(String(found.properties.hs_lastmodifieddate)).getTime() : null
      const localUpdated = proposal.updated_at ? new Date(String(proposal.updated_at)).getTime() : null
      if (hsModified && localUpdated && hsModified > localUpdated) return

      await params.client.request({
        method: 'PATCH',
        path: `/crm/v3/objects/quotes/${encodeURIComponent(String(found.id))}`,
        body: { properties },
        retries: 2,
      })
      quoteHsId = String(found.id)
    } else {
      const created = await params.client.request<any>({
        method: 'POST',
        path: '/crm/v3/objects/quotes',
        body: { properties },
        retries: 2,
      })
      quoteHsId = created?.id ? String(created.id) : null
    }

    if (!quoteHsId) return

    await upsertMapping(params.supabase, { orgId: params.orgId, objectType: 'quote', hubspotId: quoteHsId, sixtyId: String(proposal.id) })

    // Associate quote to contact/deal if we have mappings
    if (sixtyContactId) {
      const { data: cMap } = await params.supabase
        .from('hubspot_object_mappings')
        .select('hubspot_id')
        .eq('org_id', params.orgId)
        .eq('object_type', 'contact')
        .eq('sixty_id', sixtyContactId)
        .maybeSingle()
      if (cMap?.hubspot_id) {
        await params.client
          .request({
            method: 'PUT',
            path: `/crm/v4/objects/quotes/${encodeURIComponent(quoteHsId)}/associations/default/contacts/${encodeURIComponent(String(cMap.hubspot_id))}`,
            retries: 2,
          })
          .catch(() => {})
      }
    }

    if (sixtyDealId) {
      const { data: dMap } = await params.supabase
        .from('hubspot_object_mappings')
        .select('hubspot_id')
        .eq('org_id', params.orgId)
        .eq('object_type', 'deal')
        .eq('sixty_id', sixtyDealId)
        .maybeSingle()
      if (dMap?.hubspot_id) {
        await params.client
          .request({
            method: 'PUT',
            path: `/crm/v4/objects/quotes/${encodeURIComponent(quoteHsId)}/associations/default/deals/${encodeURIComponent(String(dMap.hubspot_id))}`,
            retries: 2,
          })
          .catch(() => {})
      }
    }

    // Minimal line item sync: ensure a single line item exists for this proposal.
    // This is intentionally simple and idempotent via hubspot_object_mappings (object_type=line_item, sixty_id=proposal_id).
    try {
      const { data: existingLineItemMap } = await params.supabase
        .from('hubspot_object_mappings')
        .select('hubspot_id')
        .eq('org_id', params.orgId)
        .eq('object_type', 'line_item')
        .eq('sixty_id', String(proposal.id))
        .maybeSingle()

      const properties: any = {
        name: proposal.title ? `Proposal: ${proposal.title}` : `Proposal`,
        quantity: 1,
      }
      if (sixtyDealValue != null) properties.price = sixtyDealValue

      let lineItemId: string | null = null
      if (existingLineItemMap?.hubspot_id) {
        lineItemId = String(existingLineItemMap.hubspot_id)
        await params.client
          .request({
            method: 'PATCH',
            path: `/crm/v3/objects/line_items/${encodeURIComponent(lineItemId)}`,
            body: { properties },
            retries: 2,
          })
          .catch(() => {})
      } else {
        const createdLine = await params.client
          .request<any>({
            method: 'POST',
            path: '/crm/v3/objects/line_items',
            body: { properties },
            retries: 2,
          })
          .catch(() => null)
        if (createdLine?.id) lineItemId = String(createdLine.id)
        if (lineItemId) {
          await upsertMapping(params.supabase, {
            orgId: params.orgId,
            objectType: 'line_item',
            hubspotId: lineItemId,
            sixtyId: String(proposal.id),
          })
        }
      }

      if (lineItemId) {
        // Associate to quote (best-effort)
        await params.client
          .request({
            method: 'PUT',
            path: `/crm/v4/objects/line_items/${encodeURIComponent(lineItemId)}/associations/default/quotes/${encodeURIComponent(quoteHsId)}`,
            retries: 2,
          })
          .catch(() => {})
      }
    } catch {
      // non-fatal
    }
  }
}

async function handleJob(params: {
  supabase: any
  orgId: string
  job: QueueJob
  accessToken: string
  memberUserIds: string[]
  connectedByUserId: string | null
}) {
  const client = new HubSpotClient({ accessToken: params.accessToken })

  switch (params.job.job_type) {
    case 'ensure_properties':
      await ensureProperties(client)
      return
    case 'sync_contact':
      await handleSyncContact({
        supabase: params.supabase,
        client,
        orgId: params.orgId,
        payload: params.job.payload,
        connectedByUserId: params.connectedByUserId,
      })
      return
    case 'sync_deal':
      await handleSyncDeal({
        supabase: params.supabase,
        client,
        orgId: params.orgId,
        payload: params.job.payload,
        memberUserIds: params.memberUserIds,
      })
      return
    case 'sync_task':
      await handleSyncTask({
        supabase: params.supabase,
        client,
        orgId: params.orgId,
        payload: params.job.payload,
        memberUserIds: params.memberUserIds,
      })
      return
    case 'push_note':
      await handlePushNote({ supabase: params.supabase, client, orgId: params.orgId, payload: params.job.payload })
      return
    case 'poll_form_submissions':
      await handlePollFormSubmissions({
        supabase: params.supabase,
        client,
        orgId: params.orgId,
        payload: params.job.payload,
        connectedByUserId: params.connectedByUserId,
      })
      return
    case 'sync_quote':
      await handleSyncQuote({
        supabase: params.supabase,
        client,
        orgId: params.orgId,
        payload: params.job.payload,
        memberUserIds: params.memberUserIds,
      })
      return
    // Stubs (implemented in later phases)
    case 'sync_line_item':
    case 'sync_custom_object':
      return
  }
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);// Service-role only
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const authHeader = req.headers.get('Authorization') || ''
  if (!serviceRoleKey || authHeader.trim() !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Best-effort global advisory lock to avoid parallel workers exceeding HubSpot limits
  const { data: lockOk } = await supabase.rpc('hubspot_try_acquire_worker_lock')
  if (!lockOk) {
    return new Response(JSON.stringify({ success: true, locked: true, message: 'Worker already running' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const startedAt = Date.now()
  try {
    let body: any = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    const limit = Math.min(Math.max(Number(body.limit || 10), 1), 50)
    const orgId = typeof body.org_id === 'string' ? body.org_id : null

    const { data: jobs, error: dequeueErr } = await supabase.rpc('hubspot_dequeue_jobs', {
      p_limit: limit,
      p_org_id: orgId,
    })

    if (dequeueErr) {
      throw new Error(`Failed to dequeue jobs: ${dequeueErr.message}`)
    }

    const queueJobs: QueueJob[] = (jobs || []) as any
    if (!queueJobs.length) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No jobs ready' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Process jobs grouped by org (single token per org)
    const byOrg = new Map<string, QueueJob[]>()
    for (const j of queueJobs) {
      const list = byOrg.get(j.org_id) || []
      list.push(j)
      byOrg.set(j.org_id, list)
    }

    const results: Array<{ id: string; org_id: string; job_type: string; success: boolean; message?: string }> = []

    for (const [oId, orgJobs] of byOrg.entries()) {
      // Fetch integration row for connected_by_user_id
      const { data: integrationRow } = await supabase
        .from('hubspot_org_integrations')
        .select('connected_by_user_id, is_active, is_connected')
        .eq('org_id', oId)
        .eq('is_active', true)
        .maybeSingle()

      if (!integrationRow?.is_connected) {
        // If not connected, requeue jobs with a delay and record error.
        for (const j of orgJobs) {
          await supabase.from('hubspot_sync_queue').insert({
            org_id: oId,
            job_type: j.job_type,
            priority: j.priority,
            run_after: new Date(Date.now() + 60_000).toISOString(),
            attempts: j.attempts + 1,
            max_attempts: j.max_attempts,
            last_error: 'HubSpot integration not connected',
            payload: j.payload,
            dedupe_key: j.dedupe_key,
            clerk_org_id: j.clerk_org_id,
          }).catch(() => {})
          results.push({ id: j.id, org_id: oId, job_type: j.job_type, success: false, message: 'not_connected' })
        }
        continue
      }

      const connectedByUserId = integrationRow?.connected_by_user_id ? String(integrationRow.connected_by_user_id) : null
      const memberUserIds = await getOrgMemberUserIds(supabase, oId)
      const accessToken = await getAccessTokenForOrg(supabase, oId)

      for (const j of orgJobs) {
        try {
          await handleJob({ supabase, orgId: oId, job: j, accessToken, memberUserIds, connectedByUserId })
          results.push({ id: j.id, org_id: oId, job_type: j.job_type, success: true })
        } catch (e: any) {
          const msg = e instanceof HubSpotError ? `hubspot:${e.status}:${e.message}` : e?.message || 'job_failed'
          const retryAfterMs = e instanceof HubSpotError ? e.retryAfterMs : undefined
          const nextRun = new Date(Date.now() + (retryAfterMs ?? Math.min(60_000, 1000 * Math.pow(2, Math.max(0, j.attempts))))).toISOString()

          // Requeue with incremented attempts (best-effort)
          await supabase
            .from('hubspot_sync_queue')
            .insert({
              org_id: oId,
              clerk_org_id: j.clerk_org_id,
              job_type: j.job_type,
              priority: j.priority,
              run_after: nextRun,
              attempts: j.attempts + 1,
              max_attempts: j.max_attempts,
              last_error: msg,
              payload: j.payload,
              dedupe_key: j.dedupe_key,
            })
            .catch(() => {})

          results.push({ id: j.id, org_id: oId, job_type: j.job_type, success: false, message: msg })
        }

        // Small delay between jobs to avoid bursting
        await sleep(75)
      }
    }

    const durationMs = Date.now() - startedAt
    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        duration_ms: durationMs,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } finally {
    // Release lock best-effort
    await supabase.rpc('hubspot_release_worker_lock').catch(() => {})
  }
})


