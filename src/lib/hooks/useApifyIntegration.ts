import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/contexts/AuthContext'
import { useOrgStore } from '@/lib/stores/orgStore'
import { toast } from 'sonner'
import { apifyService, ApifyConnectResult } from '@/lib/services/apifyService'

export function useApifyIntegration() {
  const { user, isAuthenticated } = useAuth()
  const activeOrgId = useOrgStore((s) => s.activeOrgId)
  const [isConnected, setIsConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [apifyUser, setApifyUser] = useState<ApifyConnectResult['user'] | null>(null)

  const refreshStatus = useCallback(async () => {
    if (!isAuthenticated || !user || !activeOrgId) {
      setIsConnected(false)
      setApifyUser(null)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const result = await apifyService.revalidate()
      setIsConnected(result.connected)
      setApifyUser(result.user || null)
    } catch (e) {
      console.error('[useApifyIntegration] status error:', e)
      setIsConnected(false)
      setApifyUser(null)
    } finally {
      setLoading(false)
    }
  }, [activeOrgId, isAuthenticated, user])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  const connect = useCallback(async (token: string) => {
    if (!activeOrgId) throw new Error('No active organization')
    if (!isAuthenticated) throw new Error('Please sign in')

    const result = await apifyService.connect(token)
    setIsConnected(result.connected)
    setApifyUser(result.user || null)
    toast.success('Apify connected')
    return result
  }, [activeOrgId, isAuthenticated])

  const disconnect = useCallback(async () => {
    if (!activeOrgId) throw new Error('No active organization')

    await apifyService.disconnect()
    setIsConnected(false)
    setApifyUser(null)
    toast.success('Apify disconnected')
  }, [activeOrgId])

  return { isConnected, loading, apifyUser, connect, disconnect, refreshStatus }
}
