-- DOC-001: Add vector embeddings to docs_articles for semantic documentation search
--
-- Adds content_embedding column and match_docs_by_embedding RPC.
-- Uses OpenAI text-embedding-3-small (1536 dimensions).
-- Mirrors the pattern from 20260204000003_add_skill_embeddings.sql (skills).

-- Add embedding column to docs_articles
ALTER TABLE docs_articles
ADD COLUMN IF NOT EXISTS content_embedding vector(1536);

-- IVFFlat index for cosine similarity search
-- lists = ceil(sqrt(n_rows)) — 10 is appropriate for up to ~100 articles
CREATE INDEX IF NOT EXISTS idx_docs_articles_embedding
ON docs_articles USING ivfflat (content_embedding vector_cosine_ops)
WITH (lists = 10);

-- Match function: find articles by embedding similarity
CREATE OR REPLACE FUNCTION match_docs_by_embedding(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  slug text,
  title text,
  category text,
  content text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    da.id,
    da.slug,
    da.title,
    da.category,
    da.content,
    1 - (da.content_embedding <=> query_embedding) AS similarity
  FROM docs_articles da
  WHERE da.published = true
    AND da.content_embedding IS NOT NULL
    AND 1 - (da.content_embedding <=> query_embedding) >= match_threshold
  ORDER BY da.content_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION match_docs_by_embedding TO authenticated;

COMMENT ON COLUMN docs_articles.content_embedding
  IS 'OpenAI text-embedding-3-small vector (1536d) for semantic documentation search';

COMMENT ON FUNCTION match_docs_by_embedding
  IS 'Find documentation articles by vector similarity to a query embedding. Used by docs-agent and copilot search_documentation tool.';
