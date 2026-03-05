/**
 * Stub: useCreditGatedAction was removed during cleanup.
 * Returns a passthrough executor that always runs the action.
 */
export function useCreditGatedAction(_actionType: string, _creditCost: number = 1) {
  return {
    execute: (fn: () => void) => fn(),
    isChecking: false,
    hasCredits: true,
  };
}
