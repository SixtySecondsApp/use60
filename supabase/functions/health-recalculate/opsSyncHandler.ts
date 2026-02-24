// supabase/functions/health-recalculate/opsSyncHandler.ts
// Syncs health scores to Deals standard ops table after recalculation

/**
 * Sync health scores to the Deals ops table for specific deals
 */
export async function syncHealthScoresToOpsTable(
  supabase: any,
  dealIds: string[],
  orgId: string
): Promise<{ success: boolean; syncedCount: number; error?: string }> {
  if (!dealIds || dealIds.length === 0) {
    return { success: true, syncedCount: 0 };
  }

  try {
    // Call the sync function for these specific deals
    const { data, error } = await supabase.rpc('sync_deals_to_ops_table', {
      p_org_id: orgId,
      p_deal_ids: dealIds,
    });

    if (error) {
      console.error('[opsSyncHandler] Failed to sync deals to ops table:', error.message);
      return { success: false, syncedCount: 0, error: error.message };
    }

    const syncedCount = data?.synced_count || 0;
    console.log(`[opsSyncHandler] Synced ${syncedCount} deals to ops table for org ${orgId}`);

    return { success: true, syncedCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[opsSyncHandler] Failed to sync deals to ops table:', message);
    return { success: false, syncedCount: 0, error: message };
  }
}

/**
 * Update computed cell metadata to mark cells as auto-computed
 */
export async function markCellsAsComputed(
  supabase: any,
  dealIds: string[],
  orgId: string
): Promise<void> {
  if (!dealIds || dealIds.length === 0) {
    return;
  }

  try {
    // Find the Deals table for this org
    const { data: table } = await supabase
      .from('dynamic_tables')
      .select('id')
      .eq('organization_id', orgId)
      .eq('name', 'Deals')
      .eq('is_standard', true)
      .maybeSingle();

    if (!table) {
      console.log('[opsSyncHandler] Deals ops table not found for org:', orgId);
      return;
    }

    // Get computed column IDs (health score related columns)
    const { data: columns } = await supabase
      .from('dynamic_table_columns')
      .select('id, key')
      .eq('table_id', table.id)
      .in('key', [
        'deal_health_score',
        'health_status',
        'relationship_health_score',
        'relationship_health_status',
        'risk_level',
        'risk_factors',
        'days_in_stage',
        'ghost_probability',
        'sentiment_trend',
      ]);

    if (!columns || columns.length === 0) {
      return;
    }

    const columnIds = columns.map((c) => c.id);

    // Get rows for these deals
    const { data: rows } = await supabase
      .from('dynamic_table_rows')
      .select('id, source_id')
      .eq('table_id', table.id)
      .eq('source_type', 'app')
      .in('source_id', dealIds.map(String));

    if (!rows || rows.length === 0) {
      return;
    }

    const rowIds = rows.map((r) => r.id);

    // Update cell metadata to mark as computed
    const { error: updateError } = await supabase
      .from('dynamic_table_cells')
      .update({
        metadata: {
          computed: true,
          computed_at: new Date().toISOString(),
          editable: false,
        },
        updated_at: new Date().toISOString(),
      })
      .in('row_id', rowIds)
      .in('column_id', columnIds);

    if (updateError) {
      console.error('[opsSyncHandler] Error updating cell metadata:', updateError);
    } else {
      console.log(`[opsSyncHandler] Marked ${rowIds.length * columnIds.length} cells as computed`);
    }
  } catch (err) {
    console.error('[opsSyncHandler] Error marking cells as computed:', err);
  }
}
