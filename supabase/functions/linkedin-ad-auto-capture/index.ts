import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

/**
 * linkedin-ad-auto-capture — Daily cron for re-capturing watchlisted competitors
 *
 * Called by pg_cron or external scheduler (e.g. Supabase cron).
 * For each active watchlist entry:
 *   1. Re-runs ad capture via linkedin-ad-capture function
 *   2. Updates last_seen_at on matched ads
 *   3. Marks ads not seen in 7+ days as is_likely_dead
 *   4. Sends Slack alerts for longevity milestones (30d, 60d, 90d)
 *
 * POST body: { action: "run_daily" } or { action: "run_single", watchlist_id: "..." }
 */

const MILESTONES = [30, 60, 90]

serve(async (req: Request) => {
  const corsResult = handleCorsPreflightRequest(req)
  if (corsResult) return corsResult
  const corsHeaders = getCorsHeaders(req)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const body = await req.json().catch(() => ({ action: 'run_daily' }))
    const { action, watchlist_id } = body

    console.log(`[linkedin-ad-auto-capture] action=${action}`)

    // Get watchlist entries to process
    let watchlistQuery = serviceClient
      .from('linkedin_ad_library_watchlist')
      .select('id, org_id, competitor_name, competitor_linkedin_url')
      .eq('is_active', true)

    if (action === 'run_single' && watchlist_id) {
      watchlistQuery = watchlistQuery.eq('id', watchlist_id)
    }

    const { data: entries, error: wError } = await watchlistQuery
    if (wError) throw new Error(`Failed to load watchlist: ${wError.message}`)
    if (!entries || entries.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active watchlist entries', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    console.log(`[linkedin-ad-auto-capture] Processing ${entries.length} watchlist entries`)

    const results: Array<{ name: string; status: string; ads_found?: number; error?: string }> = []

    for (const entry of entries) {
      try {
        // Call the capture function internally
        const captureResponse = await fetch(`${supabaseUrl}/functions/v1/linkedin-ad-capture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            action: 'capture_competitor',
            competitor_name: entry.competitor_name,
            competitor_linkedin_url: entry.competitor_linkedin_url,
            org_id: entry.org_id,
          }),
        })

        if (!captureResponse.ok) {
          const errText = await captureResponse.text()
          console.error(`[linkedin-ad-auto-capture] Capture failed for ${entry.competitor_name}: ${errText}`)
          results.push({ name: entry.competitor_name, status: 'error', error: errText.slice(0, 200) })
          continue
        }

        const captureData = await captureResponse.json()
        const adsFound = captureData.inserted ?? captureData.total_scraped ?? 0

        // Update last_captured_at on the watchlist entry
        await serviceClient
          .from('linkedin_ad_library_watchlist')
          .update({ last_captured_at: new Date().toISOString() })
          .eq('id', entry.id)

        results.push({ name: entry.competitor_name, status: 'success', ads_found: adsFound })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        console.error(`[linkedin-ad-auto-capture] Error processing ${entry.competitor_name}:`, e)
        results.push({ name: entry.competitor_name, status: 'error', error: msg })
      }
    }

    // Mark dead ads: any ad from these advertisers not seen in 7+ days
    const advertiserNames = entries.map((e) => e.competitor_name)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    for (const entry of entries) {
      await serviceClient
        .from('linkedin_ad_library_ads')
        .update({ is_likely_dead: true })
        .eq('org_id', entry.org_id)
        .eq('advertiser_name', entry.competitor_name)
        .lt('last_seen_at', sevenDaysAgo)
        .eq('is_likely_dead', false)
        .neq('capture_source', 'organic') // Don't mark organic posts as dead
    }

    // Check for longevity milestones on saved ads
    const milestoneAlerts: Array<{ ad_id: string; advertiser: string; days: number; milestone: number }> = []

    for (const entry of entries) {
      // Get saved ads with longevity
      const { data: savedAds } = await serviceClient
        .from('linkedin_ad_library_ads')
        .select('id, advertiser_name, body_text, first_seen_at, last_seen_at, longevity_milestone_sent')
        .eq('org_id', entry.org_id)
        .eq('advertiser_name', entry.competitor_name)
        .eq('is_saved', true)
        .eq('is_likely_dead', false)

      if (!savedAds) continue

      for (const ad of savedAds) {
        const firstSeen = new Date(ad.first_seen_at).getTime()
        const lastSeen = new Date(ad.last_seen_at).getTime()
        const daysRunning = Math.round((lastSeen - firstSeen) / (1000 * 60 * 60 * 24))
        const currentMilestone = ad.longevity_milestone_sent ?? 0

        // Find the next milestone this ad has crossed
        for (const milestone of MILESTONES) {
          if (daysRunning >= milestone && currentMilestone < milestone) {
            milestoneAlerts.push({
              ad_id: ad.id,
              advertiser: ad.advertiser_name,
              days: daysRunning,
              milestone,
            })

            // Update milestone marker
            await serviceClient
              .from('linkedin_ad_library_ads')
              .update({ longevity_milestone_sent: milestone })
              .eq('id', ad.id)

            break // Only one milestone alert per ad per run
          }
        }
      }
    }

    // Send Slack alerts for milestones (if any)
    if (milestoneAlerts.length > 0) {
      try {
        const alertText = milestoneAlerts
          .map((a) => `• *${a.advertiser}* ad running for *${a.days} days* (${a.milestone}d milestone)`)
          .join('\n')

        await fetch(`${supabaseUrl}/functions/v1/send-slack-message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            channel: 'ad-intelligence',
            text: `🏆 *Ad Longevity Milestones*\n\n${alertText}\n\nThese ads are likely performing well — consider analyzing their strategy.`,
          }),
        })
      } catch (slackErr) {
        console.error('[linkedin-ad-auto-capture] Slack alert failed:', slackErr)
        // Non-blocking — continue
      }
    }

    const summary = {
      processed: results.length,
      successes: results.filter((r) => r.status === 'success').length,
      failures: results.filter((r) => r.status === 'error').length,
      milestones_sent: milestoneAlerts.length,
      results,
    }

    console.log(`[linkedin-ad-auto-capture] Complete:`, JSON.stringify(summary))

    return new Response(
      JSON.stringify(summary),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal error'
    console.error('[linkedin-ad-auto-capture] Error:', error)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
