import { Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Progress } from '@/components/ui/progress';
import { useSetupWizard } from '@/lib/hooks/useSetupWizard';
import { cn } from '@/lib/utils';

interface SetupWizardSidebarIndicatorProps {
  isCollapsed?: boolean;
}

export function SetupWizardSidebarIndicator({ isCollapsed = false }: SetupWizardSidebarIndicatorProps) {
  const { completedCount, totalSteps, shouldShowIndicator, openWizard } = useSetupWizard();

  const progressPercent = (completedCount / totalSteps) * 100;

  return (
    <AnimatePresence>
      {shouldShowIndicator && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          onClick={openWizard}
          title={`Setup: ${completedCount}/${totalSteps} complete`}
          className={cn(
            'group transition-all rounded-xl',
            isCollapsed
              ? 'w-9 h-9 mx-auto flex items-center justify-center relative mb-1'
              : 'w-full px-3 py-2.5 flex flex-col gap-1.5 mb-2',
            'bg-indigo-50/70 hover:bg-indigo-100/80 dark:bg-indigo-900/10 dark:hover:bg-indigo-900/20',
            'border border-indigo-200/50 dark:border-indigo-700/30'
          )}
        >
          {isCollapsed ? (
            <>
              {/* Circular progress ring */}
              <svg className="w-7 h-7 -rotate-90" viewBox="0 0 28 28">
                <circle
                  cx="14"
                  cy="14"
                  r="11"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className="text-gray-200 dark:text-gray-700"
                />
                <circle
                  cx="14"
                  cy="14"
                  r="11"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeDasharray={`${progressPercent * 0.691} 69.1`}
                  strokeLinecap="round"
                  className="text-indigo-500 transition-all duration-500"
                />
              </svg>
              <Sparkles className="w-3 h-3 text-indigo-500 absolute" />
            </>
          ) : (
            <>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                    Setup
                  </span>
                </div>
                <span className="text-[10px] font-semibold text-indigo-500 dark:text-indigo-400">
                  {completedCount}/{totalSteps}
                </span>
              </div>
              <Progress value={progressPercent} className="h-1.5 bg-indigo-100 dark:bg-indigo-900/30 [&>div]:bg-indigo-500" />
            </>
          )}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
