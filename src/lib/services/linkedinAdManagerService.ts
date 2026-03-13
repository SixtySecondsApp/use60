/**
 * LinkedIn Ad Manager Service
 *
 * Wraps edge function calls for campaign management, sync, and approvals.
 * Uses supabase.functions.invoke() for auth.
 */

import { supabase } from '@/lib/supabase/clientV2'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ManagedCampaignGroup {
  id: string
  org_id: string
  ad_account_id: string
  linkedin_group_id: string | null
  name: string
  status: string
  daily_budget_amount: number | null
  total_budget_amount: number | null
  currency_code: string
  run_schedule_start: string | null
  run_schedule_end: string | null
  version_tag: string | null
  created_by: string | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export interface ManagedCampaign {
  id: string
  org_id: string
  ad_account_id: string
  campaign_group_id: string | null
  linkedin_campaign_id: string | null
  name: string
  objective_type: string
  campaign_type: string | null
  format: string | null
  status: string
  daily_budget_amount: number | null
  total_budget_amount: number | null
  currency_code: string
  unit_cost_amount: number | null
  cost_type: string | null
  targeting_criteria: Record<string, any>
  run_schedule_start: string | null
  run_schedule_end: string | null
  pacing_strategy: string
  audience_expansion_enabled: boolean
  offsite_delivery_enabled: boolean
  version_tag: string | null
  is_externally_modified: boolean
  last_external_modification_at: string | null
  created_by: string | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
  // Joined data
  creatives?: ManagedCreative[]
  group?: ManagedCampaignGroup | null
  // Inline metrics from linkedin_campaign_metrics
  total_impressions?: number
  total_clicks?: number
  total_spend?: number
  total_leads?: number
  avg_ctr?: number
  avg_cpc?: number
  avg_cpl?: number
}

export interface ManagedCreative {
  id: string
  org_id: string
  campaign_id: string
  linkedin_creative_id: string | null
  headline: string | null
  body_text: string | null
  cta_text: string | null
  destination_url: string | null
  media_type: string
  media_asset_id: string | null
  media_url: string | null
  status: string
  is_direct_sponsored: boolean
  version_tag: string | null
  created_by: string | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export interface ManagedLeadForm {
  id: string
  org_id: string
  linkedin_form_id: string | null
  name: string
  headline: string | null
  description: string | null
  fields: Array<{ fieldType: string; label: string; required: boolean }>
  thank_you_message: string | null
  landing_page_url: string | null
  privacy_policy_url: string | null
  status: string
  created_by: string | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export interface CampaignApproval {
  id: string
  org_id: string
  campaign_id: string | null
  action_type: string
  requested_by: string
  approved_by: string | null
  status: 'pending' | 'approved' | 'rejected'
  details: Record<string, any>
  resolved_at: string | null
  created_at: string
  // Joined
  campaign_name?: string
}

export interface CreateCampaignParams {
  org_id: string
  ad_account_id: string
  name: string
  objective_type: string
  format?: string
  campaign_group_id?: string
  targeting_criteria?: Record<string, any>
  daily_budget_amount?: number
  total_budget_amount?: number
  currency_code?: string
  cost_type?: string
  unit_cost_amount?: number
  run_schedule_start?: string
  run_schedule_end?: string
  pacing_strategy?: string
  audience_expansion_enabled?: boolean
  offsite_delivery_enabled?: boolean
  lead_form_id?: string
}

export interface CreateGroupParams {
  org_id: string
  ad_account_id: string
  name: string
  status?: string
  daily_budget_amount?: number
  total_budget_amount?: number
  currency_code?: string
  run_schedule_start?: string
  run_schedule_end?: string
}

export interface CreateCreativeParams {
  campaign_id: string
  headline: string
  body_text?: string
  cta_text?: string
  destination_url: string
  media_type?: string
  media_asset_id?: string
  is_direct_sponsored?: boolean
}

export interface SyncResult {
  campaigns_synced: number
  groups_synced: number
  creatives_synced: number
  drift_detected: number
}

export interface MatchedAudience {
  id: string
  org_id: string
  ad_account_id: string
  linkedin_segment_id: string | null
  name: string
  audience_type: 'CONTACT_LIST' | 'COMPANY_LIST'
  description: string | null
  member_count: number
  match_rate: number | null
  upload_status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'EXPIRED'
  source_type: string | null
  source_table_id: string | null
  source_row_count: number | null
  last_upload_at: string | null
  error_message: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface AudienceEstimate {
  estimated_count: number | null
  error?: string
}

export interface CreateAudienceParams {
  org_id: string
  ad_account_id: string
  name: string
  audience_type: 'CONTACT_LIST' | 'COMPANY_LIST'
  description?: string
}

export interface UploadAudienceMembersParams {
  audience_id: string
  members: Array<{ email?: string; company_name?: string; domain?: string }>
}

export interface PushOpsToAudienceParams {
  org_id: string
  ad_account_id: string
  table_id: string
  row_ids: string[]
  field_mapping: { email_column_id?: string; company_column_id?: string; domain_column_id?: string }
  audience_id?: string
  audience_name?: string
  audience_type?: 'CONTACT_LIST' | 'COMPANY_LIST'
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class LinkedInAdManagerService {
  // -- Campaign Groups --

  async listGroups(orgId: string, adAccountId?: string): Promise<ManagedCampaignGroup[]> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-manager', {
      body: { action: 'list_groups', org_id: orgId, ad_account_id: adAccountId },
    })
    if (error) throw new Error(error.message || 'Failed to load campaign groups')
    if (data?.error) throw new Error(data.error)
    return (data?.groups ?? data ?? []) as ManagedCampaignGroup[]
  }

  async createGroup(params: CreateGroupParams): Promise<ManagedCampaignGroup> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-manager', {
      body: { action: 'create_group', ...params },
    })
    if (error) throw new Error(error.message || 'Failed to create campaign group')
    if (data?.error) throw new Error(data.error)
    return (data?.group ?? data) as ManagedCampaignGroup
  }

  async updateGroup(groupId: string, updates: Partial<ManagedCampaignGroup>): Promise<ManagedCampaignGroup> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-manager', {
      body: { action: 'update_group', group_id: groupId, ...updates },
    })
    if (error) throw new Error(error.message || 'Failed to update campaign group')
    if (data?.error) throw new Error(data.error)
    return (data?.group ?? data) as ManagedCampaignGroup
  }

  // -- Campaigns --

  async listCampaigns(orgId: string, filters?: {
    ad_account_id?: string
    status?: string
    campaign_group_id?: string
  }): Promise<ManagedCampaign[]> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-manager', {
      body: { action: 'list_campaigns', org_id: orgId, ...filters },
    })
    if (error) throw new Error(error.message || 'Failed to load campaigns')
    if (data?.error) throw new Error(data.error)
    return (data?.campaigns ?? data ?? []) as ManagedCampaign[]
  }

  async getCampaign(campaignId: string): Promise<ManagedCampaign> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-manager', {
      body: { action: 'get_campaign', campaign_id: campaignId },
    })
    if (error) throw new Error(error.message || 'Failed to load campaign')
    if (data?.error) throw new Error(data.error)
    return (data?.campaign ?? data) as ManagedCampaign
  }

  async createCampaign(params: CreateCampaignParams): Promise<ManagedCampaign> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-manager', {
      body: { action: 'create_campaign', ...params },
    })
    if (error) throw new Error(error.message || 'Failed to create campaign')
    if (data?.error) throw new Error(data.error)
    return (data?.campaign ?? data) as ManagedCampaign
  }

  async updateCampaign(campaignId: string, updates: Partial<ManagedCampaign>): Promise<ManagedCampaign> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-manager', {
      body: { action: 'update_campaign', campaign_id: campaignId, ...updates },
    })
    if (error) throw new Error(error.message || 'Failed to update campaign')
    if (data?.error) throw new Error(data.error)
    return (data?.campaign ?? data) as ManagedCampaign
  }

  async updateCampaignStatus(campaignId: string, status: string, versionTag?: string): Promise<ManagedCampaign> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-manager', {
      body: { action: 'update_status', campaign_id: campaignId, status, version_tag: versionTag },
    })
    if (error) throw new Error(error.message || 'Failed to update campaign status')
    if (data?.error) throw new Error(data.error)
    return (data?.campaign ?? data) as ManagedCampaign
  }

  // -- Creatives --

  async listCreatives(campaignId: string): Promise<ManagedCreative[]> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-manager', {
      body: { action: 'list_creatives', campaign_id: campaignId },
    })
    if (error) throw new Error(error.message || 'Failed to load creatives')
    if (data?.error) throw new Error(data.error)
    return (data?.creatives ?? data ?? []) as ManagedCreative[]
  }

  async createCreative(params: CreateCreativeParams): Promise<ManagedCreative> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-manager', {
      body: { action: 'create_creative', ...params },
    })
    if (error) throw new Error(error.message || 'Failed to create creative')
    if (data?.error) throw new Error(data.error)
    return (data?.creative ?? data) as ManagedCreative
  }

  async updateCreative(creativeId: string, updates: Partial<ManagedCreative>): Promise<ManagedCreative> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-manager', {
      body: { action: 'update_creative', creative_id: creativeId, ...updates },
    })
    if (error) throw new Error(error.message || 'Failed to update creative')
    if (data?.error) throw new Error(data.error)
    return (data?.creative ?? data) as ManagedCreative
  }

  // -- Sync --

  async syncCampaigns(orgId: string, adAccountId?: string): Promise<SyncResult> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-sync', {
      body: { action: 'sync', org_id: orgId, ad_account_id: adAccountId },
    })
    if (error) throw new Error(error.message || 'Failed to sync campaigns')
    if (data?.error) throw new Error(data.error)
    return data as SyncResult
  }

  // -- Approvals --

  async requestApproval(params: {
    org_id: string
    campaign_id: string
    action_type: string
    details?: Record<string, any>
  }): Promise<CampaignApproval & { auto_approved?: boolean }> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-approval', {
      body: { action: 'request_approval', ...params },
    })
    if (error) throw new Error(error.message || 'Failed to request approval')
    if (data?.error) throw new Error(data.error)
    return (data?.approval ?? data) as CampaignApproval & { auto_approved?: boolean }
  }

  async approveAction(approvalId: string): Promise<CampaignApproval> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-approval', {
      body: { action: 'approve', approval_id: approvalId },
    })
    if (error) throw new Error(error.message || 'Failed to approve action')
    if (data?.error) throw new Error(data.error)
    return (data?.approval ?? data) as CampaignApproval
  }

  async rejectAction(approvalId: string, reason?: string): Promise<CampaignApproval> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-approval', {
      body: { action: 'reject', approval_id: approvalId, reason },
    })
    if (error) throw new Error(error.message || 'Failed to reject action')
    if (data?.error) throw new Error(data.error)
    return (data?.approval ?? data) as CampaignApproval
  }

  async listPendingApprovals(orgId: string): Promise<CampaignApproval[]> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-approval', {
      body: { action: 'list_pending', org_id: orgId },
    })
    if (error) throw new Error(error.message || 'Failed to load pending approvals')
    if (data?.error) throw new Error(data.error)
    return (data?.approvals ?? data ?? []) as CampaignApproval[]
  }

  // -- Audiences --

  async estimateAudience(orgId: string, adAccountId: string, targetingCriteria: Record<string, any>): Promise<AudienceEstimate> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-manager', {
      body: { action: 'estimate_audience', org_id: orgId, ad_account_id: adAccountId, targeting_criteria: targetingCriteria },
    })
    if (error) throw new Error(error.message || 'Failed to estimate audience')
    if (data?.error) throw new Error(data.error)
    return (data?.estimate ?? data) as AudienceEstimate
  }

  async listAudiences(orgId: string): Promise<MatchedAudience[]> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-manager', {
      body: { action: 'list_audiences', org_id: orgId },
    })
    if (error) throw new Error(error.message || 'Failed to load audiences')
    if (data?.error) throw new Error(data.error)
    return (data?.audiences ?? data ?? []) as MatchedAudience[]
  }

  async createAudience(params: CreateAudienceParams): Promise<MatchedAudience> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-manager', {
      body: { action: 'create_audience', ...params },
    })
    if (error) throw new Error(error.message || 'Failed to create audience')
    if (data?.error) throw new Error(data.error)
    return (data?.audience ?? data) as MatchedAudience
  }

  async uploadAudienceMembers(params: UploadAudienceMembersParams): Promise<{ uploaded_count: number }> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-manager', {
      body: { action: 'upload_audience_members', ...params },
    })
    if (error) throw new Error(error.message || 'Failed to upload audience members')
    if (data?.error) throw new Error(data.error)
    return (data ?? { uploaded_count: 0 }) as { uploaded_count: number }
  }

  async deleteAudience(audienceId: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-manager', {
      body: { action: 'delete_audience', audience_id: audienceId },
    })
    if (error) throw new Error(error.message || 'Failed to delete audience')
    if (data?.error) throw new Error(data.error)
  }

  async syncAudienceStatus(audienceId: string): Promise<MatchedAudience> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-manager', {
      body: { action: 'sync_audience_status', audience_id: audienceId },
    })
    if (error) throw new Error(error.message || 'Failed to sync audience status')
    if (data?.error) throw new Error(data.error)
    return (data?.audience ?? data) as MatchedAudience
  }

  async pushOpsToAudience(params: PushOpsToAudienceParams): Promise<MatchedAudience> {
    const { data, error } = await supabase.functions.invoke('linkedin-campaign-manager', {
      body: { action: 'push_ops_to_audience', ...params },
    })
    if (error) throw new Error(error.message || 'Failed to push ops to audience')
    if (data?.error) throw new Error(data.error)
    return (data?.audience ?? data) as MatchedAudience
  }
}

export const linkedinAdManagerService = new LinkedInAdManagerService()
