/**
 * WorkflowProgressStepper
 *
 * Displays real-time step-by-step progress for the NL workflow orchestrator.
 * Shows: plan summary, step statuses with spinners, clarifying questions,
 * elapsed time, and final result with navigation.
 */

import { useState, useEffect, useRef } from 'react';
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
  onAnswerClarifications: (answers: Record<string, string>) => void;
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

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
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
  onAnswerClarifications,
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
  if (!isRunning && !result && !clarifyingQuestions && steps.length === 0) {
    return null;
  }

  const isComplete = !!result && !isRunning;
  const isPaused = result?.status === 'paused';
  const hasErrors = result?.errors && result.errors.length > 0;

  return (
    <div className="mx-4 mb-3 rounded-xl border border-zinc-700/50 bg-zinc-900/80 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
        >
          {isRunning ? (
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
            {isRunning
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
          {/* Plan Summary */}
          {plan && (
            <div className="text-xs text-zinc-400 leading-relaxed">
              {plan.summary}
            </div>
          )}

          {/* Step list */}
          <div className="space-y-1">
            {steps.map((step, idx) => {
              const StepIcon = getStepIcon(step.step);
              return (
                <div key={step.step} className="flex items-start gap-2.5 py-1.5">
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
                    <div className="flex items-center gap-2">
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
            })}
          </div>

          {/* Clarifying Questions */}
          {clarifyingQuestions && clarifyingQuestions.length > 0 && (
            <ClarifyingQuestionsForm
              questions={clarifyingQuestions}
              onSubmit={onAnswerClarifications}
            />
          )}

          {/* Result */}
          {isComplete && result && (
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                {result.status === 'complete' && (
                  <Badge
                    variant="outline"
                    className="border-green-500/30 text-green-400 text-[10px]"
                  >
                    Success
                  </Badge>
                )}
                {result.status === 'partial' && (
                  <Badge
                    variant="outline"
                    className="border-amber-500/30 text-amber-400 text-[10px]"
                  >
                    Partial
                  </Badge>
                )}
                {result.status === 'error' && (
                  <Badge
                    variant="outline"
                    className="border-red-500/30 text-red-400 text-[10px]"
                  >
                    Failed
                  </Badge>
                )}
                {result.table_name && (
                  <span className="text-xs text-zinc-400">
                    Table: "{result.table_name}"
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
}: {
  questions: ClarifyingQuestion[];
  onSubmit: (answers: Record<string, string>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const allAnswered = questions.every(q => answers[q.key]?.trim());

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-3">
      <p className="text-xs font-medium text-amber-300">
        A few questions before we proceed:
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
