/**
 * Re-engagement Orchestrator Adapters
 *
 * Stale Deal Revival sequence adapters:
 * 1. research-trigger-events — monitor closed-lost deals, run parallel web research
 * 2. (future) analyse-stall-reason
 * 3. (future) draft-reengagement
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';
import { logAICostEvent, extractAnthropicUsage } from '../../costTracking.ts';

// =============================================================================
// Types
// =============================================================================

interface WatchlistItem {
  watchlist_id: string;
  deal_id: string;
  deal_name: string;
  deal_value: number | null;
  contact_ids: string[];
  loss_reason: string | null;
  close_date: string | null;
  days_since_close: number;
  next_check_date: string;
  last_signal_at: string | null;
  last_signal_type: string | null;
  owner_name: string | null;
}

interface ResearchSignal {
  type: 'company_news' | 'champion_job_change' | 'competitor_churn';
  title: string;
  description: string;
  source_url?: string;
  relevance_score: number;
}

interface EnrichmentCache {
  last_researched_at?: string;
  company_news?: any;
  champion_job_changes?: any;
  competitor_churn?: any;
}

// =============================================================================
// Helper: Invoke gemini-research edge function
// =============================================================================

async function invokeGeminiResearch(
  supabaseUrl: string,
  serviceKey: string,
  query: string,
  responseSchema?: Record<string, any>
): Promise<{ result: any; sources: Array<{ title?: string; uri?: string }>; metadata: any }> {
  const response = await fetch(`${supabaseUrl}/functions/v1/gemini-research`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, responseSchema }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`gemini-research returned ${response.status}: ${errorText}`);
  }

  return await response.json();
}

// =============================================================================
// Helper: Check if cache is fresh (within 24 hours)
// =============================================================================

function isCacheFresh(enrichmentData: EnrichmentCache | null): boolean {
  if (!enrichmentData?.last_researched_at) return false;

  const lastResearched = new Date(enrichmentData.last_researched_at);
  const now = new Date();
  const hoursSince = (now.getTime() - lastResearched.getTime()) / (1000 * 60 * 60);

  return hoursSince < 24;
}

// =============================================================================
// Helper: Extract signals from research results
// =============================================================================

function extractSignals(
  companyName: string,
  companyNewsResult: any,
  championJobResult: any,
  competitorChurnResult: any
): ResearchSignal[] {
  const signals: ResearchSignal[] = [];

  // Process company news
  if (companyNewsResult?.news_items && Array.isArray(companyNewsResult.news_items)) {
    for (const item of companyNewsResult.news_items.slice(0, 3)) {
      if (item.relevance_score && item.relevance_score >= 0.6) {
        signals.push({
          type: 'company_news',
          title: item.headline || item.title || 'Company news update',
          description: item.summary || item.description || '',
          source_url: item.url,
          relevance_score: item.relevance_score,
        });
      }
    }
  }

  // Process champion job changes
  if (championJobResult?.job_changes && Array.isArray(championJobResult.job_changes)) {
    for (const change of championJobResult.job_changes) {
      if (change.confidence && change.confidence >= 0.7) {
        signals.push({
          type: 'champion_job_change',
          title: `${change.person_name || 'Champion'} moved to ${change.new_company || 'new role'}`,
          description: change.details || `Role: ${change.new_title || 'unknown'}`,
          source_url: change.linkedin_url,
          relevance_score: change.confidence,
        });
      }
    }
  }

  // Process competitor churn signals
  if (competitorChurnResult?.churn_signals && Array.isArray(competitorChurnResult.churn_signals)) {
    for (const signal of competitorChurnResult.churn_signals) {
      if (signal.strength && signal.strength >= 0.6) {
        signals.push({
          type: 'competitor_churn',
          title: signal.title || 'Competitor churn signal',
          description: signal.description || '',
          source_url: signal.source_url,
          relevance_score: signal.strength,
        });
      }
    }
  }

  return signals.sort((a, b) => b.relevance_score - a.relevance_score);
}

// =============================================================================
// Adapter: Research Trigger Events
// =============================================================================

export const researchTriggerEventsAdapter: SkillAdapter = {
  name: 'research-trigger-events',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[research-trigger-events] Starting re-engagement trigger research...');

      const supabase = getServiceClient();
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const orgId = state.event.org_id;

      // Get watchlist items due for check
      const limit = 10; // Process up to 10 deals per run
      const { data: watchlistItems, error: watchlistError } = await supabase
        .rpc('get_deals_due_for_reengagement_check', {
          p_org_id: orgId,
          p_limit: limit,
        });

      if (watchlistError) {
        throw new Error(`Failed to fetch watchlist items: ${watchlistError.message}`);
      }

      if (!watchlistItems || watchlistItems.length === 0) {
        console.log('[research-trigger-events] No deals due for check');
        return {
          success: true,
          output: { watchlist_items: [], signals_found: 0 },
          duration_ms: Date.now() - start,
        };
      }

      console.log(`[research-trigger-events] Processing ${watchlistItems.length} watchlist items`);

      const processedItems: Array<{
        deal_id: string;
        deal_name: string;
        company_name: string | null;
        signals: ResearchSignal[];
        cache_used: boolean;
      }> = [];

      let totalSignals = 0;

      // Process each watchlist item
      for (const item of watchlistItems as WatchlistItem[]) {
        console.log(`[research-trigger-events] Processing deal: ${item.deal_name} (${item.deal_id})`);

        // Get deal details to find company
        const { data: deal, error: dealError } = await supabase
          .from('deals')
          .select('id, name, company_id')
          .eq('id', item.deal_id)
          .maybeSingle();

        if (dealError || !deal) {
          console.warn(`[research-trigger-events] Failed to fetch deal ${item.deal_id}:`, dealError);
          continue;
        }

        // Get company details
        const { data: company, error: companyError } = await supabase
          .from('companies')
          .select('id, name, domain, enrichment_data, enriched_at')
          .eq('id', deal.company_id)
          .maybeSingle();

        if (companyError || !company) {
          console.warn(`[research-trigger-events] No company found for deal ${item.deal_id}`);
          processedItems.push({
            deal_id: item.deal_id,
            deal_name: item.deal_name,
            company_name: null,
            signals: [],
            cache_used: false,
          });
          continue;
        }

        const companyName = company.name;
        const companyDomain = company.domain;
        const enrichmentData = company.enrichment_data as EnrichmentCache | null;

        // Check cache freshness
        const useCachedData = isCacheFresh(enrichmentData);

        let companyNewsResult: any;
        let championJobResult: any;
        let competitorChurnResult: any;

        if (useCachedData && enrichmentData) {
          console.log(`[research-trigger-events] Using cached data for ${companyName} (cache age: ${enrichmentData.last_researched_at})`);
          companyNewsResult = enrichmentData.company_news;
          championJobResult = enrichmentData.champion_job_changes;
          competitorChurnResult = enrichmentData.competitor_churn;
        } else {
          console.log(`[research-trigger-events] Running fresh research for ${companyName}`);

          // Run 3 parallel Gemini grounded searches
          const [newsRes, jobChangeRes, churnRes] = await Promise.allSettled([
            // Query 1: Company news (funding, product launches, leadership changes)
            invokeGeminiResearch(
              supabaseUrl,
              serviceKey,
              `Find recent news about "${companyName}"${companyDomain ? ` (${companyDomain})` : ''} from the last 6 months. ` +
              `Focus on: funding announcements, product launches, major partnerships, leadership changes, acquisitions, ` +
              `expansion news, or strategic pivots. Each news item should have a relevance score (0-1) indicating ` +
              `how significant it is for potential re-engagement (e.g., new funding or leadership change = high relevance).`,
              {
                type: 'object',
                properties: {
                  news_items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        headline: { type: 'string' },
                        summary: { type: 'string' },
                        date: { type: 'string' },
                        url: { type: 'string' },
                        relevance_score: { type: 'number' },
                      },
                    },
                  },
                },
              }
            ),

            // Query 2: Champion job changes
            invokeGeminiResearch(
              supabaseUrl,
              serviceKey,
              `Search for recent job changes involving people who previously worked at "${companyName}"${companyDomain ? ` (${companyDomain})` : ''}. ` +
              `Look for LinkedIn posts or announcements about departures, new roles at other companies, or promotions. ` +
              `Focus on director-level and above. Include their new company and title if found. ` +
              `Confidence score (0-1) should reflect certainty that this is a real job change.`,
              {
                type: 'object',
                properties: {
                  job_changes: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        person_name: { type: 'string' },
                        previous_title: { type: 'string' },
                        new_company: { type: 'string' },
                        new_title: { type: 'string' },
                        date: { type: 'string' },
                        linkedin_url: { type: 'string' },
                        confidence: { type: 'number' },
                        details: { type: 'string' },
                      },
                    },
                  },
                },
              }
            ),

            // Query 3: Competitor churn signals
            invokeGeminiResearch(
              supabaseUrl,
              serviceKey,
              `Search for signals that "${companyName}"${companyDomain ? ` (${companyDomain})` : ''} may be experiencing customer churn ` +
              `or dissatisfaction with their current vendors/solutions. Look for: negative reviews, customer complaints on social media, ` +
              `switching announcements, vendor changes, RFP postings, or industry discussions about their tech stack. ` +
              `Strength score (0-1) should reflect how strong the churn signal is.`,
              {
                type: 'object',
                properties: {
                  churn_signals: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                        description: { type: 'string' },
                        source_url: { type: 'string' },
                        date: { type: 'string' },
                        strength: { type: 'number' },
                      },
                    },
                  },
                },
              }
            ),
          ]);

          // Extract results (fault-tolerant)
          companyNewsResult = newsRes.status === 'fulfilled' ? newsRes.value.result : { news_items: [] };
          championJobResult = jobChangeRes.status === 'fulfilled' ? jobChangeRes.value.result : { job_changes: [] };
          competitorChurnResult = churnRes.status === 'fulfilled' ? churnRes.value.result : { churn_signals: [] };

          // Cache the results
          const newEnrichmentData = {
            last_researched_at: new Date().toISOString(),
            company_news: companyNewsResult,
            champion_job_changes: championJobResult,
            competitor_churn: competitorChurnResult,
          };

          const { error: updateError } = await supabase
            .from('companies')
            .update({
              enrichment_data: newEnrichmentData,
              enriched_at: new Date().toISOString(),
            })
            .eq('id', company.id);

          if (updateError) {
            console.warn(`[research-trigger-events] Failed to cache enrichment for company ${company.id}:`, updateError.message);
          } else {
            console.log(`[research-trigger-events] Cached enrichment data for ${companyName}`);
          }
        }

        // Extract signals
        const signals = extractSignals(companyName, companyNewsResult, championJobResult, competitorChurnResult);

        console.log(`[research-trigger-events] Found ${signals.length} signals for ${companyName}`);

        // Record signals in database
        for (const signal of signals) {
          const { error: signalError } = await supabase.rpc('record_reengagement_signal', {
            p_deal_id: item.deal_id,
            p_signal_type: signal.type,
            p_signal_description: `${signal.title}\n\n${signal.description}${signal.source_url ? `\n\nSource: ${signal.source_url}` : ''}`,
          });

          if (signalError) {
            console.warn(`[research-trigger-events] Failed to record signal for deal ${item.deal_id}:`, signalError.message);
          }
        }

        processedItems.push({
          deal_id: item.deal_id,
          deal_name: item.deal_name,
          company_name: companyName,
          signals,
          cache_used: useCachedData,
        });

        totalSignals += signals.length;
      }

      console.log(
        `[research-trigger-events] Complete: processed ${processedItems.length} deals, ` +
        `found ${totalSignals} total signals`
      );

      return {
        success: true,
        output: {
          watchlist_items: processedItems,
          signals_found: totalSignals,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[research-trigger-events] Error:', err);
      return {
        success: false,
        error: String(err),
        duration_ms: Date.now() - start,
      };
    }
  },
};

// =============================================================================
// Adapter 2: Analyse Stall Reason
// =============================================================================

interface ScoredOpportunity {
  deal_id: string;
  deal_name: string;
  company_name: string | null;
  deal_value: number | null;
  loss_reason: string | null;
  close_date: string | null;
  days_since_close: number;
  signals: ResearchSignal[];
  // Scoring breakdown
  score: number; // 0-100
  signal_score: number; // 0-40
  timing_score: number; // 0-20
  relationship_score: number; // 0-20
  reason_compatibility_score: number; // 0-20
  // Analysis
  primary_signal?: string;
  recommended_approach?: string;
}

/**
 * Helper: Invoke Claude Haiku for opportunity analysis
 */
async function analyseSingleOpportunity(
  apiKey: string,
  opportunity: {
    deal_id: string;
    deal_name: string;
    company_name: string | null;
    signals: ResearchSignal[];
    loss_reason: string | null;
    close_date: string | null;
    days_since_close: number;
    deal_value: number | null;
  }
): Promise<{
  analysis: {
    signal_strength: 'strong' | 'moderate' | 'weak';
    relationship_health: 'multiple_contacts' | 'single_contact' | 'champion_left';
    recommended_approach: string;
  };
  usage: any;
}> {
  const prompt = [
    '# RE-ENGAGEMENT OPPORTUNITY ANALYSIS',
    '',
    `Deal: ${opportunity.deal_name}`,
    `Company: ${opportunity.company_name || 'Unknown'}`,
    `Loss Reason: ${opportunity.loss_reason || 'Unknown'}`,
    `Closed: ${opportunity.close_date ? new Date(opportunity.close_date).toLocaleDateString() : 'Unknown'} (${opportunity.days_since_close} days ago)`,
    `Deal Value: ${opportunity.deal_value ? `$${opportunity.deal_value.toLocaleString()}` : 'Unknown'}`,
    '',
    '## Signals Detected',
    '',
    opportunity.signals.length > 0
      ? opportunity.signals
          .map(
            (s, i) =>
              `${i + 1}. [${s.type}] ${s.title}\n   ${s.description}\n   Relevance: ${(s.relevance_score * 100).toFixed(0)}%${
                s.source_url ? `\n   Source: ${s.source_url}` : ''
              }`
          )
          .join('\n\n')
      : 'No signals detected.',
    '',
    '---',
    '',
    'Analyze this re-engagement opportunity and return JSON with:',
    '- signal_strength: "strong" (funding/job change) | "moderate" (company news) | "weak" (trigger date only)',
    '- relationship_health: "multiple_contacts" | "single_contact" | "champion_left"',
    '- recommended_approach: 1-2 sentence suggestion for how to approach re-engagement',
    '',
    'Consider:',
    '- Are the signals actionable and specific?',
    '- How long has it been since close? (3-6mo = ideal, >12mo = cold)',
    '- Does the loss reason suggest they might be ready now? (budget/timing = yes, bad_fit = unlikely)',
    '',
    'Return ONLY valid JSON.',
  ].join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      temperature: 0.3,
      system:
        'You are a sales re-engagement analyst. Analyze closed-lost deals for re-engagement potential. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API returned ${response.status}`);
  }

  const result = await response.json();
  const textContent = result.content?.[0]?.text;
  if (!textContent) {
    throw new Error('No text content in Claude response');
  }

  const jsonMatch = textContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in Claude response');
  }

  return {
    analysis: JSON.parse(jsonMatch[0]),
    usage: result.usage, // Return usage metadata for cost tracking
  };
}

/**
 * Calculate scoring breakdown
 */
function calculateScore(
  signalStrength: 'strong' | 'moderate' | 'weak',
  daysSinceClose: number,
  relationshipHealth: 'multiple_contacts' | 'single_contact' | 'champion_left',
  lossReason: string | null
): {
  signal_score: number;
  timing_score: number;
  relationship_score: number;
  reason_compatibility_score: number;
  total: number;
} {
  // Signal strength (40pts max)
  let signal_score = 0;
  if (signalStrength === 'strong') signal_score = 40;
  else if (signalStrength === 'moderate') signal_score = 20;
  else signal_score = 10;

  // Time since close (20pts max)
  let timing_score = 0;
  if (daysSinceClose >= 90 && daysSinceClose < 180) timing_score = 20; // 3-6 months
  else if (daysSinceClose >= 180 && daysSinceClose < 270) timing_score = 15; // 6-9 months
  else if (daysSinceClose >= 270 && daysSinceClose < 365) timing_score = 10; // 9-12 months
  else if (daysSinceClose >= 365) timing_score = 5; // >12 months

  // Relationship health (20pts max)
  let relationship_score = 0;
  if (relationshipHealth === 'multiple_contacts') relationship_score = 20;
  else if (relationshipHealth === 'single_contact') relationship_score = 10;
  else if (relationshipHealth === 'champion_left') relationship_score = 5;

  // Loss reason compatibility (20pts max)
  let reason_compatibility_score = 0;
  const normalizedReason = (lossReason || '').toLowerCase();
  if (normalizedReason.includes('budget') || normalizedReason.includes('timing')) {
    reason_compatibility_score = 20;
  } else if (normalizedReason.includes('champion') || normalizedReason.includes('left')) {
    reason_compatibility_score = 15;
  } else if (normalizedReason.includes('competitor')) {
    reason_compatibility_score = 10;
  } else if (normalizedReason.includes('bad_fit') || normalizedReason.includes('fit')) {
    reason_compatibility_score = 5;
  } else {
    // Unknown reason — neutral
    reason_compatibility_score = 12;
  }

  return {
    signal_score,
    timing_score,
    relationship_score,
    reason_compatibility_score,
    total: signal_score + timing_score + relationship_score + reason_compatibility_score,
  };
}

export const analyseStallReasonAdapter: SkillAdapter = {
  name: 'analyse-stall-reason',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[analyse-stall-reason] Starting stall reason analysis...');

      const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
      if (!apiKey) {
        return {
          success: false,
          error: 'ANTHROPIC_API_KEY not configured',
          duration_ms: Date.now() - start,
        };
      }

      const supabase = getServiceClient();

      // Get output from research-trigger-events
      const researchOutput = state.outputs['research-trigger-events'] as
        | {
            watchlist_items: Array<{
              deal_id: string;
              deal_name: string;
              company_name: string | null;
              signals: ResearchSignal[];
              cache_used: boolean;
            }>;
            signals_found: number;
          }
        | undefined;

      if (!researchOutput || !researchOutput.watchlist_items || researchOutput.watchlist_items.length === 0) {
        console.log('[analyse-stall-reason] No watchlist items to analyze');
        return {
          success: true,
          output: { scored_opportunities: [] },
          duration_ms: Date.now() - start,
        };
      }

      const watchlistItems = researchOutput.watchlist_items;
      console.log(`[analyse-stall-reason] Analyzing ${watchlistItems.length} opportunities`);

      const scoredOpportunities: ScoredOpportunity[] = [];

      // Analyze each opportunity
      for (const item of watchlistItems) {
        console.log(`[analyse-stall-reason] Analyzing ${item.deal_name} (${item.deal_id})`);

        // Get full watchlist item with metadata
        const { data: watchlistRecord } = await supabase
          .rpc('get_deals_due_for_reengagement_check', {
            p_org_id: state.event.org_id,
            p_limit: 1000, // Get all to find this specific one
          })
          .then((res: any) => ({
            data: res.data?.find((w: any) => w.deal_id === item.deal_id),
            error: res.error,
          }));

        if (!watchlistRecord) {
          console.warn(`[analyse-stall-reason] No watchlist record found for ${item.deal_id}`);
          continue;
        }

        const opportunity = {
          deal_id: item.deal_id,
          deal_name: item.deal_name,
          company_name: item.company_name,
          signals: item.signals,
          loss_reason: watchlistRecord.loss_reason,
          close_date: watchlistRecord.close_date,
          days_since_close: watchlistRecord.days_since_close,
          deal_value: watchlistRecord.deal_value,
        };

        // Invoke Claude for analysis
        let analysis: {
          signal_strength: 'strong' | 'moderate' | 'weak';
          relationship_health: 'multiple_contacts' | 'single_contact' | 'champion_left';
          recommended_approach: string;
        };
        let claudeUsage: any = null;

        try {
          const result = await analyseSingleOpportunity(apiKey, opportunity);
          analysis = result.analysis;
          claudeUsage = result.usage;

          // Track cost for Claude synthesis call
          if (claudeUsage) {
            const usage = extractAnthropicUsage({ usage: claudeUsage });
            await logAICostEvent(
              supabase,
              state.event.user_id,
              state.event.org_id,
              'anthropic',
              'claude-haiku-4-5-20251001',
              usage.inputTokens,
              usage.outputTokens,
              'reengagement-analysis',
              { deal_id: item.deal_id }
            );
          }
        } catch (err) {
          console.warn(`[analyse-stall-reason] Claude analysis failed for ${item.deal_id}:`, err);
          // Fallback to basic heuristics
          let signalStrength: 'strong' | 'moderate' | 'weak' = 'weak';
          if (item.signals.some((s) => s.type === 'champion_job_change' && s.relevance_score >= 0.7)) {
            signalStrength = 'strong';
          } else if (item.signals.some((s) => s.relevance_score >= 0.6)) {
            signalStrength = 'moderate';
          }

          analysis = {
            signal_strength: signalStrength,
            relationship_health: 'single_contact',
            recommended_approach: 'Review signals and consider personalized outreach.',
          };
        }

        // Calculate score
        const scoring = calculateScore(
          analysis.signal_strength,
          opportunity.days_since_close,
          analysis.relationship_health,
          opportunity.loss_reason
        );

        // Find primary signal (highest relevance)
        const primarySignal = item.signals.length > 0 ? item.signals[0].title : undefined;

        scoredOpportunities.push({
          deal_id: item.deal_id,
          deal_name: item.deal_name,
          company_name: item.company_name,
          deal_value: opportunity.deal_value,
          loss_reason: opportunity.loss_reason,
          close_date: opportunity.close_date,
          days_since_close: opportunity.days_since_close,
          signals: item.signals,
          score: scoring.total,
          signal_score: scoring.signal_score,
          timing_score: scoring.timing_score,
          relationship_score: scoring.relationship_score,
          reason_compatibility_score: scoring.reason_compatibility_score,
          primary_signal: primarySignal,
          recommended_approach: analysis.recommended_approach,
        });

        console.log(
          `[analyse-stall-reason] ${item.deal_name}: score=${scoring.total}/100 ` +
            `(signal=${scoring.signal_score}, timing=${scoring.timing_score}, ` +
            `relationship=${scoring.relationship_score}, reason=${scoring.reason_compatibility_score})`
        );
      }

      // Sort by score descending
      scoredOpportunities.sort((a, b) => b.score - a.score);

      console.log(
        `[analyse-stall-reason] Complete: scored ${scoredOpportunities.length} opportunities, ` +
          `top score: ${scoredOpportunities[0]?.score || 0}/100`
      );

      return {
        success: true,
        output: { scored_opportunities: scoredOpportunities },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[analyse-stall-reason] Error:', err);
      return {
        success: false,
        error: String(err),
        duration_ms: Date.now() - start,
      };
    }
  },
};

// =============================================================================
// Adapter 3: Draft Re-engagement
// =============================================================================

interface EmailDraft {
  deal_id: string;
  deal_name: string;
  company_name: string | null;
  contact_name: string;
  contact_email: string;
  subject: string;
  body: string;
  signal_summary: string;
  score: number;
  recommended_approach: string;
}

/**
 * Helper: Draft a personalized re-engagement email using Claude
 */
async function draftReengagementEmail(
  apiKey: string,
  opportunity: ScoredOpportunity,
  contact: { name: string; email: string },
  orgTone: string,
  orgName: string
): Promise<{ subject: string; body: string; signal_summary: string; usage: any } | null> {
  // Build signal context
  const signalContext = opportunity.signals.length > 0
    ? opportunity.signals
        .slice(0, 3) // Top 3 signals
        .map((s) => `- [${s.type}] ${s.title}: ${s.description}`)
        .join('\n')
    : 'No specific signals detected.';

  const primarySignal = opportunity.primary_signal || 'Follow-up timing';

  const prompt = [
    '# RE-ENGAGEMENT EMAIL DRAFT',
    '',
    `You are drafting a re-engagement email for ${orgName}.`,
    '',
    '## Context',
    `Deal: ${opportunity.deal_name}`,
    `Company: ${opportunity.company_name || 'Unknown'}`,
    `Contact: ${contact.name}`,
    `Previous Close Date: ${opportunity.close_date ? new Date(opportunity.close_date).toLocaleDateString() : 'Unknown'}`,
    `Days Since Close: ${opportunity.days_since_close}`,
    `Loss Reason: ${opportunity.loss_reason || 'Unknown'}`,
    `Deal Value: ${opportunity.deal_value ? `$${opportunity.deal_value.toLocaleString()}` : 'Unknown'}`,
    '',
    '## Trigger Signals',
    signalContext,
    '',
    `## Recommended Approach`,
    opportunity.recommended_approach,
    '',
    '## Your Task',
    'Draft a personalized re-engagement email that:',
    '1. References the specific signal(s) that make "now" the right time to reconnect',
    '2. Acknowledges the previous relationship without dwelling on the loss',
    '3. Provides a clear, specific hook based on the trigger event',
    '4. Ends with a low-friction call-to-action (15-min call)',
    '5. Sounds human and conversational, not robotic or salesy',
    `6. Uses a ${orgTone} tone of voice`,
    '',
    'Keep it concise: 3-5 sentences max, plus a signature line.',
    '',
    'Return JSON with:',
    '- subject: Email subject line (under 60 chars)',
    '- body: Email body (plain text, no HTML)',
    '- signal_summary: One sentence explaining why now is the right time (for internal context)',
    '',
    'Return ONLY valid JSON.',
  ].join('\n');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        temperature: 0.7,
        system: 'You are a sales re-engagement email writer. Draft personalized, human-sounding emails that reference specific trigger events. Return ONLY valid JSON.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API returned ${response.status}`);
    }

    const result = await response.json();
    const textContent = result.content?.[0]?.text;
    if (!textContent) {
      throw new Error('No text content in Claude response');
    }

    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }

    return {
      ...JSON.parse(jsonMatch[0]),
      usage: result.usage, // Return usage metadata for cost tracking
    };
  } catch (err) {
    console.error(`[draft-reengagement] Failed to draft email for ${opportunity.deal_name}:`, err);
    return null;
  }
}

export const draftReengagementAdapter: SkillAdapter = {
  name: 'draft-reengagement',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[draft-reengagement] Starting email draft generation...');

      const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
      if (!apiKey) {
        return {
          success: false,
          error: 'ANTHROPIC_API_KEY not configured',
          duration_ms: Date.now() - start,
        };
      }

      const supabase = getServiceClient();
      const orgId = state.event.org_id;

      // Get org settings for tone of voice
      const { data: org } = await supabase
        .from('organizations')
        .select('name, tone_of_voice')
        .eq('id', orgId)
        .maybeSingle();

      const orgName = org?.name || 'our team';
      const toneOfVoice = typeof org?.tone_of_voice === 'object'
        ? (org.tone_of_voice as any)?.tone || 'professional'
        : org?.tone_of_voice || 'professional';

      // Get output from analyse-stall-reason
      const analysisOutput = state.outputs['analyse-stall-reason'] as
        | { scored_opportunities: ScoredOpportunity[] }
        | undefined;

      if (!analysisOutput || !analysisOutput.scored_opportunities || analysisOutput.scored_opportunities.length === 0) {
        console.log('[draft-reengagement] No scored opportunities to process');
        return {
          success: true,
          requires_approval: true,
          output: { drafts: [], total_qualified: 0 },
          duration_ms: Date.now() - start,
        };
      }

      // Filter to opportunities worth pursuing (score >= 50)
      const qualifiedOpportunities = analysisOutput.scored_opportunities.filter((opp) => opp.score >= 50);

      console.log(
        `[draft-reengagement] Found ${qualifiedOpportunities.length} qualified opportunities ` +
        `(score >= 50) out of ${analysisOutput.scored_opportunities.length} total`
      );

      if (qualifiedOpportunities.length === 0) {
        console.log('[draft-reengagement] No opportunities meet the threshold');
        return {
          success: true,
          requires_approval: true,
          output: { drafts: [], total_qualified: 0 },
          duration_ms: Date.now() - start,
        };
      }

      // Process top 5 opportunities
      const topOpportunities = qualifiedOpportunities.slice(0, 5);
      const drafts: EmailDraft[] = [];

      for (const opp of topOpportunities) {
        console.log(`[draft-reengagement] Processing ${opp.deal_name} (score: ${opp.score})`);

        // Get deal details to find primary contact
        const { data: deal } = await supabase
          .from('deals')
          .select('id, primary_contact_id')
          .eq('id', opp.deal_id)
          .maybeSingle();

        if (!deal || !deal.primary_contact_id) {
          console.warn(`[draft-reengagement] No primary contact found for deal ${opp.deal_id}`);
          continue;
        }

        // Get contact details
        const { data: contact } = await supabase
          .from('contacts')
          .select('first_name, last_name, full_name, email')
          .eq('id', deal.primary_contact_id)
          .maybeSingle();

        if (!contact || !contact.email) {
          console.warn(`[draft-reengagement] Invalid contact data for deal ${opp.deal_id}`);
          continue;
        }

        const contactName = contact.full_name ||
          [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
          contact.email;

        // Draft email using Claude
        const draft = await draftReengagementEmail(
          apiKey,
          opp,
          { name: contactName, email: contact.email },
          toneOfVoice,
          orgName
        );

        if (!draft) {
          console.warn(`[draft-reengagement] Failed to generate draft for ${opp.deal_name}`);
          continue;
        }

        // Track cost for Claude email draft call
        if (draft.usage) {
          const usage = extractAnthropicUsage({ usage: draft.usage });
          await logAICostEvent(
            supabase,
            state.event.user_id,
            state.event.org_id,
            'anthropic',
            'claude-haiku-4-5-20251001',
            usage.inputTokens,
            usage.outputTokens,
            'reengagement-email-draft',
            { deal_id: opp.deal_id }
          );
        }

        drafts.push({
          deal_id: opp.deal_id,
          deal_name: opp.deal_name,
          company_name: opp.company_name,
          contact_name: contactName,
          contact_email: contact.email,
          subject: draft.subject,
          body: draft.body,
          signal_summary: draft.signal_summary,
          score: opp.score,
          recommended_approach: opp.recommended_approach,
        });

        console.log(`[draft-reengagement] ✓ Drafted email for ${opp.deal_name}`);
      }

      console.log(`[draft-reengagement] Complete: generated ${drafts.length} email drafts`);

      return {
        success: true,
        requires_approval: true,
        output: {
          drafts,
          total_qualified: qualifiedOpportunities.length,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[draft-reengagement] Error:', err);
      return {
        success: false,
        error: String(err),
        duration_ms: Date.now() - start,
      };
    }
  },
};
