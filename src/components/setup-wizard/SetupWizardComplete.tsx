import { PartyPopper, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSetupWizardStore } from '@/lib/stores/setupWizardStore';

export function SetupWizardComplete() {
  const { closeWizard } = useSetupWizardStore();

  return (
    <div className="p-8 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 mb-4">
        <PartyPopper className="w-8 h-8 text-white" />
      </div>

      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        You're all set!
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Setup complete. Your workspace is ready to go.
      </p>

      {/* Credits earned card */}
      <div className="rounded-xl border border-green-200 dark:border-green-700/50 bg-green-50 dark:bg-green-900/20 p-5 mb-6 inline-block w-full max-w-xs mx-auto">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-green-600 dark:text-green-400" />
          <span className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wider">
            Total earned
          </span>
        </div>
        <div className="text-4xl font-bold text-green-700 dark:text-green-300">
          100
        </div>
        <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">credits</p>
      </div>

      <Button
        onClick={closeWizard}
        className="w-full max-w-xs h-11 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-medium rounded-xl"
      >
        Start Using 60
      </Button>
    </div>
  );
}
