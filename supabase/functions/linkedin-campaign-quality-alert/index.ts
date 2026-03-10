import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'

// ---------------------------------------------------------------------------
// LinkedIn Campaign Quality Alert
//
// Scans LinkedIn-sourced campaigns for poor downstream conversion rates
// and sends alerts via Slack. Designed to run as a cron job (weekly).
//
// Actions:
//   analyze        — Analyze all campaigns for an org
//   analyze_all    — Analyze all orgs with active LinkedIn integrations (cron)
//   preview        — Preview alerts without sending
// ---------------------------------------------------------------------------

type Action = 'analyze' | 'analyze_all' | 'preview'

interface RequestBody {
  action: Action
  org_id?: string
  min_leads?: number  // Minimum leads to evaluate (default: 5)
  meeting_rate_threshold?: number  // Below this % = low quality (default: 10)
}

interface CampaignAlert {
  campaign_name: string
  total_leads: number
  qualified_leads: number
  meetings: number
  proposals: number
  won_deals: number
  meeting_rate: number
  qualification_rate: number
  recommendation: string
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ---------------------------------------------------------------------------
// Analysis Logic
// ---------------------------------------------------------------------------

function analyzeCampaigns(
  campaigns: any[],
  minLeads: number,
  meetingRateThreshold: number
): CampaignAlert[] {
  const alerts: CampaignAlert[] = []

  for (const campaign of campaigns) {
    if ((campaign.total_leads || 0) < minLeads) continue

    const totalLeads = campaign.total_leads || 0
    const qualifiedLeads = campaign.qualified_leads || 0
    const meetings = campaign.total_meetings || 0
    const proposals = campaign.proposals_sent || 0
    const wonDeals = campaign.won_deals || 0

    const meetingRate = Math.round((meetings / totalLeads) * 100)
    const qualificationRate = Math.round((qualifiedLeads / totalLeads) * 100)

    if (meetingRate < meetingRateThreshold) {
      let recommendation = ''
      if (qualificationRate < 20) {
        recommendation = 'Review audience targeting — leads are not qualifying. Consider tightening job title, company size, or industry filters.'
      } else if (meetings === 0) {
        recommendation = 'Leads are qualifying but not booking meetings. Check follow-up timing and messaging.'
      } else {
        recommendation = 'Low conversion to meetings. Review creative messaging and offer alignment.'
      }

      alerts.push({
        campaign_name: campaign.campaign_name || 'Unknown Campaign',
        total_leads: totalLeads,
        qualified_leads: qualifiedLeads,
        meetings,
        proposals,
        won_deals: wonDeals,
        meeting_rate: meetingRate,
        qualification_rate: qualificationRate,
        recommendation,
      })
    }
  }

  return alerts.sort((a, b) => a.meeting_rate - b.meeting_rate)
}

// ---------------------------------------------------------------------------
// Slack Alert Builder
// ---------------------------------------------------------------------------

function buildSlackBlocks(alerts: CampaignAlert[], orgName?: string): any[] {
  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'LinkedIn Campaign Quality Alert',
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${alerts.length} campaign${alerts.length === 1 ? '' : 's'} showing low downstream conversion${orgName ? ` for *${orgName}*` : ''}:`,
      },
    },
    { type: 'divider' },
  ]

  for (const alert of alerts.slice(0, 5)) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `*${alert.campaign_name}*`,
          `Leads: ${alert.total_leads} | Qualified: ${alert.qualified_leads} (${alert.qualification_rate}%) | Meetings: ${alert.meetings} (${alert.meeting_rate}%)`,
          `> ${alert.recommendation}`,
        ].join('\n'),
      },
    })
  }

  if (alerts.length > 5) {
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `_+${alerts.length - 5} more campaigns with low quality signals_`,
      }],
    })
  }

  return blocks
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  try {
    const cronSecret = req.headers.get('x-cron-secret')
    const isCron = cronSecret === Deno.env.get('CRON_SECRET')
    const authHeader = req.headers.get('Authorization')

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Auth
    if (!isCron) {
      if (!authHeader) return errorResponse('Unauthorized', req, 401)
      const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: { user }, error } = await userClient.auth.getUser()
      if (error || !user) return errorResponse('Unauthorized', req, 401)
    }

    const body: RequestBody = await req.json()
    const { action } = body
    const minLeads = body.min_leads ?? 5
    const meetingRateThreshold = body.meeting_rate_threshold ?? 10

    switch (action) {
      // ---------------------------------------------------------------
      // ANALYZE — Single org
      // ---------------------------------------------------------------
      case 'analyze':
      case 'preview': {
        if (!body.org_id) return errorResponse('org_id is required', req, 400)

        const { data: campaigns, error } = await serviceClient
          .from('linkedin_campaign_performance')
          .select('campaign_name, source_channel, total_leads, qualified_leads, total_meetings, proposals_sent, won_deals, won_revenue')
          .eq('org_id', body.org_id)

        if (error) return errorResponse(error.message, req, 500)

        const alerts = analyzeCampaigns(campaigns ?? [], minLeads, meetingRateThreshold)

        if (action === 'preview') {
          return jsonResponse({ alerts, would_send: alerts.length > 0 }, req)
        }

        // Send to Slack if alerts exist
        if (alerts.length > 0) {
          const blocks = buildSlackBlocks(alerts)
          await serviceClient.functions.invoke('send-slack-message', {
            body: {
              message_type: 'linkedin_campaign_quality',
              data: { blocks, text: `${alerts.length} LinkedIn campaigns showing low quality signals` },
              org_id: body.org_id,
            },
          })
        }

        return jsonResponse({ alerts, sent: alerts.length > 0 }, req)
      }

      // ---------------------------------------------------------------
      // ANALYZE ALL — Cron: process all orgs with active LinkedIn
      // ---------------------------------------------------------------
      case 'analyze_all': {
        if (!isCron) return errorResponse('Cron access required', req, 403)

        const { data: integrations } = await serviceClient
          .from('linkedin_org_integrations')
          .select('org_id')
          .eq('is_connected', true)
          .eq('conversions_enabled', true)

        const results: { org_id: string; alerts_count: number }[] = []

        for (const integration of integrations ?? []) {
          const { data: campaigns } = await serviceClient
            .from('linkedin_campaign_performance')
            .select('campaign_name, source_channel, total_leads, qualified_leads, total_meetings, proposals_sent, won_deals, won_revenue')
            .eq('org_id', integration.org_id)

          const alerts = analyzeCampaigns(campaigns ?? [], minLeads, meetingRateThreshold)

          if (alerts.length > 0) {
            const blocks = buildSlackBlocks(alerts)
            await serviceClient.functions.invoke('send-slack-message', {
              body: {
                message_type: 'linkedin_campaign_quality',
                data: { blocks, text: `${alerts.length} LinkedIn campaigns showing low quality signals` },
                org_id: integration.org_id,
              },
            }).catch(err => console.error(`[campaign-quality] Slack send failed for ${integration.org_id}:`, err))
          }

          results.push({ org_id: integration.org_id, alerts_count: alerts.length })
        }

        return jsonResponse({
          processed: results.length,
          alerts_sent: results.filter(r => r.alerts_count > 0).length,
          results,
        }, req)
      }

      default:
        return errorResponse(`Unknown action: ${action}`, req, 400)
    }
  } catch (err) {
    console.error('[linkedin-campaign-quality-alert]', err)
    return errorResponse(err instanceof Error ? err.message : 'Internal error', req, 500)
  }
})
