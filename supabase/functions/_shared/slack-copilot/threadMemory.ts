// supabase/functions/_shared/slack-copilot/threadMemory.ts
// Thread state and message history management for Slack copilot (PRD-22)

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { ThreadState, ThreadMessage } from './types.ts';

const MAX_THREAD_HISTORY = 10;

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
