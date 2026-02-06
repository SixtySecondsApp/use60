-- Enhance: sequence_executions table with additional tracking columns
-- Date: 2026-01-24
-- Story: REL-001
-- Purpose: Add columns for better debugging, confirmation flow, and telemetry
--
-- Note: The sequence_executions table already exists in the baseline.
-- This migration adds additional columns for improved tracking.

BEGIN;

-- Add execution_id column for unique tracking across systems
ALTER TABLE sequence_executions 
ADD COLUMN IF NOT EXISTS execution_id TEXT;

-- Add pending_action for confirmation flow
ALTER TABLE sequence_executions 
ADD COLUMN IF NOT EXISTS pending_action JSONB;

-- Add confirmed_at for tracking when user confirmed
ALTER TABLE sequence_executions 
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Add current_step for better progress tracking
ALTER TABLE sequence_executions 
ADD COLUMN IF NOT EXISTS current_step TEXT;

-- Add total_steps for progress percentage calculation
ALTER TABLE sequence_executions 
ADD COLUMN IF NOT EXISTS total_steps INTEGER;

-- Add steps_completed counter
ALTER TABLE sequence_executions 
ADD COLUMN IF NOT EXISTS steps_completed INTEGER DEFAULT 0;

-- Add error_details for richer error context
ALTER TABLE sequence_executions 
ADD COLUMN IF NOT EXISTS error_details JSONB;

-- Add metadata for additional context
ALTER TABLE sequence_executions 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_sequence_executions_execution_id 
  ON sequence_executions(execution_id);

CREATE INDEX IF NOT EXISTS idx_sequence_executions_status_created 
  ON sequence_executions(status, created_at DESC);

-- Composite index for user + sequence + status queries
CREATE INDEX IF NOT EXISTS idx_sequence_executions_user_seq_status 
  ON sequence_executions(user_id, sequence_key, status);

-- Add comments for documentation
COMMENT ON COLUMN sequence_executions.execution_id IS 'Unique identifier for this execution instance';
COMMENT ON COLUMN sequence_executions.pending_action IS 'Stored action params for preview->confirm flow';
COMMENT ON COLUMN sequence_executions.confirmed_at IS 'When user confirmed the pending action';
COMMENT ON COLUMN sequence_executions.current_step IS 'Name of the step currently executing';
COMMENT ON COLUMN sequence_executions.steps_completed IS 'Count of completed steps for progress tracking';
COMMENT ON COLUMN sequence_executions.total_steps IS 'Total number of steps in the sequence';
COMMENT ON COLUMN sequence_executions.error_details IS 'Rich error context including stack traces';
COMMENT ON COLUMN sequence_executions.metadata IS 'Additional execution context and telemetry';

COMMIT;
