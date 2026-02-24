/**
 * CRM Write-Back Worker - Background Queue Processor
 *
 * Dequeues items from crm_writeback_queue and syncs data to external CRMs.
 * Supports: HubSpot, Attio, Salesforce (future)
 *
 * Processing flow:
 * 1. Dequeue next available items (batch of 10)
 * 2. For each item, call the appropriate CRM API
 * 3. Handle creates, updates, and associations
 * 4. Mark queue item as completed or failed
 * 5. On max retries exceeded, move to DLQ
 *
 * Trigger: pg_cron (recommended: every 30 seconds) or manual invocation
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/corsHelper.ts';

// Environment
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Processing configuration
const BATCH_SIZE = parseInt(Deno.env.get('CRM_WORKER_BATCH_SIZE') || '10', 10);

// Initialize Supabase client with service role
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface QueueItem {
  id: string;
  org_id: string;
  crm_source: string;
  entity_type: string;
  crm_record_id: string | null;
  local_record_id: string | null;
  operation: string;
  payload: Record<string, any>;
  triggered_by: string;
  triggered_by_user_id: string | null;
  status: string;
  priority: number;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  next_retry_at: string;
  dedupe_key: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface ProcessingResult {
  success: boolean;
  itemId: string;
  crmRecordId?: string;
  error?: string;
}

/**
 * Dequeue items from the writeback queue
 */
async function dequeueItems(batchSize: number): Promise<QueueItem[]> {
  const { data, error } = await supabase.rpc('dequeue_crm_writeback_item', {
    batch_size: batchSize,
    lock_duration_seconds: 300, // 5 minute lock
  });

  if (error) {
    console.error('[crm-writeback-worker] Dequeue error:', error);
    throw error;
  }

  return (data as QueueItem[]) || [];
}

/**
 * Get organization's CRM integration credentials
 */
async function getCrmCredentials(
  orgId: string,
  crmSource: string
): Promise<{ accessToken: string } | null> {
  if (crmSource === 'hubspot') {
    const { data, error } = await supabase
      .from('hubspot_org_integrations')
      .select('access_token')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) {
      console.error(`[crm-writeback-worker] HubSpot integration not found for org ${orgId}`);
      return null;
    }

    return { accessToken: data.access_token };
  }

  if (crmSource === 'attio') {
    const { data, error } = await supabase
      .from('attio_org_integrations')
      .select('api_key')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) {
      console.error(`[crm-writeback-worker] Attio integration not found for org ${orgId}`);
      return null;
    }

    return { accessToken: data.api_key };
  }

  console.error(`[crm-writeback-worker] Unsupported CRM source: ${crmSource}`);
  return null;
}

/**
 * HubSpot: Create contact
 */
async function hubspotCreateContact(
  accessToken: string,
  payload: Record<string, any>
): Promise<string> {
  const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      properties: payload,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HubSpot create contact failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  return result.id;
}

/**
 * HubSpot: Update contact
 */
async function hubspotUpdateContact(
  accessToken: string,
  contactId: string,
  payload: Record<string, any>
): Promise<void> {
  const response = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      properties: payload,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HubSpot update contact failed: ${response.status} - ${errorText}`);
  }
}

/**
 * HubSpot: Create company
 */
async function hubspotCreateCompany(
  accessToken: string,
  payload: Record<string, any>
): Promise<string> {
  const response = await fetch('https://api.hubapi.com/crm/v3/objects/companies', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      properties: payload,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HubSpot create company failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  return result.id;
}

/**
 * HubSpot: Update company
 */
async function hubspotUpdateCompany(
  accessToken: string,
  companyId: string,
  payload: Record<string, any>
): Promise<void> {
  const response = await fetch(`https://api.hubapi.com/crm/v3/objects/companies/${companyId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      properties: payload,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HubSpot update company failed: ${response.status} - ${errorText}`);
  }
}

/**
 * HubSpot: Create deal
 */
async function hubspotCreateDeal(
  accessToken: string,
  payload: Record<string, any>
): Promise<string> {
  const response = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      properties: payload,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HubSpot create deal failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  return result.id;
}

/**
 * HubSpot: Update deal
 */
async function hubspotUpdateDeal(
  accessToken: string,
  dealId: string,
  payload: Record<string, any>
): Promise<void> {
  const response = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      properties: payload,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HubSpot update deal failed: ${response.status} - ${errorText}`);
  }
}

/**
 * HubSpot: Delete contact
 */
async function hubspotDeleteContact(
  accessToken: string,
  contactId: string
): Promise<void> {
  const response = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();
    throw new Error(`HubSpot delete contact failed: ${response.status} - ${errorText}`);
  }
}

/**
 * HubSpot: Delete company
 */
async function hubspotDeleteCompany(
  accessToken: string,
  companyId: string
): Promise<void> {
  const response = await fetch(`https://api.hubapi.com/crm/v3/objects/companies/${companyId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();
    throw new Error(`HubSpot delete company failed: ${response.status} - ${errorText}`);
  }
}

/**
 * HubSpot: Delete deal
 */
async function hubspotDeleteDeal(
  accessToken: string,
  dealId: string
): Promise<void> {
  const response = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();
    throw new Error(`HubSpot delete deal failed: ${response.status} - ${errorText}`);
  }
}

/**
 * HubSpot: Associate records
 */
async function hubspotAssociate(
  accessToken: string,
  fromObjectType: string,
  fromObjectId: string,
  toObjectType: string,
  toObjectId: string,
  associationType: string
): Promise<void> {
  const response = await fetch(
    `https://api.hubapi.com/crm/v4/objects/${fromObjectType}/${fromObjectId}/associations/${toObjectType}/${toObjectId}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify([
        {
          associationCategory: 'HUBSPOT_DEFINED',
          associationTypeId: associationType,
        },
      ]),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HubSpot associate failed: ${response.status} - ${errorText}`);
  }
}

/**
 * Attio: Create record
 */
async function attioCreateRecord(
  apiKey: string,
  objectType: string,
  payload: Record<string, any>
): Promise<string> {
  const response = await fetch(`https://api.attio.com/v2/objects/${objectType}/records`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      data: payload,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Attio create record failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  return result.data.id.record_id;
}

/**
 * Attio: Update record
 */
async function attioUpdateRecord(
  apiKey: string,
  objectType: string,
  recordId: string,
  payload: Record<string, any>
): Promise<void> {
  const response = await fetch(
    `https://api.attio.com/v2/objects/${objectType}/records/${recordId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        data: payload,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Attio update record failed: ${response.status} - ${errorText}`);
  }
}

/**
 * Attio: Delete record
 */
async function attioDeleteRecord(
  apiKey: string,
  objectType: string,
  recordId: string
): Promise<void> {
  const response = await fetch(
    `https://api.attio.com/v2/objects/${objectType}/records/${recordId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );

  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();
    throw new Error(`Attio delete record failed: ${response.status} - ${errorText}`);
  }
}

/**
 * Mark a queue item as completed
 */
async function completeItem(itemId: string, crmRecordId?: string): Promise<void> {
  const { error } = await supabase.rpc('complete_crm_writeback_item', {
    item_id: itemId,
    result_crm_record_id: crmRecordId || null,
  });

  if (error) {
    console.error('[crm-writeback-worker] Complete item error:', error);
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
  const { error } = await supabase.rpc('fail_crm_writeback_item', {
    item_id: itemId,
    error_msg: errorMessage,
    move_to_dlq: moveToDlq,
  });

  if (error) {
    console.error('[crm-writeback-worker] Fail item error:', error);
    throw error;
  }
}

/**
 * Process a single queue item
 */
async function processItem(item: QueueItem): Promise<ProcessingResult> {
  const { id, org_id, crm_source, entity_type, crm_record_id, operation, payload } = item;

  console.log(
    `[crm-writeback-worker] Processing item ${id}: ${operation} ${entity_type} in ${crm_source}`
  );

  try {
    // Get CRM credentials
    const credentials = await getCrmCredentials(org_id, crm_source);
    if (!credentials) {
      throw new Error(`No active ${crm_source} integration for org ${org_id}`);
    }

    let resultRecordId: string | undefined;

    // Route to the appropriate CRM handler
    if (crm_source === 'hubspot') {
      if (entity_type === 'contact') {
        if (operation === 'create') {
          resultRecordId = await hubspotCreateContact(credentials.accessToken, payload);
        } else if (operation === 'update' && crm_record_id) {
          await hubspotUpdateContact(credentials.accessToken, crm_record_id, payload);
          resultRecordId = crm_record_id;
        } else if (operation === 'delete' && crm_record_id) {
          await hubspotDeleteContact(credentials.accessToken, crm_record_id);
        } else if (operation === 'associate') {
          // Association payload should include: fromObjectType, fromObjectId, toObjectType, toObjectId, associationType
          await hubspotAssociate(
            credentials.accessToken,
            payload.fromObjectType,
            payload.fromObjectId,
            payload.toObjectType,
            payload.toObjectId,
            payload.associationType
          );
        }
      } else if (entity_type === 'company') {
        if (operation === 'create') {
          resultRecordId = await hubspotCreateCompany(credentials.accessToken, payload);
        } else if (operation === 'update' && crm_record_id) {
          await hubspotUpdateCompany(credentials.accessToken, crm_record_id, payload);
          resultRecordId = crm_record_id;
        } else if (operation === 'delete' && crm_record_id) {
          await hubspotDeleteCompany(credentials.accessToken, crm_record_id);
        }
      } else if (entity_type === 'deal') {
        if (operation === 'create') {
          resultRecordId = await hubspotCreateDeal(credentials.accessToken, payload);
        } else if (operation === 'update' && crm_record_id) {
          await hubspotUpdateDeal(credentials.accessToken, crm_record_id, payload);
          resultRecordId = crm_record_id;
        } else if (operation === 'delete' && crm_record_id) {
          await hubspotDeleteDeal(credentials.accessToken, crm_record_id);
        }
      }
    } else if (crm_source === 'attio') {
      // Map entity types to Attio object types
      const objectTypeMap: Record<string, string> = {
        contact: 'people',
        company: 'companies',
        deal: 'deals',
      };

      const attioObjectType = objectTypeMap[entity_type];
      if (!attioObjectType) {
        throw new Error(`Unsupported Attio entity type: ${entity_type}`);
      }

      if (operation === 'create') {
        resultRecordId = await attioCreateRecord(
          credentials.accessToken,
          attioObjectType,
          payload
        );
      } else if (operation === 'update' && crm_record_id) {
        await attioUpdateRecord(credentials.accessToken, attioObjectType, crm_record_id, payload);
        resultRecordId = crm_record_id;
      } else if (operation === 'delete' && crm_record_id) {
        await attioDeleteRecord(credentials.accessToken, attioObjectType, crm_record_id);
      }
    }

    // Mark as completed
    await completeItem(id, resultRecordId);

    console.log(
      `[crm-writeback-worker] Completed item ${id}: ${operation} ${entity_type} -> ${resultRecordId || 'association'}`
    );

    return {
      success: true,
      itemId: id,
      crmRecordId: resultRecordId,
    };
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    console.error(`[crm-writeback-worker] Error processing item ${id}:`, errorMessage);

    // Check if we should move to DLQ
    const moveToDlq = item.attempts >= item.max_attempts - 1;

    await failItem(id, errorMessage, moveToDlq);

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
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`[crm-writeback-worker] Processing ${items.length} items`);

    // Process items sequentially to avoid rate limits
    const results: ProcessingResult[] = [];
    for (const item of items) {
      const result = await processItem(item);
      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;
    const processingTime = Date.now() - startTime;

    console.log(
      `[crm-writeback-worker] Completed: ${successCount} success, ${failureCount} failures in ${processingTime}ms`
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
          crmRecordId: r.crmRecordId,
          error: r.error,
        })),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('[crm-writeback-worker] Worker error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Worker processing failed',
        processingTimeMs: Date.now() - startTime,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}

// Export for Deno
Deno.serve(handleWorker);
