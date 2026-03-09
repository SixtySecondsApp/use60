// src/lib/hooks/useSubscriptionGate.ts
// Subscription gate hook — calls check_subscription_access RPC and returns gate state.
// Uses useEffect+useState pattern (matching ProtectedRoute.tsx), NOT React Query.

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { logger } from '@/lib/utils/logger';

export interface SubscriptionGateState {
  isLoading: boolean;
  hasAccess: boolean;
  canUseAi: boolean;
  status: string;
  action: string;
  trialDaysRemaining: number;
  graceDaysRemaining: number;
}

const DEFAULT_STATE: SubscriptionGateState = {
  isLoading: true,
  hasAccess: true, // Fail open — never block paying users due to a DB hiccup
  canUseAi: true,
  status: 'unknown',
  action: 'none',
  trialDaysRemaining: 0,
  graceDaysRemaining: 0,
};

/**
 * Calls the check_subscription_access RPC and returns the gate state.
 * Re-runs when orgId changes.
 * Fails open on error (hasAccess = true) to protect paying users from DB issues.
 */
export function useSubscriptionGate(orgId: string | null | undefined): SubscriptionGateState {
  const [state, setState] = useState<SubscriptionGateState>(DEFAULT_STATE);
  const lastCheckedOrgRef = useRef<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      // No org yet — remain in loading state until we have an orgId
      setState(DEFAULT_STATE);
      lastCheckedOrgRef.current = null;
      return;
    }

    // Skip re-check if we already checked this exact org
    if (lastCheckedOrgRef.current === orgId) {
      return;
    }

    let cancelled = false;

    const check = async () => {
      setState(prev => ({ ...prev, isLoading: true }));

      try {
        const { data, error } = await supabase.rpc('check_subscription_access', {
          p_org_id: orgId,
        });

        if (cancelled) return;

        if (error) {
          logger.error('[useSubscriptionGate] RPC error, failing open:', error);
          // Fail open — allow access if RPC errors
          setState({
            isLoading: false,
            hasAccess: true,
            canUseAi: true,
            status: 'unknown',
            action: 'none',
            trialDaysRemaining: 0,
            graceDaysRemaining: 0,
          });
          lastCheckedOrgRef.current = orgId;
          return;
        }

        // RPC returns an array of rows (RETURNS TABLE)
        const row = Array.isArray(data) ? data[0] : data;

        if (!row) {
          // No row returned — fail open
          setState({
            isLoading: false,
            hasAccess: true,
            canUseAi: true,
            status: 'unknown',
            action: 'none',
            trialDaysRemaining: 0,
            graceDaysRemaining: 0,
          });
          lastCheckedOrgRef.current = orgId;
          return;
        }

        setState({
          isLoading: false,
          hasAccess: row.has_access ?? true,
          canUseAi: row.can_use_ai ?? true,
          status: row.status ?? 'unknown',
          action: row.action ?? 'none',
          trialDaysRemaining: row.trial_days_remaining ?? 0,
          graceDaysRemaining: row.grace_days_remaining ?? 0,
        });
        lastCheckedOrgRef.current = orgId;
      } catch (err) {
        if (cancelled) return;
        logger.error('[useSubscriptionGate] Unexpected error, failing open:', err);
        setState({
          isLoading: false,
          hasAccess: true,
          canUseAi: true,
          status: 'unknown',
          action: 'none',
          trialDaysRemaining: 0,
          graceDaysRemaining: 0,
        });
        lastCheckedOrgRef.current = orgId;
      }
    };

    check();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return state;
}

/**
 * Convenience hook — returns true if the org is in a grace period.
 */
export function useIsInGracePeriod(orgId: string | null | undefined): boolean {
  const gate = useSubscriptionGate(orgId);
  return gate.status === 'grace_period';
}
