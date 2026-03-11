import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'

// ---------------------------------------------------------------------------
// LinkedIn Campaign Manager
//
// CRUD router for LinkedIn campaign groups, campaigns, and creatives.
// Creates/updates records locally in Supabase AND pushes to the LinkedIn
// Advertising API, storing returned URNs for future reference.
//
// Actions:
//   Campaign Groups: list_groups, create_group, update_group
//   Campaigns:       list_campaigns, get_campaign, create_campaign, update_campaign, update_status
//   Creatives:       list_creatives, create_creative, update_creative
//   Audiences:       estimate_audience, list_audiences, create_audience, upload_audience_members,
//                    delete_audience, sync_audience_status, push_ops_to_audience
// ---------------------------------------------------------------------------

const LOG_PREFIX = '[linkedin-campaign-manager]'
const LINKEDIN_API_BASE = 'https://api.linkedin.com/rest'
const LINKEDIN_API_VERSION = '202511'

const VALID_ACTIONS = [
  'list_groups', 'create_group', 'update_group',
  'list_campaigns', 'get_campaign', 'create_campaign', 'update_campaign', 'update_status',
  'list_creatives', 'create_creative', 'update_creative',
  'estimate_audience', 'list_audiences', 'create_audience', 'upload_audience_members',
  'delete_audience', 'sync_audience_status', 'push_ops_to_audience',
] as const

type Action = typeof VALID_ACTIONS[number]

const VALID_CAMPAIGN_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED', 'CANCELED'] as const
const VALID_OBJECTIVE_TYPES = ['LEAD_GENERATION', 'WEBSITE_VISITS', 'WEBSITE_CONVERSIONS', 'ENGAGEMENT', 'BRAND_AWARENESS', 'VIDEO_VIEWS'] as const

// Allowed status transitions: from -> [to]
const STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['ACTIVE'],
  ACTIVE: ['PAUSED', 'ARCHIVED'],
  PAUSED: ['ACTIVE', 'ARCHIVED'],
  COMPLETED: ['ARCHIVED'],
  CANCELED: ['ARCHIVED'],
}

// ---------------------------------------------------------------------------
// LinkedIn API helpers
// ---------------------------------------------------------------------------

function linkedInHeaders(accessToken: string, extra?: Record<string, string>): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'LinkedIn-Version': LINKEDIN_API_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json',
    ...extra,
  }
}

/** Get LinkedIn access token for an org */
async function getLinkedInToken(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<{ token: string; adAccountId: string; integrationId: string }> {
  const { data, error } = await serviceClient
    .from('linkedin_org_integrations')
    .select('id, access_token_encrypted, linkedin_ad_account_id')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.error(`${LOG_PREFIX} Error fetching integration: ${error.message}`)
    throw new Error('Failed to retrieve LinkedIn integration')
  }
  if (!data) throw new Error('LinkedIn integration not connected for this organization')
  if (!data.access_token_encrypted) throw new Error('LinkedIn access token not available. Please reconnect.')

  return {
    token: data.access_token_encrypted,
    adAccountId: data.linkedin_ad_account_id,
    integrationId: data.id,
  }
}

/** Make a LinkedIn API call with error handling */
async function linkedInFetch(
  url: string,
  options: {
    method: string
    headers: Record<string, string>
    body?: Record<string, unknown>
  },
): Promise<{ ok: boolean; status: number; data: any; versionTag?: string }> {
  const fetchOptions: RequestInit = {
    method: options.method,
    headers: options.headers,
  }
  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body)
  }

  const response = await fetch(url, fetchOptions)

  if (response.status === 401) {
    throw new Error('LinkedIn token expired. Please reconnect your LinkedIn account.')
  }

  const versionTag = response.headers.get('x-restli-id') || response.headers.get('etag') || undefined
  let data: any = null

  const text = await response.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }
  }

  if (!response.ok) {
    const errorMessage = data?.message || data?.serviceErrorCode
      ? `LinkedIn API error (${response.status}): ${data.message || ''} [code: ${data.serviceErrorCode || 'unknown'}]`
      : `LinkedIn API error (${response.status})`
    console.error(`${LOG_PREFIX} ${errorMessage}`)
    throw new Error(errorMessage)
  }

  return { ok: true, status: response.status, data, versionTag }
}

/** Validate user belongs to the org */
async function validateOrgMembership(
  serviceClient: SupabaseClient,
  userId: string,
  orgId: string,
): Promise<void> {
  const { data, error } = await serviceClient
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error || !data) {
    throw new Error('You do not have access to this organization')
  }
}

// ---------------------------------------------------------------------------
// Campaign Group handlers
// ---------------------------------------------------------------------------

async function handleListGroups(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
): Promise<Record<string, unknown>> {
  const { org_id, ad_account_id } = body
  if (!org_id) throw new Error('org_id is required')

  let query = serviceClient
    .from('linkedin_managed_campaign_groups')
    .select('id, org_id, ad_account_id, linkedin_group_id, name, status, daily_budget_amount, total_budget_amount, currency_code, run_schedule_start, run_schedule_end, version_tag, created_at, updated_at')
    .eq('org_id', org_id)
    .order('created_at', { ascending: false })

  if (ad_account_id) {
    query = query.eq('ad_account_id', ad_account_id)
  }

  const { data, error } = await query

  if (error) throw new Error(`Failed to list campaign groups: ${error.message}`)

  return { groups: data ?? [], count: data?.length ?? 0 }
}

async function handleCreateGroup(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
  userId: string,
): Promise<Record<string, unknown>> {
  const { org_id, ad_account_id, name, status, daily_budget_amount, total_budget_amount, currency_code, run_schedule_start, run_schedule_end } = body

  if (!org_id) throw new Error('org_id is required')
  if (!ad_account_id) throw new Error('ad_account_id is required')
  if (!name) throw new Error('name is required')

  // Build LinkedIn API payload
  const linkedInPayload: Record<string, any> = {
    account: `urn:li:sponsoredAccount:${ad_account_id}`,
    name,
    status: status || 'ACTIVE',
  }

  if (daily_budget_amount) {
    linkedInPayload.dailyBudget = {
      amount: String(daily_budget_amount),
      currencyCode: currency_code || 'USD',
    }
  }
  if (total_budget_amount) {
    linkedInPayload.totalBudget = {
      amount: String(total_budget_amount),
      currencyCode: currency_code || 'USD',
    }
  }
  if (run_schedule_start) {
    linkedInPayload.runSchedule = {
      start: new Date(run_schedule_start).getTime(),
      ...(run_schedule_end ? { end: new Date(run_schedule_end).getTime() } : {}),
    }
  }

  // Push to LinkedIn
  const { token } = await getLinkedInToken(serviceClient, org_id)
  const linkedInResult = await linkedInFetch(
    `${LINKEDIN_API_BASE}/adCampaignGroups`,
    {
      method: 'POST',
      headers: linkedInHeaders(token, { 'X-Restli-Method': 'BATCH_CREATE' }),
      body: { elements: [linkedInPayload] },
    },
  )

  // Extract LinkedIn group ID from response
  const linkedInGroupId = linkedInResult.data?.elements?.[0]?.id
    || linkedInResult.data?.value?.id
    || null
  const versionTag = linkedInResult.data?.elements?.[0]?.['$URN']
    || linkedInResult.versionTag
    || null

  // Store locally
  const { data: group, error: insertError } = await serviceClient
    .from('linkedin_managed_campaign_groups')
    .insert({
      org_id,
      ad_account_id,
      linkedin_group_id: linkedInGroupId ? String(linkedInGroupId) : null,
      name,
      status: status || 'ACTIVE',
      daily_budget_amount: daily_budget_amount || null,
      total_budget_amount: total_budget_amount || null,
      currency_code: currency_code || 'USD',
      run_schedule_start: run_schedule_start || null,
      run_schedule_end: run_schedule_end || null,
      version_tag: versionTag,
      created_by: userId,
      last_synced_at: new Date().toISOString(),
    })
    .select('id, org_id, ad_account_id, linkedin_group_id, name, status, daily_budget_amount, total_budget_amount, currency_code, run_schedule_start, run_schedule_end, version_tag, created_at')
    .single()

  if (insertError) throw new Error(`Failed to save campaign group: ${insertError.message}`)

  return { group, linkedin_synced: !!linkedInGroupId }
}

async function handleUpdateGroup(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
): Promise<Record<string, unknown>> {
  const { group_id, version_tag, ...updates } = body

  if (!group_id) throw new Error('group_id is required')
  if (!version_tag) throw new Error('version_tag is required for optimistic concurrency')

  // Fetch existing group
  const { data: existing, error: fetchError } = await serviceClient
    .from('linkedin_managed_campaign_groups')
    .select('id, org_id, ad_account_id, linkedin_group_id, version_tag')
    .eq('id', group_id)
    .maybeSingle()

  if (fetchError || !existing) throw new Error('Campaign group not found')

  // Version check
  if (existing.version_tag && existing.version_tag !== version_tag) {
    throw new Error('Version conflict. The group was modified by another user. Please refresh and try again.')
  }

  // Build update fields for local DB
  const allowedFields = ['name', 'status', 'daily_budget_amount', 'total_budget_amount', 'currency_code', 'run_schedule_start', 'run_schedule_end']
  const dbUpdates: Record<string, any> = {}
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      dbUpdates[field] = updates[field]
    }
  }

  // Push to LinkedIn if synced
  let newVersionTag = version_tag
  if (existing.linkedin_group_id) {
    const linkedInPayload: Record<string, any> = {}
    if (updates.name) linkedInPayload.name = { $set: updates.name }
    if (updates.status) linkedInPayload.status = { $set: updates.status }
    if (updates.daily_budget_amount !== undefined) {
      linkedInPayload.dailyBudget = {
        $set: {
          amount: String(updates.daily_budget_amount),
          currencyCode: updates.currency_code || existing.currency_code || 'USD',
        },
      }
    }
    if (updates.total_budget_amount !== undefined) {
      linkedInPayload.totalBudget = {
        $set: {
          amount: String(updates.total_budget_amount),
          currencyCode: updates.currency_code || existing.currency_code || 'USD',
        },
      }
    }

    if (Object.keys(linkedInPayload).length > 0) {
      const { token } = await getLinkedInToken(serviceClient, existing.org_id)
      const result = await linkedInFetch(
        `${LINKEDIN_API_BASE}/adCampaignGroups/${existing.linkedin_group_id}`,
        {
          method: 'POST',
          headers: linkedInHeaders(token, { 'X-Restli-Method': 'PARTIAL_UPDATE' }),
          body: { patch: linkedInPayload },
        },
      )
      newVersionTag = result.versionTag || version_tag
    }
  }

  dbUpdates.version_tag = newVersionTag
  dbUpdates.last_synced_at = new Date().toISOString()

  const { data: updated, error: updateError } = await serviceClient
    .from('linkedin_managed_campaign_groups')
    .update(dbUpdates)
    .eq('id', group_id)
    .select('id, org_id, ad_account_id, linkedin_group_id, name, status, daily_budget_amount, total_budget_amount, currency_code, run_schedule_start, run_schedule_end, version_tag, updated_at')
    .single()

  if (updateError) throw new Error(`Failed to update campaign group: ${updateError.message}`)

  return { group: updated }
}

// ---------------------------------------------------------------------------
// Campaign handlers
// ---------------------------------------------------------------------------

async function handleListCampaigns(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
): Promise<Record<string, unknown>> {
  const { org_id, ad_account_id, status, campaign_group_id } = body
  if (!org_id) throw new Error('org_id is required')

  let query = serviceClient
    .from('linkedin_managed_campaigns')
    .select('id, org_id, ad_account_id, campaign_group_id, linkedin_campaign_id, name, objective_type, campaign_type, format, status, daily_budget_amount, total_budget_amount, currency_code, unit_cost_amount, cost_type, targeting_criteria, run_schedule_start, run_schedule_end, pacing_strategy, audience_expansion_enabled, offsite_delivery_enabled, version_tag, created_at, updated_at')
    .eq('org_id', org_id)
    .order('created_at', { ascending: false })

  if (ad_account_id) query = query.eq('ad_account_id', ad_account_id)
  if (status) query = query.eq('status', status)
  if (campaign_group_id) query = query.eq('campaign_group_id', campaign_group_id)

  const { data, error } = await query

  if (error) throw new Error(`Failed to list campaigns: ${error.message}`)

  return { campaigns: data ?? [], count: data?.length ?? 0 }
}

async function handleGetCampaign(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
): Promise<Record<string, unknown>> {
  const { campaign_id } = body
  if (!campaign_id) throw new Error('campaign_id is required')

  const { data: campaign, error: campaignError } = await serviceClient
    .from('linkedin_managed_campaigns')
    .select('id, org_id, ad_account_id, campaign_group_id, linkedin_campaign_id, name, objective_type, campaign_type, format, status, daily_budget_amount, total_budget_amount, currency_code, unit_cost_amount, cost_type, targeting_criteria, run_schedule_start, run_schedule_end, pacing_strategy, audience_expansion_enabled, offsite_delivery_enabled, version_tag, linkedin_group_urn, is_externally_modified, last_synced_at, created_at, updated_at')
    .eq('id', campaign_id)
    .maybeSingle()

  if (campaignError) throw new Error(`Failed to fetch campaign: ${campaignError.message}`)
  if (!campaign) throw new Error('Campaign not found')

  // Fetch associated creatives
  const { data: creatives, error: creativesError } = await serviceClient
    .from('linkedin_managed_creatives')
    .select('id, linkedin_creative_id, headline, body_text, cta_text, destination_url, media_type, media_asset_id, media_url, status, is_direct_sponsored, version_tag, created_at, updated_at')
    .eq('campaign_id', campaign_id)
    .order('created_at', { ascending: false })

  if (creativesError) {
    console.warn(`${LOG_PREFIX} Failed to fetch creatives for campaign ${campaign_id}: ${creativesError.message}`)
  }

  return { campaign, creatives: creatives ?? [] }
}

async function handleCreateCampaign(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
  userId: string,
): Promise<Record<string, unknown>> {
  const {
    org_id, ad_account_id, name, objective_type, format, campaign_group_id,
    targeting_criteria, daily_budget_amount, total_budget_amount, currency_code,
    cost_type, unit_cost_amount, run_schedule_start, run_schedule_end,
    pacing_strategy, audience_expansion_enabled, offsite_delivery_enabled,
  } = body

  if (!org_id) throw new Error('org_id is required')
  if (!ad_account_id) throw new Error('ad_account_id is required')
  if (!name) throw new Error('name is required')
  if (!objective_type) throw new Error('objective_type is required')
  if (!VALID_OBJECTIVE_TYPES.includes(objective_type)) {
    throw new Error(`Invalid objective_type. Must be one of: ${VALID_OBJECTIVE_TYPES.join(', ')}`)
  }

  // If campaign_group_id provided, validate it exists and check limit
  let linkedInGroupUrn: string | null = null
  if (campaign_group_id) {
    const { data: group, error: groupError } = await serviceClient
      .from('linkedin_managed_campaign_groups')
      .select('id, linkedin_group_id')
      .eq('id', campaign_group_id)
      .eq('org_id', org_id)
      .maybeSingle()

    if (groupError || !group) throw new Error('Campaign group not found')
    linkedInGroupUrn = group.linkedin_group_id ? `urn:li:sponsoredCampaignGroup:${group.linkedin_group_id}` : null

    // Check campaign count limit (max 2000 per non-default group)
    const { count, error: countError } = await serviceClient
      .from('linkedin_managed_campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_group_id', campaign_group_id)

    if (!countError && count !== null && count >= 2000) {
      throw new Error('Campaign group has reached the maximum of 2000 campaigns. Create a new group.')
    }
  }

  // Build LinkedIn API payload
  const linkedInPayload: Record<string, any> = {
    account: `urn:li:sponsoredAccount:${ad_account_id}`,
    name,
    objectiveType: objective_type,
    status: 'DRAFT', // Always create as DRAFT
    type: 'SPONSORED_UPDATES', // Default campaign type
  }

  if (format) linkedInPayload.creativeSelection = format === 'CAROUSEL' ? 'ROUND_ROBIN' : 'OPTIMIZED'
  if (linkedInGroupUrn) linkedInPayload.campaignGroup = linkedInGroupUrn

  if (daily_budget_amount) {
    linkedInPayload.dailyBudget = {
      amount: String(daily_budget_amount),
      currencyCode: currency_code || 'USD',
    }
  }
  if (total_budget_amount) {
    linkedInPayload.totalBudget = {
      amount: String(total_budget_amount),
      currencyCode: currency_code || 'USD',
    }
  }
  if (cost_type) linkedInPayload.costType = cost_type
  if (unit_cost_amount) {
    linkedInPayload.unitCost = {
      amount: String(unit_cost_amount),
      currencyCode: currency_code || 'USD',
    }
  }
  if (run_schedule_start) {
    linkedInPayload.runSchedule = {
      start: new Date(run_schedule_start).getTime(),
      ...(run_schedule_end ? { end: new Date(run_schedule_end).getTime() } : {}),
    }
  }
  if (targeting_criteria && Object.keys(targeting_criteria).length > 0) {
    linkedInPayload.targetingCriteria = targeting_criteria
  }
  if (pacing_strategy) linkedInPayload.pacingStrategy = pacing_strategy
  if (audience_expansion_enabled !== undefined) linkedInPayload.audienceExpansionEnabled = audience_expansion_enabled
  if (offsite_delivery_enabled !== undefined) linkedInPayload.offsiteDeliveryEnabled = offsite_delivery_enabled

  // Push to LinkedIn
  const { token } = await getLinkedInToken(serviceClient, org_id)
  const linkedInResult = await linkedInFetch(
    `${LINKEDIN_API_BASE}/adCampaigns`,
    {
      method: 'POST',
      headers: linkedInHeaders(token),
      body: linkedInPayload,
    },
  )

  // Extract LinkedIn campaign ID
  const linkedInCampaignId = linkedInResult.data?.id
    || linkedInResult.data?.value?.id
    || null
  const versionTag = linkedInResult.versionTag || null

  // Store locally
  const { data: campaign, error: insertError } = await serviceClient
    .from('linkedin_managed_campaigns')
    .insert({
      org_id,
      ad_account_id,
      campaign_group_id: campaign_group_id || null,
      linkedin_campaign_id: linkedInCampaignId ? String(linkedInCampaignId) : null,
      name,
      objective_type,
      campaign_type: 'SPONSORED_UPDATES',
      format: format || null,
      status: 'DRAFT',
      daily_budget_amount: daily_budget_amount || null,
      total_budget_amount: total_budget_amount || null,
      currency_code: currency_code || 'USD',
      unit_cost_amount: unit_cost_amount || null,
      cost_type: cost_type || null,
      targeting_criteria: targeting_criteria || {},
      run_schedule_start: run_schedule_start || null,
      run_schedule_end: run_schedule_end || null,
      pacing_strategy: pacing_strategy || 'DAILY',
      audience_expansion_enabled: audience_expansion_enabled ?? false,
      offsite_delivery_enabled: offsite_delivery_enabled ?? false,
      version_tag: versionTag,
      linkedin_group_urn: linkedInGroupUrn,
      created_by: userId,
      last_synced_at: new Date().toISOString(),
    })
    .select('id, org_id, ad_account_id, campaign_group_id, linkedin_campaign_id, name, objective_type, format, status, daily_budget_amount, total_budget_amount, currency_code, version_tag, created_at')
    .single()

  if (insertError) throw new Error(`Failed to save campaign: ${insertError.message}`)

  return { campaign, linkedin_synced: !!linkedInCampaignId }
}

async function handleUpdateCampaign(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
): Promise<Record<string, unknown>> {
  const { campaign_id, version_tag, ...updates } = body

  if (!campaign_id) throw new Error('campaign_id is required')
  if (!version_tag) throw new Error('version_tag is required for optimistic concurrency')

  // Fetch existing campaign
  const { data: existing, error: fetchError } = await serviceClient
    .from('linkedin_managed_campaigns')
    .select('id, org_id, ad_account_id, linkedin_campaign_id, version_tag, currency_code, status')
    .eq('id', campaign_id)
    .maybeSingle()

  if (fetchError || !existing) throw new Error('Campaign not found')

  if (existing.version_tag && existing.version_tag !== version_tag) {
    throw new Error('Version conflict. The campaign was modified by another user. Please refresh and try again.')
  }

  // Build update fields
  const allowedFields = [
    'name', 'format', 'daily_budget_amount', 'total_budget_amount', 'currency_code',
    'unit_cost_amount', 'cost_type', 'targeting_criteria', 'run_schedule_start',
    'run_schedule_end', 'pacing_strategy', 'audience_expansion_enabled', 'offsite_delivery_enabled',
  ]
  const dbUpdates: Record<string, any> = {}
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      dbUpdates[field] = updates[field]
    }
  }

  // Push to LinkedIn if synced
  let newVersionTag = version_tag
  if (existing.linkedin_campaign_id) {
    const linkedInPayload: Record<string, any> = {}

    if (updates.name) linkedInPayload.name = { $set: updates.name }
    if (updates.daily_budget_amount !== undefined) {
      linkedInPayload.dailyBudget = {
        $set: {
          amount: String(updates.daily_budget_amount),
          currencyCode: updates.currency_code || existing.currency_code || 'USD',
        },
      }
    }
    if (updates.total_budget_amount !== undefined) {
      linkedInPayload.totalBudget = {
        $set: {
          amount: String(updates.total_budget_amount),
          currencyCode: updates.currency_code || existing.currency_code || 'USD',
        },
      }
    }
    if (updates.cost_type) linkedInPayload.costType = { $set: updates.cost_type }
    if (updates.unit_cost_amount !== undefined) {
      linkedInPayload.unitCost = {
        $set: {
          amount: String(updates.unit_cost_amount),
          currencyCode: updates.currency_code || existing.currency_code || 'USD',
        },
      }
    }
    if (updates.targeting_criteria) linkedInPayload.targetingCriteria = { $set: updates.targeting_criteria }
    if (updates.pacing_strategy) linkedInPayload.pacingStrategy = { $set: updates.pacing_strategy }
    if (updates.audience_expansion_enabled !== undefined) {
      linkedInPayload.audienceExpansionEnabled = { $set: updates.audience_expansion_enabled }
    }
    if (updates.offsite_delivery_enabled !== undefined) {
      linkedInPayload.offsiteDeliveryEnabled = { $set: updates.offsite_delivery_enabled }
    }

    if (Object.keys(linkedInPayload).length > 0) {
      const { token } = await getLinkedInToken(serviceClient, existing.org_id)
      const result = await linkedInFetch(
        `${LINKEDIN_API_BASE}/adCampaigns/${existing.linkedin_campaign_id}`,
        {
          method: 'POST',
          headers: linkedInHeaders(token, { 'X-Restli-Method': 'PARTIAL_UPDATE' }),
          body: { patch: linkedInPayload },
        },
      )
      newVersionTag = result.versionTag || version_tag
    }
  }

  dbUpdates.version_tag = newVersionTag
  dbUpdates.last_synced_at = new Date().toISOString()

  const { data: updated, error: updateError } = await serviceClient
    .from('linkedin_managed_campaigns')
    .update(dbUpdates)
    .eq('id', campaign_id)
    .select('id, org_id, ad_account_id, linkedin_campaign_id, name, objective_type, format, status, daily_budget_amount, total_budget_amount, currency_code, cost_type, unit_cost_amount, targeting_criteria, pacing_strategy, audience_expansion_enabled, offsite_delivery_enabled, version_tag, updated_at')
    .single()

  if (updateError) throw new Error(`Failed to update campaign: ${updateError.message}`)

  return { campaign: updated }
}

async function handleUpdateStatus(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
): Promise<Record<string, unknown>> {
  const { campaign_id, status, version_tag } = body

  if (!campaign_id) throw new Error('campaign_id is required')
  if (!status) throw new Error('status is required')
  if (!version_tag) throw new Error('version_tag is required for optimistic concurrency')
  if (!VALID_CAMPAIGN_STATUSES.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${VALID_CAMPAIGN_STATUSES.join(', ')}`)
  }

  // Fetch existing
  const { data: existing, error: fetchError } = await serviceClient
    .from('linkedin_managed_campaigns')
    .select('id, org_id, linkedin_campaign_id, status, version_tag')
    .eq('id', campaign_id)
    .maybeSingle()

  if (fetchError || !existing) throw new Error('Campaign not found')

  if (existing.version_tag && existing.version_tag !== version_tag) {
    throw new Error('Version conflict. Please refresh and try again.')
  }

  // Validate status transition (ARCHIVED is always allowed)
  if (status !== 'ARCHIVED') {
    const allowed = STATUS_TRANSITIONS[existing.status]
    if (!allowed || !allowed.includes(status)) {
      throw new Error(`Cannot transition from ${existing.status} to ${status}. Allowed: ${(allowed || []).join(', ') || 'ARCHIVED only'}`)
    }
  }

  // Push to LinkedIn if synced
  let newVersionTag = version_tag
  if (existing.linkedin_campaign_id) {
    const { token } = await getLinkedInToken(serviceClient, existing.org_id)
    const result = await linkedInFetch(
      `${LINKEDIN_API_BASE}/adCampaigns/${existing.linkedin_campaign_id}`,
      {
        method: 'POST',
        headers: linkedInHeaders(token, { 'X-Restli-Method': 'PARTIAL_UPDATE' }),
        body: { patch: { status: { $set: status } } },
      },
    )
    newVersionTag = result.versionTag || version_tag
  }

  const { data: updated, error: updateError } = await serviceClient
    .from('linkedin_managed_campaigns')
    .update({ status, version_tag: newVersionTag, last_synced_at: new Date().toISOString() })
    .eq('id', campaign_id)
    .select('id, org_id, linkedin_campaign_id, name, status, version_tag, updated_at')
    .single()

  if (updateError) throw new Error(`Failed to update campaign status: ${updateError.message}`)

  return { campaign: updated, previous_status: existing.status }
}

// ---------------------------------------------------------------------------
// Creative handlers
// ---------------------------------------------------------------------------

async function handleListCreatives(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
): Promise<Record<string, unknown>> {
  const { campaign_id } = body
  if (!campaign_id) throw new Error('campaign_id is required')

  const { data, error } = await serviceClient
    .from('linkedin_managed_creatives')
    .select('id, campaign_id, linkedin_creative_id, headline, body_text, cta_text, destination_url, media_type, media_asset_id, media_url, status, is_direct_sponsored, version_tag, created_at, updated_at')
    .eq('campaign_id', campaign_id)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to list creatives: ${error.message}`)

  return { creatives: data ?? [], count: data?.length ?? 0 }
}

async function handleCreateCreative(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
  userId: string,
): Promise<Record<string, unknown>> {
  const { campaign_id, headline, body_text, cta_text, destination_url, media_type, media_asset_id, is_direct_sponsored } = body

  if (!campaign_id) throw new Error('campaign_id is required')

  // Fetch parent campaign for org_id and LinkedIn campaign ID
  const { data: campaign, error: campaignError } = await serviceClient
    .from('linkedin_managed_campaigns')
    .select('id, org_id, linkedin_campaign_id, ad_account_id')
    .eq('id', campaign_id)
    .maybeSingle()

  if (campaignError || !campaign) throw new Error('Campaign not found')

  // Build LinkedIn creative payload
  const linkedInPayload: Record<string, any> = {
    campaign: campaign.linkedin_campaign_id
      ? `urn:li:sponsoredCampaign:${campaign.linkedin_campaign_id}`
      : undefined,
    intendedStatus: 'ACTIVE',
    isDirectSponsoredContent: is_direct_sponsored ?? true,
  }

  // Build ad content
  const adContent: Record<string, any> = {}
  if (headline || body_text || cta_text || destination_url) {
    adContent.introductoryText = body_text || ''
    adContent.actionTarget = destination_url || ''
    adContent.title = headline || ''
    if (cta_text) adContent.callToAction = cta_text
  }
  if (Object.keys(adContent).length > 0) {
    linkedInPayload.content = adContent
  }

  // Push to LinkedIn
  let linkedInCreativeId: string | null = null
  let versionTag: string | null = null

  if (campaign.linkedin_campaign_id) {
    try {
      const { token } = await getLinkedInToken(serviceClient, campaign.org_id)
      const result = await linkedInFetch(
        `${LINKEDIN_API_BASE}/creatives`,
        {
          method: 'POST',
          headers: linkedInHeaders(token),
          body: linkedInPayload,
        },
      )
      linkedInCreativeId = result.data?.id || result.data?.value?.id || null
      versionTag = result.versionTag || null
    } catch (err) {
      // Creative creation on LinkedIn is non-blocking; log but continue
      console.warn(`${LOG_PREFIX} LinkedIn creative creation failed: ${err instanceof Error ? err.message : err}`)
    }
  }

  // Store locally
  const { data: creative, error: insertError } = await serviceClient
    .from('linkedin_managed_creatives')
    .insert({
      org_id: campaign.org_id,
      campaign_id,
      linkedin_creative_id: linkedInCreativeId ? String(linkedInCreativeId) : null,
      headline: headline || null,
      body_text: body_text || null,
      cta_text: cta_text || null,
      destination_url: destination_url || null,
      media_type: media_type || 'IMAGE',
      media_asset_id: media_asset_id || null,
      status: 'DRAFT',
      is_direct_sponsored: is_direct_sponsored ?? true,
      version_tag: versionTag,
      created_by: userId,
      last_synced_at: linkedInCreativeId ? new Date().toISOString() : null,
    })
    .select('id, campaign_id, linkedin_creative_id, headline, body_text, cta_text, destination_url, media_type, media_asset_id, status, is_direct_sponsored, version_tag, created_at')
    .single()

  if (insertError) throw new Error(`Failed to save creative: ${insertError.message}`)

  return { creative, linkedin_synced: !!linkedInCreativeId }
}

async function handleUpdateCreative(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
): Promise<Record<string, unknown>> {
  const { creative_id, version_tag, ...updates } = body

  if (!creative_id) throw new Error('creative_id is required')
  if (!version_tag) throw new Error('version_tag is required for optimistic concurrency')

  // Fetch existing
  const { data: existing, error: fetchError } = await serviceClient
    .from('linkedin_managed_creatives')
    .select('id, org_id, campaign_id, linkedin_creative_id, version_tag')
    .eq('id', creative_id)
    .maybeSingle()

  if (fetchError || !existing) throw new Error('Creative not found')

  if (existing.version_tag && existing.version_tag !== version_tag) {
    throw new Error('Version conflict. Please refresh and try again.')
  }

  const allowedFields = ['headline', 'body_text', 'cta_text', 'destination_url', 'media_type', 'media_asset_id', 'status', 'is_direct_sponsored']
  const dbUpdates: Record<string, any> = {}
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      dbUpdates[field] = updates[field]
    }
  }

  // Push to LinkedIn if synced
  let newVersionTag = version_tag
  if (existing.linkedin_creative_id) {
    const linkedInPayload: Record<string, any> = {}
    if (updates.headline) linkedInPayload.title = { $set: updates.headline }
    if (updates.body_text) linkedInPayload.introductoryText = { $set: updates.body_text }
    if (updates.cta_text) linkedInPayload.callToAction = { $set: updates.cta_text }
    if (updates.destination_url) linkedInPayload.actionTarget = { $set: updates.destination_url }
    if (updates.status) linkedInPayload.intendedStatus = { $set: updates.status }

    if (Object.keys(linkedInPayload).length > 0) {
      try {
        const { token } = await getLinkedInToken(serviceClient, existing.org_id)
        const result = await linkedInFetch(
          `${LINKEDIN_API_BASE}/creatives/${existing.linkedin_creative_id}`,
          {
            method: 'POST',
            headers: linkedInHeaders(token, { 'X-Restli-Method': 'PARTIAL_UPDATE' }),
            body: { patch: linkedInPayload },
          },
        )
        newVersionTag = result.versionTag || version_tag
      } catch (err) {
        console.warn(`${LOG_PREFIX} LinkedIn creative update failed: ${err instanceof Error ? err.message : err}`)
      }
    }
  }

  dbUpdates.version_tag = newVersionTag
  dbUpdates.last_synced_at = new Date().toISOString()

  const { data: updated, error: updateError } = await serviceClient
    .from('linkedin_managed_creatives')
    .update(dbUpdates)
    .eq('id', creative_id)
    .select('id, campaign_id, linkedin_creative_id, headline, body_text, cta_text, destination_url, media_type, media_asset_id, status, is_direct_sponsored, version_tag, updated_at')
    .single()

  if (updateError) throw new Error(`Failed to update creative: ${updateError.message}`)

  return { creative: updated }
}

// ---------------------------------------------------------------------------
// Audience handlers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// LinkedIn URN ID mappings
// ---------------------------------------------------------------------------

const GEO_IDS: Record<string, string> = {
  US: '103644278', GB: '101165590', CA: '101174742', AU: '101452733',
  DE: '101282230', FR: '105015875', NL: '102890719', IE: '104738515',
  SE: '105117694', NO: '103819153', DK: '104514075', FI: '100456013',
  BE: '100565514', AT: '103883259', CH: '106693272', ES: '105646813',
  IT: '103350119', PT: '100364837', PL: '105072130', CZ: '104508036',
  RO: '106670623', HU: '100288700', BG: '105333783', HR: '104688944',
  GR: '104677530', SK: '103061721', SI: '106137034', LT: '101464403',
  LV: '104541993', EE: '102974008', CY: '104803721', MT: '100475185',
  LU: '104042105', IN: '102713980', SG: '102454443', JP: '101355337',
  BR: '106057199', MX: '103323778', AE: '104305776', SA: '100459316',
  IL: '101620260', ZA: '104035573', NZ: '105490917', HK: '103291313',
  KR: '105149562', NI: '100947516',
}

const INDUSTRY_IDS: Record<string, string> = {
  COMPUTER_SOFTWARE: '4', INFORMATION_TECHNOLOGY: '96', FINANCIAL_SERVICES: '43',
  BANKING: '41', INSURANCE: '42', HOSPITAL_AND_HEALTH_CARE: '14',
  PHARMACEUTICALS: '82', BIOTECHNOLOGY: '49', MARKETING_AND_ADVERTISING: '80',
  MANAGEMENT_CONSULTING: '11', RETAIL: '27', CONSUMER_GOODS: '25',
  REAL_ESTATE: '44', CONSTRUCTION: '48', EDUCATION_MANAGEMENT: '69',
  HIGHER_EDUCATION: '68', TELECOMMUNICATIONS: '8', MEDIA_AND_ENTERTAINMENT: '39',
  AUTOMOTIVE: '53', MANUFACTURING: '56', FOOD_AND_BEVERAGES: '34',
  TRANSPORTATION: '92', LOGISTICS_AND_SUPPLY_CHAIN: '150', GOVERNMENT: '75',
  NONPROFIT: '84', LEGAL_SERVICES: '10', ENERGY: '57',
  STAFFING_AND_RECRUITING: '104', DESIGN: '36',
}

const JOB_FUNCTION_IDS: Record<string, string> = {
  ACCOUNTING: '1', ADMINISTRATIVE: '2', ARTS_AND_DESIGN: '3',
  BUSINESS_DEVELOPMENT: '4', COMMUNITY_AND_SOCIAL_SERVICES: '5',
  CONSULTING: '6', EDUCATION: '7', ENGINEERING: '8',
  ENTREPRENEURSHIP: '9', FINANCE: '10', HEALTHCARE_SERVICES: '11',
  HUMAN_RESOURCES: '12', INFORMATION_TECHNOLOGY: '13', LEGAL: '14',
  MARKETING: '15', MEDIA_AND_COMMUNICATION: '16',
  MILITARY_AND_PROTECTIVE_SERVICES: '17', OPERATIONS: '18',
  PRODUCT_MANAGEMENT: '19', PROGRAM_AND_PROJECT_MANAGEMENT: '20',
  PURCHASING: '21', QUALITY_ASSURANCE: '22', REAL_ESTATE: '23',
  RESEARCH: '24', SALES: '25', SUPPORT: '26',
}

const SENIORITY_IDS: Record<string, string> = {
  UNPAID: '1', TRAINING: '2', ENTRY: '3', SENIOR: '4',
  MANAGER: '5', DIRECTOR: '6', VP: '7', CXO: '8',
  PARTNER: '9', OWNER: '10',
}

const STAFF_COUNT_IDS: Record<string, string> = {
  SIZE_1: '1', SIZE_2_10: '2', SIZE_11_50: '3', SIZE_51_200: '4',
  SIZE_201_500: '5', SIZE_501_1000: '6', SIZE_1001_5000: '7',
  SIZE_5001_10000: '8', SIZE_10001_PLUS: '9',
}

/** Map our targeting criteria keys to LinkedIn facet URNs */
function buildTargetingFacets(
  targeting: Record<string, any>,
): Array<{ type: string; values: string[] }> {
  const facets: Array<{ type: string; values: string[] }> = []

  if (targeting.job_functions?.length) {
    const values = targeting.job_functions
      .map((v: string) => v.startsWith('urn:') ? v : JOB_FUNCTION_IDS[v] ? `urn:li:function:${JOB_FUNCTION_IDS[v]}` : null)
      .filter(Boolean)
    if (values.length) facets.push({ type: 'jobFunctions', values })
  }

  if (targeting.seniorities?.length) {
    const values = targeting.seniorities
      .map((v: string) => v.startsWith('urn:') ? v : SENIORITY_IDS[v] ? `urn:li:seniority:${SENIORITY_IDS[v]}` : null)
      .filter(Boolean)
    if (values.length) facets.push({ type: 'seniorities', values })
  }

  if (targeting.industries?.length) {
    const values = targeting.industries
      .map((v: string) => v.startsWith('urn:') ? v : INDUSTRY_IDS[v] ? `urn:li:industry:${INDUSTRY_IDS[v]}` : null)
      .filter(Boolean)
    if (values.length) facets.push({ type: 'industries', values })
  }

  if (targeting.company_sizes?.length) {
    const values = targeting.company_sizes
      .map((v: string) => v.startsWith('urn:') ? v : STAFF_COUNT_IDS[v] ? `urn:li:staffCountRange:${STAFF_COUNT_IDS[v]}` : null)
      .filter(Boolean)
    if (values.length) facets.push({ type: 'staffCountRanges', values })
  }

  if (targeting.geographies?.length) {
    const values = targeting.geographies
      .map((v: string) => v.startsWith('urn:') ? v : GEO_IDS[v] ? `urn:li:geo:${GEO_IDS[v]}` : null)
      .filter(Boolean)
    if (values.length) facets.push({ type: 'locations', values })
  }

  if (targeting.matched_audiences?.length) {
    facets.push({ type: 'audienceMatchingSegments', values: targeting.matched_audiences })
  }

  return facets
}

async function handleEstimateAudience(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
): Promise<Record<string, unknown>> {
  const { org_id, ad_account_id, targeting_criteria } = body

  if (!org_id) return { estimated_count: null, error: 'org_id is required' }
  if (!targeting_criteria) return { estimated_count: null, error: 'targeting_criteria is required' }

  const facets = buildTargetingFacets(targeting_criteria)
  if (facets.length === 0) return { estimated_count: null, error: 'At least one targeting facet is required' }

  // Need a LinkedIn token + ad account to estimate
  let token: string
  let resolvedAdAccountId = ad_account_id

  try {
    const integration = await getLinkedInToken(serviceClient, org_id)
    token = integration.token
    if (!resolvedAdAccountId) resolvedAdAccountId = integration.adAccountId
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.log(`${LOG_PREFIX} estimate_audience: no LinkedIn token — ${message}`)
    return { estimated_count: null, error: 'LinkedIn integration not connected. Connect your LinkedIn account to estimate audience size.' }
  }

  if (!resolvedAdAccountId) {
    return { estimated_count: null, error: 'No LinkedIn Ad Account configured. Please connect one in Settings.' }
  }

  if (facets.length === 0) {
    return { estimated_count: null, error: 'Select at least one targeting criterion to estimate audience size.' }
  }

  // LinkedIn audienceCounts uses Rest.li 2.0 targetingCriteriaV2 format:
  // q=targetingCriteriaV2&targetingCriteria=(include:(and:List(
  //   (or:(urn%3Ali%3AadTargetingFacet%3Alocations:List(urn%3Ali%3Ageo%3A103644278))),
  //   (or:(urn%3Ali%3AadTargetingFacet%3Aindustries:List(urn%3Ali%3Aindustry%3A4)))
  // )))
  // URNs must be URL-encoded in query params per Rest.li 2.0

  // Map our facet type names to LinkedIn adTargetingFacet URN names
  const FACET_TYPE_MAP: Record<string, string> = {
    locations: 'locations',
    industries: 'industries',
    seniorities: 'seniorities',
    jobFunctions: 'jobFunctions',
    staffCountRanges: 'staffCountRanges',
  }

  const andClauses: string[] = []
  for (const facet of facets) {
    const facetName = FACET_TYPE_MAP[facet.type]
    if (!facetName) continue

    const encodedFacetUrn = encodeURIComponent(`urn:li:adTargetingFacet:${facetName}`)
    const encodedValues = facet.values.map(v => encodeURIComponent(v)).join(',')
    andClauses.push(`(or:(${encodedFacetUrn}:List(${encodedValues})))`)
  }

  if (andClauses.length === 0) {
    return { estimated_count: null, error: 'No valid targeting facets to estimate.' }
  }

  const targetingParam = `(include:(and:List(${andClauses.join(',')})))`
  const url = `${LINKEDIN_API_BASE}/audienceCounts?q=targetingCriteriaV2&targetingCriteria=${targetingParam}`
  console.log(`${LOG_PREFIX} audienceCounts URL:`, url)
  console.log(`${LOG_PREFIX} audienceCounts facets: ${JSON.stringify(facets)}`)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: linkedInHeaders(token),
    })

    if (response.status === 401) {
      return { estimated_count: null, error: 'LinkedIn token expired. Please reconnect your LinkedIn account.' }
    }

    const text = await response.text()
    let data: any = null
    if (text) {
      try { data = JSON.parse(text) } catch { data = { raw: text } }
    }

    console.log(`${LOG_PREFIX} audienceCounts response (${response.status}):`, text.slice(0, 1000))

    if (!response.ok) {
      // Return the actual LinkedIn error so we can debug
      const liError = data?.message || data?.error || data?.errorDetailType || JSON.stringify(data)
      if (response.status === 403) {
        return { estimated_count: null, error: `LinkedIn 403: ${liError}`, errorDetails: data }
      }
      return { estimated_count: null, error: `LinkedIn API error (${response.status}): ${liError}`, errorDetails: data }
    }

    // Response format: { elements: [{ total, active }] } or { totalResultCount }
    const total = data?.elements?.[0]?.total ?? data?.totalResultCount ?? data?.audienceCount ?? null
    const active = data?.elements?.[0]?.active ?? null

    return { estimated_count: total, active_count: active }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { estimated_count: null, error: `Fetch error: ${message}` }
  }
}

async function handleListAudiences(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
): Promise<Record<string, unknown>> {
  const { org_id } = body
  if (!org_id) throw new Error('org_id is required')

  const { data, error } = await serviceClient
    .from('linkedin_matched_audiences')
    .select('id, org_id, ad_account_id, linkedin_segment_id, name, audience_type, description, member_count, match_rate, upload_status, source_type, source_table_id, source_row_count, last_upload_at, error_message, version_tag, created_by, created_at, updated_at')
    .eq('org_id', org_id)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to list audiences: ${error.message}`)

  return { audiences: data ?? [] }
}

async function handleCreateAudience(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
  userId: string,
): Promise<Record<string, unknown>> {
  const { org_id, ad_account_id, name, audience_type, description } = body

  if (!org_id) throw new Error('org_id is required')
  if (!ad_account_id) throw new Error('ad_account_id is required')
  if (!name) throw new Error('name is required')

  const segmentType = audience_type === 'COMPANY_LIST' ? 'COMPANY' : 'USER'
  const validAudienceType = audience_type === 'COMPANY_LIST' ? 'COMPANY_LIST' : 'CONTACT_LIST'

  // Create DMP segment on LinkedIn
  const { token } = await getLinkedInToken(serviceClient, org_id)
  const linkedInPayload = {
    name,
    type: segmentType,
    accessPolicy: 'PRIVATE',
    sourcePlatform: 'ONA',
    account: `urn:li:sponsoredAccount:${ad_account_id}`,
  }

  const response = await fetch(`${LINKEDIN_API_BASE}/dmpSegments`, {
    method: 'POST',
    headers: linkedInHeaders(token),
    body: JSON.stringify(linkedInPayload),
  })

  if (response.status === 401) {
    throw new Error('LinkedIn token expired. Please reconnect your LinkedIn account.')
  }

  let linkedInSegmentId: string | null = null

  // Get segment ID from response headers or body
  const locationHeader = response.headers.get('Location') || response.headers.get('location')
  const restliId = response.headers.get('x-restli-id') || response.headers.get('X-RestLi-Id')

  if (restliId) {
    linkedInSegmentId = restliId
  } else if (locationHeader) {
    // Location header format: /dmpSegments/{segmentId}
    const parts = locationHeader.split('/')
    linkedInSegmentId = parts[parts.length - 1] || null
  }

  // Read response body — extract segment ID if not found in headers, or check for errors
  const responseText = await response.text()
  if (responseText) {
    try {
      const data = JSON.parse(responseText)
      if (!linkedInSegmentId) {
        linkedInSegmentId = data.id || data.value?.id || null
      }
      if (!response.ok) {
        const errorMessage = data?.message || `LinkedIn API error (${response.status})`
        console.error(`${LOG_PREFIX} ${errorMessage}`)
        throw new Error(errorMessage)
      }
    } catch (parseErr) {
      if (parseErr instanceof SyntaxError && !response.ok) {
        throw new Error(`LinkedIn API error (${response.status})`)
      }
      if (!(parseErr instanceof SyntaxError)) throw parseErr
    }
  } else if (!response.ok) {
    throw new Error(`LinkedIn API error (${response.status})`)
  }

  // Store locally
  const { data: audience, error: insertError } = await serviceClient
    .from('linkedin_matched_audiences')
    .insert({
      org_id,
      ad_account_id,
      linkedin_segment_id: linkedInSegmentId,
      name,
      audience_type: validAudienceType,
      description: description || null,
      upload_status: 'PENDING',
      created_by: userId,
    })
    .select('id, org_id, ad_account_id, linkedin_segment_id, name, audience_type, description, member_count, match_rate, upload_status, source_type, source_table_id, source_row_count, last_upload_at, error_message, version_tag, created_by, created_at, updated_at')
    .single()

  if (insertError) throw new Error(`Failed to save audience: ${insertError.message}`)

  return { audience }
}

async function handleUploadAudienceMembers(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
): Promise<Record<string, unknown>> {
  const { audience_id, members } = body

  if (!audience_id) throw new Error('audience_id is required')
  if (!members || !Array.isArray(members) || members.length === 0) {
    throw new Error('members array is required and must not be empty')
  }

  // Look up the audience
  const { data: audience, error: fetchError } = await serviceClient
    .from('linkedin_matched_audiences')
    .select('id, org_id, ad_account_id, linkedin_segment_id, audience_type')
    .eq('id', audience_id)
    .maybeSingle()

  if (fetchError || !audience) throw new Error('Audience not found')
  if (!audience.linkedin_segment_id) throw new Error('Audience has not been synced to LinkedIn yet')

  const { token } = await getLinkedInToken(serviceClient, audience.org_id)
  const segmentId = audience.linkedin_segment_id

  if (audience.audience_type === 'CONTACT_LIST') {
    // Upload user list — emails
    const emails = members.map((m: Record<string, any>) => m.email).filter(Boolean)
    if (emails.length === 0) throw new Error('No valid emails found in members')

    const csvLines = ['email', ...emails]
    const csvBody = csvLines.join('\n')

    const uploadResponse = await fetch(
      `${LINKEDIN_API_BASE}/dmpSegments/${segmentId}/users`,
      {
        method: 'POST',
        headers: {
          ...linkedInHeaders(token),
          'Content-Type': 'text/csv',
        },
        body: csvBody,
      },
    )

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text()
      console.error(`${LOG_PREFIX} Upload failed: ${errText}`)
      throw new Error(`LinkedIn upload failed (${uploadResponse.status})`)
    }
  } else {
    // COMPANY_LIST — upload companies
    const companies = members.map((m: Record<string, any>) => ({
      companyName: m.company_name || '',
      domain: m.domain || '',
    })).filter((c: { companyName: string; domain: string }) => c.companyName || c.domain)

    if (companies.length === 0) throw new Error('No valid companies found in members')

    const csvLines = ['companyName,domain']
    for (const c of companies) {
      csvLines.push(`"${(c.companyName || '').replace(/"/g, '""')}","${(c.domain || '').replace(/"/g, '""')}"`)
    }
    const csvBody = csvLines.join('\n')

    const uploadResponse = await fetch(
      `${LINKEDIN_API_BASE}/dmpSegments/${segmentId}/companies`,
      {
        method: 'POST',
        headers: {
          ...linkedInHeaders(token),
          'Content-Type': 'text/csv',
        },
        body: csvBody,
      },
    )

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text()
      console.error(`${LOG_PREFIX} Upload failed: ${errText}`)
      throw new Error(`LinkedIn upload failed (${uploadResponse.status})`)
    }
  }

  // Update local record
  const { error: updateError } = await serviceClient
    .from('linkedin_matched_audiences')
    .update({
      upload_status: 'PROCESSING',
      last_upload_at: new Date().toISOString(),
      source_row_count: members.length,
    })
    .eq('id', audience_id)

  if (updateError) {
    console.warn(`${LOG_PREFIX} Failed to update audience status: ${updateError.message}`)
  }

  return { uploaded: members.length, status: 'PROCESSING' }
}

async function handleDeleteAudience(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
): Promise<Record<string, unknown>> {
  const { audience_id } = body
  if (!audience_id) throw new Error('audience_id is required')

  // Look up the audience
  const { data: audience, error: fetchError } = await serviceClient
    .from('linkedin_matched_audiences')
    .select('id, org_id, linkedin_segment_id')
    .eq('id', audience_id)
    .maybeSingle()

  if (fetchError || !audience) throw new Error('Audience not found')

  // Delete from LinkedIn if synced
  if (audience.linkedin_segment_id) {
    try {
      const { token } = await getLinkedInToken(serviceClient, audience.org_id)
      await linkedInFetch(
        `${LINKEDIN_API_BASE}/dmpSegments/${audience.linkedin_segment_id}`,
        {
          method: 'DELETE',
          headers: linkedInHeaders(token),
        },
      )
    } catch (err) {
      // Log but don't block local deletion
      console.warn(`${LOG_PREFIX} LinkedIn segment deletion failed: ${err instanceof Error ? err.message : err}`)
    }
  }

  // Delete from local table
  const { error: deleteError } = await serviceClient
    .from('linkedin_matched_audiences')
    .delete()
    .eq('id', audience_id)

  if (deleteError) throw new Error(`Failed to delete audience: ${deleteError.message}`)

  return { deleted: true }
}

async function handleSyncAudienceStatus(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
): Promise<Record<string, unknown>> {
  const { audience_id } = body
  if (!audience_id) throw new Error('audience_id is required')

  // Look up the audience
  const { data: audience, error: fetchError } = await serviceClient
    .from('linkedin_matched_audiences')
    .select('id, org_id, linkedin_segment_id')
    .eq('id', audience_id)
    .maybeSingle()

  if (fetchError || !audience) throw new Error('Audience not found')
  if (!audience.linkedin_segment_id) throw new Error('Audience has not been synced to LinkedIn yet')

  const { token } = await getLinkedInToken(serviceClient, audience.org_id)
  const result = await linkedInFetch(
    `${LINKEDIN_API_BASE}/dmpSegments/${audience.linkedin_segment_id}`,
    {
      method: 'GET',
      headers: linkedInHeaders(token),
    },
  )

  // Map LinkedIn status to our upload_status
  const segmentData = result.data || {}
  const linkedInStatus = segmentData.status || segmentData.state || null
  let uploadStatus: string = 'PROCESSING'

  if (linkedInStatus === 'READY' || linkedInStatus === 'ACTIVE') {
    uploadStatus = 'READY'
  } else if (linkedInStatus === 'FAILED' || linkedInStatus === 'ERROR') {
    uploadStatus = 'FAILED'
  } else if (linkedInStatus === 'EXPIRED') {
    uploadStatus = 'EXPIRED'
  }

  const memberCount = segmentData.matchedCount ?? segmentData.audienceCount ?? segmentData.size ?? null
  const matchRate = segmentData.matchRate ?? null

  // Update local record
  const updatePayload: Record<string, any> = {
    upload_status: uploadStatus,
  }
  if (memberCount !== null) updatePayload.member_count = memberCount
  if (matchRate !== null) updatePayload.match_rate = matchRate

  const { data: updated, error: updateError } = await serviceClient
    .from('linkedin_matched_audiences')
    .update(updatePayload)
    .eq('id', audience_id)
    .select('id, org_id, ad_account_id, linkedin_segment_id, name, audience_type, description, member_count, match_rate, upload_status, source_type, source_table_id, source_row_count, last_upload_at, error_message, version_tag, created_by, created_at, updated_at')
    .single()

  if (updateError) throw new Error(`Failed to update audience: ${updateError.message}`)

  return { audience: updated }
}

async function handlePushOpsToAudience(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
  userId: string,
): Promise<Record<string, unknown>> {
  const {
    org_id, ad_account_id, table_id, row_ids, field_mapping,
    audience_id, audience_name, audience_type,
  } = body

  if (!org_id) throw new Error('org_id is required')
  if (!ad_account_id) throw new Error('ad_account_id is required')
  if (!table_id) throw new Error('table_id is required')
  if (!row_ids || !Array.isArray(row_ids) || row_ids.length === 0) {
    throw new Error('row_ids array is required and must not be empty')
  }
  if (!field_mapping) throw new Error('field_mapping is required')

  // Determine which column IDs to fetch
  const columnIds: string[] = []
  if (field_mapping.email_column_id) columnIds.push(field_mapping.email_column_id)
  if (field_mapping.company_column_id) columnIds.push(field_mapping.company_column_id)
  if (field_mapping.domain_column_id) columnIds.push(field_mapping.domain_column_id)

  if (columnIds.length === 0) {
    throw new Error('field_mapping must contain at least one of: email_column_id, company_column_id, domain_column_id')
  }

  // Read cells from dynamic_table_cells
  const { data: cells, error: cellsError } = await serviceClient
    .from('dynamic_table_cells')
    .select('row_id, column_id, value')
    .in('row_id', row_ids)
    .in('column_id', columnIds)

  if (cellsError) throw new Error(`Failed to read ops table data: ${cellsError.message}`)

  // Group cell values by row
  const rowData: Record<string, Record<string, string>> = {}
  for (const cell of (cells || [])) {
    if (!rowData[cell.row_id]) rowData[cell.row_id] = {}
    rowData[cell.row_id][cell.column_id] = cell.value || ''
  }

  // Build members list
  const resolvedType = audience_type === 'COMPANY_LIST' ? 'COMPANY_LIST' : 'CONTACT_LIST'
  const members: Array<Record<string, string>> = []

  for (const rowId of row_ids) {
    const row = rowData[rowId]
    if (!row) continue

    if (resolvedType === 'CONTACT_LIST' && field_mapping.email_column_id) {
      const email = row[field_mapping.email_column_id]
      if (email) members.push({ email })
    } else if (resolvedType === 'COMPANY_LIST') {
      const companyName = field_mapping.company_column_id ? row[field_mapping.company_column_id] || '' : ''
      const domain = field_mapping.domain_column_id ? row[field_mapping.domain_column_id] || '' : ''
      if (companyName || domain) members.push({ company_name: companyName, domain })
    }
  }

  if (members.length === 0) {
    throw new Error('No valid members found in the selected rows')
  }

  // Create or reuse audience
  let targetAudienceId = audience_id
  if (!targetAudienceId) {
    if (!audience_name) throw new Error('audience_name is required when creating a new audience')
    const createResult = await handleCreateAudience(serviceClient, {
      org_id,
      ad_account_id,
      name: audience_name,
      audience_type: resolvedType,
      description: `Auto-created from ops table`,
    }, userId)
    const created = createResult.audience as Record<string, any>
    targetAudienceId = created.id
  }

  // Upload members
  await handleUploadAudienceMembers(serviceClient, {
    audience_id: targetAudienceId,
    members,
  })

  // Update the audience with source info
  const { error: updateError } = await serviceClient
    .from('linkedin_matched_audiences')
    .update({
      source_type: 'ops_table',
      source_table_id: table_id,
      source_row_count: members.length,
    })
    .eq('id', targetAudienceId)

  if (updateError) {
    console.warn(`${LOG_PREFIX} Failed to update audience source info: ${updateError.message}`)
  }

  return { audience_id: targetAudienceId, uploaded: members.length, status: 'PROCESSING' }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const body = await req.json()
    const { action } = body

    if (!action || !VALID_ACTIONS.includes(action)) {
      return errorResponse(
        `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`,
        req,
        400,
      )
    }

    // Authenticate user via JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Unauthorized', req, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return errorResponse('Unauthorized', req, 401)

    // Validate org membership for actions that need org_id
    const orgId = body.org_id || body.campaign_id || body.group_id || body.creative_id
      ? body.org_id
      : null

    if (orgId) {
      await validateOrgMembership(
        createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }),
        user.id,
        orgId,
      )
    }

    // Service role client for all DB operations
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // For actions that reference a record by ID without org_id, look up the org
    if (!orgId && (body.campaign_id || body.group_id || body.creative_id || body.audience_id)) {
      let resolvedOrgId: string | null = null

      if (body.campaign_id && ['get_campaign', 'update_campaign', 'update_status', 'list_creatives'].includes(action)) {
        const { data: c } = await serviceClient
          .from('linkedin_managed_campaigns')
          .select('org_id')
          .eq('id', body.campaign_id)
          .maybeSingle()
        resolvedOrgId = c?.org_id || null
      } else if (body.group_id && action === 'update_group') {
        const { data: g } = await serviceClient
          .from('linkedin_managed_campaign_groups')
          .select('org_id')
          .eq('id', body.group_id)
          .maybeSingle()
        resolvedOrgId = g?.org_id || null
      } else if (body.creative_id && action === 'update_creative') {
        const { data: cr } = await serviceClient
          .from('linkedin_managed_creatives')
          .select('org_id')
          .eq('id', body.creative_id)
          .maybeSingle()
        resolvedOrgId = cr?.org_id || null
      } else if (body.audience_id && ['upload_audience_members', 'delete_audience', 'sync_audience_status'].includes(action)) {
        const { data: a } = await serviceClient
          .from('linkedin_matched_audiences')
          .select('org_id')
          .eq('id', body.audience_id)
          .maybeSingle()
        resolvedOrgId = a?.org_id || null
      }

      if (resolvedOrgId) {
        await validateOrgMembership(serviceClient, user.id, resolvedOrgId)
      }
    }

    let result: Record<string, unknown>

    switch (action as Action) {
      // Campaign Groups
      case 'list_groups':
        result = await handleListGroups(serviceClient, body)
        break
      case 'create_group':
        result = await handleCreateGroup(serviceClient, body, user.id)
        break
      case 'update_group':
        result = await handleUpdateGroup(serviceClient, body)
        break

      // Campaigns
      case 'list_campaigns':
        result = await handleListCampaigns(serviceClient, body)
        break
      case 'get_campaign':
        result = await handleGetCampaign(serviceClient, body)
        break
      case 'create_campaign':
        result = await handleCreateCampaign(serviceClient, body, user.id)
        break
      case 'update_campaign':
        result = await handleUpdateCampaign(serviceClient, body)
        break
      case 'update_status':
        result = await handleUpdateStatus(serviceClient, body)
        break

      // Creatives
      case 'list_creatives':
        result = await handleListCreatives(serviceClient, body)
        break
      case 'create_creative':
        result = await handleCreateCreative(serviceClient, body, user.id)
        break
      case 'update_creative':
        result = await handleUpdateCreative(serviceClient, body)
        break

      // Audiences
      case 'estimate_audience':
        result = await handleEstimateAudience(serviceClient, body)
        break
      case 'list_audiences':
        result = await handleListAudiences(serviceClient, body)
        break
      case 'create_audience':
        result = await handleCreateAudience(serviceClient, body, user.id)
        break
      case 'upload_audience_members':
        result = await handleUploadAudienceMembers(serviceClient, body)
        break
      case 'delete_audience':
        result = await handleDeleteAudience(serviceClient, body)
        break
      case 'sync_audience_status':
        result = await handleSyncAudienceStatus(serviceClient, body)
        break
      case 'push_ops_to_audience':
        result = await handlePushOpsToAudience(serviceClient, body, user.id)
        break

      default:
        return errorResponse(`Unknown action: ${action}`, req, 400)
    }

    return jsonResponse(result, req)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    const status = message.includes('not found') ? 404
      : message.includes('Unauthorized') || message.includes('not have access') ? 403
      : message.includes('Version conflict') ? 409
      : message.includes('token expired') || message.includes('reconnect') ? 502
      : 500

    console.error(`${LOG_PREFIX} Error:`, err)
    return errorResponse(message, req, status)
  }
})
