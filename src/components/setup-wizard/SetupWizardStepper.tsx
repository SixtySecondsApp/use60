import { useSetupWizardStore, SETUP_STEPS, STEP_META } from '@/lib/stores/setupWizardStore';
import { cn } from '@/lib/utils';

export function SetupWizardStepper() {
  const { steps, currentStep, setCurrentStep } = useSetupWizardStore();

  return (
    <div className="flex items-center justify-center gap-1.5">
      {SETUP_STEPS.map((step) => {
        const completed = steps[step].completed;
        const active = step === currentStep;
        const meta = STEP_META[step];

        return (
          <button
            key={step}
            onClick={() => setCurrentStep(step)}
            className="group"
            title={meta.label}
          >
            <div
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                active
                  ? 'w-6 bg-blue-500'
                  : completed
                    ? 'w-1.5 bg-blue-300 group-hover:bg-blue-400'
                    : 'w-1.5 bg-gray-200 dark:bg-gray-700 group-hover:bg-gray-300 dark:group-hover:bg-gray-600'
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
