import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { useSetupWizardStore } from '@/lib/stores/setupWizardStore';
import { SetupWizardWelcome } from './SetupWizardWelcome';
import { SetupWizardStepper } from './SetupWizardStepper';
import { CalendarSetupStep } from './steps/CalendarSetupStep';
import { NotetakerSetupStep } from './steps/NotetakerSetupStep';
import { CrmSetupStep } from './steps/CrmSetupStep';
import { FollowUpSetupStep } from './steps/FollowUpSetupStep';
import { TestSetupStep } from './steps/TestSetupStep';
import { SetupWizardComplete } from './SetupWizardComplete';

const stepComponents = {
  calendar: CalendarSetupStep,
  notetaker: NotetakerSetupStep,
  crm: CrmSetupStep,
  followups: FollowUpSetupStep,
  test: TestSetupStep,
};

export function SetupWizardDialog() {
  const { isOpen, closeWizard, showWelcome, currentStep, allCompleted } = useSetupWizardStore();

  const StepComponent = stepComponents[currentStep];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) closeWizard(); }}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden border-gray-200 dark:border-gray-700/50 [&>button]:hidden">
        <AnimatePresence mode="wait">
          {allCompleted ? (
            <motion.div
              key="complete"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <SetupWizardComplete />
            </motion.div>
          ) : showWelcome ? (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <SetupWizardWelcome />
            </motion.div>
          ) : (
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="p-6">
                <SetupWizardStepper />
                <div className="mt-6">
                  <StepComponent />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
