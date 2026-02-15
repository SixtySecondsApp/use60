// supabase/functions/_shared/enqueueWriteback.ts
// Helper to enqueue CRM write-back operations for async processing

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export type CrmSource = 'hubspot' | 'attio';
export type EntityType = 'contact' | 'company' | 'deal' | 'activity';
export type OperationType = 'create' | 'update' | 'associate';

export interface EnqueueWritebackInput {
  supabase: SupabaseClient; // service role client
  orgId: string;
  crmSource: CrmSource;
  entityType: EntityType;
  operation: OperationType;
  crmRecordId?: string; // Required for update/associate, null for create
  payload: Record<string, any>; // Fields to write to CRM
  triggeredBy: 'copilot' | 'enrichment' | 'automation' | 'user';
  triggeredByUserId?: string;
  priority?: number; // 1=highest, 10=lowest, default=5
}

export interface EnqueueWritebackResult {
  success: boolean;
  queueItemId?: string;
  error?: string;
}

/**
 * Generate a deduplication key to prevent duplicate operations in the queue.
 * Format: {org_id}:{crm_source}:{entity_type}:{operation}:{crm_record_id|create}:{timestamp_hour}
 */
function generateDedupeKey(input: EnqueueWritebackInput): string {
  const {
    orgId,
    crmSource,
    entityType,
    operation,
    crmRecordId,
  } = input;

  // For updates, dedupe by record ID and hour (allow 1 update per hour per record)
  // For creates, dedupe by entity type and hour (prevent duplicate creates in same hour)
  const now = new Date();
  const hour = now.toISOString().slice(0, 13); // "2026-02-15T14"

  const recordPart = crmRecordId || 'create';
  return `${orgId}:${crmSource}:${entityType}:${operation}:${recordPart}:${hour}`;
}

/**
 * Enqueue a CRM write-back operation for async processing.
 * Returns the queue item ID if successfully enqueued.
 */
export async function enqueueWriteback(
  input: EnqueueWritebackInput
): Promise<EnqueueWritebackResult> {
  const { supabase, orgId, crmSource, entityType, operation, crmRecordId, payload, triggeredBy, triggeredByUserId, priority } = input;

  try {
    // Validate inputs
    if (!orgId) {
      throw new Error('orgId is required');
    }

    if (operation === 'update' && !crmRecordId) {
      throw new Error('crmRecordId is required for update operations');
    }

    // Generate dedupe key
    const dedupeKey = generateDedupeKey(input);

    // Insert into queue
    const { data, error } = await supabase
      .from('crm_writeback_queue')
      .insert({
        org_id: orgId,
        crm_source: crmSource,
        entity_type: entityType,
        operation,
        crm_record_id: crmRecordId || null,
        payload,
        triggered_by: triggeredBy,
        triggered_by_user_id: triggeredByUserId || null,
        priority: priority || 5,
        dedupe_key: dedupeKey,
        status: 'pending',
        next_retry_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      // Check for dedupe conflict (not a real error)
      if (error.code === '23505') {
        console.log(`[enqueueWriteback] Deduplicated operation: ${dedupeKey}`);
        return {
          success: true,
          error: 'Operation deduplicated (already in queue)',
        };
      }
      throw error;
    }

    return {
      success: true,
      queueItemId: data.id,
    };
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message,
    };
  }
}

/**
 * Map internal field names to HubSpot property names.
 * This converts our generic database field names to CRM-specific names.
 */
export function mapFieldsToHubSpot(
  entityType: EntityType,
  fields: Record<string, any>
): Record<string, any> {
  const mapped: Record<string, any> = {};

  if (entityType === 'contact') {
    if ('first_name' in fields) mapped.firstname = fields.first_name;
    if ('last_name' in fields) mapped.lastname = fields.last_name;
    if ('email' in fields) mapped.email = fields.email;
    if ('phone' in fields) mapped.phone = fields.phone;
    if ('company' in fields) mapped.company = fields.company;
    if ('job_title' in fields) mapped.jobtitle = fields.job_title;
    if ('lifecycle_stage' in fields) mapped.lifecyclestage = fields.lifecycle_stage;
    if ('lead_status' in fields) mapped.hs_lead_status = fields.lead_status;
  } else if (entityType === 'deal') {
    if ('name' in fields) mapped.dealname = fields.name;
    if ('stage' in fields) mapped.dealstage = fields.stage;
    if ('amount' in fields) mapped.amount = fields.amount;
    if ('close_date' in fields) mapped.closedate = fields.close_date;
    if ('pipeline' in fields) mapped.pipeline = fields.pipeline;
  } else if (entityType === 'company') {
    if ('name' in fields) mapped.name = fields.name;
    if ('domain' in fields) mapped.domain = fields.domain;
    if ('industry' in fields) mapped.industry = fields.industry;
    if ('employee_count' in fields) mapped.numberofemployees = fields.employee_count;
    if ('annual_revenue' in fields) mapped.annualrevenue = fields.annual_revenue;
  }

  return mapped;
}

/**
 * Map internal field names to Attio property names.
 */
export function mapFieldsToAttio(
  entityType: EntityType,
  fields: Record<string, any>
): Record<string, any> {
  const mapped: Record<string, any> = {};

  if (entityType === 'contact') {
    if ('first_name' in fields) mapped.first_name = fields.first_name;
    if ('last_name' in fields) mapped.last_name = fields.last_name;
    if ('email' in fields) mapped.email_addresses = [{ email_address: fields.email }];
    if ('phone' in fields) mapped.phone_numbers = [{ phone_number: fields.phone }];
    if ('company' in fields) mapped.company_name = fields.company;
    if ('job_title' in fields) mapped.job_title = fields.job_title;
    if ('lifecycle_stage' in fields) mapped.lifecycle_stage = fields.lifecycle_stage;
    if ('lead_status' in fields) mapped.lead_status = fields.lead_status;
  } else if (entityType === 'deal') {
    if ('name' in fields) mapped.name = fields.name;
    if ('stage' in fields) mapped.stage = fields.stage;
    if ('amount' in fields) mapped.value = fields.amount;
    if ('close_date' in fields) mapped.close_date = fields.close_date;
  } else if (entityType === 'company') {
    if ('name' in fields) mapped.name = fields.name;
    if ('domain' in fields) mapped.domains = [{ domain: fields.domain }];
    if ('industry' in fields) mapped.industry = fields.industry;
    if ('employee_count' in fields) mapped.employee_count = fields.employee_count;
    if ('annual_revenue' in fields) mapped.estimated_arr = fields.annual_revenue;
  }

  return mapped;
}
