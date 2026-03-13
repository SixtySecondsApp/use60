/**
 * LinkedIn Advertising Analytics Service
 *
 * Wraps calls to the `linkedin-analytics-sync` edge function and queries
 * Supabase directly for cached campaign metrics, demographics, and pipeline overlay data.
 */

import { supabase } from '@/lib/supabase/clientV2'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CampaignMetric {
  id: string
  campaign_id: string
  campaign_name: string
  campaign_group_name: string | null
  campaign_status: string
  campaign_type: string | null
  date: string
  impressions: number
  clicks: number
  spend: number
  currency: string
  leads: number
  conversions: number
  video_views: number
  likes: number
  comments: number
  shares: number
  total_engagements: number
  ctr: number
  cpm: number
  cpc: number
  cpl: number
}

export interface DemographicMetric {
  pivot_type: string
  pivot_value: string
  impressions: number
  clicks: number
  spend: number
  leads: number
  conversions: number
  total_engagements: number
}

export interface CampaignSummary {
  campaign_id: string
  campaign_name: string
  campaign_group_name: string | null
  campaign_status: string
  campaign_type: string | null
  total_impressions: number
  total_clicks: number
  total_spend: number
  total_leads: number
  total_conversions: number
  avg_ctr: number
  avg_cpc: number
  avg_cpm: number
  avg_cpl: number
  // Pipeline overlay
  pipeline_leads: number
  pipeline_meetings: number
  pipeline_deals: number
  pipeline_won_deals: number
  pipeline_revenue: number
  pipeline_proposals: number
  cost_per_meeting: number | null
  cost_per_deal: number | null
  roas: number | null
}

export interface SyncRun {
  id: string
  sync_type: string
  date_range_start: string
  date_range_end: string
  campaigns_synced: number
  metrics_upserted: number
  status: string
  error_message: string | null
  started_at: string
  completed_at: string | null
}

export interface AnalyticsOverview {
  total_spend: number
  total_impressions: number
  total_clicks: number
  total_leads: number
  avg_ctr: number
  avg_cpc: number
  avg_cpl: number
  pipeline_meetings: number
  pipeline_deals: number
  pipeline_revenue: number
  roas: number | null
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class LinkedInAnalyticsService {
  /**
   * Query linkedin_campaign_metrics with date filters.
   */
  async getCampaignMetrics(
    orgId: string,
    adAccountId: string,
    dateFrom: string,
    dateTo: string
  ): Promise<CampaignMetric[]> {
    const { data, error } = await supabase
      .from('linkedin_campaign_metrics')
      .select(
        'id, campaign_id, campaign_name, campaign_group_name, campaign_status, campaign_type, ' +
        'date, impressions, clicks, spend, currency, leads, conversions, video_views, ' +
        'likes, comments, shares, total_engagements, ctr, cpm, cpc, cpl'
      )
      .eq('org_id', orgId)
      .eq('ad_account_id', adAccountId)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date', { ascending: false })

    if (error) throw new Error(error.message || 'Failed to load campaign metrics')
    return (data ?? []) as CampaignMetric[]
  }

  /**
   * Query linkedin_analytics_with_pipeline view for campaign summaries with pipeline overlay.
   */
  async getCampaignSummaries(
    orgId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<CampaignSummary[]> {
    let query = supabase
      .from('linkedin_analytics_with_pipeline')
      .select(
        'campaign_id, campaign_name, campaign_group_name, campaign_status, campaign_type, ' +
        'total_impressions, total_clicks, total_spend, total_leads, total_conversions, ' +
        'avg_ctr, avg_cpc, avg_cpm, avg_cpl, ' +
        'pipeline_leads, pipeline_meetings, pipeline_deals, pipeline_won_deals, ' +
        'pipeline_revenue, pipeline_proposals, cost_per_meeting, cost_per_deal, roas'
      )
      .eq('org_id', orgId)

    if (dateFrom) query = query.gte('first_date', dateFrom)
    if (dateTo) query = query.lte('last_date', dateTo)

    const { data, error } = await query.order('total_spend', { ascending: false })

    if (error) throw new Error(error.message || 'Failed to load campaign summaries')
    return (data ?? []) as CampaignSummary[]
  }

  /**
   * Query linkedin_demographic_metrics for demographic breakdowns.
   */
  async getDemographics(
    orgId: string,
    campaignId?: string,
    dateFrom?: string,
    dateTo?: string,
    pivotType?: string
  ): Promise<DemographicMetric[]> {
    let query = supabase
      .from('linkedin_demographic_metrics')
      .select(
        'pivot_type, pivot_value, impressions, clicks, spend, leads, conversions, total_engagements'
      )
      .eq('org_id', orgId)

    if (campaignId) query = query.eq('campaign_id', campaignId)
    if (dateFrom) query = query.gte('date', dateFrom)
    if (dateTo) query = query.lte('date', dateTo)
    if (pivotType) query = query.eq('pivot_type', pivotType)

    const { data, error } = await query.order('impressions', { ascending: false })

    if (error) throw new Error(error.message || 'Failed to load demographics')
    return (data ?? []) as DemographicMetric[]
  }

  /**
   * Aggregate totals for overview stats from campaign metrics table.
   */
  async getOverview(
    orgId: string,
    dateFrom: string,
    dateTo: string
  ): Promise<AnalyticsOverview> {
    const { data, error } = await supabase
      .from('linkedin_campaign_metrics')
      .select('impressions, clicks, spend, leads, conversions')
      .eq('org_id', orgId)
      .gte('date', dateFrom)
      .lte('date', dateTo)

    if (error) throw new Error(error.message || 'Failed to load analytics overview')

    const rows = data ?? []
    const totalSpend = rows.reduce((s, r) => s + Number(r.spend || 0), 0)
    const totalImpressions = rows.reduce((s, r) => s + Number(r.impressions || 0), 0)
    const totalClicks = rows.reduce((s, r) => s + Number(r.clicks || 0), 0)
    const totalLeads = rows.reduce((s, r) => s + Number(r.leads || 0), 0)

    return {
      total_spend: totalSpend,
      total_impressions: totalImpressions,
      total_clicks: totalClicks,
      total_leads: totalLeads,
      avg_ctr: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0,
      avg_cpc: totalClicks > 0 ? Math.round((totalSpend / totalClicks) * 100) / 100 : 0,
      avg_cpl: totalLeads > 0 ? Math.round((totalSpend / totalLeads) * 100) / 100 : 0,
      pipeline_meetings: 0,
      pipeline_deals: 0,
      pipeline_revenue: 0,
      roas: null,
    }
  }

  /**
   * Trigger a manual sync of LinkedIn analytics data.
   */
  async triggerSync(
    orgId: string
  ): Promise<{ status: string; campaigns_synced?: number }> {
    const { data, error } = await supabase.functions.invoke('linkedin-analytics-sync', {
      body: {
        action: 'sync',
        org_id: orgId,
      },
    })
    if (error) throw new Error(error.message || 'Failed to trigger sync')
    if (data?.error) throw new Error(data.error)
    return data as { status: string; campaigns_synced?: number }
  }

  /**
   * Query linkedin_analytics_sync_runs for sync history.
   */
  async getSyncHistory(orgId: string, limit = 20): Promise<SyncRun[]> {
    const { data, error } = await supabase
      .from('linkedin_analytics_sync_runs')
      .select(
        'id, sync_type, date_range_start, date_range_end, campaigns_synced, ' +
        'metrics_upserted, status, error_message, started_at, completed_at'
      )
      .eq('org_id', orgId)
      .order('started_at', { ascending: false })
      .limit(limit)

    if (error) throw new Error(error.message || 'Failed to load sync history')
    return (data ?? []) as SyncRun[]
  }

  /**
   * Format data as CSV and trigger browser download.
   */
  async exportCsv(
    orgId: string,
    dateFrom: string,
    dateTo: string,
    type: 'metrics' | 'summaries' | 'demographics'
  ): Promise<void> {
    let rows: Record<string, any>[]

    if (type === 'summaries') {
      rows = await this.getCampaignSummaries(orgId, dateFrom, dateTo)
    } else if (type === 'demographics') {
      rows = await this.getDemographics(orgId, undefined, dateFrom, dateTo)
    } else {
      // Default: fetch all metrics (no ad account filter — use first available)
      const { data, error } = await supabase
        .from('linkedin_campaign_metrics')
        .select(
          'campaign_id, campaign_name, campaign_group_name, campaign_status, campaign_type, ' +
          'date, impressions, clicks, spend, currency, leads, conversions, video_views, ' +
          'likes, comments, shares, total_engagements, ctr, cpm, cpc, cpl'
        )
        .eq('org_id', orgId)
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date', { ascending: false })

      if (error) throw new Error(error.message || 'Failed to export metrics')
      rows = data ?? []
    }

    if (rows.length === 0) throw new Error('No data to export')

    const headers = Object.keys(rows[0])
    const csvLines = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((h) => {
            const val = row[h]
            if (val == null) return ''
            const str = String(val)
            return str.includes(',') || str.includes('"') || str.includes('\n')
              ? `"${str.replace(/"/g, '""')}"`
              : str
          })
          .join(',')
      ),
    ]
    const csv = csvLines.join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `linkedin_${type}_${dateFrom}_${dateTo}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
}

export const linkedinAnalyticsService = new LinkedInAnalyticsService()
