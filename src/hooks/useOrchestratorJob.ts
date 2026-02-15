/**
 * useOrchestratorJob — Realtime subscription + poll fallback for orchestrator job tracking
 *
 * Extracted from ProactiveAgentV2Demo.tsx to provide reusable job tracking logic.
 * Subscribes to Realtime updates on sequence_jobs table and polls as fallback.
 *
 * Usage:
 * ```tsx
 * const { stepResults, jobStatus, isRunning, reset } = useOrchestratorJob(jobId);
 * ```
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

export interface StepResultEntry {
  skill_key: string;
  status: string;
  output?: any;
  duration_ms?: number;
}

export interface UseOrchestratorJobReturn {
  stepResults: StepResultEntry[];
  jobStatus: string | null;
  isRunning: boolean;
  reset: () => void;
}

/**
 * Track orchestrator job progress with Realtime updates + polling fallback
 *
 * @param jobId - The sequence_jobs.id to track (null = no tracking)
 * @returns Job state including step results, status, and running flag
 */
export function useOrchestratorJob(jobId: string | null): UseOrchestratorJobReturn {
  const [stepResults, setStepResults] = useState<StepResultEntry[]>([]);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const reset = useCallback(() => {
    setStepResults([]);
    setJobStatus(null);
    setIsRunning(false);
  }, []);

  useEffect(() => {
    if (!jobId) {
      reset();
      return;
    }

    // Set running state when job starts tracking
    setIsRunning(true);

    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const updateFromJob = (job: any) => {
      // Update step results (JSONB array from DB)
      if (job.step_results) {
        setStepResults(job.step_results);
      }

      // Update status and handle terminal states
      if (job.status && job.status !== jobStatus) {
        setJobStatus(job.status);

        if (job.status === 'completed') {
          setIsRunning(false);
          toast.success('Orchestrator completed!', {
            description: `${(job.step_results || []).filter((s: any) => s.status === 'completed').length} steps completed`,
          });
        } else if (job.status === 'failed') {
          setIsRunning(false);
          toast.error('Orchestrator failed', {
            description: job.error_message || 'Unknown error',
          });
        }
      }
    };

    // Realtime channel subscription
    const channel = supabase
      .channel(`orchestrator-job-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sequence_jobs',
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          updateFromJob(payload.new);
        }
      )
      .subscribe();

    // Poll fallback every 3s (Realtime may miss rapid updates)
    pollInterval = setInterval(async () => {
      const { data } = await supabase
        .from('sequence_jobs')
        .select('id, status, step_results, error_message, current_step, current_skill_key')
        .eq('id', jobId)
        .maybeSingle();

      if (data) {
        updateFromJob(data);
      }

      // Stop polling once terminal state reached
      if (data?.status === 'completed' || data?.status === 'failed') {
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      }
    }, 3000);

    // Cleanup on unmount or jobId change
    return () => {
      supabase.removeChannel(channel);
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [jobId]); // Intentionally omit jobStatus to avoid dependency loop

  return {
    stepResults,
    jobStatus,
    isRunning,
    reset,
  };
}
