/**
 * useReconciliation — stub hook for CRM reconciliation
 */

export function useReconciliation() {
  return {
    isReconciling: false,
    lastReconciled: null as string | null,
    reconcile: async () => {},
  };
}
