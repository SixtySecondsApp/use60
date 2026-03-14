import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=300, s-maxage=600',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const client = createClient(supabaseUrl, serviceKey);

    const url = new URL(req.url);
    const slug = url.searchParams.get('slug');

    if (slug) {
      // Get single article by slug — must be published
      const { data: article, error } = await client
        .from('docs_articles')
        .select('id, slug, title, category, content, metadata, order_index, updated_at')
        .eq('slug', slug)
        .eq('published', true)
        .maybeSingle();

      if (error) throw error;

      if (!article) {
        return new Response(JSON.stringify({ error: 'Article not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Only serve articles that are public-facing
      const audience = article.metadata?.target_audience;
      if (audience && Array.isArray(audience) && audience.length > 0 && !audience.includes('external')) {
        return new Response(JSON.stringify({ error: 'Article not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ data: article }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // List all published articles — filter to public-facing
    const { data: articles, error } = await client
      .from('docs_articles')
      .select('id, slug, title, category, metadata, order_index, updated_at')
      .eq('published', true)
      .order('category')
      .order('order_index');

    if (error) throw error;

    // Filter to public-facing articles
    const publicArticles = (articles || []).filter((a) => {
      const meta = a.metadata || {};
      const audience = meta.target_audience;

      // Must include 'external' in target_audience (or have no audience set)
      const isExternal = !audience || !Array.isArray(audience) || audience.length === 0
        || audience.includes('external');
      if (!isExternal) return false;

      // Exclude articles that require specific integrations — public visitors have none
      const integrations = meta.required_integrations;
      if (integrations && Array.isArray(integrations) && integrations.length > 0) return false;

      return true;
    });

    // Deduplicate: if multiple articles share the same title within a category,
    // prefer the external-only version over the internal+external one
    const deduped = publicArticles.filter((a, _i, arr) => {
      const audience = a.metadata?.target_audience;
      const isInternalAndExternal = Array.isArray(audience) && audience.includes('internal') && audience.includes('external');
      if (!isInternalAndExternal) return true; // keep external-only or no-audience articles

      // If there's a dedicated external-only article with the same title in the same category, skip this one
      const hasDedicated = arr.some((other) => {
        if (other.id === a.id) return false;
        if (other.category !== a.category) return false;
        if (other.title !== a.title) return false;
        const otherAudience = other.metadata?.target_audience;
        return Array.isArray(otherAudience) && otherAudience.includes('external') && !otherAudience.includes('internal');
      });
      return !hasDedicated;
    });

    // Group by category
    const grouped = deduped.reduce((acc, article) => {
      const cat = article.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(article);
      return acc;
    }, {} as Record<string, typeof deduped>);

    return new Response(JSON.stringify({ data: grouped }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[docs-public] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
