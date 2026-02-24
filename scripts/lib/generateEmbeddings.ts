/**
 * Embedding Generation Utility
 *
 * Generates OpenAI text-embedding-3-small embeddings for skill descriptions.
 * Used by sync-skills.ts to populate description_embedding column.
 *
 * Usage:
 *   import { generateSkillEmbeddings } from './lib/generateEmbeddings';
 *   await generateSkillEmbeddings(supabase, ['meeting-prep-brief']);
 *
 * Required env: OPENAI_API_KEY
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = 20; // OpenAI allows up to 2048 inputs per request

interface EmbeddingResult {
  skillKey: string;
  status: 'generated' | 'skipped' | 'error';
  error?: string;
}

/**
 * Build the text to embed for a skill.
 * Format: "<name>: <description>"
 * This captures the most semantically relevant information for routing.
 */
function buildEmbeddingInput(frontmatter: Record<string, unknown>): string {
  const name = (frontmatter.name as string) || '';
  const description = (frontmatter.description as string) || '';
  const triggers = Array.isArray(frontmatter.triggers)
    ? frontmatter.triggers.map((t: unknown) =>
        typeof t === 'string' ? t : (t as Record<string, unknown>)?.pattern || ''
      ).join(', ')
    : '';

  let text = `${name}: ${description}`;
  if (triggers) {
    text += ` Triggers: ${triggers}`;
  }
  return text;
}

/**
 * Call OpenAI embeddings API for a batch of texts.
 */
async function callOpenAIEmbeddings(
  texts: string[],
  apiKey: string
): Promise<number[][]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  return (data.data as Array<{ embedding: number[] }>)
    .sort((a: any, b: any) => a.index - b.index)
    .map((d: any) => d.embedding);
}

/**
 * Generate and store embeddings for specified skills (or all skills if none specified).
 *
 * @param supabase  Supabase client (needs service role for writing embeddings)
 * @param skillKeys  Optional list of skill keys to process. If empty, processes all.
 * @param options.force  Regenerate even if embedding already exists
 * @returns Array of results per skill
 */
export async function generateSkillEmbeddings(
  supabase: SupabaseClient,
  skillKeys?: string[],
  options?: { force?: boolean }
): Promise<EmbeddingResult[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set in environment');
  }

  const force = options?.force ?? false;

  // Fetch skills to embed
  let query = supabase
    .from('platform_skills')
    .select('skill_key, frontmatter, description_embedding')
    .eq('is_active', true);

  if (skillKeys && skillKeys.length > 0) {
    query = query.in('skill_key', skillKeys);
  }

  const { data: skills, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch skills: ${error.message}`);
  }

  if (!skills || skills.length === 0) {
    return [];
  }

  // Filter to skills that need embeddings
  const toEmbed = force
    ? skills
    : skills.filter((s) => !s.description_embedding);

  if (toEmbed.length === 0) {
    return skills.map((s) => ({
      skillKey: s.skill_key,
      status: 'skipped' as const,
    }));
  }

  const results: EmbeddingResult[] = [];

  // Process in batches
  for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
    const batch = toEmbed.slice(i, i + BATCH_SIZE);
    const texts = batch.map((s) => buildEmbeddingInput(s.frontmatter));

    try {
      const embeddings = await callOpenAIEmbeddings(texts, apiKey);

      // Store embeddings
      for (let j = 0; j < batch.length; j++) {
        const skill = batch[j];
        const embedding = embeddings[j];

        const { error: updateError } = await supabase
          .from('platform_skills')
          .update({ description_embedding: JSON.stringify(embedding) })
          .eq('skill_key', skill.skill_key);

        if (updateError) {
          results.push({
            skillKey: skill.skill_key,
            status: 'error',
            error: updateError.message,
          });
        } else {
          results.push({
            skillKey: skill.skill_key,
            status: 'generated',
          });
        }
      }
    } catch (err) {
      // Mark entire batch as errored
      for (const skill of batch) {
        results.push({
          skillKey: skill.skill_key,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Add skipped results for skills that already had embeddings
  for (const skill of skills) {
    if (!toEmbed.find((s) => s.skill_key === skill.skill_key)) {
      results.push({
        skillKey: skill.skill_key,
        status: 'skipped',
      });
    }
  }

  return results;
}

/**
 * Generate an embedding for a single query string (used at routing time).
 */
export async function generateQueryEmbedding(
  query: string,
  apiKey: string
): Promise<number[]> {
  const [embedding] = await callOpenAIEmbeddings([query], apiKey);
  return embedding;
}
