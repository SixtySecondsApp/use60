/// <reference path="../deno.d.ts" />

/**
 * Autonomous Copilot Edge Function
 *
 * Enables Claude to autonomously decide which skills to use via native tool use.
 * Uses the same 4-tool architecture as api-copilot:
 *   1. list_skills   - Discover available skills/sequences
 *   2. get_skill      - Retrieve a compiled skill document
 *   3. execute_action - Execute CRM actions with real data (deals, contacts, meetings, etc.)
 *   4. resolve_entity - Resolve ambiguous person references (first-name-only)
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
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import {
  rateLimitMiddleware,
  RATE_LIMIT_CONFIGS,
} from '../_shared/rateLimiter.ts';
import { logAICostEvent, checkAgentBudget, checkCreditBalance } from '../_shared/costTracking.ts';
import { executeAction } from '../_shared/copilot_adapters/executeAction.ts';
import type { ExecuteActionName } from '../_shared/copilot_adapters/types.ts';
import { resolveEntity } from '../_shared/resolveEntityAdapter.ts';
import {
  handleListSkills,
  handleGetSkill,
  resolveOrgId,
} from '../_shared/skillsToolHandlers.ts';
import {
  detectAndStructureResponse,
  type StructuredResponse,
  type ToolExecutionDetail,
} from '../_shared/structuredResponseDetector.ts';
// Multi-agent orchestration imports
import { loadAgentTeamConfig, type AgentTeamConfig, type IntentClassification } from '../_shared/agentConfig.ts';
import { classifyIntent } from '../_shared/agentClassifier.ts';
import { runSpecialist, type StreamWriter } from '../_shared/agentSpecialist.ts';
import { getSpecialistConfig, getAgentDisplayInfo } from '../_shared/agentDefinitions.ts';

// =============================================================================
// Configuration
// =============================================================================

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MODEL = 'claude-haiku-4-5';
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

// =============================================================================
// 4-Tool Architecture (matches api-copilot)
// =============================================================================

const FOUR_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  // 1. resolve_entity - MUST BE FIRST for first-name-only references
  {
    name: 'resolve_entity',
    description: `Resolve a person mentioned by first name (or partial name) to a specific contact by searching CRM contacts, recent meetings, and calendar events in parallel. Use this FIRST when the user mentions someone by name without full context.

WHEN TO USE:
- User asks about "Stan" or "John" without providing email or ID
- User references someone from a recent meeting
- Any ambiguous person reference that needs resolution

RETURNS ranked candidates by recency. If ONE clear match, proceed. If MULTIPLE, ask user to confirm.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'First name or partial name to search for (e.g., "Stan", "John Smith")',
        },
        context_hint: {
          type: 'string',
          description: 'Optional context from user message to help disambiguate (e.g., "meeting yesterday", "deal")',
        },
      },
      required: ['name'],
    },
  },
  // 2. list_skills
  {
    name: 'list_skills',
    description: 'List available compiled skills for the organization (optionally filtered by category).',
    input_schema: {
      type: 'object' as const,
      properties: {
        kind: {
          type: 'string',
          enum: ['skill', 'sequence', 'all'],
          description: 'Filter to skills (single-step) vs sequences (category=agent-sequence). Default: all.',
        },
        category: {
          type: 'string',
          enum: ['sales-ai', 'writing', 'enrichment', 'workflows', 'data-access', 'output-format', 'agent-sequence'],
          description: 'Optional skill category filter.',
        },
        enabled_only: {
          type: 'boolean',
          description: 'Only return enabled skills (default true).',
        },
      },
    },
  },
  // 3. get_skill
  {
    name: 'get_skill',
    description: 'Retrieve a compiled skill or sequence document by skill_key for the organization.',
    input_schema: {
      type: 'object' as const,
      properties: {
        skill_key: { type: 'string', description: 'Skill identifier (e.g., lead-qualification, get-contact-context)' },
      },
      required: ['skill_key'],
    },
  },
  // 4. execute_action - Core CRM data access
  {
    name: 'execute_action',
    description: `Execute an action to fetch real CRM data, meetings, emails, pipeline intelligence, or perform operations.

If you only have a FIRST NAME (e.g., "Stan", "John"), use the resolve_entity tool instead!

ACTION PARAMETERS:

## Contact & Lead Lookup
- get_contact: { email?, full_name?, id? } - Search contacts by email, full name, or id
- get_lead: { email?, full_name?, contact_id?, date_from?, date_to?, date_field? } - Get lead/prospect data with enrichment

## Deal & Pipeline
- get_deal: { name?, id?, close_date_from?, close_date_to?, status?, stage_id?, include_health?, limit? } - Search deals
- get_pipeline_summary: {} - Get aggregated pipeline metrics
- get_pipeline_deals: { filter?, days?, period?, include_health?, limit? } - Get filtered deal list (filter: "closing_soon"|"at_risk"|"stale"|"needs_attention")
- get_pipeline_forecast: { period? } - Get quarterly forecast

## Contacts & Relationships
- get_contacts_needing_attention: { days_since_contact?, filter?, limit? } - Get contacts without recent follow-up
- get_company_status: { company_id?, company_name?, domain? } - Holistic company view

## Meetings & Calendar
- get_meetings: { contactEmail?, contactId?, limit? } - Get meetings with a contact
- get_meeting_count: { period?, timezone?, week_starts_on? } - Count meetings for a period
- get_next_meeting: { include_context?, timezone? } - Get next upcoming meeting with CRM context
- get_meetings_for_period: { period?, timezone?, week_starts_on?, include_context?, limit? } - Get meeting list for a period
- get_time_breakdown: { period?, timezone?, week_starts_on? } - Time analysis
- get_booking_stats: { period?, filter_by?, source?, org_wide? } - Meeting booking statistics

## Tasks & Activities
- create_task: { title, description?, due_date?, contact_id?, deal_id?, priority?, assignee_id? } - Create a task (requires params.confirm=true)
- list_tasks: { status?, priority?, contact_id?, deal_id?, company_id?, due_before?, due_after?, limit? } - List tasks
- create_activity: { type, client_name, details?, amount?, date?, status?, priority? } - Create an activity (requires params.confirm=true)

## Email & Notifications
- search_emails: { contact_email?, query?, limit? } - Search emails
- draft_email: { to, subject?, context?, tone? } - Draft an email
- send_notification: { channel: 'slack', message, blocks? } - Send a Slack notification

## CRM Updates
- update_crm: { entity, id, updates, confirm: true } - Update CRM record

## Enrichment
- enrich_contact: { email, name?, title?, company_name? } - Enrich contact data
- enrich_company: { name, domain?, website? } - Enrich company data

## Skill Execution
- run_skill: { skill_key, skill_context? } - Execute an AI skill
- run_sequence: { sequence_key, sequence_context?, is_simulation? } - Execute a multi-step sequence

Write actions require params.confirm=true.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: [
            'get_contact',
            'get_lead',
            'get_deal',
            'get_pipeline_summary',
            'get_pipeline_deals',
            'get_pipeline_forecast',
            'get_contacts_needing_attention',
            'get_company_status',
            'get_meetings',
            'get_booking_stats',
            'get_meeting_count',
            'get_next_meeting',
            'get_meetings_for_period',
            'get_time_breakdown',
            'search_emails',
            'draft_email',
            'update_crm',
            'send_notification',
            'enrich_contact',
            'enrich_company',
            'invoke_skill',
            'run_skill',
            'run_sequence',
            'create_task',
            'list_tasks',
            'create_activity',
          ],
          description: 'The action to execute',
        },
        params: {
          type: 'object',
          description: 'Parameters for the action',
        },
      },
      required: ['action'],
    },
  },
];

// =============================================================================
// Tool Execution Router
// =============================================================================

/**
 * Route tool calls to the appropriate shared handler.
 * Uses real Supabase queries -- no more LLM hallucination for CRM data.
 */
async function executeToolCall(
  toolName: string,
  input: Record<string, unknown>,
  client: ReturnType<typeof createClient>,
  userId: string,
  orgId: string | null
): Promise<unknown> {
  // Resolve org for skills/execute_action tools
  const resolvedOrgId = await resolveOrgId(client, userId, orgId);

  switch (toolName) {
    case 'resolve_entity': {
      return await resolveEntity(client, userId, resolvedOrgId, {
        name: input.name ? String(input.name) : undefined,
        context_hint: input.context_hint ? String(input.context_hint) : undefined,
      });
    }

    case 'list_skills': {
      return await handleListSkills(client, resolvedOrgId, {
        kind: input.kind ? String(input.kind) : undefined,
        category: input.category ? String(input.category) : undefined,
        enabled_only: input.enabled_only !== false,
      });
    }

    case 'get_skill': {
      const skillKey = input.skill_key ? String(input.skill_key) : '';
      return await handleGetSkill(client, resolvedOrgId, skillKey);
    }

    case 'execute_action': {
      const action = input.action as ExecuteActionName;
      const params = (input.params || {}) as Record<string, unknown>;
      if (!action) {
        return { success: false, data: null, error: 'action is required for execute_action' };
      }
      return await executeAction(client, userId, resolvedOrgId, action, params);
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
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

    // Generate summary — format multi-agent messages with agent attribution
    const conversationText = toSummarize
      .map((m: { role: string; content: string; metadata?: Record<string, unknown> | null }) => {
        const meta = m.metadata as Record<string, unknown> | null;
        if (m.role === 'assistant' && meta?.is_multi_agent && Array.isArray(meta.agent_responses)) {
          // Include agent attribution so summaries/memories capture which specialist said what
          const agentSections = (meta.agent_responses as Array<{ agent: string; displayName: string; responseText: string }>)
            .map((ar) => `  [${ar.displayName}]: ${ar.responseText}`)
            .join('\n');
          return `[assistant (multi-agent: ${(meta.agents_used as string[])?.join(', ') || 'multiple'})]:\n${agentSections}\n[synthesized]: ${m.content}`;
        }
        return `[${m.role}]: ${m.content}`;
      })
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
// Apify Integration Check
// =============================================================================

interface ApifyConnectionInfo {
  connected: boolean;
  hasToken: boolean;
}

async function checkApifyConnection(
  supabase: ReturnType<typeof createClient>,
  orgId: string | null
): Promise<ApifyConnectionInfo> {
  if (!orgId) return { connected: false, hasToken: false };

  try {
    const { data, error } = await supabase
      .from('integration_credentials')
      .select('id, credentials')
      .eq('organization_id', orgId)
      .eq('provider', 'apify')
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) return { connected: false, hasToken: false };

    const hasToken = !!(data.credentials as Record<string, unknown>)?.api_token;
    return { connected: true, hasToken };
  } catch {
    return { connected: false, hasToken: false };
  }
}

// =============================================================================
// System Prompt
// =============================================================================

function buildSystemPrompt(
  organizationId?: string,
  context?: Record<string, unknown>,
  memoryContext?: string,
  apifyConnection?: ApifyConnectionInfo
): string {
  return `You are an AI sales assistant for a platform called Sixty. You help sales professionals manage their pipeline, prepare for meetings, track contacts, and execute sales workflows.

## Your 4 Tools

1. **resolve_entity** - CRITICAL: Use FIRST when user mentions a person by first name only (e.g., "Stan", "John"). Searches CRM, meetings, and calendar in parallel to find the right person. DO NOT ask for clarification first.
2. **list_skills** - See available skills and sequences by category
3. **get_skill** - Retrieve a skill/sequence document for guidance (use exact skill_key from list)
4. **execute_action** - Perform actions (query CRM, fetch meetings, search emails, manage pipeline, etc.)

## How To Work

1. **If user mentions a person by first name only** -> Use resolve_entity FIRST
2. **If user needs data** (deals, contacts, meetings, pipeline) -> Use execute_action with the appropriate action
3. **If task involves a skill or multi-step workflow** -> Use list_skills to discover, get_skill to retrieve, then follow the skill instructions
4. Use execute_action to gather data or perform tasks

## Common Patterns

### Contact/Person Lookup
1. Use execute_action with get_contact to find the contact by name/email
2. Use execute_action with get_lead to get ALL enrichment data
3. Use execute_action with get_meetings to find meetings with that contact

### Pipeline Intelligence
- Use execute_action with get_pipeline_deals { filter: "closing_soon", period: "this_week" }
- Use execute_action with get_pipeline_deals { filter: "stale", days: 14 }
- Use execute_action with get_pipeline_summary {} for current pipeline snapshot
- Use execute_action with get_pipeline_forecast { period: "this_quarter" }

### Meeting Prep
- Use execute_action with get_next_meeting { include_context: true } for next meeting
- Use execute_action with get_meetings_for_period { period: "today" } for today's schedule

### Follow-up Management
- Use execute_action with get_contacts_needing_attention { days_since_contact: 14 }
- Use execute_action with list_tasks { status: "pending" }

## Organization Context

${organizationId ? `Organization ID: ${organizationId}` : 'No organization specified'}
${context && Object.keys(context).length > 0 ? `\nAvailable context: ${Object.keys(context).join(', ')}` : ''}
${memoryContext || ''}
${memoryContext ? MEMORY_SYSTEM_ADDITION : ''}

## Behavior Guidelines

- Be concise but thorough in your responses
- When presenting CRM data, format it clearly
- Confirm before any CRM updates or notifications (execute_action write actions require params.confirm=true)
- If a tool returns an error, explain what happened and suggest alternatives
- Present data in a helpful, actionable way for sales professionals
${apifyConnection?.connected ? `
## Apify Web Scraping (Connected)

This organization has Apify connected. You can help with web scraping workflows:
- **Browse actors**: Use list_skills to find apify-actor-browse, then get_skill to learn how to search the marketplace
- **Run scrapers**: Use the apify-run-trigger skill to configure and start actor runs
- **Query results**: Use the apify-results-query skill to filter and explore scraped data
- **Full pipeline**: Use the seq-apify-scrape-flow sequence for end-to-end scraping workflows

When the user asks about scraping, web data extraction, or Apify — use these skills via execute_action with run_skill or run_sequence.
` : ''}
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
  input: Record<string, unknown>,
  status: 'running' | 'completed' | 'error',
  output?: unknown,
  errorMessage?: string,
  startTime?: number
): Promise<string | null> {
  try {
    const duration = startTime ? Date.now() - startTime : undefined;

    const { data, error } = await supabase
      .from('copilot_tool_calls')
      .insert({
        execution_id: executionId,
        tool_name: toolName,
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
// Multi-Agent Orchestration
// =============================================================================

async function logRoutingDecision(
  supabase: ReturnType<typeof createClient>,
  executionId: string,
  classification: IntentClassification
): Promise<void> {
  try {
    await supabase.from('agent_routing_log').insert({
      execution_id: executionId,
      intent_classification: classification,
      agents_selected: classification.agents,
      delegation_strategy: classification.strategy,
      reasoning: classification.reasoning,
      confidence: classification.confidence,
    });
  } catch (err) {
    // Non-fatal — table may not exist
    console.warn('[orchestrator] Failed to log routing decision:', err);
  }
}

async function handleMultiAgentRequest(
  message: string,
  config: AgentTeamConfig,
  classification: IntentClassification,
  anthropic: Anthropic,
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string,
  writer: WritableStreamDefaultWriter,
  encoder: TextEncoder,
  executionId: string | null
): Promise<void> {
  const streamWriter: StreamWriter = {
    sendSSE: (event, data) => sendSSE(writer, encoder, event, data),
  };

  const { agents, strategy } = classification;
  const results: Array<{ agentName: string; responseText: string; toolsUsed: string[]; inputTokens: number; outputTokens: number }> = [];

  if (strategy === 'single' || agents.length === 1) {
    // Single agent delegation
    const agentName = agents[0];
    const agentConfig = getSpecialistConfig(agentName, config.worker_model);
    const info = getAgentDisplayInfo(agentName);

    await sendSSE(writer, encoder, 'agent_start', {
      agent: agentName,
      displayName: info.displayName,
      icon: info.icon,
      color: info.color,
      reason: classification.reasoning,
    });

    const result = await runSpecialist(
      agentConfig,
      message,
      '', // No prior context for single agent
      { anthropic, supabase, userId, orgId },
      streamWriter,
      executionId || undefined
    );

    results.push(result);

    await sendSSE(writer, encoder, 'agent_done', {
      agent: agentName,
      displayName: info.displayName,
    });

    // Stream the agent's response as tokens
    for (const char of result.responseText) {
      await sendSSE(writer, encoder, 'token', { text: char });
    }
    await sendSSE(writer, encoder, 'message_complete', { content: result.responseText });

  } else if (strategy === 'parallel') {
    // Parallel delegation — run all agents simultaneously
    for (const agentName of agents) {
      const info = getAgentDisplayInfo(agentName);
      await sendSSE(writer, encoder, 'agent_start', {
        agent: agentName,
        displayName: info.displayName,
        icon: info.icon,
        color: info.color,
        reason: classification.reasoning,
      });
    }

    const parallelResults = await Promise.all(
      agents.map((agentName) => {
        const agentConfig = getSpecialistConfig(agentName, config.worker_model);
        return runSpecialist(
          agentConfig,
          message,
          '',
          { anthropic, supabase, userId, orgId },
          undefined, // Don't stream individual tool events in parallel
          executionId || undefined
        );
      })
    );

    for (const result of parallelResults) {
      const info = getAgentDisplayInfo(result.agentName);
      await sendSSE(writer, encoder, 'agent_done', {
        agent: result.agentName,
        displayName: info.displayName,
      });
      results.push(result);
    }

    // Synthesize responses from all agents
    const synthesisPrompt = `You are synthesizing responses from multiple specialist agents into one coherent reply for a sales professional.

${parallelResults.map((r) => {
  const info = getAgentDisplayInfo(r.agentName);
  return `## ${info.displayName}\n${r.responseText}`;
}).join('\n\n')}

Combine these into a single, well-structured response. Use headings for each section. Be concise but complete.`;

    const synthesisResponse = await anthropic.messages.create({
      model: config.orchestrator_model,
      max_tokens: 4096,
      system: 'You synthesize specialist agent responses into coherent, actionable advice for sales professionals.',
      messages: [{ role: 'user', content: synthesisPrompt }],
    });

    const synthText = synthesisResponse.content.find((c) => c.type === 'text');
    const synthesized = synthText?.type === 'text' ? synthText.text : '';

    await sendSSE(writer, encoder, 'synthesis', { content: synthesized });

    for (const char of synthesized) {
      await sendSSE(writer, encoder, 'token', { text: char });
    }
    await sendSSE(writer, encoder, 'message_complete', { content: synthesized });

  } else if (strategy === 'sequential') {
    // Sequential delegation — chain agent outputs
    let accumulatedContext = '';

    for (let i = 0; i < agents.length; i++) {
      const agentName = agents[i];
      const agentConfig = getSpecialistConfig(agentName, config.worker_model);
      const info = getAgentDisplayInfo(agentName);

      await sendSSE(writer, encoder, 'agent_start', {
        agent: agentName,
        displayName: info.displayName,
        icon: info.icon,
        color: info.color,
        reason: i === 0 ? classification.reasoning : `Following up on previous agent's output`,
      });

      const result = await runSpecialist(
        agentConfig,
        message,
        accumulatedContext,
        { anthropic, supabase, userId, orgId },
        streamWriter,
        executionId || undefined
      );

      results.push(result);
      accumulatedContext += `\n\n## ${info.displayName} Output\n${result.responseText}`;

      await sendSSE(writer, encoder, 'agent_done', {
        agent: agentName,
        displayName: info.displayName,
      });
    }

    // Stream the final agent's response
    const finalResponse = results[results.length - 1]?.responseText || '';
    for (const char of finalResponse) {
      await sendSSE(writer, encoder, 'token', { text: char });
    }
    await sendSSE(writer, encoder, 'message_complete', { content: finalResponse });
  }

  // Send done event with agent metadata (includes per-agent responses for persistence)
  const allToolsUsed = results.flatMap((r) => r.toolsUsed);
  const totalInputTokens = results.reduce((sum, r) => sum + r.inputTokens, 0);
  const totalOutputTokens = results.reduce((sum, r) => sum + r.outputTokens, 0);

  await sendSSE(writer, encoder, 'done', {
    toolsUsed: [...new Set(allToolsUsed)],
    iterations: results.reduce((sum, r) => sum + r.iterations, 0),
    agents_used: results.map((r) => r.agentName),
    total_tokens: totalInputTokens + totalOutputTokens,
    is_multi_agent: results.length > 1 || strategy !== 'single',
    agent_responses: results.map((r) => ({
      agent: r.agentName,
      displayName: getAgentDisplayInfo(r.agentName).displayName,
      responseText: r.responseText.slice(0, 2000),
      toolsUsed: r.toolsUsed,
    })),
    strategy,
  });

  // Log completion for parent execution
  if (executionId) {
    const finalText = results.map((r) => r.responseText).join('\n\n');
    await logExecutionComplete(
      supabase,
      executionId,
      {
        startTime: Date.now(),
        totalInputTokens,
        totalOutputTokens,
        toolCallIds: [],
      },
      true,
      finalText.slice(0, 5000),
      [...new Set(allToolsUsed)],
      results.reduce((sum, r) => sum + r.iterations, 0)
    );
  }
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

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

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limiting
    const rateLimitResult = await rateLimitMiddleware(
      req,
      userId,
      RATE_LIMIT_CONFIGS.copilot
    );
    if (rateLimitResult) {
      return rateLimitResult;
    }

    // Initialize Anthropic
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    // Build memory context for the user
    let memoryContext = '';
    memoryContext = await buildContextWithMemories(supabase, userId, message);

    // Trigger compaction check in background (non-blocking)
    handleCompactionIfNeeded(supabase, anthropic, userId, MODEL).catch((err) =>
      console.error('[copilot-autonomous] Background compaction error:', err)
    );

    // Check if org has Apify connected (for system prompt injection)
    const apifyConnection = await checkApifyConnection(supabase, organizationId || null);
    if (apifyConnection.connected) {
      console.log('[copilot-autonomous] Apify connected for org:', organizationId);
    }

    // Build system prompt (no longer depends on per-skill tool defs)
    const systemPrompt = buildSystemPrompt(organizationId, context, memoryContext, apifyConnection);

    // Use the 4-tool architecture (same as api-copilot)
    const claudeTools = FOUR_TOOL_DEFINITIONS;

    // =========================================================================
    // Multi-Agent Orchestration
    // =========================================================================
    // All orgs get multi-agent classification by default (loadAgentTeamConfig
    // returns a default config when no DB row exists).
    // Single-domain messages still route to a single specialist via the
    // keyword pre-filter — no extra API call for clear intents.
    // Fallback to the original single-agent path happens when:
    //   - force_single_agent context flag is set (demo comparison page)
    //   - Budget is exceeded
    //   - Classification returns null
    //   - Non-streaming request (testing only)

    const resolvedOrgForConfig = organizationId
      ? organizationId
      : await resolveOrgId(supabase, userId, null).catch(() => null);

    // Check credit balance before proceeding
    if (resolvedOrgForConfig) {
      const creditCheck = await checkCreditBalance(supabase, resolvedOrgForConfig);
      if (!creditCheck.allowed) {
        return new Response(
          JSON.stringify({
            error: 'insufficient_credits',
            message: creditCheck.message || 'Your organization has run out of AI credits. Please top up to continue.',
            balance: creditCheck.balance,
          }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Resolve planner/driver models from org config
    let plannerModel = MODEL; // default
    let driverModel = MODEL; // default

    if (resolvedOrgForConfig) {
      try {
        const { data: plannerConfig } = await supabase.rpc('get_model_for_feature', {
          p_feature_key: 'copilot_autonomous',
          p_org_id: resolvedOrgForConfig,
          p_role: 'planner',
        });
        if (plannerConfig?.[0]?.model_identifier) {
          plannerModel = plannerConfig[0].model_identifier;
        }

        const { data: driverConfig } = await supabase.rpc('get_model_for_feature', {
          p_feature_key: 'copilot_autonomous',
          p_org_id: resolvedOrgForConfig,
          p_role: 'driver',
        });
        if (driverConfig?.[0]?.model_identifier) {
          driverModel = driverConfig[0].model_identifier;
        }
      } catch (err) {
        console.warn('[CopilotAutonomous] Model resolution error, using defaults:', err);
      }
    }

    // force_single_agent is a demo-only context flag used by the side-by-side
    // comparison page. Normal copilot requests always attempt classification.
    const forceSingleAgent = !!context?.force_single_agent;

    if (resolvedOrgForConfig && stream && !forceSingleAgent) {
      const agentTeamConfig = await loadAgentTeamConfig(supabase, resolvedOrgForConfig);

      // Check budget before multi-agent delegation
      const budgetCheck = await checkAgentBudget(
        supabase,
        resolvedOrgForConfig,
        agentTeamConfig.budget_limit_daily_usd
      );

      if (!budgetCheck.allowed) {
        console.log(`[copilot-autonomous] Budget exceeded: $${budgetCheck.todaySpend.toFixed(2)}/$${budgetCheck.budgetLimit.toFixed(2)}, falling back to single-agent`);
        // Fall through to single-agent path below
      } else {
        // Attempt multi-agent classification
        const classification = await classifyIntent(message, agentTeamConfig, anthropic);

        if (classification && classification.agents.length > 0) {
          console.log(`[copilot-autonomous] Multi-agent: ${classification.agents.join(',')} via ${classification.strategy}`);

          const { readable, writer, encoder } = createSSEStream();

          (async () => {
            // Start parent execution log
            const executionId = await logExecutionStart(supabase, organizationId, userId, message);

            // Log routing decision
            if (executionId) {
              await logRoutingDecision(supabase, executionId, classification);
            }

            try {
              await handleMultiAgentRequest(
                message,
                agentTeamConfig,
                classification,
                anthropic,
                supabase,
                userId!,
                resolvedOrgForConfig,
                writer,
                encoder,
                executionId
              );
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              console.error('[copilot-autonomous] Multi-agent error, falling back:', errorMsg);
              await sendSSE(writer, encoder, 'error', { message: `Multi-agent error: ${errorMsg}` });
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
        }
        // Classification returned null — fall through to single-agent
      }
    }

    // =========================================================================
    // Single-Agent Path (original behavior — unchanged)
    // =========================================================================

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
          const toolExecutionDetails: ToolExecutionDetail[] = [];
          let iterations = 0;
          let claudeMessages: Anthropic.MessageParam[] = [
            { role: 'user', content: message },
          ];

          while (iterations < MAX_ITERATIONS) {
            iterations++;

            // Use planner model for first iteration (tool selection), driver for subsequent
            const iterationModel = iterations === 1 ? plannerModel : driverModel;

            // Use streaming API for real-time token delivery
            const stream = anthropic.messages.stream({
              model: iterationModel,
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

              // Detect structured response from tool executions OR user intent
              // The detector has two paths:
              //   1. Sequence-aware: maps tool executions (run_sequence) to response types
              //   2. Intent-based: matches user message patterns to response types and
              //      fetches data directly (e.g., "show me my pipeline" → PipelineResponse)
              // Always call the detector so intent-based detection works even when
              // Claude responds with plain text without calling any tools.
              let structuredResponse: StructuredResponse | null = null;
              try {
                structuredResponse = await detectAndStructureResponse(
                  message,
                  finalResponseText,
                  supabase,
                  userId!,
                  [...new Set(toolsUsed)],
                  userId!, // requestingUserId
                  context,
                  toolExecutionDetails
                );

                if (structuredResponse) {
                  console.log('[copilot-autonomous] Structured response detected:', structuredResponse.type);
                  await sendSSE(writer, encoder, 'structured_response', structuredResponse);
                }
              } catch (srError) {
                console.error('[copilot-autonomous] Structured response detection error (non-fatal):', srError);
                // Non-fatal: continue without structured response
              }

              await sendSSE(writer, encoder, 'done', {
                toolsUsed: [...new Set(toolsUsed)],
                iterations,
              });

              // Extract skill/sequence keys for analytics
              const skillExec = toolExecutionDetails.find(
                (t) => t.toolName === 'execute_action' && (t.args as any)?.action === 'run_skill'
              );
              const skillKey = skillExec ? String((skillExec.args as any)?.params?.skill_key || '') || undefined : undefined;
              const seqExec = toolExecutionDetails.find(
                (t) => t.toolName === 'execute_action' && (t.args as any)?.action === 'run_sequence'
              );
              const sequenceKey = seqExec ? String((seqExec.args as any)?.params?.sequence_key || '') || undefined : undefined;

              // Log successful completion
              if (executionId) {
                await logExecutionComplete(
                  supabase,
                  executionId,
                  analytics,
                  true,
                  finalResponseText,
                  [...new Set(toolsUsed)],
                  iterations,
                  undefined, // errorMessage
                  structuredResponse || undefined,
                  skillKey,
                  sequenceKey
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
                    toolUse.input as Record<string, unknown>,
                    'running'
                  );
                  if (toolCallId) {
                    analytics.toolCallIds.push(toolCallId);
                  }
                }

                try {
                  const result = await executeToolCall(
                    toolUse.name,
                    toolUse.input as Record<string, unknown>,
                    supabase,
                    userId,
                    organizationId || null
                  );

                  const toolLatencyMs = Date.now() - toolStartTime;

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

                  // Track execution detail for structured response detection
                  toolExecutionDetails.push({
                    toolName: toolUse.name,
                    args: toolUse.input,
                    result,
                    latencyMs: toolLatencyMs,
                    success: true,
                  });

                  toolResults.push({
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: JSON.stringify(result),
                  });
                } catch (toolError) {
                  const errorMsg = toolError instanceof Error ? toolError.message : String(toolError);
                  const toolLatencyMs = Date.now() - toolStartTime;

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

                  // Track failed execution detail
                  toolExecutionDetails.push({
                    toolName: toolUse.name,
                    args: toolUse.input,
                    result: { error: errorMsg },
                    latencyMs: toolLatencyMs,
                    success: false,
                  });

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

        // Use planner model for first iteration (tool selection), driver for subsequent
        const iterationModel = iterations === 1 ? plannerModel : driverModel;

        const response = await anthropic.messages.create({
          model: iterationModel,
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
              const result = await executeToolCall(
                toolUse.name,
                toolUse.input as Record<string, unknown>,
                supabase,
                userId,
                organizationId || null
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
