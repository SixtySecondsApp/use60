/**
 * Cloudinary Video Analytics API Proxy
 *
 * Securely proxies requests to Cloudinary's Video Analytics API
 * keeping API credentials server-side.
 *
 * Endpoint: GET /cloudinary-analytics?video_ids=...&start_date=...&end_date=...
 *
 * Required Environment Variables:
 * - CLOUDINARY_API_KEY
 * - CLOUDINARY_API_SECRET
 * - SUPABASE_URL
 * - SUPABASE_ANON_KEY
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const CLOUD_NAME = 'sixty-seconds'

// VSL video configuration - maps to signup sources
const VSL_VIDEOS = {
  'intro-vsl': {
    publicId: '60 VSL - Waitlist/Videos for waitlist launch/VSL_Sales_Version_xmfmf0',
    name: 'Sales Rep Version',
    route: '/intro',
  },
  'introducing-vsl': {
    publicId: '60 VSL - Waitlist/Videos for waitlist launch/VSL_Founder_Version_gopdl9',
    name: 'Founder Version',
    route: '/introducing',
  },
  'introduction-vsl': {
    publicId: '60 VSL - Waitlist/Videos for waitlist launch/VSL_Drues_Version_jlhqog',
    name: "Product Version",
    route: '/introduction',
  },
}

interface CloudinaryAnalyticsResponse {
  data: Array<{
    video_public_id: string
    video_duration: number
    view_watch_time: number
    view_ended_at: string
    viewer_application_name?: string
    viewer_location_country_code?: string
    viewer_os_identifier?: string
  }>
}

interface VSLAnalyticsResult {
  variantId: string
  name: string
  route: string
  publicId: string
  totalViews: number
  uniqueViewers: number
  avgWatchTime: number
  completionRate: number
  viewersByCountry: Record<string, number>
  viewersByDevice: Record<string, number>
  trend: Array<{ date: string; views: number; watchTime: number }>
  retention: Array<{ percentageWatched: number; viewerPercentage: number }>
  rawData: CloudinaryAnalyticsResponse['data']
}

/**
 * Verify user is admin from JWT
 * Uses service role key to bypass RLS for admin check
 */
async function verifyAdminUser(
  authHeader: string | null
): Promise<{ isAdmin: boolean; userId?: string; error?: string }> {
  if (!authHeader?.startsWith('Bearer ')) {
    return { isAdmin: false, error: 'Missing or invalid authorization header' }
  }

  const token = authHeader.replace('Bearer ', '')

  // Create client with anon key to verify the user's token
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const anonClient = createClient(supabaseUrl, supabaseAnonKey)

  const { data: { user }, error } = await anonClient.auth.getUser(token)

  if (error || !user) {
    return { isAdmin: false, error: 'Invalid or expired token' }
  }

  // Use service role key to bypass RLS and check admin status
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    console.error('Profile lookup error:', profileError)
    return { isAdmin: false, error: 'User profile not found' }
  }

  return {
    isAdmin: profile.is_admin === true,
    userId: user.id,
  }
}

/**
 * Fetch analytics from Cloudinary API for a specific video
 */
async function fetchCloudinaryAnalytics(
  publicId: string,
  startDate: string,
  endDate: string,
  apiKey: string,
  apiSecret: string
): Promise<CloudinaryAnalyticsResponse> {
  const analyticsUrl = new URL(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/analytics/views`)
  analyticsUrl.searchParams.set('expression', `video_public_id=${encodeURIComponent(publicId)}`)
  analyticsUrl.searchParams.set('start_date', startDate)
  analyticsUrl.searchParams.set('end_date', endDate)
  analyticsUrl.searchParams.set('max_results', '500')

  const credentials = btoa(`${apiKey}:${apiSecret}`)

  const response = await fetch(analyticsUrl.toString(), {
    headers: {
      'Authorization': `Basic ${credentials}`,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Cloudinary API error: ${response.status} - ${errorText}`)
  }

  return await response.json()
}

/**
 * Process raw Cloudinary data into useful metrics
 */
function processAnalyticsData(
  variantId: string,
  config: typeof VSL_VIDEOS[keyof typeof VSL_VIDEOS],
  rawData: CloudinaryAnalyticsResponse['data']
): VSLAnalyticsResult {
  const totalViews = rawData.length

  // Calculate unique viewers (approximation using timestamp + location + device)
  const viewerSignatures = new Set(
    rawData.map(v => `${v.viewer_location_country_code}-${v.viewer_os_identifier}-${v.view_ended_at?.slice(0, 10)}`)
  )
  const uniqueViewers = viewerSignatures.size

  // Average watch time
  const totalWatchTime = rawData.reduce((sum, v) => sum + (v.view_watch_time || 0), 0)
  const avgWatchTime = totalViews > 0 ? totalWatchTime / totalViews : 0

  // Completion rate (watched > 90% of video duration)
  const completedViews = rawData.filter(v => {
    if (!v.video_duration || !v.view_watch_time) return false
    return (v.view_watch_time / v.video_duration) >= 0.9
  }).length
  const completionRate = totalViews > 0 ? (completedViews / totalViews) * 100 : 0

  // Views by country
  const viewersByCountry: Record<string, number> = {}
  rawData.forEach(v => {
    const country = v.viewer_location_country_code || 'Unknown'
    viewersByCountry[country] = (viewersByCountry[country] || 0) + 1
  })

  // Views by device
  const viewersByDevice: Record<string, number> = {}
  rawData.forEach(v => {
    const device = v.viewer_os_identifier || 'Unknown'
    viewersByDevice[device] = (viewersByDevice[device] || 0) + 1
  })

  // Daily trend
  const trendMap = new Map<string, { views: number; watchTime: number }>()
  rawData.forEach(v => {
    const date = v.view_ended_at?.slice(0, 10) || 'Unknown'
    const existing = trendMap.get(date) || { views: 0, watchTime: 0 }
    trendMap.set(date, {
      views: existing.views + 1,
      watchTime: existing.watchTime + (v.view_watch_time || 0),
    })
  })
  const trend = Array.from(trendMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Retention curve (percentage of viewers at each 10% point)
  const retention: Array<{ percentageWatched: number; viewerPercentage: number }> = []
  for (let pct = 0; pct <= 100; pct += 10) {
    const viewersAtPoint = rawData.filter(v => {
      if (!v.video_duration || !v.view_watch_time) return false
      const watchedPct = (v.view_watch_time / v.video_duration) * 100
      return watchedPct >= pct
    }).length
    retention.push({
      percentageWatched: pct,
      viewerPercentage: totalViews > 0 ? (viewersAtPoint / totalViews) * 100 : 0,
    })
  }

  return {
    variantId,
    name: config.name,
    route: config.route,
    publicId: config.publicId,
    totalViews,
    uniqueViewers,
    avgWatchTime,
    completionRate,
    viewersByCountry,
    viewersByDevice,
    trend,
    retention,
    rawData,
  }
}

serve(async (req) => {
  // Handle CORS preflight
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Only allow GET requests
    if (req.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get Cloudinary credentials
    const apiKey = Deno.env.get('CLOUDINARY_API_KEY')
    const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET')

    if (!apiKey || !apiSecret) {
      console.error('Missing Cloudinary credentials')
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify admin authorization
    const authHeader = req.headers.get('Authorization')
    const authResult = await verifyAdminUser(authHeader)

    if (!authResult.isAdmin) {
      return new Response(JSON.stringify({
        error: 'Unauthorized',
        details: authResult.error || 'Admin access required',
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse query parameters
    const url = new URL(req.url)
    const startDate = url.searchParams.get('start_date') || getDefaultStartDate()
    const endDate = url.searchParams.get('end_date') || getDefaultEndDate()
    const variantIds = url.searchParams.get('variants')?.split(',') || Object.keys(VSL_VIDEOS)

    // Validate variant IDs
    const validVariants = variantIds.filter(id => id in VSL_VIDEOS)
    if (validVariants.length === 0) {
      return new Response(JSON.stringify({
        error: 'Invalid variant IDs',
        validVariants: Object.keys(VSL_VIDEOS),
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch analytics for each variant in parallel
    const results = await Promise.all(
      validVariants.map(async (variantId) => {
        const config = VSL_VIDEOS[variantId as keyof typeof VSL_VIDEOS]
        try {
          const rawResponse = await fetchCloudinaryAnalytics(
            config.publicId,
            startDate,
            endDate,
            apiKey,
            apiSecret
          )
          return processAnalyticsData(variantId, config, rawResponse.data || [])
        } catch (error) {
          console.error(`Error fetching analytics for ${variantId}:`, error)
          return {
            variantId,
            name: config.name,
            route: config.route,
            publicId: config.publicId,
            totalViews: 0,
            uniqueViewers: 0,
            avgWatchTime: 0,
            completionRate: 0,
            viewersByCountry: {},
            viewersByDevice: {},
            trend: [],
            retention: [],
            rawData: [],
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        }
      })
    )

    // Calculate aggregate comparison metrics
    const comparison = {
      bestPerformer: results.reduce((best, current) =>
        current.completionRate > (best?.completionRate || 0) ? current : best
      , results[0])?.variantId,
      totalViewsAcrossAll: results.reduce((sum, r) => sum + r.totalViews, 0),
      avgCompletionRate: results.reduce((sum, r) => sum + r.completionRate, 0) / results.length,
    }

    return new Response(JSON.stringify({
      success: true,
      dateRange: { startDate, endDate },
      variants: results,
      comparison,
      fetchedAt: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error in cloudinary-analytics:', error)
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// Helper functions for default dates
function getDefaultStartDate(): string {
  const date = new Date()
  date.setDate(date.getDate() - 30) // Last 30 days
  return date.toISOString().slice(0, 10)
}

function getDefaultEndDate(): string {
  return new Date().toISOString().slice(0, 10)
}
