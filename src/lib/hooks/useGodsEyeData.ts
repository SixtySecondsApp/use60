/**
 * useGodsEyeData — Polling hook for God's Eye admin visualization
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

export interface UsageTotals {
  all_time: { tokens: number; cost: number };
  last_30d: { tokens: number; cost: number };
  last_7d: { tokens: number; cost: number };
  last_24h: { tokens: number; cost: number };
}

export interface GodsEyeData {
  activeUsers: ActiveUser[];
  recentEvents: RecentEvent[];
  llmEndpoints: LLMEndpoint[];
  anomalyRules: AnomalyRule[];
  usageTotals: UsageTotals;
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

export function useGodsEyeData(pollIntervalMs = 10_000): GodsEyeData {
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [llmEndpoints, setLlmEndpoints] = useState<LLMEndpoint[]>([]);
  const [anomalyRules, setAnomalyRules] = useState<AnomalyRule[]>([]);
  const [usageTotals, setUsageTotals] = useState<UsageTotals>({
    all_time: { tokens: 0, cost: 0 },
    last_30d: { tokens: 0, cost: 0 },
    last_7d: { tokens: 0, cost: 0 },
    last_24h: { tokens: 0, cost: 0 },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
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

        // Recent events for visualization (last 100 events)
        supabase
          .from('ai_cost_events')
          .select('id, user_id, provider, model, feature, input_tokens, output_tokens, estimated_cost, created_at')
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

        // Usage totals: all time (raise limit beyond default 1000)
        supabase
          .from('ai_cost_events')
          .select('input_tokens, output_tokens, estimated_cost')
          .limit(100000),

        // Usage totals: last 30 days
        supabase
          .from('ai_cost_events')
          .select('input_tokens, output_tokens, estimated_cost')
          .gte('created_at', thirtyDaysAgo)
          .limit(100000),

        // Usage totals: last 7 days
        supabase
          .from('ai_cost_events')
          .select('input_tokens, output_tokens, estimated_cost')
          .gte('created_at', sevenDaysAgo)
          .limit(100000),

        // Usage totals: last 24 hours
        supabase
          .from('ai_cost_events')
          .select('input_tokens, output_tokens, estimated_cost')
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
            for (const membership of membershipsResult.data) {
              const user = userMap.get(membership.user_id);
              if (user && !user.org_name) {
                const org = membership.organizations as { name: string } | null;
                if (org?.name) user.org_name = org.name;
              }
            }
          }
        }

        // Sort: active users first, then by most recent activity
        const sortedUsers = Array.from(userMap.values()).sort((a, b) => {
          if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
          return new Date(b.last_request_at).getTime() - new Date(a.last_request_at).getTime();
        });

        setActiveUsers(sortedUsers);
      }

      // Process anomaly rules
      const rules = (rulesResult.data || []) as AnomalyRule[];
      setAnomalyRules(rules);

      // Process recent events with flagging
      if (recentEventsResult.data) {
        const events: RecentEvent[] = recentEventsResult.data.map(e => ({
          ...e,
          user_email: null,
          user_name: null,
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

        setRecentEvents(applyAnomalyRules(events, rules));
      }

      // Process LLM endpoints with active request counts
      if (modelsResult.data) {
        const recentByModel = new Map<string, number>();
        if (recentEventsResult.data) {
          for (const event of recentEventsResult.data) {
            const key = event.model;
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

      // Process usage totals
      const sumTokensAndCost = (data: Array<{ input_tokens: number; output_tokens: number; estimated_cost: number }> | null) => {
        if (!data) return { tokens: 0, cost: 0 };
        return data.reduce(
          (acc, row) => ({
            tokens: acc.tokens + (row.input_tokens || 0) + (row.output_tokens || 0),
            cost: acc.cost + (row.estimated_cost || 0),
          }),
          { tokens: 0, cost: 0 }
        );
      };

      setUsageTotals({
        all_time: sumTokensAndCost(totalsAllTime.data),
        last_30d: sumTokensAndCost(totals30d.data),
        last_7d: sumTokensAndCost(totals7d.data),
        last_24h: sumTokensAndCost(totals24h.data),
      });

      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('GodsEye fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    fetchData();

    intervalRef.current = setInterval(fetchData, pollIntervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchData, pollIntervalMs]);

  return {
    activeUsers,
    recentEvents,
    llmEndpoints,
    anomalyRules,
    usageTotals,
    isLoading,
    error,
    lastUpdated,
    refetch: fetchData,
  };
}
