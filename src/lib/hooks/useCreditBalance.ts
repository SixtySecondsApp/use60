/**
 * useCreditBalance — React Query hook for org credit balance
 *
 * Polls every 30s for near-realtime balance updates.
 * Auto-uses the current org from OrgContext.
 */

import { useQuery } from '@tanstack/react-query';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { getBalance, type CreditBalance } from '@/lib/services/creditService';

// Query keys
export const creditKeys = {
  all: ['credits'] as const,
  balance: (orgId: string) => [...creditKeys.all, 'balance', orgId] as const,
  transactions: (orgId: string) => [...creditKeys.all, 'transactions', orgId] as const,
  usage: (orgId: string) => [...creditKeys.all, 'usage', orgId] as const,
};

/**
 * Fetch and poll the org's credit balance.
 * Returns balance, burn rate, projected days, usage breakdown, and recent transactions.
 */
export function useCreditBalance() {
  const orgId = useOrgId();

  return useQuery<CreditBalance>({
    queryKey: creditKeys.balance(orgId || ''),
    queryFn: () => getBalance(orgId!),
    enabled: !!orgId,
    refetchInterval: 30_000, // Poll every 30s
    staleTime: 15_000, // Consider fresh for 15s
    refetchOnWindowFocus: true,
  });
}
