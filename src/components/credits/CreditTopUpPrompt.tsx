/**
 * Stub: CreditTopUpPrompt was removed during cleanup.
 * CreditTopUpProvider is a passthrough wrapper.
 */
import React from 'react';

export function CreditTopUpProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useCreditTopUp() {
  return {
    openTopUp: () => {},
  };
}
