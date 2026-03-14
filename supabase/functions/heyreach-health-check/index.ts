import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

// Health status thresholds (in hours)
const DEGRADED_THRESHOLD_HOURS = 12
const UNHEALTHY_THRESHOLD_HOURS = 24

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy'

interface IntegrationHealth {
  org_id: string
  status: HealthStatus
  last_webhook_received_at: string | null
  hours_since_last_webhook: number | null
  campaign_link_count: number
}

function classifyHealth(lastWebhookAt: string | null): { status: HealthStatus; hoursSince: number | null } {
  if (!lastWebhookAt) {
    return { status: 'unhealthy', hoursSince: null }
  }

  const hoursSince = (Date.now() - new Date(lastWebhookAt).getTime()) / (1000 * 60 * 60)

  if (hoursSince < DEGRADED_THRESHOLD_HOURS) {
    return { status: 'healthy', hoursSince: Math.round(hoursSince * 10) / 10 }
  }
  if (hoursSince < UNHEALTHY_THRESHOLD_HOURS) {
    return { status: 'degraded', hoursSince: Math.round(hoursSince * 10) / 10 }
  }
  return { status: 'unhealthy', hoursSince: Math.round(hoursSince * 10) / 10 }
}

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  const cors = getCorsHeaders(req)

  try {
    // Accept GET (cron) and POST (admin)
    if (req.method !== 'GET' && req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

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

    // Step 1: Get all active + connected integrations
    const { data: integrations, error: intError } = await svc
      .from('heyreach_org_integrations')
      .select('org_id, is_active, is_connected, last_webhook_received_at')
      .eq('is_active', true)
      .eq('is_connected', true)

    if (intError) {
      console.error('[heyreach-health-check] Failed to fetch integrations:', intError.message)
      return new Response(JSON.stringify({ error: 'Failed to fetch integrations' }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    if (!integrations || integrations.length === 0) {
      return new Response(JSON.stringify({
        checked: 0,
        healthy: 0,
        degraded: 0,
        unhealthy: 0,
        details: [],
      }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Step 2: For each integration, check if it has campaign links
    const orgIds = integrations.map(i => i.org_id)
    const { data: campaignLinks, error: clError } = await svc
      .from('heyreach_campaign_links')
      .select('org_id, id')
      .in('org_id', orgIds)

    if (clError) {
      console.error('[heyreach-health-check] Failed to fetch campaign links:', clError.message)
      return new Response(JSON.stringify({ error: 'Failed to fetch campaign links' }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Build a count map of campaign links per org
    const linkCountByOrg = new Map<string, number>()
    for (const link of (campaignLinks || [])) {
      linkCountByOrg.set(link.org_id, (linkCountByOrg.get(link.org_id) || 0) + 1)
    }

    // Step 3: Classify health for each integration (skip those with no campaign links)
    const results: IntegrationHealth[] = []
    let healthyCount = 0
    let degradedCount = 0
    let unhealthyCount = 0

    for (const integration of integrations) {
      const campaignCount = linkCountByOrg.get(integration.org_id) || 0

      // Skip integrations with no campaign links -- no webhooks expected
      if (campaignCount === 0) continue

      const { status, hoursSince } = classifyHealth(integration.last_webhook_received_at)

      results.push({
        org_id: integration.org_id,
        status,
        last_webhook_received_at: integration.last_webhook_received_at,
        hours_since_last_webhook: hoursSince,
        campaign_link_count: campaignCount,
      })

      if (status === 'healthy') healthyCount++
      else if (status === 'degraded') degradedCount++
      else unhealthyCount++
    }

    // Step 4: Log unhealthy integrations to integration_sync_logs
    const unhealthyResults = results.filter(r => r.status === 'unhealthy')
    for (const result of unhealthyResults) {
      await svc.from('integration_sync_logs').insert({
        org_id: result.org_id,
        integration_name: 'heyreach',
        operation: 'health_check',
        direction: 'inbound',
        entity_type: 'integration',
        entity_id: result.org_id,
        entity_name: `HeyReach webhook health: ${result.status}`,
        status: 'failed',
        metadata: {
          health_status: result.status,
          last_webhook_received_at: result.last_webhook_received_at,
          hours_since_last_webhook: result.hours_since_last_webhook,
          campaign_link_count: result.campaign_link_count,
        },
      })
    }

    // Also log degraded integrations as warnings
    const degradedResults = results.filter(r => r.status === 'degraded')
    for (const result of degradedResults) {
      await svc.from('integration_sync_logs').insert({
        org_id: result.org_id,
        integration_name: 'heyreach',
        operation: 'health_check',
        direction: 'inbound',
        entity_type: 'integration',
        entity_id: result.org_id,
        entity_name: `HeyReach webhook health: ${result.status}`,
        status: 'skipped',
        metadata: {
          health_status: result.status,
          last_webhook_received_at: result.last_webhook_received_at,
          hours_since_last_webhook: result.hours_since_last_webhook,
          campaign_link_count: result.campaign_link_count,
        },
      })
    }

    const summary = {
      checked: results.length,
      healthy: healthyCount,
      degraded: degradedCount,
      unhealthy: unhealthyCount,
      details: results,
    }

    console.log(`[heyreach-health-check] Complete: ${results.length} checked, ${healthyCount} healthy, ${degradedCount} degraded, ${unhealthyCount} unhealthy`)

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('[heyreach-health-check] Unhandled error:', e)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})
