// supabase/functions/_shared/conflictResolver.ts
// Sync conflict resolution utility for multi-source cell updates
// Used by webhook handlers when both app and CRM sources update the same cell

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export interface ConflictInput {
  cellId: string;
  tableId: string;
  columnKey: string;
  rowSourceId?: string;
  currentValue: string | null;
  currentSource: string | null;
  currentSourceUpdatedAt: string | null;
  incomingValue: string;
  incomingSource: 'hubspot' | 'attio' | 'app' | 'manual';
  incomingTimestamp: string; // ISO timestamp
}

export interface ConflictResult {
  winner: 'incoming' | 'existing';
  finalValue: string;
  conflictLogged: boolean;
}

/**
 * Resolves a sync conflict using last-writer-wins strategy.
 * Logs the conflict for audit purposes regardless of outcome.
 *
 * @param supabase Supabase client (should have appropriate permissions)
 * @param input Conflict resolution input with current and incoming values
 * @returns Result indicating winner and whether conflict was logged
 */
export async function resolveConflict(
  supabase: SupabaseClient,
  input: ConflictInput
): Promise<ConflictResult> {
  const {
    cellId, tableId, columnKey, rowSourceId,
    currentValue, currentSource, currentSourceUpdatedAt,
    incomingValue, incomingSource, incomingTimestamp
  } = input;

  // Determine winner: last writer wins based on timestamp
  const existingTime = currentSourceUpdatedAt ? new Date(currentSourceUpdatedAt).getTime() : 0;
  const incomingTime = new Date(incomingTimestamp).getTime();

  const incomingWins = incomingTime >= existingTime;
  const isActualConflict = currentValue !== null && currentValue !== incomingValue && currentSource !== incomingSource;

  // Determine which value is from app vs CRM
  const isCurrentFromApp = currentSource === 'manual' || currentSource === 'app';
  const isCurrentFromCRM = currentSource === 'hubspot' || currentSource === 'attio';
  const isIncomingFromApp = incomingSource === 'manual' || incomingSource === 'app';
  const isIncomingFromCRM = incomingSource === 'hubspot' || incomingSource === 'attio';

  const appValue = isCurrentFromApp ? currentValue : isIncomingFromApp ? incomingValue : currentValue;
  const crmValue = isCurrentFromCRM ? currentValue : isIncomingFromCRM ? incomingValue : incomingValue;

  // Log conflict if values actually differ from different sources
  let conflictLogged = false;
  if (isActualConflict) {
    const { error } = await supabase
      .from('ops_sync_conflicts')
      .insert({
        cell_id: cellId,
        table_id: tableId,
        column_key: columnKey,
        row_source_id: rowSourceId || null,
        app_value: appValue,
        crm_value: crmValue,
        crm_source: incomingSource,
        winner: incomingWins ? 'crm' : 'app',
        resolved_by: 'auto_last_writer_wins'
      });

    if (!error) conflictLogged = true;
  }

  // Update cell if incoming wins
  if (incomingWins) {
    await supabase
      .from('dynamic_table_cells')
      .update({
        value: incomingValue,
        last_source: incomingSource,
        source_updated_at: incomingTimestamp,
        updated_at: new Date().toISOString()
      })
      .eq('id', cellId);
  }

  return {
    winner: incomingWins ? 'incoming' : 'existing',
    finalValue: incomingWins ? incomingValue : (currentValue || incomingValue),
    conflictLogged
  };
}

/**
 * Get conflict count for a table (for health dashboard).
 *
 * @param supabase Supabase client
 * @param tableId ID of the table to check
 * @param sinceDays Number of days to look back (default: 7)
 * @returns Count of conflicts in the specified period
 */
export async function getConflictCount(
  supabase: SupabaseClient,
  tableId: string,
  sinceDays: number = 7
): Promise<number> {
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

  const { count, error } = await supabase
    .from('ops_sync_conflicts')
    .select('id', { count: 'exact', head: true })
    .eq('table_id', tableId)
    .gte('created_at', since.toISOString());

  if (error) return 0;
  return count || 0;
}

/**
 * Get recent conflicts for a table with details.
 * Useful for displaying conflict history or dashboard widgets.
 *
 * @param supabase Supabase client
 * @param tableId ID of the table to check
 * @param limit Maximum number of conflicts to return (default: 10)
 * @returns Array of recent conflicts sorted by timestamp descending
 */
export async function getRecentConflicts(
  supabase: SupabaseClient,
  tableId: string,
  limit: number = 10
): Promise<any[]> {
  const { data, error } = await supabase
    .from('ops_sync_conflicts')
    .select('*')
    .eq('table_id', tableId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return data || [];
}
