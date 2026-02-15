-- Migration: Make sequence_skill_id nullable for orchestrator-managed jobs
-- Purpose: The orchestrator creates jobs from event sequences (eventSequences.ts),
-- not from platform_skills records. These jobs don't have a sequence_skill_id.
-- Date: 2026-02-14

ALTER TABLE sequence_jobs
  ALTER COLUMN sequence_skill_id DROP NOT NULL;

COMMENT ON COLUMN sequence_jobs.sequence_skill_id IS
  'Optional reference to platform_skills. NULL for orchestrator-managed event sequences.';

-- Update the start_sequence_job RPC to allow null skill_id
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
  -- If skill_id provided, verify it exists
  IF p_sequence_skill_id IS NOT NULL THEN
    SELECT id, skill_key, category INTO v_skill
    FROM platform_skills
    WHERE id = p_sequence_skill_id AND is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Skill not found or not active';
    END IF;
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
    p_initial_input,
    'running',
    now()
  ) RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
