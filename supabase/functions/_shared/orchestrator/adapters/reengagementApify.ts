/**
 * Re-engagement Apify Company News Adapter
 *
 * REN-004: Query Apify actors for company news signals (product launches,
 * leadership changes, expansion, funding announcements) for deals on the
 * re-engagement watchlist. Detected signals are scored and written to
 * deal_signal_temperature via upsert_signal_temperature().
 *
 * Uses Apify Google SERP scraper with async actor polling to respect
 * Apify rate limits and edge function timeout budgets.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';

// =============================================================================
// Constants
// =============================================================================

const APIFY_API_BASE = 'https://api.apify.com/v2';

// Actor for Google Search — lightweight, reliable for news queries
const SERP_ACTOR_ID = 'apify/google-search-scraper';

// Synchronous actor wait timeout (seconds). Keep low to avoid edge timeout.
const ACTOR_WAIT_SECONDS = 45;

// How many search queries per deal (each = 1 actor run credit)
const QUERIES_PER_DEAL = 2;

// Max deals to process per cycle (budget control)
const MAX_DEALS_PER_CYCLE = 10;

// Age threshold: ignore news older than 180 days
const MAX_NEWS_AGE_DAYS = 180;

// Signal relevance thresholds for score mapping
const RELEVANCE = {
  HIGH: 0.28,    // Product launch, acquisition, Series A+
  MEDIUM: 0.18,  // Executive hire, expansion, new office
  LOW: 0.10,     // General news, blog post, award
} as const;

// Keywords that indicate high-relevance buying-trigger events
const HIGH_RELEVANCE_KEYWORDS = [
  'raises', 'raises funding', 'series a', 'series b', 'series c', 'series d',
  'acquired', 'acquisition', 'merger', 'ipo', 'goes public',
  'launches', 'product launch', 'new product', 'announces',
  'expands', 'expansion', 'new market', 'international expansion',
  'hires', 'appoints', 'new cto', 'new cfo', 'new ceo', 'new vp',
  'partnership', 'strategic alliance',
];

const MEDIUM_RELEVANCE_KEYWORDS = [
  'growth', 'record', 'milestone', 'revenue', 'customers', 'award',
  'certif', 'recogni', 'headquarters', 'new office', 'opens office',
  'team', 'hiring', 'headcount',
];

// =============================================================================
// Types
// =============================================================================

interface ApifySerpResult {
  searchQuery?: { term: string };
  organicResults?: Array<{
    title: string;
    url: string;
    description: string;
    position: number;
  }>;
}

interface NewsSignal {
  type: 'product_launch' | 'leadership_change' | 'funding' | 'expansion' | 'general_news';
  source: 'apify_serp';
  title: string;
  description: string;
  url?: string;
  score_delta: number;
  detected_at: string;
  metadata?: Record<string, unknown>;
}

interface DealNewsResult {
  deal_id: string;
  deal_name: string;
  company_name: string;
  signals: NewsSignal[];
  temperature_written: boolean;
  error?: string;
}

// =============================================================================
// Helpers: Apify actor run
// =============================================================================

/**
 * Run an Apify actor synchronously and return dataset items.
 * Polls status after waitForFinish returns.
 */
async function runApifyActorSync(
  actorId: string,
  input: Record<string, unknown>,
  apiKey: string
): Promise<unknown[]> {
  // Start actor run, wait for finish
  const runUrl = `${APIFY_API_BASE}/acts/${encodeURIComponent(actorId)}/runs` +
    `?token=${apiKey}&waitForFinish=${ACTOR_WAIT_SECONDS}`;

  const runResp = await fetch(runUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!runResp.ok) {
    const text = await runResp.text().catch(() => 'Unknown error');
    if (runResp.status === 429) throw new Error('APIFY_RATE_LIMITED');
    if (runResp.status === 401) throw new Error('APIFY_AUTH_FAILED');
    throw new Error(`Apify actor start failed (${runResp.status}): ${text}`);
  }

  const runData: { data: { status: string; defaultDatasetId: string } } =
    await runResp.json();

  const { status, defaultDatasetId } = runData.data;

  if (status === 'FAILED' || status === 'TIMED-OUT' || status === 'TIMEOUT') {
    throw new Error(`Apify actor ended with status: ${status}`);
  }

  if (status !== 'SUCCEEDED') {
    // Actor is still running (waitForFinish may have returned early).
    // For edge function budget safety, we skip polling and return empty.
    console.warn(`[apify-news] Actor status "${status}" — treating as empty result set`);
    return [];
  }

  // Fetch results from dataset
  const datasetUrl = `${APIFY_API_BASE}/datasets/${defaultDatasetId}/items` +
    `?token=${apiKey}&format=json`;

  const datasetResp = await fetch(datasetUrl);
  if (!datasetResp.ok) {
    throw new Error(`Failed to fetch Apify dataset (${datasetResp.status})`);
  }

  const items: unknown[] = await datasetResp.json();
  return Array.isArray(items) ? items : [];
}

// =============================================================================
// Helpers: Signal scoring
// =============================================================================

/**
 * Classify a news article result and compute relevance score.
 */
function classifySearchResult(
  title: string,
  description: string,
  url: string,
  companyName: string
): NewsSignal | null {
  const text = `${title} ${description}`.toLowerCase();
  const companyLower = companyName.toLowerCase();

  // Must mention the company
  if (!text.includes(companyLower) && !url.toLowerCase().includes(companyLower)) {
    return null;
  }

  // Check age via URL heuristic (e.g. year in URL): basic filter
  const currentYear = new Date().getFullYear();
  const recentYears = [String(currentYear), String(currentYear - 1)];
  const hasRecentYear = recentYears.some((y) => url.includes(y) || text.includes(y));
  // If we can't determine year, allow it through (be permissive)

  // Determine signal type and relevance
  let type: NewsSignal['type'] = 'general_news';
  let score_delta = RELEVANCE.LOW;

  const isHighRelevance = HIGH_RELEVANCE_KEYWORDS.some((kw) => text.includes(kw));
  const isMediumRelevance = MEDIUM_RELEVANCE_KEYWORDS.some((kw) => text.includes(kw));

  if (isHighRelevance) {
    score_delta = RELEVANCE.HIGH;
    // Narrow down signal type
    if (
      text.includes('raises') || text.includes('funding') ||
      text.includes('series') || text.includes('ipo')
    ) {
      type = 'funding';
    } else if (
      text.includes('launches') || text.includes('product') ||
      text.includes('announces')
    ) {
      type = 'product_launch';
    } else if (
      text.includes('hires') || text.includes('appoints') ||
      text.includes('new cto') || text.includes('new ceo') || text.includes('new cfo')
    ) {
      type = 'leadership_change';
    } else if (
      text.includes('expands') || text.includes('expansion') ||
      text.includes('new market') || text.includes('new office')
    ) {
      type = 'expansion';
    } else {
      type = 'product_launch';
    }
  } else if (isMediumRelevance) {
    score_delta = RELEVANCE.MEDIUM;
    if (text.includes('hires') || text.includes('team')) {
      type = 'leadership_change';
    } else if (text.includes('office') || text.includes('market')) {
      type = 'expansion';
    }
  }

  return {
    type,
    source: 'apify_serp',
    title: title.slice(0, 200),
    description: description.slice(0, 500),
    url: url || undefined,
    score_delta,
    detected_at: new Date().toISOString(),
    metadata: {
      company: companyName,
      has_recent_year: hasRecentYear,
    },
  };
}

/**
 * Parse Apify SERP results and extract scored signals.
 */
function extractSignalsFromSerpResults(
  items: unknown[],
  companyName: string
): NewsSignal[] {
  const signals: NewsSignal[] = [];
  const seenUrls = new Set<string>();

  for (const item of items) {
    const serpItem = item as ApifySerpResult;
    const organicResults = serpItem.organicResults || [];

    for (const result of organicResults) {
      if (!result.title || !result.url) continue;
      if (seenUrls.has(result.url)) continue;
      seenUrls.add(result.url);

      const signal = classifySearchResult(
        result.title,
        result.description || '',
        result.url,
        companyName
      );

      if (signal) {
        signals.push(signal);
      }
    }
  }

  // Sort by score_delta descending, return top 5
  return signals
    .sort((a, b) => b.score_delta - a.score_delta)
    .slice(0, 5);
}

// =============================================================================
// Helpers: Write to deal_signal_temperature
// =============================================================================

async function writeSignalTemperature(
  supabase: ReturnType<typeof getServiceClient>,
  orgId: string,
  dealId: string,
  signals: NewsSignal[],
  existingTemperature: number
): Promise<boolean> {
  if (signals.length === 0) return false;

  const totalDelta = signals.reduce((sum, s) => sum + s.score_delta, 0);
  const newTemperature = Math.min(existingTemperature + totalDelta, 1.0);
  const trend: 'rising' | 'stable' = newTemperature > existingTemperature ? 'rising' : 'stable';

  const topSignals = signals.slice(0, 5).map((s) => ({
    type: s.type,
    source: s.source,
    description: s.title,
    score_delta: s.score_delta,
    detected_at: s.detected_at,
    url: s.url,
  }));

  const { error } = await supabase.rpc('upsert_signal_temperature', {
    p_deal_id: dealId,
    p_org_id: orgId,
    p_temperature: newTemperature,
    p_trend: trend,
    p_last_signal: new Date().toISOString(),
    p_signal_count_24h: signals.length,
    p_top_signals: topSignals,
  });

  if (error) {
    console.error(
      `[apify-news] Failed to upsert temperature for deal ${dealId}:`,
      error.message
    );
    return false;
  }

  return true;
}

// =============================================================================
// Main Adapter
// =============================================================================

export const apifyNewsAdapter: SkillAdapter = {
  name: 'apify-news-scan',

  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[apify-news] Starting Apify company news scan...');

      const supabase = getServiceClient();
      const orgId = state.event.org_id;

      if (!orgId) {
        throw new Error('org_id is required in event payload');
      }

      // 1. Fetch Apify API key from integration_credentials
      // NOTE: table uses organization_id column, NOT org_id
      const { data: credential, error: credError } = await supabase
        .from('integration_credentials')
        .select('credentials')
        .eq('organization_id', orgId)
        .eq('provider', 'apify')
        .maybeSingle();

      if (credError || !credential?.credentials) {
        console.warn('[apify-news] No Apify credentials found for org, skipping');
        return {
          success: true,
          output: {
            deals_scanned: 0,
            signals_found: 0,
            skipped_reason: 'no_credentials',
          },
          duration_ms: Date.now() - start,
        };
      }

      const apifyApiKey = (credential.credentials as Record<string, string>)?.api_key ||
        (credential.credentials as Record<string, string>)?.token;

      if (!apifyApiKey) {
        console.warn('[apify-news] Apify credentials missing api_key/token field');
        return {
          success: true,
          output: {
            deals_scanned: 0,
            signals_found: 0,
            skipped_reason: 'missing_api_key',
          },
          duration_ms: Date.now() - start,
        };
      }

      // 2. Get active watchlist deals due for re-engagement check
      const { data: watchlistItems, error: watchlistError } = await supabase
        .rpc('get_deals_due_for_reengagement_check', {
          p_org_id: orgId,
          p_limit: MAX_DEALS_PER_CYCLE,
        });

      if (watchlistError) {
        throw new Error(`Failed to fetch watchlist: ${watchlistError.message}`);
      }

      if (!watchlistItems || watchlistItems.length === 0) {
        console.log('[apify-news] No deals due for re-engagement check');
        return {
          success: true,
          output: { deals_scanned: 0, signals_found: 0 },
          duration_ms: Date.now() - start,
        };
      }

      console.log(`[apify-news] Processing ${watchlistItems.length} watchlist deals...`);

      let totalSignalsFound = 0;
      const results: DealNewsResult[] = [];

      for (const watchlistItem of watchlistItems) {
        const dealId = watchlistItem.deal_id;
        const dealName = watchlistItem.deal_name;

        // 3. Get company name/domain for this deal
        const { data: deal } = await supabase
          .from('deals')
          .select('id, company_id')
          .eq('id', dealId)
          .maybeSingle();

        if (!deal?.company_id) {
          console.warn(`[apify-news] Deal ${dealId} has no company, skipping`);
          results.push({
            deal_id: dealId,
            deal_name: dealName,
            company_name: '',
            signals: [],
            temperature_written: false,
            error: 'no_company',
          });
          continue;
        }

        const { data: company } = await supabase
          .from('companies')
          .select('id, name, domain')
          .eq('id', deal.company_id)
          .maybeSingle();

        if (!company?.name) {
          console.warn(`[apify-news] No company name for deal ${dealId}, skipping`);
          continue;
        }

        const companyName = company.name;
        const companyDomain = company.domain || '';
        const dealSignals: NewsSignal[] = [];

        console.log(`[apify-news] Scanning news for: ${companyName} (${dealName})`);

        // 4. Build search queries for this company
        const queries = [
          // Query 1: funding / product / expansion news
          `"${companyName}" (funding OR "product launch" OR expansion OR acquisition) ` +
          `news ${new Date().getFullYear()}`,

          // Query 2: leadership / executive changes
          `"${companyName}" (hires OR appoints OR "new CEO" OR "new CTO" OR "new VP") ` +
          `${new Date().getFullYear()}`,
        ];

        // 5. Run Apify SERP actor for each query (fault-tolerant)
        for (const query of queries.slice(0, QUERIES_PER_DEAL)) {
          try {
            const items = await runApifyActorSync(
              SERP_ACTOR_ID,
              {
                queries: query,
                maxPagesPerQuery: 1,
                resultsPerPage: 10,
                mobileResults: false,
                countryCode: 'us',
                languageCode: 'en',
              },
              apifyApiKey
            );

            const querySignals = extractSignalsFromSerpResults(items, companyName);
            dealSignals.push(...querySignals);

            console.log(`[apify-news] Query "${query.slice(0, 60)}..." → ${querySignals.length} signals`);
          } catch (actorErr) {
            const errMsg = String(actorErr);
            console.warn(`[apify-news] Actor run failed for "${companyName}": ${errMsg}`);

            if (errMsg.includes('APIFY_RATE_LIMITED')) {
              // Rate limited — bail out of the deal loop too
              console.warn('[apify-news] Rate limited by Apify, stopping scan early');
              break;
            }
            // Other errors: continue with next query
          }
        }

        // 6. Deduplicate and rank signals
        const uniqueSignals = dealSignals
          .filter((s, idx, arr) => arr.findIndex((x) => x.url === s.url) === idx)
          .sort((a, b) => b.score_delta - a.score_delta)
          .slice(0, 5);

        // 7. Get existing temperature and write update
        const { data: existingTemp } = await supabase
          .from('deal_signal_temperature')
          .select('temperature')
          .eq('deal_id', dealId)
          .maybeSingle();

        const existingTemperature = (existingTemp?.temperature as number) || 0.0;
        let temperatureWritten = false;

        if (uniqueSignals.length > 0) {
          temperatureWritten = await writeSignalTemperature(
            supabase,
            orgId,
            dealId,
            uniqueSignals,
            existingTemperature
          );

          // Also record in watchlist signal log
          for (const sig of uniqueSignals) {
            await supabase.rpc('record_reengagement_signal', {
              p_deal_id: dealId,
              p_signal_type: `apify_${sig.type}`,
              p_signal_description: `${sig.title}${sig.url ? `\n\nSource: ${sig.url}` : ''}`,
            }).catch((err: Error) => {
              console.warn(`[apify-news] Failed to record watchlist signal: ${err.message}`);
            });
          }

          totalSignalsFound += uniqueSignals.length;

          console.log(
            `[apify-news] ${companyName}: ${uniqueSignals.length} signals → ` +
            `temp ${existingTemperature.toFixed(2)} → ` +
            `${Math.min(existingTemperature + uniqueSignals.reduce((s, d) => s + d.score_delta, 0), 1.0).toFixed(2)}`
          );
        }

        results.push({
          deal_id: dealId,
          deal_name: dealName,
          company_name: companyName,
          signals: uniqueSignals,
          temperature_written: temperatureWritten,
        });
      }

      console.log(
        `[apify-news] Complete: scanned ${results.length} deals, ` +
        `found ${totalSignalsFound} signals`
      );

      return {
        success: true,
        output: {
          deals_scanned: results.length,
          signals_found: totalSignalsFound,
          results,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[apify-news] Error:', err);
      return {
        success: false,
        error: String(err),
        duration_ms: Date.now() - start,
      };
    }
  },
};
