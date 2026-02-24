/**
 * Owner Resolution Service
 *
 * Handles resolving meeting owners from Fathom data to Sixty user IDs.
 * Uses fathom_user_mappings table for explicit mappings and profiles table as fallback.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.4"

export interface OwnerResolutionResult {
  ownerUserId: string
  ownerResolved: boolean
  ownerEmail: string | null
}

/**
 * Resolve owner from fathom_user_mappings table (explicit mappings)
 */
export async function resolveOwnerFromFathomMapping(
  supabase: SupabaseClient,
  email: string | null | undefined,
  orgId: string | null
): Promise<string | null> {
  if (!email || !orgId) return null

  try {
    const normalizedEmail = email.toLowerCase().trim()
    const { data: mapping, error } = await supabase
      .from('fathom_user_mappings')
      .select('sixty_user_id')
      .eq('org_id', orgId)
      .eq('fathom_user_email', normalizedEmail)
      .maybeSingle()

    if (!error && mapping?.sixty_user_id) {
      console.log(`[owner-resolution] Resolved owner via fathom_user_mappings: ${email} -> ${mapping.sixty_user_id}`)
      return mapping.sixty_user_id
    }
  } catch (e) {
    console.warn(`[owner-resolution] Error checking fathom_user_mappings:`, e)
  }
  return null
}

/**
 * Resolve owner user ID from email via profiles table (legacy fallback)
 */
export async function resolveOwnerUserIdFromEmail(
  supabase: SupabaseClient,
  email: string | null | undefined
): Promise<string | null> {
  if (!email) return null

  const normalizedEmail = email.toLowerCase().trim()
  try {
    const { data: prof, error: profError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (profError) {
      console.warn(`[owner-resolution] Error looking up profile for ${normalizedEmail}:`, profError.message)
      return null
    }

    if (prof?.id) {
      const fullName = [prof.first_name, prof.last_name].filter(Boolean).join(' ') || prof.email
      console.log(`[owner-resolution] Found profile for ${normalizedEmail}: ${fullName} (${prof.id})`)
      return prof.id
    }

    console.log(`[owner-resolution] No profile found for email: ${normalizedEmail}`)
  } catch (e) {
    console.error(`[owner-resolution] Exception looking up profile for ${normalizedEmail}:`, e)
  }
  return null
}

/**
 * Upsert fathom_user_mappings row for discovered owner emails.
 * This populates the mapping table for the admin UI even if not yet mapped.
 */
export async function upsertFathomUserMapping(
  supabase: SupabaseClient,
  orgId: string | null,
  email: string,
  name: string | null,
  sixtyUserId: string | null,
  isAutoMatched: boolean
): Promise<void> {
  if (!orgId) return

  try {
    const normalizedEmail = email.toLowerCase().trim()

    // First check if a mapping already exists
    const { data: existingMapping, error: lookupError } = await supabase
      .from('fathom_user_mappings')
      .select('id, sixty_user_id')
      .eq('org_id', orgId)
      .eq('fathom_user_email', normalizedEmail)
      .maybeSingle()

    if (lookupError) {
      console.warn(`[owner-resolution] Error looking up fathom_user_mappings for ${normalizedEmail}:`, lookupError.message)
    }

    if (existingMapping) {
      // Mapping exists - only update last_seen_at (and name if provided)
      // IMPORTANT: Don't overwrite sixty_user_id if it's already set (manual or auto-mapped)
      const updateData: Record<string, any> = {
        last_seen_at: new Date().toISOString(),
      }
      if (name) {
        updateData.fathom_user_name = name
      }
      // Only update sixty_user_id if it's currently null AND we have a new value
      if (!existingMapping.sixty_user_id && sixtyUserId) {
        updateData.sixty_user_id = sixtyUserId
        updateData.is_auto_matched = isAutoMatched
        console.log(`[owner-resolution] Auto-mapping ${normalizedEmail} -> ${sixtyUserId}`)
      }

      const { error: updateError } = await supabase
        .from('fathom_user_mappings')
        .update(updateData)
        .eq('id', existingMapping.id)

      if (updateError) {
        console.warn(`[owner-resolution] Error updating fathom_user_mappings for ${normalizedEmail}:`, updateError.message)
      } else {
        console.log(`[owner-resolution] Updated fathom_user_mappings: ${normalizedEmail}`)
      }
    } else {
      // No existing mapping - insert new row
      const { error: insertError } = await supabase
        .from('fathom_user_mappings')
        .insert({
          org_id: orgId,
          fathom_user_email: normalizedEmail,
          fathom_user_name: name,
          sixty_user_id: sixtyUserId,
          is_auto_matched: isAutoMatched,
          last_seen_at: new Date().toISOString(),
        })

      if (insertError) {
        console.warn(`[owner-resolution] Error inserting fathom_user_mappings for ${normalizedEmail}:`, insertError.message)
      } else {
        console.log(`[owner-resolution] Inserted fathom_user_mappings: ${normalizedEmail} (mapped=${!!sixtyUserId}, auto=${isAutoMatched})`)
      }
    }
  } catch (e) {
    console.warn(`[owner-resolution] Error upserting fathom_user_mappings:`, e)
  }
}

/**
 * Extract possible owner emails from a Fathom call object
 */
export function extractPossibleOwnerEmails(call: any): Array<string | null | undefined> {
  return [
    call?.recorded_by?.email,
    call?.host_email,
    (call?.host && typeof call.host === 'object' ? call.host.email : undefined),
    // From participants/invitees: pick the first host
    (Array.isArray(call?.participants) ? (call.participants.find((p: any) => p?.is_host)?.email) : undefined),
    (Array.isArray(call?.calendar_invitees) ? (call.calendar_invitees.find((p: any) => p?.is_host)?.email) : undefined),
  ]
}

/**
 * Resolve meeting owner from Fathom call data.
 * Uses a multi-step resolution process:
 * 1. Check fathom_user_mappings (explicit admin mappings)
 * 2. Fall back to profile email matching
 * 3. Auto-create mapping if profile found
 * 4. Validate org membership
 */
export async function resolveMeetingOwner(
  supabase: SupabaseClient,
  call: any,
  orgId: string | null,
  fallbackUserId: string,
  integrationConnectedByUserId: string | null
): Promise<OwnerResolutionResult> {
  let ownerUserId = fallbackUserId
  let ownerResolved = false
  let ownerEmailCandidate: string | null = null

  const possibleOwnerEmails = extractPossibleOwnerEmails(call)
  const fathomUserName = call?.recorded_by?.name || call?.host_name || null

  // DEBUG: Log all possible owner emails for this meeting
  const validEmails = possibleOwnerEmails.filter(Boolean)
  console.log(`[owner-resolution] Meeting "${call?.title || 'Untitled'}" - possible owner emails:`, validEmails.length > 0 ? validEmails : 'NONE FOUND')
  if (call?.recorded_by) {
    console.log(`[owner-resolution] recorded_by:`, JSON.stringify(call.recorded_by))
  }

  // STEP 1: Try to resolve via fathom_user_mappings first (explicit mappings)
  for (const em of possibleOwnerEmails) {
    if (!em) continue
    const mappedUserId = await resolveOwnerFromFathomMapping(supabase, em, orgId)
    if (mappedUserId) {
      ownerUserId = mappedUserId
      ownerResolved = true
      ownerEmailCandidate = em
      break
    }
    if (!ownerEmailCandidate) ownerEmailCandidate = em
  }

  // STEP 2: If no explicit mapping, fall back to profile email matching
  if (!ownerResolved) {
    for (const em of possibleOwnerEmails) {
      if (!em) continue
      const uid = await resolveOwnerUserIdFromEmail(supabase, em)
      if (uid) {
        ownerUserId = uid
        ownerResolved = true
        ownerEmailCandidate = em

        // AUTO-MATCH: If we found a profile match, auto-upsert the mapping
        await upsertFathomUserMapping(supabase, orgId, em, fathomUserName, uid, true)
        console.log(`[owner-resolution] Auto-matched and created mapping: ${em} -> ${uid}`)
        break
      }
      if (!ownerEmailCandidate) ownerEmailCandidate = em
    }
  }

  // STEP 3: Always upsert a mapping row for the discovered email (even if unmapped)
  if (ownerEmailCandidate && orgId) {
    if (!ownerResolved) {
      await upsertFathomUserMapping(supabase, orgId, ownerEmailCandidate, fathomUserName, null, false)
    }
  }

  if (!ownerResolved) {
    console.log(`[owner-resolution] Could not resolve owner for ${ownerEmailCandidate || 'unknown email'}, using fallback user ${fallbackUserId}`)
  }

  // STEP 4: Validate org membership - only assign if user is actually a member
  if (orgId && ownerUserId) {
    try {
      const { data: member } = await supabase
        .from('organization_memberships')
        .select('user_id')
        .eq('org_id', orgId)
        .eq('user_id', ownerUserId)
        .limit(1)
        .maybeSingle()

      if (!member) {
        const fallbackOwner = integrationConnectedByUserId || fallbackUserId
        if (fallbackOwner && fallbackOwner !== ownerUserId) {
          console.warn(
            `[owner-resolution] Owner ${ownerUserId} is not a member of org ${orgId}; falling back to ${fallbackOwner}`
          )
          ownerUserId = fallbackOwner
          ownerResolved = false
        }
      }
    } catch {
      // If the membership check fails, keep existing ownerUserId
    }
  }

  return {
    ownerUserId,
    ownerResolved,
    ownerEmail: ownerEmailCandidate,
  }
}
