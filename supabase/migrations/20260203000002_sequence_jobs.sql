-- Migration: Sequence Jobs Table
-- Purpose: Track sequence execution with job_id for pause/resume
-- Feature: sequence-simplification (SEQ-008)
-- Date: 2026-02-03

-- =============================================================================
-- Enum: Sequence Job Status
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE sequence_job_status AS ENUM (
    'pending',        -- Job created, not started
    'running',        -- Currently executing a step
    'waiting_approval', -- Paused waiting for HITL approval
    'completed',      -- Successfully finished all steps
    'failed',         -- Failed at a step
    'cancelled',      -- Manually cancelled
    'timeout'         -- Timed out waiting for approval
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Table: sequence_jobs
-- Tracks execution state of sequence (mega skill) runs
-- =============================================================================

CREATE TABLE IF NOT EXISTS sequence_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The sequence being executed (must be category: agent-sequence)
  sequence_skill_id UUID NOT NULL REFERENCES platform_skills(id) ON DELETE CASCADE,

  -- User/org context
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id TEXT, -- clerk_org_id for context

  -- Execution state
  status sequence_job_status NOT NULL DEFAULT 'pending',
  current_step INT DEFAULT 0, -- 0 = not started, 1+ = step number
  current_skill_key TEXT, -- The skill key currently executing

  -- Context passed between steps (JSON state bag)
  context JSONB DEFAULT '{}',
  initial_input JSONB DEFAULT '{}', -- Original input to the sequence

  -- Step results
  step_results JSONB DEFAULT '[]', -- Array of {step, skill_key, output, status, timestamp}

  -- HITL tracking
  waiting_for_approval_since TIMESTAMPTZ, -- When we started waiting
  approval_request_id UUID, -- Reference to the approval request
  approval_channel TEXT, -- 'slack', 'in_app', etc.

  -- Error tracking
  error_message TEXT,
  error_step INT,

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_sequence_jobs_user ON sequence_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_sequence_jobs_org ON sequence_jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_sequence_jobs_sequence ON sequence_jobs(sequence_skill_id);
CREATE INDEX IF NOT EXISTS idx_sequence_jobs_status ON sequence_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sequence_jobs_waiting ON sequence_jobs(status, waiting_for_approval_since)
  WHERE status = 'waiting_approval';

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE sequence_jobs ENABLE ROW LEVEL SECURITY;

-- Users can view their own jobs
DROP POLICY IF EXISTS "Users can view own sequence jobs" ON sequence_jobs;
DO $$ BEGIN
  CREATE POLICY "Users can view own sequence jobs"
  ON sequence_jobs FOR SELECT
  USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can create jobs
DROP POLICY IF EXISTS "Users can create sequence jobs" ON sequence_jobs;
DO $$ BEGIN
  CREATE POLICY "Users can create sequence jobs"
  ON sequence_jobs FOR INSERT
  WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can update their own jobs
DROP POLICY IF EXISTS "Users can update own sequence jobs" ON sequence_jobs;
DO $$ BEGIN
  CREATE POLICY "Users can update own sequence jobs"
  ON sequence_jobs FOR UPDATE
  USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Trigger: Auto-update updated_at
-- =============================================================================

DROP TRIGGER IF EXISTS update_sequence_jobs_updated_at ON sequence_jobs;
CREATE TRIGGER update_sequence_jobs_updated_at
  BEFORE UPDATE ON sequence_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Function: Start a sequence job
-- Creates a new job and returns the job_id
-- =============================================================================

CREATE OR REPLACE FUNCTION start_sequence_job(
  p_sequence_skill_id UUID,
  p_user_id UUID,
  p_organization_id TEXT DEFAULT NULL,
  p_initial_input JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_job_id UUID;
  v_skill RECORD;
BEGIN
  -- Verify the skill is a sequence
  SELECT id, skill_key, category INTO v_skill
  FROM platform_skills
  WHERE id = p_sequence_skill_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Skill not found or not active';
  END IF;

  -- Create the job
  INSERT INTO sequence_jobs (
    sequence_skill_id,
    user_id,
    organization_id,
    initial_input,
    context,
    status,
    started_at
  ) VALUES (
    p_sequence_skill_id,
    p_user_id,
    p_organization_id,
    p_initial_input,
    p_initial_input, -- Initial context is the input
    'running',
    now()
  ) RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Function: Update job step
-- Records step completion and updates context
-- =============================================================================

CREATE OR REPLACE FUNCTION update_sequence_job_step(
  p_job_id UUID,
  p_step INT,
  p_skill_key TEXT,
  p_output JSONB,
  p_status TEXT DEFAULT 'completed'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_job RECORD;
  v_new_results JSONB;
  v_new_context JSONB;
BEGIN
  -- Get the job
  SELECT * INTO v_job FROM sequence_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Append step result
  v_new_results := v_job.step_results || jsonb_build_object(
    'step', p_step,
    'skill_key', p_skill_key,
    'output', p_output,
    'status', p_status,
    'timestamp', now()
  );

  -- Merge output into context (output key is the skill_key by default)
  v_new_context := v_job.context || jsonb_build_object(p_skill_key, p_output);

  -- Update the job
  UPDATE sequence_jobs
  SET
    current_step = p_step,
    current_skill_key = p_skill_key,
    step_results = v_new_results,
    context = v_new_context,
    status = CASE WHEN p_status = 'failed' THEN 'failed'::sequence_job_status ELSE 'running'::sequence_job_status END,
    error_message = CASE WHEN p_status = 'failed' THEN p_output->>'error' ELSE NULL END,
    error_step = CASE WHEN p_status = 'failed' THEN p_step ELSE NULL END
  WHERE id = p_job_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Function: Pause job for HITL approval
-- =============================================================================

CREATE OR REPLACE FUNCTION pause_sequence_job(
  p_job_id UUID,
  p_approval_channel TEXT,
  p_approval_request_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE sequence_jobs
  SET
    status = 'waiting_approval',
    waiting_for_approval_since = now(),
    approval_channel = p_approval_channel,
    approval_request_id = p_approval_request_id
  WHERE id = p_job_id AND status = 'running';

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Function: Resume job after approval
-- =============================================================================

CREATE OR REPLACE FUNCTION resume_sequence_job(
  p_job_id UUID,
  p_approval_data JSONB DEFAULT '{}'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_job RECORD;
  v_new_context JSONB;
BEGIN
  SELECT * INTO v_job FROM sequence_jobs WHERE id = p_job_id;
  IF NOT FOUND OR v_job.status != 'waiting_approval' THEN
    RETURN FALSE;
  END IF;

  -- Merge approval data into context
  v_new_context := v_job.context || jsonb_build_object('approval', p_approval_data);

  UPDATE sequence_jobs
  SET
    status = 'running',
    context = v_new_context,
    waiting_for_approval_since = NULL,
    approval_request_id = NULL,
    approval_channel = NULL
  WHERE id = p_job_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Function: Complete job
-- =============================================================================

CREATE OR REPLACE FUNCTION complete_sequence_job(
  p_job_id UUID,
  p_final_output JSONB DEFAULT '{}'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_new_context JSONB;
BEGIN
  SELECT context || jsonb_build_object('final_output', p_final_output) INTO v_new_context
  FROM sequence_jobs WHERE id = p_job_id;

  UPDATE sequence_jobs
  SET
    status = 'completed',
    context = v_new_context,
    completed_at = now()
  WHERE id = p_job_id AND status = 'running';

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Function: Get job status
-- =============================================================================

CREATE OR REPLACE FUNCTION get_sequence_job_status(p_job_id UUID)
RETURNS TABLE (
  id UUID,
  sequence_skill_key TEXT,
  sequence_name TEXT,
  status sequence_job_status,
  current_step INT,
  current_skill_key TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  waiting_for_approval_since TIMESTAMPTZ,
  approval_channel TEXT,
  error_message TEXT,
  step_count INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sj.id,
    ps.skill_key as sequence_skill_key,
    (ps.frontmatter->>'name')::TEXT as sequence_name,
    sj.status,
    sj.current_step,
    sj.current_skill_key,
    sj.started_at,
    sj.completed_at,
    sj.waiting_for_approval_since,
    sj.approval_channel,
    sj.error_message,
    jsonb_array_length(COALESCE(ps.frontmatter->'sequence_steps', '[]'::jsonb)) as step_count
  FROM sequence_jobs sj
  JOIN platform_skills ps ON sj.sequence_skill_id = ps.id
  WHERE sj.id = p_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Grant execute permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION start_sequence_job TO authenticated;
GRANT EXECUTE ON FUNCTION update_sequence_job_step TO authenticated;
GRANT EXECUTE ON FUNCTION pause_sequence_job TO authenticated;
GRANT EXECUTE ON FUNCTION resume_sequence_job TO authenticated;
GRANT EXECUTE ON FUNCTION complete_sequence_job TO authenticated;
GRANT EXECUTE ON FUNCTION get_sequence_job_status TO authenticated;
