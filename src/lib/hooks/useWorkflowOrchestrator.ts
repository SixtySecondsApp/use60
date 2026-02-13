/**
 * useWorkflowOrchestrator
 *
 * React hook for executing NL prospecting/outreach workflows via the
 * ops-workflow-orchestrator edge function. Handles SSE streaming, step
 * progress tracking, clarifying questions, and result aggregation.
 */

import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowStep {
  step: string;
  label?: string;
  status: 'pending' | 'running' | 'complete' | 'error' | 'skipped';
  summary?: string;
  data?: Record<string, unknown>;
  error?: string;
  duration_ms?: number;
  progress?: string;
  agent?: string;
}

export interface ClarifyingQuestion {
  type: 'select' | 'text';
  question: string;
  options?: string[];
  key: string;
}

export interface SkillPlan {
  search_params: Record<string, unknown>;
  table_name: string;
  enrichment: { email: boolean; phone: boolean };
  email_sequence: { num_steps: number; angle: string } | null;
  campaign: { create_new: boolean; campaign_name?: string } | null;
  summary: string;
  clarifying_questions?: ClarifyingQuestion[];
}

export interface WorkflowResult {
  status: 'complete' | 'partial' | 'error' | 'paused';
  table_id?: string;
  table_name?: string;
  steps: WorkflowStep[];
  errors?: Array<{ step: string; error: string }>;
  duration_ms?: number;
  error?: string;
}

export interface WorkflowConfig {
  table_name?: string;
  max_results?: number;
  skip_enrichment?: boolean;
  skip_email_generation?: boolean;
  skip_campaign_creation?: boolean;
  num_email_steps?: number;
  campaign_angle?: string;
  target_table_id?: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWorkflowOrchestrator() {
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [plan, setPlan] = useState<SkillPlan | null>(null);
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [clarifyingQuestions, setClarifyingQuestions] = useState<ClarifyingQuestion[] | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [pendingConfig, setPendingConfig] = useState<WorkflowConfig | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // ---- Reset ----
  const reset = useCallback(() => {
    setIsRunning(false);
    setSteps([]);
    setPlan(null);
    setResult(null);
    setClarifyingQuestions(null);
    setPendingPrompt(null);
    setPendingConfig(null);
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  // ---- Execute ----
  const execute = useCallback(async (
    prompt: string,
    config?: WorkflowConfig,
    clarificationAnswers?: Record<string, string>,
  ) => {
    // Reset state
    setIsRunning(true);
    setSteps([]);
    setPlan(null);
    setResult(null);
    setClarifyingQuestions(null);
    setPendingPrompt(prompt);
    setPendingConfig(config ?? null);

    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      // Get the auth token for the SSE request
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error('Not authenticated');
        setIsRunning(false);
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/ops-workflow-orchestrator`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({
          prompt,
          config,
          clarification_answers: clarificationAnswers,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Workflow failed' }));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      // Process SSE stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              handleSSEEvent(currentEvent, data);
            } catch {
              // Skip malformed JSON
            }
            currentEvent = '';
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('[useWorkflowOrchestrator] Error:', err);
      toast.error(err.message || 'Workflow failed');
      setResult({
        status: 'error',
        steps: [],
        error: err.message,
      });
    } finally {
      setIsRunning(false);
    }
  }, []);

  // ---- SSE event handler ----
  const handleSSEEvent = useCallback((event: string, data: any) => {
    switch (event) {
      case 'step_start':
        setSteps(prev => [
          ...prev,
          {
            step: data.step,
            label: data.label,
            status: 'running',
            agent: data.agent,
          },
        ]);
        break;

      case 'step_progress':
        setSteps(prev =>
          prev.map(s =>
            s.step === data.step
              ? { ...s, progress: data.message }
              : s
          )
        );
        break;

      case 'step_complete':
        setSteps(prev =>
          prev.map(s =>
            s.step === data.step
              ? {
                  ...s,
                  status: 'complete' as const,
                  summary: data.summary,
                  data: data.data,
                  duration_ms: data.duration_ms,
                  agent: data.agent || s.agent,
                }
              : s
          )
        );
        break;

      case 'step_error':
        setSteps(prev =>
          prev.map(s =>
            s.step === data.step
              ? {
                  ...s,
                  status: 'error' as const,
                  summary: data.summary,
                  error: data.error,
                  duration_ms: data.duration_ms,
                  agent: data.agent || s.agent,
                }
              : s
          )
        );
        break;

      case 'plan_created':
        setPlan(data.plan);
        break;

      case 'clarification_needed':
        setClarifyingQuestions(data.questions);
        break;

      case 'workflow_paused':
        setResult({
          status: 'paused',
          steps: [],
        });
        break;

      case 'workflow_complete':
        setResult({
          status: data.status,
          table_id: data.table_id,
          table_name: data.table_name,
          steps: data.steps || [],
          errors: data.errors,
          duration_ms: data.duration_ms,
          error: data.error,
        });

        // Show toast based on result
        if (data.status === 'complete') {
          toast.success(`Workflow complete! Table "${data.table_name}" is ready.`);
        } else if (data.status === 'partial') {
          toast.warning('Workflow completed with some errors. Check the results.');
        } else if (data.status === 'error') {
          toast.error(data.error || 'Workflow failed');
        }
        break;
    }
  }, []);

  // ---- Answer clarifying questions ----
  const answerClarifications = useCallback((answers: Record<string, string>) => {
    if (!pendingPrompt) return;
    setClarifyingQuestions(null);
    execute(pendingPrompt, pendingConfig ?? undefined, answers);
  }, [pendingPrompt, pendingConfig, execute]);

  // ---- Abort ----
  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
  }, []);

  return {
    // State
    isRunning,
    steps,
    plan,
    result,
    clarifyingQuestions,

    // Actions
    execute,
    answerClarifications,
    abort,
    reset,
  };
}

// ---------------------------------------------------------------------------
// Workflow prompt detector
// ---------------------------------------------------------------------------

const WORKFLOW_KEYWORDS = [
  'find me',
  'find and',
  'search for',
  'search and',
  'prospect',
  'outreach',
  'sequence',
  'campaign',
  'cold email',
  'send emails',
  'email sequence',
  'create a table',
  'build a list',
  'build me a list',
  'run a search',
  'apollo search',
  'find leads',
  'generate emails',
  'start a campaign',
  'reach out',
];

/**
 * Detect if a query is a workflow-level prompt (prospecting/outreach)
 * vs a table-level query (filter, sort, analyze existing data).
 */
export function isWorkflowPrompt(query: string): boolean {
  const lower = query.toLowerCase().trim();
  return WORKFLOW_KEYWORDS.some(kw => lower.includes(kw));
}
