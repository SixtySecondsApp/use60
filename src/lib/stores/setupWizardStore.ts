import { create } from 'zustand';
import { supabase } from '@/lib/supabase/clientV2';

export type SetupStep = 'calendar' | 'notetaker' | 'crm' | 'followups' | 'test';

export const SETUP_STEPS: SetupStep[] = ['calendar', 'notetaker', 'crm', 'followups', 'test'];

export const STEP_META: Record<SetupStep, { label: string; description: string }> = {
  calendar: { label: 'Connect Calendar', description: 'Sync your calendar to auto-prepare for meetings' },
  notetaker: { label: 'Enable AI Notetaker', description: 'Record and transcribe your meetings automatically' },
  crm: { label: 'Connect CRM', description: 'Sync your deals and contacts with HubSpot or Attio' },
  followups: { label: 'Configure Follow-ups', description: 'Set your default follow-up email preferences' },
  test: { label: 'Run Your First Test', description: 'Try out the AI copilot with a quick action' },
};

export interface StepStatus {
  completed: boolean;
  creditsAwarded: boolean;
}

export interface CompleteStepResult {
  success: boolean;
  creditsAwarded: boolean;
  creditsAmount: number;
  allCompleted: boolean;
  error?: string;
}

interface SetupWizardState {
  // UI
  isOpen: boolean;
  showWelcome: boolean;
  currentStep: SetupStep;

  // Progress (from DB)
  steps: Record<SetupStep, StepStatus>;
  allCompleted: boolean;
  isDismissed: boolean;
  isLoading: boolean;
  hasFetched: boolean;

  // Actions
  openWizard: () => void;
  closeWizard: () => void;
  setCurrentStep: (step: SetupStep) => void;
  fetchProgress: (userId: string, orgId: string) => Promise<void>;
  completeStep: (userId: string, orgId: string, step: SetupStep) => Promise<CompleteStepResult>;
  markStepCompleted: (step: SetupStep) => void;
  reset: () => void;
}

const defaultSteps: Record<SetupStep, StepStatus> = {
  calendar: { completed: false, creditsAwarded: false },
  notetaker: { completed: false, creditsAwarded: false },
  crm: { completed: false, creditsAwarded: false },
  followups: { completed: false, creditsAwarded: false },
  test: { completed: false, creditsAwarded: false },
};

export const useSetupWizardStore = create<SetupWizardState>((set, get) => ({
  isOpen: false,
  showWelcome: true,
  currentStep: 'calendar',
  steps: { ...defaultSteps },
  allCompleted: false,
  isDismissed: false,
  isLoading: false,
  hasFetched: false,

  openWizard: () => {
    const state = get();
    const anyCompleted = SETUP_STEPS.some(s => state.steps[s].completed);
    set({ isOpen: true, showWelcome: !anyCompleted });
  },

  closeWizard: () => set({ isOpen: false }),

  setCurrentStep: (step) => set({ currentStep: step, showWelcome: false }),

  fetchProgress: async (userId, orgId) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from('setup_wizard_progress')
        .select('step_calendar, step_notetaker, step_crm, step_followups, step_test, credits_calendar, credits_notetaker, credits_crm, credits_followups, credits_test, all_completed, is_dismissed')
        .eq('user_id', userId)
        .eq('org_id', orgId)
        .maybeSingle();

      if (error) {
        console.error('Failed to fetch setup wizard progress:', error);
        set({ isLoading: false, hasFetched: true });
        return;
      }

      if (data) {
        const steps: Record<SetupStep, StepStatus> = {
          calendar: { completed: data.step_calendar, creditsAwarded: data.credits_calendar },
          notetaker: { completed: data.step_notetaker, creditsAwarded: data.credits_notetaker },
          crm: { completed: data.step_crm, creditsAwarded: data.credits_crm },
          followups: { completed: data.step_followups, creditsAwarded: data.credits_followups },
          test: { completed: data.step_test, creditsAwarded: data.credits_test },
        };

        // Find first incomplete step
        const firstIncomplete = SETUP_STEPS.find(s => !steps[s].completed) || 'calendar';

        set({
          steps,
          allCompleted: data.all_completed,
          isDismissed: data.is_dismissed,
          currentStep: firstIncomplete,
          isLoading: false,
          hasFetched: true,
        });
      } else {
        set({ isLoading: false, hasFetched: true });
      }
    } catch (err) {
      console.error('Setup wizard fetch error:', err);
      set({ isLoading: false, hasFetched: true });
    }
  },

  completeStep: async (userId, orgId, step) => {
    try {
      const { data, error } = await (supabase.rpc as any)('complete_setup_wizard_step', {
        p_user_id: userId,
        p_org_id: orgId,
        p_step: step,
      });

      if (error) {
        console.error('Failed to complete setup wizard step:', error);
        return { success: false, creditsAwarded: false, creditsAmount: 0, allCompleted: false, error: error.message };
      }

      const result = data as { success: boolean; credits_awarded: boolean; credits_amount: number; all_completed: boolean };

      // Update local state
      set(state => {
        const newSteps = { ...state.steps };
        newSteps[step] = { completed: true, creditsAwarded: true };
        const firstIncomplete = SETUP_STEPS.find(s => !newSteps[s].completed);
        return {
          steps: newSteps,
          allCompleted: result.all_completed,
          currentStep: firstIncomplete || state.currentStep,
        };
      });

      return {
        success: result.success,
        creditsAwarded: result.credits_awarded,
        creditsAmount: result.credits_amount,
        allCompleted: result.all_completed,
      };
    } catch (err: any) {
      console.error('Setup wizard complete step error:', err);
      return { success: false, creditsAwarded: false, creditsAmount: 0, allCompleted: false, error: err.message };
    }
  },

  markStepCompleted: (step) => {
    set(state => {
      const newSteps = { ...state.steps };
      newSteps[step] = { ...newSteps[step], completed: true };
      return { steps: newSteps };
    });
  },

  reset: () => set({
    isOpen: false,
    showWelcome: true,
    currentStep: 'calendar',
    steps: { ...defaultSteps },
    allCompleted: false,
    isDismissed: false,
    isLoading: false,
    hasFetched: false,
  }),
}));
