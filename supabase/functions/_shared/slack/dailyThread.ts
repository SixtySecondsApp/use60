/**
 * dailyThread.ts — Manages one Slack DM thread per user per day.
 *
 * The agent fleet groups all notifications for a user into a single daily
 * thread rather than spamming top-level DMs. This utility:
 *   1. Checks agent_daily_logs for an existing thread_ts for today
 *   2. If found, returns it so callers can reply in-thread
 *   3. If not found, sends a "Good morning" opener via send-slack-message,
 *      stores the thread_ts, and returns it
 *
 * Returns null if the Slack call fails — callers should fall back to a
 * direct (non-threaded) DM.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { logAgentAction } from '../memory/dailyLog.ts';

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Get (or create) today's daily Slack DM thread for a user.
 *
 * @param userId  - The Supabase user ID to message
 * @param orgId   - The organisation context
 * @param supabase - A service-role Supabase client (needs SELECT/INSERT on
 *                   agent_daily_logs and invoke access for send-slack-message)
 * @returns The thread_ts string to use as `thread_ts` in subsequent Slack
 *          messages, or null if thread creation failed.
 */
export async function getDailyThreadTs(
  userId: string,
  orgId: string,
  supabase: SupabaseClient,
): Promise<string | null> {
  const todayISO = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const todayStart = `${todayISO}T00:00:00.000Z`;

  try {
    // 1. Check for existing daily thread
    const { data: existing, error: queryError } = await supabase
      .from('agent_daily_logs')
      .select('action_detail')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .eq('action_type', 'daily_thread_created')
      .gte('created_at', todayStart)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (queryError) {
      console.error('[dailyThread] Error querying agent_daily_logs:', queryError.message);
      // Fall through to create a new thread — worst case we get a duplicate
    }

    if (existing?.action_detail?.thread_ts) {
      return existing.action_detail.thread_ts as string;
    }

    // 2. No existing thread — send opener message via send-slack-message
    const { data: slackResult, error: invokeError } = await supabase.functions.invoke(
      'send-slack-message',
      {
        body: {
          user_id: userId,
          org_id: orgId,
          message_type: 'daily_thread_opener',
          message: `:sunrise: Good morning! Here's your 60 update thread for today.`,
          data: {},
        },
      },
    );

    if (invokeError) {
      console.error('[dailyThread] send-slack-message invoke error:', invokeError.message);
      return null;
    }

    // send-slack-message returns { success, ts, channel }
    const threadTs = slackResult?.ts;
    if (!threadTs) {
      console.error('[dailyThread] send-slack-message did not return ts:', slackResult);
      return null;
    }

    // 3. Persist the thread_ts so subsequent calls today reuse it
    await logAgentAction({
      supabaseClient: supabase,
      orgId,
      userId,
      agentType: 'daily_planner',
      actionType: 'daily_thread_created',
      actionDetail: {
        thread_ts: threadTs,
        date: todayISO,
        channel: slackResult?.channel ?? null,
      },
      outcome: 'success',
    });

    return threadTs;
  } catch (err) {
    console.error('[dailyThread] Unexpected error:', err);
    return null;
  }
}
