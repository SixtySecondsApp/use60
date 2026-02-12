/**
 * Meeting Writer — Unified write pipeline for all meeting providers.
 *
 * Consumes NormalizedMeetingData and performs all database writes:
 * meetings upsert, contacts/companies, meeting_attendees,
 * meeting_contacts, action items, and indexing queue.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import type {
  NormalizedMeetingData,
  NormalizedParticipant,
  NormalizedActionItem,
  WriteMeetingOptions,
  WriteMeetingResult,
} from './types.ts'
import { matchOrCreateCompany } from '../companyMatching.ts'
import { selectPrimaryContact, determineMeetingCompany } from '../primaryContactSelection.ts'
import { queueMeetingForIndexing } from '../meetingPostProcessing.ts'

/**
 * Write normalized meeting data to the database.
 * Each enrichment step is non-fatal (wrapped in try/catch) unless noted.
 */
export async function writeMeetingData(
  supabase: SupabaseClient,
  data: NormalizedMeetingData,
  options: WriteMeetingOptions = {}
): Promise<WriteMeetingResult> {
  const errors: string[] = []
  let meetingId: string
  let isNew = false

  // ── Step 1: Build meeting record ───────────────────────────────────
  const meetingRecord = buildMeetingRecord(data, options.isUpdate)

  // ── Step 2: Upsert/update meeting (fatal) ──────────────────────────
  const upsertResult = await upsertMeeting(supabase, data, meetingRecord)
  meetingId = upsertResult.meetingId
  isNew = upsertResult.isNew

  // ── Step 3: Process participants → contacts + companies + attendees
  let externalContactIds: string[] = []
  if (!options.skipParticipants && data.participants && data.participants.length > 0) {
    try {
      externalContactIds = await processParticipants(
        supabase,
        meetingId,
        data.participants,
        data.owner_user_id,
        data.owner_email || null,
        options.companySource || data.provider + '_meeting'
      )
    } catch (err) {
      const msg = `Participant processing failed: ${err instanceof Error ? err.message : String(err)}`
      console.warn(`[meetingWriter] ${msg}`)
      errors.push(msg)
    }
  }

  // ── Step 4: Select primary contact + determine company ─────────────
  let primaryContactId: string | null = null
  let companyId: string | null = null
  if (externalContactIds.length > 0) {
    try {
      primaryContactId = await selectPrimaryContact(supabase, externalContactIds, data.owner_user_id)
      companyId = await determineMeetingCompany(supabase, externalContactIds, primaryContactId, data.owner_user_id)

      // Update meeting with CRM links
      await supabase
        .from('meetings')
        .update({
          primary_contact_id: primaryContactId,
          company_id: companyId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', meetingId)

      // Create meeting_contacts junction records
      for (const contactId of externalContactIds) {
        await supabase
          .from('meeting_contacts')
          .upsert(
            {
              meeting_id: meetingId,
              contact_id: contactId,
              is_primary: contactId === primaryContactId,
              role: 'attendee',
            },
            { onConflict: 'meeting_id,contact_id' }
          )
      }
    } catch (err) {
      const msg = `CRM link failed: ${err instanceof Error ? err.message : String(err)}`
      console.warn(`[meetingWriter] ${msg}`)
      errors.push(msg)
    }
  }

  // ── Step 5: Store action items ─────────────────────────────────────
  let actionItemsStored = 0
  if (!options.skipActionItems && data.action_items && data.action_items.length > 0) {
    try {
      actionItemsStored = await storeActionItems(supabase, meetingId, data.action_items)
    } catch (err) {
      const msg = `Action items failed: ${err instanceof Error ? err.message : String(err)}`
      console.warn(`[meetingWriter] ${msg}`)
      errors.push(msg)
    }
  }

  // ── Step 6: Queue for indexing ─────────────────────────────────────
  if (!options.skipIndexing) {
    try {
      await queueMeetingForIndexing(supabase, meetingId, data.owner_user_id)
    } catch (err) {
      const msg = `Indexing queue failed: ${err instanceof Error ? err.message : String(err)}`
      console.warn(`[meetingWriter] ${msg}`)
      errors.push(msg)
    }
  }

  return {
    meetingId,
    isNew,
    primaryContactId: primaryContactId || undefined,
    companyId: companyId || undefined,
    actionItemsStored,
    errors,
  }
}

// ─────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Build a flat record for the meetings table from NormalizedMeetingData.
 * Flattens AI analysis fields. If isUpdate, strips null/undefined values.
 */
function buildMeetingRecord(
  data: NormalizedMeetingData,
  isUpdate?: boolean
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    // Identity
    provider: data.provider === '60_notetaker' ? '60_notetaker' : data.provider,
    owner_user_id: data.owner_user_id,
    org_id: data.org_id,

    // Core
    title: data.title,
    meeting_start: data.meeting_start,
    meeting_end: data.meeting_end,
    duration_minutes: data.duration_minutes,
    owner_email: data.owner_email,
    summary: data.summary,
    transcript_text: data.transcript_text,
    transcript_json: data.transcript_json,

    // Status
    source_type: data.source_type,
    sync_status: data.sync_status,
    transcript_status: data.transcript_status,
    summary_status: data.summary_status,
    processing_status: data.processing_status,
    last_synced_at: data.last_synced_at,

    // Fathom-specific
    fathom_recording_id: data.fathom_recording_id,
    fathom_user_id: data.fathom_user_id,
    team_name: data.team_name,
    share_url: data.share_url,
    calls_url: data.calls_url,
    transcript_doc_url: data.transcript_doc_url,
    fathom_embed_url: data.fathom_embed_url,
    thumbnail_url: data.thumbnail_url,
    thumbnail_status: data.thumbnail_status,
    fathom_created_at: data.fathom_created_at,
    transcript_language: data.transcript_language,
    calendar_invitees_type: data.calendar_invitees_type,
    is_historical_import: data.is_historical_import,

    // 60 Notetaker-specific
    recording_id: data.recording_id,
    bot_id: data.bot_id,
    meeting_platform: data.meeting_platform,
    meeting_url: data.meeting_url,
    speakers: data.speakers,
    recording_s3_key: data.recording_s3_key,
    recording_s3_url: data.recording_s3_url,

    // Fireflies-specific
    external_id: data.external_id,
    summary_oneliner: data.summary_oneliner,
    next_steps_oneliner: data.next_steps_oneliner,
    next_actions_count: data.next_actions_count,
    next_actions_generated_at: data.next_actions_generated_at,

    // Timestamp
    updated_at: new Date().toISOString(),
  }

  // Flatten AI analysis fields
  if (data.ai) {
    record.sentiment_score = data.ai.sentiment_score
    record.sentiment_reasoning = data.ai.sentiment_reasoning
    record.talk_time_rep_pct = data.ai.talk_time_rep_pct
    record.talk_time_customer_pct = data.ai.talk_time_customer_pct
    record.talk_time_judgement = data.ai.talk_time_judgement
    record.coach_rating = data.ai.coach_rating // ALWAYS 1-10
    record.coach_summary = data.ai.coach_summary
    record.call_type_id = data.ai.call_type_id
    record.call_type_confidence = data.ai.call_type_confidence
    record.call_type_reasoning = data.ai.call_type_reasoning
  }

  // Strip undefined values (never write undefined to DB)
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) {
      delete record[key]
    }
  }

  // In update mode, also strip null values to avoid overwriting existing data
  if (isUpdate) {
    for (const key of Object.keys(record)) {
      if (record[key] === null) {
        delete record[key]
      }
    }
  }

  return record
}

/**
 * Upsert or update a meeting record based on provider-specific strategy.
 */
async function upsertMeeting(
  supabase: SupabaseClient,
  data: NormalizedMeetingData,
  record: Record<string, unknown>
): Promise<{ meetingId: string; isNew: boolean }> {
  // Try to find existing meeting first
  let existingMeeting: any = null

  if (data.provider === 'fathom' && data.fathom_recording_id) {
    // Fathom: find by (org_id, fathom_recording_id) or just fathom_recording_id
    let query = supabase
      .from('meetings')
      .select('id')
      .eq('fathom_recording_id', data.fathom_recording_id)

    if (data.org_id) {
      query = query.eq('org_id', data.org_id)
    }

    const { data: found } = await query.maybeSingle()
    existingMeeting = found
  } else if (data.provider === 'fireflies' && data.external_id) {
    // Fireflies: find by (external_id, provider)
    const { data: found } = await supabase
      .from('meetings')
      .select('id')
      .eq('external_id', data.external_id)
      .eq('provider', 'fireflies')
      .maybeSingle()
    existingMeeting = found
  } else if (data.provider === '60_notetaker' && data.bot_id) {
    // 60 Notetaker: find by (bot_id, source_type)
    const { data: found } = await supabase
      .from('meetings')
      .select('id')
      .eq('bot_id', data.bot_id)
      .eq('source_type', '60_notetaker')
      .maybeSingle()
    existingMeeting = found
  }

  if (existingMeeting) {
    // Update existing
    const { error } = await supabase
      .from('meetings')
      .update(record)
      .eq('id', existingMeeting.id)

    if (error) {
      throw new Error(`Meeting update failed: ${error.code} ${error.message}`)
    }

    console.log(`[meetingWriter] Updated meeting ${existingMeeting.id} (${data.provider})`)
    return { meetingId: existingMeeting.id, isNew: false }
  } else {
    // Insert new
    const { data: inserted, error } = await supabase
      .from('meetings')
      .insert(record)
      .select('id')
      .single()

    if (error) {
      throw new Error(`Meeting insert failed: ${error.code} ${error.message}`)
    }

    console.log(`[meetingWriter] Inserted new meeting ${inserted.id} (${data.provider})`)
    return { meetingId: inserted.id, isNew: true }
  }
}

/**
 * Process participants: create contacts, companies, and meeting_attendees.
 * Returns array of external contact IDs for CRM linking.
 */
async function processParticipants(
  supabase: SupabaseClient,
  meetingId: string,
  participants: NormalizedParticipant[],
  ownerUserId: string,
  ownerEmail: string | null,
  companySource: string
): Promise<string[]> {
  const ownerDomain = ownerEmail ? extractDomain(ownerEmail) : null
  const externalContactIds: string[] = []

  for (const participant of participants) {
    try {
      // Determine if participant is internal or external
      let isExternal = participant.isExternal
      if (isExternal === undefined && participant.email && ownerDomain) {
        const participantDomain = extractDomain(participant.email)
        isExternal = participantDomain !== ownerDomain
      }

      // Create meeting_attendee record (check exists first — no unique constraint)
      if (participant.email) {
        const { data: existing } = await supabase
          .from('meeting_attendees')
          .select('id')
          .eq('meeting_id', meetingId)
          .eq('email', participant.email)
          .limit(1)
          .maybeSingle()

        if (!existing) {
          await supabase.from('meeting_attendees').insert({
            meeting_id: meetingId,
            name: participant.name,
            email: participant.email,
            is_external: isExternal ?? false,
            role: participant.role || 'attendee',
          })
        }
      } else {
        // Name-only attendee (no email) — insert without dedup
        await supabase.from('meeting_attendees').insert({
          meeting_id: meetingId,
          name: participant.name,
          is_external: isExternal ?? false,
          role: participant.role || 'attendee',
        })
      }

      // For external participants with email, create/find contact + company
      if (isExternal && participant.email) {
        // Match or create company from email domain
        const { company } = await matchOrCreateCompany(
          supabase,
          participant.email,
          ownerUserId,
          participant.name,
          companySource
        )

        // Find or create contact
        const { data: existingContact } = await supabase
          .from('contacts')
          .select('id')
          .eq('email', participant.email)
          .eq('owner_id', ownerUserId)
          .limit(1)
          .maybeSingle()

        let contactId: string

        if (existingContact) {
          contactId = existingContact.id
          // Update last_interaction_at
          await supabase
            .from('contacts')
            .update({ last_interaction_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', contactId)
        } else {
          // Parse name into first/last
          const nameParts = participant.name.split(' ')
          const firstName = nameParts[0] || participant.email.split('@')[0]
          const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null

          const { data: newContact, error: contactError } = await supabase
            .from('contacts')
            .insert({
              owner_id: ownerUserId,
              first_name: firstName,
              last_name: lastName,
              full_name: participant.name,
              email: participant.email,
              company_id: company?.id || null,
              source: companySource,
              first_seen_at: new Date().toISOString(),
              last_interaction_at: new Date().toISOString(),
            })
            .select('id')
            .single()

          if (contactError) {
            console.warn(`[meetingWriter] Failed to create contact for ${participant.email}:`, contactError.message)
            continue
          }
          contactId = newContact.id
        }

        externalContactIds.push(contactId)
      }
    } catch (err) {
      console.warn(`[meetingWriter] Error processing participant ${participant.email || participant.name}:`, err instanceof Error ? err.message : String(err))
    }
  }

  return externalContactIds
}

/**
 * Store action items using canonical column names.
 * Checks for duplicates by meeting_id + title.
 */
async function storeActionItems(
  supabase: SupabaseClient,
  meetingId: string,
  actionItems: NormalizedActionItem[]
): Promise<number> {
  let storedCount = 0

  for (const item of actionItems) {
    // Check for existing item with same title (dedup)
    const { data: existing } = await supabase
      .from('meeting_action_items')
      .select('id')
      .eq('meeting_id', meetingId)
      .eq('title', item.title)
      .limit(1)
      .maybeSingle()

    if (existing) {
      continue // Skip duplicates
    }

    const { error } = await supabase
      .from('meeting_action_items')
      .insert({
        meeting_id: meetingId,
        title: item.title,
        priority: item.priority || 'medium',
        category: item.category || 'general',
        assignee_name: item.assignee_name || null,
        assignee_email: item.assignee_email || null,
        deadline_at: item.deadline_at ? new Date(item.deadline_at).toISOString() : null,
        ai_generated: item.ai_generated ?? true,
        ai_confidence: item.ai_confidence ?? null,
        needs_review: item.needs_review ?? (item.ai_confidence != null ? item.ai_confidence < 0.8 : false),
        completed: item.completed ?? false,
        synced_to_task: item.synced_to_task ?? false,
        task_id: null,
        timestamp_seconds: item.timestamp_seconds ?? null,
        playback_url: item.playback_url || null,
      })

    if (error) {
      console.warn(`[meetingWriter] Failed to insert action item "${item.title}":`, error.message)
    } else {
      storedCount++
    }
  }

  return storedCount
}

/**
 * Extract domain from email address
 */
function extractDomain(email: string): string | null {
  const parts = email.split('@')
  return parts.length === 2 ? parts[1].toLowerCase() : null
}
