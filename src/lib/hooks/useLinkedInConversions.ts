import { useState, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/contexts/AuthContext'
import { useOrgStore } from '@/lib/stores/orgStore'
import {
  conversionService,
  type ConversionRule,
  type ConversionMapping,
  type ConversionEvent,
  type ConversionStats,
} from '@/lib/services/conversionService'

export function useLinkedInConversions() {
  const { user, isAuthenticated } = useAuth()
  const activeOrgId = useOrgStore((s) => s.activeOrgId)
  const ready = isAuthenticated && !!user && !!activeOrgId
  const initialLoadDone = useRef(false)

  // State
  const [rules, setRules] = useState<ConversionRule[]>([])
  const [mappings, setMappings] = useState<ConversionMapping[]>([])
  const [events, setEvents] = useState<ConversionEvent[]>([])
  const [stats, setStats] = useState<ConversionStats | null>(null)

  const [rulesLoading, setRulesLoading] = useState(false)
  const [mappingsLoading, setMappingsLoading] = useState(false)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null) // rule_id being synced

  // ---------------------------------------------------------------
  // Rules
  // ---------------------------------------------------------------

  const fetchRules = useCallback(async () => {
    if (!ready) return
    try {
      setRulesLoading(true)
      const data = await conversionService.getRules()
      setRules(data)
    } catch (e: any) {
      toast.error(e.message || 'Failed to load conversion rules')
    } finally {
      setRulesLoading(false)
    }
  }, [ready])

  const createRule = useCallback(async (params: {
    name: string
    milestone_event: string
    linkedin_ad_account_id: string
    conversion_value_amount?: number
    conversion_value_currency?: string
  }) => {
    if (!ready) return
    try {
      const rule = await conversionService.createRule(params)
      setRules(prev => [rule, ...prev])
      toast.success(`Conversion rule "${params.name}" created`)
      // Refresh mappings since one was auto-created
      fetchMappings()
      return rule
    } catch (e: any) {
      toast.error(e.message || 'Failed to create rule')
    }
  }, [ready])

  const updateRule = useCallback(async (ruleId: string, updates: Partial<ConversionRule>) => {
    if (!ready) return
    try {
      const rule = await conversionService.updateRule(ruleId, updates)
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, ...rule } : r))
      toast.success('Rule updated')
    } catch (e: any) {
      toast.error(e.message || 'Failed to update rule')
    }
  }, [ready])

  const deleteRule = useCallback(async (ruleId: string) => {
    if (!ready) return
    try {
      await conversionService.deleteRule(ruleId)
      setRules(prev => prev.filter(r => r.id !== ruleId))
      toast.success('Rule deleted')
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete rule')
    }
  }, [ready])

  const syncRule = useCallback(async (ruleId: string) => {
    if (!ready) return
    try {
      setSyncing(ruleId)
      await conversionService.syncRuleToLinkedIn(ruleId)
      toast.success('Rule synced to LinkedIn')
      fetchRules()
    } catch (e: any) {
      toast.error(e.message || 'Failed to sync rule')
    } finally {
      setSyncing(null)
    }
  }, [ready, fetchRules])

  // ---------------------------------------------------------------
  // Mappings
  // ---------------------------------------------------------------

  const fetchMappings = useCallback(async () => {
    if (!ready) return
    try {
      setMappingsLoading(true)
      const data = await conversionService.getMappings()
      setMappings(data)
    } catch (e: any) {
      toast.error(e.message || 'Failed to load mappings')
    } finally {
      setMappingsLoading(false)
    }
  }, [ready])

  const toggleMapping = useCallback(async (mappingId: string, enabled?: boolean) => {
    if (!ready) return
    try {
      const mapping = await conversionService.toggleMapping(mappingId, enabled)
      setMappings(prev => prev.map(m => m.id === mappingId ? { ...m, ...mapping } : m))
    } catch (e: any) {
      toast.error(e.message || 'Failed to toggle mapping')
    }
  }, [ready])

  // ---------------------------------------------------------------
  // Events & Status
  // ---------------------------------------------------------------

  const fetchEvents = useCallback(async (page = 0) => {
    if (!ready) return
    try {
      setEventsLoading(true)
      const data = await conversionService.getConversionStatus(page)
      setEvents(data.events)
      setStats(data.stats)
    } catch (e: any) {
      toast.error(e.message || 'Failed to load events')
    } finally {
      setEventsLoading(false)
    }
  }, [ready])

  const retryFailed = useCallback(async () => {
    if (!ready || !activeOrgId) return
    try {
      const result = await conversionService.retryFailed(activeOrgId)
      toast.success(`${result.retried} events queued for retry`)
      fetchEvents()
    } catch (e: any) {
      toast.error(e.message || 'Failed to retry events')
    }
  }, [ready, activeOrgId, fetchEvents])

  // ---------------------------------------------------------------
  // Refresh all
  // ---------------------------------------------------------------

  const refreshAll = useCallback(async () => {
    if (!ready) return
    await Promise.all([fetchRules(), fetchMappings(), fetchEvents()])
  }, [ready, fetchRules, fetchMappings, fetchEvents])

  // Initial load
  useEffect(() => {
    if (!ready || initialLoadDone.current) return
    initialLoadDone.current = true
    refreshAll()
  }, [ready, refreshAll])

  // Reset on org change
  useEffect(() => {
    initialLoadDone.current = false
    setRules([])
    setMappings([])
    setEvents([])
    setStats(null)
  }, [activeOrgId])

  return {
    // Rules
    rules,
    rulesLoading,
    fetchRules,
    createRule,
    updateRule,
    deleteRule,
    syncRule,
    syncing,

    // Mappings
    mappings,
    mappingsLoading,
    fetchMappings,
    toggleMapping,

    // Events
    events,
    eventsLoading,
    stats,
    fetchEvents,
    retryFailed,

    // General
    refreshAll,
    ready,
  }
}
