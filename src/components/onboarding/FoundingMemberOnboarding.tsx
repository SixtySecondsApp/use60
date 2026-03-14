/**
 * FoundingMemberOnboarding — 3-step in-app modal for new Founding Members.
 *
 * Shows once on first login. Dismissed state persists in localStorage.
 * Only renders if the user's subscription plan slug is "founding" and active.
 *
 * Steps:
 *   1. Set up your API key
 *   2. Join the community
 *   3. Your 500 credits
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Users, Coins, ArrowRight, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useOrgSubscription } from '@/lib/hooks/useSubscription';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'founding_onboarding_dismissed';
const SLACK_INVITE_URL = 'https://join.slack.com/share/enQtMTA2OTU3NTcxNjIzNTUtNDQ0Mjg0ZmQxNDkxNjRhODczYTNhODM0MDk0ZjczMTliNjYyNDBjYzI3Yzc1NjFlMzEyZGQ4ODU2YmE2OWI1Yg';

interface StepConfig {
  title: string;
  description: string;
  icon: React.ReactNode;
  linkLabel: string;
  linkTo: string;
  isExternal?: boolean;
}

const STEPS: StepConfig[] = [
  {
    title: 'Set up your API key',
    description:
      'Connect your AI provider so 60 can research leads, prep for meetings, and write follow-ups on your behalf.',
    icon: <Settings className="h-5 w-5" />,
    linkLabel: 'Go to API settings',
    linkTo: '/settings/api-keys',
  },
  {
    title: 'Join the community',
    description:
      'Our private Slack group is where founding members swap tips, request features, and get early access to new capabilities.',
    icon: <Users className="h-5 w-5" />,
    linkLabel: 'Join Slack',
    linkTo: SLACK_INVITE_URL,
    isExternal: true,
  },
  {
    title: 'Your 500 credits',
    description:
      'Credits power every AI action -- research, meeting prep, follow-ups, proposals. They never expire, so use them at your own pace.',
    icon: <Coins className="h-5 w-5" />,
    linkLabel: 'View your credits',
    linkTo: '/settings/credits',
  },
];

export function FoundingMemberOnboarding() {
  const orgId = useOrgId();
  const { data: subscription } = useOrgSubscription(orgId);
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // Determine if user is a founding member with an active subscription
  const isFoundingMember =
    subscription?.status === 'active' &&
    subscription?.plan?.slug === 'founding';

  useEffect(() => {
    if (!isFoundingMember) return;

    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) {
      setOpen(true);
    }
  }, [isFoundingMember]);

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setOpen(false);
    setCurrentStep(0);
  }, []);

  const handleNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      dismiss();
    }
  }, [currentStep, dismiss]);

  const handleStepLink = useCallback(
    (step: StepConfig) => {
      if (step.isExternal) {
        window.open(step.linkTo, '_blank', 'noopener');
      } else {
        dismiss();
        navigate(step.linkTo);
      }
    },
    [dismiss, navigate],
  );

  // Don't render anything if not a founding member or already dismissed
  if (!isFoundingMember) return null;

  const step = STEPS[currentStep];
  const isLastStep = currentStep === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Welcome, Founding Member
          </DialogTitle>
          <DialogDescription>
            Three quick things to get the most out of 60.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 pt-1">
          {STEPS.map((_, idx) => (
            <div
              key={idx}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                idx <= currentStep
                  ? 'bg-blue-500'
                  : 'bg-gray-200 dark:bg-gray-700',
              )}
            />
          ))}
        </div>

        {/* Current step content */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400">
              {step.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {step.title}
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                {step.description}
              </p>
              <button
                type="button"
                onClick={() => handleStepLink(step)}
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                {step.linkLabel}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={dismiss}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Skip
          </button>
          <Button onClick={handleNext} size="sm">
            {isLastStep ? (
              <>
                <Check className="mr-1.5 h-4 w-4" />
                Get started
              </>
            ) : (
              <>
                Next
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
