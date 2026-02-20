import { Check } from 'lucide-react';
import { useSetupWizardStore, SETUP_STEPS, STEP_META, type SetupStep } from '@/lib/stores/setupWizardStore';
import { cn } from '@/lib/utils';

export function SetupWizardStepper() {
  const { steps, currentStep, setCurrentStep } = useSetupWizardStore();

  return (
    <div className="flex items-center justify-between">
      {SETUP_STEPS.map((step, index) => {
        const completed = steps[step].completed;
        const active = step === currentStep;
        const meta = STEP_META[step];

        return (
          <div key={step} className="flex items-center flex-1 last:flex-initial">
            {/* Step circle + label */}
            <button
              onClick={() => setCurrentStep(step)}
              className="flex flex-col items-center gap-1.5 group"
              title={meta.label}
            >
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all',
                completed
                  ? 'bg-green-500 text-white'
                  : active
                    ? 'bg-indigo-500 text-white ring-4 ring-indigo-500/20'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 group-hover:bg-gray-300 dark:group-hover:bg-gray-600'
              )}>
                {completed ? (
                  <Check className="w-4 h-4" />
                ) : (
                  index + 1
                )}
              </div>
              <span className={cn(
                'text-[10px] font-medium hidden sm:block max-w-[72px] text-center leading-tight',
                completed
                  ? 'text-green-600 dark:text-green-400'
                  : active
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-gray-400 dark:text-gray-500'
              )}>
                {meta.label}
              </span>
            </button>

            {/* Connector line */}
            {index < SETUP_STEPS.length - 1 && (
              <div className="flex-1 mx-2 mt-[-18px] sm:mt-[-24px]">
                <div className={cn(
                  'h-0.5 rounded-full transition-colors',
                  steps[SETUP_STEPS[index + 1]].completed || steps[step].completed
                    ? 'bg-green-300 dark:bg-green-700'
                    : 'bg-gray-200 dark:bg-gray-700'
                )} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
