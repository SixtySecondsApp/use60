/**
 * StepVisualizer — Orchestrator step visualization for demo simulations
 *
 * Displays a vertical timeline of orchestrator steps with status indicators,
 * timers, and gating logic for sales-only and coaching steps.
 */

import { CheckCircle2, Loader2, Clock, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

export type StepStatus = 'pending' | 'running' | 'complete' | 'skipped' | 'approval';

export interface SimStep {
  name: string;
  delayMs: number;
  blocksRevealed: number;
  gated?: 'sales-only' | 'coaching';
}

export interface DemoScenarioLike {
  callType?: { isSales: boolean };
}

// =============================================================================
// Helper Functions
// =============================================================================

export function getStepStatus(
  stepIndex: number,
  runningStepIndex: number,
  completedStepIndex: number,
  step: SimStep,
  scenario: DemoScenarioLike
): StepStatus {
  // Check if step should be skipped
  const shouldSkip =
    (step.gated === 'sales-only' && !scenario.callType?.isSales) ||
    (step.gated === 'coaching' && !scenario.callType?.isSales);

  if (shouldSkip && stepIndex <= completedStepIndex) {
    return 'skipped';
  }

  if (stepIndex < runningStepIndex) {
    // Approval steps that completed
    if (step.delayMs === 0 && step.name.includes('HITL')) {
      return 'approval';
    }
    return 'complete';
  }

  if (stepIndex === runningStepIndex) {
    // Currently running or awaiting approval
    if (step.delayMs === 0 && step.name.includes('HITL')) {
      return 'approval';
    }
    return 'running';
  }

  return 'pending';
}

// =============================================================================
// Component
// =============================================================================

export interface StepVisualizerProps {
  steps: SimStep[];
  runningStepIndex?: number;
  completedStepIndex?: number;
  stepTimers?: Record<number, number>;
  scenario: DemoScenarioLike;
}

export function StepVisualizer({
  steps,
  runningStepIndex = -1,
  completedStepIndex = -1,
  stepTimers = {},
  scenario,
}: StepVisualizerProps) {
  return (
    <div className="space-y-0">
      {steps.map((step, i) => {
        const status = getStepStatus(i, runningStepIndex, completedStepIndex, step, scenario);
        const elapsed = stepTimers[i] || 0;
        const duration = status === 'complete' && step.delayMs > 0
          ? `${(step.delayMs / 1000).toFixed(1)}s`
          : status === 'running' && elapsed > 0
          ? `${(elapsed / 1000).toFixed(1)}s...`
          : undefined;

        const isSkipped = status === 'skipped';
        const skipReason = step.gated === 'sales-only' ? 'Non-sales' : step.gated === 'coaching' ? 'Coaching disabled' : '';

        return (
          <div key={i} className="flex items-start gap-3">
            {/* Connector */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold',
                  status === 'complete'
                    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                    : status === 'running'
                    ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                    : status === 'approval'
                    ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400'
                    : status === 'skipped'
                    ? 'bg-gray-100 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                )}
              >
                {status === 'complete' ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : status === 'running' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : status === 'approval' ? (
                  <Clock className="w-3.5 h-3.5" />
                ) : status === 'skipped' ? (
                  <SkipForward className="w-3.5 h-3.5" />
                ) : (
                  i + 1
                )}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    'w-0.5 h-6',
                    status === 'complete'
                      ? 'bg-emerald-300 dark:bg-emerald-600'
                      : status === 'skipped'
                      ? 'bg-gray-200 dark:bg-gray-700/50'
                      : 'bg-gray-200 dark:bg-gray-700'
                  )}
                />
              )}
            </div>
            {/* Label */}
            <div className="pt-1 pb-3">
              <div
                className={cn(
                  'text-[13px] font-medium',
                  status === 'complete'
                    ? 'text-gray-900 dark:text-gray-200'
                    : status === 'running'
                    ? 'text-blue-600 dark:text-blue-400'
                    : status === 'approval'
                    ? 'text-amber-600 dark:text-amber-400'
                    : status === 'skipped'
                    ? 'text-gray-400 dark:text-gray-500 line-through'
                    : 'text-gray-400 dark:text-gray-500'
                )}
              >
                {step.name}
              </div>
              {duration && (
                <div
                  className={cn(
                    'text-[11px]',
                    status === 'skipped' ? 'text-gray-400 dark:text-gray-500 italic' : 'text-gray-400'
                  )}
                >
                  {duration}
                </div>
              )}
              {isSkipped && skipReason && (
                <div className="text-[11px] text-gray-400 dark:text-gray-500 italic mt-0.5">
                  {skipReason}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
