/**
 * Stub: useSubscriptionGate was removed during cleanup.
 * Returns a no-op gate that always allows access.
 */
export function useSubscriptionGate(_orgId?: string | null) {
  return {
    isLoading: false,
    status: 'active' as const,
    canAccess: true,
    daysRemaining: null,
  };
}
