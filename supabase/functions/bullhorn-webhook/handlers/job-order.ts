/**
 * Bullhorn JobOrder Webhook Handler
 *
 * Handles ENTITY_INSERTED, ENTITY_UPDATED, ENTITY_DELETED events for JobOrder entities.
 * Syncs changes from Bullhorn to use60 deals.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { BullhornClient } from '../../_shared/bullhorn.ts'

// =============================================================================
// Types
// =============================================================================

export interface JobOrderWebhookEvent {
  eventType: 'ENTITY_INSERTED' | 'ENTITY_UPDATED' | 'ENTITY_DELETED'
  entityType: 'JobOrder'
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
  use60DealId?: string
  error?: string
}

// =============================================================================
// Default Fields
// =============================================================================

const JOB_ORDER_FIELDS = [
  'id',
  'title',
  'status',
  'employmentType',
  'publicDescription',
  'description',
  'salary',
  'salaryUnit',
  'payRate',
  'numOpenings',
  'startDate',
  'dateEnd',
  'isOpen',
  'isDeleted',
  'clientCorporation',
  'clientContact',
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
 * Handle JobOrder webhook events
 */
export async function handleJobOrderEvent(
  event: JobOrderWebhookEvent,
  adminClient: ReturnType<typeof createClient>,
  client: BullhornClient,
  orgId: string
): Promise<HandlerResult> {
  switch (event.eventType) {
    case 'ENTITY_INSERTED':
      return handleJobOrderCreated(event, adminClient, client, orgId)
    case 'ENTITY_UPDATED':
      return handleJobOrderUpdated(event, adminClient, client, orgId)
    case 'ENTITY_DELETED':
      return handleJobOrderDeleted(event, adminClient, orgId)
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
 * Handle JobOrder.ENTITY_INSERTED event
 */
async function handleJobOrderCreated(
  event: JobOrderWebhookEvent,
  adminClient: ReturnType<typeof createClient>,
  client: BullhornClient,
  orgId: string
): Promise<HandlerResult> {
  try {
    // Fetch full job order data
    const jobOrder = await client.getJobOrder(event.entityId, JOB_ORDER_FIELDS)

    // Check if mapping already exists (idempotency)
    const { data: existingMapping } = await adminClient
      .from('bullhorn_object_mappings')
      .select('use60_id')
      .eq('org_id', orgId)
      .eq('bullhorn_entity_type', 'JobOrder')
      .eq('bullhorn_entity_id', event.entityId)
      .maybeSingle()

    if (existingMapping?.use60_id) {
      return {
        success: true,
        action: 'already_exists',
        entityId: event.entityId,
        use60DealId: existingMapping.use60_id,
      }
    }

    // Try to match with existing deal by title
    if (jobOrder.title) {
      const { data: existingDeals } = await adminClient
        .from('deals')
        .select('id, name, value')
        .eq('org_id', orgId)
        .ilike('name', `%${jobOrder.title}%`)
        .limit(5)

      if (existingDeals && existingDeals.length > 0) {
        // Find best match by score
        let bestMatch = existingDeals[0]
        let bestScore = calculateMatchScore(jobOrder, bestMatch)

        for (const deal of existingDeals.slice(1)) {
          const score = calculateMatchScore(jobOrder, deal)
          if (score > bestScore) {
            bestScore = score
            bestMatch = deal
          }
        }

        if (bestScore >= 50) {
          // Create mapping for matched deal
          await adminClient.from('bullhorn_object_mappings').insert({
            org_id: orgId,
            bullhorn_entity_type: 'JobOrder',
            bullhorn_entity_id: event.entityId,
            use60_table: 'deals',
            use60_id: bestMatch.id,
            sync_direction: 'bullhorn_to_use60',
            last_synced_at: new Date().toISOString(),
            bullhorn_last_modified: jobOrder.dateLastModified,
          })

          // Update deal metadata
          await adminClient
            .from('deals')
            .update({
              external_id: `bullhorn_job_order_${event.entityId}`,
              metadata: {
                bullhorn_id: event.entityId,
                bullhorn_type: 'JobOrder',
                bullhorn_status: jobOrder.status,
                bullhorn_is_open: jobOrder.isOpen,
                bullhorn_client_corporation_id: jobOrder.clientCorporation?.id,
                synced_at: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            })
            .eq('id', bestMatch.id)

          return {
            success: true,
            action: 'matched',
            entityId: event.entityId,
            use60DealId: bestMatch.id,
          }
        }
      }
    }

    // Resolve company and contact IDs
    let companyId: string | null = null
    let contactId: string | null = null

    if (jobOrder.clientCorporation?.id) {
      const { data: corpMapping } = await adminClient
        .from('bullhorn_object_mappings')
        .select('use60_id')
        .eq('org_id', orgId)
        .eq('bullhorn_entity_type', 'ClientCorporation')
        .eq('bullhorn_entity_id', jobOrder.clientCorporation.id)
        .maybeSingle()

      companyId = corpMapping?.use60_id || null
    }

    if (jobOrder.clientContact?.id) {
      const { data: contactMapping } = await adminClient
        .from('bullhorn_object_mappings')
        .select('use60_id')
        .eq('org_id', orgId)
        .eq('bullhorn_entity_type', 'ClientContact')
        .eq('bullhorn_entity_id', jobOrder.clientContact.id)
        .maybeSingle()

      contactId = contactMapping?.use60_id || null
    }

    // Create new deal
    const { data: newDeal, error: insertError } = await adminClient
      .from('deals')
      .insert({
        org_id: orgId,
        name: jobOrder.title || 'Untitled Job Order',
        description: jobOrder.publicDescription || jobOrder.description || null,
        value: jobOrder.salary || jobOrder.payRate || null,
        stage: mapJobOrderStatusToStage(jobOrder.status, jobOrder.isOpen),
        status: jobOrder.isOpen ? 'active' : 'closed',
        expected_close_date: jobOrder.startDate
          ? new Date(jobOrder.startDate).toISOString()
          : null,
        source: 'bullhorn',
        external_id: `bullhorn_job_order_${event.entityId}`,
        company_id: companyId,
        contact_id: contactId,
        metadata: {
          bullhorn_id: event.entityId,
          bullhorn_type: 'JobOrder',
          bullhorn_status: jobOrder.status,
          bullhorn_employment_type: jobOrder.employmentType,
          bullhorn_is_open: jobOrder.isOpen,
          bullhorn_num_openings: jobOrder.numOpenings,
          bullhorn_client_corporation_id: jobOrder.clientCorporation?.id,
          bullhorn_client_contact_id: jobOrder.clientContact?.id,
          synced_at: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError) {
      throw new Error(`Failed to create deal: ${insertError.message}`)
    }

    // Create mapping
    await adminClient.from('bullhorn_object_mappings').insert({
      org_id: orgId,
      bullhorn_entity_type: 'JobOrder',
      bullhorn_entity_id: event.entityId,
      use60_table: 'deals',
      use60_id: newDeal.id,
      sync_direction: 'bullhorn_to_use60',
      last_synced_at: new Date().toISOString(),
      bullhorn_last_modified: jobOrder.dateLastModified,
    })

    return {
      success: true,
      action: 'created',
      entityId: event.entityId,
      use60DealId: newDeal.id,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    console.error('[job-order-handler] handleJobOrderCreated error:', error)
    return {
      success: false,
      action: 'error',
      entityId: event.entityId,
      error,
    }
  }
}

/**
 * Handle JobOrder.ENTITY_UPDATED event
 */
async function handleJobOrderUpdated(
  event: JobOrderWebhookEvent,
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
      .eq('bullhorn_entity_type', 'JobOrder')
      .eq('bullhorn_entity_id', event.entityId)
      .maybeSingle()

    if (!mapping) {
      // No mapping exists, treat as create
      return handleJobOrderCreated(event, adminClient, client, orgId)
    }

    // Fetch full job order data
    const jobOrder = await client.getJobOrder(event.entityId, JOB_ORDER_FIELDS)

    // Check for conflict
    const use60LastMod = mapping.use60_last_modified
      ? new Date(mapping.use60_last_modified).getTime()
      : 0
    const bullhornLastMod = jobOrder.dateLastModified || 0

    if (use60LastMod > bullhornLastMod) {
      console.log(
        `[job-order-handler] Skipping update for job order ${event.entityId} - use60 has newer data`
      )
      return {
        success: true,
        action: 'skipped_conflict',
        entityId: event.entityId,
        use60DealId: mapping.use60_id,
      }
    }

    // Update deal
    const { error: updateError } = await adminClient
      .from('deals')
      .update({
        name: jobOrder.title || 'Untitled Job Order',
        description: jobOrder.publicDescription || jobOrder.description || null,
        value: jobOrder.salary || jobOrder.payRate || null,
        stage: mapJobOrderStatusToStage(jobOrder.status, jobOrder.isOpen),
        status: jobOrder.isOpen ? 'active' : 'closed',
        expected_close_date: jobOrder.startDate
          ? new Date(jobOrder.startDate).toISOString()
          : null,
        metadata: {
          bullhorn_id: event.entityId,
          bullhorn_type: 'JobOrder',
          bullhorn_status: jobOrder.status,
          bullhorn_employment_type: jobOrder.employmentType,
          bullhorn_is_open: jobOrder.isOpen,
          bullhorn_num_openings: jobOrder.numOpenings,
          bullhorn_client_corporation_id: jobOrder.clientCorporation?.id,
          bullhorn_client_contact_id: jobOrder.clientContact?.id,
          updated_properties: event.updatedProperties,
          synced_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', mapping.use60_id)

    if (updateError) {
      throw new Error(`Failed to update deal: ${updateError.message}`)
    }

    // Update mapping timestamp
    await adminClient
      .from('bullhorn_object_mappings')
      .update({
        last_synced_at: new Date().toISOString(),
        bullhorn_last_modified: jobOrder.dateLastModified,
      })
      .eq('org_id', orgId)
      .eq('bullhorn_entity_id', event.entityId)

    return {
      success: true,
      action: 'updated',
      entityId: event.entityId,
      use60DealId: mapping.use60_id,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    console.error('[job-order-handler] handleJobOrderUpdated error:', error)
    return {
      success: false,
      action: 'error',
      entityId: event.entityId,
      error,
    }
  }
}

/**
 * Handle JobOrder.ENTITY_DELETED event
 */
async function handleJobOrderDeleted(
  event: JobOrderWebhookEvent,
  adminClient: ReturnType<typeof createClient>,
  orgId: string
): Promise<HandlerResult> {
  try {
    // Get existing mapping
    const { data: mapping } = await adminClient
      .from('bullhorn_object_mappings')
      .select('use60_id')
      .eq('org_id', orgId)
      .eq('bullhorn_entity_type', 'JobOrder')
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

    // Update deal to closed status
    await adminClient
      .from('deals')
      .update({
        status: 'closed',
        stage: 'lost',
        metadata: {
          bullhorn_id: event.entityId,
          bullhorn_type: 'JobOrder',
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
      use60DealId: mapping.use60_id,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    console.error('[job-order-handler] handleJobOrderDeleted error:', error)
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
 * Map Bullhorn JobOrder status to use60 deal stage
 */
function mapJobOrderStatusToStage(status?: string, isOpen?: boolean): string {
  if (!isOpen) return 'closed'

  const statusMap: Record<string, string> = {
    'Accepting Candidates': 'qualified',
    'Currently Interviewing': 'proposal',
    'Offer Pending': 'negotiation',
    'Offer Extended': 'negotiation',
    'Placed': 'won',
    'Cancelled': 'lost',
    'Closed': 'closed',
    'On Hold': 'qualified',
  }
  return statusMap[status || ''] || 'qualified'
}

/**
 * Calculate match score between job order and deal
 */
function calculateMatchScore(
  jobOrder: { title?: string; salary?: number },
  deal: { name: string; value?: number | null }
): number {
  let score = 0

  // Title match
  if (jobOrder.title && deal.name) {
    const titleLower = jobOrder.title.toLowerCase()
    const nameLower = deal.name.toLowerCase()

    if (titleLower === nameLower) {
      score += 100
    } else if (titleLower.includes(nameLower) || nameLower.includes(titleLower)) {
      score += 50
    }
  }

  // Value match
  if (jobOrder.salary && deal.value) {
    const diff = Math.abs(jobOrder.salary - deal.value) / Math.max(jobOrder.salary, deal.value)
    if (diff < 0.1) {
      score += 30
    } else if (diff < 0.25) {
      score += 15
    }
  }

  return score
}
