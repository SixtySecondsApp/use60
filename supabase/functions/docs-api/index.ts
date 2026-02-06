import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization')!;

    // Create user-scoped client
    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const slug = url.searchParams.get('slug');

    // GET requests
    if (req.method === 'GET') {
      if (action === 'list') {
        // List all published articles grouped by category
        const { data: articles, error } = await userClient
          .from('docs_articles')
          .select('id, slug, title, category, metadata, order_index, updated_at')
          .eq('published', true)
          .order('category')
          .order('order_index');

        if (error) throw error;

        // Group by category
        const grouped = articles?.reduce((acc, article) => {
          const cat = article.category;
          if (!acc[cat]) acc[cat] = [];
          acc[cat].push(article);
          return acc;
        }, {} as Record<string, any[]>) || {};

        return new Response(JSON.stringify({ data: grouped }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'get' && slug) {
        // Get single article with version count
        const { data: article, error: articleError } = await userClient
          .from('docs_articles')
          .select('id, slug, title, category, content, metadata, published, order_index, created_at, updated_at')
          .eq('slug', slug)
          .maybeSingle();

        if (articleError) throw articleError;
        if (!article) {
          return new Response(JSON.stringify({ error: 'Article not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get version count
        const { count: versionCount } = await userClient
          .from('docs_versions')
          .select('id', { count: 'exact', head: true })
          .eq('article_id', article.id);

        return new Response(
          JSON.stringify({ data: { ...article, versionCount: versionCount || 0 } }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST requests require body
    if (req.method === 'POST') {
      const body = await req.json();
      const postAction = body.action;

      // Check if user is platform admin for write operations (except feedback)
      if (postAction !== 'feedback' && postAction !== 'propose_update') {
        const { data: roles } = await userClient
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'platformAdmin')
          .maybeSingle();

        if (!roles) {
          return new Response(JSON.stringify({ error: 'Forbidden: Platform admin required' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Create article
      if (postAction === 'create') {
        const { slug, title, category, content, metadata, published, order_index, org_id } = body;

        if (!slug || !title || !category || !content) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data: article, error } = await userClient
          .from('docs_articles')
          .insert({
            slug,
            title,
            category,
            content,
            metadata: metadata || {},
            published: published || false,
            order_index: order_index || 0,
            org_id: org_id || null,
          })
          .select()
          .single();

        if (error) throw error;

        // Create initial version
        await userClient.from('docs_versions').insert({
          article_id: article.id,
          version_number: 1,
          content,
          changed_by: user.id,
          diff_summary: 'Initial version',
        });

        return new Response(JSON.stringify({ data: article }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update article
      if (postAction === 'update') {
        const { article_id, slug, title, category, content, metadata, published, order_index } = body;

        if (!article_id) {
          return new Response(JSON.stringify({ error: 'Missing article_id' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const updateData: any = {};
        if (slug !== undefined) updateData.slug = slug;
        if (title !== undefined) updateData.title = title;
        if (category !== undefined) updateData.category = category;
        if (content !== undefined) updateData.content = content;
        if (metadata !== undefined) updateData.metadata = metadata;
        if (published !== undefined) updateData.published = published;
        if (order_index !== undefined) updateData.order_index = order_index;

        const { data: article, error } = await userClient
          .from('docs_articles')
          .update(updateData)
          .eq('id', article_id)
          .select()
          .single();

        if (error) throw error;

        // Version is auto-created by trigger

        return new Response(JSON.stringify({ data: article }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Delete article
      if (postAction === 'delete') {
        const { article_id } = body;

        if (!article_id) {
          return new Response(JSON.stringify({ error: 'Missing article_id' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { error } = await userClient
          .from('docs_articles')
          .delete()
          .eq('id', article_id);

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Submit feedback
      if (postAction === 'feedback') {
        const { article_id, helpful, comment, section_slug } = body;

        if (!article_id || helpful === undefined) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Upsert feedback (update if exists, insert if not)
        const { data: feedback, error } = await userClient
          .from('docs_feedback')
          .upsert(
            {
              article_id,
              user_id: user.id,
              helpful,
              comment: comment || null,
              section_slug: section_slug || null,
            },
            {
              onConflict: 'article_id,user_id,section_slug',
            }
          )
          .select()
          .single();

        if (error) throw error;

        return new Response(JSON.stringify({ data: feedback }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Propose AI update
      if (postAction === 'propose_update') {
        const { article_id, proposed_content, reason } = body;

        if (!article_id || !proposed_content || !reason) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data: proposal, error } = await userClient
          .from('docs_ai_proposals')
          .insert({
            article_id,
            proposed_content,
            reason,
            status: 'pending',
          })
          .select()
          .single();

        if (error) throw error;

        // TODO: Send Slack notification for approval (implement in DOC-014)

        return new Response(JSON.stringify({ data: proposal }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
