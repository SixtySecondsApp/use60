/// <reference path="../deno.d.ts" />

/**
 * Generate Doc Embeddings Edge Function
 *
 * One-shot utility that generates OpenAI text-embedding-3-small embeddings
 * for all docs_articles that are missing content_embedding.
 *
 * POST /generate-doc-embeddings   (admin-only)
 *
 * Response: { processed: number, total: number, errors: string[] }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 1536,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI embedding failed: ${errText}`);
  }

  const data = await response.json();
  return data.data[0].embedding as number[];
}

serve(async (req: Request) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Verify caller is admin
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: profile } = await serviceClient
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ error: 'Admin only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch all published articles without embeddings
    const { data: articles, error: fetchError } = await serviceClient
      .from('docs_articles')
      .select('id, slug, title, category, content')
      .is('content_embedding', null)
      .eq('published', true);

    if (fetchError) {
      throw new Error(`Failed to fetch articles: ${fetchError.message}`);
    }

    if (!articles || articles.length === 0) {
      return new Response(JSON.stringify({ processed: 0, total: 0, message: 'All articles already have embeddings' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[generate-doc-embeddings] Processing ${articles.length} articles`);

    let processed = 0;
    const errors: string[] = [];

    for (const article of articles) {
      try {
        // Build embedding text: title + category + content (capped at ~30k chars)
        const embeddingText = `${article.title}\n${article.category}\n\n${(article.content || '').slice(0, 30000)}`;
        const embedding = await generateEmbedding(embeddingText);

        // Store via update_doc_embedding RPC (handles vector casting)
        const { error: updateError } = await serviceClient.rpc('update_doc_embedding', {
          p_article_id: article.id,
          p_embedding: JSON.stringify(embedding),
        });

        if (updateError) {
          throw new Error(updateError.message);
        }

        processed++;
        console.log(`[generate-doc-embeddings] ✓ ${article.slug} (${processed}/${articles.length})`);
      } catch (err) {
        const msg = `${article.slug}: ${err instanceof Error ? err.message : 'Unknown error'}`;
        errors.push(msg);
        console.error(`[generate-doc-embeddings] ✗ ${msg}`);
      }
    }

    return new Response(
      JSON.stringify({ processed, total: articles.length, errors }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    console.error(`[generate-doc-embeddings] Error: ${msg}`);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
