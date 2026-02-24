-- SKL-014: Enable pgvector and add embedding column for semantic skill discovery
--
-- Adds vector embeddings to platform_skills for natural language routing.
-- Uses OpenAI text-embedding-3-small (1536 dimensions).

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column
ALTER TABLE platform_skills
ADD COLUMN IF NOT EXISTS description_embedding vector(1536);

-- IVFFlat index for cosine similarity search
-- lists = ceil(sqrt(n_rows)) — 10 is appropriate for ~30-100 skills
CREATE INDEX IF NOT EXISTS idx_platform_skills_embedding
ON platform_skills USING ivfflat (description_embedding vector_cosine_ops)
WITH (lists = 10);

-- Match function: find skills by embedding similarity
CREATE OR REPLACE FUNCTION match_skills_by_embedding(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5,
  p_org_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  skill_key text,
  category text,
  frontmatter jsonb,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ps.id,
    ps.skill_key,
    ps.category,
    ps.frontmatter,
    1 - (ps.description_embedding <=> query_embedding) AS similarity
  FROM platform_skills ps
  WHERE ps.is_active = true
    AND ps.description_embedding IS NOT NULL
    AND 1 - (ps.description_embedding <=> query_embedding) >= match_threshold
  ORDER BY ps.description_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION match_skills_by_embedding TO authenticated;

COMMENT ON COLUMN platform_skills.description_embedding
  IS 'OpenAI text-embedding-3-small vector (1536d) for semantic skill discovery';

COMMENT ON FUNCTION match_skills_by_embedding
  IS 'Find skills by vector similarity to a query embedding. Used as fallback when trigger-based routing has no confident match.';
