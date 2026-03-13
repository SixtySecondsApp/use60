import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'
import { HeyReachClient } from '../_shared/heyreach.ts'

/**
 * heyreach-scheduled-sync
 *
 * Designed to be called by pg_cron or external scheduler.
 * Finds all heyreach_campaign_links with an enabled sync_schedule,
 * checks if they're due, and pushes new/changed rows to HeyReach.
 */

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  const cors = getCorsHeaders(req)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const svc = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Find all campaign links with enabled schedules
    const { data: links, error: linksError } = await svc
      .from('heyreach_campaign_links')
      .select('id, table_id, org_id, campaign_id, campaign_name, field_mapping, sender_column_key, last_push_at, sync_schedule')
      .not('sync_schedule', 'is', null)

    if (linksError) {
      console.error('[heyreach-scheduled-sync] Error fetching links:', linksError.message)
      return new Response(JSON.stringify({ error: linksError.message }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    let processed = 0
    let pushed = 0
    let errors = 0

    for (const link of (links || [])) {
      const schedule = link.sync_schedule as any
      if (!schedule?.is_enabled) continue

      // Check if schedule is due
      const now = new Date()
      const lastRun = schedule.last_scheduled_run_at ? new Date(schedule.last_scheduled_run_at) : null
      const frequency = schedule.frequency || 'daily'

      let isDue = false
      if (!lastRun) {
        isDue = true
      } else {
        const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60)
        if (frequency === 'hourly' && hoursSinceLastRun >= 1) isDue = true
        else if (frequency === 'daily' && hoursSinceLastRun >= 24) isDue = true
        else if (frequency === '12h' && hoursSinceLastRun >= 12) isDue = true
        else if (frequency === '6h' && hoursSinceLastRun >= 6) isDue = true
      }

      if (!isDue) continue
      processed++

      try {
        // Get HeyReach credentials for this org
        const { data: creds } = await svc
          .from('heyreach_org_credentials')
          .select('api_key')
          .eq('org_id', link.org_id)
          .maybeSingle()

        if (!creds?.api_key) {
          console.warn(`[heyreach-scheduled-sync] No credentials for org ${link.org_id}`)
          continue
        }

        const heyreach = new HeyReachClient({ apiKey: creds.api_key })

        // Get rows created/updated after last_push_at
        let rowQuery = svc
          .from('dynamic_table_rows')
          .select('id, heyreach_lead_id')
          .eq('table_id', link.table_id)
          .is('heyreach_lead_id', null) // Only rows not yet pushed
          .order('created_at', { ascending: true })
          .limit(500)

        if (link.last_push_at) {
          rowQuery = rowQuery.gte('created_at', link.last_push_at)
        }

        const { data: rows } = await rowQuery
        if (!rows?.length) {
          // Update last scheduled run even if no new rows
          await svc
            .from('heyreach_campaign_links')
            .update({
              sync_schedule: { ...schedule, last_scheduled_run_at: now.toISOString() },
            })
            .eq('id', link.id)
          continue
        }

        // Get columns
        const { data: columns } = await svc
          .from('dynamic_table_columns')
          .select('id, column_key')
          .eq('table_id', link.table_id)

        const colById = new Map((columns || []).map(c => [c.id, c]))

        // Get cells for these rows
        const rowIds = rows.map(r => r.id)
        const { data: cells } = await svc
          .from('dynamic_table_cells')
          .select('row_id, column_id, value')
          .in('row_id', rowIds)

        const cellMap = new Map<string, Map<string, string>>()
        for (const cell of (cells || [])) {
          const col = colById.get(cell.column_id)
          if (!col) continue
          if (!cellMap.has(cell.row_id)) cellMap.set(cell.row_id, new Map())
          cellMap.get(cell.row_id)!.set(col.column_key, cell.value)
        }

        // Build leads
        const fieldMapping: Record<string, string> = link.field_mapping || {}
        const leads: any[] = []

        for (const row of rows) {
          const rowCells = cellMap.get(row.id) || new Map()
          const lead: any = {}

          for (const [heyreachField, opsColKey] of Object.entries(fieldMapping)) {
            if (heyreachField === 'custom_variables') continue
            const value = rowCells.get(opsColKey as string)
            if (value) lead[heyreachField] = value
          }

          if (!lead.linkedin_url && !lead.linkedinUrl) continue
          if (!lead.first_name && !lead.firstName) continue

          // Add sender if column configured
          if (link.sender_column_key) {
            const senderId = rowCells.get(link.sender_column_key)
            if (senderId) lead.sender_id = senderId
          }

          lead._row_id = row.id
          leads.push(lead)
        }

        if (leads.length === 0) {
          await svc
            .from('heyreach_campaign_links')
            .update({
              sync_schedule: { ...schedule, last_scheduled_run_at: now.toISOString() },
            })
            .eq('id', link.id)
          continue
        }

        // Push in batches of 100
        let batchSucceeded = 0
        for (let i = 0; i < leads.length; i += 100) {
          const batch = leads.slice(i, i + 100)
          const leadsToSend = batch.map(({ _row_id, ...rest }) => rest)

          try {
            await heyreach.request({
              method: 'POST',
              path: `/api/v1/campaign/${link.campaign_id}/leads`,
              body: { leads: leadsToSend },
            })
            batchSucceeded += batch.length

            // Update heyreach_lead_id on rows
            for (const lead of batch) {
              await svc
                .from('dynamic_table_rows')
                .update({
                  heyreach_lead_id: lead.linkedin_url || lead.linkedinUrl,
                  source_type: 'heyreach',
                })
                .eq('id', lead._row_id)
            }
          } catch (e: any) {
            console.error(`[heyreach-scheduled-sync] Batch push failed for link ${link.id}:`, e.message)
            errors++
          }
        }

        pushed += batchSucceeded

        // Update timestamps
        await svc
          .from('heyreach_campaign_links')
          .update({
            last_push_at: now.toISOString(),
            sync_schedule: { ...schedule, last_scheduled_run_at: now.toISOString() },
          })
          .eq('id', link.id)

        // Log to sync history
        await svc.from('heyreach_sync_history').insert({
          org_id: link.org_id,
          table_id: link.table_id,
          campaign_id: link.campaign_id,
          sync_type: 'lead_push',
          rows_processed: leads.length,
          rows_succeeded: batchSucceeded,
          rows_failed: leads.length - batchSucceeded,
          metadata: { trigger: 'scheduled', frequency },
        })

        console.log(`[heyreach-scheduled-sync] Pushed ${batchSucceeded} leads for link ${link.id}`)
      } catch (e: any) {
        console.error(`[heyreach-scheduled-sync] Error processing link ${link.id}:`, e.message)
        errors++
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed,
      pushed,
      errors,
    }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('[heyreach-scheduled-sync] Unhandled error:', e)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})
