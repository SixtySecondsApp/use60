/**
 * Sequence Execution Service
 *
 * Manages execution of sequences (mega skills) with:
 * - Job creation and tracking via job_id
 * - Step-by-step execution with context passing
 * - HITL pause/resume support
 * - Status monitoring
 */

import { supabase } from '../supabase/clientV2';

// =============================================================================
// Types
// =============================================================================

export type SequenceJobStatus =
  | 'pending'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

export interface SequenceJob {
  id: string;
  sequence_skill_id: string;
  user_id: string;
  organization_id: string | null;
  status: SequenceJobStatus;
  current_step: number;
  current_skill_key: string | null;
  context: Record<string, unknown>;
  initial_input: Record<string, unknown>;
  step_results: StepResult[];
  waiting_for_approval_since: string | null;
  approval_request_id: string | null;
  approval_channel: string | null;
  error_message: string | null;
  error_step: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StepResult {
  step: number;
  skill_key: string;
  output: Record<string, unknown>;
  status: 'completed' | 'failed' | 'skipped';
  timestamp: string;
}

export interface JobStatusInfo {
  id: string;
  sequence_skill_key: string;
  sequence_name: string;
  status: SequenceJobStatus;
  current_step: number;
  current_skill_key: string | null;
  started_at: string | null;
  completed_at: string | null;
  waiting_for_approval_since: string | null;
  approval_channel: string | null;
  error_message: string | null;
  step_count: number;
}

export interface StartSequenceInput {
  sequenceSkillId: string;
  userId: string;
  organizationId?: string;
  initialInput?: Record<string, unknown>;
}

export interface ApprovalData {
  approval_status: string;
  approver_id: string;
  approver_name?: string;
  approval_timestamp: string;
  feedback?: string;
  edited_data?: Record<string, unknown>;
}

// =============================================================================
// Service Functions
// =============================================================================

/**
 * Start a new sequence job
 * Creates a job record and returns the job_id
 */
export async function startSequence(input: StartSequenceInput): Promise<string> {
  const { data, error } = await supabase.rpc('start_sequence_job', {
    p_sequence_skill_id: input.sequenceSkillId,
    p_user_id: input.userId,
    p_organization_id: input.organizationId || null,
    p_initial_input: input.initialInput || {},
  });

  if (error) {
    console.error('[sequenceExecutionService.startSequence] Error:', error);
    throw new Error(`Failed to start sequence: ${error.message}`);
  }

  return data as string;
}

/**
 * Get a job by ID
 */
export async function getJob(jobId: string): Promise<SequenceJob | null> {
  const { data, error } = await supabase
    .from('sequence_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('[sequenceExecutionService.getJob] Error:', error);
    throw new Error(`Failed to get job: ${error.message}`);
  }

  return data;
}

/**
 * Get job status with sequence info
 */
export async function getJobStatus(jobId: string): Promise<JobStatusInfo | null> {
  const { data, error } = await supabase.rpc('get_sequence_job_status', {
    p_job_id: jobId,
  });

  if (error) {
    console.error('[sequenceExecutionService.getJobStatus] Error:', error);
    throw new Error(`Failed to get job status: ${error.message}`);
  }

  return (data as JobStatusInfo[])?.[0] || null;
}

/**
 * Update job after a step completes
 */
export async function updateJobStep(
  jobId: string,
  step: number,
  skillKey: string,
  output: Record<string, unknown>,
  status: 'completed' | 'failed' = 'completed'
): Promise<boolean> {
  const { data, error } = await supabase.rpc('update_sequence_job_step', {
    p_job_id: jobId,
    p_step: step,
    p_skill_key: skillKey,
    p_output: output,
    p_status: status,
  });

  if (error) {
    console.error('[sequenceExecutionService.updateJobStep] Error:', error);
    throw new Error(`Failed to update job step: ${error.message}`);
  }

  return data as boolean;
}

/**
 * Pause job for HITL approval
 */
export async function pauseJob(
  jobId: string,
  approvalChannel: string,
  approvalRequestId?: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('pause_sequence_job', {
    p_job_id: jobId,
    p_approval_channel: approvalChannel,
    p_approval_request_id: approvalRequestId || null,
  });

  if (error) {
    console.error('[sequenceExecutionService.pauseJob] Error:', error);
    throw new Error(`Failed to pause job: ${error.message}`);
  }

  return data as boolean;
}

/**
 * Resume job after approval
 */
export async function resumeJob(
  jobId: string,
  approvalData: ApprovalData
): Promise<boolean> {
  const { data, error } = await supabase.rpc('resume_sequence_job', {
    p_job_id: jobId,
    p_approval_data: approvalData,
  });

  if (error) {
    console.error('[sequenceExecutionService.resumeJob] Error:', error);
    throw new Error(`Failed to resume job: ${error.message}`);
  }

  return data as boolean;
}

/**
 * Complete a job
 */
export async function completeJob(
  jobId: string,
  finalOutput?: Record<string, unknown>
): Promise<boolean> {
  const { data, error } = await supabase.rpc('complete_sequence_job', {
    p_job_id: jobId,
    p_final_output: finalOutput || {},
  });

  if (error) {
    console.error('[sequenceExecutionService.completeJob] Error:', error);
    throw new Error(`Failed to complete job: ${error.message}`);
  }

  return data as boolean;
}

/**
 * Cancel a job
 */
export async function cancelJob(jobId: string, reason?: string): Promise<boolean> {
  const { error } = await supabase
    .from('sequence_jobs')
    .update({
      status: 'cancelled',
      error_message: reason || 'Cancelled by user',
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .in('status', ['pending', 'running', 'waiting_approval']);

  if (error) {
    console.error('[sequenceExecutionService.cancelJob] Error:', error);
    throw new Error(`Failed to cancel job: ${error.message}`);
  }

  return true;
}

/**
 * Get jobs for a user
 */
export async function getUserJobs(
  userId: string,
  options?: {
    status?: SequenceJobStatus[];
    limit?: number;
    offset?: number;
  }
): Promise<SequenceJob[]> {
  let query = supabase
    .from('sequence_jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (options?.status && options.status.length > 0) {
    query = query.in('status', options.status);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[sequenceExecutionService.getUserJobs] Error:', error);
    throw new Error(`Failed to get user jobs: ${error.message}`);
  }

  return data || [];
}

/**
 * Get jobs waiting for approval
 */
export async function getJobsWaitingApproval(userId: string): Promise<SequenceJob[]> {
  const { data, error } = await supabase
    .from('sequence_jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'waiting_approval')
    .order('waiting_for_approval_since', { ascending: true });

  if (error) {
    console.error('[sequenceExecutionService.getJobsWaitingApproval] Error:', error);
    throw new Error(`Failed to get jobs waiting approval: ${error.message}`);
  }

  return data || [];
}

/**
 * Get recent job executions for a sequence
 */
export async function getSequenceJobHistory(
  sequenceSkillId: string,
  limit: number = 10
): Promise<SequenceJob[]> {
  const { data, error } = await supabase
    .from('sequence_jobs')
    .select('*')
    .eq('sequence_skill_id', sequenceSkillId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[sequenceExecutionService.getSequenceJobHistory] Error:', error);
    throw new Error(`Failed to get sequence job history: ${error.message}`);
  }

  return data || [];
}

/**
 * Get job context (current state bag)
 */
export async function getJobContext(jobId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('sequence_jobs')
    .select('context')
    .eq('id', jobId)
    .single();

  if (error) {
    console.error('[sequenceExecutionService.getJobContext] Error:', error);
    throw new Error(`Failed to get job context: ${error.message}`);
  }

  return (data?.context as Record<string, unknown>) || {};
}

/**
 * Update job context (merge new values)
 */
export async function updateJobContext(
  jobId: string,
  contextUpdates: Record<string, unknown>
): Promise<boolean> {
  // Get current context
  const currentContext = await getJobContext(jobId);

  // Merge updates
  const newContext = { ...currentContext, ...contextUpdates };

  const { error } = await supabase
    .from('sequence_jobs')
    .update({ context: newContext })
    .eq('id', jobId);

  if (error) {
    console.error('[sequenceExecutionService.updateJobContext] Error:', error);
    throw new Error(`Failed to update job context: ${error.message}`);
  }

  return true;
}

// =============================================================================
// Export Service Object
// =============================================================================

export const sequenceExecutionService = {
  // Job lifecycle
  startSequence,
  getJob,
  getJobStatus,
  completeJob,
  cancelJob,

  // Step management
  updateJobStep,

  // HITL support
  pauseJob,
  resumeJob,
  getJobsWaitingApproval,

  // Context management
  getJobContext,
  updateJobContext,

  // Queries
  getUserJobs,
  getSequenceJobHistory,
};

export default sequenceExecutionService;
