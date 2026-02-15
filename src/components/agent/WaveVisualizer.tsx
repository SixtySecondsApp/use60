/**
 * WaveVisualizer — Dependency-based wave layout for orchestrator sequences
 *
 * Displays orchestrator steps in horizontal swim-lanes (waves) based on their
 * dependency chains. Steps with no dependencies are wave 0, steps depending
 * only on wave 0 are wave 1, etc. Steps within the same wave are rendered
 * vertically (parallel execution).
 */

import { CheckCircle2, Loader2, XCircle, SkipForward, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

// =============================================================================
// Types
// =============================================================================

export type StepStatus = 'pending' | 'running' | 'complete' | 'failed' | 'skipped';

export interface StepDefinition {
  name: string;
  depends_on?: string[];
  sales_only?: boolean;
  hitl?: boolean;
  criticality?: 'critical' | 'best-effort';
}

export interface LiveStepResult {
  step_name: string;
  status: StepStatus;
  duration_ms?: number;
  error?: string;
  skip_reason?: string;
}

export interface WaveVisualizerProps {
  eventType: string;
  liveResults?: LiveStepResult[];
  className?: string;
}

// =============================================================================
// Sequence Definitions (hardcoded client-side)
// =============================================================================

const SEQUENCES: Record<string, StepDefinition[]> = {
  meeting_ended: [
    { name: 'classify-call-type', depends_on: [] },
    { name: 'extract-action-items', depends_on: ['classify-call-type'], criticality: 'critical' },
    { name: 'detect-intents', depends_on: ['classify-call-type'] },
    { name: 'coaching-micro-feedback', depends_on: ['classify-call-type'], sales_only: true },
    { name: 'suggest-next-actions', depends_on: ['extract-action-items', 'detect-intents'] },
    { name: 'draft-followup-email', depends_on: ['extract-action-items', 'detect-intents'] },
    { name: 'update-crm-from-meeting', depends_on: ['extract-action-items'], sales_only: true },
    { name: 'create-tasks-from-actions', depends_on: ['extract-action-items'] },
    { name: 'notify-slack-summary', depends_on: ['suggest-next-actions', 'draft-followup-email', 'create-tasks-from-actions'] },
  ],
  pre_meeting_90min: [
    { name: 'enrich-attendees', depends_on: [] },
    { name: 'pull-crm-history', depends_on: ['enrich-attendees'] },
    { name: 'research-company-news', depends_on: ['enrich-attendees'] },
    { name: 'generate-briefing', depends_on: ['enrich-attendees', 'pull-crm-history', 'research-company-news'], criticality: 'critical' },
    { name: 'deliver-slack-briefing', depends_on: ['generate-briefing'], criticality: 'critical' },
  ],
  email_received: [
    { name: 'classify-email-intent', depends_on: [], criticality: 'critical' },
    { name: 'match-to-crm-contact', depends_on: [], criticality: 'critical' },
  ],
  proposal_generation: [
    { name: 'select-proposal-template', depends_on: [], criticality: 'critical' },
    { name: 'populate-proposal', depends_on: [], criticality: 'critical' },
    { name: 'generate-custom-sections', depends_on: [] },
    { name: 'present-for-review', depends_on: [], hitl: true, criticality: 'critical' },
  ],
  calendar_find_times: [
    { name: 'parse-scheduling-request', depends_on: [], criticality: 'critical' },
    { name: 'find-available-slots', depends_on: [], criticality: 'critical' },
    { name: 'present-time-options', depends_on: [], hitl: true, criticality: 'critical' },
  ],
  stale_deal_revival: [
    { name: 'research-trigger-events', depends_on: [] },
    { name: 'analyse-stall-reason', depends_on: [], criticality: 'critical' },
    { name: 'draft-reengagement', depends_on: [], hitl: true, criticality: 'critical' },
  ],
  campaign_daily_check: [
    { name: 'pull-campaign-metrics', depends_on: [], criticality: 'critical' },
    { name: 'classify-replies', depends_on: ['pull-campaign-metrics'], criticality: 'critical' },
    { name: 'generate-campaign-report', depends_on: ['classify-replies'], criticality: 'critical' },
    { name: 'deliver-campaign-slack', depends_on: ['generate-campaign-report'], criticality: 'critical' },
  ],
  coaching_weekly: [
    { name: 'aggregate-weekly-metrics', depends_on: [], criticality: 'critical' },
    { name: 'correlate-win-loss', depends_on: ['aggregate-weekly-metrics'] },
    { name: 'generate-coaching-digest', depends_on: ['correlate-win-loss'], criticality: 'critical' },
    { name: 'deliver-coaching-slack', depends_on: ['generate-coaching-digest'], criticality: 'critical' },
  ],
};

// =============================================================================
// Wave Computation
// =============================================================================

interface WaveGroup {
  wave: number;
  steps: Array<StepDefinition & { index: number }>;
}

function computeWaves(steps: StepDefinition[]): WaveGroup[] {
  const waveMap = new Map<string, number>();
  const groups: WaveGroup[] = [];

  // Compute wave for each step
  const computeWave = (stepName: string, visited = new Set<string>()): number => {
    if (waveMap.has(stepName)) return waveMap.get(stepName)!;

    const step = steps.find(s => s.name === stepName);
    if (!step) return 0;

    // Prevent circular dependencies
    if (visited.has(stepName)) return 0;
    visited.add(stepName);

    if (!step.depends_on || step.depends_on.length === 0) {
      waveMap.set(stepName, 0);
      return 0;
    }

    const maxDepWave = Math.max(...step.depends_on.map(dep => computeWave(dep, new Set(visited))));
    const wave = maxDepWave + 1;
    waveMap.set(stepName, wave);
    return wave;
  };

  // Compute all waves
  steps.forEach((step, index) => {
    const wave = computeWave(step.name);
    let group = groups.find(g => g.wave === wave);
    if (!group) {
      group = { wave, steps: [] };
      groups.push(group);
    }
    group.steps.push({ ...step, index });
  });

  return groups.sort((a, b) => a.wave - b.wave);
}

// =============================================================================
// Step Status Helpers
// =============================================================================

function getStepStatus(stepName: string, liveResults?: LiveStepResult[]): StepStatus {
  if (!liveResults) return 'pending';
  const result = liveResults.find(r => r.step_name === stepName);
  return result?.status || 'pending';
}

function getStepDuration(stepName: string, liveResults?: LiveStepResult[]): number | undefined {
  if (!liveResults) return undefined;
  const result = liveResults.find(r => r.step_name === stepName);
  return result?.duration_ms;
}

function getStepError(stepName: string, liveResults?: LiveStepResult[]): string | undefined {
  if (!liveResults) return undefined;
  const result = liveResults.find(r => r.step_name === stepName);
  return result?.error;
}

function getSkipReason(stepName: string, liveResults?: LiveStepResult[]): string | undefined {
  if (!liveResults) return undefined;
  const result = liveResults.find(r => r.step_name === stepName);
  return result?.skip_reason;
}

// =============================================================================
// Step Card Component
// =============================================================================

interface StepCardProps {
  step: StepDefinition;
  status: StepStatus;
  duration?: number;
  error?: string;
  skipReason?: string;
}

function StepCard({ step, status, duration, error, skipReason }: StepCardProps) {
  const isRunning = status === 'running';
  const isComplete = status === 'complete';
  const isFailed = status === 'failed';
  const isSkipped = status === 'skipped';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className={cn(
          'px-3 py-2.5 min-w-[180px] max-w-[220px]',
          step.criticality === 'critical' && 'border-2',
          step.criticality === 'best-effort' && 'border-dashed',
          isRunning && 'ring-2 ring-blue-400 ring-offset-2 dark:ring-blue-500 dark:ring-offset-gray-900',
          isComplete && 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800',
          isFailed && 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800',
          isSkipped && 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800'
        )}
      >
        <div className="flex items-start gap-2">
          <div className="shrink-0 mt-0.5">
            {isComplete && <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
            {isRunning && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </motion.div>
            )}
            {isFailed && <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />}
            {isSkipped && <SkipForward className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
            {status === 'pending' && <AlertCircle className="w-4 h-4 text-gray-300 dark:text-gray-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <div
              className={cn(
                'text-xs font-medium',
                isComplete && 'text-emerald-900 dark:text-emerald-200',
                isRunning && 'text-blue-900 dark:text-blue-200',
                isFailed && 'text-red-900 dark:text-red-200',
                isSkipped && 'text-gray-400 dark:text-gray-500 line-through',
                status === 'pending' && 'text-gray-600 dark:text-gray-400'
              )}
            >
              {step.name}
            </div>
            {duration !== undefined && (
              <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                {(duration / 1000).toFixed(1)}s
              </div>
            )}
            {error && (
              <div className="text-[10px] text-red-600 dark:text-red-400 mt-0.5 line-clamp-2">
                {error}
              </div>
            )}
            {skipReason && (
              <div className="text-[10px] text-gray-500 dark:text-gray-400 italic mt-0.5">
                {skipReason}
              </div>
            )}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {step.sales_only && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-800">
                  Sales only
                </Badge>
              )}
              {step.hitl && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-800">
                  Approval
                </Badge>
              )}
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function WaveVisualizer({ eventType, liveResults, className }: WaveVisualizerProps) {
  const sequence = SEQUENCES[eventType] || SEQUENCES.meeting_ended;
  const waves = computeWaves(sequence);

  return (
    <div className={cn('relative', className)}>
      <div className="flex items-start gap-6 overflow-x-auto pb-4">
        {waves.map((wave, waveIndex) => (
          <div key={wave.wave} className="flex flex-col items-center gap-4 relative">
            {/* Wave Label */}
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
              Wave {wave.wave}
            </div>

            {/* Steps in this wave */}
            <div className="flex flex-col gap-3">
              {wave.steps.map((step) => (
                <StepCard
                  key={step.name}
                  step={step}
                  status={getStepStatus(step.name, liveResults)}
                  duration={getStepDuration(step.name, liveResults)}
                  error={getStepError(step.name, liveResults)}
                  skipReason={getSkipReason(step.name, liveResults)}
                />
              ))}
            </div>

            {/* Connector to next wave */}
            {waveIndex < waves.length - 1 && (
              <div className="absolute top-12 -right-3 w-6 h-0.5 bg-gray-300 dark:bg-gray-700">
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-l-4 border-l-gray-300 dark:border-l-gray-700 border-y-[3px] border-y-transparent" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-800">
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
          Legend
        </div>
        <div className="flex flex-wrap gap-4 text-[11px] text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm border-2 border-gray-400" />
            <span>Critical step</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm border border-dashed border-gray-400" />
            <span>Best-effort</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-800">
              Sales only
            </Badge>
            <span>Sales calls only</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-800">
              Approval
            </Badge>
            <span>Human approval</span>
          </div>
        </div>
      </div>
    </div>
  );
}
