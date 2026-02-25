/**
 * CC-017: Conversational Copilot — Web/Demo API
 *
 * Same intent classification, entity resolution, context assembly, and
 * response generation as the Slack copilot, but returns JSON for the
 * web UI instead of posting to Slack.
 *
 * POST /conversational-copilot
 * Body: { message, session_id }
 *
 * Response: {
 *   response: { markdown, intent, confidence, entities_resolved, data_sources_used, credits_consumed, generation_time_ms, model_used },
 *   session: { turn_count, total_credits }
 * }
 *
 * Auth: JWT-protected. Deploy with --no-verify-jwt on staging (ES256 issue).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { assembleContext } from '../_shared/slack-copilot/contextAssembler.ts';
import { getOrCreateThread, loadThreadHistory, saveMessage, appendTurn, trackIntentAndCredits, getActiveEntities, updateActiveEntities } from '../_shared/slack-copilot/threadMemory.ts';
import { resolveConversationalEntities } from '../_shared/slack-copilot/entityResolver.ts';
import { handleDealQuery } from '../_shared/slack-copilot/handlers/dealQueryHandler.ts';
import { handlePipelineQuery } from '../_shared/slack-copilot/handlers/pipelineQueryHandler.ts';
import { handleHistoryQuery } from '../_shared/slack-copilot/handlers/historyQueryHandler.ts';
import { handleContactQuery } from '../_shared/slack-copilot/handlers/contactQueryHandler.ts';
import { handleActionRequest } from '../_shared/slack-copilot/handlers/actionHandler.ts';
import { handleCompetitiveQuery } from '../_shared/slack-copilot/handlers/competitiveQueryHandler.ts';
import { handleCoachingQuery } from '../_shared/slack-copilot/handlers/coachingQueryHandler.ts';
import { handleMetricsQuery } from '../_shared/slack-copilot/handlers/metricsQueryHandler.ts';
import { handleRiskQuery } from '../_shared/slack-copilot/handlers/riskQueryHandler.ts';
import { getCreditCost } from '../_shared/slack-copilot/rateLimiter.ts';
import { helpResponse } from '../_shared/slack-copilot/templates/errorStates.ts';
import { getConfidenceRouting } from '../_shared/slack-copilot/types.ts';
import type { HandlerResult, CopilotIntentType, ClassifiedIntent, ExtractedEntities } from '../_shared/slack-copilot/types.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ---- Block Kit → Markdown conversion ----------------------------------------

function blocksToMarkdown(blocks: unknown[]): string {
  return blocks
    .map((block) => {
      const b = block as Record<string, unknown>;
      if (b.type === 'header') {
        const t = b.text as Record<string, string> | undefined;
        return `## ${t?.text ?? ''}`;
      }
      if (b.type === 'section') {
        const lines: string[] = [];
        const t = b.text as Record<string, string> | undefined;
        if (t?.text) lines.push(t.text);
        const fields = b.fields as Array<Record<string, string>> | undefined;
        if (fields) lines.push(...fields.map((f) => f.text ?? ''));
        return lines.join('\n');
      }
      if (b.type === 'divider') return '---';
      if (b.type === 'context') {
        const elements = b.elements as Array<Record<string, string>> | undefined;
        return elements?.map((e) => e.text ?? '').join(' · ') ?? '';
      }
      if (b.type === 'actions') {
        const elements = b.elements as Array<Record<string, unknown>> | undefined;
        return (
          elements
            ?.map((e) => {
              const text = e.text as Record<string, string> | undefined;
              return `[${text?.text ?? ''}]`;
            })
            .join(' ') ?? ''
        );
      }
      return '';
    })
    .filter(Boolean)
    .join('\n\n');
}

// ---- Intent classification --------------------------------------------------

async function classifyIntent(
  message: string,
  orgId: string,
  userId: string,
  sessionId: string,
  threadHistory: Array<{ role: string; content: string }>
): Promise<ClassifiedIntent> {
  const threadSummary = threadHistory
    .slice(-5)
    .map((m) => `${m.role}: ${m.content.substring(0, 200)}`)
    .join('\n');

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/route-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        message,
        source: 'slack_conversational',
        org_id: orgId,
        user_id: userId,
        thread_summary: threadSummary,
        context: { thread_id: sessionId },
      }),
    });

    if (!resp.ok) {
      console.warn(`[conversational-copilot] route-message ${resp.status}, falling back to regex`);
      return classifyWithRegex(message);
    }

    const data = await resp.json() as {
      intent?: string;
      confidence?: number;
      entities?: {
        deal_name?: string;
        contact_name?: string;
        company_name?: string;
        time_reference?: string;
        action_type?: string;
      };
      requires_clarification?: boolean;
      clarification_question?: string;
      route?: string;
    };

    if (data.intent) {
      return {
        type: data.intent as CopilotIntentType,
        confidence: data.confidence ?? 0.5,
        entities: {
          dealName: data.entities?.deal_name,
          contactName: data.entities?.contact_name,
          companyName: data.entities?.company_name,
          time_reference: data.entities?.time_reference,
          actionType: data.entities?.action_type as ExtractedEntities['actionType'],
          rawQuery: message,
        },
        reasoning: data.requires_clarification ? data.clarification_question : undefined,
      };
    }

    return classifyWithRegex(message);
  } catch (err) {
    console.error('[conversational-copilot] route-message failed, falling back to regex:', err);
    return classifyWithRegex(message);
  }
}

function classifyWithRegex(message: string): ClassifiedIntent {
  const lower = message.toLowerCase().trim();
  const entities: ExtractedEntities = { rawQuery: message };

  if (/(?:what(?:'s| is) happening|status|update|progress|how(?:'s| is)).*(?:deal|opportunity|opp)/i.test(message) ||
      /(?:tell me about|show me|give me).*deal/i.test(message)) {
    const m = message.match(/(?:the|my|with|for|about)\s+([A-Z][a-zA-Z\s]+?)(?:\s+deal|\s+account|\?|$)/);
    if (m) entities.dealName = m[1].trim();
    return { type: 'deal_query', confidence: 0.75, entities };
  }
  if (/(?:pipeline|quota|forecast|target|on track|q[1-4]|quarter|revenue|numbers|am i)/i.test(lower)) {
    return { type: 'pipeline_query', confidence: 0.7, entities };
  }
  if (/(?:when did|last (?:time|meeting|call|email)|history|talked? to|spoke? (?:to|with)|met with)/i.test(lower)) {
    const m = message.match(/(?:to|with|about)\s+([A-Z][a-zA-Z\s]+?)(?:\?|$|\.)/);
    if (m) entities.contactName = m[1].trim();
    return { type: 'history_query', confidence: 0.75, entities };
  }
  if (/(?:who is|tell me about|what do we know|info on|details (?:on|about|for))\s/i.test(lower)) {
    const m = message.match(/(?:about|on|is|for)\s+([A-Z][a-zA-Z\s]+?)(?:\?|$|\.)/);
    if (m) entities.contactName = m[1].trim();
    return { type: 'contact_query', confidence: 0.7, entities };
  }
  if (/(?:draft|write|compose|send|create|schedule|book|set up|make)\s/i.test(lower)) {
    if (/(?:email|follow[- ]?up|message|note)/i.test(lower)) entities.actionType = 'draft_email';
    else if (/(?:task|todo|reminder|action item)/i.test(lower)) entities.actionType = 'create_task';
    else if (/(?:meeting|call|calendar)/i.test(lower)) entities.actionType = 'schedule_meeting';
    return { type: 'action_request', confidence: 0.7, entities };
  }
  if (/(?:competitor|compete|vs|versus|against|battle|positioning|differentiat)/i.test(lower)) {
    const m = message.match(/(?:against|vs\.?|versus|about|with)\s+([A-Z][a-zA-Z\s]+?)(?:\?|$|\.)/);
    if (m) entities.competitorName = m[1].trim();
    return { type: 'competitive_query', confidence: 0.7, entities };
  }
  if (/(?:at risk|risky|risk|danger|slipping|stalling)/i.test(lower)) {
    return { type: 'risk_query', confidence: 0.7, entities };
  }
  if (/(?:how (?:am i|should i|can i|do i)|improve|coaching|tip|advice|handle|objection|performance|metric)/i.test(lower)) {
    return { type: 'coaching_query', confidence: 0.65, entities };
  }
  return { type: 'general_chat', confidence: 0.3, entities };
}

// ---- Handler routing --------------------------------------------------------

async function routeToHandler(
  intentType: CopilotIntentType,
  intent: ClassifiedIntent,
  queryContext: Parameters<typeof handleDealQuery>[1],
  anthropicApiKey: string | null,
  modelId: string
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
    case 'metrics_query':
      return handleMetricsQuery(queryContext, intent.entities, '', '', null);
    case 'risk_query':
      return handleRiskQuery(intent, queryContext);
    case 'competitive_query':
      return handleCompetitiveQuery(intent, queryContext);
    case 'coaching_query':
      return handleCoachingQuery(intent, queryContext, anthropicApiKey, modelId);
    case 'action_request':
    case 'draft_email':
    case 'draft_check_in':
    case 'update_crm':
    case 'create_task':
      return handleActionRequest(intent, queryContext, anthropicApiKey, modelId);
    case 'help':
      return { blocks: helpResponse() };
    case 'trigger_prep':
      return { text: 'Starting meeting prep — briefing will be ready shortly.' };
    case 'trigger_enrichment':
      return { text: 'Starting research — results will appear in this thread.' };
    case 'schedule_meeting':
      return { text: 'Calendar scheduling coming soon. Use the app to find available slots.' };
    case 'feedback':
      return { text: 'Thanks for the feedback!' };
    case 'clarification_needed':
      return { text: intent.reasoning ?? "Could you be more specific? Try mentioning a deal name, contact, or what you'd like me to do." };
    case 'general_chat':
    case 'general':
    default:
      return handleGeneralChat(intent);
  }
}

function handleGeneralChat(intent: ClassifiedIntent): HandlerResult {
  const lower = (intent.entities.rawQuery ?? '').toLowerCase();
  if (/^(?:help|what can you do|\?|commands?)$/i.test(lower)) return { blocks: helpResponse() };
  if (/^(?:hi|hello|hey|morning|afternoon|evening|yo|sup)/i.test(lower)) {
    return { text: "Hey! Ask about deals, pipeline, or type 'help'." };
  }
  if (/^(?:thanks|thank you|thx|cheers|appreciate)/i.test(lower)) {
    return { text: 'Happy to help! Let me know if you need anything else.' };
  }
  return { text: "Sales copilot active. Ask about deals, pipeline, contacts, or type 'help'." };
}

// ---- Main handler -----------------------------------------------------------

serve(async (req: Request) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // ---- Auth ---------------------------------------------------------------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ---- Request body -------------------------------------------------------
    let body: { message?: unknown; session_id?: unknown };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { message, session_id } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return new Response(JSON.stringify({ error: 'message is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!session_id || typeof session_id !== 'string') {
      return new Response(JSON.stringify({ error: 'session_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---- Org membership -----------------------------------------------------
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    const orgId: string | null = membership?.org_id ?? null;
    if (!orgId) {
      return new Response(JSON.stringify({ error: 'No organization found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startTime = Date.now();

    // ---- Session / thread state ---------------------------------------------
    // Reuse slack_copilot_threads with channel='demo' and thread_ts=session_id
    const threadState = await getOrCreateThread(supabase, {
      orgId,
      userId: user.id,
      slackTeamId: 'demo',
      slackChannelId: 'demo',
      slackThreadTs: session_id,
    });

    const threadHistory = await loadThreadHistory(supabase, threadState.id);
    await saveMessage(supabase, threadState.id, { role: 'user', content: message });

    // ---- AI key + model -----------------------------------------------------
    const { data: userSettings } = await supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', user.id)
      .maybeSingle();

    const anthropicApiKey: string | null =
      (userSettings?.settings as Record<string, unknown>)?.anthropic_api_key as string | null
      ?? Deno.env.get('ANTHROPIC_API_KEY')
      ?? null;

    const modelId = 'claude-haiku-4-5-20251001';

    // ---- Intent classification ----------------------------------------------
    const intent = await classifyIntent(message, orgId, user.id, session_id, threadHistory);
    console.log(`[conversational-copilot] Intent: ${intent.type} (${intent.confidence}) user=${user.id}`);

    // ---- Entity resolution --------------------------------------------------
    const activeEntities = await getActiveEntities(threadState.id, supabase);
    const entityResult = await resolveConversationalEntities(
      {
        dealName: intent.entities.dealName,
        contactName: intent.entities.contactName,
        companyName: intent.entities.companyName,
      },
      user.id,
      orgId,
      supabase,
      activeEntities,
      message,
    );

    // If disambiguation needed, return the prompt as markdown (no Block Kit in web UI)
    if (entityResult.needsDisambiguation) {
      const disambigText =
        `I found multiple matches. Could you be more specific? Mention the exact deal or contact name.`;
      await saveMessage(supabase, threadState.id, {
        role: 'assistant',
        content: disambigText,
        intent: 'clarification_needed',
      });
      const creditCost = getCreditCost('clarification_needed');
      return new Response(
        JSON.stringify({
          response: {
            markdown: disambigText,
            intent: 'clarification_needed',
            confidence: intent.confidence,
            entities_resolved: [],
            data_sources_used: [],
            credits_consumed: creditCost,
            generation_time_ms: Date.now() - startTime,
            model_used: modelId,
          },
          session: {
            turn_count: threadState.messageCount + 1,
            total_credits: creditCost,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Persist resolved entities on thread for multi-turn context
    await updateActiveEntities(
      threadState.id,
      {
        active_deal_id: entityResult.resolved.deal?.id,
        active_contact_id: entityResult.resolved.contact?.id,
        active_company_id: entityResult.resolved.company?.id,
      },
      supabase,
    );

    // ---- Confidence routing -------------------------------------------------
    const confidenceRouting = getConfidenceRouting(intent.confidence);

    // ---- Context assembly + handler -----------------------------------------
    const queryContext = await assembleContext(supabase, user.id, orgId, intent);

    let result: HandlerResult;
    if (confidenceRouting === 'ask_first') {
      result = {
        text: intent.reasoning ??
          "I'm not sure what you're asking. Could you rephrase? Try asking about a specific deal, contact, or action.",
      };
    } else {
      try {
        result = await routeToHandler(intent.type, intent, queryContext, anthropicApiKey, modelId);
      } catch (err) {
        console.error('[conversational-copilot] Handler error:', err);
        result = { text: "Sorry, I ran into a problem. Please try again." };
      }

      // Prefix for medium-confidence responses
      if (confidenceRouting === 'with_clarification' && result.text) {
        const prefix = intent.entities.dealName
          ? `I think you're asking about ${intent.entities.dealName} — `
          : intent.entities.contactName
          ? `I think you're asking about ${intent.entities.contactName} — `
          : '';
        if (prefix) result.text = prefix + result.text;
      }
    }

    // ---- Convert Block Kit → Markdown ---------------------------------------
    let responseMarkdown: string;
    if (result.blocks && result.blocks.length > 0) {
      responseMarkdown = blocksToMarkdown(result.blocks as unknown[]);
    } else {
      responseMarkdown = result.text ?? 'No response generated.';
    }

    // ---- Persist assistant turn ---------------------------------------------
    const responseText = result.text ?? (result.blocks ? '[Block Kit response]' : 'No response');
    await saveMessage(supabase, threadState.id, {
      role: 'assistant',
      content: responseText,
      intent: intent.type,
      metadata: { confidence: intent.confidence, entities: intent.entities },
    });

    await appendTurn(threadState.id, { role: 'user', content: message, intent: intent.type, timestamp: new Date().toISOString() }, supabase);
    await appendTurn(threadState.id, { role: 'assistant', content: responseText, intent: intent.type, timestamp: new Date().toISOString() }, supabase);

    const creditCost = getCreditCost(intent.type);
    await trackIntentAndCredits(threadState.id, intent.type, creditCost, supabase);

    // ---- Analytics (fire-and-forget) ----------------------------------------
    const responseTimeMs = Date.now() - startTime;

    supabase.from('slack_copilot_analytics').insert({
      org_id: orgId,
      user_id: user.id,
      thread_ts: session_id,
      intent: intent.type,
      entities: intent.entities,
      confidence: intent.confidence,
      data_sources_used: [],
      credits_consumed: creditCost,
      response_time_ms: responseTimeMs,
      model_used: modelId,
    }).catch(() => { /* non-critical */ });

    // Build resolved entity name list for response metadata
    const entitiesResolved: string[] = [
      entityResult.resolved.deal?.name,
      entityResult.resolved.contact?.name,
      entityResult.resolved.company?.name,
    ].filter((n): n is string => Boolean(n));

    const turnCount = threadState.messageCount + 2; // user + assistant

    console.log(`[conversational-copilot] ${intent.type} resolved in ${responseTimeMs}ms`);

    return new Response(
      JSON.stringify({
        response: {
          markdown: responseMarkdown,
          intent: intent.type,
          confidence: intent.confidence,
          entities_resolved: entitiesResolved,
          data_sources_used: [],
          credits_consumed: creditCost,
          generation_time_ms: responseTimeMs,
          model_used: modelId,
        },
        session: {
          turn_count: turnCount,
          total_credits: creditCost,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[conversational-copilot] Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
