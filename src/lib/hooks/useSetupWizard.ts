import { useEffect, useMemo, useRef } from 'react';
import { useSetupWizardStore, SETUP_STEPS, type SetupStep } from '@/lib/stores/setupWizardStore';
import { useGoogleIntegration } from '@/lib/stores/integrationStore';
import { useNotetakerIntegration } from '@/lib/hooks/useNotetakerIntegration';
import { useHubSpotIntegration } from '@/lib/hooks/useHubSpotIntegration';
import { useAttioIntegration } from '@/lib/hooks/useAttioIntegration';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { useOrg } from '@/lib/contexts/OrgContext';

const PENDING_OAUTH_KEY = 'setupWizard:pendingOAuth';

export function useSetupWizard() {
  const store = useSetupWizardStore();
  const { user } = useAuth();
  const { activeOrgId } = useOrgStore();
  const { userRole } = useOrg();

  const google = useGoogleIntegration();
  const notetaker = useNotetakerIntegration();
  const hubspot = useHubSpotIntegration();
  const attio = useAttioIntegration();

  const oauthReturnHandled = useRef(false);

  // Only the org owner (creator) should see the setup wizard.
  // All other roles (admin, member, readonly) were invited and must NOT
  // earn setup credits — otherwise a sybil attack via invited admins
  // could farm 100 credits per invite. (TSK-0499 Bug #4)
  const isInvitedMember = userRole !== 'owner';

  // Fetch progress on mount — skip for invited members
  useEffect(() => {
    if (isInvitedMember) return;
    if (user?.id && activeOrgId && !store.hasFetched && !store.isLoading) {
      store.fetchProgress(user.id, activeOrgId);
    }
  }, [user?.id, activeOrgId, store.hasFetched, store.isLoading, isInvitedMember]);

  // Handle OAuth return — re-open wizard and complete the step that initiated OAuth
  useEffect(() => {
    if (isInvitedMember) return;
    const pendingStep = localStorage.getItem(PENDING_OAUTH_KEY) as SetupStep | null;
    if (!pendingStep || !user?.id || !activeOrgId || !store.hasFetched || oauthReturnHandled.current) return;

    // Check if the relevant integration is now connected
    const isConnected =
      (pendingStep === 'calendar' && google.isConnected) ||
      (pendingStep === 'crm' && (hubspot.isConnected || attio.isConnected));

    if (!isConnected) return;

    oauthReturnHandled.current = true;
    localStorage.removeItem(PENDING_OAUTH_KEY);

    // Re-open wizard at the completed step and mark it done
    store.openWizard();
    store.setCurrentStep(pendingStep);
    store.completeStep(user.id, activeOrgId, pendingStep);
  }, [user?.id, activeOrgId, store.hasFetched, google.isConnected, hubspot.isConnected, attio.isConnected, isInvitedMember]);

  const completedCount = useMemo(
    () => SETUP_STEPS.filter(s => store.steps[s].completed).length,
    [store.steps]
  );

  // Invited members never see the setup wizard indicator
  const shouldShowIndicator = !isInvitedMember && store.hasFetched && !store.allCompleted;

  const nextIncompleteStep: SetupStep | null = useMemo(
    () => SETUP_STEPS.find(s => !store.steps[s].completed) || null,
    [store.steps]
  );

  return {
    ...store,
    completedCount,
    totalSteps: SETUP_STEPS.length,
    shouldShowIndicator,
    isInvitedMember,
    nextIncompleteStep,
    google,
    notetaker,
    hubspot,
    attio,
  };
}
