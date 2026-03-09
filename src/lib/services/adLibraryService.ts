/**
 * LinkedIn Ad Library Intelligence Service
 *
 * Wraps edge function calls for ad library search, watchlist management,
 * clustering, trends, and classification. Uses supabase.functions.invoke() for auth.
 */

import { supabase } from '@/lib/supabase/clientV2'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdLibraryAd {
  id: string
  org_id: string
  watchlist_id: string | null
  advertiser_name: string
  advertiser_linkedin_url: string | null
  headline: string | null
  body_text: string | null
  cta_text: string | null
  destination_url: string | null
  media_type: 'image' | 'video' | 'carousel' | 'text'
  media_urls: string[]
  cached_media_paths: string[]
  ad_format: string | null
  geography: string | null
  first_seen_at: string
  last_seen_at: string
  capture_source: string
  is_likely_winner: boolean
  winner_signals: any[]
  created_at: string
  classification?: AdClassification
}

export interface AdClassification {
  id: string
  angle: string | null
  target_persona: string | null
  offer_type: string | null
  cta_type: string | null
  creative_format: string | null
  industry_vertical: string | null
  messaging_theme: string | null
  confidence: number
  classified_by: string
}

export interface WatchlistEntry {
  id: string
  org_id: string
  competitor_name: string
  competitor_linkedin_url: string | null
  competitor_website: string | null
  capture_frequency: string
  is_active: boolean
  last_captured_at: string | null
  total_ads_captured: number
  created_at: string
}

export interface AdCluster {
  dimension: string
  value: string
  count: number
  sample_ads: AdLibraryAd[]
}

export interface AdTrend {
  week: string
  dimension: string
  value: string
  count: number
}

export interface SearchParams {
  query?: string
  advertiser_name?: string
  geography?: string
  media_type?: string
  angle?: string
  persona?: string
  offer_type?: string
  date_from?: string
  date_to?: string
  page?: number
  page_size?: number
}

export interface SearchResult {
  ads: AdLibraryAd[]
  total: number
  page: number
  page_size: number
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class AdLibraryService {
  async searchAds(params: SearchParams): Promise<SearchResult> {
    const { data, error } = await supabase.functions.invoke('linkedin-ad-search', {
      body: { action: 'search', ...params },
    })
    if (error) throw new Error(error.message || 'Failed to search ads')
    if (data?.error) throw new Error(data.error)
    return data as SearchResult
  }

  async getAdDetail(adId: string): Promise<AdLibraryAd> {
    const { data, error } = await supabase.functions.invoke('linkedin-ad-search', {
      body: { action: 'get_ad_detail', ad_id: adId },
    })
    if (error) throw new Error(error.message || 'Failed to get ad detail')
    if (data?.error) throw new Error(data.error)
    return (data?.ad ?? data) as AdLibraryAd
  }

  async submitManualAd(ad: {
    headline?: string
    body_text?: string
    cta_text?: string
    advertiser?: string
    destination_url?: string
    media_type_manual?: string
  }): Promise<AdLibraryAd> {
    const { data, error } = await supabase.functions.invoke('linkedin-ad-search', {
      body: { action: 'submit_manual_ad', ...ad },
    })
    if (error) throw new Error(error.message || 'Failed to submit ad')
    if (data?.error) throw new Error(data.error)
    return (data?.ad ?? data) as AdLibraryAd
  }

  async getWatchlist(): Promise<WatchlistEntry[]> {
    const { data, error } = await supabase.functions.invoke('linkedin-ad-search', {
      body: { action: 'get_watchlist' },
    })
    if (error) throw new Error(error.message || 'Failed to load watchlist')
    if (data?.error) throw new Error(data.error)
    return (data?.watchlist ?? data ?? []) as WatchlistEntry[]
  }

  async addToWatchlist(entry: {
    competitor_name: string
    competitor_linkedin_url?: string
    competitor_website?: string
    capture_frequency?: string
  }): Promise<WatchlistEntry> {
    const { data, error } = await supabase.functions.invoke('linkedin-ad-search', {
      body: { action: 'add_watchlist', ...entry },
    })
    if (error) throw new Error(error.message || 'Failed to add competitor')
    if (data?.error) throw new Error(data.error)
    return (data?.watchlist_entry ?? data) as WatchlistEntry
  }

  async removeFromWatchlist(watchlistId: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('linkedin-ad-search', {
      body: { action: 'remove_watchlist', watchlist_id: watchlistId },
    })
    if (error) throw new Error(error.message || 'Failed to remove competitor')
    if (data?.error) throw new Error(data.error)
  }

  async updateWatchlist(watchlistId: string, updates: Partial<WatchlistEntry>): Promise<WatchlistEntry> {
    const { data, error } = await supabase.functions.invoke('linkedin-ad-search', {
      body: { action: 'update_watchlist', watchlist_id: watchlistId, ...updates },
    })
    if (error) throw new Error(error.message || 'Failed to update watchlist entry')
    if (data?.error) throw new Error(data.error)
    return (data?.watchlist_entry ?? data) as WatchlistEntry
  }

  async captureCompetitor(
    competitorName: string,
    linkedinUrl?: string
  ): Promise<{ status: string; ads_captured: number }> {
    const { data, error } = await supabase.functions.invoke('linkedin-ad-capture', {
      body: { action: 'capture_competitor', competitor_name: competitorName, competitor_linkedin_url: linkedinUrl },
    })
    if (error) throw new Error(error.message || 'Failed to capture competitor ads')
    if (data?.error) throw new Error(data.error)
    return data as { status: string; ads_captured: number }
  }

  async captureByKeyword(
    keyword: string,
    geography?: string
  ): Promise<{ status: string; ads_captured: number }> {
    const { data, error } = await supabase.functions.invoke('linkedin-ad-capture', {
      body: { action: 'capture_keyword', keyword, geography },
    })
    if (error) throw new Error(error.message || 'Failed to capture ads by keyword')
    if (data?.error) throw new Error(data.error)
    return data as { status: string; ads_captured: number }
  }

  async getClusters(dimension?: string): Promise<AdCluster[]> {
    const { data, error } = await supabase.functions.invoke('linkedin-ad-search', {
      body: { action: 'get_clusters', dimension },
    })
    if (error) throw new Error(error.message || 'Failed to load clusters')
    if (data?.error) throw new Error(data.error)

    // Edge function returns { by_angle: [...], by_persona: [...], by_offer_type: [...] }
    // Flatten into AdCluster[] with dimension label
    const clusters: AdCluster[] = []
    const dimensionMap: Record<string, string> = {
      by_angle: 'angle',
      by_persona: 'target_persona',
      by_offer_type: 'offer_type',
    }
    for (const [key, dim] of Object.entries(dimensionMap)) {
      const items = data?.[key]
      if (Array.isArray(items)) {
        for (const item of items) {
          clusters.push({
            dimension: dim,
            value: item.label ?? item.value ?? 'Unknown',
            count: item.count ?? 0,
            sample_ads: item.sample_ads ?? [],
          })
        }
      }
    }
    return clusters
  }

  async getTrends(dimension?: string): Promise<AdTrend[]> {
    const { data, error } = await supabase.functions.invoke('linkedin-ad-search', {
      body: { action: 'get_trends', dimension },
    })
    if (error) throw new Error(error.message || 'Failed to load trends')
    if (data?.error) throw new Error(data.error)

    // Edge function returns { time_series: [...], trending_angles: [...] }
    // Flatten time_series into AdTrend[] entries
    const trends: AdTrend[] = []
    const timeSeries = data?.time_series
    if (Array.isArray(timeSeries)) {
      for (const week of timeSeries) {
        const { week: weekKey, total, ...dimensions } = week
        for (const [dim, count] of Object.entries(dimensions)) {
          if (typeof count === 'number') {
            trends.push({ week: weekKey, dimension: 'angle', value: dim, count })
          }
        }
      }
    }
    return trends
  }

  async getLikelyWinners(): Promise<AdLibraryAd[]> {
    const { data, error } = await supabase.functions.invoke('linkedin-ad-search', {
      body: { action: 'get_likely_winners' },
    })
    if (error) throw new Error(error.message || 'Failed to load likely winners')
    if (data?.error) throw new Error(data.error)
    return (data?.ads ?? data ?? []) as AdLibraryAd[]
  }

  async classifyAds(adIds?: string[]): Promise<{ classified: number }> {
    const { data, error } = await supabase.functions.invoke('linkedin-ad-classify', {
      body: { action: adIds ? 'classify_single' : 'classify_ads', ad_ids: adIds, ad_id: adIds?.[0] },
    })
    if (error) throw new Error(error.message || 'Failed to classify ads')
    if (data?.error) throw new Error(data.error)
    return data as { classified: number }
  }
}

export const adLibraryService = new AdLibraryService()
