// @ts-nocheck — Deno edge function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { HeyReachClient } from '../_shared/heyreach.ts'

/**
 * evaluate-ops-rule — Evaluate an automation rule against a row.
 *
 * POST body: {
 *   rule_id: string,
 *   row_id: string,
 *   trigger_type: 'cell_updated' | 'enrichment_complete' | 'row_created',
 *   changed_column_key?: string,  // for cell_updated triggers
 * }
 *
 * Circuit breaker: disables rule after 10 consecutive failures.
 * Rate limit: max 10 executions per rule per minute.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_CONSECUTIVE_FAILURES = 10
const RATE_LIMIT_PER_MINUTE = 10
const DEBOUNCE_SECONDS = 60

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { rule_id, row_id, trigger_type, changed_column_key } = await req.json()

    if (!rule_id || !row_id) {
      return new Response(
        JSON.stringify({ error: 'rule_id and row_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 1. Get rule
    const { data: rule, error: ruleErr } = await supabase
      .from('ops_rules')
      .select('id, table_id, trigger_type, condition, action_type, action_config, is_enabled, consecutive_failures')
      .eq('id', rule_id)
      .single()

    if (ruleErr || !rule) {
      return new Response(
        JSON.stringify({ error: 'Rule not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Circuit breaker check
    if (!rule.is_enabled || rule.consecutive_failures >= MAX_CONSECUTIVE_FAILURES) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'Rule disabled or circuit-broken' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Rate limit check
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()
    const { count: recentCount } = await supabase
      .from('ops_rule_executions')
      .select('id', { count: 'exact', head: true })
      .eq('rule_id', rule_id)
      .gte('executed_at', oneMinuteAgo)

    if ((recentCount ?? 0) >= RATE_LIMIT_PER_MINUTE) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'Rate limit exceeded' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Debounce: check if this rule already ran for this row within last 60s
    const debounceTime = new Date(Date.now() - DEBOUNCE_SECONDS * 1000).toISOString()
    const { count: debounceCount } = await supabase
      .from('ops_rule_executions')
      .select('id', { count: 'exact', head: true })
      .eq('rule_id', rule_id)
      .eq('row_id', row_id)
      .gte('executed_at', debounceTime)

    if ((debounceCount ?? 0) > 0) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'Debounced' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2. Get row data (cells)
    const { data: cells } = await supabase
      .from('dynamic_table_cells')
      .select('column_id, value')
      .eq('row_id', row_id)

    // Get columns for key mapping
    const { data: columns } = await supabase
      .from('dynamic_table_columns')
      .select('id, key')
      .eq('table_id', rule.table_id)

    const colIdToKey = new Map<string, string>()
    const keyToColId = new Map<string, string>()
    for (const col of columns ?? []) {
      colIdToKey.set(col.id, col.key)
      keyToColId.set(col.key, col.id)
    }

    const rowData: Record<string, string | null> = {}
    for (const cell of cells ?? []) {
      const key = colIdToKey.get(cell.column_id)
      if (key) rowData[key] = cell.value
    }

    // 3. Evaluate condition
    const condition = rule.condition as { column_key?: string; operator?: string; value?: string }
    let conditionMet = true

    if (condition.column_key && condition.operator) {
      const cellValue = rowData[condition.column_key] ?? ''
      const condValue = condition.value ?? ''

      switch (condition.operator) {
        case 'equals':
          conditionMet = cellValue === condValue
          break
        case 'not_equals':
          conditionMet = cellValue !== condValue
          break
        case 'contains':
          conditionMet = cellValue.toLowerCase().includes(condValue.toLowerCase())
          break
        case 'not_contains':
          conditionMet = !cellValue.toLowerCase().includes(condValue.toLowerCase())
          break
        case 'is_empty':
          conditionMet = !cellValue || cellValue.trim() === ''
          break
        case 'is_not_empty':
          conditionMet = !!cellValue && cellValue.trim() !== ''
          break
        case 'greater_than':
          conditionMet = parseFloat(cellValue) > parseFloat(condValue)
          break
        case 'less_than':
          conditionMet = parseFloat(cellValue) < parseFloat(condValue)
          break
        case 'starts_with':
          conditionMet = cellValue.toLowerCase().startsWith(condValue.toLowerCase())
          break
        default:
          conditionMet = true
      }
    }

    if (!conditionMet) {
      // Log skipped execution
      await supabase.from('ops_rule_executions').insert({
        rule_id,
        row_id,
        status: 'skipped',
        result: { reason: 'Condition not met' },
      })

      return new Response(
        JSON.stringify({ executed: false, reason: 'Condition not met' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 4. Execute action
    const actionConfig = rule.action_config as Record<string, any>
    let actionResult: Record<string, any> = {}

    try {
      switch (rule.action_type) {
        case 'update_cell': {
          const targetColId = keyToColId.get(actionConfig.target_column_key)
          if (!targetColId) throw new Error('Target column not found')

          const newValue = String(actionConfig.value ?? '')

          // Upsert cell
          const { data: existingCell } = await supabase
            .from('dynamic_table_cells')
            .select('id')
            .eq('row_id', row_id)
            .eq('column_id', targetColId)
            .maybeSingle()

          if (existingCell) {
            await supabase
              .from('dynamic_table_cells')
              .update({ value: newValue })
              .eq('id', existingCell.id)
          } else {
            await supabase
              .from('dynamic_table_cells')
              .insert({ row_id, column_id: targetColId, value: newValue })
          }

          actionResult = { action: 'update_cell', column: actionConfig.target_column_key, value: newValue }
          break
        }

        case 'add_tag': {
          const tagColId = keyToColId.get(actionConfig.target_column_key)
          if (!tagColId) throw new Error('Tag column not found')

          const tagToAdd = String(actionConfig.tag ?? '')
          const currentValue = rowData[actionConfig.target_column_key] ?? ''
          const currentTags = currentValue ? currentValue.split(',').map((t: string) => t.trim()) : []

          if (!currentTags.includes(tagToAdd)) {
            const newValue = [...currentTags, tagToAdd].filter(Boolean).join(', ')

            const { data: existingCell } = await supabase
              .from('dynamic_table_cells')
              .select('id')
              .eq('row_id', row_id)
              .eq('column_id', tagColId)
              .maybeSingle()

            if (existingCell) {
              await supabase
                .from('dynamic_table_cells')
                .update({ value: newValue })
                .eq('id', existingCell.id)
            } else {
              await supabase
                .from('dynamic_table_cells')
                .insert({ row_id, column_id: tagColId, value: newValue })
            }

            actionResult = { action: 'add_tag', tag: tagToAdd, column: actionConfig.target_column_key }
          } else {
            actionResult = { action: 'add_tag', tag: tagToAdd, already_exists: true }
          }
          break
        }

        case 'run_enrichment': {
          // Trigger enrichment for this specific row
          const enrichColId = actionConfig.enrichment_column_id
          if (!enrichColId) throw new Error('Enrichment column not specified')

          const { error: enrichErr } = await supabase.functions.invoke('enrich-router', {
            body: { action: 'dynamic_table', table_id: rule.table_id, column_id: enrichColId, row_ids: [row_id] },
          })
          if (enrichErr) throw enrichErr

          actionResult = { action: 'run_enrichment', column_id: enrichColId }
          break
        }

        case 'notify': {
          // Simple log notification (Slack integration can be added later)
          actionResult = {
            action: 'notify',
            message: actionConfig.message ?? 'Rule triggered',
            row_id,
          }
          console.log(`[ops-rule] Notification: ${actionConfig.message}`, { rule_id, row_id })
          break
        }

        case 'push_to_hubspot': {
          // Will invoke push-to-hubspot for single row
          actionResult = { action: 'push_to_hubspot', row_id, status: 'queued' }
          break
        }

        case 'push_to_heyreach': {
          const startTime = Date.now()

          // 1. Get campaign link — use action_config.campaign_link_id if specified, otherwise first linked campaign
          let campaignLinkQuery = supabase
            .from('heyreach_campaign_links')
            .select('id, campaign_id, campaign_name, field_mapping, sender_column_key, org_id')
            .eq('table_id', rule.table_id)

          if (actionConfig.campaign_link_id) {
            campaignLinkQuery = campaignLinkQuery.eq('id', actionConfig.campaign_link_id)
          }

          const { data: campaignLink, error: linkErr } = await campaignLinkQuery
            .limit(1)
            .maybeSingle()

          if (linkErr || !campaignLink) {
            throw new Error('No HeyReach campaign linked to this table')
          }

          // 2. Get org credentials — org_id is on the campaign link itself
          const { data: creds } = await supabase
            .from('heyreach_org_credentials')
            .select('api_key')
            .eq('org_id', campaignLink.org_id)
            .maybeSingle()

          if (!creds?.api_key) {
            throw new Error('HeyReach not connected for this organization')
          }

          const heyreach = new HeyReachClient({ apiKey: creds.api_key })

          // 3. Build lead payload from row data using field_mapping
          const fieldMapping: Record<string, any> = campaignLink.field_mapping || {}
          const lead: Record<string, any> = {}

          for (const [heyreachField, opsColKey] of Object.entries(fieldMapping)) {
            if (heyreachField === 'custom_variables') continue
            const value = rowData[opsColKey as string]
            if (value) lead[heyreachField] = value
          }

          // Map custom variables if configured
          if (fieldMapping.custom_variables && typeof fieldMapping.custom_variables === 'object') {
            lead.custom_variables = {}
            for (const [varName, colKey] of Object.entries(fieldMapping.custom_variables as Record<string, string>)) {
              const value = rowData[colKey]
              if (value) lead.custom_variables[varName] = value
            }
          }

          // 4. Validate required fields
          const linkedinUrl = lead.linkedin_url || lead.linkedinUrl || lead.professional_url
          if (!linkedinUrl) {
            throw new Error('Missing required field: linkedin_url')
          }
          if (!lead.first_name && !lead.firstName) {
            throw new Error('Missing required field: first_name')
          }
          if (!lead.last_name && !lead.lastName) {
            throw new Error('Missing required field: last_name')
          }

          // 5. Include sender assignment if sender_column_key is set
          if (campaignLink.sender_column_key) {
            const senderId = rowData[campaignLink.sender_column_key]
            if (senderId) lead.sender_id = senderId
          }

          // 6. Call HeyReach API to push lead
          const apiResult = await heyreach.request<any>({
            method: 'POST',
            path: '/api/public/campaign/AddLeadsToListV2',
            body: { campaignId: campaignLink.campaign_id, leads: [lead] },
          })

          const duration = Date.now() - startTime

          // 7. Update heyreach_lead_id on the row
          await supabase
            .from('dynamic_table_rows')
            .update({ heyreach_lead_id: linkedinUrl })
            .eq('id', row_id)

          // 8. Update last_push_at on campaign link
          await supabase
            .from('heyreach_campaign_links')
            .update({ last_push_at: new Date().toISOString() })
            .eq('id', campaignLink.id)

          // 9. Log to heyreach_sync_history
          await supabase.from('heyreach_sync_history').insert({
            org_id: campaignLink.org_id,
            table_id: rule.table_id,
            campaign_id: campaignLink.campaign_id,
            sync_type: 'lead_push',
            rows_processed: 1,
            rows_succeeded: 1,
            rows_failed: 0,
            sync_duration_ms: duration,
            metadata: {
              trigger: trigger_type,
              rule_id,
              row_id,
              campaign_name: campaignLink.campaign_name,
              added_leads_count: apiResult?.addedLeadsCount ?? apiResult?.added_leads_count ?? 1,
            },
          })

          actionResult = {
            action: 'push_to_heyreach',
            row_id,
            campaign_id: campaignLink.campaign_id,
            campaign_name: campaignLink.campaign_name,
            linkedin_url: linkedinUrl,
            duration_ms: duration,
          }
          break
        }

        case 'webhook': {
          const webhookUrl = actionConfig.url as string
          if (!webhookUrl) throw new Error('Webhook action_config.url is required')

          const method: string = (actionConfig.method as string) ?? 'POST'
          const customHeaders: Record<string, string> = (actionConfig.headers as Record<string, string>) ?? {}
          const includeColumns: string[] | undefined = actionConfig.include_columns as string[] | undefined

          // Build data payload, optionally filtered to include_columns
          let payloadData: Record<string, string | null> = rowData
          if (includeColumns && includeColumns.length > 0) {
            payloadData = {}
            for (const col of includeColumns) {
              if (col in rowData) payloadData[col] = rowData[col]
            }
          }

          const outboundPayload = {
            event: trigger_type,
            table_id: rule.table_id,
            row_id,
            timestamp: new Date().toISOString(),
            data: payloadData,
          }

          let responseStatus = 0
          let webhookError: string | null = null

          try {
            const response = await fetch(webhookUrl, {
              method,
              headers: {
                'Content-Type': 'application/json',
                ...customHeaders,
              },
              body: JSON.stringify(outboundPayload),
            })
            responseStatus = response.status

            if (!response.ok) {
              webhookError = `Webhook returned HTTP ${response.status}`
            }
          } catch (fetchErr: any) {
            responseStatus = 0
            webhookError = fetchErr.message ?? 'Fetch failed'
          }

          // Log to ops_webhook_logs for outbound (requires a webhook row for FK)
          const { data: webhookRow } = await supabase
            .from('ops_table_webhooks')
            .select('id')
            .eq('table_id', rule.table_id)
            .maybeSingle()

          if (webhookRow?.id) {
            await supabase.from('ops_webhook_logs').insert({
              webhook_id: webhookRow.id,
              direction: 'outbound',
              status: responseStatus,
              payload: outboundPayload,
              rows_affected: 1,
              ...(webhookError ? { error: webhookError } : {}),
            })
          }

          if (webhookError) {
            throw new Error(webhookError)
          }

          actionResult = {
            action: 'webhook',
            url: webhookUrl,
            method,
            status: responseStatus,
          }
          break
        }

        default:
          throw new Error(`Unknown action type: ${rule.action_type}`)
      }

      // Log success
      await supabase.from('ops_rule_executions').insert({
        rule_id,
        row_id,
        status: 'success',
        result: actionResult,
      })

      // Reset failure counter on success
      if (rule.consecutive_failures > 0) {
        await supabase
          .from('ops_rules')
          .update({ consecutive_failures: 0 })
          .eq('id', rule_id)
      }

      return new Response(
        JSON.stringify({ executed: true, result: actionResult }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    } catch (actionError: any) {
      // Log failure
      await supabase.from('ops_rule_executions').insert({
        rule_id,
        row_id,
        status: 'failed',
        error: actionError.message,
      })

      // Increment failure counter
      const newFailures = (rule.consecutive_failures ?? 0) + 1
      const updates: Record<string, any> = { consecutive_failures: newFailures }
      if (newFailures >= MAX_CONSECUTIVE_FAILURES) {
        updates.is_enabled = false
        console.warn(`[ops-rule] Circuit breaker: disabling rule ${rule_id} after ${MAX_CONSECUTIVE_FAILURES} failures`)
      }
      await supabase.from('ops_rules').update(updates).eq('id', rule_id)

      return new Response(
        JSON.stringify({ executed: false, error: actionError.message }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
  } catch (error: any) {
    console.error('[evaluate-ops-rule] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
