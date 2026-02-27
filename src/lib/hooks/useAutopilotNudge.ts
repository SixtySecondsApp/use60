/**
 * useAutopilotNudge — AP-032
 *
 * Polls the autopilot-record-signal GET endpoint every 30 seconds for a
 * pending promotion nudge. Returns the nudge data and a `dismissNudge`
 * function.
 *
 * The endpoint clears the nudge server-side when it is fetched, so the nudge
 * is shown at most once per milestone hit.
 *
 * @example
 * const { nudge, dismissNudge } = useAutopilotNudge();
 * if (nudge) {
 *   // show banner with nudge.message
 * }
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import { useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface AutopilotNudge {
  action_type: string;
  message: string;
  from_tier: string;
  to_tier: string;
}

interface NudgeResponse {
  nudge: AutopilotNudge | null;
}

// ============================================================================
// Query key
// ============================================================================

export const AUTOPILOT_NUDGE_QUERY_KEY = ['autopilot-nudge'] as const;

// ============================================================================
// Data fetching
// ============================================================================

async function fetchPendingNudge(): Promise<AutopilotNudge | null> {
  const { data, error } = await supabase.functions.invoke<NudgeResponse>(
    'autopilot-record-signal',
    { method: 'GET' },
  );

  if (error) {
    // Log but don't throw — nudge polling should never break the UI
    console.warn('[useAutopilotNudge] fetch error:', error);
    return null;
  }

  return data?.nudge ?? null;
}

// ============================================================================
// Hook
// ============================================================================

export function useAutopilotNudge() {
  const { data: user } = useAuthUser();
  const queryClient = useQueryClient();

  const { data: nudge } = useQuery<AutopilotNudge | null>({
    queryKey: AUTOPILOT_NUDGE_QUERY_KEY,
    queryFn: fetchPendingNudge,
    enabled: !!user?.id,
    // Poll every 30 seconds to pick up nudges set by approval actions
    refetchInterval: 30 * 1000,
    // Don't spam on window focus — the 30s interval is enough
    refetchOnWindowFocus: false,
    // Never show stale nudges from a previous session
    staleTime: 0,
    // On error: don't spam retries for a non-critical poll
    retry: false,
  });

  /**
   * Dismisses the nudge locally without a server call.
   * (The server has already cleared it when we fetched it.)
   */
  const dismissNudge = useCallback(() => {
    queryClient.setQueryData<AutopilotNudge | null>(AUTOPILOT_NUDGE_QUERY_KEY, null);
  }, [queryClient]);

  return { nudge: nudge ?? null, dismissNudge };
}

export default useAutopilotNudge;
