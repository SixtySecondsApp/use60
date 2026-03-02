/**
 * Sentry Bridge Worker - Background Queue Processor
 *
 * Dequeues items from sentry_bridge_queue using FOR UPDATE SKIP LOCKED pattern.
 * Creates/updates tickets in AI Dev Hub via MCP integration.
 *
 * Processing flow:
 * 1. Dequeue next available item (or batch)
 * 2. Check idempotency (has ticket already been created?)
 * 3. Format ticket payload with privacy redaction
 * 4. Call MCP to create ticket in Dev Hub
 * 5. Update sentry_issue_mappings with ticket info
 * 6. Mark queue item as completed or failed
 * 7. On max retries exceeded, move to DLQ
 *
 * Trigger: Cron job or pg_cron (recommended: every 30 seconds)
 * Can also be triggered manually for testing
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  type SentryBridgeQueueItem,
  type SentryIssueMappingRow,
  type DevHubTicketPayload,
  type BridgeConfig,
  type TicketPayload,
} from '../_shared/sentryBridge.ts';

// Environment
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AI_DEV_HUB_MCP_URL = Deno.env.get('AI_DEV_HUB_MCP_URL');

// Processing configuration
const BATCH_SIZE = parseInt(Deno.env.get('SENTRY_WORKER_BATCH_SIZE') || '10', 10);
const MAX_RETRIES = 5;

// Initialize Supabase client with service role
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface QueueItem {
  id: string;
  org_id: string;
  webhook_event_id: string;
  sentry_issue_id: string;
  sentry_event_id: string;
  event_type: string;
  target_dev_hub_project_id: string;
  target_owner_user_id: string | null;
  target_priority: string;
  routing_rule_id: string | null;
  ticket_payload: TicketPayload;
  status: string;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  locked_by: string | null;
  locked_at: string | null;
  created_at: string;
  processed_at: string | null;
}

interface ProcessingResult {
  success: boolean;
  itemId: string;
  ticketId?: string;
  ticketUrl?: string;
  error?: string;
}

/**
 * Dequeue items from the bridge queue
 */
async function dequeueItems(batchSize: number): Promise<QueueItem[]> {
  const { data, error } = await supabase.rpc('dequeue_sentry_bridge_item', {
    batch_size: batchSize,
    lock_duration_seconds: 300, // 5 minute lock
  });

  if (error) {
    console.error('[sentry-bridge-worker] Dequeue error:', error);
    throw error;
  }

  return (data as QueueItem[]) || [];
}

/**
 * Check if a ticket already exists for this Sentry issue
 */
async function checkExistingMapping(
  orgId: string,
  sentryIssueId: string
): Promise<SentryIssueMappingRow | null> {
  const { data, error } = await supabase
    .from('sentry_issue_mappings')
    .select('*')
    .eq('org_id', orgId)
    .eq('sentry_issue_id', sentryIssueId)
    .maybeSingle();

  if (error) {
    console.error('[sentry-bridge-worker] Mapping check error:', error);
    throw error;
  }

  return data;
}

/**
 * Get organization's bridge configuration
 */
async function getBridgeConfig(orgId: string): Promise<BridgeConfig | null> {
  const { data, error } = await supabase
    .from('sentry_bridge_config')
    .select('*')
    .eq('org_id', orgId)
    .eq('enabled', true)
    .maybeSingle();

  if (error) {
    console.error('[sentry-bridge-worker] Config fetch error:', error);
    throw error;
  }

  return data;
}

/**
 * Create a ticket in AI Dev Hub via MCP
 */
async function createDevHubTicket(
  payload: TicketPayload,
  targetProjectId: string,
  targetOwnerId: string | null
): Promise<{ ticketId: string; ticketUrl: string }> {
  if (!AI_DEV_HUB_MCP_URL) {
    throw new Error('AI_DEV_HUB_MCP_URL not configured');
  }

  // Call the MCP create_task endpoint
  const response = await fetch(`${AI_DEV_HUB_MCP_URL}/create_task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, // Service identity
    },
    body: JSON.stringify({
      projectId: targetProjectId,
      title: payload.title,
      description: payload.description,
      type: payload.type || 'bug',
      status: payload.status || 'backlog',
      priority: payload.priority,
      dueDate: payload.dueDate,
      assigneeIds: targetOwnerId ? [targetOwnerId] : [],
      // AI context from the pre-formatted payload
      aiContext: payload.aiContext,
      aiGeneratedPrompt: payload.aiGeneratedPrompt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MCP create_task failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  return {
    ticketId: result.id || result.taskId,
    ticketUrl: result.url || `${AI_DEV_HUB_MCP_URL.replace('/api', '')}/tasks/${result.id}`,
  };
}

/**
 * Update an existing ticket in AI Dev Hub via MCP
 */
async function updateDevHubTicket(
  ticketId: string,
  action: string,
  payload: Partial<DevHubTicketPayload>
): Promise<void> {
  if (!AI_DEV_HUB_MCP_URL) {
    throw new Error('AI_DEV_HUB_MCP_URL not configured');
  }

  // Map Sentry action to Dev Hub status
  let newStatus: string | undefined;
  if (action === 'resolved') {
    newStatus = 'done';
  } else if (action === 'unresolved' || action === 'regression') {
    newStatus = 'todo';
  }

  const updatePayload: Record<string, unknown> = {};
  if (newStatus) {
    updatePayload.status = newStatus;
  }
  if (payload.description) {
    updatePayload.description = payload.description;
  }

  const response = await fetch(`${AI_DEV_HUB_MCP_URL}/update_task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify({
      taskId: ticketId,
      ...updatePayload,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MCP update_task failed: ${response.status} - ${errorText}`);
  }
}

/**
 * Create or update the issue mapping
 */
async function upsertMapping(
  orgId: string,
  sentryIssueId: string,
  sentryProject: string,
  ticketId: string,
  ticketUrl: string,
  status: string
): Promise<void> {
  const { error } = await supabase.from('sentry_issue_mappings').upsert(
    {
      org_id: orgId,
      sentry_issue_id: sentryIssueId,
      sentry_project_slug: sentryProject,
      devhub_task_id: ticketId,
      devhub_task_url: ticketUrl,
      sync_status: status,
      last_synced_at: new Date().toISOString(),
    },
    {
      onConflict: 'org_id,sentry_issue_id',
    }
  );

  if (error) {
    console.error('[sentry-bridge-worker] Mapping upsert error:', error);
    throw error;
  }
}

/**
 * Mark a queue item as completed
 */
async function completeItem(itemId: string, ticketId: string): Promise<void> {
  const { error } = await supabase.rpc('complete_sentry_bridge_item', {
    item_id: itemId,
    result_ticket_id: ticketId,
  });

  if (error) {
    console.error('[sentry-bridge-worker] Complete item error:', error);
    throw error;
  }
}

/**
 * Mark a queue item as failed (with retry or DLQ)
 */
async function failItem(
  itemId: string,
  errorMessage: string,
  moveToDlq: boolean = false
): Promise<void> {
  const { error } = await supabase.rpc('fail_sentry_bridge_item', {
    item_id: itemId,
    error_msg: errorMessage,
    move_to_dlq: moveToDlq,
  });

  if (error) {
    console.error('[sentry-bridge-worker] Fail item error:', error);
    throw error;
  }
}

/**
 * Update metrics for the organization
 */
async function updateMetrics(
  orgId: string,
  success: boolean,
  processingTimeMs: number
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabase.rpc('increment_sentry_bridge_metrics', {
    p_org_id: orgId,
    p_date: today,
    p_tickets_created: success ? 1 : 0,
    p_tickets_updated: 0,
    p_errors: success ? 0 : 1,
    p_processing_time_ms: processingTimeMs,
  });

  if (error) {
    // Non-critical, just log
    console.warn('[sentry-bridge-worker] Metrics update failed:', error);
  }
}

/**
 * Process a single queue item
 */
async function processItem(item: QueueItem): Promise<ProcessingResult> {
  const startTime = Date.now();
  const {
    id,
    org_id,
    sentry_issue_id,
    event_type,
    ticket_payload,
    target_dev_hub_project_id,
    target_owner_user_id,
  } = item;

  // Extract sentry_project from the ticket payload or webhook event
  const sentryProject = (ticket_payload as any).projectId?.split('-')[0] || 'unknown';

  console.log(
    `[sentry-bridge-worker] Processing item ${id}: ${event_type} for issue ${sentry_issue_id}`
  );

  try {
    // Get org config
    const config = await getBridgeConfig(org_id);
    if (!config) {
      throw new Error(`No active bridge config for org ${org_id}`);
    }

    // Check if auto-creation of Dev Hub tickets is disabled
    if (!config.auto_create_devhub_tickets) {
      console.log(
        `[sentry-bridge-worker] Auto-create Dev Hub tickets is disabled for org ${org_id}, skipping item ${id}`
      );
      await completeItem(id, 'skipped-devhub-disabled');
      return {
        success: true,
        itemId: id,
      };
    }

    // Check for existing mapping
    const existingMapping = await checkExistingMapping(org_id, sentry_issue_id);

    // Handle issue.created - create new ticket
    if (event_type === 'issue.created' || event_type === 'created') {
      // Check idempotency - ticket already exists?
      if (existingMapping?.devhub_task_id) {
        console.log(`[sentry-bridge-worker] Ticket already exists for issue ${sentry_issue_id}`);
        await completeItem(id, existingMapping.devhub_task_id);
        return {
          success: true,
          itemId: id,
          ticketId: existingMapping.devhub_task_id,
          ticketUrl: existingMapping.devhub_task_url ?? undefined,
        };
      }

      // Create ticket via MCP using the pre-formatted payload
      const { ticketId, ticketUrl } = await createDevHubTicket(
        ticket_payload,
        target_dev_hub_project_id,
        target_owner_user_id
      );

      // Create mapping
      await upsertMapping(org_id, sentry_issue_id, sentryProject, ticketId, ticketUrl, 'synced');

      // Mark as completed
      await completeItem(id, ticketId);

      const processingTime = Date.now() - startTime;
      await updateMetrics(org_id, true, processingTime);

      console.log(
        `[sentry-bridge-worker] Created ticket ${ticketId} for issue ${sentry_issue_id} in ${processingTime}ms`
      );

      return {
        success: true,
        itemId: id,
        ticketId,
        ticketUrl,
      };
    }

    // Handle status updates - resolved, unresolved, regression
    const action = event_type.replace('issue.', '');
    if (['resolved', 'unresolved', 'regression'].includes(action)) {
      // Can't update if no existing ticket
      if (!existingMapping?.devhub_task_id) {
        console.log(`[sentry-bridge-worker] No existing ticket for issue ${sentry_issue_id}`);
        await completeItem(id, 'no-ticket');
        return {
          success: true,
          itemId: id,
        };
      }

      // Update ticket via MCP
      await updateDevHubTicket(existingMapping.devhub_task_id, action, {
        description:
          action === 'regression'
            ? `[REGRESSION] This issue has regressed after being previously resolved.`
            : undefined,
      });

      // Update mapping status
      const newStatus =
        action === 'resolved' ? 'resolved' : action === 'regression' ? 'regression' : 'synced';
      await upsertMapping(
        org_id,
        sentry_issue_id,
        sentryProject,
        existingMapping.devhub_task_id,
        existingMapping.devhub_task_url || '',
        newStatus
      );

      // Mark as completed
      await completeItem(id, existingMapping.devhub_task_id);

      const processingTime = Date.now() - startTime;
      await updateMetrics(org_id, true, processingTime);

      console.log(
        `[sentry-bridge-worker] Updated ticket ${existingMapping.devhub_task_id} (${action}) in ${processingTime}ms`
      );

      return {
        success: true,
        itemId: id,
        ticketId: existingMapping.devhub_task_id,
        ticketUrl: existingMapping.devhub_task_url ?? undefined,
      };
    }

    // Unknown event type, just complete it
    console.log(`[sentry-bridge-worker] Skipping unknown event type: ${event_type}`);
    await completeItem(id, 'skipped');
    return {
      success: true,
      itemId: id,
    };
  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error.message || String(error);

    console.error(`[sentry-bridge-worker] Error processing item ${id}:`, errorMessage);

    // Check if we should move to DLQ
    const moveToDlq = item.attempt_count >= MAX_RETRIES - 1;

    await failItem(id, errorMessage, moveToDlq);
    await updateMetrics(org_id, false, processingTime);

    return {
      success: false,
      itemId: id,
      error: errorMessage,
    };
  }
}

/**
 * Main worker handler
 */
async function handleWorker(req: Request): Promise<Response> {
  const startTime = Date.now();

  // Allow manual trigger with auth check
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Dequeue items
    const items = await dequeueItems(BATCH_SIZE);

    if (items.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No items to process',
          processedCount: 0,
          processingTimeMs: Date.now() - startTime,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`[sentry-bridge-worker] Processing ${items.length} items`);

    // Process items in parallel (with controlled concurrency)
    const results = await Promise.all(items.map((item) => processItem(item)));

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;
    const processingTime = Date.now() - startTime;

    console.log(
      `[sentry-bridge-worker] Completed: ${successCount} success, ${failureCount} failures in ${processingTime}ms`
    );

    return new Response(
      JSON.stringify({
        success: true,
        processedCount: items.length,
        successCount,
        failureCount,
        processingTimeMs: processingTime,
        results: results.map((r) => ({
          itemId: r.itemId,
          success: r.success,
          ticketId: r.ticketId,
          error: r.error,
        })),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('[sentry-bridge-worker] Worker error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Worker processing failed',
        processingTimeMs: Date.now() - startTime,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// Export for Deno
Deno.serve(handleWorker);
