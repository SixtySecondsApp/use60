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
// ---------------------------------------------------------------------------

const LOG_PREFIX = '[linkedin-campaign-manager]'
const LINKEDIN_API_BASE = 'https://api.linkedin.com/rest'
const LINKEDIN_API_VERSION = '202405'

const VALID_ACTIONS = [
  'list_groups', 'create_group', 'update_group',
  'list_campaigns', 'get_campaign', 'create_campaign', 'update_campaign', 'update_status',
  'list_creatives', 'create_creative', 'update_creative',
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
    .select('id')
    .eq('user_id', userId)
    .eq('organization_id', orgId)
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
    if (!orgId && (body.campaign_id || body.group_id || body.creative_id)) {
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
