/**
 * useTrustCapital — React Query hook for AE2-017 Trust Capital dashboard.
 *
 * Calls the `get_trust_capital` RPC (AE2-016) and returns the score breakdown.
 * Also tracks milestone celebrations via sonner toasts.
 */

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import { useActiveOrgId } from '@/lib/stores/orgStore';

// ============================================================================
// Types
// ============================================================================

export interface TrustCapitalData {
  score: number;              // 0-1000
  total_signals: number;
  action_types_trained: number;
  avg_confidence: number;
  days_active: number;
  auto_tier_count: number;
}

// ============================================================================
// Milestone thresholds for celebrations
// ============================================================================

const MILESTONE_THRESHOLDS = [
  { threshold: 100, message: 'Your agent is learning your style' },
  { threshold: 500, message: 'Your agent is becoming a trusted teammate' },
  { threshold: 1000, message: 'Maximum trust capital — your agent is fully trained' },
] as const;

// ============================================================================
// Data fetching
// ============================================================================

async function fetchTrustCapital(userId: string, orgId: string): Promise<TrustCapitalData> {
  const { data, error } = await supabase.rpc('get_trust_capital', {
    p_user_id: userId,
    p_org_id: orgId,
  });

  if (error) throw error;

  // RPC returns JSONB — data is already an object
  const result = data as TrustCapitalData;

  return {
    score: result.score ?? 0,
    total_signals: result.total_signals ?? 0,
    action_types_trained: result.action_types_trained ?? 0,
    avg_confidence: result.avg_confidence ?? 0,
    days_active: result.days_active ?? 0,
    auto_tier_count: result.auto_tier_count ?? 0,
  };
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Fetches Trust Capital score for the current user and celebrates milestones.
 *
 * @example
 * const { data, isLoading, error } = useTrustCapital();
 * if (data) {
 *   console.log('Trust Capital:', data.score);
 * }
 */
export function useTrustCapital() {
  const { data: user } = useAuthUser();
  const orgId = useActiveOrgId();

  const query = useQuery<TrustCapitalData>({
    queryKey: ['trust-capital', user?.id, orgId],
    queryFn: () => fetchTrustCapital(user!.id, orgId!),
    enabled: !!user?.id && !!orgId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Track previously celebrated milestone to avoid repeat toasts
  const lastCelebratedRef = useRef<number>(0);

  useEffect(() => {
    if (!query.data) return;

    const score = query.data.score;
    const lastCelebrated = lastCelebratedRef.current;

    // Find highest milestone the user has crossed that hasn't been celebrated
    for (const milestone of MILESTONE_THRESHOLDS) {
      if (score >= milestone.threshold && lastCelebrated < milestone.threshold) {
        toast.success(milestone.message, {
          description: `Trust Capital: ${score}/1000`,
          duration: 6000,
        });
        lastCelebratedRef.current = milestone.threshold;
        break; // Only one toast per fetch
      }
    }
  }, [query.data]);

  return query;
}

export default useTrustCapital;
