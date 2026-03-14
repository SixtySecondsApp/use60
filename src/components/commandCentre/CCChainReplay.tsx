/**
 * CCChainReplay — TRINITY-018
 *
 * Renders an agent's reasoning chain as a step-by-step vertical timeline.
 * Each step shows wave number, agent type, action type, reasoning (expandable),
 * outcome badge, cost/duration metrics, and relative timestamp.
 *
 * Collapsible by default — toggled via "Show reasoning" / "Hide reasoning" button.
 */

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Sparkles,
  Zap,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useChainReplay, type ChainStep } from '@/lib/hooks/useChainReplay';

// ============================================================================
// Props
// ============================================================================

export interface CCChainReplayProps {
  chainId: string | null;
}

// ============================================================================
// Agent type colors
// ============================================================================

const AGENT_COLORS: Record<string, string> = {
  meeting_ended: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400',
  reengagement: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  deal_risk: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  follow_up: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  enrichment: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400',
  scheduler: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
  outreach: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
};

const DEFAULT_AGENT_COLOR = 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400';

// ============================================================================
// Outcome config
// ============================================================================

const OUTCOME_CONFIG: Record<string, { label: string; className: string }> = {
  success: {
    label: 'Success',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  },
  pending: {
    label: 'Pending',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
  },
  skipped: {
    label: 'Skipped',
    className: 'bg-gray-100 text-gray-500 dark:bg-gray-700/40 dark:text-gray-500',
  },
};

// ============================================================================
// Sub-components
// ============================================================================

function WaveBadge({ wave }: { wave: number | null }) {
  if (wave == null) return null;
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums bg-slate-200 text-slate-600 dark:bg-gray-700 dark:text-gray-300">
      Wave {wave}
    </span>
  );
}

function AgentBadge({ agentType }: { agentType: string }) {
  const colorClass = AGENT_COLORS[agentType] ?? DEFAULT_AGENT_COLOR;
  const label = agentType.replace(/-/g, ' ').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium', colorClass)}>
      <Zap className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const config = OUTCOME_CONFIG[outcome] ?? OUTCOME_CONFIG.pending;
  return (
    <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium', config.className)}>
      {config.label}
    </span>
  );
}

function ExpandableReasoning({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      onClick={() => setExpanded((v) => !v)}
      className="w-full text-left group"
    >
      <p
        className={cn(
          'text-xs text-slate-600 dark:text-gray-300 leading-relaxed transition-all',
          !expanded && 'line-clamp-2',
        )}
      >
        {text}
      </p>
      {text.length > 120 && (
        <span className="text-[10px] text-slate-400 dark:text-gray-500 group-hover:text-slate-600 dark:group-hover:text-gray-300 transition-colors">
          {expanded ? 'Show less' : 'Show more'}
        </span>
      )}
    </button>
  );
}

// ============================================================================
// Chain step row
// ============================================================================

function ChainStepRow({
  step,
  isLast,
}: {
  step: ChainStep;
  isLast: boolean;
}) {
  const actionLabel = step.action_type
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const relativeTime = formatDistanceToNow(new Date(step.created_at), { addSuffix: true });

  const hasMeta = step.credit_cost != null || step.execution_ms != null;

  return (
    <div className="flex items-start gap-3">
      {/* Connector line + dot */}
      <div className="flex flex-col items-center flex-shrink-0 pt-0.5">
        <div
          className={cn(
            'w-2.5 h-2.5 rounded-full border-2 flex-shrink-0',
            step.outcome === 'success'
              ? 'border-emerald-400 bg-emerald-100 dark:border-emerald-500 dark:bg-emerald-500/20'
              : step.outcome === 'failed'
              ? 'border-red-400 bg-red-100 dark:border-red-500 dark:bg-red-500/20'
              : step.outcome === 'pending'
              ? 'border-yellow-400 bg-yellow-100 dark:border-yellow-500 dark:bg-yellow-500/20'
              : 'border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-700',
          )}
        />
        {!isLast && (
          <div className="w-px flex-1 min-h-[24px] bg-slate-200 dark:bg-gray-700 mt-1" />
        )}
      </div>

      {/* Content */}
      <div className={cn('flex-1 min-w-0', !isLast && 'pb-3')}>
        {/* Row 1: badges */}
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <WaveBadge wave={step.wave_number} />
          <AgentBadge agentType={step.agent_type} />
          <OutcomeBadge outcome={step.outcome} />
        </div>

        {/* Row 2: action label */}
        <p className="text-sm font-medium text-slate-700 dark:text-gray-200 mb-0.5">
          {actionLabel}
        </p>

        {/* Row 3: reasoning (expandable) */}
        {step.decision_reasoning && (
          <div className="mb-1">
            <ExpandableReasoning text={step.decision_reasoning} />
          </div>
        )}

        {/* Row 4: error message */}
        {step.error_message && (
          <p className="text-xs text-red-600 dark:text-red-400 mb-1 leading-relaxed">
            {step.error_message}
          </p>
        )}

        {/* Row 5: meta */}
        <div className="flex items-center gap-3 flex-wrap">
          {hasMeta && (
            <span className="text-[10px] text-slate-400 dark:text-gray-500 tabular-nums">
              {step.credit_cost != null && `${step.credit_cost} credits`}
              {step.credit_cost != null && step.execution_ms != null && ' · '}
              {step.execution_ms != null && `${step.execution_ms}ms`}
            </span>
          )}
          <span className="text-[10px] text-slate-400 dark:text-gray-500">
            {relativeTime}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function CCChainReplay({ chainId }: CCChainReplayProps) {
  const [open, setOpen] = useState(false);
  const { data: steps, isLoading, error } = useChainReplay(open ? chainId : null);

  // No chain_id — show muted message, no toggle
  if (!chainId) {
    return (
      <p className="text-xs text-slate-400 dark:text-gray-500 italic py-2">
        Direct action — no reasoning chain available
      </p>
    );
  }

  return (
    <div>
      {/* Toggle button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-slate-600 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200 gap-1"
        onClick={() => setOpen((v) => !v)}
      >
        <Sparkles className="h-3 w-3" />
        {open ? 'Hide reasoning' : 'Show reasoning'}
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </Button>

      {/* Content */}
      {open && (
        <div className="mt-2 pl-1">
          {isLoading && (
            <div className="flex items-center gap-2 py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 dark:text-gray-500" />
              <span className="text-xs text-slate-400 dark:text-gray-500">Loading reasoning chain...</span>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-500 py-2">
              Failed to load chain: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          )}

          {!isLoading && !error && steps && steps.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-gray-500 italic py-2">
              No steps found for this chain.
            </p>
          )}

          {!isLoading && !error && steps && steps.length > 0 && (
            <div className="space-y-0">
              {steps.map((step, i) => (
                <ChainStepRow
                  key={step.id}
                  step={step}
                  isLast={i === steps.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
