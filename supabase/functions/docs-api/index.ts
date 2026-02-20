import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

async function generateArticleEmbedding(articleId: string, title: string, category: string, content: string): Promise<void> {
  try {
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) return; // Skip if no key configured

    const embeddingText = `${title}: ${category} — ${content.slice(0, 8000)}`;

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: embeddingText,
        dimensions: 1536,
      }),
    });

    if (!response.ok) {
      console.error('[docs-api] Embedding generation failed:', response.status);
      return;
    }

    const data = await response.json();
    const embedding = data.data[0].embedding;

    // Use service role to update embedding (bypasses RLS)
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    await serviceClient
      .from('docs_articles')
      .update({ content_embedding: JSON.stringify(embedding) })
      .eq('id', articleId);

    console.log(`[docs-api] Embedding generated for article ${articleId}`);
  } catch (err) {
    console.error('[docs-api] Embedding error (non-fatal):', err);
  }
}

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
        const { data: membership } = await userClient
          .from('organization_memberships')
          .select('role')
          .eq('user_id', user.id)
          .in('role', ['admin', 'owner'])
          .maybeSingle();

        if (!membership) {
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

        // Auto-generate embedding (fire-and-forget)
        generateArticleEmbedding(article.id, slug, category, content).catch(() => {});

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

        // Auto-generate embedding if content changed (fire-and-forget)
        if (content !== undefined) {
          generateArticleEmbedding(article.id, article.title, article.category, article.content).catch(() => {});
        }

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

        // DOC-014: Send Slack notification for approval
        try {
          // Get article title for context
          const { data: article } = await userClient
            .from('docs_articles')
            .select('title, slug')
            .eq('id', article_id)
            .single();

          // Send to Slack (requires SLACK_WEBHOOK_URL env var)
          const slackWebhook = Deno.env.get('SLACK_DOCS_APPROVAL_WEBHOOK');
          if (slackWebhook && article) {
            await fetch(slackWebhook, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                blocks: [
                  {
                    type: 'header',
                    text: {
                      type: 'plain_text',
                      text: '📝 Doc Update Proposal',
                    },
                  },
                  {
                    type: 'section',
                    fields: [
                      {
                        type: 'mrkdwn',
                        text: `*Article:*\n${article.title}`,
                      },
                      {
                        type: 'mrkdwn',
                        text: `*Reason:*\n${reason}`,
                      },
                    ],
                  },
                  {
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text: `*Proposed Changes:*\n\`\`\`\n${proposed_content.substring(0, 500)}...\n\`\`\``,
                    },
                  },
                  {
                    type: 'actions',
                    elements: [
                      {
                        type: 'button',
                        text: {
                          type: 'plain_text',
                          text: 'Approve',
                        },
                        style: 'primary',
                        value: proposal.id,
                        action_id: 'approve_doc_proposal',
                      },
                      {
                        type: 'button',
                        text: {
                          type: 'plain_text',
                          text: 'Reject',
                        },
                        style: 'danger',
                        value: proposal.id,
                        action_id: 'reject_doc_proposal',
                      },
                      {
                        type: 'button',
                        text: {
                          type: 'plain_text',
                          text: 'View in Admin',
                        },
                        url: `${Deno.env.get('APP_URL') || 'https://app.use60.com'}/platform/docs-admin`,
                      },
                    ],
                  },
                ],
              }),
            });
          }
        } catch (slackError) {
          console.error('Failed to send Slack notification:', slackError);
          // Don't fail the entire request if Slack fails
        }

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
