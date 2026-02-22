/**
 * Re-engagement Apollo Signal Adapter
 *
 * REN-003: Detect job changes for champion contacts on closed-lost deals
 * and company funding events via Apollo enrichment, then write results to
 * deal_signal_temperature via upsert_signal_temperature().
 *
 * Rate limiting: max 100 Apollo API calls per scan cycle.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';

// =============================================================================
// Constants
// =============================================================================

const APOLLO_API_BASE = 'https://api.apollo.io/api/v1';
const MAX_APOLLO_CALLS_PER_CYCLE = 100;

// Score weights for Apollo signals (combined into temperature delta)
const SIGNAL_WEIGHTS = {
  job_change_senior: 0.35,       // Director+ changed jobs to ICP-fit company
  job_change_peer: 0.20,         // Non-senior champion left the company
  funding_round: 0.30,           // Company raised a funding round
  company_growth: 0.15,          // Significant employee count growth
} as const;

// Apollo funding stage labels that are meaningful buying signals
const MEANINGFUL_FUNDING_STAGES = [
  'Series A', 'Series B', 'Series C', 'Series D',
  'Seed', 'Pre-Seed', 'Growth', 'IPO',
];

// =============================================================================
// Types
// =============================================================================

interface ApolloContact {
  id: string;
  first_name: string;
  last_name: string;
  title: string;
  email: string | null;
  linkedin_url: string | null;
  organization?: {
    name: string;
    website_url?: string;
  };
  employment_history?: Array<{
    title: string;
    organization_name: string;
    start_date: string | null;
    end_date: string | null;
    current: boolean;
  }>;
}

interface ApolloOrganization {
  id: string;
  name: string;
  domain: string;
  latest_funding_round_date: string | null;
  latest_funding_stage: string | null;
  latest_funding_amount_in_dollars: number | null;
  num_employees: number | null;
  estimated_num_employees: number | null;
}

interface DetectedSignal {
  type: 'job_change' | 'funding_round' | 'company_growth';
  source: 'apollo';
  description: string;
  score_delta: number;
  detected_at: string;
  metadata?: Record<string, unknown>;
}

interface DealScanResult {
  deal_id: string;
  deal_name: string;
  signals: DetectedSignal[];
  apollo_calls_used: number;
  temperature_written: boolean;
}

// =============================================================================
// Helpers: Apollo API
// =============================================================================

/**
 * Fetch Apollo contact by email (people enrichment).
 * Counts as 1 Apollo API call.
 */
async function enrichApolloContact(
  email: string,
  apiKey: string
): Promise<ApolloContact | null> {
  try {
    const response = await fetch(`${APOLLO_API_BASE}/people/match`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({ email, reveal_personal_emails: false }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('[apollo-signal] Apollo rate limited — backing off');
        await new Promise((r) => setTimeout(r, 2000));
      }
      return null;
    }

    const data = await response.json();
    return (data?.person as ApolloContact) || null;
  } catch (err) {
    console.error('[apollo-signal] Contact enrichment error:', err);
    return null;
  }
}

/**
 * Fetch Apollo organization by domain (company enrichment).
 * Counts as 1 Apollo API call.
 */
async function enrichApolloOrganization(
  domain: string,
  apiKey: string
): Promise<ApolloOrganization | null> {
  try {
    const url = new URL(`${APOLLO_API_BASE}/organizations/enrich`);
    url.searchParams.set('domain', domain);

    const resp = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
      },
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        console.warn('[apollo-signal] Apollo rate limited on org enrichment');
        await new Promise((r) => setTimeout(r, 2000));
      }
      return null;
    }

    const data = await resp.json();
    return (data?.organization as ApolloOrganization) || null;
  } catch (err) {
    console.error('[apollo-signal] Organization enrichment error:', err);
    return null;
  }
}

// =============================================================================
// Helpers: Signal Detection
// =============================================================================

/**
 * Detect job-change signals from Apollo contact enrichment.
 * Returns a signal if the contact has recently joined a new organization.
 */
function detectJobChangeSignal(
  contact: ApolloContact,
  originalOrgName: string
): DetectedSignal | null {
  const history = contact.employment_history || [];
  if (history.length < 2) return null;

  // Find the most recent job (current)
  const currentJob = history.find((h) => h.current);
  if (!currentJob) return null;

  // Check if current company differs from original deal company
  const currentOrgName = currentJob.organization_name?.toLowerCase() || '';
  const origOrgLower = originalOrgName.toLowerCase();

  if (currentOrgName === origOrgLower || currentOrgName === '') return null;

  // Determine seniority from title
  const title = (currentJob.title || '').toLowerCase();
  const isSenior = [
    'vp', 'vice president', 'director', 'head of', 'cto', 'cfo', 'coo', 'ceo',
    'evp', 'svp', 'chief', 'president', 'managing director', 'partner',
  ].some((kw) => title.includes(kw));

  const weight = isSenior ? SIGNAL_WEIGHTS.job_change_senior : SIGNAL_WEIGHTS.job_change_peer;

  return {
    type: 'job_change',
    source: 'apollo',
    description:
      `${contact.first_name} ${contact.last_name} (${currentJob.title || 'unknown role'}) ` +
      `moved from ${originalOrgName} to ${currentJob.organization_name}.`,
    score_delta: weight,
    detected_at: new Date().toISOString(),
    metadata: {
      contact_id: contact.id,
      new_company: currentJob.organization_name,
      new_title: currentJob.title,
      is_senior: isSenior,
      linkedin_url: contact.linkedin_url,
    },
  };
}

/**
 * Detect funding/growth signals from Apollo organization enrichment.
 */
function detectOrganizationSignals(org: ApolloOrganization): DetectedSignal[] {
  const signals: DetectedSignal[] = [];
  const now = new Date();

  // Funding round signal
  if (
    org.latest_funding_round_date &&
    org.latest_funding_stage &&
    MEANINGFUL_FUNDING_STAGES.includes(org.latest_funding_stage)
  ) {
    const fundingDate = new Date(org.latest_funding_round_date);
    const daysSinceFunding = (now.getTime() - fundingDate.getTime()) / (1000 * 60 * 60 * 24);

    // Only flag if funding was within 180 days
    if (daysSinceFunding <= 180) {
      const amount = org.latest_funding_amount_in_dollars;
      const amountStr = amount
        ? amount >= 1_000_000
          ? `$${(amount / 1_000_000).toFixed(1)}M`
          : `$${amount.toLocaleString()}`
        : 'undisclosed amount';

      signals.push({
        type: 'funding_round',
        source: 'apollo',
        description:
          `${org.name} raised ${org.latest_funding_stage} round of ${amountStr} ` +
          `(${Math.round(daysSinceFunding)} days ago).`,
        score_delta: SIGNAL_WEIGHTS.funding_round,
        detected_at: new Date().toISOString(),
        metadata: {
          org_id: org.id,
          funding_stage: org.latest_funding_stage,
          funding_amount_usd: org.latest_funding_amount_in_dollars,
          funding_date: org.latest_funding_round_date,
        },
      });
    }
  }

  return signals;
}

// =============================================================================
// Helper: Write temperature to DB
// =============================================================================

async function writeSignalTemperature(
  supabase: ReturnType<typeof getServiceClient>,
  orgId: string,
  dealId: string,
  signals: DetectedSignal[],
  existingTemperature: number
): Promise<boolean> {
  if (signals.length === 0) return false;

  // Aggregate new temperature: existing + sum of score_deltas, capped at 1.0
  const totalDelta = signals.reduce((sum, s) => sum + s.score_delta, 0);
  const newTemperature = Math.min(existingTemperature + totalDelta, 1.0);

  // Determine trend
  const trend: 'rising' | 'stable' | 'falling' =
    newTemperature > existingTemperature ? 'rising' : 'stable';

  // Format top_signals for DB
  const topSignals = signals
    .sort((a, b) => b.score_delta - a.score_delta)
    .slice(0, 5)
    .map((s) => ({
      type: s.type,
      source: s.source,
      description: s.description,
      score_delta: s.score_delta,
      detected_at: s.detected_at,
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
    console.error(`[apollo-signal] Failed to upsert temperature for deal ${dealId}:`, error.message);
    return false;
  }

  return true;
}

// =============================================================================
// Main Adapter
// =============================================================================

export const apolloSignalAdapter: SkillAdapter = {
  name: 'apollo-signal-scan',

  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[apollo-signal] Starting Apollo signal scan...');

      const supabase = getServiceClient();
      const orgId = state.event.org_id;

      if (!orgId) {
        throw new Error('org_id is required in event payload');
      }

      // 1. Fetch Apollo API key from integration_credentials
      // NOTE: table uses organization_id column, NOT org_id
      const { data: credential, error: credError } = await supabase
        .from('integration_credentials')
        .select('credentials')
        .eq('organization_id', orgId)
        .eq('provider', 'apollo')
        .maybeSingle();

      if (credError || !credential?.credentials) {
        console.warn('[apollo-signal] No Apollo credentials found for org, skipping');
        return {
          success: true,
          output: {
            deals_scanned: 0,
            signals_found: 0,
            apollo_calls_used: 0,
            skipped_reason: 'no_credentials',
          },
          duration_ms: Date.now() - start,
        };
      }

      const apolloApiKey = (credential.credentials as Record<string, string>)?.api_key;
      if (!apolloApiKey) {
        console.warn('[apollo-signal] Apollo credentials missing api_key field');
        return {
          success: true,
          output: {
            deals_scanned: 0,
            signals_found: 0,
            apollo_calls_used: 0,
            skipped_reason: 'missing_api_key',
          },
          duration_ms: Date.now() - start,
        };
      }

      // 2. Get active watchlist deals due for re-engagement check
      const { data: watchlistItems, error: watchlistError } = await supabase
        .rpc('get_deals_due_for_reengagement_check', {
          p_org_id: orgId,
          p_limit: 20,
        });

      if (watchlistError) {
        throw new Error(`Failed to fetch watchlist: ${watchlistError.message}`);
      }

      if (!watchlistItems || watchlistItems.length === 0) {
        console.log('[apollo-signal] No deals due for re-engagement check');
        return {
          success: true,
          output: { deals_scanned: 0, signals_found: 0, apollo_calls_used: 0 },
          duration_ms: Date.now() - start,
        };
      }

      console.log(`[apollo-signal] Processing ${watchlistItems.length} watchlist deals...`);

      let apolloCallsUsed = 0;
      let totalSignalsFound = 0;
      const results: DealScanResult[] = [];

      for (const watchlistItem of watchlistItems) {
        // Enforce rate limit
        if (apolloCallsUsed >= MAX_APOLLO_CALLS_PER_CYCLE) {
          console.warn(
            `[apollo-signal] Hit ${MAX_APOLLO_CALLS_PER_CYCLE} Apollo call limit, stopping early`
          );
          break;
        }

        const dealId = watchlistItem.deal_id;
        const dealSignals: DetectedSignal[] = [];

        console.log(`[apollo-signal] Scanning deal: ${watchlistItem.deal_name} (${dealId})`);

        // 3. Get deal contacts and company domain
        const { data: deal } = await supabase
          .from('deals')
          .select('id, name, company_id, primary_contact_id')
          .eq('id', dealId)
          .maybeSingle();

        if (!deal) {
          console.warn(`[apollo-signal] Deal ${dealId} not found, skipping`);
          continue;
        }

        // 4. Enrich company if domain available
        let companyDomain: string | null = null;
        let companyName: string = '';

        if (deal.company_id) {
          const { data: company } = await supabase
            .from('companies')
            .select('id, name, domain')
            .eq('id', deal.company_id)
            .maybeSingle();

          if (company) {
            companyDomain = company.domain || null;
            companyName = company.name || '';
          }
        }

        // Enrich company via Apollo if we have a domain
        if (companyDomain && apolloCallsUsed < MAX_APOLLO_CALLS_PER_CYCLE) {
          const org = await enrichApolloOrganization(companyDomain, apolloApiKey);
          apolloCallsUsed++;

          if (org) {
            const orgSignals = detectOrganizationSignals(org);
            dealSignals.push(...orgSignals);
          }
        }

        // 5. Enrich primary contact for job-change signals
        const contactIds = watchlistItem.contact_ids || [];
        if (deal.primary_contact_id) {
          contactIds.unshift(deal.primary_contact_id);
        }

        // Deduplicate contact IDs
        const uniqueContactIds = [...new Set(contactIds)].slice(0, 3);

        for (const contactId of uniqueContactIds) {
          if (apolloCallsUsed >= MAX_APOLLO_CALLS_PER_CYCLE) break;

          const { data: contact } = await supabase
            .from('contacts')
            .select('id, email, first_name, last_name')
            .eq('id', contactId)
            .maybeSingle();

          if (!contact?.email) continue;

          const apolloContact = await enrichApolloContact(contact.email, apolloApiKey);
          apolloCallsUsed++;

          if (apolloContact) {
            const jobSignal = detectJobChangeSignal(apolloContact, companyName);
            if (jobSignal) {
              dealSignals.push(jobSignal);
            }
          }
        }

        // 6. Get existing temperature for delta calculation
        const { data: existingTemp } = await supabase
          .from('deal_signal_temperature')
          .select('temperature')
          .eq('deal_id', dealId)
          .maybeSingle();

        const existingTemperature = (existingTemp?.temperature as number) || 0.0;

        // 7. Write temperature to DB
        let temperatureWritten = false;
        if (dealSignals.length > 0) {
          temperatureWritten = await writeSignalTemperature(
            supabase,
            orgId,
            dealId,
            dealSignals,
            existingTemperature
          );

          // Also record in watchlist signal log
          for (const sig of dealSignals) {
            await supabase.rpc('record_reengagement_signal', {
              p_deal_id: dealId,
              p_signal_type: `apollo_${sig.type}`,
              p_signal_description: sig.description,
            }).catch((err: Error) => {
              console.warn(`[apollo-signal] Failed to record signal: ${err.message}`);
            });
          }

          totalSignalsFound += dealSignals.length;
          console.log(
            `[apollo-signal] Found ${dealSignals.length} signals for ${watchlistItem.deal_name} ` +
            `(temp: ${existingTemperature.toFixed(2)} → ` +
            `${Math.min(existingTemperature + dealSignals.reduce((s, d) => s + d.score_delta, 0), 1.0).toFixed(2)})`
          );
        }

        results.push({
          deal_id: dealId,
          deal_name: watchlistItem.deal_name,
          signals: dealSignals,
          apollo_calls_used: apolloCallsUsed,
          temperature_written: temperatureWritten,
        });
      }

      console.log(
        `[apollo-signal] Complete: scanned ${results.length} deals, ` +
        `found ${totalSignalsFound} signals, used ${apolloCallsUsed} Apollo API calls`
      );

      return {
        success: true,
        output: {
          deals_scanned: results.length,
          signals_found: totalSignalsFound,
          apollo_calls_used: apolloCallsUsed,
          results,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      console.error('[apollo-signal] Error:', err);
      return {
        success: false,
        error: String(err),
        duration_ms: Date.now() - start,
      };
    }
  },
};
