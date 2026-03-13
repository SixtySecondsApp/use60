/**
 * EventReplayTrail (US-024)
 *
 * Visual trace showing how a CC item was created.
 * Renders a horizontal breadcrumb trail of steps from sequence_executions
 * and agent_trigger_runs, connected by lines.
 *
 * Each step shows: icon, label, status (complete/running/failed/skipped).
 * Failed steps show error on hover.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Loader2,
  XCircle,
  SkipForward,
  ChevronRight,
  Route,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/clientV2';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';

// ============================================================================
// Types
// ============================================================================

type StepStatus = 'complete' | 'running' | 'failed' | 'skipped';

interface ReplayStep {
  id: string;
  label: string;
  status: StepStatus;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

// ============================================================================
// Query key & hook
// ============================================================================

interface SequenceExecutionRow {
  id: string;
  step_name: string | null;
  status: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface AgentTriggerRunRow {
  id: string;
  trigger_type: string | null;
  status: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
}

function useEventReplaySteps(sourceEventId: string | null) {
  return useQuery<ReplayStep[]>({
    queryKey: ['event-replay', sourceEventId],
    queryFn: async (): Promise<ReplayStep[]> => {
      if (!sourceEventId) return [];

      // Query sequence_executions for steps related to this source event
      const { data: rawExecs, error: execError } = await supabase
        .from('sequence_executions')
        .select('id, step_name, status, error_message, started_at, completed_at')
        .eq('source_event_id', sourceEventId)
        .order('started_at', { ascending: true });

      if (execError) {
        console.warn('[EventReplayTrail] sequence_executions error:', execError.message);
      }

      // Query agent_trigger_runs as well
      const { data: rawTriggers, error: triggerError } = await supabase
        .from('agent_trigger_runs')
        .select('id, trigger_type, status, error_message, started_at, completed_at')
        .eq('source_event_id', sourceEventId)
        .order('started_at', { ascending: true });

      if (triggerError) {
        console.warn('[EventReplayTrail] agent_trigger_runs error:', triggerError.message);
      }

      const executions = (rawExecs ?? []) as unknown as SequenceExecutionRow[];
      const triggerRuns = (rawTriggers ?? []) as unknown as AgentTriggerRunRow[];

      const steps: ReplayStep[] = [];

      // Map trigger runs first (they initiate the sequence)
      for (const run of triggerRuns) {
        steps.push({
          id: run.id,
          label: formatLabel(run.trigger_type ?? 'Trigger'),
          status: mapStatus(run.status),
          error_message: run.error_message,
          started_at: run.started_at,
          completed_at: run.completed_at,
        });
      }

      // Then sequence execution steps
      for (const exec of executions) {
        steps.push({
          id: exec.id,
          label: formatLabel(exec.step_name ?? 'Step'),
          status: mapStatus(exec.status),
          error_message: exec.error_message,
          started_at: exec.started_at,
          completed_at: exec.completed_at,
        });
      }

      return steps;
    },
    enabled: !!sourceEventId,
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================================
// Helpers
// ============================================================================

const STATUS_MAP: Record<string, StepStatus> = {
  complete: 'complete',
  completed: 'complete',
  success: 'complete',
  running: 'running',
  in_progress: 'running',
  pending: 'running',
  failed: 'failed',
  error: 'failed',
  skipped: 'skipped',
  cancelled: 'skipped',
};

function mapStatus(raw: string | null): StepStatus {
  if (!raw) return 'running';
  return STATUS_MAP[raw.toLowerCase()] ?? 'running';
}

function formatLabel(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_CONFIG: Record<
  StepStatus,
  { icon: typeof CheckCircle2; color: string; bgColor: string; ringColor: string }
> = {
  complete: {
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/15',
    ringColor: 'ring-emerald-500/30',
  },
  running: {
    icon: Loader2,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/15',
    ringColor: 'ring-blue-500/30',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-400',
    bgColor: 'bg-red-500/15',
    ringColor: 'ring-red-500/30',
  },
  skipped: {
    icon: SkipForward,
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/15',
    ringColor: 'ring-gray-500/30',
  },
};

// ============================================================================
// Sub-components
// ============================================================================

function StepNode({ step }: { step: ReplayStep }) {
  const config = STATUS_CONFIG[step.status];
  const Icon = config.icon;
  const isAnimated = step.status === 'running';

  const node = (
    <div className="flex flex-col items-center gap-1 min-w-0">
      <div
        className={cn(
          'w-6 h-6 rounded-full flex items-center justify-center ring-1',
          config.bgColor,
          config.ringColor,
        )}
      >
        <Icon
          className={cn('w-3.5 h-3.5', config.color, isAnimated && 'animate-spin')}
        />
      </div>
      <span className="text-[9px] text-gray-500 leading-tight text-center max-w-[72px] truncate">
        {step.label}
      </span>
    </div>
  );

  // Wrap failed steps in tooltip to show error
  if (step.status === 'failed' && step.error_message) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-help">{node}</div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[240px] whitespace-normal">
          <span className="text-red-300">{step.error_message}</span>
        </TooltipContent>
      </Tooltip>
    );
  }

  return node;
}

function ConnectorLine() {
  return (
    <div className="flex items-center mt-[-12px]">
      <div className="w-4 h-px bg-gray-700" />
      <ChevronRight className="w-2.5 h-2.5 text-gray-600 -mx-0.5" />
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

interface EventReplayTrailProps {
  /** The source_event_id from the CC item */
  sourceEventId: string | null;
  /** Optional className */
  className?: string;
}

export function EventReplayTrail({
  sourceEventId,
  className,
}: EventReplayTrailProps) {
  const { data: steps, isLoading } = useEventReplaySteps(sourceEventId);
  const [expanded, setExpanded] = useState(false);

  // No source event, no trail
  if (!sourceEventId) return null;

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-2 text-[10px] text-gray-500', className)}>
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Loading event trace...</span>
      </div>
    );
  }

  // No steps found
  if (!steps || steps.length === 0) return null;

  // Collapsed: just show a clickable link
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(true);
        }}
        className={cn(
          'inline-flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-400 transition-colors',
          className,
        )}
      >
        <Route className="w-3 h-3" />
        <span>{steps.length} step{steps.length !== 1 ? 's' : ''} in trace</span>
        {steps.some((s) => s.status === 'failed') && (
          <XCircle className="w-3 h-3 text-red-400" />
        )}
      </button>
    );
  }

  // Expanded: show the full trail
  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn('space-y-2', className)}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(false);
          }}
          className="inline-flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-400 transition-colors"
        >
          <Route className="w-3 h-3" />
          <span>Event trace</span>
        </button>

        <div className="flex items-start gap-0 overflow-x-auto pb-1">
          {steps.map((step, i) => (
            <div key={step.id} className="flex items-start">
              <StepNode step={step} />
              {i < steps.length - 1 && <ConnectorLine />}
            </div>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
