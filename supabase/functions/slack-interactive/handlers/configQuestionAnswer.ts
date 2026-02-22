/**
 * Config Question Answer — Slack Interactive Handler
 *
 * Handles button clicks from contextual config question DMs.
 * action_id: "config_question_answer"
 * value: JSON.stringify({ question_id, config_key, answer })
 *
 * Logic:
 *   1. Parse action value
 *   2. Look up question in agent_config_questions
 *   3. Write answer to config engine (org or user override table)
 *   4. Mark question as answered
 *   5. Log to agent_config_question_log
 *   6. Confirm to user via ephemeral reply
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// =============================================================================
// Types
// =============================================================================

interface SlackAction {
  action_id: string;
  value: string;
  type: string;
  block_id?: string;
}

interface InteractivePayload {
  user: {
    id: string;
    name?: string;
  };
  response_url?: string;
  message?: { ts: string };
  channel?: { id: string };
  team?: { id: string; domain?: string };
}

export interface ConfigQuestionHandleResult {
  success: boolean;
  responseBlocks?: unknown[];
  error?: string;
}

interface ActionValue {
  question_id: string;
  config_key: string;
  answer: unknown;
}

interface AgentConfigQuestion {
  id: string;
  org_id: string;
  user_id: string | null;
  config_key: string;
  category: string;
  scope: 'org' | 'user';
  status: string;
}

// =============================================================================
// Helpers
// =============================================================================

function section(text: string) {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: text.substring(0, 3000) },
  };
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle config_question_answer button clicks from Slack.
 * Returns null if action_id is not "config_question_answer".
 */
export async function handleConfigQuestionAnswer(
  actionId: string,
  payload: InteractivePayload,
  action: SlackAction,
): Promise<ConfigQuestionHandleResult | null> {
  if (actionId !== 'config_question_answer') return null;

  const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

  // -------------------------------------------------------------------------
  // 1. Parse action value
  // -------------------------------------------------------------------------
  let parsed: ActionValue;
  try {
    parsed = JSON.parse(action.value);
  } catch {
    console.error('[configQuestionAnswer] Failed to parse action.value:', action.value);
    return { success: false, error: 'Invalid action value format' };
  }

  const { question_id, config_key, answer } = parsed;
  if (!question_id || !config_key || answer === undefined) {
    return { success: false, error: 'Missing question_id, config_key, or answer in action value' };
  }

  // -------------------------------------------------------------------------
  // 2. Look up the question record
  // -------------------------------------------------------------------------
  const { data: question, error: questionError } = await serviceClient
    .from('agent_config_questions')
    .select('id, org_id, user_id, config_key, category, scope, status')
    .eq('id', question_id)
    .maybeSingle();

  if (questionError) {
    console.error('[configQuestionAnswer] Question lookup error:', questionError);
    return { success: false, error: 'Failed to look up question' };
  }

  if (!question) {
    console.warn('[configQuestionAnswer] Question not found:', question_id);
    return { success: false, error: 'Question not found' };
  }

  const q = question as AgentConfigQuestion;

  if (q.status === 'answered') {
    // Already answered — still confirm gracefully so the user gets feedback
    return {
      success: true,
      responseBlocks: [
        section(`Your *${q.category}* settings were already saved. No changes needed.`),
      ],
    };
  }

  // -------------------------------------------------------------------------
  // 3. Write answer to config engine
  // -------------------------------------------------------------------------
  if (q.scope === 'org') {
    const { error: upsertError } = await serviceClient
      .from('agent_config_org_overrides')
      .upsert(
        {
          org_id: q.org_id,
          agent_type: 'global',
          config_key,
          config_value: answer,
        },
        { onConflict: 'agent_config_org_overrides_unique' },
      );

    if (upsertError) {
      console.error('[configQuestionAnswer] Org override upsert error:', upsertError);
      return { success: false, error: 'Failed to save org setting' };
    }
  } else {
    // scope === 'user'
    const { error: upsertError } = await serviceClient
      .from('agent_config_user_overrides')
      .upsert(
        {
          org_id: q.org_id,
          user_id: q.user_id,
          agent_type: 'global',
          config_key,
          config_value: answer,
        },
        { onConflict: 'org_id,user_id,agent_type,config_key' },
      );

    if (upsertError) {
      console.error('[configQuestionAnswer] User override upsert error:', upsertError);
      return { success: false, error: 'Failed to save user setting' };
    }
  }

  // -------------------------------------------------------------------------
  // 4. Mark question as answered
  // -------------------------------------------------------------------------
  const { error: updateError } = await serviceClient
    .from('agent_config_questions')
    .update({
      status: 'answered',
      answered_at: new Date().toISOString(),
      answer_value: answer,
    })
    .eq('id', question_id);

  if (updateError) {
    // Non-fatal — the config write already succeeded
    console.error('[configQuestionAnswer] Failed to mark question answered:', updateError);
  }

  // -------------------------------------------------------------------------
  // 5. Log the answered event
  // -------------------------------------------------------------------------
  // Resolve the sixty user_id via the Slack user mapping so we can write the log
  const { data: mapping } = await serviceClient
    .from('slack_user_mappings')
    .select('sixty_user_id')
    .eq('slack_user_id', payload.user.id)
    .eq('org_id', q.org_id)
    .maybeSingle();

  const resolvedUserId = mapping?.sixty_user_id ?? q.user_id;

  if (resolvedUserId) {
    await serviceClient
      .from('agent_config_question_log')
      .insert({
        org_id: q.org_id,
        user_id: resolvedUserId,
        question_id,
        event_type: 'answered',
        channel: 'slack',
        metadata: { slack_user_id: payload.user.id, config_key, answer },
      })
      .then(({ error }) => {
        if (error) console.error('[configQuestionAnswer] Log insert error:', error);
      });
  }

  // -------------------------------------------------------------------------
  // 6. Confirm to user
  // -------------------------------------------------------------------------
  const categoryLabel = q.category
    ? q.category.replace(/_/g, ' ')
    : 'agent';

  return {
    success: true,
    responseBlocks: [
      section(`Got it! I've updated your *${categoryLabel}* settings.`),
    ],
  };
}
