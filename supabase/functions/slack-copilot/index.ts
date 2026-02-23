// supabase/functions/slack-copilot/index.ts
// Main Slack copilot edge function — orchestrates intent → context → handler → response (PRD-22, CONV-008)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { resolveModel } from '../_shared/modelRouter.ts';
import { assembleContext } from '../_shared/slack-copilot/contextAssembler.ts';
import { getOrCreateThread, saveMessage, loadThreadHistory, updateThreadContext, extractThreadContext } from '../_shared/slack-copilot/threadMemory.ts';
import { handleDealQuery } from '../_shared/slack-copilot/handlers/dealQueryHandler.ts';
import { handlePipelineQuery } from '../_shared/slack-copilot/handlers/pipelineQueryHandler.ts';
import { handleHistoryQuery } from '../_shared/slack-copilot/handlers/historyQueryHandler.ts';
import { handleContactQuery } from '../_shared/slack-copilot/handlers/contactQueryHandler.ts';
import { handleActionRequest } from '../_shared/slack-copilot/handlers/actionHandler.ts';
import { handleCompetitiveQuery } from '../_shared/slack-copilot/handlers/competitiveQueryHandler.ts';
import { handleCoachingQuery } from '../_shared/slack-copilot/handlers/coachingQueryHandler.ts';
import { checkRateLimit, trackUsage } from '../_shared/slack-copilot/rateLimiter.ts';
import { rateLimitedResponse, generalErrorResponse, helpResponse } from '../_shared/slack-copilot/templates/errorStates.ts';
import type { HandlerResult, CopilotIntentType, ClassifiedIntent, ExtractedEntities } from '../_shared/slack-copilot/types.ts';

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
      await postSlackResponse(botToken, channelId, threadTs, { blocks: rateLimitedResponse(rateLimitResult.message!) });
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

    // Resolve model via modelRouter (circuit breaker + fallback)
    const modelResolution = await resolveModel(supabase, {
      feature: 'copilot',
      intelligenceTier: 'low',
      userId,
      orgId,
    }).catch((err) => {
      console.warn('[slack-copilot] resolveModel failed, using hardcoded fallback:', err);
      return { modelId: 'claude-haiku-4-5-20251001', provider: 'anthropic', creditCost: 0, maxTokens: 4096, wasFallback: false, traceId: '' };
    });

    console.log(`[slack-copilot] Model resolved: ${modelResolution.modelId} (wasFallback=${modelResolution.wasFallback})`);

    // Classify intent via route-message
    const intent = await classifyViaRouteMessage(text, orgId, userId, threadTs);
    console.log(`[slack-copilot] Intent: ${intent.type} (${intent.confidence}) for user ${userId}`);

    // Assemble context based on intent
    const queryContext = await assembleContext(supabase, userId, orgId, intent);

    // Route to handler
    let result: HandlerResult;
    try {
      result = await routeToHandler(intent.type, intent, queryContext, anthropicApiKey, modelResolution.modelId);
    } catch (err) {
      console.error('[slack-copilot] Handler error:', err);
      result = { blocks: generalErrorResponse() };
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

    // Extract and persist thread context to conversation_context (fire-and-forget)
    // Runs when thread reaches 10+ messages or has gone quiet for 15+ minutes
    const updatedThreadState = { ...threadState, messageCount: threadState.messageCount + 1 };
    extractThreadContext(supabase, updatedThreadState, threadHistory).catch((err) => {
      console.warn('[slack-copilot] extractThreadContext failed (non-critical):', err);
    });

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

/**
 * Call route-message to classify intent, then map the response to a ClassifiedIntent.
 * Falls back to regex-based classification if route-message is unavailable.
 */
async function classifyViaRouteMessage(
  message: string,
  orgId: string,
  userId: string,
  threadId: string | undefined
): Promise<ClassifiedIntent> {
  try {
    const routeResponse = await fetch(`${supabaseUrl}/functions/v1/route-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        message,
        source: 'slack_copilot',
        org_id: orgId,
        user_id: userId,
        context: { thread_id: threadId },
      }),
    });

    if (!routeResponse.ok) {
      console.warn(`[slack-copilot] route-message returned ${routeResponse.status}, falling back to regex`);
      return classifyWithRegex(message);
    }

    const routeData = await routeResponse.json() as {
      route: string;
      skill_key?: string;
      confidence: number;
      matched_by: string;
    };

    return mapRouteToIntent(message, routeData.route, routeData.confidence);
  } catch (err) {
    console.error('[slack-copilot] route-message call failed, falling back to regex:', err);
    return classifyWithRegex(message);
  }
}

/**
 * Map a route-message route string to a CopilotIntentType + entities.
 * Skill keys may encode intent (e.g. "deal-query", "pipeline-summary").
 * Falls back to regex for unknown skill keys.
 */
function mapRouteToIntent(
  message: string,
  route: string,
  confidence: number
): ClassifiedIntent {
  const entities: ExtractedEntities = { rawQuery: message };

  if (route === 'general') {
    return classifyWithRegex(message);
  }

  const key = route.toLowerCase();
  let intentType: CopilotIntentType;

  if (/deal/.test(key)) {
    intentType = 'deal_query';
    const nameMatch = message.match(/(?:the|my|with|for|about)\s+([A-Z][a-zA-Z\s]+?)(?:\s+deal|\s+account|\?|$)/);
    if (nameMatch) entities.dealName = nameMatch[1].trim();
  } else if (/pipeline|quota|forecast/.test(key)) {
    intentType = 'pipeline_query';
  } else if (/history|meeting|timeline/.test(key)) {
    intentType = 'history_query';
    const nameMatch = message.match(/(?:to|with|about)\s+([A-Z][a-zA-Z\s]+?)(?:\?|$|\.)/);
    if (nameMatch) entities.contactName = nameMatch[1].trim();
  } else if (/contact|person|company/.test(key)) {
    intentType = 'contact_query';
    const nameMatch = message.match(/(?:about|on|is|for)\s+([A-Z][a-zA-Z\s]+?)(?:\?|$|\.)/);
    if (nameMatch) entities.contactName = nameMatch[1].trim();
  } else if (/action|email|task|schedule/.test(key)) {
    intentType = 'action_request';
    if (/email|follow[- ]?up|message/i.test(message)) entities.actionType = 'draft_email';
    else if (/task|todo|reminder/i.test(message)) entities.actionType = 'create_task';
    else if (/meeting|call|calendar/i.test(message)) entities.actionType = 'schedule_meeting';
  } else if (/compet|battle|position/.test(key)) {
    intentType = 'competitive_query';
    const nameMatch = message.match(/(?:against|vs\.?|versus|about|with)\s+([A-Z][a-zA-Z\s]+?)(?:\?|$|\.)/);
    if (nameMatch) entities.competitorName = nameMatch[1].trim();
  } else if (/coach|perform|tip|advice/.test(key)) {
    intentType = 'coaching_query';
  } else {
    // Unknown skill key — fall back to regex
    return classifyWithRegex(message);
  }

  return { type: intentType, confidence, entities };
}

/**
 * Regex-based fallback classification (mirrors intentClassifier.ts logic)
 */
function classifyWithRegex(message: string): ClassifiedIntent {
  const lower = message.toLowerCase().trim();
  const entities: ExtractedEntities = { rawQuery: message };

  const dealPatterns = [
    /(?:what(?:'s| is) happening|status|update|progress|how(?:'s| is)).*(?:deal|opportunity|opp)/i,
    /(?:tell me about|show me|give me).*deal/i,
    /(?:what|how).*(?:the|my).*(?:deal|account|opp)/i,
  ];
  for (const p of dealPatterns) {
    if (message.match(p)) {
      const nameMatch = message.match(/(?:the|my|with|for|about)\s+([A-Z][a-zA-Z\s]+?)(?:\s+deal|\s+account|\?|$)/);
      if (nameMatch) entities.dealName = nameMatch[1].trim();
      return { type: 'deal_query', confidence: 0.75, entities };
    }
  }

  if (/(?:pipeline|quota|forecast|target|on track|q[1-4]|quarter|revenue|numbers|am i)/i.test(lower)) {
    return { type: 'pipeline_query', confidence: 0.7, entities };
  }

  if (/(?:when did|last (?:time|meeting|call|email)|history|talked? to|spoke? (?:to|with)|met with)/i.test(lower)) {
    const nameMatch = message.match(/(?:to|with|about)\s+([A-Z][a-zA-Z\s]+?)(?:\?|$|\.)/);
    if (nameMatch) entities.contactName = nameMatch[1].trim();
    return { type: 'history_query', confidence: 0.75, entities };
  }

  if (/(?:who is|tell me about|what do we know|info on|details (?:on|about|for))\s/i.test(lower)) {
    const nameMatch = message.match(/(?:about|on|is|for)\s+([A-Z][a-zA-Z\s]+?)(?:\?|$|\.)/);
    if (nameMatch) entities.contactName = nameMatch[1].trim();
    return { type: 'contact_query', confidence: 0.7, entities };
  }

  if (/(?:draft|write|compose|send|create|schedule|book|set up|make)\s/i.test(lower)) {
    if (/(?:email|follow[- ]?up|message|note)/i.test(lower)) entities.actionType = 'draft_email';
    else if (/(?:task|todo|reminder|action item)/i.test(lower)) entities.actionType = 'create_task';
    else if (/(?:meeting|call|calendar)/i.test(lower)) entities.actionType = 'schedule_meeting';
    return { type: 'action_request', confidence: 0.7, entities };
  }

  if (/(?:competitor|compete|vs|versus|against|battle|positioning|differentiat)/i.test(lower)) {
    const nameMatch = message.match(/(?:against|vs\.?|versus|about|with)\s+([A-Z][a-zA-Z\s]+?)(?:\?|$|\.)/);
    if (nameMatch) entities.competitorName = nameMatch[1].trim();
    return { type: 'competitive_query', confidence: 0.7, entities };
  }

  if (/(?:how (?:am i|should i|can i|do i)|improve|coaching|tip|advice|handle|objection|performance|metric)/i.test(lower)) {
    const objMatch = message.match(/(?:handle|respond to|overcome)\s+(?:the\s+)?(.+?)(?:\?|$|\.)/i);
    if (objMatch) entities.objectionType = objMatch[1].trim();
    return { type: 'coaching_query', confidence: 0.65, entities };
  }

  if (/(?:meetings?|calendar|schedule)\s+(?:this|next|today|tomorrow)/i.test(lower)) {
    return { type: 'history_query', confidence: 0.7, entities };
  }

  if (/(?:at risk|risky|risk|danger|slipping|stalling)/i.test(lower)) {
    return { type: 'deal_query', confidence: 0.7, entities };
  }

  return { type: 'general_chat', confidence: 0.3, entities };
}

async function routeToHandler(
  intentType: CopilotIntentType,
  intent: Parameters<typeof handleDealQuery>[0],
  queryContext: Parameters<typeof handleDealQuery>[1],
  anthropicApiKey: string | null,
  modelId?: string
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
      return handleActionRequest(intent, queryContext, anthropicApiKey, modelId);
    case 'competitive_query':
      return handleCompetitiveQuery(intent, queryContext);
    case 'coaching_query':
      return handleCoachingQuery(intent, queryContext, anthropicApiKey, modelId);
    case 'general_chat':
      return handleGeneralChat(intent, anthropicApiKey);
    default:
      return { text: "Unknown command. Type 'help' for available actions." };
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
    return { blocks: helpResponse() };
  }

  // Greetings
  if (/^(?:hi|hello|hey|morning|afternoon|evening|yo|sup)/i.test(lower)) {
    return { text: "Hey! What do you need? Ask about deals, pipeline, or type 'help'." };
  }

  // Thanks
  if (/^(?:thanks|thank you|thx|cheers|appreciate)/i.test(lower)) {
    return { text: "Happy to help! Let me know if you need anything else." };
  }

  return { text: "Sales copilot active. Ask about deals, pipeline, contacts, or type 'help'." };
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
