export function useSubscriptionGate(_orgId: string | null) {
  return {
    isLoading: false,
    status: 'active' as const,
    action: null as string | null,
  };
}
