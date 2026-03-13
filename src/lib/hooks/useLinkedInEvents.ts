import { useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from '@/lib/contexts/AuthContext'
import { useOrgStore } from '@/lib/stores/orgStore'
import { toast } from 'sonner'
import {
  linkedinEventsService,
  LinkedInEvent,
  EventRegistrant,
} from '@/lib/services/linkedinEventsService'

export function useLinkedInEvents() {
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const activeOrgId = useOrgStore((s) => s.activeOrgId)
  const orgLoading = useOrgStore((s) => s.isLoading)

  const [events, setEvents] = useState<LinkedInEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<LinkedInEvent | null>(null)
  const [registrants, setRegistrants] = useState<EventRegistrant[]>([])
  const [registrantsLoading, setRegistrantsLoading] = useState(false)

  const initialLoadDone = useRef(false)
  const ready = isAuthenticated && !!user && !!activeOrgId && !authLoading && !orgLoading

  // ---------------------------------------------------------------------------
  // Load events
  // ---------------------------------------------------------------------------

  const loadEvents = useCallback(async () => {
    if (!ready || !activeOrgId) return
    try {
      setLoading(true)
      const result = await linkedinEventsService.listEvents(activeOrgId)
      setEvents(result)
    } catch (e: any) {
      toast.error(e.message || 'Failed to load events')
    } finally {
      setLoading(false)
    }
  }, [ready, activeOrgId])

  // ---------------------------------------------------------------------------
  // Select event and fetch registrants
  // ---------------------------------------------------------------------------

  const selectEvent = useCallback(async (event: LinkedInEvent | null) => {
    setSelectedEvent(event)
    setRegistrants([])
    if (!event) return
    try {
      setRegistrantsLoading(true)
      const result = await linkedinEventsService.getRegistrants(event.id)
      setRegistrants(result)
    } catch (e: any) {
      toast.error(e.message || 'Failed to load registrants')
    } finally {
      setRegistrantsLoading(false)
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Connect event
  // ---------------------------------------------------------------------------

  const connectEvent = useCallback(async (linkedinEventId: string, eventName: string) => {
    if (!ready || !activeOrgId) return null
    try {
      const result = await linkedinEventsService.connectEvent(activeOrgId, linkedinEventId, eventName)
      toast.success('Event connected')
      await loadEvents()
      return result
    } catch (e: any) {
      toast.error(e.message || 'Failed to connect event')
      return null
    }
  }, [ready, activeOrgId, loadEvents])

  // ---------------------------------------------------------------------------
  // Update followup
  // ---------------------------------------------------------------------------

  const updateFollowup = useCallback(async (registrantId: string, status: string, draft?: string) => {
    try {
      await linkedinEventsService.updateRegistrantFollowup(registrantId, status, draft)
      toast.success('Followup updated')
      setRegistrants((prev) =>
        prev.map((r) =>
          r.id === registrantId ? { ...r, followup_status: status, followup_draft: draft } : r
        )
      )
    } catch (e: any) {
      toast.error(e.message || 'Failed to update followup')
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Initial load
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!ready || initialLoadDone.current) return
    initialLoadDone.current = true
    loadEvents()
  }, [ready, loadEvents])

  return {
    events,
    loading,
    selectedEvent,
    registrants,
    registrantsLoading,
    loadEvents,
    selectEvent,
    connectEvent,
    updateFollowup,
    ready,
  }
}
