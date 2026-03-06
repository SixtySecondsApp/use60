import { createContext, useContext } from 'react';

const CreditTopUpContext = createContext({ openTopUp: () => {} });

export function useCreditTopUp() {
  return useContext(CreditTopUpContext);
}

export function CreditTopUpProvider({ children }: { children: React.ReactNode }) {
  return <CreditTopUpContext.Provider value={{ openTopUp: () => {} }}>{children}</CreditTopUpContext.Provider>;
}

export function CreditTopUpPrompt() {
  return null;
}
