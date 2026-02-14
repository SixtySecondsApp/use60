/**
 * Fireflies Meeting Enrichment Module
 *
 * Handles post-sync enrichment for Fireflies meetings:
 * - Participant extraction → contacts/companies (CRM linking)
 * - Native action items storage (from Fireflies summary)
 * - AI analysis via Claude (coaching, enhanced sentiment, action items)
 * - Meeting indexing queue
 * - Summary condensation
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { analyzeTranscriptWithClaude, type TranscriptAnalysis } from '../fathom-sync/aiAnalysis.ts'
import { storeAIActionItems, queueMeetingForIndexing, condenseMeetingSummary } from '../fathom-sync/services/transcriptService.ts'
import { matchOrCreateCompany } from '../_shared/companyMatching.ts'
import { selectPrimaryContact, determineMeetingCompany } from '../_shared/primaryContactSelection.ts'
import type { FirefliesTranscript } from './index.ts'

interface MeetingRecord {
  id: string
  external_id: string
  title: string
  meeting_start: string
  transcript_text: string
  owner_email: string | null
  org_id: string | null
  owner_user_id: string
  summary: string | null
}

// ─── Orchestrator ─────────────────────────────────────────────────────

/**
 * Enrich a single Fireflies meeting with participants, AI analysis, and action items.
 * Non-fatal: errors are logged but don't prevent the meeting from being synced.
 */
export async function enrichFirefliesMeeting(
  supabase: SupabaseClient,
  meeting: MeetingRecord,
  transcript: FirefliesTranscript,
  userId: string,
  orgId: string | null
): Promise<void> {
  console.log(`[fireflies-enrich] Starting enrichment for meeting ${meeting.id} (${meeting.title})`)

  // 1. Process participants → contacts/companies
  try {
    await processFirefliesParticipants(supabase, meeting, transcript, userId)
  } catch (err) {
    console.error(`[fireflies-enrich] Participant processing failed for ${meeting.id}:`,
      err instanceof Error ? `${err.message}\n${err.stack}` : String(err))
  }

  // 2. Store Fireflies native action items
  try {
    const rawItems = transcript.summary?.action_items
    console.log(`[fireflies-enrich] Native action items available for ${meeting.id}: ${rawItems?.length ?? 0}`)
    const nativeCount = await storeFirefliesNativeActionItems(
      supabase, meeting.id, rawItems
    )
    console.log(`[fireflies-enrich] Stored ${nativeCount}/${rawItems?.length ?? 0} native action items for ${meeting.id}`)
  } catch (err) {
    console.error(`[fireflies-enrich] Native action items failed for ${meeting.id}:`,
      err instanceof Error ? `${err.message}\n${err.stack}` : String(err))
  }

  // 3. Run Claude AI analysis (coaching, sentiment reasoning, enhanced action items)
  try {
    await runFirefliesAIAnalysis(supabase, meeting, transcript, userId, orgId)
  } catch (err) {
    console.error(`[fireflies-enrich] AI analysis failed for ${meeting.id}:`,
      err instanceof Error ? `${err.message}\n${err.stack}` : String(err))
  }

  // 4. Queue for AI search indexing
  try {
    await queueMeetingForIndexing(supabase, meeting.id, userId)
  } catch (err) {
    console.error(`[fireflies-enrich] Indexing queue failed for ${meeting.id}:`,
      err instanceof Error ? err.message : String(err))
  }

  // 5. Condense summary to one-liners (non-blocking)
  if (meeting.summary) {
    condenseMeetingSummary(supabase, meeting.id, meeting.summary, meeting.title || 'Meeting')
      .catch(() => undefined)
  }

  // 6. Trigger orchestrator for post-meeting workflows (fire-and-forget)
  if (orgId) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (supabaseUrl && serviceRoleKey) {
      fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'meeting_ended',
          source: 'edge:fireflies-sync',
          org_id: orgId,
          user_id: userId,
          payload: {
            meeting_id: meeting.id,
            title: meeting.title,
            transcript_available: true,
          },
          idempotency_key: `meeting_ended:${meeting.id}`,
        }),
      }).catch(err => console.error('[fireflies-enrich] Orchestrator trigger failed:', err))
      console.log(`🚀 Orchestrator triggered for meeting ${meeting.id} (source: fireflies-sync)`)
    }
  }
}

// ─── Participant Processing ───────────────────────────────────────────

/**
 * Extract participants from Fireflies data and link to CRM contacts/companies.
 *
 * Data sources (in priority order):
 * 1. meeting_attendees (has email + displayName)
 * 2. fireflies_users (email array)
 * 3. speakers (name only, no email - used as fallback for names)
 */
async function processFirefliesParticipants(
  supabase: SupabaseClient,
  meeting: MeetingRecord,
  transcript: FirefliesTranscript,
  userId: string
): Promise<void> {
  // Determine owner's email domain to distinguish internal/external
  const ownerEmail = meeting.owner_email || transcript.organizer_email || transcript.host_email
  const ownerDomain = ownerEmail ? extractDomain(ownerEmail) : null

  // Collect unique participants with emails
  const participantMap = new Map<string, { email: string; name: string }>()

  // Source 1: meeting_attendees (most structured)
  if (transcript.meeting_attendees?.length) {
    for (const attendee of transcript.meeting_attendees) {
      if (attendee.email) {
        const email = attendee.email.toLowerCase().trim()
        if (!participantMap.has(email)) {
          participantMap.set(email, {
            email,
            name: attendee.displayName || email.split('@')[0],
          })
        }
      }
    }
  }

  // Source 2: fireflies_users (email array)
  if (transcript.fireflies_users?.length) {
    for (const userEntry of transcript.fireflies_users) {
      // fireflies_users can be emails or user IDs
      if (userEntry && userEntry.includes('@')) {
        const email = userEntry.toLowerCase().trim()
        if (!participantMap.has(email)) {
          participantMap.set(email, {
            email,
            name: email.split('@')[0],
          })
        }
      }
    }
  }

  console.log(`[fireflies-enrich] Found ${participantMap.size} unique participants for meeting ${meeting.id} (ownerDomain=${ownerDomain})`)

  if (participantMap.size === 0) {
    console.log(`[fireflies-enrich] No participants with emails found for meeting ${meeting.id}`)
    return
  }

  // Process each participant
  const externalContactIds: string[] = []

  for (const [email, participant] of participantMap) {
    const participantDomain = extractDomain(email)

    // Skip if same domain as owner (internal) or if it's the owner themselves
    if (ownerEmail && email === ownerEmail.toLowerCase()) {
      console.log(`[fireflies-enrich] Skipping owner email: ${email}`)
      continue
    }
    if (ownerDomain && participantDomain === ownerDomain) {
      // Internal participant - store in meeting_attendees
      await upsertMeetingAttendee(supabase, meeting.id, participant.name, email, false)
      continue
    }

    // External participant - create/update contact
    const contactId = await processExternalParticipant(
      supabase, meeting.id, email, participant.name, userId, meeting.meeting_start
    )
    if (contactId) {
      externalContactIds.push(contactId)
    } else {
      console.warn(`[fireflies-enrich] processExternalParticipant returned null for ${email} in meeting ${meeting.id}`)
    }
  }

  console.log(`[fireflies-enrich] External contacts found: ${externalContactIds.length} for meeting ${meeting.id}`)

  // Select primary contact and determine company
  if (externalContactIds.length > 0) {
    const primaryContactId = await selectPrimaryContact(supabase, externalContactIds, userId)
    console.log(`[fireflies-enrich] Primary contact selected: ${primaryContactId} for meeting ${meeting.id}`)
    let meetingCompanyId: string | null = null

    if (primaryContactId) {
      meetingCompanyId = await determineMeetingCompany(
        supabase, externalContactIds, primaryContactId, userId
      )

      // Update meeting with CRM links
      const { error: meetingUpdateError } = await supabase
        .from('meetings')
        .update({
          primary_contact_id: primaryContactId,
          company_id: meetingCompanyId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', meeting.id)

      if (meetingUpdateError) {
        console.error(`[fireflies-enrich] Failed to update meeting CRM links for ${meeting.id}:`,
          meetingUpdateError.code, meetingUpdateError.message)
      } else {
        console.log(`[fireflies-enrich] Updated meeting ${meeting.id} with primary_contact=${primaryContactId}, company=${meetingCompanyId}`)
      }

      // Create meeting_contacts junctions (one by one for better error visibility)
      let junctionCreated = 0
      for (const contactId of externalContactIds) {
        const { error: junctionError } = await supabase
          .from('meeting_contacts')
          .upsert(
            {
              meeting_id: meeting.id,
              contact_id: contactId,
              is_primary: contactId === primaryContactId,
              role: 'attendee',
            },
            { onConflict: 'meeting_id,contact_id' }
          )

        if (junctionError) {
          console.error(`[fireflies-enrich] Failed to create meeting_contact for meeting=${meeting.id} contact=${contactId}:`,
            junctionError.code, junctionError.message, junctionError.details)
        } else {
          junctionCreated++
        }
      }
      console.log(`[fireflies-enrich] Created ${junctionCreated}/${externalContactIds.length} meeting_contacts for meeting ${meeting.id}`)
    }

    console.log(`[fireflies-enrich] Processed ${externalContactIds.length} external contacts for meeting ${meeting.id}`)
  }
}

/**
 * Process a single external participant → create/update contact + company
 */
async function processExternalParticipant(
  supabase: SupabaseClient,
  meetingId: string,
  email: string,
  name: string,
  userId: string,
  meetingDate: string | null
): Promise<string | null> {
  // Match or create company from email domain
  const { company } = await matchOrCreateCompany(supabase, email, userId, name, 'fireflies_sync')

  // Check for existing contact
  const { data: existingContact } = await supabase
    .from('contacts')
    .select('id, company_id, last_interaction_at')
    .eq('email', email)
    .maybeSingle()

  if (existingContact) {
    const updateData: Record<string, any> = {}

    if (!existingContact.company_id && company) {
      updateData.company_id = company.id
    }

    if (meetingDate) {
      const existingDate = existingContact.last_interaction_at
        ? new Date(existingContact.last_interaction_at)
        : null
      const newDate = new Date(meetingDate)
      if (!existingDate || newDate > existingDate) {
        updateData.last_interaction_at = meetingDate
      }
    }

    if (Object.keys(updateData).length > 0) {
      await supabase.from('contacts').update(updateData).eq('id', existingContact.id)
    }

    return existingContact.id
  }

  // Create new contact
  const nameParts = name.split(' ')
  const firstName = nameParts[0] || name
  const lastName = nameParts.slice(1).join(' ') || null

  const { data: newContact, error: contactError } = await supabase
    .from('contacts')
    .insert({
      owner_id: userId,
      first_name: firstName,
      last_name: lastName,
      email,
      company_id: company?.id || null,
      source: 'fireflies_sync',
      first_seen_at: new Date().toISOString(),
      last_interaction_at: meetingDate || null,
    })
    .select('id')
    .maybeSingle()

  if (contactError) {
    console.warn(`[fireflies-enrich] Failed to create contact for ${email}:`, contactError.message)
    return null
  }

  return newContact?.id || null
}

/**
 * Upsert a meeting attendee record (for internal participants)
 */
async function upsertMeetingAttendee(
  supabase: SupabaseClient,
  meetingId: string,
  name: string,
  email: string,
  isExternal: boolean
): Promise<void> {
  const { data: existing } = await supabase
    .from('meeting_attendees')
    .select('id')
    .eq('meeting_id', meetingId)
    .eq('email', email)
    .maybeSingle()

  if (!existing) {
    await supabase.from('meeting_attendees').insert({
      meeting_id: meetingId,
      name,
      email,
      is_external: isExternal,
      role: 'attendee',
    })
  }
}

// ─── Native Action Items ──────────────────────────────────────────────

/**
 * Classify a native Fireflies action item by keyword analysis.
 * Returns priority and category based on text content.
 */
function classifyNativeActionItem(text: string): { priority: 'high' | 'medium' | 'low'; category: string } {
  const lower = text.toLowerCase()

  // Priority classification
  let priority: 'high' | 'medium' | 'low' = 'medium'
  const highKeywords = [
    'urgent', 'asap', 'immediately', 'critical', 'deadline', 'today',
    'tomorrow', 'eod', 'end of day', 'this week', 'sign', 'contract',
    'approve', 'budget', 'decision',
  ]
  const lowKeywords = [
    'consider', 'explore', 'think about', 'look into', 'maybe',
    'eventually', 'when possible', 'nice to have', 'optional',
  ]
  if (highKeywords.some(k => lower.includes(k))) {
    priority = 'high'
  } else if (lowKeywords.some(k => lower.includes(k))) {
    priority = 'low'
  }

  // Category classification
  let category = 'general'
  const categoryMap: [string[], string][] = [
    [['follow up', 'follow-up', 'circle back', 'check in', 'touch base', 'get back to'], 'follow_up'],
    [['send email', 'email', 'reply', 'respond', 'message'], 'email'],
    [['schedule', 'meeting', 'calendar', 'book', 'set up a call'], 'meeting'],
    [['proposal', 'quote', 'pricing', 'estimate'], 'proposal'],
    [['demo', 'demonstration', 'walkthrough', 'present'], 'demo'],
    [['call', 'phone', 'ring', 'dial'], 'call'],
  ]
  for (const [keywords, cat] of categoryMap) {
    if (keywords.some(k => lower.includes(k))) {
      category = cat
      break
    }
  }

  return { priority, category }
}

/**
 * Store Fireflies' native action items (from summary.action_items)
 */
async function storeFirefliesNativeActionItems(
  supabase: SupabaseClient,
  meetingId: string,
  actionItems: string[] | undefined
): Promise<number> {
  if (!actionItems || !Array.isArray(actionItems) || actionItems.length === 0) {
    return 0
  }

  let stored = 0

  for (const actionText of actionItems) {
    if (!actionText || typeof actionText !== 'string' || actionText.trim().length === 0) continue

    const { priority, category } = classifyNativeActionItem(actionText.trim())

    const { error } = await supabase
      .from('meeting_action_items')
      .insert({
        meeting_id: meetingId,
        title: actionText.trim(),
        ai_generated: false,
        needs_review: false,
        completed: false,
        synced_to_task: false,
        priority,
        category,
      })

    if (error) {
      console.error(`[fireflies-enrich] Failed to insert action item for meeting ${meetingId}:`, error.code, error.message)
    } else {
      stored++
    }
  }

  return stored
}

// ─── AI Analysis (Claude) ─────────────────────────────────────────────

/**
 * Run Claude AI analysis on a Fireflies meeting transcript.
 * Combines Fireflies native analytics with Claude's coaching insights.
 */
async function runFirefliesAIAnalysis(
  supabase: SupabaseClient,
  meeting: MeetingRecord,
  transcript: FirefliesTranscript,
  userId: string,
  orgId: string | null
): Promise<void> {
  const transcriptText = meeting.transcript_text
  if (!transcriptText || transcriptText.trim().length === 0) {
    console.log(`[fireflies-enrich] No transcript text for meeting ${meeting.id} - skipping AI analysis`)
    return
  }

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicKey) {
    console.warn(`[fireflies-enrich] ANTHROPIC_API_KEY not configured - skipping AI analysis`)
    return
  }

  console.log(`[fireflies-enrich] Running AI analysis for meeting ${meeting.id} (${transcriptText.length} chars)`)

  // Run Claude analysis
  const analysis: TranscriptAnalysis = await analyzeTranscriptWithClaude(
    transcriptText,
    {
      id: meeting.id,
      title: meeting.title,
      meeting_start: meeting.meeting_start,
      owner_email: meeting.owner_email,
    },
    supabase,
    userId,
    orgId || undefined
  )

  console.log(`[fireflies-enrich] AI analysis completed for meeting ${meeting.id}`)

  // Build update object combining Claude analysis
  // Sentiment: use Claude's analysis (more nuanced than Fireflies %)
  const updateData: Record<string, any> = {
    sentiment_score: analysis.sentiment.score,
    sentiment_reasoning: analysis.sentiment.reasoning,
    talk_time_rep_pct: analysis.talkTime.repPct,
    talk_time_customer_pct: analysis.talkTime.customerPct,
    talk_time_judgement: analysis.talkTime.assessment,
    coach_rating: analysis.coaching.rating,
    coach_summary: JSON.stringify({
      summary: analysis.coaching.summary,
      strengths: analysis.coaching.strengths,
      improvements: analysis.coaching.improvements,
      evaluationBreakdown: analysis.coaching.evaluationBreakdown,
    }),
    summary_status: 'complete',
  }

  // Add call type classification if available
  if (analysis.callType) {
    updateData.call_type_id = analysis.callType.callTypeId
    updateData.call_type_confidence = analysis.callType.confidence
    updateData.call_type_reasoning = analysis.callType.reasoning
  }

  // Update meeting with AI metrics
  const { error: updateError } = await supabase
    .from('meetings')
    .update(updateData)
    .eq('id', meeting.id)

  if (updateError) {
    throw new Error(`Failed to store AI metrics: ${updateError.message}`)
  }

  // Store AI-generated action items (deduplicated against Fireflies native items)
  const rawActionItems = transcript.summary?.action_items
  const existingNativeItems = (Array.isArray(rawActionItems) ? rawActionItems : []).map(text => ({
    title: String(text),
  }))

  const storedCount = await storeAIActionItems(supabase, meeting.id, analysis.actionItems, existingNativeItems)
  if (storedCount > 0) {
    console.log(`[fireflies-enrich] Stored ${storedCount} AI action items for meeting ${meeting.id}`)
  }

  // Update action items count
  const { count: totalActionItems } = await supabase
    .from('meeting_action_items')
    .select('id', { count: 'exact', head: true })
    .eq('meeting_id', meeting.id)

  if (totalActionItems !== null) {
    await supabase
      .from('meetings')
      .update({
        next_actions_count: totalActionItems,
        next_actions_generated_at: new Date().toISOString(),
      })
      .eq('id', meeting.id)
  }
}

// ─── Utilities ────────────────────────────────────────────────────────

/**
 * Extract domain from email address
 */
function extractDomain(email: string): string | null {
  if (!email || !email.includes('@')) return null
  return email.split('@')[1]?.toLowerCase().trim() || null
}
