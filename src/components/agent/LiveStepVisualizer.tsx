/**
 * LiveStepVisualizer — Real-time orchestrator step visualization
 *
 * Displays a vertical timeline of orchestrator steps driven by actual
 * step_results from the agent-orchestrator edge function. Shows completion
 * status, skip reasons, and output summaries.
 */

import { CheckCircle2, Loader2, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SKILL_DISPLAY_NAMES, SEQUENCE_STEPS } from '@/lib/agent/abilityRegistry';

// =============================================================================
// Component
// =============================================================================

export interface LiveStepVisualizerProps {
  stepResults: any[];
  jobStatus: string | null;
  eventType?: string;
}

export function LiveStepVisualizer({ stepResults, jobStatus, eventType }: LiveStepVisualizerProps) {
  // Merge step results by skill_key, keeping the latest status
  const stepMap = new Map<string, { status: string; output?: any; duration?: number }>();
  for (const r of stepResults) {
    const key = r.skill_key;
    const existing = stepMap.get(key);
    if (!existing || r.status === 'completed' || (r.status === 'running' && !existing)) {
      stepMap.set(key, { status: r.status, output: r.output, duration: r.duration_ms });
    }
  }

  // Build ordered list from the event type's sequence
  const orderedSkills = SEQUENCE_STEPS[eventType || 'meeting_ended'] || SEQUENCE_STEPS.meeting_ended;

  return (
    <div className="space-y-0">
      {orderedSkills.map((skill, i) => {
        const data = stepMap.get(skill);
        const status = data?.status || (jobStatus === 'completed' ? 'skipped' : 'pending');
        const displayName = SKILL_DISPLAY_NAMES[skill] || skill;
        const isSkipped = data?.output?.skipped;
        const isError = data?.output?.error && !data?.output?.skipped;

        return (
          <div key={skill} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold',
                  status === 'completed' && !isSkipped && !isError
                    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                    : status === 'running'
                    ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                    : isSkipped
                    ? 'bg-gray-100 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500'
                    : isError
                    ? 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                )}
              >
                {status === 'completed' && !isSkipped && !isError ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : status === 'running' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : isSkipped ? (
                  <SkipForward className="w-3.5 h-3.5" />
                ) : (
                  i + 1
                )}
              </div>
              {i < orderedSkills.length - 1 && (
                <div
                  className={cn(
                    'w-0.5 h-6',
                    status === 'completed' && !isSkipped
                      ? 'bg-emerald-300 dark:bg-emerald-600'
                      : isSkipped
                      ? 'bg-gray-200 dark:bg-gray-700/50'
                      : 'bg-gray-200 dark:bg-gray-700'
                  )}
                />
              )}
            </div>
            <div className="pt-1 pb-3">
              <div
                className={cn(
                  'text-[13px] font-medium',
                  status === 'completed' && !isSkipped
                    ? 'text-gray-900 dark:text-gray-200'
                    : status === 'running'
                    ? 'text-blue-600 dark:text-blue-400'
                    : isSkipped
                    ? 'text-gray-400 dark:text-gray-500 line-through'
                    : 'text-gray-400 dark:text-gray-500'
                )}
              >
                {displayName}
              </div>
              {isSkipped && data?.output?.reason && (
                <div className="text-[11px] text-gray-400 dark:text-gray-500 italic mt-0.5">
                  {data.output.reason === 'no_contact_email' ? 'No contact email'
                    : data.output.reason === 'no_transcript' ? 'No transcript'
                    : data.output.reason}
                </div>
              )}
              {status === 'completed' && !isSkipped && data?.output && (
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {data.output.itemsCreated != null ? `${data.output.itemsCreated} items` : ''}
                  {data.output.commitments ? `${data.output.commitments.length} commitments` : ''}
                  {data.output.tasks_created != null ? `${data.output.tasks_created} tasks` : ''}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
