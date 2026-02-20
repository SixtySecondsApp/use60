/**
 * React hooks for Meeting Structured Summaries
 */

import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import type { MeetingStructuredSummary } from '@/lib/types/meetingIntelligence';

// =====================================================
// useStructuredSummary Hook
// =====================================================

/**
 * Hook to get and manage structured summary for a specific meeting
 */
export function useStructuredSummary(meetingId: string | null) {
  const queryClient = useQueryClient();
  const [summary, setSummary] = useState<MeetingStructuredSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    if (!meetingId) {
      setSummary(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from('meeting_structured_summaries')
        .select('*')
        .eq('meeting_id', meetingId)
        .maybeSingle();

      if (queryError) throw queryError;

      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch structured summary');
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  // Process structured summary (call edge function)
  const processSummary = useCallback(async (forceReprocess = false) => {
    if (!meetingId) return null;

    try {
      setProcessing(true);
      setError(null);

      const { data, error: funcError } = await supabase.functions.invoke(
        'meeting-process-structured-summary',
        {
          body: { meetingId, forceReprocess },
        }
      );

      if (funcError) throw funcError;

      if (data?.success) {
        await fetchSummary();
        // Invalidate team analytics cache so dashboard KPIs reflect new classification
        queryClient.invalidateQueries({ queryKey: ['team-analytics'] });
        return data.summary;
      } else {
        throw new Error(data?.error || 'Failed to process summary');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process summary';
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setProcessing(false);
    }
  }, [meetingId, fetchSummary, queryClient]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!meetingId) return;

    fetchSummary();

    const channel = supabase
      .channel(`structured_summary:${meetingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meeting_structured_summaries',
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setSummary(null);
          } else {
            setSummary(payload.new as MeetingStructuredSummary);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [meetingId, fetchSummary]);

  return {
    summary,
    loading,
    processing,
    error,
    refresh: fetchSummary,
    processSummary,
    hasForwardMovement: summary?.outcome_signals?.forward_movement || false,
    hasPricingDiscussion: summary?.pricing_discussed?.mentioned || false,
    hasCompetitors: (summary?.competitor_mentions?.length || 0) > 0,
    hasObjections: (summary?.objections?.length || 0) > 0,
    detectedStage: summary?.stage_indicators?.detected_stage,
  };
}

// =====================================================
// useMeetingInsights Hook
// =====================================================

/**
 * Hook to get aggregated insights across multiple meetings
 */
export function useMeetingInsights(meetingIds: string[]) {
  const [insights, setInsights] = useState({
    forwardMovementCount: 0,
    pricingDiscussionCount: 0,
    competitorMentionCount: 0,
    objectionCount: 0,
    positiveOutcomeCount: 0,
    negativeOutcomeCount: 0,
    topObjections: [] as string[],
    topCompetitors: [] as string[],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = useCallback(async () => {
    if (!meetingIds.length) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from('meeting_structured_summaries')
        .select('*')
        .in('meeting_id', meetingIds);

      if (queryError) throw queryError;

      const summaries = data || [];

      // Aggregate insights
      const forwardMovementCount = summaries.filter(
        (s) => s.outcome_signals?.forward_movement
      ).length;
      const pricingDiscussionCount = summaries.filter(
        (s) => s.pricing_discussed?.mentioned
      ).length;
      const competitorMentionCount = summaries.filter(
        (s) => (s.competitor_mentions?.length || 0) > 0
      ).length;
      const objectionCount = summaries.filter(
        (s) => (s.objections?.length || 0) > 0
      ).length;
      const positiveOutcomeCount = summaries.filter(
        (s) => s.outcome_signals?.overall === 'positive'
      ).length;
      const negativeOutcomeCount = summaries.filter(
        (s) => s.outcome_signals?.overall === 'negative'
      ).length;

      // Get top objections
      const objectionCounts: Record<string, number> = {};
      summaries.forEach((s) => {
        s.objections?.forEach((obj: any) => {
          const key = obj.objection || obj;
          objectionCounts[key] = (objectionCounts[key] || 0) + 1;
        });
      });
      const topObjections = Object.entries(objectionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([obj]) => obj);

      // Get top competitors
      const competitorCounts: Record<string, number> = {};
      summaries.forEach((s) => {
        s.competitor_mentions?.forEach((comp: any) => {
          const name = comp.name || comp;
          competitorCounts[name] = (competitorCounts[name] || 0) + 1;
        });
      });
      const topCompetitors = Object.entries(competitorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name]) => name);

      setInsights({
        forwardMovementCount,
        pricingDiscussionCount,
        competitorMentionCount,
        objectionCount,
        positiveOutcomeCount,
        negativeOutcomeCount,
        topObjections,
        topCompetitors,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch insights');
    } finally {
      setLoading(false);
    }
  }, [meetingIds.join(',')]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  return {
    insights,
    loading,
    error,
    refresh: fetchInsights,
  };
}
