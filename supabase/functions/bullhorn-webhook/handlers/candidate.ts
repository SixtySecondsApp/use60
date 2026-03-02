/**
 * Bullhorn Candidate Webhook Handler
 *
 * Handles ENTITY_INSERTED, ENTITY_UPDATED, ENTITY_DELETED events for Candidate entities.
 * Syncs changes from Bullhorn to use60 contacts.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { BullhornClient } from '../../_shared/bullhorn.ts'

// =============================================================================
// Types
// =============================================================================

export interface CandidateWebhookEvent {
  eventType: 'ENTITY_INSERTED' | 'ENTITY_UPDATED' | 'ENTITY_DELETED'
  entityType: 'Candidate'
  entityId: number
  updatingUserId?: number
  eventTimestamp: number
  updatedProperties?: string[]
  transactionId?: string
  corporationId?: number
}

export interface HandlerResult {
  success: boolean
  action: string
  entityId: number
  use60ContactId?: string
  error?: string
}

// =============================================================================
// Default Fields
// =============================================================================

const CANDIDATE_FIELDS = [
  'id',
  'firstName',
  'lastName',
  'name',
  'email',
  'email2',
  'email3',
  'phone',
  'mobile',
  'status',
  'source',
  'owner',
  'address',
  'salary',
  'customText1',
  'customText2',
  'customText3',
  'dateAdded',
  'dateLastModified',
  'externalID',
].join(',')

// =============================================================================
// Handler Functions
// =============================================================================

/**
 * Handle Candidate webhook events
 */
export async function handleCandidateEvent(
  event: CandidateWebhookEvent,
  adminClient: ReturnType<typeof createClient>,
  client: BullhornClient,
  orgId: string
): Promise<HandlerResult> {
  switch (event.eventType) {
    case 'ENTITY_INSERTED':
      return handleCandidateCreated(event, adminClient, client, orgId)
    case 'ENTITY_UPDATED':
      return handleCandidateUpdated(event, adminClient, client, orgId)
    case 'ENTITY_DELETED':
      return handleCandidateDeleted(event, adminClient, orgId)
    default:
      return {
        success: false,
        action: 'unknown',
        entityId: event.entityId,
        error: `Unknown event type: ${event.eventType}`,
      }
  }
}

/**
 * Handle Candidate.ENTITY_INSERTED event
 */
async function handleCandidateCreated(
  event: CandidateWebhookEvent,
  adminClient: ReturnType<typeof createClient>,
  client: BullhornClient,
  orgId: string
): Promise<HandlerResult> {
  try {
    // Fetch full candidate data
    const candidate = await client.getCandidate(event.entityId, CANDIDATE_FIELDS)

    // Check if mapping already exists (idempotency)
    const { data: existingMapping } = await adminClient
      .from('bullhorn_object_mappings')
      .select('use60_id')
      .eq('org_id', orgId)
      .eq('bullhorn_entity_type', 'Candidate')
      .eq('bullhorn_entity_id', event.entityId)
      .maybeSingle()

    if (existingMapping?.use60_id) {
      return {
        success: true,
        action: 'already_exists',
        entityId: event.entityId,
        use60ContactId: existingMapping.use60_id,
      }
    }

    // Try to match with existing contact by email
    if (candidate.email) {
      const { data: existingContacts } = await adminClient
        .from('contacts')
        .select('id, first_name, last_name, email')
        .eq('org_id', orgId)
        .eq('email', candidate.email)
        .limit(1)

      if (existingContacts && existingContacts.length > 0) {
        // Create mapping for matched contact
        await adminClient.from('bullhorn_object_mappings').insert({
          org_id: orgId,
          bullhorn_entity_type: 'Candidate',
          bullhorn_entity_id: event.entityId,
          use60_table: 'contacts',
          use60_id: existingContacts[0].id,
          sync_direction: 'bullhorn_to_use60',
          last_synced_at: new Date().toISOString(),
          bullhorn_last_modified: candidate.dateLastModified,
        })

        // Update contact metadata
        await adminClient
          .from('contacts')
          .update({
            external_id: `bullhorn_candidate_${event.entityId}`,
            metadata: {
              bullhorn_id: event.entityId,
              bullhorn_type: 'Candidate',
              bullhorn_status: candidate.status,
              synced_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingContacts[0].id)

        return {
          success: true,
          action: 'matched',
          entityId: event.entityId,
          use60ContactId: existingContacts[0].id,
        }
      }
    }

    // Create new contact
    const { data: newContact, error: insertError } = await adminClient
      .from('contacts')
      .insert({
        org_id: orgId,
        first_name: candidate.firstName || '',
        last_name: candidate.lastName || '',
        email: candidate.email || null,
        phone: candidate.phone || candidate.mobile || null,
        status: mapBullhornStatusToContact(candidate.status),
        source: 'bullhorn',
        external_id: `bullhorn_candidate_${event.entityId}`,
        metadata: {
          bullhorn_id: event.entityId,
          bullhorn_type: 'Candidate',
          bullhorn_status: candidate.status,
          bullhorn_owner: candidate.owner,
          synced_at: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError) {
      throw new Error(`Failed to create contact: ${insertError.message}`)
    }

    // Create mapping
    await adminClient.from('bullhorn_object_mappings').insert({
      org_id: orgId,
      bullhorn_entity_type: 'Candidate',
      bullhorn_entity_id: event.entityId,
      use60_table: 'contacts',
      use60_id: newContact.id,
      sync_direction: 'bullhorn_to_use60',
      last_synced_at: new Date().toISOString(),
      bullhorn_last_modified: candidate.dateLastModified,
    })

    return {
      success: true,
      action: 'created',
      entityId: event.entityId,
      use60ContactId: newContact.id,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    console.error('[candidate-handler] handleCandidateCreated error:', error)
    return {
      success: false,
      action: 'error',
      entityId: event.entityId,
      error,
    }
  }
}

/**
 * Handle Candidate.ENTITY_UPDATED event
 */
async function handleCandidateUpdated(
  event: CandidateWebhookEvent,
  adminClient: ReturnType<typeof createClient>,
  client: BullhornClient,
  orgId: string
): Promise<HandlerResult> {
  try {
    // Get existing mapping
    const { data: mapping } = await adminClient
      .from('bullhorn_object_mappings')
      .select('use60_id, use60_last_modified, bullhorn_last_modified')
      .eq('org_id', orgId)
      .eq('bullhorn_entity_type', 'Candidate')
      .eq('bullhorn_entity_id', event.entityId)
      .maybeSingle()

    if (!mapping) {
      // No mapping exists, treat as create
      return handleCandidateCreated(event, adminClient, client, orgId)
    }

    // Fetch full candidate data
    const candidate = await client.getCandidate(event.entityId, CANDIDATE_FIELDS)

    // Check for conflict (use60 was also modified recently)
    const use60LastMod = mapping.use60_last_modified
      ? new Date(mapping.use60_last_modified).getTime()
      : 0
    const bullhornLastMod = candidate.dateLastModified || 0

    // If use60 was modified more recently, skip update (use60 wins)
    if (use60LastMod > bullhornLastMod) {
      console.log(
        `[candidate-handler] Skipping update for candidate ${event.entityId} - use60 has newer data`
      )
      return {
        success: true,
        action: 'skipped_conflict',
        entityId: event.entityId,
        use60ContactId: mapping.use60_id,
      }
    }

    // Update contact
    const { error: updateError } = await adminClient
      .from('contacts')
      .update({
        first_name: candidate.firstName || '',
        last_name: candidate.lastName || '',
        email: candidate.email || null,
        phone: candidate.phone || candidate.mobile || null,
        status: mapBullhornStatusToContact(candidate.status),
        metadata: {
          bullhorn_id: event.entityId,
          bullhorn_type: 'Candidate',
          bullhorn_status: candidate.status,
          bullhorn_owner: candidate.owner,
          updated_properties: event.updatedProperties,
          synced_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', mapping.use60_id)

    if (updateError) {
      throw new Error(`Failed to update contact: ${updateError.message}`)
    }

    // Update mapping timestamp
    await adminClient
      .from('bullhorn_object_mappings')
      .update({
        last_synced_at: new Date().toISOString(),
        bullhorn_last_modified: candidate.dateLastModified,
      })
      .eq('org_id', orgId)
      .eq('bullhorn_entity_id', event.entityId)

    return {
      success: true,
      action: 'updated',
      entityId: event.entityId,
      use60ContactId: mapping.use60_id,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    console.error('[candidate-handler] handleCandidateUpdated error:', error)
    return {
      success: false,
      action: 'error',
      entityId: event.entityId,
      error,
    }
  }
}

/**
 * Handle Candidate.ENTITY_DELETED event
 */
async function handleCandidateDeleted(
  event: CandidateWebhookEvent,
  adminClient: ReturnType<typeof createClient>,
  orgId: string
): Promise<HandlerResult> {
  try {
    // Get existing mapping
    const { data: mapping } = await adminClient
      .from('bullhorn_object_mappings')
      .select('use60_id')
      .eq('org_id', orgId)
      .eq('bullhorn_entity_type', 'Candidate')
      .eq('bullhorn_entity_id', event.entityId)
      .maybeSingle()

    if (!mapping) {
      return {
        success: true,
        action: 'no_mapping',
        entityId: event.entityId,
      }
    }

    // Soft delete: Mark mapping as deleted, don't delete the contact
    await adminClient
      .from('bullhorn_object_mappings')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)
      .eq('bullhorn_entity_id', event.entityId)

    // Update contact metadata to indicate Bullhorn deletion
    await adminClient
      .from('contacts')
      .update({
        metadata: {
          bullhorn_id: event.entityId,
          bullhorn_type: 'Candidate',
          bullhorn_deleted: true,
          bullhorn_deleted_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', mapping.use60_id)

    return {
      success: true,
      action: 'soft_deleted',
      entityId: event.entityId,
      use60ContactId: mapping.use60_id,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    console.error('[candidate-handler] handleCandidateDeleted error:', error)
    return {
      success: false,
      action: 'error',
      entityId: event.entityId,
      error,
    }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Map Bullhorn candidate status to use60 contact status
 */
function mapBullhornStatusToContact(status?: string): string {
  const statusMap: Record<string, string> = {
    Active: 'active',
    Inactive: 'inactive',
    'New Lead': 'lead',
    Qualified: 'qualified',
    Submitted: 'qualified',
    Placed: 'active',
    Available: 'active',
    'On Assignment': 'active',
    'Left Message': 'active',
  }
  return statusMap[status || ''] || 'active'
}
