/**
 * Embedding Service
 *
 * Provides vector similarity search for skill routing.
 * Calls the generate-embedding edge function to create query embeddings,
 * then uses the match_skills_by_embedding RPC for similarity search.
 */

import { supabase } from '../supabase/clientV2';

export interface SemanticMatch {
  skillId: string;
  skillKey: string;
  category: string;
  frontmatter: Record<string, unknown>;
  similarity: number;
}

/**
 * Generate an embedding for a query string via the edge function.
 */
async function generateQueryEmbedding(query: string): Promise<number[] | null> {
  const { data, error } = await supabase.functions.invoke('generate-embedding', {
    body: { text: query },
  });

  if (error || !data?.embedding) {
    console.warn('[embeddingService] Failed to generate query embedding:', error?.message);
    return null;
  }

  return data.embedding;
}

/**
 * Find skills by semantic similarity to a user message.
 *
 * @param message  User message to match against
 * @param threshold  Minimum similarity score (0-1, default 0.5)
 * @param maxResults  Maximum number of results (default 5)
 * @returns Matching skills sorted by similarity (descending)
 */
export async function findSemanticMatches(
  message: string,
  threshold = 0.5,
  maxResults = 5
): Promise<SemanticMatch[]> {
  const embedding = await generateQueryEmbedding(message);
  if (!embedding) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('match_skills_by_embedding', {
    query_embedding: JSON.stringify(embedding),
    match_threshold: threshold,
    match_count: maxResults,
  });

  if (error) {
    console.warn('[embeddingService] Similarity search failed:', error.message);
    return [];
  }

  return ((data || []) as any[]).map((row: any) => ({
    skillId: row.id,
    skillKey: row.skill_key,
    category: row.category,
    frontmatter: row.frontmatter,
    similarity: row.similarity,
  }));
}

export const embeddingService = {
  findSemanticMatches,
};

export default embeddingService;
