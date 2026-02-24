// supabase/functions/_shared/standardTableSync.ts
// Shared utility for syncing CRM webhook data into standard ops tables
// Called by hubspot-webhook and attio-webhook handlers

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { resolveConflict } from './conflictResolver.ts';

// CRM property name → standard table column key mappings
const HUBSPOT_CONTACT_MAPPINGS: Record<string, string> = {
  firstname: 'first_name',
  lastname: 'last_name',
  email: 'email',
  company: 'company',
  jobtitle: 'title',
  phone: 'phone',
  hs_linkedinid: 'linkedin_url',
  lifecyclestage: 'engagement_level', // for Leads table
  notes_last_updated: 'last_interaction',
  createdate: 'created_at',
};

const HUBSPOT_COMPANY_MAPPINGS: Record<string, string> = {
  name: 'name',
  domain: 'domain',
  website: 'website',
  industry: 'industry',
  numberofemployees: 'company_size',
  phone: 'phone',
  linkedin_company_page: 'linkedin_url',
  description: 'description',
  annualrevenue: 'revenue',
  notes_last_updated: 'last_contact_date',
};

const ATTIO_CONTACT_MAPPINGS: Record<string, string> = {
  first_name: 'first_name',
  last_name: 'last_name',
  email_addresses: 'email',
  company_name: 'company',
  job_title: 'title',
  phone_numbers: 'phone',
  linkedin: 'linkedin_url',
  lead_status: 'engagement_level',
};

const ATTIO_COMPANY_MAPPINGS: Record<string, string> = {
  name: 'name',
  domains: 'domain',
  website: 'website',
  industry: 'industry',
  employee_count: 'company_size',
  phone_numbers: 'phone',
  linkedin: 'linkedin_url',
  description: 'description',
  estimated_arr: 'revenue',
};

export type CrmSource = 'hubspot' | 'attio';

export interface SyncToStandardTableInput {
  supabase: SupabaseClient; // service role client
  orgId: string;
  crmSource: CrmSource;
  entityType: 'contact' | 'company';
  crmRecordId: string;
  properties: Record<string, any>; // CRM property values
  timestamp: string; // ISO timestamp of the CRM event
}

export interface SyncResult {
  success: boolean;
  tablesUpdated: string[];
  rowsUpserted: number;
  conflictsDetected: number;
  errors: string[];
}

interface UpsertRowResult {
  upserted: boolean;
  conflicts: number;
}

interface TableInfo {
  id: string;
  name: string;
}

interface ColumnInfo {
  id: string;
  key: string;
}

/**
 * Rate limiting: track webhook counts per org
 * Simple in-memory tracker (resets on function cold start)
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_PER_MINUTE = 100;

function checkRateLimit(orgId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(orgId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(orgId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= RATE_LIMIT_PER_MINUTE) return false;
  entry.count++;
  return true;
}

/**
 * Extract CRM property values, normalizing different formats.
 * HubSpot uses nested structure: properties.firstname.value
 * Attio uses flat structure: { first_name: "value" }
 */
export function extractCrmProperties(
  properties: Record<string, any>,
  source: CrmSource
): Record<string, string> {
  const extracted: Record<string, string> = {};

  if (source === 'hubspot') {
    // HubSpot format: { properties: { firstname: { value: "John" } } }
    const props = properties.properties || properties;
    for (const [key, val] of Object.entries(props)) {
      if (val && typeof val === 'object' && 'value' in val) {
        extracted[key] = String(val.value || '');
      } else if (val !== null && val !== undefined) {
        extracted[key] = String(val);
      }
    }
  } else {
    // Attio format: { first_name: "John" }
    for (const [key, val] of Object.entries(properties)) {
      if (Array.isArray(val)) {
        // Attio uses arrays for multi-value fields like email_addresses, phone_numbers
        extracted[key] = val.length > 0 ? String(val[0]) : '';
      } else if (val !== null && val !== undefined) {
        extracted[key] = String(val);
      }
    }
  }

  return extracted;
}

/**
 * Sync a CRM record into the appropriate standard ops table(s).
 * Called by hubspot-webhook and attio-webhook handlers.
 */
export async function syncToStandardTable(input: SyncToStandardTableInput): Promise<SyncResult> {
  const { supabase, orgId, crmSource, entityType, crmRecordId, properties, timestamp } = input;
  const result: SyncResult = { success: true, tablesUpdated: [], rowsUpserted: 0, conflictsDetected: 0, errors: [] };

  // Rate limit check
  if (!checkRateLimit(orgId)) {
    return { ...result, success: false, errors: ['Rate limit exceeded: 100 events/org/minute'] };
  }

  try {
    // 1. Find the standard tables for this org
    const { data: tables, error: tablesError } = await supabase
      .from('dynamic_tables')
      .select('id, name')
      .eq('organization_id', orgId)
      .eq('is_standard', true);

    if (tablesError) throw tablesError;
    if (!tables?.length) return { ...result, errors: ['No standard tables provisioned for this org'] };

    // 2. Determine which tables to update based on entity type
    const targetTables = getTargetTables(tables, entityType);

    // 3. Get the right property mapping
    const mapping = getMapping(crmSource, entityType);

    // 4. Extract CRM properties
    const extractedProps = extractCrmProperties(properties, crmSource);

    // 5. For each target table, upsert the row
    for (const table of targetTables) {
      try {
        const upsertResult = await upsertRowInTable(
          supabase,
          table,
          mapping,
          crmSource,
          crmRecordId,
          extractedProps,
          timestamp
        );
        if (upsertResult.upserted) {
          result.tablesUpdated.push(table.name);
          result.rowsUpserted++;
        }
        result.conflictsDetected += upsertResult.conflicts;
      } catch (err) {
        result.errors.push(`${table.name}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    result.success = false;
    result.errors.push((err as Error).message);
  }

  return result;
}

function getTargetTables(tables: TableInfo[], entityType: string): TableInfo[] {
  if (entityType === 'contact') {
    // Contact updates go to both "Leads" and "All Contacts" tables
    return tables.filter(t => t.name === 'Leads' || t.name === 'All Contacts');
  } else if (entityType === 'company') {
    return tables.filter(t => t.name === 'All Companies');
  }
  return [];
}

function getMapping(source: CrmSource, entityType: string): Record<string, string> {
  if (source === 'hubspot') {
    return entityType === 'contact' ? HUBSPOT_CONTACT_MAPPINGS : HUBSPOT_COMPANY_MAPPINGS;
  }
  return entityType === 'contact' ? ATTIO_CONTACT_MAPPINGS : ATTIO_COMPANY_MAPPINGS;
}

/**
 * Upsert a row into a dynamic table based on CRM data.
 *
 * 1. Gets column definitions for the table
 * 2. Checks if row exists by source_id = crmRecordId
 * 3. If exists: update cells using conflict resolver
 * 4. If not exists: create row + cells
 * 5. Return upsert result with conflict count
 */
async function upsertRowInTable(
  supabase: SupabaseClient,
  table: TableInfo,
  mapping: Record<string, string>,
  crmSource: CrmSource,
  crmRecordId: string,
  properties: Record<string, string>,
  timestamp: string
): Promise<UpsertRowResult> {
  let conflictCount = 0;

  // 1. Get column definitions for this table
  const { data: columns, error: columnsError } = await supabase
    .from('dynamic_table_columns')
    .select('id, key')
    .eq('table_id', table.id);

  if (columnsError) throw columnsError;
  if (!columns?.length) throw new Error('No columns found for table');

  // Build a map of column key -> column ID for quick lookup
  const columnMap = new Map<string, string>();
  for (const col of columns) {
    columnMap.set(col.key, col.id);
  }

  // 2. Check if row already exists with this source_id
  const { data: existingRows, error: rowQueryError } = await supabase
    .from('dynamic_table_rows')
    .select('id')
    .eq('table_id', table.id)
    .eq('source_type', crmSource)
    .eq('source_id', crmRecordId)
    .limit(1);

  if (rowQueryError) throw rowQueryError;

  let rowId: string;

  if (existingRows && existingRows.length > 0) {
    // Row exists - update cells with conflict resolution
    rowId = existingRows[0].id;

    // Get existing cells for this row
    const { data: existingCells, error: cellsError } = await supabase
      .from('dynamic_table_cells')
      .select('id, column_id, value, last_source, source_updated_at')
      .eq('row_id', rowId);

    if (cellsError) throw cellsError;

    // Build map of column_id -> existing cell
    const cellMap = new Map<string, any>();
    if (existingCells) {
      for (const cell of existingCells) {
        cellMap.set(cell.column_id, cell);
      }
    }

    // For each mapped property, upsert or update the cell
    for (const [crmKey, standardKey] of Object.entries(mapping)) {
      const columnId = columnMap.get(standardKey);
      if (!columnId) continue; // Column doesn't exist in this table

      const incomingValue = properties[crmKey];
      if (incomingValue === undefined || incomingValue === null || incomingValue === '') continue;

      const existingCell = cellMap.get(columnId);

      if (existingCell) {
        // Cell exists - use conflict resolver
        const conflictResult = await resolveConflict(supabase, {
          cellId: existingCell.id,
          tableId: table.id,
          columnKey: standardKey,
          rowSourceId: crmRecordId,
          currentValue: existingCell.value,
          currentSource: existingCell.last_source,
          currentSourceUpdatedAt: existingCell.source_updated_at,
          incomingValue,
          incomingSource: crmSource,
          incomingTimestamp: timestamp
        });

        if (conflictResult.conflictLogged) conflictCount++;
      } else {
        // Cell doesn't exist - create it
        await supabase
          .from('dynamic_table_cells')
          .insert({
            row_id: rowId,
            column_id: columnId,
            value: incomingValue,
            last_source: crmSource,
            source_updated_at: timestamp,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
      }
    }

    // Update row's updated_at timestamp
    await supabase
      .from('dynamic_table_rows')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', rowId);

  } else {
    // Row doesn't exist - create it
    const { data: newRow, error: insertError } = await supabase
      .from('dynamic_table_rows')
      .insert({
        table_id: table.id,
        source_type: crmSource,
        source_id: crmRecordId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (insertError) throw insertError;
    rowId = newRow.id;

    // Create cells for all mapped properties
    const cellsToInsert = [];
    for (const [crmKey, standardKey] of Object.entries(mapping)) {
      const columnId = columnMap.get(standardKey);
      if (!columnId) continue;

      const value = properties[crmKey];
      if (value === undefined || value === null || value === '') continue;

      cellsToInsert.push({
        row_id: rowId,
        column_id: columnId,
        value,
        last_source: crmSource,
        source_updated_at: timestamp,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    if (cellsToInsert.length > 0) {
      const { error: cellInsertError } = await supabase
        .from('dynamic_table_cells')
        .insert(cellsToInsert);

      if (cellInsertError) throw cellInsertError;
    }
  }

  return { upserted: true, conflicts: conflictCount };
}
