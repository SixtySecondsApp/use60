/**
 * React hooks for Deal Risk Signals
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import type {
  DealRiskSignal,
  DealRiskAggregate,
  RiskSignalType,
  RiskSeverity,
} from '@/lib/types/meetingIntelligence';

// =====================================================
// useDealRiskSignals Hook
// =====================================================

/**
 * Hook to get and manage risk signals for a specific deal
 */
export function useDealRiskSignals(dealId: string | null) {
  const [signals, setSignals] = useState<DealRiskSignal[]>([]);
  const [aggregate, setAggregate] = useState<DealRiskAggregate | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch signals and aggregate
  const fetchSignals = useCallback(async () => {
    if (!dealId) {
      setSignals([]);
      setAggregate(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch signals
      const { data: signalsData, error: signalsError } = await supabase
        .from('deal_risk_signals')
        .select('*')
        .eq('deal_id', dealId)
        .eq('is_resolved', false)
        .eq('auto_dismissed', false)
        .order('severity', { ascending: true })
        .order('detected_at', { ascending: false });

      if (signalsError) throw signalsError;

      // Fetch aggregate
      const { data: aggregateData, error: aggregateError } = await supabase
        .from('deal_risk_aggregates')
        .select('*')
        .eq('deal_id', dealId)
        .maybeSingle();

      if (aggregateError) throw aggregateError;

      setSignals(signalsData || []);
      setAggregate(aggregateData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch risk signals');
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  // Analyze deal for risk signals (call edge function)
  const analyzeRisks = useCallback(async () => {
    if (!dealId) return null;

    try {
      setAnalyzing(true);
      setError(null);

      const { data, error: funcError } = await supabase.functions.invoke(
        'deal-router',
        {
          body: { action: 'analyze_risk_signals', dealId },
        }
      );

      if (funcError) throw funcError;

      if (data?.success) {
        await fetchSignals();
        toast.success(`Risk analysis complete: ${data.signals_detected} signal(s) detected`);
        return data;
      } else {
        throw new Error(data?.error || 'Failed to analyze risks');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze risks';
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setAnalyzing(false);
    }
  }, [dealId, fetchSignals]);

  // Resolve a signal
  const resolveSignal = useCallback(async (signalId: string, notes?: string) => {
    try {
      const { error: updateError } = await supabase
        .from('deal_risk_signals')
        .update({
          is_resolved: true,
          resolved_at: new Date().toISOString(),
          resolution_notes: notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', signalId);

      if (updateError) throw updateError;

      await fetchSignals();
      toast.success('Risk signal resolved');
      return true;
    } catch (err) {
      toast.error('Failed to resolve signal');
      return false;
    }
  }, [fetchSignals]);

  // Dismiss a signal
  const dismissSignal = useCallback(async (signalId: string, reason?: string) => {
    try {
      const { error: updateError } = await supabase
        .from('deal_risk_signals')
        .update({
          auto_dismissed: true,
          dismissed_reason: reason || 'Manually dismissed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', signalId);

      if (updateError) throw updateError;

      await fetchSignals();
      toast.success('Risk signal dismissed');
      return true;
    } catch (err) {
      toast.error('Failed to dismiss signal');
      return false;
    }
  }, [fetchSignals]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!dealId) return;

    fetchSignals();

    const signalsChannel = supabase
      .channel(`deal_risk_signals:${dealId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deal_risk_signals',
          filter: `deal_id=eq.${dealId}`,
        },
        () => {
          fetchSignals();
        }
      )
      .subscribe();

    const aggregateChannel = supabase
      .channel(`deal_risk_aggregate:${dealId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deal_risk_aggregates',
          filter: `deal_id=eq.${dealId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setAggregate(null);
          } else {
            setAggregate(payload.new as DealRiskAggregate);
          }
        }
      )
      .subscribe();

    return () => {
      signalsChannel.unsubscribe();
      aggregateChannel.unsubscribe();
    };
  }, [dealId, fetchSignals]);

  return {
    signals,
    aggregate,
    loading,
    analyzing,
    error,
    refresh: fetchSignals,
    analyzeRisks,
    resolveSignal,
    dismissSignal,
    // Convenience getters
    riskLevel: aggregate?.overall_risk_level || 'low',
    riskScore: aggregate?.risk_score || 0,
    activeSignalsCount: signals.length,
    criticalSignalsCount: signals.filter((s) => s.severity === 'critical').length,
    highSignalsCount: signals.filter((s) => s.severity === 'high').length,
    hasRisk: signals.length > 0,
    isCritical: signals.some((s) => s.severity === 'critical'),
  };
}

// =====================================================
// useHighRiskDeals Hook
// =====================================================

/**
 * Hook to get all high-risk deals for the current user
 */
export function useHighRiskDeals() {
  const { user } = useAuth();
  const [deals, setDeals] = useState<Array<{
    deal_id: string;
    deal_name: string;
    deal_company: string;
    deal_value: number;
    deal_stage: string;
    risk_level: RiskSeverity;
    risk_score: number;
    active_signals_count: number;
    top_signals: DealRiskSignal[];
    recommended_actions: Array<{ action: string; priority: string; rationale: string }>;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHighRiskDeals = useCallback(async () => {
    if (!user) {
      setDeals([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get user's deals with risk aggregates
      const { data: aggregates, error: aggError } = await supabase
        .from('deal_risk_aggregates')
        .select(`
          *,
          deals!inner(id, name, company, value, stage, user_id)
        `)
        .eq('deals.user_id', user.id)
        .in('overall_risk_level', ['high', 'critical'])
        .order('risk_score', { ascending: false });

      if (aggError) throw aggError;

      // Get signals for each deal
      const dealIds = (aggregates || []).map((a) => a.deal_id);
      const { data: allSignals } = await supabase
        .from('deal_risk_signals')
        .select('*')
        .in('deal_id', dealIds)
        .eq('is_resolved', false)
        .eq('auto_dismissed', false)
        .order('severity', { ascending: true });

      // Group signals by deal
      const signalsByDeal = (allSignals || []).reduce((acc, signal) => {
        if (!acc[signal.deal_id]) {
          acc[signal.deal_id] = [];
        }
        acc[signal.deal_id].push(signal);
        return acc;
      }, {} as Record<string, DealRiskSignal[]>);

      // Build result
      const result = (aggregates || []).map((agg) => {
        const deal = agg.deals as any;
        return {
          deal_id: agg.deal_id,
          deal_name: deal?.name || 'Unknown',
          deal_company: deal?.company || 'Unknown',
          deal_value: deal?.value || 0,
          deal_stage: deal?.stage || 'Unknown',
          risk_level: agg.overall_risk_level,
          risk_score: agg.risk_score,
          active_signals_count: agg.active_signals_count,
          top_signals: (signalsByDeal[agg.deal_id] || []).slice(0, 3),
          recommended_actions: agg.recommended_actions || [],
        };
      });

      setDeals(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch high-risk deals');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchHighRiskDeals();
  }, [fetchHighRiskDeals]);

  return {
    deals,
    loading,
    error,
    refresh: fetchHighRiskDeals,
    totalAtRisk: deals.length,
    criticalCount: deals.filter((d) => d.risk_level === 'critical').length,
    highCount: deals.filter((d) => d.risk_level === 'high').length,
    totalAtRiskValue: deals.reduce((sum, d) => sum + d.deal_value, 0),
  };
}

// =====================================================
// useRiskSignalsByType Hook
// =====================================================

/**
 * Hook to get risk signal distribution by type
 */
export function useRiskSignalsByType() {
  const { user } = useAuth();
  const [distribution, setDistribution] = useState<Record<RiskSignalType, number>>(
    {} as Record<RiskSignalType, number>
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDistribution = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      // Get user's org_id
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (!membership?.org_id) return;

      const { data, error: queryError } = await supabase
        .from('deal_risk_signals')
        .select('signal_type')
        .eq('org_id', membership.org_id)
        .eq('is_resolved', false)
        .eq('auto_dismissed', false);

      if (queryError) throw queryError;

      const counts = (data || []).reduce((acc, signal) => {
        acc[signal.signal_type as RiskSignalType] = (acc[signal.signal_type as RiskSignalType] || 0) + 1;
        return acc;
      }, {} as Record<RiskSignalType, number>);

      setDistribution(counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch distribution');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchDistribution();
  }, [fetchDistribution]);

  return {
    distribution,
    loading,
    error,
    refresh: fetchDistribution,
  };
}
