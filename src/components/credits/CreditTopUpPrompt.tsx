import React from 'react';

export function useCreditTopUp() {
  return { openTopUp: () => {} };
}

export function CreditTopUpPrompt() {
  return null;
}

export function CreditTopUpProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
