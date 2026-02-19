/**
 * Bullhorn Queue Processor Edge Function
 *
 * Processes sync jobs from the bullhorn_sync_queue table.
 * Called by cron job or triggered manually after webhook events.
 *
 * Job types:
 * - sync_candidate: Sync single candidate to contacts
 * - sync_client_contact: Sync single client contact to contacts
 * - sync_job_order: Sync job order to deals
 * - sync_note: Create/update note in Bullhorn
 * - sync_task: Create/update task in Bullhorn
 * - sync_placement: Sync placement data
 * - sync_sendout: Sync sendout/submission data
 * - initial_sync: Full initial sync for entity type
 * - incremental_sync: Incremental changes since last sync
 * - bulk_sync: Bulk sync operation
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'
import { BullhornClient, BullhornError } from '../_shared/bullhorn.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// Number of jobs to process per invocation
const BATCH_SIZE = 10
const LOCK_TIMEOUT_MS = 300000 // 5 minutes

interface SyncJob {
  id: string
  org_id: string
  job_type: string
  payload: Record<string, unknown>
  priority: number
  status: string
  attempts: number
  max_attempts: number
  scheduled_for: string
  locked_until: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

interface ProcessResult {
  job_id: string
  success: boolean
  error?: string
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const startTime = Date.now()
  const results: ProcessResult[] = []

  try {
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Claim jobs that are ready to process
    const now = new Date().toISOString()
    const lockUntil = new Date(Date.now() + LOCK_TIMEOUT_MS).toISOString()

    // Find and lock pending jobs
    const { data: jobs, error: fetchError } = await adminClient
      .from('bullhorn_sync_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .or(`locked_until.is.null,locked_until.lt.${now}`)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE)

    if (fetchError) {
      console.error('[bullhorn-process-queue] Error fetching jobs:', fetchError)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch jobs' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No jobs to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[bullhorn-process-queue] Processing ${jobs.length} jobs`)

    // Lock all claimed jobs
    const jobIds = jobs.map((j) => j.id)
    await adminClient
      .from('bullhorn_sync_queue')
      .update({
        status: 'processing',
        locked_until: lockUntil,
        updated_at: now,
      })
      .in('id', jobIds)

    // Group jobs by org for credential efficiency
    const jobsByOrg = new Map<string, SyncJob[]>()
    for (const job of jobs as SyncJob[]) {
      const orgJobs = jobsByOrg.get(job.org_id) || []
      orgJobs.push(job)
      jobsByOrg.set(job.org_id, orgJobs)
    }

    // Process jobs by org
    for (const [orgId, orgJobs] of jobsByOrg.entries()) {
      // Get credentials for this org
      const { data: creds } = await adminClient
        .from('bullhorn_org_credentials')
        .select('*')
        .eq('org_id', orgId)
        .maybeSingle()

      if (!creds) {
        // Mark all jobs for this org as failed
        for (const job of orgJobs) {
          await markJobFailed(adminClient, job, 'No credentials found')
          results.push({ job_id: job.id, success: false, error: 'No credentials' })
        }
        continue
      }

      // Create Bullhorn client
      const client = new BullhornClient({
        bhRestToken: creds.bh_rest_token,
        restUrl: creds.rest_url,
      })

      // Process each job
      for (const job of orgJobs) {
        try {
          await processJob(adminClient, client, job, orgId)
          await markJobCompleted(adminClient, job)
          results.push({ job_id: job.id, success: true })
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : 'Unknown error'
          const isRetryable = err instanceof BullhornError && err.status !== 401 && err.status !== 403

          if (isRetryable && job.attempts < job.max_attempts) {
            await markJobRetry(adminClient, job, errMsg)
            results.push({ job_id: job.id, success: false, error: `Retry: ${errMsg}` })
          } else {
            await markJobFailed(adminClient, job, errMsg)
            results.push({ job_id: job.id, success: false, error: errMsg })
          }
        }
      }
    }

    const elapsed = Date.now() - startTime
    const successCount = results.filter((r) => r.success).length

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${jobs.length} jobs in ${elapsed}ms`,
        processed: jobs.length,
        succeeded: successCount,
        failed: jobs.length - successCount,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[bullhorn-process-queue] Unexpected error:', msg)
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Process a single job based on its type
 */
async function processJob(
  adminClient: ReturnType<typeof createClient>,
  client: BullhornClient,
  job: SyncJob,
  orgId: string
): Promise<void> {
  console.log(`[bullhorn-process-queue] Processing job ${job.id} type ${job.job_type}`)

  switch (job.job_type) {
    case 'sync_candidate':
      await processSyncCandidate(adminClient, client, job, orgId)
      break
    case 'sync_client_contact':
      await processSyncClientContact(adminClient, client, job, orgId)
      break
    case 'sync_job_order':
      await processSyncJobOrder(adminClient, client, job, orgId)
      break
    case 'sync_note':
      await processSyncNote(adminClient, client, job, orgId)
      break
    case 'sync_task':
      await processSyncTask(adminClient, client, job, orgId)
      break
    case 'initial_sync':
    case 'incremental_sync':
    case 'bulk_sync':
      await processBulkSync(adminClient, client, job, orgId)
      break
    default:
      console.warn(`[bullhorn-process-queue] Unknown job type: ${job.job_type}`)
  }
}

/**
 * Sync a candidate from Bullhorn to contacts
 */
async function processSyncCandidate(
  adminClient: ReturnType<typeof createClient>,
  client: BullhornClient,
  job: SyncJob,
  orgId: string
): Promise<void> {
  const entityId = job.payload.entity_id as number
  if (!entityId) throw new Error('Missing entity_id in payload')

  const candidate = await client.getCandidate(
    entityId,
    'id,firstName,lastName,name,email,phone,mobile,status,owner,dateAdded,dateLastModified,address,source,customText1,customText2,customText3'
  )

  // Check if mapping exists
  const { data: mapping } = await adminClient
    .from('bullhorn_object_mappings')
    .select('use60_id')
    .eq('org_id', orgId)
    .eq('bullhorn_entity_type', 'Candidate')
    .eq('bullhorn_entity_id', entityId)
    .maybeSingle()

  const contactData = {
    org_id: orgId,
    first_name: candidate.firstName || '',
    last_name: candidate.lastName || '',
    email: candidate.email || null,
    phone: candidate.phone || candidate.mobile || null,
    status: candidate.status || 'active',
    source: 'bullhorn',
    external_id: `bullhorn_candidate_${entityId}`,
    metadata: {
      bullhorn_id: entityId,
      bullhorn_type: 'Candidate',
      bullhorn_owner: candidate.owner,
      synced_at: new Date().toISOString(),
    },
  }

  if (mapping?.use60_id) {
    // Update existing contact
    await adminClient.from('contacts').update(contactData).eq('id', mapping.use60_id)
  } else {
    // Create new contact
    const { data: newContact, error: insertError } = await adminClient
      .from('contacts')
      .insert(contactData)
      .select('id')
      .single()

    if (insertError) throw insertError

    // Create mapping
    await adminClient.from('bullhorn_object_mappings').insert({
      org_id: orgId,
      bullhorn_entity_type: 'Candidate',
      bullhorn_entity_id: entityId,
      use60_table: 'contacts',
      use60_id: newContact.id,
      sync_direction: 'bullhorn_to_use60',
    })
  }

  // Update sync state
  await updateSyncCursor(adminClient, orgId, 'Candidate', entityId, candidate.dateLastModified)
}

/**
 * Sync a client contact from Bullhorn to contacts
 */
async function processSyncClientContact(
  adminClient: ReturnType<typeof createClient>,
  client: BullhornClient,
  job: SyncJob,
  orgId: string
): Promise<void> {
  const entityId = job.payload.entity_id as number
  if (!entityId) throw new Error('Missing entity_id in payload')

  const contact = await client.getClientContact(
    entityId,
    'id,firstName,lastName,name,email,phone,mobile,status,clientCorporation,owner,dateAdded,dateLastModified'
  )

  // Check if mapping exists
  const { data: mapping } = await adminClient
    .from('bullhorn_object_mappings')
    .select('use60_id')
    .eq('org_id', orgId)
    .eq('bullhorn_entity_type', 'ClientContact')
    .eq('bullhorn_entity_id', entityId)
    .maybeSingle()

  const contactData = {
    org_id: orgId,
    first_name: contact.firstName || '',
    last_name: contact.lastName || '',
    email: contact.email || null,
    phone: contact.phone || contact.mobile || null,
    company_name: contact.clientCorporation?.name || null,
    status: contact.status || 'active',
    source: 'bullhorn',
    external_id: `bullhorn_client_contact_${entityId}`,
    metadata: {
      bullhorn_id: entityId,
      bullhorn_type: 'ClientContact',
      bullhorn_corporation_id: contact.clientCorporation?.id,
      bullhorn_owner: contact.owner,
      synced_at: new Date().toISOString(),
    },
  }

  if (mapping?.use60_id) {
    await adminClient.from('contacts').update(contactData).eq('id', mapping.use60_id)
  } else {
    const { data: newContact, error: insertError } = await adminClient
      .from('contacts')
      .insert(contactData)
      .select('id')
      .single()

    if (insertError) throw insertError

    await adminClient.from('bullhorn_object_mappings').insert({
      org_id: orgId,
      bullhorn_entity_type: 'ClientContact',
      bullhorn_entity_id: entityId,
      use60_table: 'contacts',
      use60_id: newContact.id,
      sync_direction: 'bullhorn_to_use60',
    })
  }

  await updateSyncCursor(adminClient, orgId, 'ClientContact', entityId, contact.dateLastModified)
}

/**
 * Sync a job order from Bullhorn to deals
 */
async function processSyncJobOrder(
  adminClient: ReturnType<typeof createClient>,
  client: BullhornClient,
  job: SyncJob,
  orgId: string
): Promise<void> {
  const entityId = job.payload.entity_id as number
  if (!entityId) throw new Error('Missing entity_id in payload')

  const jobOrder = await client.getJobOrder(
    entityId,
    'id,title,status,employmentType,clientContact,clientCorporation,owner,dateAdded,dateClosed,salary,numOpenings,description'
  )

  // Check if mapping exists
  const { data: mapping } = await adminClient
    .from('bullhorn_object_mappings')
    .select('use60_id')
    .eq('org_id', orgId)
    .eq('bullhorn_entity_type', 'JobOrder')
    .eq('bullhorn_entity_id', entityId)
    .maybeSingle()

  // Map job order to deal
  const dealData = {
    org_id: orgId,
    name: jobOrder.title || `Job Order ${entityId}`,
    stage: mapJobStatusToStage(jobOrder.status),
    value: jobOrder.salary || 0,
    status: jobOrder.dateClosed ? 'closed' : 'open',
    source: 'bullhorn',
    external_id: `bullhorn_job_order_${entityId}`,
    metadata: {
      bullhorn_id: entityId,
      bullhorn_type: 'JobOrder',
      bullhorn_status: jobOrder.status,
      bullhorn_employment_type: jobOrder.employmentType,
      bullhorn_openings: jobOrder.numOpenings,
      synced_at: new Date().toISOString(),
    },
  }

  if (mapping?.use60_id) {
    await adminClient.from('deals').update(dealData).eq('id', mapping.use60_id)
  } else {
    const { data: newDeal, error: insertError } = await adminClient
      .from('deals')
      .insert(dealData)
      .select('id')
      .single()

    if (insertError) throw insertError

    await adminClient.from('bullhorn_object_mappings').insert({
      org_id: orgId,
      bullhorn_entity_type: 'JobOrder',
      bullhorn_entity_id: entityId,
      use60_table: 'deals',
      use60_id: newDeal.id,
      sync_direction: 'bullhorn_to_use60',
    })
  }
}

/**
 * Create a note in Bullhorn from use60 activity
 */
async function processSyncNote(
  adminClient: ReturnType<typeof createClient>,
  client: BullhornClient,
  job: SyncJob,
  _orgId: string
): Promise<void> {
  const activityId = job.payload.activity_id as string
  if (!activityId) throw new Error('Missing activity_id in payload')

  // Get activity from use60
  const { data: activity, error: actError } = await adminClient
    .from('activities')
    .select('*')
    .eq('id', activityId)
    .single()

  if (actError || !activity) throw new Error('Activity not found')

  // Find associated Bullhorn entity
  const contactMapping = activity.contact_id
    ? await adminClient
        .from('bullhorn_object_mappings')
        .select('bullhorn_entity_id, bullhorn_entity_type')
        .eq('use60_id', activity.contact_id)
        .maybeSingle()
    : null

  if (!contactMapping?.data) {
    console.warn('[bullhorn-process-queue] No Bullhorn mapping for contact, skipping note sync')
    return
  }

  // Create note in Bullhorn
  const noteData = {
    action: activity.type || 'General Note',
    comments: activity.description || activity.title || '',
    personReference: {
      id: contactMapping.data.bullhorn_entity_id,
      _subtype: contactMapping.data.bullhorn_entity_type,
    },
  }

  const result = await client.createNote(noteData)

  // Store mapping
  await adminClient.from('bullhorn_object_mappings').upsert({
    org_id: activity.org_id,
    bullhorn_entity_type: 'Note',
    bullhorn_entity_id: result.changedEntityId,
    use60_table: 'activities',
    use60_id: activityId,
    sync_direction: 'use60_to_bullhorn',
  })
}

/**
 * Create or update a task in Bullhorn
 */
async function processSyncTask(
  adminClient: ReturnType<typeof createClient>,
  client: BullhornClient,
  job: SyncJob,
  _orgId: string
): Promise<void> {
  const taskId = job.payload.task_id as string
  if (!taskId) throw new Error('Missing task_id in payload')

  // Get task from use60
  const { data: task, error: taskError } = await adminClient
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single()

  if (taskError || !task) throw new Error('Task not found')

  // Check for existing mapping
  const { data: mapping } = await adminClient
    .from('bullhorn_object_mappings')
    .select('bullhorn_entity_id')
    .eq('use60_id', taskId)
    .eq('use60_table', 'tasks')
    .maybeSingle()

  const taskData = {
    subject: task.title || 'Task',
    description: task.description || '',
    type: task.type || 'Follow-up',
    isCompleted: task.status === 'completed',
    dateBegin: task.due_date ? new Date(task.due_date).getTime() : undefined,
  }

  if (mapping?.bullhorn_entity_id) {
    // Update existing task
    await client.updateTask(mapping.bullhorn_entity_id, taskData)
  } else {
    // Create new task
    const result = await client.createTask(taskData)

    // Store mapping
    await adminClient.from('bullhorn_object_mappings').insert({
      org_id: task.org_id,
      bullhorn_entity_type: 'Task',
      bullhorn_entity_id: result.changedEntityId,
      use60_table: 'tasks',
      use60_id: taskId,
      sync_direction: 'use60_to_bullhorn',
    })
  }
}

/**
 * Process bulk sync operations
 */
async function processBulkSync(
  adminClient: ReturnType<typeof createClient>,
  client: BullhornClient,
  job: SyncJob,
  orgId: string
): Promise<void> {
  const entityType = job.payload.entity_type as string
  const count = (job.payload.count as number) || 100
  const start = (job.payload.start as number) || 0

  // Get sync state for cursor
  const { data: syncState } = await adminClient
    .from('bullhorn_org_sync_state')
    .select('cursors')
    .eq('org_id', orgId)
    .maybeSingle()

  const cursor = syncState?.cursors?.[entityType]
  const lastModified = cursor?.lastModifiedAt || 0

  // Build search query for incremental sync
  const query =
    job.job_type === 'incremental_sync' && lastModified
      ? `dateLastModified:[${lastModified} TO *]`
      : '*'

  // Fetch entities based on type
  if (entityType === 'Candidate') {
    const results = await client.searchCandidates(query, '*', count, start)

    for (const candidate of results.data) {
      // Enqueue individual sync jobs
      await adminClient.from('bullhorn_sync_queue').insert({
        org_id: orgId,
        job_type: 'sync_candidate',
        payload: { entity_id: candidate.id },
        priority: 5,
      })
    }

    // If there are more results, queue next batch
    if (results.total > start + count) {
      await adminClient.from('bullhorn_sync_queue').insert({
        org_id: orgId,
        job_type: job.job_type,
        payload: { entity_type: entityType, count, start: start + count },
        priority: job.priority,
      })
    }
  } else if (entityType === 'ClientContact') {
    const results = await client.searchClientContacts(query, '*', count, start)

    for (const contact of results.data) {
      await adminClient.from('bullhorn_sync_queue').insert({
        org_id: orgId,
        job_type: 'sync_client_contact',
        payload: { entity_id: contact.id },
        priority: 5,
      })
    }

    if (results.total > start + count) {
      await adminClient.from('bullhorn_sync_queue').insert({
        org_id: orgId,
        job_type: job.job_type,
        payload: { entity_type: entityType, count, start: start + count },
        priority: job.priority,
      })
    }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

async function markJobCompleted(
  adminClient: ReturnType<typeof createClient>,
  job: SyncJob
): Promise<void> {
  await adminClient
    .from('bullhorn_sync_queue')
    .update({
      status: 'completed',
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id)
}

async function markJobFailed(
  adminClient: ReturnType<typeof createClient>,
  job: SyncJob,
  error: string
): Promise<void> {
  await adminClient
    .from('bullhorn_sync_queue')
    .update({
      status: 'failed',
      locked_until: null,
      last_error: error,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id)
}

async function markJobRetry(
  adminClient: ReturnType<typeof createClient>,
  job: SyncJob,
  error: string
): Promise<void> {
  // Exponential backoff: 1min, 5min, 15min, 30min, 1hr
  const backoffMinutes = [1, 5, 15, 30, 60]
  const delay = backoffMinutes[Math.min(job.attempts, backoffMinutes.length - 1)]
  const scheduledFor = new Date(Date.now() + delay * 60000).toISOString()

  await adminClient
    .from('bullhorn_sync_queue')
    .update({
      status: 'pending',
      locked_until: null,
      attempts: job.attempts + 1,
      scheduled_for: scheduledFor,
      last_error: error,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id)
}

async function updateSyncCursor(
  adminClient: ReturnType<typeof createClient>,
  orgId: string,
  entityType: string,
  entityId: number,
  lastModified?: number
): Promise<void> {
  // Get current sync state
  const { data: syncState } = await adminClient
    .from('bullhorn_org_sync_state')
    .select('cursors')
    .eq('org_id', orgId)
    .maybeSingle()

  const cursors = syncState?.cursors || {}
  const cursor = cursors[entityType] || { totalSynced: 0, initialSyncComplete: false }

  // Update cursor
  cursor.lastId = Math.max(cursor.lastId || 0, entityId)
  cursor.totalSynced = (cursor.totalSynced || 0) + 1
  if (lastModified) {
    cursor.lastModifiedAt = Math.max(cursor.lastModifiedAt || 0, lastModified)
  }

  cursors[entityType] = cursor

  await adminClient
    .from('bullhorn_org_sync_state')
    .upsert({
      org_id: orgId,
      cursors,
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
}

function mapJobStatusToStage(status?: string): string {
  const statusMap: Record<string, string> = {
    Accepting: 'sourcing',
    Submitted: 'qualified',
    'In Progress': 'proposal',
    Filled: 'closed_won',
    Closed: 'closed_lost',
  }
  return statusMap[status || ''] || 'lead'
}
