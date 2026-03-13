/**
 * useBrainOnboarding — Checks if user needs brain onboarding and triggers initial scan
 *
 * On first dashboard load, checks if the `brain_onboarding_scan_completed` flag
 * exists in user_settings. If not, calls the `brain-initial-scan` edge function
 * to create initial CC items (stale deals, meeting prep, follow-ups).
 *
 * Can also be manually triggered with `triggerScan('calendar_connected')` when
 * the user first connects their calendar.
 *
 * US-034: First 24h onboarding — brain does something visible
 */

import { useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrg } from '@/lib/contexts/OrgContext';
import { toast } from 'sonner';

interface BrainOnboardingState {
  /** Whether the onboarding scan has already been completed */
  isCompleted: boolean;
  /** Whether we're currently checking the onboarding status */
  isChecking: boolean;
  /** Whether the scan is currently running */
  isScanning: boolean;
  /** Manually trigger a scan (e.g. after calendar connection) */
  triggerScan: (trigger: 'first_login' | 'calendar_connected') => void;
}

export function useBrainOnboarding(): BrainOnboardingState {
  const { user } = useAuth();
  const { activeOrgId } = useOrg();
  const queryClient = useQueryClient();
  const hasAutoTriggered = useRef(false);

  const userId = user?.id ?? null;
  const orgId = activeOrgId ?? null;

  // Check if onboarding scan has been completed
  const { data: isCompleted, isLoading: isChecking } = useQuery({
    queryKey: ['brain-onboarding-status', userId],
    queryFn: async () => {
      if (!userId) return true; // No user = skip

      const { data, error } = await supabase
        .from('user_settings')
        .select('value')
        .eq('user_id', userId)
        .eq('key', 'brain_onboarding_scan_completed')
        .maybeSingle();

      if (error) {
        console.warn('[useBrainOnboarding] Failed to check onboarding status:', error.message);
        return true; // On error, assume completed to avoid retriggers
      }

      return !!data;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Mutation to run the scan
  const scanMutation = useMutation({
    mutationFn: async (trigger: 'first_login' | 'calendar_connected') => {
      if (!userId || !orgId) {
        throw new Error('Missing user or org context');
      }

      const { data, error } = await supabase.functions.invoke('brain-initial-scan', {
        body: {
          user_id: userId,
          org_id: orgId,
          trigger,
        },
      });

      if (error) {
        throw new Error(error.message || 'Scan failed');
      }

      return data;
    },
    onSuccess: (data) => {
      // Invalidate CC items query so the command centre refreshes
      queryClient.invalidateQueries({ queryKey: ['command-centre-items'] });
      queryClient.invalidateQueries({ queryKey: ['brain-onboarding-status'] });

      if (data?.items_created > 0) {
        toast.success(
          `Brain scanned your pipeline and created ${data.items_created} action${data.items_created !== 1 ? 's' : ''} for you`,
        );
      }
    },
    onError: (err) => {
      console.error('[useBrainOnboarding] Scan failed:', err);
      // Don't show error toast — onboarding scan is non-critical
    },
  });

  // Auto-trigger on first load if not completed
  if (!isChecking && isCompleted === false && userId && orgId && !hasAutoTriggered.current && !scanMutation.isPending) {
    hasAutoTriggered.current = true;
    scanMutation.mutate('first_login');
  }

  const triggerScan = useCallback(
    (trigger: 'first_login' | 'calendar_connected') => {
      if (!userId || !orgId) return;
      scanMutation.mutate(trigger);
    },
    [userId, orgId, scanMutation],
  );

  return {
    isCompleted: isCompleted ?? true,
    isChecking,
    isScanning: scanMutation.isPending,
    triggerScan,
  };
}
