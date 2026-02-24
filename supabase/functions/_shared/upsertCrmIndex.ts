// supabase/functions/_shared/upsertCrmIndex.ts
// Shared utility for upserting CRM webhook data into the CRM index tables
// Called by hubspot-webhook and attio-webhook handlers for fast indexing

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export type CrmSource = 'hubspot' | 'attio';
export type EntityType = 'contact' | 'company' | 'deal';

/**
 * Extract HubSpot property values from nested structure.
 * HubSpot format: { properties: { firstname: { value: "John" } } }
 * or sometimes: { firstname: "John" } (direct properties)
 */
function extractHubSpotProperty(properties: Record<string, any>, key: string): string | null {
  const props = properties.properties || properties;
  const val = props[key];

  if (!val) return null;

  // Handle nested format: { value: "John" }
  if (typeof val === 'object' && 'value' in val) {
    return val.value ? String(val.value) : null;
  }

  // Handle direct format: "John"
  return val ? String(val) : null;
}

/**
 * Extract Attio property values.
 * Attio format: { first_name: "John" } or { email_addresses: ["john@example.com"] }
 */
function extractAttioProperty(properties: Record<string, any>, key: string): string | null {
  const val = properties[key];

  if (!val) return null;

  // Handle array values (Attio uses arrays for multi-value fields)
  if (Array.isArray(val)) {
    return val.length > 0 ? String(val[0]) : null;
  }

  // Handle object values with attribute_type (Attio values format)
  if (typeof val === 'object' && 'attribute_type' in val) {
    // Extract based on attribute_type
    if (val.attribute_type === 'email' && val.email_address) {
      return String(val.email_address);
    }
    if (val.attribute_type === 'text' && val.text_value) {
      return String(val.text_value);
    }
    // Generic value extraction
    if ('value' in val) {
      return val.value ? String(val.value) : null;
    }
  }

  return val ? String(val) : null;
}

/**
 * Extract property value based on CRM source
 */
function extractProperty(
  properties: Record<string, any>,
  source: CrmSource,
  key: string
): string | null {
  if (source === 'hubspot') {
    return extractHubSpotProperty(properties, key);
  }
  return extractAttioProperty(properties, key);
}

/**
 * Extract numeric property (handle currency formatting, etc.)
 */
function extractNumericProperty(
  properties: Record<string, any>,
  source: CrmSource,
  key: string
): number | null {
  const val = extractProperty(properties, source, key);
  if (!val) return null;

  // Remove currency symbols, commas
  const cleaned = val.replace(/[$,]/g, '');
  const num = parseFloat(cleaned);

  return isNaN(num) ? null : num;
}

/**
 * Extract date property
 */
function extractDateProperty(
  properties: Record<string, any>,
  source: CrmSource,
  key: string
): string | null {
  const val = extractProperty(properties, source, key);
  if (!val) return null;

  try {
    // Parse and format as ISO date
    const date = new Date(val);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

export interface UpsertContactIndexInput {
  supabase: SupabaseClient; // service role client
  orgId: string;
  crmSource: CrmSource;
  crmRecordId: string;
  properties: Record<string, any>;
}

export interface UpsertContactIndexResult {
  success: boolean;
  contactId?: string;
  isMaterialized: boolean;
  error?: string;
}

/**
 * Upsert a contact into crm_contact_index.
 * Returns the index record ID and materialization status.
 */
export async function upsertContactIndex(
  input: UpsertContactIndexInput
): Promise<UpsertContactIndexResult> {
  const { supabase, orgId, crmSource, crmRecordId, properties } = input;

  try {
    // Extract properties based on CRM source
    const firstName = crmSource === 'hubspot'
      ? extractProperty(properties, crmSource, 'firstname')
      : extractProperty(properties, crmSource, 'first_name');

    const lastName = crmSource === 'hubspot'
      ? extractProperty(properties, crmSource, 'lastname')
      : extractProperty(properties, crmSource, 'last_name');

    const email = extractProperty(properties, crmSource, 'email');

    const companyName = crmSource === 'hubspot'
      ? extractProperty(properties, crmSource, 'company')
      : extractProperty(properties, crmSource, 'company_name');

    const jobTitle = crmSource === 'hubspot'
      ? extractProperty(properties, crmSource, 'jobtitle')
      : extractProperty(properties, crmSource, 'job_title');

    const lifecycleStage = crmSource === 'hubspot'
      ? extractProperty(properties, crmSource, 'lifecyclestage')
      : extractProperty(properties, crmSource, 'lifecycle_stage');

    const leadStatus = crmSource === 'hubspot'
      ? extractProperty(properties, crmSource, 'hs_lead_status')
      : extractProperty(properties, crmSource, 'lead_status');

    // Derive full_name from first + last
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;

    const phone = extractProperty(properties, crmSource, 'phone') ||
      extractProperty(properties, crmSource, 'mobilephone') ||
      extractProperty(properties, crmSource, 'phone_numbers');

    const companyDomain = extractProperty(properties, crmSource, 'hs_email_domain') ||
      extractProperty(properties, crmSource, 'company_domain');

    const ownerCrmId = crmSource === 'hubspot'
      ? extractProperty(properties, crmSource, 'hubspot_owner_id')
      : extractProperty(properties, crmSource, 'owner_id');

    // Extract CRM timestamps
    const crmCreatedAt = extractDateProperty(properties, crmSource, 'createdate') ||
      extractDateProperty(properties, crmSource, 'created_at');

    const crmUpdatedAt = extractDateProperty(properties, crmSource, 'lastmodifieddate') ||
      extractDateProperty(properties, crmSource, 'hs_lastmodifieddate') ||
      extractDateProperty(properties, crmSource, 'updated_at') ||
      new Date().toISOString();

    // Upsert into crm_contact_index
    const { data, error } = await supabase
      .from('crm_contact_index')
      .upsert({
        org_id: orgId,
        crm_source: crmSource,
        crm_record_id: crmRecordId,
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        email,
        phone,
        company_name: companyName,
        company_domain: companyDomain,
        job_title: jobTitle,
        lifecycle_stage: lifecycleStage,
        lead_status: leadStatus,
        owner_crm_id: ownerCrmId,
        crm_created_at: crmCreatedAt,
        crm_updated_at: crmUpdatedAt,
        raw_properties: properties,
        last_webhook_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'org_id,crm_source,crm_record_id',
        ignoreDuplicates: false,
      })
      .select('id, is_materialized')
      .single();

    if (error) throw error;

    return {
      success: true,
      contactId: data.id,
      isMaterialized: data.is_materialized || false,
    };
  } catch (err) {
    return {
      success: false,
      isMaterialized: false,
      error: (err as Error).message,
    };
  }
}

export interface UpsertCompanyIndexInput {
  supabase: SupabaseClient;
  orgId: string;
  crmSource: CrmSource;
  crmRecordId: string;
  properties: Record<string, any>;
}

export interface UpsertCompanyIndexResult {
  success: boolean;
  companyId?: string;
  isMaterialized: boolean;
  error?: string;
}

/**
 * Upsert a company into crm_company_index.
 */
export async function upsertCompanyIndex(
  input: UpsertCompanyIndexInput
): Promise<UpsertCompanyIndexResult> {
  const { supabase, orgId, crmSource, crmRecordId, properties } = input;

  try {
    // Extract properties
    const name = extractProperty(properties, crmSource, 'name');
    const domain = extractProperty(properties, crmSource, 'domain') ||
      extractProperty(properties, crmSource, 'domains');

    const industry = extractProperty(properties, crmSource, 'industry');

    const employeeCount = crmSource === 'hubspot'
      ? extractProperty(properties, crmSource, 'numberofemployees')
      : extractProperty(properties, crmSource, 'employee_count');

    const annualRevenue = crmSource === 'hubspot'
      ? extractNumericProperty(properties, crmSource, 'annualrevenue')
      : extractNumericProperty(properties, crmSource, 'estimated_arr');

    const city = extractProperty(properties, crmSource, 'city');
    const state = extractProperty(properties, crmSource, 'state') ||
      extractProperty(properties, crmSource, 'province');
    const country = extractProperty(properties, crmSource, 'country');

    const crmUpdatedAt = extractDateProperty(properties, crmSource, 'hs_lastmodifieddate') ||
      extractDateProperty(properties, crmSource, 'updated_at') ||
      new Date().toISOString();

    // Upsert into crm_company_index
    const { data, error } = await supabase
      .from('crm_company_index')
      .upsert({
        org_id: orgId,
        crm_source: crmSource,
        crm_record_id: crmRecordId,
        name,
        domain,
        industry,
        employee_count: employeeCount,
        annual_revenue: annualRevenue,
        city,
        state,
        country,
        crm_updated_at: crmUpdatedAt,
        raw_properties: properties,
        last_webhook_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'org_id,crm_source,crm_record_id',
        ignoreDuplicates: false,
      })
      .select('id, is_materialized')
      .single();

    if (error) throw error;

    return {
      success: true,
      companyId: data.id,
      isMaterialized: data.is_materialized || false,
    };
  } catch (err) {
    return {
      success: false,
      isMaterialized: false,
      error: (err as Error).message,
    };
  }
}

export interface UpsertDealIndexInput {
  supabase: SupabaseClient;
  orgId: string;
  crmSource: CrmSource;
  crmRecordId: string;
  properties: Record<string, any>;
}

export interface UpsertDealIndexResult {
  success: boolean;
  dealId?: string;
  contactsUpdated: number;
  error?: string;
}

/**
 * Upsert a deal into crm_deal_index.
 * Also updates has_active_deal, deal_stage, and deal_value on associated contact index records.
 */
export async function upsertDealIndex(
  input: UpsertDealIndexInput
): Promise<UpsertDealIndexResult> {
  const { supabase, orgId, crmSource, crmRecordId, properties } = input;

  try {
    // Extract properties
    const name = crmSource === 'hubspot'
      ? extractProperty(properties, crmSource, 'dealname')
      : extractProperty(properties, crmSource, 'name');

    const stage = crmSource === 'hubspot'
      ? extractProperty(properties, crmSource, 'dealstage')
      : extractProperty(properties, crmSource, 'stage');

    const amount = crmSource === 'hubspot'
      ? extractNumericProperty(properties, crmSource, 'amount')
      : extractNumericProperty(properties, crmSource, 'value');

    const closeDate = crmSource === 'hubspot'
      ? extractDateProperty(properties, crmSource, 'closedate')
      : extractDateProperty(properties, crmSource, 'close_date');

    const pipeline = crmSource === 'hubspot'
      ? extractProperty(properties, crmSource, 'pipeline')
      : extractProperty(properties, crmSource, 'pipeline_name');

    // Extract association IDs (these will be CRM IDs, not app UUIDs)
    // Note: Webhook events may not include associations - those are fetched during initial sync
    const contactCrmIds = properties.associations?.contacts || [];
    const companyCrmId = properties.associations?.company || null;
    const ownerCrmId = crmSource === 'hubspot'
      ? extractProperty(properties, crmSource, 'hubspot_owner_id')
      : extractProperty(properties, crmSource, 'owner_id');

    const crmUpdatedAt = extractDateProperty(properties, crmSource, 'hs_lastmodifieddate') ||
      extractDateProperty(properties, crmSource, 'updated_at') ||
      new Date().toISOString();

    // Upsert into crm_deal_index
    const { data: dealData, error: dealError } = await supabase
      .from('crm_deal_index')
      .upsert({
        org_id: orgId,
        crm_source: crmSource,
        crm_record_id: crmRecordId,
        name,
        stage,
        pipeline,
        amount,
        close_date: closeDate,
        contact_crm_ids: contactCrmIds,
        company_crm_id: companyCrmId,
        owner_crm_id: ownerCrmId,
        crm_updated_at: crmUpdatedAt,
        raw_properties: properties,
        last_webhook_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'org_id,crm_source,crm_record_id',
        ignoreDuplicates: false,
      })
      .select('id')
      .single();

    if (dealError) throw dealError;

    // Determine if this is an active deal (not closed-won or closed-lost)
    const isActiveDeal = stage && !stage.toLowerCase().includes('closed');

    // Update associated contacts in the index
    let contactsUpdated = 0;
    if (contactCrmIds.length > 0) {
      const { error: contactUpdateError } = await supabase
        .from('crm_contact_index')
        .update({
          has_active_deal: isActiveDeal,
          deal_stage: stage,
          deal_value: amount,
          updated_at: new Date().toISOString(),
        })
        .eq('org_id', orgId)
        .eq('crm_source', crmSource)
        .in('crm_record_id', contactCrmIds);

      if (!contactUpdateError) {
        contactsUpdated = contactCrmIds.length;
      }
    }

    return {
      success: true,
      dealId: dealData.id,
      contactsUpdated,
    };
  } catch (err) {
    return {
      success: false,
      contactsUpdated: 0,
      error: (err as Error).message,
    };
  }
}

export interface DeleteFromIndexInput {
  supabase: SupabaseClient;
  orgId: string;
  crmSource: CrmSource;
  crmRecordId: string;
  entityType: EntityType;
}

export interface DeleteFromIndexResult {
  success: boolean;
  deleted: boolean;
  error?: string;
}

/**
 * Delete a record from the CRM index (hard delete, not soft).
 * Called when a CRM record is deleted via webhook.
 */
export async function deleteFromIndex(
  input: DeleteFromIndexInput
): Promise<DeleteFromIndexResult> {
  const { supabase, orgId, crmSource, crmRecordId, entityType } = input;

  try {
    const tableName = entityType === 'contact'
      ? 'crm_contact_index'
      : entityType === 'company'
      ? 'crm_company_index'
      : 'crm_deal_index';

    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('org_id', orgId)
      .eq('crm_source', crmSource)
      .eq('crm_record_id', crmRecordId);

    if (error) throw error;

    return {
      success: true,
      deleted: true,
    };
  } catch (err) {
    return {
      success: false,
      deleted: false,
      error: (err as Error).message,
    };
  }
}
