import { useState } from 'react';
import { Link2, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSetupWizard } from '@/lib/hooks/useSetupWizard';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function CrmSetupStep() {
  const { steps, setCurrentStep, completeStep, hubspot, attio } = useSetupWizard();
  const { user } = useAuth();
  const { activeOrgId } = useOrgStore();
  const completed = steps.crm.completed;
  const alreadyConnected = (hubspot.isConnected || attio.isConnected) && !completed;
  const [confirming, setConfirming] = useState(false);

  const handleConfirmConnected = async () => {
    if (!user?.id || !activeOrgId) return;
    setConfirming(true);
    try {
      const result = await completeStep(user.id, activeOrgId, 'crm');
      if (result.creditsAwarded) {
        toast.success(`+${result.creditsAmount} credits earned!`, { description: 'CRM connected' });
      }
    } finally {
      setConfirming(false);
    }
  };

  const handleConnect = async (provider: 'hubspot' | 'attio') => {
    localStorage.setItem('setupWizard:pendingOAuth', 'crm');
    if (provider === 'hubspot') {
      await hubspot.connectHubSpot();
    } else {
      await attio.connectAttio();
    }
  };

  const handleSkip = async () => {
    if (!user?.id || !activeOrgId) return;
    const result = await completeStep(user.id, activeOrgId, 'crm');
    if (result.creditsAwarded) {
      toast.success('+60 credits earned!', { description: 'CRM step completed' });
    }
    setCurrentStep('followups');
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
            <Link2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          )}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Connect Your CRM
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Sync your deals and contacts for pipeline intelligence and meeting context.
          </p>
        </div>
      </div>

      {completed ? (
        <div className="rounded-xl border border-green-200 dark:border-green-700/50 bg-green-50 dark:bg-green-900/10 p-4">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              CRM connected
              {hubspot.isConnected && ' (HubSpot)'}
              {attio.isConnected && ' (Attio)'}
            </span>
          </div>
        </div>
      ) : alreadyConnected ? (
        <div className="rounded-xl border border-green-200 dark:border-green-700/50 bg-green-50 dark:bg-green-900/10 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              CRM already connected
              {hubspot.isConnected && ' (HubSpot)'}
              {attio.isConnected && ' (Attio)'}
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
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {/* HubSpot card */}
          <div className={cn(
            'rounded-xl border p-4 flex flex-col items-center gap-3 transition-colors',
            hubspot.isConnected
              ? 'border-green-200 dark:border-green-700/50 bg-green-50 dark:bg-green-900/10'
              : 'border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600'
          )}>
            <div className="w-10 h-10 rounded-lg bg-[#FF7A59]/10 flex items-center justify-center">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path d="M17.08 9.43V7.1a1.7 1.7 0 0 0 .98-1.53v-.05a1.7 1.7 0 0 0-1.7-1.7h-.05a1.7 1.7 0 0 0-1.7 1.7v.05c0 .66.38 1.23.93 1.51v2.35a4.47 4.47 0 0 0-2.12 1.1l-5.57-4.33a1.99 1.99 0 0 0 .05-.42 2.01 2.01 0 1 0-2.01 2.01c.35 0 .68-.1.97-.27l5.47 4.26a4.5 4.5 0 0 0 .66 5.31l-1.57 1.57a1.37 1.37 0 0 0-.4-.07 1.4 1.4 0 1 0 1.4 1.4c0-.14-.03-.28-.07-.4l1.55-1.55a4.5 4.5 0 1 0 3.17-10.73z" fill="#FF7A59"/>
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-900 dark:text-white">HubSpot</span>
            {hubspot.isConnected ? (
              <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <Check className="w-3 h-3" />
                Connected
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleConnect('hubspot')}
                disabled={hubspot.loading}
                className="w-full text-xs"
              >
                {hubspot.loading ? 'Connecting...' : 'Connect'}
              </Button>
            )}
          </div>

          {/* Attio card */}
          <div className={cn(
            'rounded-xl border p-4 flex flex-col items-center gap-3 transition-colors',
            attio.isConnected
              ? 'border-green-200 dark:border-green-700/50 bg-green-50 dark:bg-green-900/10'
              : 'border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600'
          )}>
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-900 dark:text-white">Attio</span>
            {attio.isConnected ? (
              <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <Check className="w-3 h-3" />
                Connected
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleConnect('attio')}
                disabled={attio.loading}
                className="w-full text-xs"
              >
                {attio.loading ? 'Connecting...' : 'Connect'}
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCurrentStep('notetaker')}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={completed ? () => setCurrentStep('followups') : handleSkip}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          {completed ? 'Continue' : 'Skip for now'}
          <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
