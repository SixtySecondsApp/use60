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

import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useOnboardingV2Store, type OnboardingV2Step } from '@/lib/stores/onboardingV2Store';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';
import { WebsiteInputStep } from './WebsiteInputStep';
import { ManualEnrichmentStep } from './ManualEnrichmentStep';
import { OrganizationSelectionStep } from './OrganizationSelectionStep';
import { PendingApprovalStep } from './PendingApprovalStep';
import { EnrichmentLoadingStep } from './EnrichmentLoadingStep';
import { EnrichmentResultStep } from './EnrichmentResultStep';
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
  'skills_config',
  'complete',
];

interface OnboardingV2Props {
  organizationId: string;
  domain?: string;
  userEmail?: string;
}

export function OnboardingV2({ organizationId, domain, userEmail }: OnboardingV2Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    currentStep,
    domain: storeDomain,
    setOrganizationId,
    setDomain,
    setUserEmail,
    setStep,
    startEnrichment,
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

  // Restore state from localStorage on mount (session recovery)
  useEffect(() => {
    const restoreState = async () => {
      if (!user) return;

      // Check for saved state in localStorage
      const savedState = localStorage.getItem(`sixty_onboarding_${user.id}`);

      if (savedState) {
        // Validate session is still active before restoring
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          // Session is active - restore state
          try {
            const parsed = JSON.parse(savedState);
            console.log('[OnboardingV2] Restored state from localStorage:', parsed);

            // Restore state to Zustand store
            if (parsed.currentStep) setStep(parsed.currentStep);
            if (parsed.domain) setDomain(parsed.domain);
            if (parsed.organizationId) setOrganizationId(parsed.organizationId);
            if (parsed.websiteUrl) useOnboardingV2Store.setState({ websiteUrl: parsed.websiteUrl });
            if (parsed.manualData) useOnboardingV2Store.setState({ manualData: parsed.manualData });
            if (parsed.enrichment) useOnboardingV2Store.setState({ enrichment: parsed.enrichment });
            if (parsed.skillConfigs) useOnboardingV2Store.setState({ skillConfigs: parsed.skillConfigs });

            toast.info('Restored your progress');
          } catch (error) {
            console.error('[OnboardingV2] Failed to parse saved state:', error);
            // Clear invalid state
            localStorage.removeItem(`sixty_onboarding_${user.id}`);
          }
        } else {
          // Session expired - clear stale state
          console.log('[OnboardingV2] Session expired, clearing stale state');
          localStorage.removeItem(`sixty_onboarding_${user.id}`);
        }
      }
    };

    restoreState();
  }, [user]);

  // Read step from database on mount for resumption after logout
  useEffect(() => {
    const loadProgressFromDatabase = async () => {
      if (!user) return;

      try {
        const { data: progress } = await supabase
          .from('user_onboarding_progress')
          .select('onboarding_step')
          .eq('user_id', user.id)
          .maybeSingle();

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

      // Fallback: determine initial step based on onboarding context
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

    loadProgressFromDatabase();
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

  // Check for existing organization when business email signs up
  useEffect(() => {
    const checkBusinessEmailOrg = async () => {
      // Only run this check in early stages of onboarding (before pending approval)
      // Skip if user is past organization selection or in pending approval
      const stepsToSkip = ['pending_approval', 'enrichment_loading', 'enrichment_result', 'skills_config', 'complete'];
      if (stepsToSkip.includes(currentStep)) return;

      // Only run this check once when component mounts with business email
      if (!userEmail || !domain) return;

      const { setStep } = useOnboardingV2Store.getState();

      try {
        // Call RPC to check if org exists for this email domain
        const { data: existingOrg } = await supabase
          .rpc('check_existing_org_by_email_domain', {
            p_email: userEmail,
          })
          .maybeSingle();

        if (existingOrg && existingOrg.should_request_join) {
          console.log('[OnboardingV2] Found existing org for business email:', existingOrg.org_name);
          // Set step to organization selection to allow join request
          setStep('organization_selection');
          // Update store with similar orgs data
          useOnboardingV2Store.setState({
            similarOrganizations: [{
              id: existingOrg.org_id,
              name: existingOrg.org_name,
              company_domain: existingOrg.org_domain,
              member_count: existingOrg.member_count,
              similarity_score: 1.0, // Exact match
            }],
            matchSearchTerm: existingOrg.org_domain,
          });
        }
      } catch (error) {
        console.error('[OnboardingV2] Error checking for existing org:', error);
        // Continue to enrichment on error
      }
    };

    checkBusinessEmailOrg();
  }, [userEmail, domain, currentStep]);

  // Auto-start enrichment for corporate email path (if no existing org found)
  useEffect(() => {
    const effectiveDomain = storeDomain || domain;
    if (currentStep === 'enrichment_loading' && effectiveDomain && !userEmail) {
      startEnrichment(organizationId, effectiveDomain);
    }
  }, [currentStep, storeDomain, domain, organizationId, userEmail, startEnrichment]);

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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-gray-950">
      <AnimatePresence mode="wait">{renderStep()}</AnimatePresence>
    </div>
  );
}
