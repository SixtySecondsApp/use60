// supabase/functions/slack-copilot/index.ts
// Main Slack copilot edge function — orchestrates intent → context → handler → response (PRD-22, CONV-008)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { classifyIntent } from '../_shared/slack-copilot/intentClassifier.ts';
import { assembleContext } from '../_shared/slack-copilot/contextAssembler.ts';
import { getOrCreateThread, saveMessage, loadThreadHistory, updateThreadContext } from '../_shared/slack-copilot/threadMemory.ts';
import { handleDealQuery } from '../_shared/slack-copilot/handlers/dealQueryHandler.ts';
import { handlePipelineQuery } from '../_shared/slack-copilot/handlers/pipelineQueryHandler.ts';
import { handleHistoryQuery } from '../_shared/slack-copilot/handlers/historyQueryHandler.ts';
import { handleContactQuery } from '../_shared/slack-copilot/handlers/contactQueryHandler.ts';
import { handleActionRequest } from '../_shared/slack-copilot/handlers/actionHandler.ts';
import { handleCompetitiveQuery } from '../_shared/slack-copilot/handlers/competitiveQueryHandler.ts';
import { handleCoachingQuery } from '../_shared/slack-copilot/handlers/coachingQueryHandler.ts';
import { checkRateLimit, trackUsage } from '../_shared/slack-copilot/rateLimiter.ts';
import type { HandlerResult, CopilotIntentType } from '../_shared/slack-copilot/types.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const {
      orgId,
      userId,
      slackUserId,
      slackTeamId,
      channelId,
      threadTs,
      messageTs,
      text,
      botToken,
    } = await req.json();

    if (!orgId || !userId || !channelId || !text || !botToken) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const startTime = Date.now();

    // Rate limiting
    const rateLimitResult = await checkRateLimit(supabase, userId, orgId);
    if (!rateLimitResult.allowed) {
      await postSlackMessage(botToken, channelId, threadTs, rateLimitResult.message!);
      return new Response(JSON.stringify({ ok: true, rateLimited: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get or create thread state
    const threadState = await getOrCreateThread(supabase, {
      orgId,
      userId,
      slackTeamId,
      slackChannelId: channelId,
      slackThreadTs: threadTs,
    });

    // Load thread history for multi-turn context
    const threadHistory = await loadThreadHistory(supabase, threadState.id);

    // Save user message
    await saveMessage(supabase, threadState.id, {
      role: 'user',
      content: text,
      slackTs: messageTs,
    });

    // Get Anthropic API key for AI features
    const anthropicApiKey = await getAnthropicKey(supabase, orgId, userId);

    // Classify intent
    const intent = await classifyIntent(text, threadHistory, anthropicApiKey);
    console.log(`[slack-copilot] Intent: ${intent.type} (${intent.confidence}) for user ${userId}`);

    // Assemble context based on intent
    const queryContext = await assembleContext(supabase, userId, orgId, intent);

    // Route to handler
    let result: HandlerResult;
    try {
      result = await routeToHandler(intent.type, intent, queryContext, anthropicApiKey);
    } catch (err) {
      console.error('[slack-copilot] Handler error:', err);
      result = { text: "Sorry, I had trouble processing that. Could you rephrase your question?" };
    }

    // Post response to Slack
    await postSlackResponse(botToken, channelId, threadTs, result);

    // Save assistant message
    const responseText = result.text || (result.blocks ? '[Block Kit response]' : 'No response');
    await saveMessage(supabase, threadState.id, {
      role: 'assistant',
      content: responseText,
      intent: intent.type,
      metadata: {
        confidence: intent.confidence,
        entities: intent.entities,
        pendingAction: result.pendingAction,
      },
    });

    // Update thread context with any pending actions
    if (result.pendingAction) {
      await updateThreadContext(supabase, threadState.id, {
        pendingAction: result.pendingAction,
      });
    }

    // Track usage
    const responseTimeMs = Date.now() - startTime;
    await trackUsage(supabase, userId, orgId, intent.type, responseTimeMs);

    // Log analytics
    try {
      await supabase.from('slack_command_analytics').insert({
        user_id: userId,
        org_id: orgId,
        command_type: 'copilot_dm',
        intent: intent.type,
        raw_text: text.substring(0, 500),
        response_time_ms: responseTimeMs,
        success: true,
      });
    } catch {
      // Non-critical
    }

    return new Response(JSON.stringify({ ok: true, intent: intent.type }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[slack-copilot] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function routeToHandler(
  intentType: CopilotIntentType,
  intent: Parameters<typeof handleDealQuery>[0],
  queryContext: Parameters<typeof handleDealQuery>[1],
  anthropicApiKey: string | null
): Promise<HandlerResult> {
  switch (intentType) {
    case 'deal_query':
      return handleDealQuery(intent, queryContext);
    case 'pipeline_query':
      return handlePipelineQuery(intent, queryContext);
    case 'history_query':
      return handleHistoryQuery(intent, queryContext);
    case 'contact_query':
      return handleContactQuery(intent, queryContext);
    case 'action_request':
      return handleActionRequest(intent, queryContext, anthropicApiKey);
    case 'competitive_query':
      return handleCompetitiveQuery(intent, queryContext);
    case 'coaching_query':
      return handleCoachingQuery(intent, queryContext, anthropicApiKey);
    case 'general_chat':
      return handleGeneralChat(intent, anthropicApiKey);
    default:
      return { text: "I'm not sure how to help with that. Try asking about your deals, pipeline, contacts, or say \"help\" to see what I can do." };
  }
}

async function handleGeneralChat(
  intent: Parameters<typeof handleDealQuery>[0],
  anthropicApiKey: string | null
): Promise<HandlerResult> {
  const text = intent.entities.rawQuery || '';
  const lower = text.toLowerCase();

  // Help
  if (/^(?:help|what can you do|\?|commands?)$/i.test(lower)) {
    return {
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: '*Here\'s what I can help with:*' } },
        { type: 'section', text: { type: 'mrkdwn', text: [
          ':mag: *Deal Intel* — "What\'s happening with [deal]?" / "Which deals are at risk?"',
          ':bar_chart: *Pipeline* — "Am I on track for Q1?" / "Show my pipeline"',
          ':bust_in_silhouette: *Contacts* — "Tell me about [person]" / "When did I last talk to [name]?"',
          ':calendar: *Schedule* — "Show my meetings this week"',
          ':email: *Actions* — "Draft a follow-up for [deal]" / "Create a task to [action]"',
          ':crossed_swords: *Competitive* — "What works against [competitor]?"',
          ':chart_with_upwards_trend: *Coaching* — "How am I doing?" / "How should I handle [objection]?"',
        ].join('\n') } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: 'Just type naturally — I\'ll figure out what you need.' }] },
      ],
    };
  }

  // Greetings
  if (/^(?:hi|hello|hey|morning|afternoon|evening|yo|sup)/i.test(lower)) {
    return { text: "Hey! How can I help? Ask me about your deals, pipeline, or anything sales-related. Type \"help\" to see everything I can do." };
  }

  // Thanks
  if (/^(?:thanks|thank you|thx|cheers|appreciate)/i.test(lower)) {
    return { text: "Happy to help! Let me know if you need anything else." };
  }

  return { text: "I'm your sales copilot — I can help with deals, pipeline, contacts, drafting emails, and more. Type \"help\" to see the full list." };
}

async function getAnthropicKey(supabase: ReturnType<typeof createClient>, orgId: string, userId: string): Promise<string | null> {
  // Try user settings first
  const { data: userSettings } = await supabase
    .from('user_settings')
    .select('settings')
    .eq('user_id', userId)
    .maybeSingle();

  const userKey = (userSettings?.settings as Record<string, unknown>)?.anthropic_api_key as string;
  if (userKey) return userKey;

  // Fall back to env
  return Deno.env.get('ANTHROPIC_API_KEY') || null;
}

async function postSlackMessage(
  botToken: string,
  channel: string,
  threadTs: string,
  text: string
): Promise<void> {
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, text, thread_ts: threadTs, mrkdwn: true }),
  });
}

async function postSlackResponse(
  botToken: string,
  channel: string,
  threadTs: string,
  result: HandlerResult
): Promise<void> {
  const payload: Record<string, unknown> = {
    channel,
    thread_ts: threadTs,
    mrkdwn: true,
  };

  if (result.blocks) {
    payload.blocks = result.blocks;
    // Slack requires text as fallback for notifications
    payload.text = result.text || 'Here\'s what I found:';
  } else {
    payload.text = result.text || "I processed your request but don't have a response to show.";
  }

  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}
