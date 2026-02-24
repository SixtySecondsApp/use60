-- Migration: Create copilot_memories table for persistent memory storage
-- Purpose: Store extracted memories from copilot conversations for proactive recall
-- Date: 2026-02-03

-- =============================================================================
-- Create copilot_memories table
-- =============================================================================

CREATE TABLE IF NOT EXISTS copilot_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clerk_org_id TEXT,

  -- Memory categorization
  category TEXT NOT NULL CHECK (category IN ('deal', 'relationship', 'preference', 'commitment', 'fact')),

  -- Content
  subject TEXT NOT NULL,           -- e.g., "Acme Corp deal", "John Smith", "Report format"
  content TEXT NOT NULL,           -- The actual memory content
  context_summary TEXT,            -- How this memory was derived

  -- Entity linking (optional)
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,

  -- Metadata
  confidence NUMERIC(3,2) DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  source_message_ids UUID[],            -- Which messages this came from
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,               -- Optional TTL for temporary memories

  -- Search: embedding column added later when pgvector is enabled
  -- embedding VECTOR(1536)

  -- Placeholder for future search
  search_text TSVECTOR
);

-- =============================================================================
-- Indexes for efficient querying
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_copilot_memories_user_id
  ON copilot_memories(user_id);

CREATE INDEX IF NOT EXISTS idx_copilot_memories_category
  ON copilot_memories(user_id, category);

CREATE INDEX IF NOT EXISTS idx_copilot_memories_subject
  ON copilot_memories(user_id, subject);

CREATE INDEX IF NOT EXISTS idx_copilot_memories_deal
  ON copilot_memories(deal_id)
  WHERE deal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_copilot_memories_contact
  ON copilot_memories(contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_copilot_memories_company
  ON copilot_memories(company_id)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_copilot_memories_last_accessed
  ON copilot_memories(user_id, last_accessed_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_copilot_memories_created
  ON copilot_memories(user_id, created_at DESC);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE copilot_memories ENABLE ROW LEVEL SECURITY;

-- Users can manage only their own memories
CREATE POLICY "Users can view own memories"
  ON copilot_memories
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own memories"
  ON copilot_memories
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memories"
  ON copilot_memories
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own memories"
  ON copilot_memories
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role can manage all memories (for edge functions)
CREATE POLICY "Service role can manage all memories"
  ON copilot_memories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- Trigger to update updated_at timestamp
-- =============================================================================

CREATE OR REPLACE FUNCTION update_copilot_memories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER copilot_memories_updated_at
  BEFORE UPDATE ON copilot_memories
  FOR EACH ROW
  EXECUTE FUNCTION update_copilot_memories_updated_at();

-- =============================================================================
-- Helper function for memory recall
-- =============================================================================

CREATE OR REPLACE FUNCTION recall_relevant_memories(
  p_user_id UUID,
  p_search_text TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  category TEXT,
  subject TEXT,
  content TEXT,
  confidence NUMERIC,
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER,
  relevance_score FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.category,
    m.subject,
    m.content,
    m.confidence,
    m.last_accessed_at,
    m.access_count,
    -- Simple relevance scoring: keyword matches + recency + access frequency
    (
      CASE WHEN m.subject ILIKE '%' || p_search_text || '%' THEN 3.0 ELSE 0.0 END +
      CASE WHEN m.content ILIKE '%' || p_search_text || '%' THEN 2.0 ELSE 0.0 END +
      (COALESCE(m.access_count, 0)::FLOAT / 100.0) +
      (CASE WHEN m.last_accessed_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (NOW() - m.last_accessed_at)) / -86400.0 / 30.0
        ELSE -1.0
      END)
    )::FLOAT AS relevance_score
  FROM copilot_memories m
  WHERE m.user_id = p_user_id
    AND (m.expires_at IS NULL OR m.expires_at > NOW())
    AND (
      m.subject ILIKE '%' || p_search_text || '%'
      OR m.content ILIKE '%' || p_search_text || '%'
    )
  ORDER BY relevance_score DESC, m.created_at DESC
  LIMIT p_limit;
END;
$$;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
