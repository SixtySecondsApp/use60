-- RPC to fetch conversation summaries with message counts and preview in a single query
-- Replaces the two-query pattern (conversations + messages) in useConversationHistory

DROP FUNCTION IF EXISTS get_conversation_summaries(UUID, INT);

CREATE OR REPLACE FUNCTION get_conversation_summaries(
  p_user_id UUID,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  message_count BIGINT,
  first_user_message TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    c.id,
    c.title,
    c.created_at,
    c.updated_at,
    COALESCE(counts.cnt, 0) AS message_count,
    previews.content AS first_user_message
  FROM copilot_conversations c
  LEFT JOIN (
    SELECT conversation_id, COUNT(*) AS cnt
    FROM copilot_messages
    GROUP BY conversation_id
  ) counts ON counts.conversation_id = c.id
  LEFT JOIN LATERAL (
    SELECT m.content
    FROM copilot_messages m
    WHERE m.conversation_id = c.id
      AND m.role = 'user'
    ORDER BY m.created_at ASC
    LIMIT 1
  ) previews ON true
  WHERE c.user_id = p_user_id
  ORDER BY c.updated_at DESC
  LIMIT p_limit;
$$;
