import { useState } from 'react';
import { Calendar, Check, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSetupWizard } from '@/lib/hooks/useSetupWizard';
import { useGoogleOAuthInitiate } from '@/lib/hooks/useGoogleIntegration';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { cn } from '@/lib/utils';

export function CalendarSetupStep() {
  const { steps, setCurrentStep, completeStep, google } = useSetupWizard();
  const { user } = useAuth();
  const { activeOrgId } = useOrgStore();
  const completed = steps.calendar.completed;
  const alreadyConnected = google.isConnected && !completed;
  const { mutate: initiateOAuth, isPending } = useGoogleOAuthInitiate();
  const [confirming, setConfirming] = useState(false);

  const handleConfirmConnected = async () => {
    if (!user?.id || !activeOrgId) return;
    setConfirming(true);
    try {
      await completeStep(user.id, activeOrgId, 'calendar');
    } finally {
      setConfirming(false);
    }
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
            <Calendar className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          )}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Connect Google Calendar
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            I need your calendar to prep you for meetings and keep your schedule in sync.
          </p>
        </div>
      </div>

      {completed ? (
        <div className="rounded-xl border border-green-200 dark:border-green-700/50 bg-green-50 dark:bg-green-900/10 p-4">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              Connected
            </span>
            {google.email && (
              <span className="text-xs text-green-600 dark:text-green-400/70">
                ({google.email})
              </span>
            )}
          </div>
        </div>
      ) : alreadyConnected ? (
        /* Already connected before wizard — just confirm and earn credits */
        <div className="rounded-xl border border-green-200 dark:border-green-700/50 bg-green-50 dark:bg-green-900/10 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              Google Calendar is already connected
            </span>
            {google.email && (
              <span className="text-xs text-green-600 dark:text-green-400/70">
                ({google.email})
              </span>
            )}
          </div>
          <Button
            onClick={handleConfirmConnected}
            disabled={confirming}
            className="w-full h-10 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg"
          >
            {confirming ? 'Confirming...' : 'Confirm & Earn +20 Credits'}
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/50 p-5">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              I'll auto-prepare briefings before your calls
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              I'll sync your events for smart scheduling
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              Required for me to join meetings as your notetaker
            </div>
          </div>

          <Button
            onClick={() => {
              localStorage.setItem('setupWizard:pendingOAuth', 'calendar');
              initiateOAuth({});
            }}
            disabled={isPending}
            className="w-full mt-4 h-10 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-lg"
          >
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {isPending ? 'Connecting...' : 'Connect Google Calendar'}
          </Button>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCurrentStep('notetaker')}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          {completed ? 'Continue' : 'Skip for now'}
          <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
