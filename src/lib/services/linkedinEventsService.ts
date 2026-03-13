import { supabase } from '@/lib/supabase/clientV2'

export interface LinkedInEvent {
  id: string
  org_id: string
  linkedin_event_id: string
  event_name: string
  event_description?: string
  event_url?: string
  event_type?: string
  start_date?: string
  end_date?: string
  organizer_name?: string
  registrant_count: number
  attendee_count: number
  metadata: Record<string, any>
  created_at: string
}

export interface EventRegistrant {
  id: string
  event_id: string
  first_name?: string
  last_name?: string
  email?: string
  company?: string
  job_title?: string
  linkedin_url?: string
  registration_status: string
  priority_tier: string
  icp_score?: number
  followup_status: string
  followup_draft?: string
  created_at: string
}

export const linkedinEventsService = {
  async listEvents(orgId: string) {
    const { data, error } = await supabase
      .from('linkedin_events')
      .select('id, org_id, linkedin_event_id, event_name, event_description, event_url, event_type, start_date, end_date, organizer_name, registrant_count, attendee_count, metadata, created_at')
      .eq('org_id', orgId)
      .order('start_date', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []) as LinkedInEvent[]
  },

  async getRegistrants(eventId: string) {
    const { data, error } = await supabase
      .from('linkedin_event_registrants')
      .select('id, event_id, first_name, last_name, email, company, job_title, linkedin_url, registration_status, priority_tier, icp_score, followup_status, followup_draft, created_at')
      .eq('event_id', eventId)
      .order('priority_tier', { ascending: true })
    if (error) throw new Error(error.message)
    return (data ?? []) as EventRegistrant[]
  },

  async updateRegistrantFollowup(registrantId: string, status: string, draft?: string) {
    const { error } = await supabase
      .from('linkedin_event_registrants')
      .update({ followup_status: status, followup_draft: draft, updated_at: new Date().toISOString() })
      .eq('id', registrantId)
    if (error) throw new Error(error.message)
  },

  async connectEvent(orgId: string, linkedinEventId: string, eventName: string) {
    const { data, error } = await supabase
      .from('linkedin_event_connections')
      .insert({ org_id: orgId, linkedin_event_id: linkedinEventId, event_name: eventName })
      .select('id, org_id, linkedin_event_id, event_name')
      .single()
    if (error) throw new Error(error.message)
    return data
  },
}
