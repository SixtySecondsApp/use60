// src/lib/services/standardTableSync.ts
// Frontend service for triggering syncs of app data into standard ops tables

import { supabase } from '@/lib/supabase/clientV2';

/**
 * Sync a single deal or all deals for an org into the Deals standard ops table.
 * Call this after creating/updating a deal to keep the ops table in sync.
 */
export async function syncDealToOpsTable(
  orgId: string,
  dealId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('sync_deals_to_ops_table', {
      p_org_id: orgId,
      p_deal_ids: dealId ? [dealId] : null
    });

    if (error) {
      console.error('Failed to sync deal to ops table:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Failed to sync deal to ops table:', message);
    return { success: false, error: message };
  }
}

/**
 * Sync all deals for an organization into the Deals standard ops table.
 * Useful for initial backfill or manual refresh.
 */
export async function syncAllDealsToOpsTable(
  orgId: string
): Promise<{ success: boolean; syncedCount?: number; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('sync_deals_to_ops_table', {
      p_org_id: orgId,
      p_deal_ids: null
    });

    if (error) {
      console.error('Failed to sync all deals to ops table:', error.message);
      return { success: false, error: error.message };
    }

    return {
      success: data?.success || false,
      syncedCount: data?.synced_count
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Failed to sync all deals to ops table:', message);
    return { success: false, error: message };
  }
}

/**
 * Sync health scores for specific deals to the Deals ops table.
 * Called after health recalculation to update computed columns.
 */
export async function syncHealthScoresToOpsTable(
  orgId: string,
  dealIds: string[]
): Promise<{ success: boolean; syncedCount?: number; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('sync_deals_to_ops_table', {
      p_org_id: orgId,
      p_deal_ids: dealIds
    });

    if (error) {
      console.error('Failed to sync health scores to ops table:', error.message);
      return { success: false, error: error.message };
    }

    return {
      success: data?.success || false,
      syncedCount: data?.synced_count
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Failed to sync health scores to ops table:', message);
    return { success: false, error: message };
  }
}
