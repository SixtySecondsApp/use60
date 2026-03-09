// supabase/functions/linkedin-ad-digest/index.ts
// Generates and sends a weekly LinkedIn Ad Intelligence digest via Slack.
//
// Called by cron (service role) or manually for preview.
//
// POST body:
//   { action: 'send_digest' | 'preview_digest', org_id?: string }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DigestRequest {
  action: 'send_digest' | 'preview_digest';
  org_id?: string;
}

interface AdvertiserSummary {
  name: string;
  count: number;
  angles: string[];
}

interface AngleTrend {
  angle: string;
  thisWeek: number;
  lastWeek: number;
  changePercent: number;
}

interface WinnerSummary {
  headline: string;
  advertiser: string;
  detail: string;
}

interface DigestData {
  org_id: string;
  period_start: string;
  period_end: string;
  new_ads_count: number;
  competitor_count: number;
  top_advertisers: AdvertiserSummary[];
  trending_angles: AngleTrend[];
  likely_winners: WinnerSummary[];
  new_competitors: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + '...';
}

function formatChangePercent(pct: number): string {
  if (pct > 0) return `+${pct}%`;
  if (pct < 0) return `${pct}%`;
  return '0%';
}

function anglesToString(angles: string[], max = 3): string {
  const display = angles.slice(0, max).join(', ');
  return display || 'mixed';
}

// ---------------------------------------------------------------------------
// Data gathering
// ---------------------------------------------------------------------------

async function gatherDigestData(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
): Promise<DigestData> {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const periodStart = oneWeekAgo.toISOString();
  const periodEnd = now.toISOString();
  const priorStart = twoWeeksAgo.toISOString();

  // Fetch ads from the last 7 days
  const { data: recentAds, error: adsErr } = await supabase
    .from('linkedin_ad_library_ads')
    .select('id, advertiser_name, headline, body_text, is_likely_winner, winner_signals, first_seen_at, last_seen_at')
    .eq('org_id', orgId)
    .gte('created_at', periodStart)
    .order('created_at', { ascending: false });

  if (adsErr) {
    console.error('[linkedin-ad-digest] Error fetching ads:', adsErr.message);
  }

  const ads = recentAds || [];

  // Fetch classifications for those ads
  const adIds = ads.map((a) => a.id);
  let classifications: Array<{ ad_id: string; angle: string; offer_type: string }> = [];
  if (adIds.length > 0) {
    const { data: classData, error: classErr } = await supabase
      .from('linkedin_ad_library_classifications')
      .select('ad_id, angle, offer_type')
      .eq('org_id', orgId)
      .in('ad_id', adIds);

    if (classErr) {
      console.error('[linkedin-ad-digest] Error fetching classifications:', classErr.message);
    }
    classifications = classData || [];
  }

  // Fetch prior week classifications for trend comparison
  const { data: priorAds } = await supabase
    .from('linkedin_ad_library_ads')
    .select('id')
    .eq('org_id', orgId)
    .gte('created_at', priorStart)
    .lt('created_at', periodStart);

  const priorAdIds = (priorAds || []).map((a) => a.id);
  let priorClassifications: Array<{ angle: string }> = [];
  if (priorAdIds.length > 0) {
    const { data: priorClassData } = await supabase
      .from('linkedin_ad_library_classifications')
      .select('angle')
      .eq('org_id', orgId)
      .in('ad_id', priorAdIds);

    priorClassifications = priorClassData || [];
  }

  // Fetch active watchlist competitors
  const { data: watchlist } = await supabase
    .from('linkedin_ad_library_watchlist')
    .select('id, competitor_name, created_at')
    .eq('org_id', orgId)
    .eq('is_active', true);

  const competitors = watchlist || [];

  // Build classification lookup by ad_id
  const classMap = new Map<string, { angle: string; offer_type: string }>();
  for (const c of classifications) {
    classMap.set(c.ad_id, c);
  }

  // --- Top advertisers by ad count ---
  const advertiserMap = new Map<string, { count: number; angles: Set<string> }>();
  for (const ad of ads) {
    const entry = advertiserMap.get(ad.advertiser_name) || { count: 0, angles: new Set<string>() };
    entry.count += 1;
    const cls = classMap.get(ad.id);
    if (cls?.angle) entry.angles.add(cls.angle);
    advertiserMap.set(ad.advertiser_name, entry);
  }

  const topAdvertisers: AdvertiserSummary[] = Array.from(advertiserMap.entries())
    .map(([name, data]) => ({
      name,
      count: data.count,
      angles: Array.from(data.angles),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // --- Trending angles ---
  const thisWeekAngles = new Map<string, number>();
  for (const c of classifications) {
    if (c.angle) {
      thisWeekAngles.set(c.angle, (thisWeekAngles.get(c.angle) || 0) + 1);
    }
  }

  const lastWeekAngles = new Map<string, number>();
  for (const c of priorClassifications) {
    if (c.angle) {
      lastWeekAngles.set(c.angle, (lastWeekAngles.get(c.angle) || 0) + 1);
    }
  }

  const allAngles = new Set([...thisWeekAngles.keys(), ...lastWeekAngles.keys()]);
  const trendingAngles: AngleTrend[] = Array.from(allAngles)
    .map((angle) => {
      const tw = thisWeekAngles.get(angle) || 0;
      const lw = lastWeekAngles.get(angle) || 0;
      const changePercent = lw > 0 ? Math.round(((tw - lw) / lw) * 100) : tw > 0 ? 100 : 0;
      return { angle, thisWeek: tw, lastWeek: lw, changePercent };
    })
    .filter((t) => t.thisWeek > 0 || t.lastWeek > 0)
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 5);

  // --- Likely winners (new this week) ---
  const winners = ads.filter((a) => a.is_likely_winner);
  const likelyWinners: WinnerSummary[] = winners.slice(0, 5).map((w) => {
    const signals = Array.isArray(w.winner_signals) ? w.winner_signals : [];
    const firstSeen = new Date(w.first_seen_at);
    const weeksRunning = Math.max(1, Math.ceil((now.getTime() - firstSeen.getTime()) / (7 * 24 * 60 * 60 * 1000)));
    const detail = weeksRunning > 1
      ? `${w.advertiser_name}, running ${weeksRunning}+ weeks`
      : `${w.advertiser_name}, ${signals.length} winner signal${signals.length !== 1 ? 's' : ''}`;
    return {
      headline: truncate(w.headline || w.body_text || 'Untitled ad', 60),
      advertiser: w.advertiser_name,
      detail,
    };
  });

  // --- New competitors (added to watchlist this week) ---
  const newCompetitors = competitors
    .filter((c) => new Date(c.created_at) >= oneWeekAgo)
    .map((c) => c.competitor_name);

  const uniqueAdvertisers = new Set(ads.map((a) => a.advertiser_name));

  return {
    org_id: orgId,
    period_start: periodStart,
    period_end: periodEnd,
    new_ads_count: ads.length,
    competitor_count: uniqueAdvertisers.size,
    top_advertisers: topAdvertisers,
    trending_angles: trendingAngles,
    likely_winners: likelyWinners,
    new_competitors: newCompetitors,
  };
}

// ---------------------------------------------------------------------------
// Slack Block Kit message builder
// ---------------------------------------------------------------------------

function buildDigestBlocks(digest: DigestData): { text: string; blocks: unknown[] } {
  const appUrl = Deno.env.get('APP_URL') || 'https://app.use60.com';
  const fallbackText = `LinkedIn Ad Intelligence - Weekly Digest: ${digest.new_ads_count} new ads across ${digest.competitor_count} competitors`;

  const blocks: unknown[] = [];

  // Header
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: ':bar_chart: LinkedIn Ad Intelligence \u2014 Weekly Digest',
      emoji: true,
    },
  });

  // Summary line
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*New Ads This Week:* ${digest.new_ads_count} across ${digest.competitor_count} competitor${digest.competitor_count !== 1 ? 's' : ''}`,
    },
  });

  blocks.push({ type: 'divider' });

  // Top advertisers
  if (digest.top_advertisers.length > 0) {
    const advertiserLines = digest.top_advertisers
      .slice(0, 5)
      .map((a) => {
        const anglesStr = a.angles.length > 0 ? ` (${anglesToString(a.angles)})` : '';
        return `\u2022 *${truncate(a.name, 30)}* \u2014 ${a.count} new ad${a.count !== 1 ? 's' : ''}${anglesStr}`;
      })
      .join('\n');

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Top Advertisers:*\n${advertiserLines}`,
      },
    });
  }

  // Trending angles
  if (digest.trending_angles.length > 0) {
    const rising = digest.trending_angles
      .filter((t) => t.changePercent > 0)
      .slice(0, 3);
    const falling = digest.trending_angles
      .filter((t) => t.changePercent < 0)
      .slice(0, 2);

    const lines: string[] = [];
    if (rising.length > 0) {
      const risingStr = rising.map((t) => `${t.angle} (${formatChangePercent(t.changePercent)})`).join(', ');
      lines.push(`:chart_with_upwards_trend: ${risingStr}`);
    }
    if (falling.length > 0) {
      const fallingStr = falling.map((t) => `${t.angle} (${formatChangePercent(t.changePercent)})`).join(', ');
      lines.push(`:chart_with_downwards_trend: ${fallingStr}`);
    }
    // Include flat/new angles if we have room
    const flat = digest.trending_angles
      .filter((t) => t.changePercent === 0 && t.thisWeek > 0)
      .slice(0, 2);
    if (flat.length > 0 && lines.length < 3) {
      const flatStr = flat.map((t) => `${t.angle} (steady)`).join(', ');
      lines.push(`:arrow_right: ${flatStr}`);
    }

    if (lines.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Trending Angles:*\n${lines.join('\n')}`,
        },
      });
    }
  }

  // Likely winners
  if (digest.likely_winners.length > 0) {
    const winnerLines = digest.likely_winners
      .slice(0, 3)
      .map((w) => `\u2022 "${truncate(w.headline, 50)}" (${truncate(w.detail, 40)})`)
      .join('\n');

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Likely Winners:* ${digest.likely_winners.length} detected\n${winnerLines}`,
      },
    });
  }

  // New competitors
  if (digest.new_competitors.length > 0) {
    const names = digest.new_competitors.slice(0, 5).map((n) => truncate(n, 30)).join(', ');
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:new: *New Competitors Added:* ${names}`,
      },
    });
  }

  blocks.push({ type: 'divider' });

  // CTA link
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `View full report \u2192 <${appUrl}/intelligence/ads|Ad Intelligence>`,
    },
  });

  // Context footer
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Digest period: ${new Date(digest.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} \u2013 ${new Date(digest.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} | Powered by 60`,
      },
    ],
  });

  return { text: fallbackText, blocks };
}

// ---------------------------------------------------------------------------
// Slack sending
// ---------------------------------------------------------------------------

async function sendDigestToSlack(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  slackMessage: { text: string; blocks: unknown[] },
): Promise<{ success: boolean; error?: string }> {
  // Get org's default Slack channel
  const { data: orgSettings } = await supabase
    .from('organization_settings')
    .select('slack_default_channel_id')
    .eq('organization_id', orgId)
    .maybeSingle();

  const channelId = orgSettings?.slack_default_channel_id;
  if (!channelId) {
    return { success: false, error: 'No default Slack channel configured for this organization' };
  }

  // Get any active Slack integration for this org (via org members)
  const { data: orgMembers } = await supabase
    .from('organization_memberships')
    .select('user_id')
    .eq('org_id', orgId)
    .limit(20);

  if (!orgMembers || orgMembers.length === 0) {
    return { success: false, error: 'No org members found' };
  }

  const memberIds = orgMembers.map((m) => m.user_id);

  const { data: integration } = await supabase
    .from('slack_integrations')
    .select('access_token')
    .in('user_id', memberIds)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!integration?.access_token) {
    return { success: false, error: 'No active Slack integration found for any org member' };
  }

  // Send via Slack Web API directly
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${integration.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: channelId,
      text: slackMessage.text,
      blocks: slackMessage.blocks,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });

  const result = await response.json();

  if (!result.ok) {
    console.error('[linkedin-ad-digest] Slack API error:', result.error);
    return { success: false, error: `Slack API error: ${result.error}` };
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const body: DigestRequest = await req.json();
    const { action, org_id } = body;

    if (!action || !['send_digest', 'preview_digest'].includes(action)) {
      return errorResponse('Invalid action. Use send_digest or preview_digest.', req, 400);
    }

    // Initialize service role client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Determine which orgs to process
    let orgIds: string[] = [];

    if (org_id) {
      // Validate the org exists
      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', org_id)
        .maybeSingle();

      if (orgErr || !org) {
        return errorResponse('Organization not found', req, 404);
      }
      orgIds = [org_id];
    } else {
      // Process all orgs that have active watchlist entries
      const { data: activeOrgs } = await supabase
        .from('linkedin_ad_library_watchlist')
        .select('org_id')
        .eq('is_active', true);

      if (activeOrgs && activeOrgs.length > 0) {
        orgIds = [...new Set(activeOrgs.map((o) => o.org_id))];
      }
    }

    if (orgIds.length === 0) {
      return jsonResponse({ success: true, message: 'No organizations with active ad watchlists', digests: [] }, req);
    }

    const results: Array<{ org_id: string; digest: DigestData; sent: boolean; error?: string }> = [];

    for (const oid of orgIds) {
      try {
        const digest = await gatherDigestData(supabase, oid);

        // Skip orgs with no new ads
        if (digest.new_ads_count === 0 && action === 'send_digest') {
          console.log(`[linkedin-ad-digest] Skipping org ${oid} — no new ads this week`);
          results.push({ org_id: oid, digest, sent: false, error: 'No new ads this week' });
          continue;
        }

        if (action === 'send_digest') {
          const slackMessage = buildDigestBlocks(digest);
          const sendResult = await sendDigestToSlack(supabase, oid, slackMessage);

          if (!sendResult.success) {
            console.error(`[linkedin-ad-digest] Failed to send digest for org ${oid}:`, sendResult.error);
          }

          results.push({
            org_id: oid,
            digest,
            sent: sendResult.success,
            error: sendResult.error,
          });
        } else {
          // preview_digest — just return the data + blocks
          const slackMessage = buildDigestBlocks(digest);
          results.push({
            org_id: oid,
            digest: { ...digest, ...slackMessage } as DigestData & { text: string; blocks: unknown[] },
            sent: false,
          });
        }
      } catch (orgError) {
        console.error(`[linkedin-ad-digest] Error processing org ${oid}:`, orgError);
        results.push({
          org_id: oid,
          digest: {} as DigestData,
          sent: false,
          error: orgError instanceof Error ? orgError.message : String(orgError),
        });
      }
    }

    return jsonResponse(
      {
        success: true,
        action,
        orgs_processed: results.length,
        digests: results,
      },
      req,
    );
  } catch (error) {
    console.error('[linkedin-ad-digest] Unhandled error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      req,
      500,
    );
  }
});
