/// <reference path="../deno.d.ts" />

/**
 * Docs Agent Edge Function
 *
 * Standalone documentation AI agent using Claude Sonnet 4.6 with native tool_use.
 * Powers the Support Centre chat with semantic doc search.
 *
 * Tools:
 *   1. search_docs  - Semantic + full-text hybrid search via match_docs_by_embedding RPC
 *   2. get_article  - Fetch full article by slug from docs_articles table
 *
 * POST /docs-agent
 * {
 *   message: string,
 *   conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
 * }
 *
 * Response (streaming SSE):
 * - event: token       - Text chunk (10 chars at a time)
 * - event: tool_start  - Tool execution started
 * - event: tool_result - Tool execution completed
 * - event: done        - Execution complete
 * - event: error       - Error occurred
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { checkCreditBalance, logAICostEvent } from '../_shared/costTracking.ts';

// =============================================================================
// Configuration
// =============================================================================

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MODEL = 'claude-sonnet-4-6';
const MAX_ITERATIONS = 8;
const MAX_TOKENS = 2048;

// =============================================================================
// Types
// =============================================================================

interface RequestBody {
  message: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

interface DocSearchResult {
  slug: string;
  title: string;
  category: string;
  content_snippet: string;
  similarity: number;
}

interface DocArticle {
  id: string;
  slug: string;
  title: string;
  category: string;
  content: string;
  metadata: Record<string, unknown> | null;
  updated_at: string;
}

// =============================================================================
// System Prompt
// =============================================================================

const SYSTEM_PROMPT = `You are 60's Documentation Assistant — an expert on the Sixty sales intelligence platform.

Your job is to help users find answers to their questions about 60's features, integrations, and workflows.

## How to work:
1. Use the search_docs tool to find relevant documentation articles
2. If you need more detail, use get_article to read the full article
3. Synthesize a clear, helpful answer from the documentation
4. Always cite your sources by mentioning the article title

## Rules:
- ALWAYS search the docs before answering — never guess or make up features
- Provide direct, actionable answers (not link dumps)
- Keep answers concise (2-5 sentences for simple questions, more for complex ones)
- If you can't find an answer, say so honestly and suggest they open a support ticket
- Include the article title(s) as sources at the end of your response
- Format your response as plain text (the frontend will render it)

## Response format:
After answering, include source articles in this exact JSON block at the end:

<sources>
[{"slug": "article-slug", "title": "Article Title", "category": "Category"}]
</sources>

Also suggest 2-3 follow-up questions the user might ask:

<follow_ups>
["How do I configure X?", "What about Y?"]
</follow_ups>`;

// =============================================================================
// Tool Definitions
// =============================================================================

const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'search_docs',
    description:
      'Search the documentation knowledge base using semantic similarity. Returns the most relevant articles for a given query.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
        category: {
          type: 'string',
          description:
            'Optional category filter (e.g., Getting Started, Integrations, Pipeline)',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default 5)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_article',
    description:
      'Retrieve a full documentation article by its slug. Use when you need the complete content of a specific article.',
    input_schema: {
      type: 'object' as const,
      properties: {
        slug: {
          type: 'string',
          description: 'The article slug (e.g., "google-calendar-setup")',
        },
      },
      required: ['slug'],
    },
  },
];

// =============================================================================
// Tool Handlers
// =============================================================================

async function handleSearchDocs(
  input: { query: string; category?: string; limit?: number },
  serviceClient: ReturnType<typeof createClient>
): Promise<DocSearchResult[]> {
  const { query, category, limit } = input;

  // Generate embedding for the query using OpenAI directly
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const embResponse = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: query,
      dimensions: 1536,
    }),
  });

  if (!embResponse.ok) {
    const errText = await embResponse.text();
    throw new Error(`OpenAI embedding request failed: ${errText}`);
  }

  const embData = await embResponse.json();
  const queryEmbedding = embData.data[0].embedding as number[];

  // Call the RPC for vector similarity search
  const { data, error } = await serviceClient.rpc('match_docs_by_embedding', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_threshold: 0.4,
    match_count: limit || 5,
  });

  if (error) {
    throw new Error(`match_docs_by_embedding RPC failed: ${error.message}`);
  }

  // Map results to a clean shape; filter by category if provided
  const results = (data || []) as Array<{
    slug: string;
    title: string;
    category: string;
    content: string;
    similarity: number;
  }>;

  const filtered = category
    ? results.filter(
        (r) => r.category?.toLowerCase() === category.toLowerCase()
      )
    : results;

  return filtered.map((r) => ({
    slug: r.slug,
    title: r.title,
    category: r.category,
    content_snippet: (r.content || '').slice(0, 500),
    similarity: r.similarity,
  }));
}

async function handleGetArticle(
  input: { slug: string },
  serviceClient: ReturnType<typeof createClient>
): Promise<DocArticle | null> {
  const { slug } = input;

  const { data, error } = await serviceClient
    .from('docs_articles')
    .select('id, slug, title, category, content, metadata, updated_at')
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch article "${slug}": ${error.message}`);
  }

  return data as DocArticle | null;
}

async function executeDocsTool(
  name: string,
  input: Record<string, unknown>,
  serviceClient: ReturnType<typeof createClient>
): Promise<unknown> {
  switch (name) {
    case 'search_docs':
      return await handleSearchDocs(
        input as { query: string; category?: string; limit?: number },
        serviceClient
      );

    case 'get_article':
      return await handleGetArticle(
        input as { slug: string },
        serviceClient
      );

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// =============================================================================
// SSE Streaming Helpers
// =============================================================================

function createSSEStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController;

  const readable = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  const writable = new WritableStream({
    write(chunk) {
      controller.enqueue(chunk);
    },
    close() {
      controller.close();
    },
  });

  return { readable, writer: writable.getWriter(), encoder };
}

async function sendSSE(
  writer: WritableStreamDefaultWriter,
  encoder: TextEncoder,
  event: string,
  data: unknown
): Promise<void> {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  await writer.write(encoder.encode(message));
}

// =============================================================================
// Agentic Loop
// =============================================================================

async function runDocsAgent(
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  writer: WritableStreamDefaultWriter,
  encoder: TextEncoder,
  serviceClient: ReturnType<typeof createClient>
): Promise<{ iterations: number; inputTokens: number; outputTokens: number }> {
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  // Build messages array from conversation history + new message
  const messages: Anthropic.MessageParam[] = [
    ...(conversationHistory || []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  let iteration = 0;
  let lastStopReason = '';
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Agentic loop — max 8 iterations for docs Q&A
  while (iteration < MAX_ITERATIONS) {
    iteration++;

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    lastStopReason = response.stop_reason || '';
    totalInputTokens += response.usage?.input_tokens || 0;
    totalOutputTokens += response.usage?.output_tokens || 0;

    // Stream text blocks token by token (in chunks for speed)
    for (const block of response.content) {
      if (block.type === 'text') {
        for (let i = 0; i < block.text.length; i += 10) {
          const chunk = block.text.slice(i, i + 10);
          await sendSSE(writer, encoder, 'token', { text: chunk });
        }
      }
    }

    // If Claude is done (no more tool calls), break the loop
    if (response.stop_reason !== 'tool_use') {
      break;
    }

    // Process tool calls
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolCall of toolUseBlocks) {
      await sendSSE(writer, encoder, 'tool_start', {
        name: toolCall.name,
        input: toolCall.input,
      });

      let result: unknown;
      try {
        result = await executeDocsTool(
          toolCall.name,
          toolCall.input as Record<string, unknown>,
          serviceClient
        );
        await sendSSE(writer, encoder, 'tool_result', {
          name: toolCall.name,
          success: true,
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        result = { error: errorMessage };
        await sendSSE(writer, encoder, 'tool_result', {
          name: toolCall.name,
          success: false,
          error: errorMessage,
        });
      }

      toolResults.push({
        type: 'tool_result' as const,
        tool_use_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }

    // Add assistant response and tool results to messages for next iteration
    messages.push({
      role: 'assistant' as const,
      content: response.content,
    });
    messages.push({
      role: 'user' as const,
      content: toolResults,
    });
  }

  // If we exhausted iterations while Claude still wanted to call tools, force a final text response
  if (iteration >= MAX_ITERATIONS && lastStopReason === 'tool_use') {
    const finalResponse = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        ...messages,
        {
          role: 'user' as const,
          content:
            'Please provide your answer now based on the documentation you have already retrieved. Do not make any more tool calls.',
        },
      ],
    });

    totalInputTokens += finalResponse.usage?.input_tokens || 0;
    totalOutputTokens += finalResponse.usage?.output_tokens || 0;

    for (const block of finalResponse.content) {
      if (block.type === 'text') {
        for (let i = 0; i < block.text.length; i += 10) {
          const chunk = block.text.slice(i, i + 10);
          await sendSSE(writer, encoder, 'token', { text: chunk });
        }
      }
    }
  }

  return { iterations: iteration, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req: Request) => {
  // CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Auth check — require a valid Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate required environment variables
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'OPENAI_API_KEY is not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse request body
    const body = await req.json() as RequestBody;
    const { message, conversationHistory } = body;

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'message is required and must be a non-empty string' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Create service-role Supabase client for vector search (bypasses RLS for the RPC)
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Validate JWT and get userId/orgId for credit tracking
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: authedUser } } = await userClient.auth.getUser();
    const authedUserId = authedUser?.id ?? null;

    let authedOrgId: string | null = null;
    if (authedUserId) {
      const { data: membership } = await serviceClient
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', authedUserId)
        .limit(1)
        .maybeSingle();
      authedOrgId = membership?.org_id ?? null;
    }

    // Credit balance check (pre-flight)
    if (authedOrgId) {
      const balanceCheck = await checkCreditBalance(serviceClient, authedOrgId);
      if (!balanceCheck.allowed) {
        return new Response(
          JSON.stringify({ error: 'Insufficient credits. Please top up to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Create SSE stream
    const { readable, writer, encoder } = createSSEStream();

    // Start async processing — fire and forget so we can return the stream immediately
    (async () => {
      try {
        const { iterations, inputTokens, outputTokens } = await runDocsAgent(
          message.trim(),
          conversationHistory || [],
          writer,
          encoder,
          serviceClient
        );

        // Log AI cost event after agent completes
        if (authedUserId && authedOrgId) {
          await logAICostEvent(
            serviceClient, authedUserId, authedOrgId, 'anthropic', MODEL,
            inputTokens, outputTokens, 'copilot_chat'
          );
        }

        await sendSSE(writer, encoder, 'done', { iterations });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        console.error('[docs-agent] Unhandled error in agentic loop:', errorMessage);
        await sendSSE(writer, encoder, 'error', { message: errorMessage });
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Internal error';
    console.error('[docs-agent] Request handler error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
