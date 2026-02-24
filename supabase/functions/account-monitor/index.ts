import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import { getCorsHeaders, handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts';
import { classifySignal, type SignalClassification } from '../_shared/signalClassifier.ts';

/**
 * account-monitor — Smart Listening core engine.
 *
 * Runs weekly (Monday 6:30am UTC) via cron OR on-demand from the UI.
 *
 * Flow:
 *   1. Auto-add companies from open deals to watchlist (deal_auto)
 *   2. Query due watchlist entries (next_check_at <= now)
 *   3. For each entry: re-enrich via Apollo, diff vs previous snapshot
 *   4. Detect changes → create account_signals
 *   5. Update next_check_at based on monitor_frequency
 *
 * POST body (optional):
 *   { watchlist_id?: string }  — run for a single entry (on-demand refresh)
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APOLLO_API_BASE = 'https://api.apollo.io/api/v1';
const BATCH_SIZE = 50;
const MAX_SNAPSHOTS_PER_ENTRY = 4;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WatchlistEntry {
  id: string;
  org_id: string;
  user_id: string;
  account_type: 'company' | 'contact';
  company_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  source: string;
  monitor_frequency: string;
  enabled_sources: string[];
  custom_research_prompt: string | null;
  companies?: { name: string; domain: string | null } | null;
  contacts?: { first_name: string; last_name: string; email: string | null; title: string | null } | null;
}

interface Snapshot {
  snapshot_data: Record<string, unknown>;
}

interface DiffResult {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

// ---------------------------------------------------------------------------
// Apollo API helpers
// ---------------------------------------------------------------------------

async function getApolloApiKey(supabase: SupabaseClient, orgId: string): Promise<string | null> {
  const { data } = await supabase
    .from('integration_credentials')
    .select('credentials')
    .eq('organization_id', orgId)
    .eq('provider', 'apollo')
    .maybeSingle();

  if (!data?.credentials) return null;
  const creds = typeof data.credentials === 'string' ? JSON.parse(data.credentials) : data.credentials;
  return creds.api_key || null;
}

async function apolloPersonMatch(apiKey: string, contact: {
  first_name: string;
  last_name: string;
  email?: string | null;
}): Promise<Record<string, unknown> | null> {
  const body: Record<string, unknown> = {
    first_name: contact.first_name,
    last_name: contact.last_name,
  };
  if (contact.email) body.email = contact.email;

  const res = await fetch(`${APOLLO_API_BASE}/people/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`[account-monitor] Apollo person match failed: ${res.status}`);
    return null;
  }

  const data = await res.json();
  return data.person ?? null;
}

async function apolloOrgEnrich(apiKey: string, domain: string): Promise<Record<string, unknown> | null> {
  const postRes = await fetch(`${APOLLO_API_BASE}/organizations/enrich`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ domain }),
  });

  if (!postRes.ok) {
    console.error(`[account-monitor] Apollo org enrich failed: ${postRes.status}`);
    return null;
  }

  const data = await postRes.json();
  return data.organization ?? null;
}

// ---------------------------------------------------------------------------
// Snapshot diffing
// ---------------------------------------------------------------------------

const PERSON_WATCH_FIELDS = ['title', 'seniority', 'organization.name', 'organization.primary_domain', 'email', 'city', 'state', 'country'];
const ORG_WATCH_FIELDS = ['estimated_num_employees', 'latest_funding_stage', 'annual_revenue', 'industry', 'technology_names'];

function extractNestedField(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((curr, key) => {
    if (curr == null || typeof curr !== 'object') return null;
    return (curr as Record<string, unknown>)[key];
  }, obj);
}

function diffSnapshots(
  previous: Record<string, unknown> | null,
  current: Record<string, unknown>,
  watchFields: string[]
): DiffResult[] {
  if (!previous) return []; // First snapshot — no diff possible
  const diffs: DiffResult[] = [];

  for (const field of watchFields) {
    const oldVal = extractNestedField(previous, field);
    const newVal = extractNestedField(current, field);

    // Normalize for comparison
    const oldStr = JSON.stringify(oldVal ?? null);
    const newStr = JSON.stringify(newVal ?? null);

    if (oldStr !== newStr && newVal != null) {
      diffs.push({ field, oldValue: oldVal, newValue: newVal });
    }
  }

  return diffs;
}

function diffsToSignalType(diffs: DiffResult[], accountType: 'company' | 'contact'): Array<{
  signalType: string;
  title: string;
  summary: string;
  details: Record<string, unknown>;
  evidence: string;
}> {
  const signals: Array<{
    signalType: string;
    title: string;
    summary: string;
    details: Record<string, unknown>;
    evidence: string;
  }> = [];

  for (const diff of diffs) {
    if (accountType === 'contact') {
      if (diff.field === 'title') {
        signals.push({
          signalType: 'title_change',
          title: `Title changed: ${diff.oldValue ?? 'unknown'} → ${diff.newValue}`,
          summary: `Contact's title changed from "${diff.oldValue ?? 'unknown'}" to "${diff.newValue}"`,
          details: { old_title: diff.oldValue, new_title: diff.newValue },
          evidence: `Apollo person match: title field changed`,
        });
      } else if (diff.field === 'organization.name') {
        signals.push({
          signalType: 'company_change',
          title: `Company changed: ${diff.oldValue ?? 'unknown'} → ${diff.newValue}`,
          summary: `Contact moved from "${diff.oldValue ?? 'unknown'}" to "${diff.newValue}"`,
          details: { old_company: diff.oldValue, new_company: diff.newValue },
          evidence: `Apollo person match: organization.name field changed`,
        });
      } else if (diff.field === 'seniority') {
        signals.push({
          signalType: 'job_change',
          title: `Seniority changed: ${diff.oldValue ?? 'unknown'} → ${diff.newValue}`,
          summary: `Contact's seniority level changed from "${diff.oldValue ?? 'unknown'}" to "${diff.newValue}"`,
          details: { old_seniority: diff.oldValue, new_seniority: diff.newValue },
          evidence: `Apollo person match: seniority field changed`,
        });
      }
    }

    if (accountType === 'company') {
      if (diff.field === 'latest_funding_stage') {
        signals.push({
          signalType: 'funding_event',
          title: `Funding stage changed: ${diff.oldValue ?? 'unknown'} → ${diff.newValue}`,
          summary: `Company's funding stage updated from "${diff.oldValue ?? 'unknown'}" to "${diff.newValue}"`,
          details: { old_stage: diff.oldValue, new_stage: diff.newValue },
          evidence: `Apollo org enrich: latest_funding_stage field changed`,
        });
      } else if (diff.field === 'estimated_num_employees') {
        const oldCount = Number(diff.oldValue) || 0;
        const newCount = Number(diff.newValue) || 0;
        const pctChange = oldCount > 0 ? ((newCount - oldCount) / oldCount) * 100 : 0;
        if (Math.abs(pctChange) >= 10) {
          signals.push({
            signalType: 'hiring_surge',
            title: `Headcount ${pctChange > 0 ? 'grew' : 'shrank'} ${Math.abs(Math.round(pctChange))}%`,
            summary: `Employee count changed from ${oldCount} to ${newCount} (${pctChange > 0 ? '+' : ''}${Math.round(pctChange)}%)`,
            details: { old_count: oldCount, new_count: newCount, pct_change: Math.round(pctChange) },
            evidence: `Apollo org enrich: estimated_num_employees changed significantly`,
          });
        }
      } else if (diff.field === 'technology_names') {
        signals.push({
          signalType: 'tech_stack_change',
          title: `Tech stack updated`,
          summary: `Company's technology stack has changed`,
          details: { old_tech: diff.oldValue, new_tech: diff.newValue },
          evidence: `Apollo org enrich: technology_names field changed`,
        });
      } else if (diff.field === 'industry') {
        signals.push({
          signalType: 'company_news',
          title: `Industry reclassified: ${diff.oldValue} → ${diff.newValue}`,
          summary: `Company's industry classification changed`,
          details: { old_industry: diff.oldValue, new_industry: diff.newValue },
          evidence: `Apollo org enrich: industry field changed`,
        });
      }
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Next check calculation
// ---------------------------------------------------------------------------

function calculateNextCheckAt(frequency: string): string {
  const now = new Date();

  if (frequency === 'daily') {
    const next = new Date(now);
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(7, 0, 0, 0);
    return next.toISOString();
  }

  if (frequency === 'twice_weekly') {
    const dayOfWeek = now.getUTCDay();
    const next = new Date(now);
    // Next Monday (1) or Thursday (4)
    if (dayOfWeek < 1) next.setUTCDate(next.getUTCDate() + (1 - dayOfWeek));
    else if (dayOfWeek < 4) next.setUTCDate(next.getUTCDate() + (4 - dayOfWeek));
    else next.setUTCDate(next.getUTCDate() + (8 - dayOfWeek)); // Next Monday
    next.setUTCHours(7, 0, 0, 0);
    return next.toISOString();
  }

  // Default: weekly (next Monday)
  const next = new Date(now);
  const dayOfWeek = now.getUTCDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  next.setUTCDate(next.getUTCDate() + daysUntilMonday);
  next.setUTCHours(7, 0, 0, 0);
  return next.toISOString();
}

// ---------------------------------------------------------------------------
// Perplexity web intelligence (SL-006)
// ---------------------------------------------------------------------------

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';
const PERPLEXITY_MODEL = 'llama-3.1-sonar-large-128k-online';

interface WebSignal {
  signalType: string;
  title: string;
  summary: string;
  details: Record<string, unknown>;
  evidence: string;
  rawResponse: string;
}

async function fetchWebIntelligence(
  apiKey: string,
  companyName: string,
  domain: string,
  watchlistId: string,
  supabase: SupabaseClient,
): Promise<WebSignal[]> {
  const prompt = `What are the latest developments at ${companyName}${domain ? ` (${domain})` : ''} in the past 7 days?
Focus on: funding announcements, leadership changes, product launches, partnerships, acquisitions, layoffs, or major news.
Return ONLY factual, verifiable information with dates.
If nothing notable, respond with exactly: "No significant developments."

Format each finding as:
- [TYPE] Title: description

Where TYPE is one of: FUNDING, LEADERSHIP, PRODUCT, PARTNERSHIP, ACQUISITION, LAYOFF, NEWS`;

  const res = await fetch(PERPLEXITY_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: PERPLEXITY_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
    }),
  });

  if (!res.ok) {
    console.error(`[account-monitor] Perplexity API error: ${res.status}`);
    return [];
  }

  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content ?? '';

  if (!content || content.includes('No significant developments')) {
    return [];
  }

  // Check for duplicates against previous web_intel snapshot
  const { data: prevSnapshots } = await supabase
    .from('account_signal_snapshots')
    .select('snapshot_data')
    .eq('watchlist_id', watchlistId)
    .eq('snapshot_type', 'web_intel')
    .order('created_at', { ascending: false })
    .limit(1);

  const prevContent = (prevSnapshots?.[0] as Snapshot | undefined)?.snapshot_data?.content as string | undefined;

  // Store new snapshot
  await supabase
    .from('account_signal_snapshots')
    .insert({
      watchlist_id: watchlistId,
      snapshot_type: 'web_intel',
      snapshot_data: { content, fetched_at: new Date().toISOString() },
    });

  // Parse structured signals from response
  const signals: WebSignal[] = [];
  const typeMap: Record<string, string> = {
    FUNDING: 'funding_event',
    LEADERSHIP: 'job_change',
    PRODUCT: 'company_news',
    PARTNERSHIP: 'company_news',
    ACQUISITION: 'company_news',
    LAYOFF: 'hiring_surge',
    NEWS: 'company_news',
  };

  const lines = content.split('\n').filter(l => l.trim().startsWith('-'));

  for (const line of lines) {
    const match = line.match(/\[(\w+)\]\s*(.+?):\s*(.+)/);
    if (!match) continue;

    const [, rawType, title, description] = match;
    const signalType = typeMap[rawType.toUpperCase()] || 'company_news';

    // Simple dedup: skip if title appears in previous snapshot
    if (prevContent && prevContent.includes(title.trim())) continue;

    signals.push({
      signalType,
      title: title.trim(),
      summary: description.trim(),
      details: { type_tag: rawType, raw_line: line.trim() },
      evidence: `Perplexity web intelligence: ${rawType}`,
      rawResponse: content,
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Custom AI research prompts (SL-007)
// ---------------------------------------------------------------------------

async function executeCustomPrompt(
  apiKey: string,
  companyName: string,
  domain: string,
  userPrompt: string,
): Promise<{ summary: string; rawResponse: string } | null> {
  const prompt = `Context: ${companyName}${domain ? ` (${domain})` : ''}

Research prompt: ${userPrompt}

Provide concise, factual findings. If nothing found, respond with exactly: "No findings."`;

  const res = await fetch(PERPLEXITY_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: PERPLEXITY_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
    }),
  });

  if (!res.ok) {
    console.error(`[account-monitor] Perplexity custom prompt error: ${res.status}`);
    return null;
  }

  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content ?? '';

  if (!content || content.includes('No findings')) {
    return null;
  }

  return { summary: content.trim(), rawResponse: content };
}

// ---------------------------------------------------------------------------
// Auto-add companies from open deals (SL-004)
// ---------------------------------------------------------------------------

async function autoAddFromDeals(supabase: SupabaseClient, orgId: string): Promise<number> {
  // Get all open deals with a company_id
  const { data: deals, error: dealsError } = await supabase
    .from('deals')
    .select('id, company_id, owner_id')
    .eq('organization_id', orgId)
    .not('company_id', 'is', null)
    .not('stage', 'in', '("won","lost","closed_won","closed_lost")');

  if (dealsError || !deals?.length) return 0;

  let added = 0;

  for (const deal of deals) {
    if (!deal.company_id || !deal.owner_id) continue;

    // Upsert: if already exists, skip (ON CONFLICT do nothing)
    const { error } = await supabase
      .from('account_watchlist')
      .upsert({
        org_id: orgId,
        user_id: deal.owner_id,
        account_type: 'company',
        company_id: deal.company_id,
        deal_id: deal.id,
        source: 'deal_auto',
        monitor_frequency: 'weekly',
        monitor_day: 'monday',
        enabled_sources: ['apollo'],
        is_active: true,
        next_check_at: calculateNextCheckAt('weekly'),
      }, {
        onConflict: 'org_id,user_id,company_id',
        ignoreDuplicates: true,
      });

    if (!error) added++;
  }

  // Deactivate deal_auto entries for closed deals
  const { data: closedDealWatchlist } = await supabase
    .from('account_watchlist')
    .select('id, deal_id')
    .eq('org_id', orgId)
    .eq('source', 'deal_auto')
    .eq('is_active', true);

  if (closedDealWatchlist) {
    for (const entry of closedDealWatchlist) {
      if (!entry.deal_id) continue;
      const { data: deal } = await supabase
        .from('deals')
        .select('stage')
        .eq('id', entry.deal_id)
        .maybeSingle();

      if (deal && ['won', 'lost', 'closed_won', 'closed_lost'].includes(deal.stage ?? '')) {
        await supabase
          .from('account_watchlist')
          .update({ is_active: false })
          .eq('id', entry.id);
      }
    }
  }

  return added;
}

// ---------------------------------------------------------------------------
// Process a single watchlist entry
// ---------------------------------------------------------------------------

async function processEntry(
  supabase: SupabaseClient,
  entry: WatchlistEntry,
  apolloApiKey: string | null
): Promise<{ signals: number; skipped: boolean }> {
  if (!apolloApiKey && entry.enabled_sources.includes('apollo')) {
    console.log(`[account-monitor] Skipping ${entry.id}: no Apollo API key`);
    return { signals: 0, skipped: true };
  }

  let signalsCreated = 0;
  const snapshotType = entry.account_type === 'contact' ? 'apollo_person' : 'apollo_org';

  // --- Source: Apollo re-enrichment + diff ---
  if (entry.enabled_sources.includes('apollo') && apolloApiKey) {
    // Fetch previous snapshot
    const { data: prevSnapshots } = await supabase
      .from('account_signal_snapshots')
      .select('snapshot_data')
      .eq('watchlist_id', entry.id)
      .eq('snapshot_type', snapshotType)
      .order('created_at', { ascending: false })
      .limit(1);

    const previousSnapshot = (prevSnapshots?.[0] as Snapshot | undefined)?.snapshot_data ?? null;

    // Re-enrich via Apollo
    let currentData: Record<string, unknown> | null = null;

    if (entry.account_type === 'contact' && entry.contacts) {
      currentData = await apolloPersonMatch(apolloApiKey, {
        first_name: entry.contacts.first_name,
        last_name: entry.contacts.last_name,
        email: entry.contacts.email,
      });
    } else if (entry.account_type === 'company' && entry.companies?.domain) {
      currentData = await apolloOrgEnrich(apolloApiKey, entry.companies.domain);
    }

    if (!currentData) {
      console.log(`[account-monitor] No Apollo data for ${entry.id}`);
      return { signals: 0, skipped: true };
    }

    // Store new snapshot
    await supabase
      .from('account_signal_snapshots')
      .insert({
        watchlist_id: entry.id,
        snapshot_type: snapshotType,
        snapshot_data: currentData,
      });

    // Prune old snapshots (keep last MAX_SNAPSHOTS_PER_ENTRY)
    const { data: allSnapshots } = await supabase
      .from('account_signal_snapshots')
      .select('id')
      .eq('watchlist_id', entry.id)
      .eq('snapshot_type', snapshotType)
      .order('created_at', { ascending: false });

    if (allSnapshots && allSnapshots.length > MAX_SNAPSHOTS_PER_ENTRY) {
      const idsToDelete = allSnapshots.slice(MAX_SNAPSHOTS_PER_ENTRY).map(s => s.id);
      await supabase
        .from('account_signal_snapshots')
        .delete()
        .in('id', idsToDelete);
    }

    // Diff against previous snapshot
    const watchFields = entry.account_type === 'contact' ? PERSON_WATCH_FIELDS : ORG_WATCH_FIELDS;
    const diffs = diffSnapshots(previousSnapshot as Record<string, unknown> | null, currentData, watchFields);

    if (diffs.length > 0) {
      const rawSignals = diffsToSignalType(diffs, entry.account_type);

      for (const rawSignal of rawSignals) {
        // Classify and score the signal
        const classification = classifySignal({
          signalType: rawSignal.signalType,
          details: rawSignal.details,
          hasOpenDeal: !!entry.deal_id,
          accountType: entry.account_type,
        });

        await supabase
          .from('account_signals')
          .insert({
            org_id: entry.org_id,
            watchlist_id: entry.id,
            signal_type: rawSignal.signalType,
            severity: classification.severity,
            relevance_score: classification.relevanceScore,
            title: rawSignal.title,
            summary: rawSignal.summary,
            details: rawSignal.details,
            evidence: rawSignal.evidence,
            recommended_action: classification.recommendedAction,
            source: 'apollo_diff',
            source_data: { apollo_response: currentData },
          });

        signalsCreated++;
      }
    }
  }

  // --- Source: Perplexity web intelligence (SL-006) ---
  if (entry.enabled_sources.includes('web_intel')) {
    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (perplexityKey) {
      const companyName = entry.companies?.name || `${entry.contacts?.first_name ?? ''} ${entry.contacts?.last_name ?? ''}`.trim();
      const domain = entry.companies?.domain || '';

      try {
        const webSignals = await fetchWebIntelligence(perplexityKey, companyName, domain, entry.id, supabase);

        for (const webSignal of webSignals) {
          const classification = classifySignal({
            signalType: webSignal.signalType,
            details: webSignal.details,
            hasOpenDeal: !!entry.deal_id,
            accountType: entry.account_type,
          });

          await supabase
            .from('account_signals')
            .insert({
              org_id: entry.org_id,
              watchlist_id: entry.id,
              signal_type: webSignal.signalType,
              severity: classification.severity,
              relevance_score: classification.relevanceScore,
              title: webSignal.title,
              summary: webSignal.summary,
              details: webSignal.details,
              evidence: webSignal.evidence,
              recommended_action: classification.recommendedAction,
              source: 'web_intel',
              source_data: { perplexity_response: webSignal.rawResponse },
            });

          signalsCreated++;
        }
      } catch (err) {
        console.error(`[account-monitor] Web intel error for ${entry.id}:`, err);
      }
    }
  }

  // --- Source: Custom AI research prompts (SL-007) ---
  if (entry.enabled_sources.includes('custom_prompt') && entry.custom_research_prompt) {
    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (perplexityKey) {
      const companyName = entry.companies?.name || `${entry.contacts?.first_name ?? ''} ${entry.contacts?.last_name ?? ''}`.trim();
      const domain = entry.companies?.domain || '';

      try {
        const result = await executeCustomPrompt(perplexityKey, companyName, domain, entry.custom_research_prompt);

        if (result) {
          const classification = classifySignal({
            signalType: 'custom_research_result',
            details: { prompt: entry.custom_research_prompt, response: result.summary },
            hasOpenDeal: !!entry.deal_id,
            accountType: entry.account_type,
          });

          await supabase
            .from('account_signals')
            .insert({
              org_id: entry.org_id,
              watchlist_id: entry.id,
              signal_type: 'custom_research_result',
              severity: classification.severity,
              relevance_score: classification.relevanceScore,
              title: `Research: ${entry.custom_research_prompt.slice(0, 80)}`,
              summary: result.summary,
              details: { prompt: entry.custom_research_prompt, findings: result.summary },
              evidence: `Custom research prompt executed via Perplexity`,
              recommended_action: classification.recommendedAction,
              source: 'custom_prompt',
              source_data: { perplexity_response: result.rawResponse },
            });

          signalsCreated++;
        }
      } catch (err) {
        console.error(`[account-monitor] Custom prompt error for ${entry.id}:`, err);
      }
    }
  }

  // Update watchlist entry timestamps
  await supabase
    .from('account_watchlist')
    .update({
      last_checked_at: new Date().toISOString(),
      next_check_at: calculateNextCheckAt(entry.monitor_frequency),
    })
    .eq('id', entry.id);

  return { signals: signalsCreated, skipped: false };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    // SECURITY: Fail-closed authentication
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');
    const isCronAuth = verifyCronSecret(req, cronSecret);
    const isServiceRole = isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY);

    // Also allow user-scoped calls for on-demand refresh
    let isUserAuth = false;
    let userOrgId: string | null = null;

    if (!isCronAuth && !isServiceRole) {
      // Try user auth for on-demand refresh
      const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: authHeader ?? '' } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        isUserAuth = true;
        const { data: membership } = await userClient
          .from('organization_memberships')
          .select('org_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();
        userOrgId = membership?.org_id ?? null;
      }
    }

    if (!isCronAuth && !isServiceRole && !isUserAuth) {
      return errorResponse('Unauthorized', req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Parse optional body
    let body: { watchlist_id?: string } = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }

    const summary = {
      accounts_checked: 0,
      signals_detected: 0,
      accounts_skipped: 0,
      deal_auto_added: 0,
      orgs_processed: 0,
    };

    // If on-demand refresh for a single entry
    if (body.watchlist_id) {
      const { data: entry } = await supabase
        .from('account_watchlist')
        .select(`
          id, org_id, user_id, account_type, company_id, contact_id, deal_id,
          source, monitor_frequency, enabled_sources, custom_research_prompt,
          companies:company_id (name, domain),
          contacts:contact_id (first_name, last_name, email, title)
        `)
        .eq('id', body.watchlist_id)
        .maybeSingle();

      if (!entry) return errorResponse('Watchlist entry not found', req, 404);

      // Security: if user auth, verify they own this entry
      if (isUserAuth && userOrgId && entry.org_id !== userOrgId) {
        return errorResponse('Unauthorized', req, 403);
      }

      const apiKey = await getApolloApiKey(supabase, entry.org_id);
      const result = await processEntry(supabase, entry as WatchlistEntry, apiKey);
      summary.accounts_checked = 1;
      summary.signals_detected = result.signals;
      if (result.skipped) summary.accounts_skipped = 1;

      return jsonResponse(summary, req);
    }

    // Cron mode: process all orgs
    // Get all orgs that have active watchlist entries due for checking
    const { data: dueEntries } = await supabase
      .from('account_watchlist')
      .select(`
        id, org_id, user_id, account_type, company_id, contact_id, deal_id,
        source, monitor_frequency, enabled_sources, custom_research_prompt,
        companies:company_id (name, domain),
        contacts:contact_id (first_name, last_name, email, title)
      `)
      .eq('is_active', true)
      .lte('next_check_at', new Date().toISOString())
      .order('source', { ascending: true }) // manual first, then deal_auto
      .limit(BATCH_SIZE);

    if (!dueEntries?.length) {
      // Still run deal auto-add even if no entries are due
      const { data: orgs } = await supabase
        .from('account_watchlist')
        .select('org_id')
        .eq('is_active', true)
        .limit(100);

      const uniqueOrgs = [...new Set((orgs ?? []).map(o => o.org_id))];
      for (const orgId of uniqueOrgs) {
        const added = await autoAddFromDeals(supabase, orgId);
        summary.deal_auto_added += added;
      }

      return jsonResponse({ ...summary, message: 'No entries due for checking' }, req);
    }

    // Group by org for efficient API key lookup
    const orgIds = [...new Set(dueEntries.map(e => e.org_id))];
    const apiKeyCache: Record<string, string | null> = {};

    for (const orgId of orgIds) {
      apiKeyCache[orgId] = await getApolloApiKey(supabase, orgId);
      // Auto-add from deals for this org
      const added = await autoAddFromDeals(supabase, orgId);
      summary.deal_auto_added += added;
      summary.orgs_processed++;
    }

    // Process each due entry sequentially (respect Apollo rate limits)
    for (const entry of dueEntries) {
      try {
        const result = await processEntry(
          supabase,
          entry as WatchlistEntry,
          apiKeyCache[entry.org_id]
        );
        summary.accounts_checked++;
        summary.signals_detected += result.signals;
        if (result.skipped) summary.accounts_skipped++;
      } catch (err) {
        console.error(`[account-monitor] Error processing ${entry.id}:`, err);
        summary.accounts_skipped++;
      }
    }

    console.log(`[account-monitor] Complete:`, summary);
    return jsonResponse(summary, req);

  } catch (error) {
    console.error('[account-monitor] Fatal error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      req,
      500
    );
  }
});
