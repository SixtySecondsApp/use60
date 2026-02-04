/// <reference path="../deno.d.ts" />

/**
 * Autonomous Copilot Edge Function
 *
 * Enables Claude to autonomously decide which skills to use via native tool use.
 * Skills are exposed as tools that Claude can discover and invoke based on user intent.
 *
 * POST /copilot-autonomous
 * {
 *   message: string,
 *   organizationId?: string,
 *   context?: Record<string, unknown>
 * }
 *
 * Response (streaming):
 * - event: message - Text response chunks
 * - event: tool_start - Tool execution started
 * - event: tool_result - Tool execution completed
 * - event: done - Execution complete
 * - event: error - Error occurred
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1';
import { corsHeaders } from '../_shared/cors.ts';
import {
  rateLimitMiddleware,
  RATE_LIMIT_CONFIGS,
} from '../_shared/rateLimiter.ts';
import { logAICostEvent, extractAnthropicUsage } from '../_shared/costTracking.ts';

// =============================================================================
// Configuration
// =============================================================================

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MODEL = 'claude-sonnet-4-20250514';
const MAX_ITERATIONS = 10;
const MAX_TOKENS = 4096;

// =============================================================================
// Types
// =============================================================================

interface RequestBody {
  message: string;
  organizationId?: string;
  context?: Record<string, unknown>;
  stream?: boolean;
}

interface SkillToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  _skillId: string;
  _skillKey: string;
  _category: string;
}

interface SkillRow {
  id: string;
  skill_key: string;
  category: string;
  frontmatter: {
    name?: string;
    description?: string;
    triggers?: Array<string | { pattern: string }>;
    inputs?: Array<{
      name: string;
      type?: string;
      description?: string;
      required?: boolean;
    }>;
    outputs?: Array<{
      name: string;
      type?: string;
      description?: string;
    }>;
    required_context?: string[];
  };
  content_template: string;
}

// =============================================================================
// Skill Loading
// =============================================================================

async function loadSkillsAsTools(
  supabase: ReturnType<typeof createClient>
): Promise<{ tools: SkillToolDefinition[]; contentCache: Map<string, string> }> {
  const { data: skills, error } = await supabase
    .from('platform_skills')
    .select('id, skill_key, category, frontmatter, content_template')
    .eq('is_active', true)
    .neq('category', 'hitl');

  if (error) {
    console.error('[loadSkillsAsTools] Error:', error);
    throw new Error(`Failed to load skills: ${error.message}`);
  }

  const tools: SkillToolDefinition[] = [];
  const contentCache = new Map<string, string>();

  for (const skill of (skills || []) as SkillRow[]) {
    const fm = skill.frontmatter || {};

    // Build input schema
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    if (fm.inputs && Array.isArray(fm.inputs)) {
      for (const input of fm.inputs) {
        properties[input.name] = {
          type: input.type || 'string',
          description: input.description || `Input: ${input.name}`,
        };
        if (input.required) {
          required.push(input.name);
        }
      }
    }

    if (fm.required_context && Array.isArray(fm.required_context)) {
      for (const ctx of fm.required_context) {
        if (!properties[ctx]) {
          properties[ctx] = {
            type: 'string',
            description: `Context: ${ctx}`,
          };
        }
      }
    }

    if (Object.keys(properties).length === 0) {
      properties['query'] = {
        type: 'string',
        description: 'The query or request for this skill',
      };
    }

    // Build description
    let description = fm.description || `Execute the ${fm.name || skill.skill_key} skill`;

    if (fm.triggers && fm.triggers.length > 0) {
      const triggerExamples = fm.triggers
        .slice(0, 3)
        .map((t) => (typeof t === 'string' ? t : t.pattern))
        .join(', ');
      description += ` Use when user mentions: ${triggerExamples}.`;
    }

    if (fm.outputs && fm.outputs.length > 0) {
      const outputNames = fm.outputs.map((o) => o.name).join(', ');
      description += ` Returns: ${outputNames}.`;
    }

    tools.push({
      name: skill.skill_key.replace(/[^a-zA-Z0-9_-]/g, '_'),
      description: description.slice(0, 1024),
      input_schema: {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      },
      _skillId: skill.id,
      _skillKey: skill.skill_key,
      _category: skill.category,
    });

    contentCache.set(skill.skill_key, skill.content_template);
  }

  return { tools, contentCache };
}

// =============================================================================
// Tool Execution
// =============================================================================

async function executeTool(
  anthropic: Anthropic,
  toolName: string,
  input: Record<string, unknown>,
  tools: SkillToolDefinition[],
  contentCache: Map<string, string>,
  context: Record<string, unknown>
): Promise<unknown> {
  const tool = tools.find((t) => t.name === toolName);
  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  const skillContent = contentCache.get(tool._skillKey);
  if (!skillContent) {
    throw new Error(`Skill content not found: ${tool._skillKey}`);
  }

  const fullContext = { ...context, ...input };

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: `You are executing a skill. Follow the instructions precisely.

${skillContent}

Respond with a JSON object containing the result. If the skill defines outputs, include those fields.`,
    messages: [
      {
        role: 'user',
        content: `Execute this skill with the following context:\n\n${JSON.stringify(fullContext, null, 2)}`,
      },
    ],
  });

  const textContent = response.content.find((c) => c.type === 'text');
  const responseText = textContent?.type === 'text' ? textContent.text : '';

  try {
    const jsonMatch =
      responseText.match(/```json\n?([\s\S]*?)\n?```/) ||
      responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      return JSON.parse(jsonStr);
    }
  } catch {
    // If not JSON, return as text
  }

  return { result: responseText };
}

// =============================================================================
// Memory Context Injection
// =============================================================================

const MEMORY_SYSTEM_ADDITION = `
## Memory & Continuity

You have access to memories from previous conversations. When relevant:
- Remind the user of commitments they made ("Last week you mentioned you'd follow up with Sarah...")
- Apply their stated preferences ("I'll format this report the way you prefer...")
- Reference relationship context ("Given what you told me about John preferring email...")
- Connect current context to past discussions ("This relates to the Acme deal we discussed...")

Be natural about memory recall - don't be creepy, but be helpfully proactive.
`;

async function buildContextWithMemories(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  userMessage: string
): Promise<string> {
  try {
    // Extract keywords from the user message for matching
    const words = userMessage.toLowerCase().split(/\W+/)
      .filter((w: string) => w.length > 2);

    if (words.length === 0) return '';

    // Build search query - use the most significant words
    const searchTerms = words.slice(0, 5);

    // Query memories that match any of the keywords
    const { data: memories, error } = await supabase
      .from('copilot_memories')
      .select('id, category, subject, content, confidence, last_accessed_at, access_count')
      .eq('user_id', userId)
      .or('expires_at.is.null,expires_at.gt.now()')
      .order('last_accessed_at', { ascending: false, nullsFirst: false })
      .limit(50);

    if (error || !memories || memories.length === 0) return '';

    // Score memories by relevance to the user message
    const scored = memories
      .map((m: { id: string; category: string; subject: string; content: string; confidence: number; last_accessed_at: string | null; access_count: number }) => {
        let score = 0;
        const subjectLower = m.subject.toLowerCase();
        const contentLower = m.content.toLowerCase();

        for (const term of searchTerms) {
          if (subjectLower.includes(term)) score += 3;
          if (contentLower.includes(term)) score += 2;
        }

        score *= m.confidence;

        // Recency boost
        if (m.last_accessed_at) {
          const daysSince = (Date.now() - new Date(m.last_accessed_at).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSince < 7) score *= 1.2;
          else if (daysSince < 30) score *= 1.1;
        }

        return { ...m, relevance_score: score };
      })
      .filter((m: { relevance_score: number }) => m.relevance_score > 0)
      .sort((a: { relevance_score: number }, b: { relevance_score: number }) => b.relevance_score - a.relevance_score)
      .slice(0, 10);

    if (scored.length === 0) return '';

    // Update access stats for returned memories
    const memoryIds = scored.map((m: { id: string }) => m.id);
    await supabase
      .from('copilot_memories')
      .update({ last_accessed_at: new Date().toISOString() })
      .in('id', memoryIds);

    // Format memories for context injection
    const memoryLines = scored.map(
      (m: { subject: string; category: string; content: string }) => `- **${m.subject}** (${m.category}): ${m.content}`
    ).join('\n');

    return `\n## Relevant Memories\n\nThe following information from previous conversations may be relevant:\n\n${memoryLines}\n`;
  } catch (err) {
    console.error('[buildContextWithMemories] Error:', err);
    return ''; // Non-fatal
  }
}

// =============================================================================
// Compaction Check
// =============================================================================

const COMPACTION_THRESHOLD = 80000;
const TARGET_CONTEXT_SIZE = 20000;
const MIN_RECENT_MESSAGES = 10;

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

async function handleCompactionIfNeeded(
  supabase: ReturnType<typeof createClient>,
  anthropic: Anthropic,
  userId: string,
  model: string
): Promise<void> {
  try {
    // Find user's main session
    const { data: session } = await supabase
      .from('copilot_conversations')
      .select('id, total_tokens_estimate')
      .eq('user_id', userId)
      .eq('is_main_session', true)
      .maybeSingle();

    if (!session || session.total_tokens_estimate < COMPACTION_THRESHOLD) return;

    console.log(`[compaction] Session ${session.id} at ${session.total_tokens_estimate} tokens, starting compaction...`);

    // Load all non-compacted messages
    const { data: messages } = await supabase
      .from('copilot_messages')
      .select('id, conversation_id, role, content, metadata, is_compacted, created_at')
      .eq('conversation_id', session.id)
      .eq('is_compacted', false)
      .order('created_at', { ascending: true });

    if (!messages || messages.length <= MIN_RECENT_MESSAGES) return;

    // Find split point - keep TARGET_CONTEXT_SIZE tokens at the end
    let accumulatedTokens = 0;
    let splitIndex = messages.length;

    for (let i = messages.length - 1; i >= 0; i--) {
      accumulatedTokens += estimateTokens(messages[i].content);
      if (accumulatedTokens > TARGET_CONTEXT_SIZE) {
        splitIndex = i + 1;
        break;
      }
    }

    // Ensure we keep at least MIN_RECENT_MESSAGES
    const maxSplitIndex = messages.length - MIN_RECENT_MESSAGES;
    splitIndex = Math.min(splitIndex, Math.max(0, maxSplitIndex));

    if (splitIndex === 0) return;

    const toSummarize = messages.slice(0, splitIndex);
    const toKeep = messages.slice(splitIndex);

    // Generate summary
    const conversationText = toSummarize
      .map((m: { role: string; content: string }) => `[${m.role}]: ${m.content}`)
      .join('\n\n');

    const summaryResponse = await anthropic.messages.create({
      model,
      max_tokens: 2048,
      system: `You are summarizing a conversation. Create a concise summary capturing: main topics, key decisions, important context for continuity, and action items. Keep under 500 words.`,
      messages: [{ role: 'user', content: `Summarize:\n\n${conversationText}` }],
    });

    const summaryText = summaryResponse.content.find((c) => c.type === 'text');
    const summary = summaryText?.type === 'text' ? summaryText.text : '';

    // Extract memories
    const memExtractionResponse = await anthropic.messages.create({
      model,
      max_tokens: 2048,
      system: `Analyze this conversation and extract important memories as JSON array.
Categories: deal, relationship, preference, commitment, fact.
Each: { "category", "subject", "content", "confidence" (0-1) }
Return [] if no meaningful memories.`,
      messages: [{ role: 'user', content: `Extract memories:\n\n${conversationText}` }],
    });

    const memText = memExtractionResponse.content.find((c) => c.type === 'text');
    const memResponse = memText?.type === 'text' ? memText.text : '';

    // Parse and store memories
    try {
      const jsonMatch = memResponse.match(/```json\n?([\s\S]*?)\n?```/) || memResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const extracted = JSON.parse(jsonStr) as Array<{ category: string; subject: string; content: string; confidence: number }>;

        for (const mem of extracted.filter((m: { confidence: number }) => m.confidence >= 0.5)) {
          await supabase.from('copilot_memories').insert({
            user_id: userId,
            category: mem.category,
            subject: mem.subject,
            content: mem.content,
            confidence: mem.confidence,
            access_count: 0,
          });
        }

        console.log(`[compaction] Extracted ${extracted.length} memories`);
      }
    } catch {
      console.warn('[compaction] Failed to parse memories, continuing...');
    }

    // Store summary
    await supabase.from('copilot_session_summaries').insert({
      conversation_id: session.id,
      user_id: userId,
      summary,
      message_range_start: toSummarize[0]?.id,
      message_range_end: toSummarize[toSummarize.length - 1]?.id,
      messages_summarized: toSummarize.length,
      tokens_before: estimateTokens(conversationText),
      tokens_after: estimateTokens(summary),
    });

    // Mark old messages as compacted
    const compactIds = toSummarize.map((m: { id: string }) => m.id);
    await supabase
      .from('copilot_messages')
      .update({ is_compacted: true })
      .in('id', compactIds);

    // Update token estimate
    const newTokens = toKeep.reduce((sum: number, m: { content: string }) => sum + estimateTokens(m.content), 0);
    await supabase
      .from('copilot_conversations')
      .update({
        total_tokens_estimate: newTokens,
        last_compaction_at: new Date().toISOString(),
      })
      .eq('id', session.id);

    console.log(`[compaction] Complete: ${toSummarize.length} messages summarized, ${newTokens} tokens remaining`);
  } catch (err) {
    console.error('[compaction] Error (non-blocking):', err);
    // Non-fatal - don't interrupt the user's request
  }
}

// =============================================================================
// System Prompt
// =============================================================================

function buildSystemPrompt(
  tools: SkillToolDefinition[],
  organizationId?: string,
  context?: Record<string, unknown>,
  memoryContext?: string
): string {
  const toolCategories = new Map<string, string[]>();
  for (const tool of tools) {
    const category = tool._category;
    if (!toolCategories.has(category)) {
      toolCategories.set(category, []);
    }
    toolCategories.get(category)!.push(tool.name);
  }

  const categoryList = Array.from(toolCategories.entries())
    .map(([cat, toolNames]) => `- **${cat}**: ${toolNames.join(', ')}`)
    .join('\n');

  return `You are an AI assistant for a sales intelligence platform called Sixty.

You have access to various skills (tools) that help users with sales tasks. Your job is to:
1. Understand what the user wants to accomplish
2. Decide which skill(s) to use to help them
3. Execute those skills with appropriate inputs
4. Synthesize the results into a helpful response

## Available Skill Categories

${categoryList}

## Guidelines

- **Sequences First**: If a task involves multiple steps (e.g., "full deal review"), look for a sequence skill (category: agent-sequence) that orchestrates the workflow.
- **Ask if Unclear**: If you need more information to execute a skill properly, ask the user before proceeding.
- **Chain Skills**: You can call multiple skills in sequence if needed to accomplish a complex task.
- **Explain Your Actions**: Briefly tell the user what you're doing when you use a skill.
- **Handle Errors Gracefully**: If a skill fails, explain what happened and suggest alternatives.

## Organization Context

${organizationId ? `Organization ID: ${organizationId}` : 'No organization specified'}
${context && Object.keys(context).length > 0 ? `\nAvailable context: ${Object.keys(context).join(', ')}` : ''}
${memoryContext || ''}
${memoryContext ? MEMORY_SYSTEM_ADDITION : ''}
`;
}

// =============================================================================
// Analytics Logging
// =============================================================================

interface ExecutionAnalytics {
  executionId?: string;
  startTime: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  toolCallIds: string[];
}

async function logExecutionStart(
  supabase: ReturnType<typeof createClient>,
  organizationId: string | undefined,
  userId: string | null,
  message: string
): Promise<string | null> {
  if (!userId) return null;

  try {
    const { data, error } = await supabase
      .from('copilot_executions')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        user_message: message,
        execution_mode: 'autonomous',
        model: MODEL,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('[logExecutionStart] Error:', error);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.error('[logExecutionStart] Exception:', err);
    return null;
  }
}

async function logExecutionComplete(
  supabase: ReturnType<typeof createClient>,
  executionId: string,
  analytics: ExecutionAnalytics,
  success: boolean,
  responseText: string,
  toolsUsed: string[],
  iterations: number,
  errorMessage?: string,
  structuredResponse?: unknown,
  skillKey?: string,
  sequenceKey?: string
): Promise<void> {
  try {
    const duration = Date.now() - analytics.startTime;

    await supabase
      .from('copilot_executions')
      .update({
        success,
        response_text: responseText?.slice(0, 5000), // Limit response text
        error_message: errorMessage,
        tools_used: toolsUsed,
        tool_call_count: analytics.toolCallIds.length,
        iterations,
        completed_at: new Date().toISOString(),
        duration_ms: duration,
        input_tokens: analytics.totalInputTokens,
        output_tokens: analytics.totalOutputTokens,
        total_tokens: analytics.totalInputTokens + analytics.totalOutputTokens,
        ...(structuredResponse ? { structured_response: structuredResponse } : {}),
        ...(skillKey ? { skill_key: skillKey } : {}),
        ...(sequenceKey ? { sequence_key: sequenceKey } : {}),
      })
      .eq('id', executionId);

    // Prune old structured responses to keep only last 5 per skill/sequence
    if (structuredResponse && (skillKey || sequenceKey)) {
      await supabase.rpc('prune_old_structured_responses', {
        p_skill_key: skillKey || null,
        p_sequence_key: sequenceKey || null,
      }).catch((err: unknown) => {
        console.error('[logExecutionComplete] Prune error (non-fatal):', err);
      });
    }
  } catch (err) {
    console.error('[logExecutionComplete] Exception:', err);
  }
}

async function logToolCall(
  supabase: ReturnType<typeof createClient>,
  executionId: string,
  toolName: string,
  tools: SkillToolDefinition[],
  input: Record<string, unknown>,
  status: 'running' | 'completed' | 'error',
  output?: unknown,
  errorMessage?: string,
  startTime?: number
): Promise<string | null> {
  try {
    const tool = tools.find((t) => t.name === toolName);
    const duration = startTime ? Date.now() - startTime : undefined;

    const { data, error } = await supabase
      .from('copilot_tool_calls')
      .insert({
        execution_id: executionId,
        tool_name: toolName,
        skill_id: tool?._skillId,
        skill_key: tool?._skillKey,
        input,
        output: output ? JSON.stringify(output) : null,
        status,
        error_message: errorMessage,
        duration_ms: duration,
        completed_at: status !== 'running' ? new Date().toISOString() : null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[logToolCall] Error:', error);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.error('[logToolCall] Exception:', err);
    return null;
  }
}

async function updateToolCall(
  supabase: ReturnType<typeof createClient>,
  toolCallId: string,
  status: 'completed' | 'error',
  output?: unknown,
  errorMessage?: string,
  startTime?: number
): Promise<void> {
  try {
    const duration = startTime ? Date.now() - startTime : undefined;

    await supabase
      .from('copilot_tool_calls')
      .update({
        status,
        output: output ? JSON.stringify(output) : null,
        error_message: errorMessage,
        duration_ms: duration,
        completed_at: new Date().toISOString(),
      })
      .eq('id', toolCallId);
  } catch (err) {
    console.error('[updateToolCall] Exception:', err);
  }
}

// =============================================================================
// Streaming Response
// =============================================================================

function createSSEStream(): {
  readable: ReadableStream;
  writer: WritableStreamDefaultWriter;
  encoder: TextEncoder;
} {
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

function sendSSE(
  writer: WritableStreamDefaultWriter,
  encoder: TextEncoder,
  event: string,
  data: unknown
): Promise<void> {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return writer.write(encoder.encode(message));
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check API key
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'Anthropic API key not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Parse request
    const body: RequestBody = await req.json();
    const { message, organizationId, context = {}, stream = true } = body;

    if (!message) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let userId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const userClient = createClient(
        SUPABASE_URL,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      );
      const { data: { user } } = await userClient.auth.getUser();
      userId = user?.id || null;
    }

    // Rate limiting
    if (userId) {
      const rateLimitResult = await rateLimitMiddleware(
        req,
        userId,
        RATE_LIMIT_CONFIGS.copilot
      );
      if (rateLimitResult) {
        return rateLimitResult;
      }
    }

    // Initialize Anthropic
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    // Load skills as tools
    const { tools, contentCache } = await loadSkillsAsTools(supabase);

    if (tools.length === 0) {
      return new Response(JSON.stringify({ error: 'No skills available' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build memory context for the user (if authenticated)
    let memoryContext = '';
    if (userId) {
      memoryContext = await buildContextWithMemories(supabase, userId, message);

      // Trigger compaction check in background (non-blocking)
      handleCompactionIfNeeded(supabase, anthropic, userId, MODEL).catch((err) =>
        console.error('[copilot-autonomous] Background compaction error:', err)
      );
    }

    // Build system prompt
    const systemPrompt = buildSystemPrompt(tools, organizationId, context, memoryContext);

    // Convert tools to Claude format
    const claudeTools: Anthropic.Tool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool.InputSchema,
    }));

    // Set up streaming response
    if (stream) {
      const { readable, writer, encoder } = createSSEStream();

      // Run autonomous loop in background with token streaming
      (async () => {
        // Initialize analytics tracking
        const analytics: ExecutionAnalytics = {
          startTime: Date.now(),
          totalInputTokens: 0,
          totalOutputTokens: 0,
          toolCallIds: [],
        };

        // Start execution logging
        const executionId = await logExecutionStart(supabase, organizationId, userId, message);
        if (executionId) {
          analytics.executionId = executionId;
        }

        let finalResponseText = '';

        try {
          const toolsUsed: string[] = [];
          let iterations = 0;
          let claudeMessages: Anthropic.MessageParam[] = [
            { role: 'user', content: message },
          ];

          while (iterations < MAX_ITERATIONS) {
            iterations++;

            // Use streaming API for real-time token delivery
            const stream = anthropic.messages.stream({
              model: MODEL,
              max_tokens: MAX_TOKENS,
              system: systemPrompt,
              tools: claudeTools,
              messages: claudeMessages,
            });

            // Track content blocks as they stream
            const contentBlocks: Anthropic.ContentBlock[] = [];
            let currentTextContent = '';
            let stopReason: string | null = null;

            // Process streaming events
            for await (const event of stream) {
              if (event.type === 'content_block_start') {
                if (event.content_block.type === 'text') {
                  // Initialize text block
                  contentBlocks.push({ type: 'text', text: '' });
                } else if (event.content_block.type === 'tool_use') {
                  // Initialize tool use block
                  contentBlocks.push({
                    type: 'tool_use',
                    id: event.content_block.id,
                    name: event.content_block.name,
                    input: {},
                  });
                }
              } else if (event.type === 'content_block_delta') {
                if (event.delta.type === 'text_delta') {
                  // Stream text tokens immediately
                  const text = event.delta.text;
                  currentTextContent += text;

                  // Update the content block
                  const lastBlock = contentBlocks[contentBlocks.length - 1];
                  if (lastBlock && lastBlock.type === 'text') {
                    lastBlock.text += text;
                  }

                  // Send token to client immediately
                  await sendSSE(writer, encoder, 'token', { text });
                } else if (event.delta.type === 'input_json_delta') {
                  // Tool input is streaming - accumulate it
                  const lastBlock = contentBlocks[contentBlocks.length - 1];
                  if (lastBlock && lastBlock.type === 'tool_use') {
                    // Input is streamed as partial JSON string
                    // We'll parse the full input from the final message
                  }
                }
              } else if (event.type === 'message_delta') {
                stopReason = event.delta.stop_reason;

                // Track usage
                if (event.usage) {
                  analytics.totalOutputTokens += event.usage.output_tokens;
                }
              } else if (event.type === 'message_start') {
                // Track input tokens from message start
                if (event.message.usage) {
                  analytics.totalInputTokens += event.message.usage.input_tokens;
                }
              }
            }

            // Get the final message with complete content
            const finalMessage = await stream.finalMessage();

            // Log cost
            if (userId && finalMessage.usage) {
              await logAICostEvent(supabase, {
                user_id: userId,
                model: MODEL,
                input_tokens: finalMessage.usage.input_tokens,
                output_tokens: finalMessage.usage.output_tokens,
                request_type: 'copilot_autonomous',
              });
            }

            if (finalMessage.stop_reason === 'end_turn') {
              // Extract final text
              const textContent = finalMessage.content.find((c) => c.type === 'text');
              finalResponseText = textContent?.type === 'text' ? textContent.text : '';

              // Send completion marker (tokens already streamed)
              await sendSSE(writer, encoder, 'message_complete', { content: finalResponseText });
              await sendSSE(writer, encoder, 'done', {
                toolsUsed: [...new Set(toolsUsed)],
                iterations,
              });

              // Log successful completion
              if (executionId) {
                // Extract primary skill_key from tools used
                const primarySkillKey = toolsUsed.length > 0
                  ? tools.find((t) => t.name === toolsUsed[0])?._skillKey || null
                  : null;

                await logExecutionComplete(
                  supabase,
                  executionId,
                  analytics,
                  true,
                  finalResponseText,
                  [...new Set(toolsUsed)],
                  iterations,
                  undefined, // errorMessage
                  undefined, // structuredResponse (copilot-autonomous doesn't produce these)
                  primarySkillKey || undefined,
                  undefined // sequenceKey
                );
              }
              break;
            }

            if (finalMessage.stop_reason === 'tool_use') {
              const toolUseBlocks = finalMessage.content.filter(
                (c) => c.type === 'tool_use'
              ) as Anthropic.ToolUseBlock[];

              // Text was already streamed, send completion marker if there was text
              const textBlock = finalMessage.content.find((c) => c.type === 'text');
              if (textBlock?.type === 'text' && textBlock.text) {
                await sendSSE(writer, encoder, 'message_complete', { content: textBlock.text });
              }

              const toolResults: Anthropic.ToolResultBlockParam[] = [];

              for (const toolUse of toolUseBlocks) {
                toolsUsed.push(toolUse.name);
                const toolStartTime = Date.now();

                await sendSSE(writer, encoder, 'tool_start', {
                  id: toolUse.id,
                  name: toolUse.name,
                  input: toolUse.input,
                });

                // Log tool call start
                let toolCallId: string | null = null;
                if (executionId) {
                  toolCallId = await logToolCall(
                    supabase,
                    executionId,
                    toolUse.name,
                    tools,
                    toolUse.input as Record<string, unknown>,
                    'running'
                  );
                  if (toolCallId) {
                    analytics.toolCallIds.push(toolCallId);
                  }
                }

                try {
                  const result = await executeTool(
                    anthropic,
                    toolUse.name,
                    toolUse.input as Record<string, unknown>,
                    tools,
                    contentCache,
                    context
                  );

                  await sendSSE(writer, encoder, 'tool_result', {
                    id: toolUse.id,
                    name: toolUse.name,
                    result,
                    success: true,
                  });

                  // Log tool call success
                  if (toolCallId) {
                    await updateToolCall(supabase, toolCallId, 'completed', result, undefined, toolStartTime);
                  }

                  toolResults.push({
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: JSON.stringify(result),
                  });
                } catch (toolError) {
                  const errorMsg = toolError instanceof Error ? toolError.message : String(toolError);

                  await sendSSE(writer, encoder, 'tool_result', {
                    id: toolUse.id,
                    name: toolUse.name,
                    error: errorMsg,
                    success: false,
                  });

                  // Log tool call error
                  if (toolCallId) {
                    await updateToolCall(supabase, toolCallId, 'error', undefined, errorMsg, toolStartTime);
                  }

                  toolResults.push({
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: JSON.stringify({ error: errorMsg }),
                    is_error: true,
                  });
                }
              }

              // Add to message history
              claudeMessages.push({
                role: 'assistant',
                content: finalMessage.content,
              });

              claudeMessages.push({
                role: 'user',
                content: toolResults,
              });

              continue;
            }

            // Unexpected stop reason
            console.warn(`[copilot-autonomous] Unexpected stop reason: ${finalMessage.stop_reason}`);
            break;
          }

          if (iterations >= MAX_ITERATIONS) {
            await sendSSE(writer, encoder, 'error', {
              message: 'Maximum iterations reached',
            });

            // Log max iterations error
            if (executionId) {
              await logExecutionComplete(
                supabase,
                executionId,
                analytics,
                false,
                finalResponseText,
                [],
                iterations,
                'Maximum iterations reached'
              );
            }
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error('[copilot-autonomous] Error:', error);
          await sendSSE(writer, encoder, 'error', { message: errorMsg });

          // Log error
          if (executionId) {
            await logExecutionComplete(
              supabase,
              executionId,
              analytics,
              false,
              finalResponseText,
              [],
              0,
              errorMsg
            );
          }
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
    } else {
      // Non-streaming response (simpler, for testing)
      const toolsUsed: string[] = [];
      let iterations = 0;
      let claudeMessages: Anthropic.MessageParam[] = [
        { role: 'user', content: message },
      ];
      let finalResponse = '';

      while (iterations < MAX_ITERATIONS) {
        iterations++;

        const response = await anthropic.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          tools: claudeTools,
          messages: claudeMessages,
        });

        if (response.stop_reason === 'end_turn') {
          const textContent = response.content.find((c) => c.type === 'text');
          finalResponse = textContent?.type === 'text' ? textContent.text : '';
          break;
        }

        if (response.stop_reason === 'tool_use') {
          const toolUseBlocks = response.content.filter(
            (c) => c.type === 'tool_use'
          ) as Anthropic.ToolUseBlock[];

          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const toolUse of toolUseBlocks) {
            toolsUsed.push(toolUse.name);

            try {
              const result = await executeTool(
                anthropic,
                toolUse.name,
                toolUse.input as Record<string, unknown>,
                tools,
                contentCache,
                context
              );

              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify(result),
              });
            } catch (toolError) {
              const errorMsg = toolError instanceof Error ? toolError.message : String(toolError);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify({ error: errorMsg }),
                is_error: true,
              });
            }
          }

          claudeMessages.push({ role: 'assistant', content: response.content });
          claudeMessages.push({ role: 'user', content: toolResults });
          continue;
        }

        break;
      }

      return new Response(
        JSON.stringify({
          success: true,
          response: finalResponse,
          toolsUsed: [...new Set(toolsUsed)],
          iterations,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[copilot-autonomous] Error:', error);

    return new Response(
      JSON.stringify({ error: errorMsg }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
