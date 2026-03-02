/**
 * Bullhorn ClientContact Webhook Handler
 *
 * Handles ENTITY_INSERTED, ENTITY_UPDATED, ENTITY_DELETED events for ClientContact entities.
 * Syncs changes from Bullhorn to use60 contacts.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { BullhornClient } from '../../_shared/bullhorn.ts'

// =============================================================================
// Types
// =============================================================================

export interface ClientContactWebhookEvent {
  eventType: 'ENTITY_INSERTED' | 'ENTITY_UPDATED' | 'ENTITY_DELETED'
  entityType: 'ClientContact'
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

const CLIENT_CONTACT_FIELDS = [
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
  'type',
  'occupation',
  'clientCorporation',
  'owner',
  'address',
  'dateAdded',
  'dateLastModified',
  'externalID',
].join(',')

// =============================================================================
// Handler Functions
// =============================================================================

/**
 * Handle ClientContact webhook events
 */
export async function handleClientContactEvent(
  event: ClientContactWebhookEvent,
  adminClient: ReturnType<typeof createClient>,
  client: BullhornClient,
  orgId: string
): Promise<HandlerResult> {
  switch (event.eventType) {
    case 'ENTITY_INSERTED':
      return handleClientContactCreated(event, adminClient, client, orgId)
    case 'ENTITY_UPDATED':
      return handleClientContactUpdated(event, adminClient, client, orgId)
    case 'ENTITY_DELETED':
      return handleClientContactDeleted(event, adminClient, orgId)
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
 * Handle ClientContact.ENTITY_INSERTED event
 */
async function handleClientContactCreated(
  event: ClientContactWebhookEvent,
  adminClient: ReturnType<typeof createClient>,
  client: BullhornClient,
  orgId: string
): Promise<HandlerResult> {
  try {
    // Fetch full client contact data
    const clientContact = await client.getClientContact(event.entityId, CLIENT_CONTACT_FIELDS)

    // Check if mapping already exists (idempotency)
    const { data: existingMapping } = await adminClient
      .from('bullhorn_object_mappings')
      .select('use60_id')
      .eq('org_id', orgId)
      .eq('bullhorn_entity_type', 'ClientContact')
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
    if (clientContact.email) {
      const { data: existingContacts } = await adminClient
        .from('contacts')
        .select('id, first_name, last_name, email')
        .eq('org_id', orgId)
        .eq('email', clientContact.email)
        .limit(1)

      if (existingContacts && existingContacts.length > 0) {
        // Create mapping for matched contact
        await adminClient.from('bullhorn_object_mappings').insert({
          org_id: orgId,
          bullhorn_entity_type: 'ClientContact',
          bullhorn_entity_id: event.entityId,
          use60_table: 'contacts',
          use60_id: existingContacts[0].id,
          sync_direction: 'bullhorn_to_use60',
          last_synced_at: new Date().toISOString(),
          bullhorn_last_modified: clientContact.dateLastModified,
        })

        // Update contact metadata
        await adminClient
          .from('contacts')
          .update({
            external_id: `bullhorn_client_contact_${event.entityId}`,
            contact_type: 'client',
            company: clientContact.clientCorporation?.name || null,
            job_title: clientContact.occupation || null,
            metadata: {
              bullhorn_id: event.entityId,
              bullhorn_type: 'ClientContact',
              bullhorn_status: clientContact.status,
              bullhorn_client_corporation_id: clientContact.clientCorporation?.id,
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
        first_name: clientContact.firstName || '',
        last_name: clientContact.lastName || '',
        email: clientContact.email || null,
        phone: clientContact.phone || clientContact.mobile || null,
        status: mapBullhornStatusToContact(clientContact.status),
        contact_type: 'client',
        company: clientContact.clientCorporation?.name || null,
        job_title: clientContact.occupation || null,
        source: 'bullhorn',
        external_id: `bullhorn_client_contact_${event.entityId}`,
        metadata: {
          bullhorn_id: event.entityId,
          bullhorn_type: 'ClientContact',
          bullhorn_status: clientContact.status,
          bullhorn_client_corporation_id: clientContact.clientCorporation?.id,
          bullhorn_owner: clientContact.owner,
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
      bullhorn_entity_type: 'ClientContact',
      bullhorn_entity_id: event.entityId,
      use60_table: 'contacts',
      use60_id: newContact.id,
      sync_direction: 'bullhorn_to_use60',
      last_synced_at: new Date().toISOString(),
      bullhorn_last_modified: clientContact.dateLastModified,
    })

    return {
      success: true,
      action: 'created',
      entityId: event.entityId,
      use60ContactId: newContact.id,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    console.error('[client-contact-handler] handleClientContactCreated error:', error)
    return {
      success: false,
      action: 'error',
      entityId: event.entityId,
      error,
    }
  }
}

/**
 * Handle ClientContact.ENTITY_UPDATED event
 */
async function handleClientContactUpdated(
  event: ClientContactWebhookEvent,
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
      .eq('bullhorn_entity_type', 'ClientContact')
      .eq('bullhorn_entity_id', event.entityId)
      .maybeSingle()

    if (!mapping) {
      // No mapping exists, treat as create
      return handleClientContactCreated(event, adminClient, client, orgId)
    }

    // Fetch full client contact data
    const clientContact = await client.getClientContact(event.entityId, CLIENT_CONTACT_FIELDS)

    // Check for conflict (use60 was modified more recently)
    const use60LastMod = mapping.use60_last_modified
      ? new Date(mapping.use60_last_modified).getTime()
      : 0
    const bullhornLastMod = clientContact.dateLastModified || 0

    if (use60LastMod > bullhornLastMod) {
      console.log(
        `[client-contact-handler] Skipping update for client contact ${event.entityId} - use60 has newer data`
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
        first_name: clientContact.firstName || '',
        last_name: clientContact.lastName || '',
        email: clientContact.email || null,
        phone: clientContact.phone || clientContact.mobile || null,
        status: mapBullhornStatusToContact(clientContact.status),
        company: clientContact.clientCorporation?.name || null,
        job_title: clientContact.occupation || null,
        metadata: {
          bullhorn_id: event.entityId,
          bullhorn_type: 'ClientContact',
          bullhorn_status: clientContact.status,
          bullhorn_client_corporation_id: clientContact.clientCorporation?.id,
          bullhorn_owner: clientContact.owner,
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
        bullhorn_last_modified: clientContact.dateLastModified,
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
    console.error('[client-contact-handler] handleClientContactUpdated error:', error)
    return {
      success: false,
      action: 'error',
      entityId: event.entityId,
      error,
    }
  }
}

/**
 * Handle ClientContact.ENTITY_DELETED event
 */
async function handleClientContactDeleted(
  event: ClientContactWebhookEvent,
  adminClient: ReturnType<typeof createClient>,
  orgId: string
): Promise<HandlerResult> {
  try {
    // Get existing mapping
    const { data: mapping } = await adminClient
      .from('bullhorn_object_mappings')
      .select('use60_id')
      .eq('org_id', orgId)
      .eq('bullhorn_entity_type', 'ClientContact')
      .eq('bullhorn_entity_id', event.entityId)
      .maybeSingle()

    if (!mapping) {
      return {
        success: true,
        action: 'no_mapping',
        entityId: event.entityId,
      }
    }

    // Soft delete: Mark mapping as deleted
    await adminClient
      .from('bullhorn_object_mappings')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)
      .eq('bullhorn_entity_id', event.entityId)

    // Update contact metadata
    await adminClient
      .from('contacts')
      .update({
        metadata: {
          bullhorn_id: event.entityId,
          bullhorn_type: 'ClientContact',
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
    console.error('[client-contact-handler] handleClientContactDeleted error:', error)
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
 * Map Bullhorn client contact status to use60 contact status
 */
function mapBullhornStatusToContact(status?: string): string {
  const statusMap: Record<string, string> = {
    Active: 'active',
    Inactive: 'inactive',
    Archive: 'inactive',
  }
  return statusMap[status || ''] || 'active'
}
