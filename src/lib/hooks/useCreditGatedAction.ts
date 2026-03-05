export function useCreditGatedAction() { return { canExecute: true, execute: async (fn: any) => fn?.(), isLoading: false }; }
