// supabase/functions/_shared/slack-copilot/threadMemory.ts
// Thread state and message history management for Slack copilot (PRD-22)

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { createLogger } from '../logger.ts';
import { resolveModel, recordSuccess, recordFailure } from '../modelRouter.ts';
import type { ThreadState, ThreadMessage } from './types.ts';

const MAX_THREAD_HISTORY = 10;

// ---------------------------------------------------------------------------
// Multi-turn context types (CC-008)
// ---------------------------------------------------------------------------

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  intent?: string;
  entities?: Record<string, string>; // { deal_id: '...', contact_id: '...' }
  timestamp: string;
}

export interface ActiveEntities {
  active_deal_id?: string;
  active_contact_id?: string;
  active_company_id?: string;
  active_meeting_id?: string;
}

/**
 * Get or create a thread state for a Slack DM conversation
 */
export async function getOrCreateThread(
  supabase: SupabaseClient,
  params: {
    orgId: string;
    userId: string;
    slackTeamId: string;
    slackChannelId: string;
    slackThreadTs: string;
  }
): Promise<ThreadState> {
  // Try to find existing thread
  const { data: existing } = await supabase
    .from('slack_copilot_threads')
    .select('id, org_id, user_id, slack_team_id, slack_channel_id, slack_thread_ts, message_count, context, last_message_at')
    .eq('slack_channel_id', params.slackChannelId)
    .eq('slack_thread_ts', params.slackThreadTs)
    .maybeSingle();

  if (existing) {
    return {
      id: existing.id,
      orgId: existing.org_id,
      userId: existing.user_id,
      slackTeamId: existing.slack_team_id,
      slackChannelId: existing.slack_channel_id,
      slackThreadTs: existing.slack_thread_ts,
      messageCount: existing.message_count,
      context: existing.context || {},
      lastMessageAt: existing.last_message_at,
    };
  }

  // Create new thread
  const { data: created, error } = await supabase
    .from('slack_copilot_threads')
    .insert({
      org_id: params.orgId,
      user_id: params.userId,
      slack_team_id: params.slackTeamId,
      slack_channel_id: params.slackChannelId,
      slack_thread_ts: params.slackThreadTs,
      message_count: 0,
      context: {},
    })
    .select('id, org_id, user_id, slack_team_id, slack_channel_id, slack_thread_ts, message_count, context, last_message_at')
    .single();

  if (error) {
    // Handle race condition — another request may have created it
    if (error.code === '23505') {
      const { data: retry } = await supabase
        .from('slack_copilot_threads')
        .select('id, org_id, user_id, slack_team_id, slack_channel_id, slack_thread_ts, message_count, context, last_message_at')
        .eq('slack_channel_id', params.slackChannelId)
        .eq('slack_thread_ts', params.slackThreadTs)
        .single();
      if (retry) {
        return {
          id: retry.id,
          orgId: retry.org_id,
          userId: retry.user_id,
          slackTeamId: retry.slack_team_id,
          slackChannelId: retry.slack_channel_id,
          slackThreadTs: retry.slack_thread_ts,
          messageCount: retry.message_count,
          context: retry.context || {},
          lastMessageAt: retry.last_message_at,
        };
      }
    }
    throw new Error(`Failed to create thread: ${error.message}`);
  }

  return {
    id: created.id,
    orgId: created.org_id,
    userId: created.user_id,
    slackTeamId: created.slack_team_id,
    slackChannelId: created.slack_channel_id,
    slackThreadTs: created.slack_thread_ts,
    messageCount: created.message_count,
    context: created.context || {},
    lastMessageAt: created.last_message_at,
  };
}

/**
 * Save a message to the thread history
 */
export async function saveMessage(
  supabase: SupabaseClient,
  threadId: string,
  message: { role: 'user' | 'assistant'; content: string; slackTs?: string; intent?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  await supabase.from('slack_copilot_messages').insert({
    thread_id: threadId,
    role: message.role,
    content: message.content,
    slack_ts: message.slackTs,
    intent: message.intent,
    metadata: message.metadata || {},
  });

  // Update thread stats
  await supabase
    .from('slack_copilot_threads')
    .update({
      message_count: supabase.rpc ? undefined : undefined, // handled below
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', threadId);

  // Increment message count via raw update
  await supabase.rpc('increment_slack_copilot_thread_count', { p_thread_id: threadId }).catch(() => {
    // Fallback: just update last_message_at (count increment not critical)
    console.warn('[threadMemory] increment RPC not available, skipping count update');
  });
}

/**
 * Load recent thread history for multi-turn context
 */
export async function loadThreadHistory(
  supabase: SupabaseClient,
  threadId: string,
  limit: number = MAX_THREAD_HISTORY
): Promise<ThreadMessage[]> {
  const { data, error } = await supabase
    .from('slack_copilot_messages')
    .select('role, content, intent, slack_ts, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  // Reverse to get chronological order
  return data.reverse().map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
    intent: msg.intent || undefined,
    slackTs: msg.slack_ts || undefined,
    createdAt: msg.created_at,
  }));
}

/**
 * Update thread context (stores accumulated context like resolved entities)
 */
export async function updateThreadContext(
  supabase: SupabaseClient,
  threadId: string,
  contextUpdate: Record<string, unknown>
): Promise<void> {
  // Merge new context with existing
  const { data: thread } = await supabase
    .from('slack_copilot_threads')
    .select('context')
    .eq('id', threadId)
    .single();

  const merged = { ...(thread?.context || {}), ...contextUpdate };

  await supabase
    .from('slack_copilot_threads')
    .update({ context: merged, updated_at: new Date().toISOString() })
    .eq('id', threadId);
}

// ---------------------------------------------------------------------------
// Thread Context Extraction (XCHAN-001)
// ---------------------------------------------------------------------------

const THREAD_QUIET_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
const THREAD_MESSAGE_THRESHOLD = 10;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

interface ExtractedEntityRef {
  entity_type: 'deal' | 'contact' | 'company';
  name: string;
}

interface AIExtractionResult {
  summary: string;
  entities: ExtractedEntityRef[];
}

/**
 * Check whether a thread qualifies for context extraction:
 * - 10+ messages in the thread, OR
 * - last_message_at is older than 15 minutes (thread has gone quiet)
 */
function shouldExtractContext(threadState: ThreadState): boolean {
  if (threadState.messageCount >= THREAD_MESSAGE_THRESHOLD) return true;

  if (threadState.lastMessageAt) {
    const lastMsgMs = new Date(threadState.lastMessageAt).getTime();
    const ageMs = Date.now() - lastMsgMs;
    if (ageMs >= THREAD_QUIET_THRESHOLD_MS) return true;
  }

  return false;
}

/**
 * Use the AI (via modelRouter low-tier enrichment model) to summarise the thread
 * and extract entity references (deals, contacts, companies).
 *
 * Falls back gracefully to null on any AI failure — context extraction is non-critical.
 */
async function extractWithAI(
  supabase: SupabaseClient,
  messages: ThreadMessage[],
  userId: string,
  orgId: string,
  traceId: string
): Promise<AIExtractionResult | null> {
  // Resolve model via modelRouter
  let resolution;
  try {
    resolution = await resolveModel(supabase, {
      feature: 'enrichment',
      intelligenceTier: 'low',
      userId,
      orgId,
      traceId,
    });
  } catch (err) {
    console.warn('[threadMemory] resolveModel failed, skipping AI extraction:', err instanceof Error ? err.message : String(err));
    return null;
  }

  // Build prompt from thread messages
  const transcript = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const prompt = `You are analysing a Slack conversation between a sales rep and a sales copilot assistant.

Summarise the conversation and identify any CRM entities mentioned.

Conversation:
${transcript}

Respond with ONLY a JSON object (no markdown):
{
  "summary": "<1-3 sentence summary of the key topics and outcomes discussed>",
  "entities": [
    {"entity_type": "deal"|"contact"|"company", "name": "<entity name>"}
  ]
}

Only include entities that were clearly and specifically mentioned. If no entities were mentioned, use an empty array.`;

  try {
    // Determine API key and endpoint based on resolved provider
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      console.warn('[threadMemory] No ANTHROPIC_API_KEY available for extraction');
      return null;
    }

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: resolution.modelId,
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      await recordFailure(supabase, resolution.modelId);
      console.warn('[threadMemory] AI extraction API error:', response.status);
      return null;
    }

    await recordSuccess(supabase, resolution.modelId);

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const parsed = JSON.parse(text);

    return {
      summary: String(parsed.summary || ''),
      entities: Array.isArray(parsed.entities) ? parsed.entities : [],
    };
  } catch (err) {
    await recordFailure(supabase, resolution.modelId).catch(() => {});
    console.warn('[threadMemory] AI extraction failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Resolve entity names to database UUIDs for a given user/org.
 * Returns only entities where a matching DB record was found.
 */
async function resolveEntityIds(
  supabase: SupabaseClient,
  entities: ExtractedEntityRef[],
  userId: string,
  orgId: string
): Promise<Array<{ entity_type: 'deal' | 'contact' | 'company'; entity_id: string; name: string }>> {
  const resolved: Array<{ entity_type: 'deal' | 'contact' | 'company'; entity_id: string; name: string }> = [];

  for (const entity of entities) {
    try {
      if (entity.entity_type === 'deal') {
        const { data } = await supabase
          .from('deals')
          .select('id')
          .eq('owner_id', userId)
          .ilike('title', `%${entity.name}%`)
          .limit(1)
          .maybeSingle();

        if (data?.id) {
          resolved.push({ entity_type: 'deal', entity_id: data.id, name: entity.name });
        }
      } else if (entity.entity_type === 'contact') {
        const { data } = await supabase
          .from('contacts')
          .select('id')
          .eq('owner_id', userId)
          .or(`first_name.ilike.%${entity.name}%,last_name.ilike.%${entity.name}%`)
          .limit(1)
          .maybeSingle();

        if (data?.id) {
          resolved.push({ entity_type: 'contact', entity_id: data.id, name: entity.name });
        }
      } else if (entity.entity_type === 'company') {
        // Try contacts table for company name, then deals
        const { data: contactData } = await supabase
          .from('contacts')
          .select('id')
          .eq('owner_id', userId)
          .ilike('company', `%${entity.name}%`)
          .limit(1)
          .maybeSingle();

        if (contactData?.id) {
          // Store as contact entity (linked via company field)
          resolved.push({ entity_type: 'contact', entity_id: contactData.id, name: entity.name });
        }
      }
    } catch {
      // Non-critical — skip unresolvable entities
    }
  }

  return resolved;
}

/**
 * Extract conversation context from a Slack thread and persist to conversation_context.
 *
 * Triggered when:
 * - The thread reaches 10+ messages, OR
 * - The thread has gone quiet for 15+ minutes
 *
 * For each identified entity (deal, contact) that can be resolved to a DB ID,
 * an upsert is written to conversation_context keyed by (user_id, channel, channel_ref, entity_type, entity_id).
 *
 * Privacy: context rows are scoped to user_id only — never org-shared.
 */
export async function extractThreadContext(
  supabase: SupabaseClient,
  threadState: ThreadState,
  threadMessages: ThreadMessage[]
): Promise<void> {
  if (!shouldExtractContext(threadState)) return;
  if (threadMessages.length === 0) return;

  const logger = createLogger('slack-thread-memory', {
    userId: threadState.userId,
    orgId: threadState.orgId,
  });

  const span = logger.createSpan('extract_thread_context', {
    thread_id: threadState.id,
    message_count: threadMessages.length,
  });

  try {
    logger.info('thread_context.extract_start', {
      thread_id: threadState.id,
      message_count: threadMessages.length,
      slack_thread_ts: threadState.slackThreadTs,
    });

    // Run AI extraction
    const extraction = await extractWithAI(
      supabase,
      threadMessages,
      threadState.userId,
      threadState.orgId,
      logger.trace_id
    );

    if (!extraction || !extraction.summary) {
      logger.warn('thread_context.no_extraction', { thread_id: threadState.id });
      span.stop({ skipped: true });
      await logger.flush();
      return;
    }

    logger.info('thread_context.extracted', {
      thread_id: threadState.id,
      entity_count: extraction.entities.length,
      summary_length: extraction.summary.length,
    });

    // Resolve entity names to DB IDs
    const resolvedEntities = await resolveEntityIds(
      supabase,
      extraction.entities,
      threadState.userId,
      threadState.orgId
    );

    if (resolvedEntities.length === 0) {
      // No resolvable entities — nothing to upsert
      logger.info('thread_context.no_resolvable_entities', { thread_id: threadState.id });
      span.stop({ resolved_count: 0 });
      await logger.flush();
      return;
    }

    // Upsert one conversation_context row per resolved entity
    const now = new Date().toISOString();
    const upsertRows = resolvedEntities.map((entity) => ({
      user_id: threadState.userId,
      org_id: threadState.orgId,
      channel: 'slack_copilot' as const,
      channel_ref: threadState.slackThreadTs,
      entity_type: entity.entity_type,
      entity_id: entity.entity_id,
      context_summary: extraction.summary,
      last_updated: now,
    }));

    const { error } = await supabase
      .from('conversation_context')
      .upsert(upsertRows, {
        onConflict: 'user_id,channel,channel_ref,entity_type,entity_id',
        ignoreDuplicates: false,
      });

    if (error) {
      logger.error('thread_context.upsert_failed', error, { thread_id: threadState.id });
    } else {
      logger.info('thread_context.upserted', {
        thread_id: threadState.id,
        upserted_count: upsertRows.length,
      });
    }

    span.stop({ resolved_count: resolvedEntities.length, upserted_count: upsertRows.length });
  } catch (err) {
    logger.error('thread_context.extract_failed', err, { thread_id: threadState.id });
    span.stop({ error: err instanceof Error ? err.message : String(err) });
  } finally {
    await logger.flush();
  }
}

// ---------------------------------------------------------------------------
// Active entity tracking (CC-008)
// ---------------------------------------------------------------------------

/**
 * Update active entity IDs on the thread row.
 * If any new entity ID differs from the current active entity (context switch),
 * also clears `loaded_context` to force fresh data loading.
 */
export async function updateActiveEntities(
  threadId: string,
  entities: ActiveEntities,
  supabase: SupabaseClient
): Promise<void> {
  // Read current active entities to detect a context switch
  const { data: current } = await supabase
    .from('slack_copilot_threads')
    .select('active_deal_id, active_contact_id, active_company_id, active_meeting_id')
    .eq('id', threadId)
    .maybeSingle();

  const switched = detectContextSwitch(
    {
      active_deal_id: current?.active_deal_id ?? undefined,
      active_contact_id: current?.active_contact_id ?? undefined,
      active_company_id: current?.active_company_id ?? undefined,
      active_meeting_id: current?.active_meeting_id ?? undefined,
    },
    entities
  );

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (entities.active_deal_id !== undefined) updatePayload.active_deal_id = entities.active_deal_id;
  if (entities.active_contact_id !== undefined) updatePayload.active_contact_id = entities.active_contact_id;
  if (entities.active_company_id !== undefined) updatePayload.active_company_id = entities.active_company_id;
  if (entities.active_meeting_id !== undefined) updatePayload.active_meeting_id = entities.active_meeting_id;

  // Clear loaded_context on context switch so orchestrator fetches fresh data
  if (switched) {
    updatePayload.loaded_context = null;
  }

  await supabase
    .from('slack_copilot_threads')
    .update(updatePayload)
    .eq('id', threadId);
}

/**
 * Get the current active entity IDs from the thread row.
 */
export async function getActiveEntities(
  threadId: string,
  supabase: SupabaseClient
): Promise<ActiveEntities> {
  const { data } = await supabase
    .from('slack_copilot_threads')
    .select('active_deal_id, active_contact_id, active_company_id, active_meeting_id')
    .eq('id', threadId)
    .maybeSingle();

  return {
    active_deal_id: data?.active_deal_id ?? undefined,
    active_contact_id: data?.active_contact_id ?? undefined,
    active_company_id: data?.active_company_id ?? undefined,
    active_meeting_id: data?.active_meeting_id ?? undefined,
  };
}

/**
 * Returns true if any incoming entity ID differs from the current active entity.
 * Used by the orchestrator to decide whether to clear cached context.
 */
export function detectContextSwitch(
  currentEntities: ActiveEntities,
  newEntities: ActiveEntities
): boolean {
  if (newEntities.active_deal_id !== undefined && newEntities.active_deal_id !== currentEntities.active_deal_id) {
    return true;
  }
  if (newEntities.active_contact_id !== undefined && newEntities.active_contact_id !== currentEntities.active_contact_id) {
    return true;
  }
  if (newEntities.active_company_id !== undefined && newEntities.active_company_id !== currentEntities.active_company_id) {
    return true;
  }
  if (newEntities.active_meeting_id !== undefined && newEntities.active_meeting_id !== currentEntities.active_meeting_id) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Turn persistence (CC-008)
// ---------------------------------------------------------------------------

const MAX_TURNS = 20;

/**
 * Append a conversation turn to the `turns` JSONB array on the thread row.
 * Trims to the last MAX_TURNS turns if the array exceeds that length.
 */
export async function appendTurn(
  threadId: string,
  turn: ConversationTurn,
  supabase: SupabaseClient
): Promise<void> {
  const { data: thread } = await supabase
    .from('slack_copilot_threads')
    .select('turns')
    .eq('id', threadId)
    .maybeSingle();

  const existing: ConversationTurn[] = Array.isArray(thread?.turns) ? (thread.turns as ConversationTurn[]) : [];
  const updated = [...existing, turn];

  // Trim oldest turns to cap at MAX_TURNS
  const trimmed = updated.length > MAX_TURNS ? updated.slice(updated.length - MAX_TURNS) : updated;

  await supabase
    .from('slack_copilot_threads')
    .update({ turns: trimmed, updated_at: new Date().toISOString() })
    .eq('id', threadId);
}

// ---------------------------------------------------------------------------
// Intent and credits tracking (CC-008)
// ---------------------------------------------------------------------------

/**
 * Append an intent to `intents_used` and increment `credits_consumed`.
 */
export async function trackIntentAndCredits(
  threadId: string,
  intent: string,
  credits: number,
  supabase: SupabaseClient
): Promise<void> {
  const { data: thread } = await supabase
    .from('slack_copilot_threads')
    .select('intents_used, credits_consumed')
    .eq('id', threadId)
    .maybeSingle();

  const intentsUsed: string[] = Array.isArray(thread?.intents_used) ? (thread.intents_used as string[]) : [];
  const creditsConsumed: number = typeof thread?.credits_consumed === 'number' ? thread.credits_consumed : 0;

  await supabase
    .from('slack_copilot_threads')
    .update({
      intents_used: [...intentsUsed, intent],
      credits_consumed: creditsConsumed + credits,
      updated_at: new Date().toISOString(),
    })
    .eq('id', threadId);
}

/**
 * Append an action string to the `actions_taken` array on the thread row.
 */
export async function trackAction(
  threadId: string,
  action: string,
  supabase: SupabaseClient
): Promise<void> {
  const { data: thread } = await supabase
    .from('slack_copilot_threads')
    .select('actions_taken')
    .eq('id', threadId)
    .maybeSingle();

  const actionsTaken: string[] = Array.isArray(thread?.actions_taken) ? (thread.actions_taken as string[]) : [];

  await supabase
    .from('slack_copilot_threads')
    .update({
      actions_taken: [...actionsTaken, action],
      updated_at: new Date().toISOString(),
    })
    .eq('id', threadId);
}

// ---------------------------------------------------------------------------
// Cross-channel context bridge (CC-008)
// ---------------------------------------------------------------------------

/**
 * Upsert a cross-channel context row for a specific entity that was discussed
 * in a Slack Copilot thread. Keyed by (user_id, channel, channel_ref, entity_type, entity_id).
 */
export async function bridgeCrossChannelContext(
  userId: string,
  orgId: string,
  entityType: 'deal' | 'contact' | 'company',
  entityId: string,
  entityName: string,
  threadTs: string,
  supabase: SupabaseClient
): Promise<void> {
  await supabase
    .from('conversation_context')
    .upsert(
      {
        user_id: userId,
        org_id: orgId,
        channel: 'slack_copilot',
        channel_ref: threadTs,
        entity_type: entityType,
        entity_id: entityId,
        context_summary: `User asking about ${entityName} in Slack`,
        last_updated: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,channel,channel_ref,entity_type,entity_id',
        ignoreDuplicates: false,
      }
    );
}
