// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

/**
 * revert-hubspot-sync — Revert a specific sync by restoring snapshot data.
 *
 * POST body: { sync_id: string }
 *
 * Reads the snapshot from hubspot_sync_history and:
 * 1. Restores old cell values
 * 2. Deletes rows that were added during the sync
 * 3. Un-flags rows that were marked as removed
 * 4. Re-flags rows that were marked as returned
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Verify auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { sync_id } = await req.json()
    if (!sync_id) {
      return new Response(
        JSON.stringify({ error: 'sync_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 1. Fetch the sync history entry
    const { data: syncEntry, error: syncError } = await supabase
      .from('hubspot_sync_history')
      .select('id, table_id, snapshot, synced_at')
      .eq('id', sync_id)
      .maybeSingle()

    if (syncError || !syncEntry) {
      return new Response(
        JSON.stringify({ error: 'Sync entry not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Verify user has access to this table's org
    const { data: table } = await supabase
      .from('dynamic_tables')
      .select('organization_id, source_query')
      .eq('id', syncEntry.table_id)
      .maybeSingle()

    if (!table) {
      return new Response(
        JSON.stringify({ error: 'Table not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('id')
      .eq('org_id', table.organization_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership) {
      return new Response(
        JSON.stringify({ error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const snapshot = syncEntry.snapshot as { cells?: any[]; rows?: any[] }
    let cellsRestored = 0
    let rowsRestored = 0

    // 2. Restore old cell values
    if (snapshot.cells && snapshot.cells.length > 0) {
      const CHUNK = 500
      for (let i = 0; i < snapshot.cells.length; i += CHUNK) {
        const chunk = snapshot.cells.slice(i, i + CHUNK)
        await Promise.all(
          chunk.map((change: { row_id: string; column_id: string; old_value: string | null }) =>
            supabase
              .from('dynamic_table_cells')
              .update({ value: change.old_value })
              .eq('row_id', change.row_id)
              .eq('column_id', change.column_id)
          )
        )
        cellsRestored += chunk.length
      }
    }

    // 3. Handle row actions
    if (snapshot.rows && snapshot.rows.length > 0) {
      const addedRowIds = snapshot.rows
        .filter((r: any) => r.action === 'added')
        .map((r: any) => r.id)

      const removedRowIds = snapshot.rows
        .filter((r: any) => r.action === 'removed')
        .map((r: any) => r.id)

      const returnedRowIds = snapshot.rows
        .filter((r: any) => r.action === 'returned')
        .map((r: any) => r.id)

      // Delete rows that were added during this sync
      if (addedRowIds.length > 0) {
        // First delete cells, then rows
        await supabase
          .from('dynamic_table_cells')
          .delete()
          .in('row_id', addedRowIds)

        await supabase
          .from('dynamic_table_rows')
          .delete()
          .in('id', addedRowIds)

        rowsRestored += addedRowIds.length
      }

      // Un-flag rows that were marked as removed (restore them)
      if (removedRowIds.length > 0) {
        await supabase
          .from('dynamic_table_rows')
          .update({ hubspot_removed_at: null })
          .in('id', removedRowIds)

        rowsRestored += removedRowIds.length
      }

      // Re-flag rows that were marked as returned (mark as removed again)
      if (returnedRowIds.length > 0) {
        await supabase
          .from('dynamic_table_rows')
          .update({ hubspot_removed_at: new Date().toISOString() })
          .in('id', returnedRowIds)

        rowsRestored += returnedRowIds.length
      }
    }

    // 4. Find the previous sync's timestamp and roll back last_synced_at
    const { data: previousSync } = await supabase
      .from('hubspot_sync_history')
      .select('synced_at')
      .eq('table_id', syncEntry.table_id)
      .lt('synced_at', syncEntry.synced_at)
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (previousSync) {
      const sourceQuery = table.source_query as Record<string, any> ?? {}
      await supabase
        .from('dynamic_tables')
        .update({
          source_query: { ...sourceQuery, last_synced_at: previousSync.synced_at },
        })
        .eq('id', syncEntry.table_id)
    }

    // 5. Mark the sync entry as reverted
    await supabase
      .from('hubspot_sync_history')
      .update({ error_message: 'Reverted by user' })
      .eq('id', sync_id)

    return new Response(
      JSON.stringify({
        success: true,
        cells_restored: cellsRestored,
        rows_restored: rowsRestored,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('[revert-hubspot-sync] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
