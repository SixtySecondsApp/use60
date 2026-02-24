import { useCreditBalance } from '@/lib/hooks/useCreditBalance';
import { useState, useCallback } from 'react';

export function useRequireCredits() {
  const { data, isLoading } = useCreditBalance();
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);

  const showTopUpPrompt = useCallback(() => {
    setShowPurchaseModal(true);
  }, []);

  const hideTopUpPrompt = useCallback(() => {
    setShowPurchaseModal(false);
  }, []);

  // hasCredits = true if: balance > 0, OR no data yet (backward compat -- org not on credit system)
  const hasCredits = isLoading || !data || data.balance > 0;

  return {
    hasCredits,
    isLoading,
    balance: data?.balance ?? 0,
    showTopUpPrompt,
    hideTopUpPrompt,
    showPurchaseModal,
  };
}
