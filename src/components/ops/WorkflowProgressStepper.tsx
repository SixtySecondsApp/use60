/**
 * WorkflowProgressStepper
 *
 * Displays real-time step-by-step progress for the NL workflow orchestrator.
 * Shows: plan summary, step statuses with spinners, agent indicators,
 * parallel step layout, clarifying questions, elapsed time, and final
 * result with completion summary.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertTriangle,
  X,
  SkipForward,
  Clock,
  Search,
  Mail,
  Send,
  Brain,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Database,
  Calendar,
  Target,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type {
  WorkflowStep,
  SkillPlan,
  WorkflowResult,
  ClarifyingQuestion,
} from '@/lib/hooks/useWorkflowOrchestrator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkflowProgressStepperProps {
  isRunning: boolean;
  steps: WorkflowStep[];
  plan: SkillPlan | null;
  result: WorkflowResult | null;
  clarifyingQuestions: ClarifyingQuestion[] | null;
  preflightQuestions: ClarifyingQuestion[] | null;
  onAnswerClarifications: (answers: Record<string, string>) => void;
  onAnswerPreflight: (answers: Record<string, string>) => void;
  onAbort: () => void;
  onDismiss: () => void;
  onNavigateToTable?: (tableId: string) => void;
}

// ---------------------------------------------------------------------------
// Step icon mapping
// ---------------------------------------------------------------------------

const STEP_ICONS: Record<string, typeof Search> = {
  context: Brain,
  planning: Brain,
  search: Search,
  email_generation: Mail,
  campaign_creation: Send,
};

function getStepIcon(stepName: string) {
  return STEP_ICONS[stepName] || Circle;
}

// ---------------------------------------------------------------------------
// Agent display metadata (mirrors agentDefinitions.ts on the backend)
// ---------------------------------------------------------------------------

const AGENT_ICON_MAP: Record<string, React.ElementType> = {
  pipeline: BarChart3,
  outreach: Mail,
  research: Search,
  crm_ops: Database,
  meetings: Calendar,
  prospecting: Target,
};

const AGENT_DISPLAY_NAMES: Record<string, string> = {
  pipeline: 'Pipeline',
  outreach: 'Outreach',
  research: 'Research',
  crm_ops: 'CRM Ops',
  meetings: 'Meetings',
  prospecting: 'Prospecting',
};

const AGENT_COLOR_CLASSES: Record<string, { text: string; bg: string; border: string }> = {
  pipeline:    { text: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30' },
  outreach:    { text: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/30' },
  research:    { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  crm_ops:     { text: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30' },
  meetings:    { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30' },
  prospecting: { text: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30' },
};

function getAgentColors(agent: string) {
  return AGENT_COLOR_CLASSES[agent] || { text: 'text-zinc-400', bg: 'bg-zinc-500/10', border: 'border-zinc-500/30' };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Group consecutive "running" steps into parallel groups.
 * Steps that are running at the same time are displayed side-by-side.
 */
function groupStepsForLayout(steps: WorkflowStep[]): Array<WorkflowStep | WorkflowStep[]> {
  const groups: Array<WorkflowStep | WorkflowStep[]> = [];
  let parallelBatch: WorkflowStep[] = [];

  for (const step of steps) {
    if (step.status === 'running') {
      parallelBatch.push(step);
    } else {
      // Flush any running batch first
      if (parallelBatch.length > 1) {
        groups.push([...parallelBatch]);
      } else if (parallelBatch.length === 1) {
        groups.push(parallelBatch[0]);
      }
      parallelBatch = [];
      groups.push(step);
    }
  }
  // Flush remaining
  if (parallelBatch.length > 1) {
    groups.push([...parallelBatch]);
  } else if (parallelBatch.length === 1) {
    groups.push(parallelBatch[0]);
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkflowProgressStepper({
  isRunning,
  steps,
  plan,
  result,
  clarifyingQuestions,
  preflightQuestions,
  onAnswerClarifications,
  onAnswerPreflight,
  onAbort,
  onDismiss,
  onNavigateToTable,
}: WorkflowProgressStepperProps) {
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const startTimeRef = useRef(Date.now());

  // Track elapsed time
  useEffect(() => {
    if (!isRunning) return;
    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 100);
    return () => clearInterval(interval);
  }, [isRunning]);

  // Reset elapsed when workflow finishes
  useEffect(() => {
    if (!isRunning && result) {
      setElapsed(result.duration_ms || (Date.now() - startTimeRef.current));
    }
  }, [isRunning, result]);

  // Nothing to show
  if (!isRunning && !result && !clarifyingQuestions && !preflightQuestions && steps.length === 0) {
    return null;
  }

  const isComplete = !!result && !isRunning;
  const isPaused = result?.status === 'paused';
  const hasErrors = result?.errors && result.errors.length > 0;
  const isPreflightPhase = !!preflightQuestions && preflightQuestions.length > 0 && !isRunning;

  return (
    <div className="mx-4 mb-3 rounded-xl border border-zinc-700/50 bg-zinc-900/80 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
        >
          {isPreflightPhase ? (
            <Target className="h-4 w-4 text-blue-400" />
          ) : isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
          ) : isComplete && !hasErrors ? (
            <CheckCircle2 className="h-4 w-4 text-green-400" />
          ) : isComplete && hasErrors ? (
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          ) : isPaused ? (
            <Clock className="h-4 w-4 text-amber-400" />
          ) : (
            <Circle className="h-4 w-4 text-zinc-500" />
          )}
          <span className="text-sm font-medium text-zinc-200">
            {isPreflightPhase
              ? 'Setting up your search'
              : isRunning
              ? 'Running workflow...'
              : isPaused
              ? 'Needs your input'
              : isComplete
              ? hasErrors
                ? 'Workflow completed with errors'
                : 'Workflow complete'
              : 'Workflow'}
          </span>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-zinc-500" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          )}
        </button>
        <div className="flex items-center gap-2">
          {(isRunning || elapsed > 0) && (
            <span className="text-[10px] text-zinc-500 font-mono tabular-nums flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(elapsed)}
            </span>
          )}
          {isRunning && (
            <button
              onClick={onAbort}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
              title="Cancel workflow"
            >
              Cancel
            </button>
          )}
          {isPreflightPhase && (
            <button
              onClick={onDismiss}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {isComplete && (
            <button
              onClick={onDismiss}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-4 py-3 space-y-3">
          {/* Pre-flight Questions (before any backend call) */}
          {isPreflightPhase && (
            <ClarifyingQuestionsForm
              questions={preflightQuestions!}
              onSubmit={onAnswerPreflight}
              headerText="A few details to refine your search:"
            />
          )}

          {/* Plan Summary */}
          {plan && (
            <div className="text-xs text-zinc-400 leading-relaxed">
              {plan.summary}
            </div>
          )}

          {/* Step list (with parallel grouping) */}
          <StepList steps={steps} />

          {/* Clarifying Questions (backend-generated, mid-workflow) */}
          {clarifyingQuestions && clarifyingQuestions.length > 0 && (
            <ClarifyingQuestionsForm
              questions={clarifyingQuestions}
              onSubmit={onAnswerClarifications}
            />
          )}

          {/* Result + Completion Summary */}
          {isComplete && result && (
            <CompletionSummary
              result={result}
              steps={steps}
              onNavigateToTable={onNavigateToTable}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StepList — renders steps with parallel grouping
// ---------------------------------------------------------------------------

function StepList({ steps }: { steps: WorkflowStep[] }) {
  const grouped = useMemo(() => groupStepsForLayout(steps), [steps]);

  return (
    <div className="space-y-1">
      {grouped.map((item, idx) => {
        if (Array.isArray(item)) {
          // Parallel group — render side-by-side
          return (
            <div key={`parallel-${idx}`} className="flex gap-2">
              {item.map((step) => (
                <div key={step.step} className="flex-1 min-w-0">
                  <StepCard step={step} compact />
                </div>
              ))}
            </div>
          );
        }
        return <StepCard key={item.step} step={item} />;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StepCard — single step with optional agent badge
// ---------------------------------------------------------------------------

function StepCard({ step, compact }: { step: WorkflowStep; compact?: boolean }) {
  const StepIcon = getStepIcon(step.step);
  const agentColors = step.agent ? getAgentColors(step.agent) : null;
  const AgentIcon = step.agent ? AGENT_ICON_MAP[step.agent] : null;
  const agentName = step.agent ? (AGENT_DISPLAY_NAMES[step.agent] || step.agent) : null;

  return (
    <div className={`flex items-start gap-2.5 py-1.5 ${compact ? 'rounded-lg border border-zinc-800 px-2' : ''}`}>
      {/* Status icon */}
      <div className="mt-0.5 shrink-0">
        {step.status === 'running' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
        ) : step.status === 'complete' ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
        ) : step.status === 'error' ? (
          <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
        ) : step.status === 'skipped' ? (
          <SkipForward className="h-3.5 w-3.5 text-zinc-500" />
        ) : (
          <Circle className="h-3.5 w-3.5 text-zinc-600" />
        )}
      </div>

      {/* Step content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <StepIcon className="h-3 w-3 text-zinc-500" />
          <span
            className={`text-xs font-medium ${
              step.status === 'running'
                ? 'text-blue-300'
                : step.status === 'complete'
                ? 'text-zinc-300'
                : step.status === 'error'
                ? 'text-red-300'
                : 'text-zinc-500'
            }`}
          >
            {step.label || step.step.replace(/_/g, ' ')}
          </span>

          {/* Agent badge */}
          {agentColors && AgentIcon && agentName && (
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${agentColors.text} ${agentColors.bg} ${agentColors.border}`}
            >
              <AgentIcon className="h-2.5 w-2.5" />
              {agentName}
            </span>
          )}

          {step.duration_ms != null && step.status !== 'running' && (
            <span className="text-[10px] text-zinc-600 font-mono">
              {formatDuration(step.duration_ms)}
            </span>
          )}
        </div>
        {/* Summary or progress */}
        {step.progress && step.status === 'running' && (
          <p className="mt-0.5 text-[11px] text-blue-400/70">{step.progress}</p>
        )}
        {step.summary && step.status !== 'running' && (
          <p className="mt-0.5 text-[11px] text-zinc-500">{step.summary}</p>
        )}
        {step.error && (
          <p className="mt-0.5 text-[11px] text-red-400/80">{step.error}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CompletionSummary — result + agents used + time saved
// ---------------------------------------------------------------------------

function CompletionSummary({
  result,
  steps,
  onNavigateToTable,
}: {
  result: WorkflowResult;
  steps: WorkflowStep[];
  onNavigateToTable?: (tableId: string) => void;
}) {
  // Collect unique agents used across all steps
  const agentsUsed = useMemo(() => {
    const seen = new Set<string>();
    for (const step of steps) {
      if (step.agent) seen.add(step.agent);
    }
    return Array.from(seen);
  }, [steps]);

  // Calculate time saved: sum of individual durations (sequential) vs total elapsed (parallel)
  const timeSaved = useMemo(() => {
    const sequentialMs = steps.reduce((sum, s) => sum + (s.duration_ms || 0), 0);
    const parallelMs = result.duration_ms || sequentialMs;
    const saved = sequentialMs - parallelMs;
    return saved > 1000 ? saved : 0; // Only show if meaningful (>1s)
  }, [steps, result.duration_ms]);

  return (
    <div className="space-y-2 pt-1">
      {/* Status row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {result.status === 'complete' && (
            <Badge variant="outline" className="border-green-500/30 text-green-400 text-[10px]">
              Success
            </Badge>
          )}
          {result.status === 'partial' && (
            <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px]">
              Partial
            </Badge>
          )}
          {result.status === 'error' && (
            <Badge variant="outline" className="border-red-500/30 text-red-400 text-[10px]">
              Failed
            </Badge>
          )}
          {result.table_name && (
            <span className="text-xs text-zinc-400">
              Table: &quot;{result.table_name}&quot;
            </span>
          )}
        </div>
        {result.table_id && onNavigateToTable && result.table_id !== '' && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 border-zinc-700 text-zinc-300 hover:border-blue-500/30 hover:text-blue-300 text-xs"
            onClick={() => onNavigateToTable(result.table_id!)}
          >
            Open Table
            <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Agent summary row */}
      {agentsUsed.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Users className="h-3 w-3 text-zinc-500" />
          <span className="text-[10px] text-zinc-500">Agents:</span>
          {agentsUsed.map((agent) => {
            const colors = getAgentColors(agent);
            const Icon = AGENT_ICON_MAP[agent];
            const name = AGENT_DISPLAY_NAMES[agent] || agent;
            return (
              <span
                key={agent}
                className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${colors.text} ${colors.bg} ${colors.border}`}
              >
                {Icon && <Icon className="h-2.5 w-2.5" />}
                {name}
              </span>
            );
          })}
          {timeSaved > 0 && (
            <span className="text-[10px] text-emerald-400/80 ml-1">
              ~{formatDuration(timeSaved)} saved via parallel execution
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clarifying Questions Form
// ---------------------------------------------------------------------------

function ClarifyingQuestionsForm({
  questions,
  onSubmit,
  headerText,
}: {
  questions: ClarifyingQuestion[];
  onSubmit: (answers: Record<string, string>) => void;
  headerText?: string;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const allAnswered = questions.every(q => answers[q.key]?.trim());

  return (
    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 space-y-3">
      <p className="text-xs font-medium text-blue-300">
        {headerText || 'A few questions before we proceed:'}
      </p>
      {questions.map((q) => (
        <div key={q.key} className="space-y-1.5">
          <label className="text-xs text-zinc-300">{q.question}</label>
          {q.type === 'select' && q.options ? (
            <div className="flex flex-wrap gap-1.5">
              {q.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setAnswers(prev => ({ ...prev, [q.key]: opt }))}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    answers[q.key] === opt
                      ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                      : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <input
              type="text"
              value={answers[q.key] || ''}
              onChange={(e) => setAnswers(prev => ({ ...prev, [q.key]: e.target.value }))}
              placeholder="Type your answer..."
              className="w-full rounded-md border border-zinc-700 bg-zinc-800/50 px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
            />
          )}
        </div>
      ))}
      <Button
        size="sm"
        onClick={() => onSubmit(answers)}
        disabled={!allAnswered}
        className="h-7 gap-1.5 bg-blue-600 text-white hover:bg-blue-500 text-xs disabled:opacity-50"
      >
        Continue
        <ArrowRight className="h-3 w-3" />
      </Button>
    </div>
  );
}
