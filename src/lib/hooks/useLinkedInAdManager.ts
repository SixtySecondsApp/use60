import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/lib/contexts/AuthContext'
import { useOrgStore } from '@/lib/stores/orgStore'
import { toast } from 'sonner'
import {
  linkedinAdManagerService,
  ManagedCampaign,
  ManagedCampaignGroup,
  ManagedCreative,
  CampaignApproval,
  CreateCampaignParams,
  CreateGroupParams,
  CreateCreativeParams,
  SyncResult,
} from '@/lib/services/linkedinAdManagerService'

export function useLinkedInAdManager() {
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const activeOrgId = useOrgStore((s) => s.activeOrgId)
  const orgLoading = useOrgStore((s) => s.isLoading)

  // Campaigns
  const [campaigns, setCampaigns] = useState<ManagedCampaign[]>([])
  const [campaignsLoading, setCampaignsLoading] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<ManagedCampaign | null>(null)

  // Campaign groups
  const [groups, setGroups] = useState<ManagedCampaignGroup[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)

  // Creatives
  const [creatives, setCreatives] = useState<ManagedCreative[]>([])
  const [creativesLoading, setCreativesLoading] = useState(false)

  // Approvals
  const [approvals, setApprovals] = useState<CampaignApproval[]>([])
  const [approvalsLoading, setApprovalsLoading] = useState(false)

  // Sync
  const [syncing, setSyncing] = useState(false)

  const initialLoadDone = useRef(false)
  const ready = isAuthenticated && !!user && !!activeOrgId && !authLoading && !orgLoading

  // ---------------------------------------------------------------------------
  // Campaigns
  // ---------------------------------------------------------------------------

  const loadCampaigns = useCallback(async (filters?: { status?: string; campaign_group_id?: string }) => {
    if (!ready || !activeOrgId) return
    try {
      setCampaignsLoading(true)
      const result = await linkedinAdManagerService.listCampaigns(activeOrgId, filters)
      setCampaigns(result)
    } catch (e: any) {
      toast.error(e.message || 'Failed to load campaigns')
    } finally {
      setCampaignsLoading(false)
    }
  }, [ready, activeOrgId])

  const getCampaign = useCallback(async (campaignId: string) => {
    if (!ready) return null
    try {
      const campaign = await linkedinAdManagerService.getCampaign(campaignId)
      setSelectedCampaign(campaign)
      return campaign
    } catch (e: any) {
      toast.error(e.message || 'Failed to load campaign')
      return null
    }
  }, [ready])

  const createCampaign = useCallback(async (params: Omit<CreateCampaignParams, 'org_id'> & { ad_account_id: string }) => {
    if (!ready || !activeOrgId) return null
    try {
      const campaign = await linkedinAdManagerService.createCampaign({
        ...params,
        org_id: activeOrgId,
      })
      toast.success('Campaign created as draft')
      setCampaigns((prev) => [campaign, ...prev])
      return campaign
    } catch (e: any) {
      toast.error(e.message || 'Failed to create campaign')
      return null
    }
  }, [ready, activeOrgId])

  const updateCampaignStatus = useCallback(async (campaignId: string, status: string, versionTag?: string) => {
    if (!ready) return null
    try {
      const updated = await linkedinAdManagerService.updateCampaignStatus(campaignId, status, versionTag)
      setCampaigns((prev) => prev.map((c) => c.id === campaignId ? { ...c, ...updated } : c))
      toast.success(`Campaign ${status.toLowerCase()}`)
      return updated
    } catch (e: any) {
      toast.error(e.message || 'Failed to update campaign status')
      return null
    }
  }, [ready])

  // ---------------------------------------------------------------------------
  // Campaign Groups
  // ---------------------------------------------------------------------------

  const loadGroups = useCallback(async () => {
    if (!ready || !activeOrgId) return
    try {
      setGroupsLoading(true)
      const result = await linkedinAdManagerService.listGroups(activeOrgId)
      setGroups(result)
    } catch (e: any) {
      toast.error(e.message || 'Failed to load campaign groups')
    } finally {
      setGroupsLoading(false)
    }
  }, [ready, activeOrgId])

  const createGroup = useCallback(async (params: Omit<CreateGroupParams, 'org_id'> & { ad_account_id: string }) => {
    if (!ready || !activeOrgId) return null
    try {
      const group = await linkedinAdManagerService.createGroup({
        ...params,
        org_id: activeOrgId,
      })
      toast.success('Campaign group created')
      setGroups((prev) => [group, ...prev])
      return group
    } catch (e: any) {
      toast.error(e.message || 'Failed to create campaign group')
      return null
    }
  }, [ready, activeOrgId])

  // ---------------------------------------------------------------------------
  // Creatives
  // ---------------------------------------------------------------------------

  const loadCreatives = useCallback(async (campaignId: string) => {
    if (!ready) return
    try {
      setCreativesLoading(true)
      const result = await linkedinAdManagerService.listCreatives(campaignId)
      setCreatives(result)
    } catch (e: any) {
      toast.error(e.message || 'Failed to load creatives')
    } finally {
      setCreativesLoading(false)
    }
  }, [ready])

  const createCreative = useCallback(async (params: CreateCreativeParams) => {
    if (!ready) return null
    try {
      const creative = await linkedinAdManagerService.createCreative(params)
      toast.success('Creative created')
      setCreatives((prev) => [creative, ...prev])
      return creative
    } catch (e: any) {
      toast.error(e.message || 'Failed to create creative')
      return null
    }
  }, [ready])

  // ---------------------------------------------------------------------------
  // Approvals
  // ---------------------------------------------------------------------------

  const loadApprovals = useCallback(async () => {
    if (!ready || !activeOrgId) return
    try {
      setApprovalsLoading(true)
      const result = await linkedinAdManagerService.listPendingApprovals(activeOrgId)
      setApprovals(result)
    } catch (e: any) {
      toast.error(e.message || 'Failed to load approvals')
    } finally {
      setApprovalsLoading(false)
    }
  }, [ready, activeOrgId])

  const requestApproval = useCallback(async (campaignId: string, actionType: string, details?: Record<string, any>) => {
    if (!ready || !activeOrgId) return null
    try {
      const result = await linkedinAdManagerService.requestApproval({
        org_id: activeOrgId,
        campaign_id: campaignId,
        action_type: actionType,
        details,
      })
      if (result.auto_approved) {
        toast.success('Action auto-approved and executed')
      } else {
        toast.success('Approval requested')
        setApprovals((prev) => [result, ...prev])
      }
      return result
    } catch (e: any) {
      toast.error(e.message || 'Failed to request approval')
      return null
    }
  }, [ready, activeOrgId])

  const approveAction = useCallback(async (approvalId: string) => {
    if (!ready) return null
    try {
      const result = await linkedinAdManagerService.approveAction(approvalId)
      toast.success('Action approved')
      setApprovals((prev) => prev.filter((a) => a.id !== approvalId))
      return result
    } catch (e: any) {
      toast.error(e.message || 'Failed to approve action')
      return null
    }
  }, [ready])

  const rejectAction = useCallback(async (approvalId: string, reason?: string) => {
    if (!ready) return null
    try {
      const result = await linkedinAdManagerService.rejectAction(approvalId, reason)
      toast.success('Action rejected')
      setApprovals((prev) => prev.filter((a) => a.id !== approvalId))
      return result
    } catch (e: any) {
      toast.error(e.message || 'Failed to reject action')
      return null
    }
  }, [ready])

  // ---------------------------------------------------------------------------
  // Sync
  // ---------------------------------------------------------------------------

  const syncCampaigns = useCallback(async () => {
    if (!ready || !activeOrgId) return null
    try {
      setSyncing(true)
      const result = await linkedinAdManagerService.syncCampaigns(activeOrgId)
      toast.success(`Synced ${result.campaigns_synced} campaigns`)
      await loadCampaigns()
      return result
    } catch (e: any) {
      toast.error(e.message || 'Failed to sync campaigns')
      return null
    } finally {
      setSyncing(false)
    }
  }, [ready, activeOrgId, loadCampaigns])

  // ---------------------------------------------------------------------------
  // Initial load
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!ready || initialLoadDone.current) return
    initialLoadDone.current = true
    loadCampaigns()
    loadGroups()
    loadApprovals()
  }, [ready, loadCampaigns, loadGroups, loadApprovals])

  return {
    // Campaigns
    campaigns,
    campaignsLoading,
    selectedCampaign,
    setSelectedCampaign,
    loadCampaigns,
    getCampaign,
    createCampaign,
    updateCampaignStatus,
    // Groups
    groups,
    groupsLoading,
    loadGroups,
    createGroup,
    // Creatives
    creatives,
    creativesLoading,
    loadCreatives,
    createCreative,
    // Approvals
    approvals,
    approvalsLoading,
    loadApprovals,
    requestApproval,
    approveAction,
    rejectAction,
    // Sync
    syncing,
    syncCampaigns,
    // Auth state
    ready,
  }
}
