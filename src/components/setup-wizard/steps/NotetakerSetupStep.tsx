import { useState } from 'react';
import { Video, Check, ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSetupWizard } from '@/lib/hooks/useSetupWizard';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function NotetakerSetupStep() {
  const { steps, setCurrentStep, completeStep, notetaker } = useSetupWizard();
  const { user } = useAuth();
  const { activeOrgId } = useOrgStore();
  const completed = steps.notetaker.completed;
  const calendarDone = steps.calendar.completed;
  const alreadyConnected = notetaker.isConnected && !completed;
  const [confirming, setConfirming] = useState(false);

  const handleConfirmConnected = async () => {
    if (!user?.id || !activeOrgId) return;
    setConfirming(true);
    try {
      const result = await completeStep(user.id, activeOrgId, 'notetaker');
      if (result.creditsAwarded) {
        toast.success(`+${result.creditsAmount} credits earned!`, { description: 'AI Notetaker confirmed' });
      }
    } finally {
      setConfirming(false);
    }
  };

  const handleEnable = async () => {
    if (!user?.id || !activeOrgId) return;
    try {
      await notetaker.enable();
      const result = await completeStep(user.id, activeOrgId, 'notetaker');
      if (result.creditsAwarded) {
        toast.success('+60 credits earned!', { description: 'AI Notetaker enabled' });
      }
    } catch (err) {
      toast.error('Failed to enable Notetaker');
    }
  };

  const handleSkip = async () => {
    if (!user?.id || !activeOrgId) return;
    const result = await completeStep(user.id, activeOrgId, 'notetaker');
    if (result.creditsAwarded) {
      toast.success('+60 credits earned!', { description: 'Notetaker step completed' });
    }
    setCurrentStep('crm');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className={cn(
          'flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center',
          completed ? 'bg-green-100 dark:bg-green-900/30' : 'bg-indigo-100 dark:bg-indigo-900/30'
        )}>
          {completed ? (
            <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
          ) : (
            <Video className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          )}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Enable AI Notetaker
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Automatically record and transcribe your meetings for AI-powered insights.
          </p>
        </div>
      </div>

      {completed ? (
        <div className="rounded-xl border border-green-200 dark:border-green-700/50 bg-green-50 dark:bg-green-900/10 p-4">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              AI Notetaker enabled
            </span>
          </div>
        </div>
      ) : alreadyConnected ? (
        <div className="rounded-xl border border-green-200 dark:border-green-700/50 bg-green-50 dark:bg-green-900/10 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              AI Notetaker is already enabled
            </span>
          </div>
          <Button
            onClick={handleConfirmConnected}
            disabled={confirming}
            className="w-full h-10 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg"
          >
            {confirming ? 'Confirming...' : 'Confirm & Earn +60 Credits'}
          </Button>
        </div>
      ) : !calendarDone ? (
        <div className="rounded-xl border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/10 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm text-amber-700 dark:text-amber-400">
              Connect Google Calendar first to enable the Notetaker
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentStep('calendar')}
            className="mt-2 text-amber-700 dark:text-amber-400"
          >
            <ArrowLeft className="w-3 h-3 mr-1" />
            Go to Calendar step
          </Button>
        </div>
      ) : !notetaker.isOrgEnabled ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600 dark:text-gray-300">
              Your organization admin needs to enable the Notetaker feature.
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            You can skip this step for now and come back later.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/50 p-5">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              Records meetings with an AI notetaker bot
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              Auto-transcribes for meeting summaries
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              Extracts action items and follow-ups
            </div>
          </div>

          <Button
            onClick={handleEnable}
            disabled={notetaker.isEnabling}
            className="w-full mt-4 h-10 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-lg"
          >
            {notetaker.isEnabling ? 'Enabling...' : 'Enable AI Notetaker'}
          </Button>
        </div>
      )}

      <div className="flex justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCurrentStep('calendar')}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={completed ? () => setCurrentStep('crm') : handleSkip}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          {completed ? 'Continue' : 'Skip for now'}
          <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
