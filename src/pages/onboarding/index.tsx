import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useOnboardingProgress, OnboardingStep } from '@/lib/hooks/useOnboardingProgress';
import { useOnboardingVersionReadOnly } from '@/lib/hooks/useOnboardingVersion';
import { WelcomeStep } from './WelcomeStep';
import { OrgSetupStep } from './OrgSetupStep';
import { TeamInviteStep } from './TeamInviteStep';
import { FathomConnectionStep } from './FathomConnectionStep';
import { CompletionStep } from './CompletionStep';
import { OnboardingV2 } from './v2/OnboardingV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { isInternalUser } from '@/lib/utils/userTypeUtils';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';

export default function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { needsOnboarding, currentStep, loading, resetOnboarding, completeStep } = useOnboardingProgress();
  const { version: onboardingVersion, loading: versionLoading } = useOnboardingVersionReadOnly();
  const { getActiveOrg, activeOrgId } = useOrgStore();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isResetting, setIsResetting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingEmailVerification, setIsCheckingEmailVerification] = useState(true);

  // Removed 'sync' step - meetings will sync in the background after reaching dashboard
  const steps: OnboardingStep[] = ['welcome', 'org_setup', 'team_invite', 'fathom_connect', 'complete'];

  // Check email verification status and waitlist status first
  useEffect(() => {
    const checkAccess = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        // If no session, redirect to login
        if (!session?.user) {
          navigate('/auth/login', { replace: true });
          return;
        }

        // If email is not verified, redirect to verify-email page
        if (!session.user.email_confirmed_at) {
          navigate(`/auth/verify-email?email=${encodeURIComponent(session.user.email || '')}`, { replace: true });
          return;
        }

        // Check if user is choosing a different organization (re-onboarding after leaving org)
        const searchParams = new URLSearchParams(window.location.search);
        const isChoosingOrg = searchParams.get('step') === 'organization_selection';

        // Check if user already has a profile (existing user re-onboarding)
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', session.user.id)
          .maybeSingle();

        const isExistingUser = !!existingProfile;

        // Allow access if:
        // 1. User is re-onboarding (choosing different org after leaving), OR
        // 2. User is existing user (already has profile)
        if (isChoosingOrg || isExistingUser) {
          console.log('[Onboarding] Allowing access - existing user or re-onboarding:', { isChoosingOrg, isExistingUser });
          setIsCheckingEmailVerification(false);
          return;
        }

        // For new users, check if they're on the waitlist with 'released' or 'converted' status
        const { data: waitlistEntry, error: waitlistError } = await supabase
          .from('meetings_waitlist')
          .select('id, status')
          .eq('email', session.user.email)
          .maybeSingle();

        // User must have been invited (released or converted status)
        // Pending = still waiting, null = never invited
        const isInvited = waitlistEntry && (waitlistEntry.status === 'released' || waitlistEntry.status === 'converted');

        if (!isInvited) {
          // User either has no waitlist entry or is still pending - no access to onboarding
          console.log('[Onboarding] User not invited (no waitlist entry or pending), denying access');
          navigate('/auth/login', { replace: true });
          return;
        }

        // Email is verified and user is invited, proceed with onboarding
        setIsCheckingEmailVerification(false);
      } catch (err) {
        console.error('Error checking access:', err);
        // On error, try to proceed anyway
        setIsCheckingEmailVerification(false);
      }
    };

    checkAccess();
  }, [navigate]);

  // Sync auth metadata (first_name, last_name) to profiles table on first onboarding load
  useEffect(() => {
    const syncAuthMetadataToProfile = async () => {
      try {
        if (!user) {
          console.log('[Onboarding] No user, skipping sync');
          return;
        }

        console.log('[Onboarding] Starting auth metadata sync for user:', user.id);

        // Get fresh auth user data
        const { data: { user: authUser }, error: getUserError } = await supabase.auth.getUser();

        if (getUserError) {
          console.error('[Onboarding] Error getting auth user:', getUserError);
          return;
        }

        console.log('[Onboarding] Auth user metadata:', {
          first_name: authUser?.user_metadata?.first_name,
          last_name: authUser?.user_metadata?.last_name,
        });

        // If no metadata to sync, skip
        if (!authUser?.user_metadata?.first_name && !authUser?.user_metadata?.last_name) {
          console.log('[Onboarding] No first_name or last_name in auth metadata, skipping sync');
          return;
        }

        // Check current profile state
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, email, first_name, last_name')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error('[Onboarding] Error fetching profile:', profileError);
          return;
        }

        console.log('[Onboarding] Current profile state:', {
          has_first_name: !!profile?.first_name,
          has_last_name: !!profile?.last_name,
          first_name: profile?.first_name,
          last_name: profile?.last_name,
        });

        // Sync if profile is missing names and auth metadata has them
        if (profile && (!profile.first_name || !profile.last_name)) {
          console.log('[Onboarding] Syncing auth metadata to profile...');

          let syncSuccess = false;
          for (let attempt = 1; attempt <= 3; attempt++) {
            const { error: updateError, data: updatedData } = await supabase
              .from('profiles')
              .update({
                first_name: authUser?.user_metadata?.first_name || profile.first_name || '',
                last_name: authUser?.user_metadata?.last_name || profile.last_name || '',
              })
              .eq('id', user.id)
              .select();

            if (updateError) {
              console.warn(`[Onboarding] Sync attempt ${attempt}/3 failed:`, updateError);
              if (attempt < 3) {
                await new Promise(r => setTimeout(r, 500 * attempt));
              }
            } else {
              console.log('[Onboarding] ✓ Successfully synced auth metadata to profile', {
                attempt,
                first_name: authUser?.user_metadata?.first_name,
                last_name: authUser?.user_metadata?.last_name,
                result: updatedData,
              });
              syncSuccess = true;
              break;
            }
          }

          if (!syncSuccess) {
            console.error('[Onboarding] Failed to sync after 3 attempts');
          }
        } else {
          console.log('[Onboarding] Profile already has names or no metadata to sync', {
            first_name: profile?.first_name,
            last_name: profile?.last_name,
          });
        }
      } catch (err) {
        console.error('[Onboarding] Exception during sync:', err);
      }
    };

    syncAuthMetadataToProfile();
  }, [user]);

  useEffect(() => {
    if (!loading && user && !isCheckingEmailVerification) {
      // Handle legacy 'sync' step - map to 'complete' since we removed sync step
      const mappedStep = currentStep === 'sync' ? 'complete' : currentStep;

      // Set initial step based on progress - but only if it's a valid step
      // For new users or reset users, always start at welcome (index 0)
      const stepIndex = steps.indexOf(mappedStep);
      if (stepIndex >= 0) {
        setCurrentStepIndex(stepIndex);
      } else {
        // Invalid or unrecognized step, start from beginning
        setCurrentStepIndex(0);
      }
    }
  }, [loading, user, currentStep, isCheckingEmailVerification]);

  // Save progress and move to next step
  const handleNext = useCallback(async () => {
    if (currentStepIndex < steps.length - 1) {
      const nextIndex = currentStepIndex + 1;
      const nextStep = steps[nextIndex];

      // Save progress to database
      setIsSaving(true);
      try {
        await completeStep(nextStep);
        setCurrentStepIndex(nextIndex);
      } catch (error) {
        console.error('Failed to save onboarding progress:', error);
        // Still advance locally even if save fails
        setCurrentStepIndex(nextIndex);
      } finally {
        setIsSaving(false);
      }
    }
  }, [currentStepIndex, steps, completeStep]);

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const handleComplete = () => {
    navigate('/meetings');
  };

  const handleReset = async () => {
    try {
      setIsResetting(true);
      await resetOnboarding();
      setCurrentStepIndex(0);
      // Small delay to show the reset happened
      setTimeout(() => {
        setIsResetting(false);
      }, 500);
    } catch (error) {
      console.error('Error resetting onboarding:', error);
      setIsResetting(false);
    }
  };

  if (loading || isCheckingEmailVerification || versionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#37bd7e]"></div>
      </div>
    );
  }

  // Render V2/V3 onboarding if feature flag is set
  // V3 uses the same OnboardingV2 component with enhanced enrichment (agent teams)
  if (onboardingVersion === 'v2' || onboardingVersion === 'v3') {
    const activeOrg = getActiveOrg();
    // Only pass domain if it's from an actual organization
    // For personal email users, let them provide their website or company info
    const domain = activeOrg?.company_domain || '';

    // organizationId may be empty for personal email users
    // OnboardingV2 will create an organization after collecting company info via website URL or Q&A
    const organizationId = activeOrgId || '';

    return (
      <OnboardingV2
        organizationId={organizationId}
        domain={domain}
        userEmail={user?.email}
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(74,74,117,0.25),transparent)] pointer-events-none" />
      
      <div className="relative w-full max-w-4xl">
        {/* Show completion message only for internal users who completed onboarding */}
        {!needsOnboarding && !loading && user && isInternalUser(user.email) && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-blue-500/20 border border-blue-500/30 rounded-lg"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-blue-300 font-medium mb-1">
                  Onboarding Complete
                </p>
                <p className="text-sm text-blue-400/80">
                  You've already completed onboarding. You can review the steps below, restart the flow, or return to the dashboard.
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={handleReset}
                  disabled={isResetting}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isResetting ? 'Resetting...' : 'Restart Onboarding'}
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="px-4 py-2 text-sm text-blue-400 hover:text-blue-300 border border-blue-500/30 hover:border-blue-500/50 rounded-lg transition-colors"
                >
                  Dashboard
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">
              Step {currentStepIndex + 1} of {steps.length}
            </span>
            <span className="text-sm text-gray-400">
              {Math.round(((currentStepIndex + 1) / steps.length) * 100)}%
            </span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
              transition={{ duration: 0.3 }}
              className="bg-[#37bd7e] h-2 rounded-full"
            />
          </div>
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          {currentStepIndex === 0 && (
            <WelcomeStep key="welcome" onNext={handleNext} />
          )}
          {currentStepIndex === 1 && (
            <OrgSetupStep key="org_setup" onNext={handleNext} onBack={handleBack} />
          )}
          {currentStepIndex === 2 && (
            <TeamInviteStep key="team_invite" onNext={handleNext} onBack={handleBack} />
          )}
          {currentStepIndex === 3 && (
            <FathomConnectionStep key="fathom" onNext={handleNext} onBack={handleBack} />
          )}
          {currentStepIndex === 4 && (
            <CompletionStep key="complete" onComplete={handleComplete} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

