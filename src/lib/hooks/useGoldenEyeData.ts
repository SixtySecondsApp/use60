/**
 * useGoldenEyeData — Polling hook for GoldenEye admin visualization
 *
 * Fetches active users (AI request in last 5 min), recent cost events,
 * LLM endpoints, and anomaly rules on a configurable interval.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import type { AIModel } from '@/lib/types/aiModels';

// ─── Types ──────────────────────────────────────────────────────────────

export interface ActiveUser {
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  org_name: string | null;
  request_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  last_request_at: string;
  /** True if user had activity in the last 5 minutes */
  is_active: boolean;
  /** Estimated total cost in GBP (USD × 0.79) */
  total_cost_gbp: number;
  /** Total credits purchased on use60 (org-level) */
  credits_bought: number;
}

export interface RecentEvent {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  provider: string;
  model: string;
  feature: string | null;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  created_at: string;
  client_ip: string | null;
  is_flagged?: boolean;
  flag_reason?: string;
  flag_severity?: string;
}

export interface LLMEndpoint {
  id: string;
  provider: string;
  model_id: string;
  display_name: string;
  input_cost_per_million: number;
  output_cost_per_million: number;
  is_available: boolean;
  active_request_count: number;
}

export interface AnomalyRule {
  id: string;
  rule_name: string;
  rule_type: 'per_request_max' | 'rate_spike' | 'budget_percent';
  description: string | null;
  threshold_value: number;
  time_window_minutes: number | null;
  severity: 'info' | 'warning' | 'critical';
  is_enabled: boolean;
}

export interface UsageBucket {
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

export interface UsageTotals {
  all_time: UsageBucket;
  last_30d: UsageBucket;
  last_7d: UsageBucket;
  last_24h: UsageBucket;
}

export interface ModelBreakdownEntry {
  model: string;
  input_tokens: number;
  output_tokens: number;
}

export interface GoldenEyeData {
  activeUsers: ActiveUser[];
  recentEvents: RecentEvent[];
  llmEndpoints: LLMEndpoint[];
  anomalyRules: AnomalyRule[];
  usageTotals: UsageTotals;
  modelBreakdown: ModelBreakdownEntry[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refetch: () => Promise<void>;
}

// ─── Helper: apply anomaly rules to events ──────────────────────────────

function applyAnomalyRules(events: RecentEvent[], rules: AnomalyRule[]): RecentEvent[] {
  const enabledRules = rules.filter(r => r.is_enabled);

  return events.map(event => {
    const totalTokens = event.input_tokens + event.output_tokens;

    for (const rule of enabledRules) {
      if (rule.rule_type === 'per_request_max' && totalTokens > rule.threshold_value) {
        return {
          ...event,
          is_flagged: true,
          flag_reason: rule.rule_name,
          flag_severity: rule.severity,
        };
      }
    }

    return event;
  });
}

// ─── Hook ───────────────────────────────────────────────────────────────

/**
 * @param pollIntervalMs — Controls the lightweight event poll (default 5s).
 *   Pass 0 to disable all polling (paused / seed-data mode).
 *   The heavy full refresh (users, totals, models, rules) runs at 6× this
 *   interval (default 30s) so it doesn't hammer the DB.
 */
export function useGoldenEyeData(pollIntervalMs = 5_000): GoldenEyeData {
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [llmEndpoints, setLlmEndpoints] = useState<LLMEndpoint[]>([]);
  const [anomalyRules, setAnomalyRules] = useState<AnomalyRule[]>([]);
  const [usageTotals, setUsageTotals] = useState<UsageTotals>({
    all_time: { tokensIn: 0, tokensOut: 0, cost: 0 },
    last_30d: { tokensIn: 0, tokensOut: 0, cost: 0 },
    last_7d: { tokensIn: 0, tokensOut: 0, cost: 0 },
    last_24h: { tokensIn: 0, tokensOut: 0, cost: 0 },
  });
  const [modelBreakdown, setModelBreakdown] = useState<ModelBreakdownEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const eventPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fullPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestEventTimeRef = useRef<string | null>(null);
  const rulesRef = useRef<AnomalyRule[]>([]);
  const isPageVisibleRef = useRef(true);

  const fetchFullData = useCallback(async () => {
    let userMapRef: Map<string, ActiveUser> | null = null;
    try {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const userHistoryWindow = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Fetch all data in parallel
      const [
        activeUsersResult,
        recentEventsResult,
        modelsResult,
        rulesResult,
        totalsAllTime,
        totals30d,
        totals7d,
        totals24h,
      ] = await Promise.all([
        // Users with AI requests in last 7 days (history log)
        supabase
          .from('ai_cost_events')
          .select('user_id, created_at, input_tokens, output_tokens')
          .gte('created_at', userHistoryWindow)
          .order('created_at', { ascending: false }),

        // Recent events for visualization (last 200 events)
        supabase
          .from('ai_cost_events')
          .select('id, user_id, provider, model, feature, input_tokens, output_tokens, estimated_cost, created_at, client_ip')
          .order('created_at', { ascending: false })
          .limit(200),

        // Available LLM models
        supabase
          .from('ai_models')
          .select('id, provider, model_id, display_name, input_cost_per_million, output_cost_per_million, is_available')
          .eq('is_available', true)
          .eq('is_deprecated', false)
          .order('provider'),

        // Anomaly rules
        supabase
          .from('token_anomaly_rules')
          .select('id, rule_name, rule_type, description, threshold_value, time_window_minutes, severity, is_enabled')
          .order('severity'),

        // Usage totals: all time (model needed for client-side cost calc)
        supabase
          .from('ai_cost_events')
          .select('model, input_tokens, output_tokens')
          .limit(100000),

        // Usage totals: last 30 days
        supabase
          .from('ai_cost_events')
          .select('model, input_tokens, output_tokens')
          .gte('created_at', thirtyDaysAgo)
          .limit(100000),

        // Usage totals: last 7 days
        supabase
          .from('ai_cost_events')
          .select('model, input_tokens, output_tokens')
          .gte('created_at', sevenDaysAgo)
          .limit(100000),

        // Usage totals: last 24 hours
        supabase
          .from('ai_cost_events')
          .select('model, input_tokens, output_tokens')
          .gte('created_at', twentyFourHoursAgo)
          .limit(100000),
      ]);

      // Process users — aggregate by user_id, mark active (last 5 min) vs historical
      if (activeUsersResult.data) {
        const userMap = new Map<string, ActiveUser>();
        for (const row of activeUsersResult.data) {
          const existing = userMap.get(row.user_id);
          if (existing) {
            existing.request_count++;
            existing.total_input_tokens += row.input_tokens || 0;
            existing.total_output_tokens += row.output_tokens || 0;
            if (row.created_at > existing.last_request_at) {
              existing.last_request_at = row.created_at;
            }
          } else {
            userMap.set(row.user_id, {
              user_id: row.user_id,
              user_email: null,
              user_name: null,
              org_name: null,
              request_count: 1,
              total_input_tokens: row.input_tokens || 0,
              total_output_tokens: row.output_tokens || 0,
              last_request_at: row.created_at,
              is_active: false, // Set below after aggregation
              total_cost_gbp: 0, // Computed after model rates are available
              credits_bought: 0, // Populated from org_credit_balance
            });
          }
        }

        // Mark users active if their last request was within 5 minutes
        for (const user of userMap.values()) {
          user.is_active = user.last_request_at >= fiveMinAgo;
        }

        // Enrich with profile data + org name
        const userIds = Array.from(userMap.keys());
        if (userIds.length > 0) {
          const [profilesResult, membershipsResult] = await Promise.all([
            supabase
              .from('profiles')
              .select('id, email, first_name, last_name')
              .in('id', userIds),
            supabase
              .from('organization_memberships')
              .select('user_id, org_id, organizations(name)')
              .in('user_id', userIds),
          ]);

          if (profilesResult.data) {
            for (const profile of profilesResult.data) {
              const user = userMap.get(profile.id);
              if (user) {
                user.user_email = profile.email;
                user.user_name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null;
              }
            }
          }

          if (membershipsResult.data) {
            // Build org_id map per user for credit lookup
            const userOrgMap = new Map<string, string>();
            for (const membership of membershipsResult.data) {
              const user = userMap.get(membership.user_id);
              if (user && !user.org_name) {
                const org = membership.organizations as { name: string } | null;
                if (org?.name) user.org_name = org.name;
              }
              if (!userOrgMap.has(membership.user_id)) {
                userOrgMap.set(membership.user_id, membership.org_id);
              }
            }

            // Fetch org credit balances for credits_bought
            const orgIds = Array.from(new Set(Array.from(userOrgMap.values())));
            if (orgIds.length > 0) {
              const { data: creditRows } = await supabase
                .from('org_credit_balance')
                .select('org_id, lifetime_purchased')
                .in('org_id', orgIds);

              if (creditRows) {
                const creditMap = new Map(creditRows.map(r => [r.org_id, r.lifetime_purchased || 0]));
                for (const [userId, orgId] of Array.from(userOrgMap.entries())) {
                  const user = userMap.get(userId);
                  if (user) {
                    user.credits_bought = creditMap.get(orgId) || 0;
                  }
                }
              }
            }
          }
        }

        // Defer setting users — cost is computed after model rates are available
        // (stored in userMapRef for later)
        userMapRef = userMap;
      }

      // Process anomaly rules
      const rules = (rulesResult.data || []) as AnomalyRule[];
      setAnomalyRules(rules);
      rulesRef.current = rules;

      // Process recent events with flagging
      if (recentEventsResult.data) {
        const events: RecentEvent[] = recentEventsResult.data.map(e => ({
          ...e,
          user_email: null,
          user_name: null,
          client_ip: (e as any).client_ip ?? null,
        }));

        // Enrich events with user names
        const eventUserIds = [...new Set(events.map(e => e.user_id).filter(Boolean))];
        if (eventUserIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, email, first_name, last_name')
            .in('id', eventUserIds);

          if (profiles) {
            const profileMap = new Map(profiles.map(p => [p.id, p]));
            for (const event of events) {
              const profile = profileMap.get(event.user_id);
              if (profile) {
                event.user_email = profile.email;
                event.user_name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null;
              }
            }
          }
        }

        const flaggedEvents = applyAnomalyRules(events, rules);
        setRecentEvents(flaggedEvents);

        // Track the latest event timestamp for incremental polling
        if (flaggedEvents.length > 0) {
          latestEventTimeRef.current = flaggedEvents[0].created_at;
        }
      }

      // Process LLM endpoints with active request counts
      if (modelsResult.data) {
        // Build a map from event model strings → canonical model_id
        // Events may log short names (e.g. "claude-haiku-4-5") while ai_models
        // stores full IDs (e.g. "claude-haiku-4-5-20251001"). Match by prefix.
        const canonicalIds = (modelsResult.data as AIModel[]).map(m => m.model_id);
        const resolveModelId = (eventModel: string): string => {
          // Exact match first
          if (canonicalIds.includes(eventModel)) return eventModel;
          // Prefix match: event model is a prefix of the canonical ID
          const match = canonicalIds.find(c => c.startsWith(eventModel));
          return match || eventModel;
        };

        const recentByModel = new Map<string, number>();
        if (recentEventsResult.data) {
          for (const event of recentEventsResult.data) {
            const key = resolveModelId(event.model);
            recentByModel.set(key, (recentByModel.get(key) || 0) + 1);
          }
        }

        setLlmEndpoints(modelsResult.data.map((m: AIModel) => ({
          id: m.id,
          provider: m.provider,
          model_id: m.model_id,
          display_name: m.display_name,
          input_cost_per_million: m.input_cost_per_million,
          output_cost_per_million: m.output_cost_per_million,
          is_available: m.is_available,
          active_request_count: recentByModel.get(m.model_id) || 0,
        })));
      }

      // Build model rate map for client-side cost calculation (same as ActivityLogTerminal)
      const modelRates = new Map<string, { inputRate: number; outputRate: number }>();
      if (modelsResult.data) {
        for (const m of modelsResult.data as AIModel[]) {
          modelRates.set(m.model_id, {
            inputRate: m.input_cost_per_million || 0,
            outputRate: m.output_cost_per_million || 0,
          });
        }
      }

      // Resolve event model string to canonical model_id (handles prefix mismatches)
      const resolveRate = (eventModel: string) => {
        const exact = modelRates.get(eventModel);
        if (exact) return exact;
        for (const [key, val] of Array.from(modelRates.entries())) {
          if (key.startsWith(eventModel)) return val;
        }
        return undefined;
      };

      // Process usage totals — cost derived from tokens × model rates (USD)
      const sumTokensAndCost = (data: Array<{ model: string; input_tokens: number; output_tokens: number }> | null): UsageBucket => {
        if (!data) return { tokensIn: 0, tokensOut: 0, cost: 0 };
        return data.reduce(
          (acc, row) => {
            const inT = row.input_tokens || 0;
            const outT = row.output_tokens || 0;
            const rates = resolveRate(row.model);
            const usd = rates
              ? (inT * rates.inputRate + outT * rates.outputRate) / 1_000_000
              : 0;
            return {
              tokensIn: acc.tokensIn + inT,
              tokensOut: acc.tokensOut + outT,
              cost: acc.cost + usd,
            };
          },
          { tokensIn: 0, tokensOut: 0, cost: 0 }
        );
      };

      const allTimeBucket = sumTokensAndCost(totalsAllTime.data);
      setUsageTotals({
        all_time: allTimeBucket,
        last_30d: sumTokensAndCost(totals30d.data),
        last_7d: sumTokensAndCost(totals7d.data),
        last_24h: sumTokensAndCost(totals24h.data),
      });

      // Aggregate per-model token breakdown (top 6 + "Other")
      if (totalsAllTime.data) {
        const modelMap = new Map<string, { input_tokens: number; output_tokens: number }>();
        for (const row of totalsAllTime.data) {
          const key = row.model || 'unknown';
          const existing = modelMap.get(key) ?? { input_tokens: 0, output_tokens: 0 };
          modelMap.set(key, {
            input_tokens: existing.input_tokens + (row.input_tokens || 0),
            output_tokens: existing.output_tokens + (row.output_tokens || 0),
          });
        }
        const sorted = Array.from(modelMap.entries())
          .map(([model, tokens]) => ({ model, ...tokens }))
          .sort((a, b) => (b.input_tokens + b.output_tokens) - (a.input_tokens + a.output_tokens));

        if (sorted.length > 6) {
          const top6 = sorted.slice(0, 6);
          const other = sorted.slice(6).reduce(
            (acc, e) => ({
              model: 'Other',
              input_tokens: acc.input_tokens + e.input_tokens,
              output_tokens: acc.output_tokens + e.output_tokens,
            }),
            { model: 'Other', input_tokens: 0, output_tokens: 0 }
          );
          setModelBreakdown([...top6, other]);
        } else {
          setModelBreakdown(sorted);
        }
      }

      // Compute per-user GBP cost using blended rate from all-time totals
      const USD_TO_GBP = 0.79;
      if (userMapRef) {
        const totalTokensAllTime = allTimeBucket.tokensIn + allTimeBucket.tokensOut;
        // Blended rate: USD per token across all models
        const blendedRatePerToken = totalTokensAllTime > 0
          ? allTimeBucket.cost / totalTokensAllTime
          : 0;

        for (const user of userMapRef.values()) {
          const userTotalTokens = user.total_input_tokens + user.total_output_tokens;
          user.total_cost_gbp = Math.round(userTotalTokens * blendedRatePerToken * USD_TO_GBP * 100) / 100;
        }

        // Sort: active users first, then by most recent activity
        const sortedUsers = Array.from(userMapRef.values()).sort((a, b) => {
          if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
          return new Date(b.last_request_at).getTime() - new Date(a.last_request_at).getTime();
        });

        setActiveUsers(sortedUsers);
      }

      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('GoldenEye fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Lightweight poll: only fetch events newer than the latest we already have
  const fetchNewEvents = useCallback(async () => {
    if (!latestEventTimeRef.current || !isPageVisibleRef.current) return;

    try {
      const { data: newRows } = await supabase
        .from('ai_cost_events')
        .select('id, user_id, provider, model, feature, input_tokens, output_tokens, estimated_cost, created_at, client_ip')
        .gt('created_at', latestEventTimeRef.current)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!newRows || newRows.length === 0) return;

      // Enrich with profile data
      const newEvents: RecentEvent[] = newRows.map(e => ({
        ...e,
        user_email: null,
        user_name: null,
      }));

      const eventUserIds = [...new Set(newEvents.map(e => e.user_id).filter(Boolean))];
      if (eventUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, first_name, last_name')
          .in('id', eventUserIds);

        if (profiles) {
          const profileMap = new Map(profiles.map(p => [p.id, p]));
          for (const event of newEvents) {
            const profile = profileMap.get(event.user_id);
            if (profile) {
              event.user_email = profile.email;
              event.user_name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null;
            }
          }
        }
      }

      const flaggedNew = applyAnomalyRules(newEvents, rulesRef.current);

      // Update the latest timestamp
      latestEventTimeRef.current = flaggedNew[0].created_at;

      // Prepend new events, keep max 200
      setRecentEvents(prev => [...flaggedNew, ...prev].slice(0, 200));
      setLastUpdated(new Date());
    } catch (err) {
      // Swallow errors on incremental poll — full refresh will recover
      console.warn('GoldenEye incremental poll error:', err);
    }
  }, []);

  // Pause polling when the tab is hidden
  useEffect(() => {
    const handleVisibility = () => {
      isPageVisibleRef.current = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Initial full fetch + polling schedules
  useEffect(() => {
    // Always do a full fetch on mount
    fetchFullData();

    if (pollIntervalMs <= 0) return;

    // Lightweight event poll (default every 5s)
    eventPollRef.current = setInterval(fetchNewEvents, pollIntervalMs);

    // Full refresh at 6× the event interval (default 30s)
    const fullInterval = Math.max(pollIntervalMs * 6, 30_000);
    fullPollRef.current = setInterval(fetchFullData, fullInterval);

    return () => {
      if (eventPollRef.current) clearInterval(eventPollRef.current);
      if (fullPollRef.current) clearInterval(fullPollRef.current);
    };
  }, [fetchFullData, fetchNewEvents, pollIntervalMs]);

  return {
    activeUsers,
    recentEvents,
    llmEndpoints,
    anomalyRules,
    usageTotals,
    modelBreakdown,
    isLoading,
    error,
    lastUpdated,
    refetch: fetchFullData,
  };
}
