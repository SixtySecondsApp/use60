import { Bot, Calendar, Video, Link2, Mail, Zap, Check, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSetupWizardStore, SETUP_STEPS, STEP_META, type SetupStep } from '@/lib/stores/setupWizardStore';
import { cn } from '@/lib/utils';

const stepIcons: Record<SetupStep, React.ElementType> = {
  calendar: Calendar,
  notetaker: Video,
  crm: Link2,
  followups: Mail,
  test: Zap,
};

export function SetupWizardWelcome() {
  const { steps, setCurrentStep } = useSetupWizardStore();

  const firstIncomplete = SETUP_STEPS.find(s => !steps[s].completed) || 'calendar';

  return (
    <div className="p-8">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 mb-4">
          <Bot className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Meet Sixty, your AI sales agent
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 max-w-sm mx-auto">
          I&apos;m your always-on teammate. Let&apos;s get connected so I can start working for you.
        </p>
      </div>

      {/* Credit incentive card */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/50 p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Complete setup to earn
            </p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-3xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                100
              </span>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                free credits
              </span>
            </div>
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500">
            20 per step
          </div>
        </div>
      </div>

      {/* Step list */}
      <div className="space-y-2 mb-6">
        {SETUP_STEPS.map((step) => {
          const Icon = stepIcons[step];
          const meta = STEP_META[step];
          const completed = steps[step].completed;

          return (
            <div
              key={step}
              className={cn(
                'flex items-center gap-3 p-3 rounded-xl transition-colors',
                completed
                  ? 'bg-green-50 dark:bg-green-900/10'
                  : 'bg-white dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/30'
              )}
            >
              <div className={cn(
                'flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center',
                completed
                  ? 'bg-green-100 dark:bg-green-900/30'
                  : 'bg-gray-100 dark:bg-gray-700/50'
              )}>
                {completed ? (
                  <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                ) : (
                  <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-sm font-medium',
                  completed
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-gray-900 dark:text-white'
                )}>
                  {meta.label}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {meta.description}
                </p>
              </div>
              {completed ? (
                <span className="text-xs font-medium text-green-600 dark:text-green-400">Done</span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  +20
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* CTA */}
      <Button
        onClick={() => setCurrentStep(firstIncomplete)}
        className="w-full h-11 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium rounded-xl shadow-sm"
      >
        Get Started
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );
}
