-- Migration: Add main session tracking columns to copilot_conversations
-- Purpose: Support persistent single session per user with compaction tracking
-- Date: 2026-02-03

-- =============================================================================
-- Add columns for main session tracking
-- =============================================================================

-- Add is_main_session column to track the user's primary conversation
ALTER TABLE copilot_conversations
  ADD COLUMN IF NOT EXISTS is_main_session BOOLEAN DEFAULT FALSE;

-- Add token estimation for compaction decisions
ALTER TABLE copilot_conversations
  ADD COLUMN IF NOT EXISTS total_tokens_estimate INTEGER DEFAULT 0;

-- Add last compaction timestamp
ALTER TABLE copilot_conversations
  ADD COLUMN IF NOT EXISTS last_compaction_at TIMESTAMPTZ;

-- =============================================================================
-- Ensure only one main session per user (unique partial index)
-- =============================================================================

-- Drop the index if it exists (to make migration idempotent)
DROP INDEX IF EXISTS idx_copilot_conversations_main_session;

-- Create unique partial index: only one main session per user
CREATE UNIQUE INDEX idx_copilot_conversations_main_session
  ON copilot_conversations(user_id)
  WHERE is_main_session = TRUE;

-- =============================================================================
-- Add index for efficient session queries
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_copilot_conversations_user_main
  ON copilot_conversations(user_id, is_main_session);

CREATE INDEX IF NOT EXISTS idx_copilot_conversations_tokens
  ON copilot_conversations(total_tokens_estimate)
  WHERE is_main_session = TRUE;

-- =============================================================================
-- Add is_compacted column to copilot_messages for soft-delete during compaction
-- =============================================================================

ALTER TABLE copilot_messages
  ADD COLUMN IF NOT EXISTS is_compacted BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_copilot_messages_compacted
  ON copilot_messages(conversation_id, is_compacted)
  WHERE is_compacted = FALSE;

-- =============================================================================
-- Helper function to get or create main session
-- =============================================================================

CREATE OR REPLACE FUNCTION get_or_create_main_session(
  p_user_id UUID,
  p_org_id UUID DEFAULT NULL
)
RETURNS copilot_conversations
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session copilot_conversations;
BEGIN
  -- Try to get existing main session
  SELECT * INTO v_session
  FROM copilot_conversations
  WHERE user_id = p_user_id
    AND is_main_session = TRUE;

  -- If found, return it
  IF v_session.id IS NOT NULL THEN
    RETURN v_session;
  END IF;

  -- Create new main session
  INSERT INTO copilot_conversations (
    user_id,
    org_id,
    title,
    is_main_session,
    total_tokens_estimate,
    created_at,
    updated_at
  )
  VALUES (
    p_user_id,
    p_org_id,
    'Main Session',
    TRUE,
    0,
    NOW(),
    NOW()
  )
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
