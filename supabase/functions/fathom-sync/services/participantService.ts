/**
 * Participant Service
 *
 * Handles processing meeting participants/invitees from Fathom data.
 * Creates contacts for external participants and meeting_attendees for internal ones.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.4"
import { matchOrCreateCompany } from '../../_shared/companyMatching.ts'
import { selectPrimaryContact, determineMeetingCompany } from '../../_shared/primaryContactSelection.ts'

export interface ParticipantProcessingResult {
  externalContactIds: string[]
  primaryContactId: string | null
  meetingCompanyId: string | null
}

export interface CalendarInvitee {
  name: string
  email?: string
  is_external?: boolean
  is_host?: boolean
}

/**
 * Process internal participant (team member) - store in meeting_attendees only
 */
async function processInternalParticipant(
  supabase: SupabaseClient,
  meetingId: string,
  invitee: CalendarInvitee
): Promise<void> {
  // Check if already exists to avoid duplicates
  const { data: existingAttendee } = await supabase
    .from('meeting_attendees')
    .select('id')
    .eq('meeting_id', meetingId)
    .eq('email', invitee.email || invitee.name)
    .single()

  if (!existingAttendee) {
    await supabase
      .from('meeting_attendees')
      .insert({
        meeting_id: meetingId,
        name: invitee.name,
        email: invitee.email || null,
        is_external: false,
        role: 'host',
      })
  }
}

/**
 * Process external participant (customer/prospect) - create contact + meeting_contacts
 */
async function processExternalParticipant(
  supabase: SupabaseClient,
  meetingId: string,
  invitee: CalendarInvitee,
  userId: string,
  meetingDate: string | null
): Promise<string | null> {
  // If no email, still create a meeting_attendees record so the name is captured
  if (!invitee.email) {
    const { data: existingAttendee } = await supabase
      .from('meeting_attendees')
      .select('id')
      .eq('meeting_id', meetingId)
      .eq('name', invitee.name)
      .maybeSingle()

    if (!existingAttendee) {
      await supabase
        .from('meeting_attendees')
        .insert({
          meeting_id: meetingId,
          name: invitee.name,
          email: null,
          is_external: true,
          role: 'attendee',
        })
      console.log(`[participant-service] Created meeting_attendees for name-only external: ${invitee.name}`)
    }
    return null
  }

  // 1. Match or create company from email domain
  const { company } = await matchOrCreateCompany(supabase, invitee.email, userId, invitee.name)

  // 2. Check for existing contact (email is unique globally, not per owner)
  const { data: existingContact } = await supabase
    .from('contacts')
    .select('id, company_id, owner_id, last_interaction_at')
    .eq('email', invitee.email)
    .single()

  if (existingContact) {
    // Build update object - always update last_interaction_at if meeting is newer
    const updateData: Record<string, any> = {}

    // Update company if not set
    if (!existingContact.company_id && company) {
      updateData.company_id = company.id
    }

    // Update last_interaction_at only if this meeting is newer
    if (meetingDate) {
      const existingDate = existingContact.last_interaction_at ? new Date(existingContact.last_interaction_at) : null
      const newDate = new Date(meetingDate)
      if (!existingDate || newDate > existingDate) {
        updateData.last_interaction_at = meetingDate
      }
    }

    // Only update if there are changes
    if (Object.keys(updateData).length > 0) {
      await supabase
        .from('contacts')
        .update(updateData)
        .eq('id', existingContact.id)
    }

    return existingContact.id
  }

  // Create new contact with company link
  const nameParts = invitee.name.split(' ')
  const firstName = nameParts[0] || invitee.name
  const lastName = nameParts.slice(1).join(' ') || null

  const { data: newContact, error: contactError } = await supabase
    .from('contacts')
    .insert({
      owner_id: userId,
      first_name: firstName,
      last_name: lastName,
      email: invitee.email,
      company_id: company?.id || null,
      source: 'fathom_sync',
      first_seen_at: new Date().toISOString(),
      last_interaction_at: meetingDate || null,
    })
    .select('id')
    .single()

  if (contactError) {
    console.error(`[participant-service] Failed to create contact for ${invitee.email}:`, contactError.message)
    return null
  }

  return newContact?.id || null
}

/**
 * Create meeting_contacts junction records for external contacts
 */
async function createMeetingContactJunctions(
  supabase: SupabaseClient,
  meetingId: string,
  externalContactIds: string[],
  primaryContactId: string | null
): Promise<void> {
  if (externalContactIds.length === 0) return

  const meetingContactRecords = externalContactIds.map((contactId) => ({
    meeting_id: meetingId,
    contact_id: contactId,
    is_primary: contactId === primaryContactId,
    role: 'attendee',
  }))

  const { error: junctionError } = await supabase
    .from('meeting_contacts')
    .upsert(meetingContactRecords, { onConflict: 'meeting_id,contact_id' })

  if (junctionError) {
    console.error(`[participant-service] Failed to create meeting_contacts junction:`, junctionError.message)
  } else {
    console.log(`[participant-service] Created ${meetingContactRecords.length} meeting_contacts records`)
  }
}

/**
 * Process all participants from a Fathom meeting
 * - Internal participants: Create meeting_attendees entries
 * - External participants: Create/update contacts + meeting_contacts junction
 */
export async function processParticipants(
  supabase: SupabaseClient,
  meetingId: string,
  calendarInvitees: CalendarInvitee[] | undefined,
  userId: string,
  meetingDate: string | null
): Promise<ParticipantProcessingResult> {
  const externalContactIds: string[] = []

  if (!calendarInvitees || calendarInvitees.length === 0) {
    return {
      externalContactIds: [],
      primaryContactId: null,
      meetingCompanyId: null,
    }
  }

  // Process each invitee
  for (const invitee of calendarInvitees) {
    if (!invitee.is_external) {
      // Internal participant - store in meeting_attendees only
      await processInternalParticipant(supabase, meetingId, invitee)
    } else if (invitee.email) {
      // External participant - create contact
      const contactId = await processExternalParticipant(
        supabase,
        meetingId,
        invitee,
        userId,
        meetingDate
      )
      if (contactId) {
        externalContactIds.push(contactId)
      }
    }
  }

  // Determine primary contact and company
  let primaryContactId: string | null = null
  let meetingCompanyId: string | null = null

  if (externalContactIds.length > 0) {
    // Select primary contact using smart logic
    primaryContactId = await selectPrimaryContact(supabase, externalContactIds, userId)

    if (primaryContactId) {
      // Determine meeting company (use primary contact's company)
      meetingCompanyId = await determineMeetingCompany(supabase, externalContactIds, primaryContactId, userId)

      if (meetingCompanyId) {
        // Log company name for transparency
        const { data: companyDetails } = await supabase
          .from('companies')
          .select('name, domain')
          .eq('id', meetingCompanyId)
          .single()

        if (companyDetails) {
          console.log(`[participant-service] Meeting company: ${companyDetails.name} (${companyDetails.domain})`)
        }
      }

      // Update meeting with primary contact and company
      await supabase
        .from('meetings')
        .update({
          primary_contact_id: primaryContactId,
          company_id: meetingCompanyId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', meetingId)

      // Create meeting_contacts junction records
      await createMeetingContactJunctions(supabase, meetingId, externalContactIds, primaryContactId)
    }
  }

  return {
    externalContactIds,
    primaryContactId,
    meetingCompanyId,
  }
}

/**
 * Extract and truncate summary for activity details to prevent UI overflow
 */
export function extractAndTruncateSummary(summary: string | null | undefined, maxLength: number = 200): string {
  if (!summary) {
    return 'Meeting'
  }

  let textContent = summary

  // If summary is a JSON string, parse and extract markdown_formatted or text field
  if (summary.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(summary)
      textContent = parsed.markdown_formatted || parsed.text || summary
    } catch {
      // If parsing fails, use the raw summary
    }
  }

  // Remove markdown formatting and clean up
  textContent = textContent
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove markdown links [text](url) -> text
    .replace(/##\s+/g, '') // Remove heading markers
    .replace(/\*\*/g, '') // Remove bold markers
    .replace(/\n+/g, ' ') // Replace newlines with spaces
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim()

  // Truncate to max length
  if (textContent.length <= maxLength) return textContent
  return textContent.substring(0, maxLength).trim() + '...'
}
