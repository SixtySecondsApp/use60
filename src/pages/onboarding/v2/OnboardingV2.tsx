/**
 * OnboardingV2
 *
 * Main container component for the V2 onboarding flow.
 * Manages step transitions and provides the layout wrapper.
 * Uses URL query params (?step=xxx) for reliable step tracking.
 *
 * Flow paths:
 * 1. Corporate email: enrichment_loading → enrichment_result → skills_config → complete
 * 2. Personal email with website: website_input → enrichment_loading → enrichment_result → skills_config → complete
 * 3. Personal email, no website: website_input → manual_enrichment → enrichment_loading → enrichment_result → skills_config → complete
 *
 * Phase 7 update: Added PlatformSkillConfigStep for platform-controlled skills
 */

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useOnboardingV2Store, type OnboardingV2Step, isPersonalEmailDomain } from '@/lib/stores/onboardingV2Store';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';
import { RotateCcw } from 'lucide-react';
import { WebsiteInputStep } from './WebsiteInputStep';
import { ManualEnrichmentStep } from './ManualEnrichmentStep';
import { OrganizationSelectionStep } from './OrganizationSelectionStep';
import { PendingApprovalStep } from './PendingApprovalStep';
import { EnrichmentLoadingStep } from './EnrichmentLoadingStep';
import { EnrichmentResultStep } from './EnrichmentResultStep';
import { AgentConfigConfirmStep } from './AgentConfigConfirmStep';
import { SkillsConfigStep } from './SkillsConfigStep';
import { PlatformSkillConfigStep } from './PlatformSkillConfigStep';
import { CompletionStep } from './CompletionStep';

// Feature flag for platform skills (Phase 7)
// Set to false to use the original tabbed SkillsConfigStep
const USE_PLATFORM_SKILLS = false;

// Valid steps for URL param validation
const VALID_STEPS: OnboardingV2Step[] = [
  'website_input',
  'manual_enrichment',
  'organization_selection',
  'pending_approval',
  'enrichment_loading',
  'enrichment_result',
  'agent_config_confirm',
  'skills_config',
  'complete',
];

interface OnboardingV2Props {
  organizationId: string;
  domain?: string;
  userEmail?: string;
}

// Steps where resume/start-fresh choice should be shown
const RESUMABLE_STEPS: OnboardingV2Step[] = ['enrichment_loading', 'enrichment_result', 'agent_config_confirm', 'skills_config'];

export function OnboardingV2({ organizationId, domain, userEmail }: OnboardingV2Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showResumeChoice, setShowResumeChoice] = useState(false);
  const [savedStateForChoice, setSavedStateForChoice] = useState<any>(null);
  const [isStartingFresh, setIsStartingFresh] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const hasAttemptedRestore = useRef(false);
  const {
    currentStep,
    domain: storeDomain,
    setOrganizationId,
    setDomain,
    setUserEmail,
    setStep,
    startEnrichment,
    resetAndCleanup,
  } = useOnboardingV2Store();

  // NOTE: Removed org membership redirect check because:
  // 1. If user is invited (has org membership), ProtectedRoute won't route them to /onboarding
  //    via the needsOnboarding hook in useOnboardingProgress()
  // 2. If user is on /onboarding, they should complete it - don't auto-redirect midway
  // 3. The org membership check was causing infinite redirects between /onboarding and /dashboard
  //    during the normal onboarding flow (when user creates org as part of setup)

  // NOTE: Removed org membership validation here because:
  // 1. New users signing up won't have membership until after onboarding
  // 2. localStorage is already cleared in SetPassword to prevent cached org bypass
  // 3. This validation was breaking the onboarding flow by clearing valid organizationIds

  // Consolidated restoration effect: localStorage first, then database fallback
  // Previously two separate effects competed and caused "Restored your progress" spam
  useEffect(() => {
    const restoreProgress = async () => {
      if (!user) return;

      // Only attempt restoration once — prevents async race with user interaction
      if (hasAttemptedRestore.current) return;
      hasAttemptedRestore.current = true;

      // --- Priority 1: Restore from localStorage (richest state) ---
      const savedState = localStorage.getItem(`sixty_onboarding_${user.email || user.id}`);

      if (savedState) {
        // Validate session is still active before restoring
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          // Session expired - clear stale state and fall through to database/defaults
          console.log('[OnboardingV2] Session expired, clearing stale state');
          localStorage.removeItem(`sixty_onboarding_${user.email || user.id}`);
        } else {
          try {
            const parsed = JSON.parse(savedState);
            console.log('[OnboardingV2] Restored state from localStorage:', parsed);

            // Validate that the saved organizationId still exists before restoring
            // (org may have been deleted by an admin)
            let orgStillExists = false;
            if (parsed.organizationId) {
              const { data: orgCheck } = await supabase
                .from('organizations')
                .select('id')
                .eq('id', parsed.organizationId)
                .maybeSingle();
              orgStillExists = !!orgCheck;
            }

            if (parsed.organizationId && !orgStillExists) {
              // Organization was deleted — clear stale state and start fresh
              console.log('[OnboardingV2] Saved organization no longer exists, starting fresh');
              localStorage.removeItem(`sixty_onboarding_${user.email || user.id}`);
              setStep('website_input');
              return;
            }

            // Bail out if user already navigated while we were awaiting async checks
            const storeStepAfterChecks = useOnboardingV2Store.getState().currentStep;
            if (storeStepAfterChecks !== 'website_input') {
              console.log('[OnboardingV2] User already navigated to', storeStepAfterChecks, '— skipping restoration');
              return;
            }

            // If returning to a resumable step with an existing org...
            if (
              parsed.organizationId &&
              orgStillExists &&
              RESUMABLE_STEPS.includes(parsed.currentStep)
            ) {
              // If already resumed before, silently restore without showing dialog
              if (parsed.resumed) {
                console.log('[OnboardingV2] Already resumed, silently restoring state for step:', parsed.currentStep);
                if (parsed.domain) setDomain(parsed.domain);
                if (parsed.organizationId) setOrganizationId(parsed.organizationId);
                if (parsed.websiteUrl) useOnboardingV2Store.setState({ websiteUrl: parsed.websiteUrl });
                if (parsed.manualData) useOnboardingV2Store.setState({ manualData: parsed.manualData });
                if (parsed.enrichment) useOnboardingV2Store.setState({ enrichment: parsed.enrichment });
                if (parsed.skillConfigs) useOnboardingV2Store.setState({ skillConfigs: parsed.skillConfigs });
                if (parsed.pollingStartTime) {
                  useOnboardingV2Store.setState({
                    pollingStartTime: parsed.pollingStartTime,
                    pollingAttempts: parsed.pollingAttempts || 0,
                  });
                }
                if (parsed.currentStep === 'enrichment_loading' && parsed.isEnrichmentLoading) {
                  setStep('enrichment_loading');
                } else if (parsed.currentStep) {
                  setStep(parsed.currentStep);
                }
                return;
              }

              // First time seeing resumable state — show choice dialog
              console.log('[OnboardingV2] Showing resume/start-fresh choice for step:', parsed.currentStep);
              setSavedStateForChoice(parsed);
              setShowResumeChoice(true);
              return;
            }

            // Restore state to Zustand store
            if (parsed.domain) setDomain(parsed.domain);
            if (parsed.organizationId) setOrganizationId(parsed.organizationId);
            if (parsed.websiteUrl) useOnboardingV2Store.setState({ websiteUrl: parsed.websiteUrl });
            if (parsed.manualData) useOnboardingV2Store.setState({ manualData: parsed.manualData });
            if (parsed.enrichment) useOnboardingV2Store.setState({ enrichment: parsed.enrichment });
            if (parsed.skillConfigs) useOnboardingV2Store.setState({ skillConfigs: parsed.skillConfigs });

            // Restore enrichment loading state for session recovery
            if (parsed.pollingStartTime) {
              useOnboardingV2Store.setState({
                pollingStartTime: parsed.pollingStartTime,
                pollingAttempts: parsed.pollingAttempts || 0,
              });
            }

            // If enrichment was in progress when interrupted, resume from enrichment_loading
            // but don't restore isEnrichmentLoading directly (let the step trigger re-poll)
            if (parsed.currentStep === 'enrichment_loading' && parsed.isEnrichmentLoading) {
              setStep('enrichment_loading');
              toast.info('Resuming enrichment from where you left off...');
            } else if (parsed.currentStep) {
              setStep(parsed.currentStep);
              toast.info('Restored your progress');
            }

            // localStorage restored successfully — skip database fallback
            return;
          } catch (error) {
            console.error('[OnboardingV2] Failed to parse saved state:', error);
            // Clear invalid state and fall through to database
            localStorage.removeItem(`sixty_onboarding_${user.email || user.id}`);
          }
        }
      }

      // --- Priority 2: Restore from database (cross-session recovery) ---
      try {
        const { data: progress } = await supabase
          .from('user_onboarding_progress')
          .select('onboarding_step')
          .eq('user_id', user.id)
          .maybeSingle();

        // Bail out if user already navigated while we were querying DB
        const storeStepAfterDb = useOnboardingV2Store.getState().currentStep;
        if (storeStepAfterDb !== 'website_input') {
          console.log('[OnboardingV2] User already navigated to', storeStepAfterDb, '— skipping DB restoration');
          return;
        }

        if (progress && progress.onboarding_step !== 'complete') {
          const dbStep = progress.onboarding_step as OnboardingV2Step;

          // Validate it's a V2 step
          if (VALID_STEPS.includes(dbStep)) {
            console.log('[OnboardingV2] Resuming from database step:', dbStep);
            setStep(dbStep);
            return;
          }
        }
      } catch (error) {
        console.error('[OnboardingV2] Error loading progress from database:', error);
      }

      // --- Priority 3: Determine initial step from context ---
      const isFreshStart = userEmail && !domain && !organizationId;

      if (isFreshStart) {
        console.log('[OnboardingV2] Fresh start detected (personal email). Starting at website_input');
        setStep('website_input');
        return;
      }

      // For continuing onboarding, validate the URL step is appropriate
      const urlStep = searchParams.get('step') as OnboardingV2Step | null;
      if (urlStep && VALID_STEPS.includes(urlStep)) {
        // CRITICAL: Validate that enrichment_loading is only accessed with proper setup
        // If user tries to jump directly to enrichment_loading without a domain/org, redirect
        if (urlStep === 'enrichment_loading' && !domain && !organizationId) {
          console.warn('[OnboardingV2] Cannot start enrichment without domain/organizationId. Redirecting to website_input');
          setStep('website_input');
          return;
        }

        console.log('[OnboardingV2] Resuming from URL step:', urlStep);
        setStep(urlStep);
      } else {
        // No URL step specified, default to website_input for safety
        console.log('[OnboardingV2] No URL step specified. Starting at website_input');
        setStep('website_input');
      }
    };

    restoreProgress();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Sync store step changes to URL
  useEffect(() => {
    const urlStep = searchParams.get('step');
    if (currentStep && currentStep !== urlStep) {
      setSearchParams({ step: currentStep }, { replace: true });
    }
  }, [currentStep, searchParams, setSearchParams]);

  // Sync current step to database for resumption after logout
  useEffect(() => {
    const syncStepToDatabase = async () => {
      if (!currentStep || currentStep === 'complete' || !user) return;

      try {
        await supabase
          .from('user_onboarding_progress')
          .update({ onboarding_step: currentStep })
          .eq('user_id', user.id);

        console.log('[OnboardingV2] Synced step to database:', currentStep);
      } catch (error) {
        console.error('[OnboardingV2] Failed to sync step to database:', error);
      }
    };

    // Debounce to avoid excessive DB writes
    const timeout = setTimeout(syncStepToDatabase, 1000);
    return () => clearTimeout(timeout);
  }, [currentStep, user]);

  // Initialize store with organization data and detect email type
  useEffect(() => {
    setOrganizationId(organizationId);

    // If user email is provided, use it to determine the flow
    if (userEmail) {
      setUserEmail(userEmail);
    } else if (domain) {
      // Legacy: domain provided directly (corporate email path)
      setDomain(domain);
    }
  }, [organizationId, domain, userEmail, setOrganizationId, setDomain, setUserEmail]);

  // Note: The duplicate setUserEmail useEffect for business emails was removed (OLH-003)
  // to prevent double calls that could create duplicate join requests or race conditions.
  // The useEffect above (line 313) already calls setUserEmail for all email types.
  //
  // The auto-start enrichment useEffect was also removed (OLH-003) because
  // EnrichmentLoadingStep already handles startEnrichment in its own mount useEffect.
  // Having both caused duplicate enrichment calls.

  // Handle "Resume" choice — apply saved state and continue
  const handleResume = () => {
    if (!savedStateForChoice || isResuming) return;
    setIsResuming(true);

    const parsed = savedStateForChoice;

    if (parsed.domain) setDomain(parsed.domain);
    if (parsed.organizationId) setOrganizationId(parsed.organizationId);
    if (parsed.websiteUrl) useOnboardingV2Store.setState({ websiteUrl: parsed.websiteUrl });
    if (parsed.manualData) useOnboardingV2Store.setState({ manualData: parsed.manualData });
    if (parsed.enrichment) useOnboardingV2Store.setState({ enrichment: parsed.enrichment });
    if (parsed.skillConfigs) useOnboardingV2Store.setState({ skillConfigs: parsed.skillConfigs });

    if (parsed.pollingStartTime) {
      useOnboardingV2Store.setState({
        pollingStartTime: parsed.pollingStartTime,
        pollingAttempts: parsed.pollingAttempts || 0,
      });
    }

    if (parsed.currentStep === 'enrichment_loading' && parsed.isEnrichmentLoading) {
      setStep('enrichment_loading');
    } else if (parsed.currentStep) {
      setStep(parsed.currentStep);
    }

    // Mark as resumed in localStorage so dialog doesn't reappear
    if (user) {
      const key = `sixty_onboarding_${user.email || user.id}`;
      const currentState = localStorage.getItem(key);
      if (currentState) {
        try {
          const stored = JSON.parse(currentState);
          stored.resumed = true;
          localStorage.setItem(key, JSON.stringify(stored));
        } catch {
          // Ignore parse errors
        }
      }
    }

    setShowResumeChoice(false);
    setSavedStateForChoice(null);
  };

  // Handle "Start Fresh" choice — cleanup org and restart
  const handleStartFresh = async () => {
    if (isStartingFresh) return;
    setIsStartingFresh(true);

    try {
      // Temporarily set the org ID so resetAndCleanup knows what to delete
      if (savedStateForChoice?.organizationId) {
        setOrganizationId(savedStateForChoice.organizationId);
      }
      await resetAndCleanup(queryClient);
    } finally {
      setIsStartingFresh(false);
      setShowResumeChoice(false);
      setSavedStateForChoice(null);
    }
  };

  const renderStep = () => {
    const effectiveDomain = storeDomain || domain || '';

    switch (currentStep) {
      case 'website_input':
        return <WebsiteInputStep key="website" organizationId={organizationId} />;
      case 'manual_enrichment':
        return <ManualEnrichmentStep key="manual" organizationId={organizationId} />;
      case 'organization_selection':
        return <OrganizationSelectionStep key="org-selection" />;
      case 'pending_approval':
        return <PendingApprovalStep key="pending" />;
      case 'enrichment_loading':
        return (
          <EnrichmentLoadingStep
            key="loading"
            domain={effectiveDomain}
            organizationId={organizationId}
          />
        );
      case 'enrichment_result':
        return <EnrichmentResultStep key="result" />;
      case 'agent_config_confirm':
        return <AgentConfigConfirmStep key="agent-config-confirm" />;
      case 'skills_config':
        // Phase 7: Use platform skills if feature flag is enabled
        return USE_PLATFORM_SKILLS ? (
          <PlatformSkillConfigStep key="platform-config" />
        ) : (
          <SkillsConfigStep key="config" />
        );
      case 'complete':
        return <CompletionStep key="complete" />;
      default:
        return (
          <EnrichmentLoadingStep
            key="loading"
            domain={effectiveDomain}
            organizationId={organizationId}
          />
        );
    }
  };

  // Show resume vs start fresh choice dialog
  if (showResumeChoice) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-gray-950">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md mx-auto px-4"
        >
          <div className="rounded-2xl shadow-xl border border-gray-800 bg-gray-900 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-violet-500/20 flex items-center justify-center mx-auto mb-6">
              <RotateCcw className="w-8 h-8 text-violet-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-3">Welcome back</h2>
            <p className="text-gray-400 mb-6">
              You have an onboarding session in progress. Would you like to continue where you left off or start fresh?
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleResume}
                disabled={isResuming}
                className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                {isResuming ? 'Resuming...' : 'Resume where I left off'}
              </button>
              <button
                onClick={handleStartFresh}
                disabled={isStartingFresh}
                className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium transition-colors border border-gray-700 disabled:opacity-50"
              >
                {isStartingFresh ? 'Cleaning up...' : 'Start fresh'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-gray-950">
      <AnimatePresence mode="wait">{renderStep()}</AnimatePresence>
    </div>
  );
}
