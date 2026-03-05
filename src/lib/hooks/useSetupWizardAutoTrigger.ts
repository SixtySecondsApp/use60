import { useEffect, useRef } from 'react';
import { useSetupWizardStore } from '@/lib/stores/setupWizardStore';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';

const AUTO_TRIGGER_DELAY_MS = 3000;
const AUTO_TRIGGER_KEY = 'setupWizard:autoTriggered';

/**
 * Auto-opens the setup wizard for new users who haven't completed setup.
 * Triggers once per session after a short delay to avoid overwhelming the UI on load.
 */
export function useSetupWizardAutoTrigger() {
  const triggered = useRef(false);
  const { user } = useAuth();
  const { activeOrgId } = useOrgStore();
  const { hasFetched, allCompleted, isDismissed, isOpen, openWizard } = useSetupWizardStore();

  useEffect(() => {
    if (triggered.current || !user?.id || !activeOrgId || !hasFetched) return;
    if (allCompleted || isDismissed || isOpen) return;

    // Only auto-trigger once per session
    const sessionKey = `${AUTO_TRIGGER_KEY}:${user.id}`;
    if (sessionStorage.getItem(sessionKey)) return;

    const timer = setTimeout(() => {
      triggered.current = true;
      sessionStorage.setItem(sessionKey, '1');
      openWizard();
    }, AUTO_TRIGGER_DELAY_MS);

    return () => clearTimeout(timer);
  }, [user?.id, activeOrgId, hasFetched, allCompleted, isDismissed, isOpen, openWizard]);
}
