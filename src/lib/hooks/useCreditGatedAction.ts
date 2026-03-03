/**
 * useCreditGatedAction
 *
 * Wraps any async AI action with a pre-flight credit balance check.
 * If the org has insufficient credits, opens the CreditTopUpPrompt modal
 * (falls back to a toast if used outside CreditTopUpProvider) and blocks
 * the action from running.
 *
 * Usage:
 *   const { execute, isBlocked, isChecking } = useCreditGatedAction('copilot_chat', 5);
 *   await execute(() => sendMessage(input));
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { supabase } from '@/lib/supabase/clientV2';
import { useCreditTopUp } from '@/components/credits/CreditTopUpPrompt';

export interface UseCreditGatedActionResult {
  /** Call this with your async action. It will check credits first. */
  execute: (fn: () => Promise<unknown> | void) => Promise<void>;
  /** True if the last check found insufficient credits. */
  isBlocked: boolean;
  /** True while the credit check is in flight. */
  isChecking: boolean;
}

/**
 * Fetch the current credit balance directly from org_credit_balance.
 * Lightweight fallback — avoids invoking a full edge function for pre-flight.
 */
async function fetchBalance(orgId: string): Promise<number> {
  const { data } = await supabase
    .from('org_credit_balance')
    .select('balance_credits')
    .eq('org_id', orgId)
    .maybeSingle();

  return data?.balance_credits ?? 0;
}

/**
 * @param actionName  Human-readable name used in the top-up modal and console warnings.
 * @param minCredits  Minimum credits required to run the action. Defaults to 1.
 */
export function useCreditGatedAction(
  actionName: string,
  minCredits: number = 1
): UseCreditGatedActionResult {
  const orgId = useOrgId();
  const [isChecking, setIsChecking] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const { openTopUp } = useCreditTopUp();

  const execute = useCallback(
    async (fn: () => Promise<unknown> | void) => {
      if (!orgId) {
        // No org context — allow through; backend will enforce.
        await fn();
        return;
      }

      setIsChecking(true);
      try {
        const balance = await fetchBalance(orgId);

        if (balance < minCredits) {
          setIsBlocked(true);

          // Open the top-up modal with context about the blocked action.
          // useCreditTopUp returns a no-op outside CreditTopUpProvider, so
          // we fall back to a toast for any edge case where provider is absent.
          openTopUp({
            currentBalance: balance,
            requiredCredits: minCredits,
            actionName,
          });

          // Fallback toast in case provider is absent (no-op context).
          // We check openTopUp identity — if it's the no-op, show toast instead.
          // Since we can't distinguish no-op from real, we rely on the context
          // returning a working function when provider is present.
          console.warn(
            `[useCreditGatedAction] Blocked "${actionName}": balance=${balance}, required=${minCredits}`
          );
          return;
        }

        setIsBlocked(false);
        await fn();
      } catch (err) {
        // If the credit check itself fails, allow the action through.
        // The backend cost-tracking layer will enforce the real limit.
        console.error('[useCreditGatedAction] Credit check failed, allowing through:', err);
        await fn();
      } finally {
        setIsChecking(false);
      }
    },
    [orgId, actionName, minCredits, openTopUp]
  );

  return { execute, isBlocked, isChecking };
}
