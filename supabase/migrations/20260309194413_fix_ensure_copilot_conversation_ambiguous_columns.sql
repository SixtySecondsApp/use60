-- Migration: fix_ensure_copilot_conversation_ambiguous_columns
-- Date: 20260309194413
--
-- What this migration does:
--   Fixes "column reference is ambiguous" error in ensure_copilot_conversation RPC.
--   The RETURNS TABLE output columns (id, user_id, etc.) create PL/pgSQL variables
--   that shadow the table column names. Fixed with #variable_conflict use_column.
--
-- Rollback strategy:
--   N/A — same function signature, just fixes the ambiguity bug.

DROP FUNCTION IF EXISTS ensure_copilot_conversation(UUID, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION ensure_copilot_conversation(
  p_id UUID,
  p_user_id UUID,
  p_org_id UUID DEFAULT NULL,
  p_title TEXT DEFAULT 'New Conversation'
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  org_id UUID,
  title TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
#variable_conflict use_column
BEGIN
  -- Only allow users to create conversations for themselves
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Attempt insert; if the ID already exists, do nothing
  INSERT INTO copilot_conversations (
    id,
    user_id,
    org_id,
    title,
    is_main_session,
    total_tokens_estimate,
    created_at,
    updated_at
  )
  VALUES (
    p_id,
    p_user_id,
    p_org_id,
    p_title,
    FALSE,
    0,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Return the record (whether newly created or pre-existing)
  RETURN QUERY
  SELECT
    c.id,
    c.user_id,
    c.org_id,
    c.title,
    c.created_at,
    c.updated_at
  FROM copilot_conversations c
  WHERE c.id = p_id
    AND c.user_id = p_user_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION ensure_copilot_conversation(UUID, UUID, UUID, TEXT) TO authenticated;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
