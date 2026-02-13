/**
 * Campaign Workflow Response Component
 *
 * Interactive inline copilot response that guides the user through a
 * full campaign pipeline: clarifying questions -> workflow execution
 * with live progress stepper -> completion summary with action buttons.
 *
 * Pattern: extends ProspectingClarificationResponse with campaign-specific
 * fields (editable campaign name) and a 3-phase lifecycle.
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, CheckCircle2, Loader2, Circle, XCircle, ExternalLink, ChevronRight, ChevronDown, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkflowOrchestrator, type WorkflowStep } from '@/lib/hooks/useWorkflowOrchestrator';
import { enrichPromptWithAnswers, type ClarifyingQuestion } from '@/lib/utils/prospectingDetector';
import { useActiveICP } from '@/lib/hooks/useActiveICP';
import type { QuickActionResponse } from '../types';

export interface CampaignWorkflowData {
  original_prompt: string;
  questions: ClarifyingQuestion[];
  suggested_campaign_name: string;
}

interface CampaignWorkflowResponseProps {
  data: CampaignWorkflowData;
  onActionClick?: (action: QuickActionResponse) => void;
}

export const CampaignWorkflowResponse: React.FC<CampaignWorkflowResponseProps> = ({
  data,
  onActionClick,
}) => {
  const { activeICP, icpDefaults, isLoading: icpLoading } = useActiveICP();
  const [icpDismissed, setIcpDismissed] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [campaignName, setCampaignName] = useState(data.suggested_campaign_name);
  const [submitted, setSubmitted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const orchestrator = useWorkflowOrchestrator();
  const { steps, result } = orchestrator;

  const startTimeRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (submitted && !startTimeRef.current) {
      startTimeRef.current = Date.now();
    }
    if (!submitted || (result && result.status !== 'error')) return;
    const interval = setInterval(() => {
      if (startTimeRef.current) {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [submitted, result]);

  const totalSteps = data.questions.length + 1; // +1 for campaign name
  const allAnswered = data.questions.every((q) => answers[q.key]);
  const answeredCount = data.questions.filter((q) => answers[q.key]).length + (campaignName.trim() ? 1 : 0);

  const handleSelect = (key: string, value: string) => {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [key]: value }));
    // Auto-advance for select-type questions
    const questionIndex = data.questions.findIndex((q) => q.key === key);
    if (questionIndex !== -1 && data.questions[questionIndex].type !== 'text') {
      setCurrentStep(Math.min(questionIndex + 1, totalSteps - 1));
    }
  };

  const handleSubmit = () => {
    if (!allAnswered || submitted) return;
    setSubmitted(true);

    const allAnswers = { ...answers, campaign_name: campaignName };
    const enrichedPrompt = enrichPromptWithAnswers(data.original_prompt, allAnswers);

    // Build structured config so the orchestrator doesn't rely solely on prompt parsing
    const config = {
      skip_enrichment: answers.enrichment_scope === 'Skip enrichment',
      skip_email_generation: answers.email_steps?.startsWith('No'),
      skip_campaign_creation: false,
      num_email_steps: answers.email_steps?.includes('3') ? 3 : answers.email_steps?.includes('5') ? 5 : 0,
      table_name: campaignName,
    };

    // Call execute() directly — preflight questions are already answered in this component
    orchestrator.execute(enrichedPrompt, config);
  };

  // Phase 3: Complete (or partial success)
  if (result?.status === 'complete' || result?.status === 'partial') {
    return (
      <CompletionCard
        campaignName={campaignName}
        steps={steps}
        result={result}
        elapsed={elapsed}
        onActionClick={onActionClick}
      />
    );
  }

  // Phase 2: Executing
  if (submitted) {
    // Overall progress: complete=100, running=50, pending/error/skipped=0
    const overallProgress = steps.length > 0
      ? steps.reduce((sum, s) => {
          if (s.status === 'complete') return sum + 100;
          if (s.status === 'running') return sum + 50;
          return sum;
        }, 0) / steps.length
      : 0;

    const elapsedMin = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const elapsedSec = String(elapsed % 60).padStart(2, '0');

    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/20">
            <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
          </div>
          <span className="text-sm font-medium text-white flex-1">
            Running campaign pipeline...
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-gray-400 tabular-nums">
            <Clock className="w-3 h-3" />
            {elapsedMin}:{elapsedSec}
          </span>
        </div>
        <div className="p-4 space-y-3">
          {/* Overall progress bar */}
          {steps.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{steps.filter((s) => s.status === 'complete').length} of {steps.length} steps</span>
                <span>{Math.round(overallProgress)}%</span>
              </div>
              <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-emerald-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${overallProgress}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>
            </div>
          )}

          {steps.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Initializing workflow...</span>
            </div>
          )}
          {steps.map((step, i) => (
            <StepRow key={step.step} step={step} index={i} />
          ))}
          {result?.status === 'error' && (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-red-400">
                {result.error || 'Workflow failed. Please try again.'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSubmitted(false);
                  startTimeRef.current = null;
                  setElapsed(0);
                  orchestrator.reset();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
          {orchestrator.isRunning && (
            <button
              type="button"
              onClick={() => orchestrator.abort()}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700/60 text-gray-400 text-xs font-medium hover:bg-gray-700/80 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  // Phase 1: Questions (conversational stepped flow)
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-emerald-500/20">
          <Send className="w-4 h-4 text-emerald-400" />
        </div>
        <span className="text-sm font-medium text-white">
          Let&apos;s set up your campaign
        </span>
      </div>

      <div className="p-4 space-y-4">
        {/* ICP banner */}
        {activeICP && !icpDismissed && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 mb-3"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-blue-300">
                ICP detected: {activeICP.name}
              </p>
              <p className="text-xs text-blue-400/70 truncate">
                {activeICP.description || 'Pre-fill answers from this profile'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                // Pre-fill answers from ICP defaults
                setAnswers(prev => ({ ...prev, ...icpDefaults }));
                // Auto-advance currentStep past all pre-filled questions
                const firstUnanswered = data.questions.findIndex(q => !icpDefaults[q.key]);
                setCurrentStep(firstUnanswered >= 0 ? firstUnanswered : data.questions.length);
                setIcpDismissed(true);
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors shrink-0"
            >
              Use this ICP
            </button>
            <button
              type="button"
              onClick={() => setIcpDismissed(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-700/60 text-gray-400 hover:bg-gray-700/80 transition-colors shrink-0"
            >
              Ignore
            </button>
          </motion.div>
        )}

        {/* Answered chips row */}
        {answeredCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap gap-1.5"
          >
            {data.questions.map((q, i) => {
              if (!answers[q.key] || i === currentStep) return null;
              const shortLabel = q.question.length > 20
                ? q.question.slice(0, 20) + '...'
                : q.question;
              return (
                <motion.button
                  key={q.key}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  type="button"
                  onClick={() => setCurrentStep(i)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                >
                  <span className="text-gray-400">{shortLabel}:</span> {answers[q.key]}
                </motion.button>
              );
            })}
            {/* Campaign name chip (shown when answered and not the current step) */}
            {campaignName.trim() && currentStep !== data.questions.length && (
              <motion.button
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                type="button"
                onClick={() => setCurrentStep(data.questions.length)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
              >
                <span className="text-gray-400">Name:</span> {campaignName}
              </motion.button>
            )}
          </motion.div>
        )}

        {/* Current question */}
        <AnimatePresence mode="wait">
          {currentStep < data.questions.length ? (
            <motion.div
              key={`q-${currentStep}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-2"
            >
              <p className="text-sm font-medium text-gray-200">
                {data.questions[currentStep].question}
              </p>
              {data.questions[currentStep].type === 'text' ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={answers[data.questions[currentStep].key] || ''}
                    onChange={(e) => handleSelect(data.questions[currentStep].key, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && answers[data.questions[currentStep].key]?.trim()) {
                        setCurrentStep((s) => Math.min(s + 1, totalSteps - 1));
                      }
                    }}
                    placeholder={data.questions[currentStep].options?.[0] || ''}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    disabled={!answers[data.questions[currentStep].key]?.trim()}
                    onClick={() => setCurrentStep((s) => Math.min(s + 1, totalSteps - 1))}
                    className={cn(
                      'inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      answers[data.questions[currentStep].key]?.trim()
                        ? 'bg-blue-500 text-white hover:bg-blue-600'
                        : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    )}
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.questions[currentStep].options?.map((option) => {
                    const isSelected = answers[data.questions[currentStep].key] === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => handleSelect(data.questions[currentStep].key, option)}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150',
                          'border focus:outline-none focus:ring-2 focus:ring-blue-500/40',
                          isSelected
                            ? 'bg-blue-500 text-white border-blue-500 shadow-sm'
                            : 'bg-gray-800 text-gray-300 border-gray-700 hover:border-blue-500'
                        )}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          ) : (
            /* Campaign name step (last step) — includes submit button */
            <motion.div
              key="campaign-name"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
              <p className="text-sm font-medium text-gray-200">Name your campaign</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && allAnswered && campaignName.trim()) {
                      handleSubmit();
                    }
                  }}
                  placeholder="e.g. Bristol SaaS Outreach"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                />
                <button
                  type="button"
                  disabled={!allAnswered || !campaignName.trim()}
                  onClick={handleSubmit}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/40',
                    allAnswered && campaignName.trim()
                      ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                      : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                  )}
                >
                  Start Pipeline
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progress indicator */}
        <p className="text-xs text-gray-500">{answeredCount} of {totalSteps} answered</p>
      </div>
    </div>
  );
};

/** Extract numeric metrics from completed step summaries */
function extractMetrics(steps: WorkflowStep[]): Array<{ label: string; value: string }> {
  const metrics: Array<{ label: string; value: string }> = [];
  const patterns: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /(\d+)\s*(?:contacts?|companies|leads?|people|prospects?)\s*(?:found|loaded|imported)/i, label: 'Contacts' },
    { pattern: /(?:enriched?|verified)\s*(\d+)/i, label: 'Enriched' },
    { pattern: /(\d+)\s*(?:enriched?|verified)/i, label: 'Enriched' },
    { pattern: /(\d+)\s*(?:emails?|sequences?|steps?)\s*(?:generated|created|written)/i, label: 'Emails' },
    { pattern: /(?:generated|created|written)\s*(\d+)\s*(?:emails?|sequences?|steps?)/i, label: 'Emails' },
    { pattern: /(?:pushed|added|uploaded)\s*(\d+)/i, label: 'Pushed' },
    { pattern: /(\d+)\s*(?:pushed|added|uploaded)/i, label: 'Pushed' },
  ];

  const seen = new Set<string>();
  for (const step of steps) {
    if (step.status !== 'complete' || !step.summary) continue;
    for (const { pattern, label } of patterns) {
      if (seen.has(label)) continue;
      const match = step.summary.match(pattern);
      if (match) {
        seen.add(label);
        metrics.push({ label, value: match[1] });
      }
    }
  }
  return metrics;
}

function CompletionCard({
  campaignName,
  steps,
  result,
  elapsed,
  onActionClick,
}: {
  campaignName: string;
  steps: WorkflowStep[];
  result: { status: string; table_id?: string; duration_ms?: number; steps?: WorkflowStep[] };
  elapsed: number;
  onActionClick?: (action: QuickActionResponse) => void;
}) {
  const [emailExpanded, setEmailExpanded] = useState(false);
  const metrics = extractMetrics(steps);

  // Try to find email preview and Instantly URL from step data
  const emailStep = steps.find(
    (s) => s.status === 'complete' && s.data && (s.data.email_preview || s.data.email_subject)
  );
  const emailPreview = emailStep?.data as
    | { email_subject?: string; email_preview?: string; email_body?: string }
    | undefined;

  const instantlyStep = steps.find(
    (s) => s.status === 'complete' && s.data && s.data.campaign_url
  );
  const instantlyUrl = (instantlyStep?.data as { campaign_url?: string } | undefined)?.campaign_url;

  const durationSec = result.duration_ms
    ? Math.round(result.duration_ms / 1000)
    : elapsed;
  const durMin = String(Math.floor(durationSec / 60)).padStart(2, '0');
  const durSec = String(durationSec % 60).padStart(2, '0');

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-emerald-500/20">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
        <span className="text-sm font-medium text-white flex-1">
          Campaign &ldquo;{campaignName}&rdquo; ready!
        </span>
        {durationSec > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-500 tabular-nums">
            <Clock className="w-3 h-3" />
            {durMin}:{durSec}
          </span>
        )}
      </div>
      <div className="p-4 space-y-4">
        {/* Metric tiles */}
        {metrics.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {metrics.map((m) => (
              <div
                key={m.label}
                className="bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-center"
              >
                <p className="text-lg font-semibold text-white tabular-nums">{m.value}</p>
                <p className="text-xs text-gray-400">{m.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Email preview (collapsible) */}
        {emailPreview && (emailPreview.email_subject || emailPreview.email_preview) && (
          <div className="border border-gray-700 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setEmailExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-300 hover:bg-gray-800/50 transition-colors"
            >
              <span>Preview first email</span>
              <ChevronDown
                className={cn(
                  'w-3.5 h-3.5 text-gray-500 transition-transform duration-200',
                  emailExpanded && 'rotate-180'
                )}
              />
            </button>
            <AnimatePresence>
              {emailExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-3 space-y-1.5 border-t border-gray-700/50">
                    {emailPreview.email_subject && (
                      <p className="text-xs font-medium text-gray-200 pt-2">
                        Subject: {emailPreview.email_subject}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 whitespace-pre-wrap">
                      {emailPreview.email_preview || emailPreview.email_body || ''}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              onActionClick?.({
                id: 'open-ops-table',
                label: 'Open in Ops Table',
                type: 'primary',
                callback: 'start_campaign',
                params: { table_id: result.table_id },
              })
            }
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors"
          >
            Open in Ops Table
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          {instantlyUrl && (
            <button
              type="button"
              onClick={() =>
                onActionClick?.({
                  id: 'open-instantly',
                  label: 'View in Instantly',
                  type: 'secondary',
                  callback: 'open_external_url',
                  params: { url: instantlyUrl },
                })
              }
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
            >
              View in Instantly
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Parse progress strings like "18/32" or "5 of 10" into a 0-100 percentage */
function parseProgressPercent(progress: string): number | null {
  const slashMatch = progress.match(/^(\d+)\s*\/\s*(\d+)/);
  if (slashMatch) {
    const [, current, total] = slashMatch;
    const t = parseInt(total, 10);
    return t > 0 ? Math.round((parseInt(current, 10) / t) * 100) : null;
  }
  const ofMatch = progress.match(/^(\d+)\s+of\s+(\d+)/i);
  if (ofMatch) {
    const [, current, total] = ofMatch;
    const t = parseInt(total, 10);
    return t > 0 ? Math.round((parseInt(current, 10) / t) * 100) : null;
  }
  return null;
}

function StepRow({ step, index }: { step: WorkflowStep; index: number }) {
  const subProgress = step.status === 'running' && step.progress
    ? parseProgressPercent(step.progress)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      className="space-y-1"
    >
      <div className="flex items-start gap-2">
        {step.status === 'complete' && (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
        )}
        {step.status === 'running' && (
          <Loader2 className="w-4 h-4 text-blue-400 animate-spin mt-0.5 shrink-0" />
        )}
        {step.status === 'pending' && (
          <Circle className="w-4 h-4 text-gray-600 mt-0.5 shrink-0" />
        )}
        {step.status === 'error' && (
          <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
        )}
        {step.status === 'skipped' && (
          <Circle className="w-4 h-4 text-gray-600 mt-0.5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                'text-sm',
                step.status === 'complete' && 'text-gray-200',
                step.status === 'running' && 'text-blue-300',
                step.status === 'pending' && 'text-gray-500',
                step.status === 'error' && 'text-red-300',
                step.status === 'skipped' && 'text-gray-500'
              )}
            >
              {step.label || step.step}
            </span>
            {step.status === 'complete' && step.summary && (
              <span className="text-xs text-gray-500">{step.summary}</span>
            )}
            {step.status === 'running' && step.progress && (
              <span className="text-xs text-blue-400/70">{step.progress}</span>
            )}
          </div>
          {step.status === 'error' && step.error && (
            <p className="text-xs text-red-400/70 mt-0.5">{step.error}</p>
          )}
        </div>
        {step.status === 'complete' && step.duration_ms != null && (
          <span className="text-xs text-gray-600 shrink-0 tabular-nums">
            {(step.duration_ms / 1000).toFixed(1)}s
          </span>
        )}
      </div>
      {/* Sub-progress bar for running steps */}
      {subProgress !== null && (
        <div className="ml-6 h-1 bg-gray-700 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-blue-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${subProgress}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
      )}
    </motion.div>
  );
}

export default CampaignWorkflowResponse;
