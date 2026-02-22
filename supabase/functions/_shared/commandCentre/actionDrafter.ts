/**
 * Command Centre Action Drafter
 *
 * Synthesises enrichment context into a brief summary and drafts the most
 * appropriate action for a Command Centre item.
 *
 * Model resolution: user intelligence settings → CLAUDE_MODEL env → Haiku default.
 * Supports Anthropic, OpenAI, and Gemini providers via user_ai_feature_settings.
 *
 * Principle: "aggressive on context, conservative on assumptions"
 * — surface facts, don't conclude intent.
 *
 * Story: CC10-005
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { CommandCentreItem, DraftedAction } from './types.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DraftResult {
  enriched_summary: string;
  drafted_action: DraftedAction;
}

interface ResolvedModelConfig {
  provider: 'anthropic' | 'openai' | 'gemini';
  model: string;
  temperature: number;
  maxTokens: number;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DEFAULT_MODEL = Deno.env.get('CLAUDE_MODEL') || 'claude-haiku-4-5-20251001';
const FEATURE_KEY = 'cc_action_drafter';

// ---------------------------------------------------------------------------
// Model resolution — respects user intelligence settings
// ---------------------------------------------------------------------------

/**
 * Resolves the AI model config for the CC action drafter.
 * Resolution order: user_ai_feature_settings → CLAUDE_MODEL env → hardcoded Haiku.
 */
async function resolveModelConfig(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<ResolvedModelConfig> {
  try {
    const { data, error } = await supabase.rpc('get_user_feature_model_config', {
      p_user_id: userId,
      p_feature_key: FEATURE_KEY,
    });

    if (!error && data && data.length > 0) {
      const setting = data[0];
      const provider = setting.provider as ResolvedModelConfig['provider'];

      // Verify we have the API key for the chosen provider
      const keyAvailable =
        (provider === 'anthropic' && ANTHROPIC_API_KEY) ||
        (provider === 'openai' && OPENAI_API_KEY) ||
        (provider === 'gemini' && GEMINI_API_KEY);

      if (keyAvailable) {
        console.log(`[cc-drafter] Using user intelligence setting: ${provider}/${setting.model}`);
        return {
          provider,
          model: setting.model,
          temperature: Number(setting.temperature) || 0.4,
          maxTokens: Number(setting.max_tokens) || 1024,
        };
      }
      console.warn(`[cc-drafter] User selected ${provider} but API key missing — falling back`);
    }
  } catch (err) {
    // RPC may not exist in all environments — fall through silently
    console.warn('[cc-drafter] resolveModelConfig RPC failed:', String(err));
  }

  // Fallback: env var or hardcoded default (always Anthropic)
  return {
    provider: 'anthropic',
    model: DEFAULT_MODEL,
    temperature: 0.4,
    maxTokens: 1024,
  };
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return `You are a sales intelligence assistant helping a rep take the next best action.

Your task:
1. Write a 2-3 sentence enriched_summary that synthesises the enrichment context into clear, factual intelligence. State what you know — do NOT infer intent or make assumptions about the other party.
2. Suggest the single most appropriate action based on the item type and context.

Action types (choose one):
- send_email: Draft an email to the contact
- update_crm: Suggest specific field updates for a deal/contact record
- create_task: Create a follow-up task with a due date
- schedule_meeting: Propose meeting times

Respond with valid JSON only. No markdown, no explanation outside the JSON object.

JSON schema:
{
  "enriched_summary": "<2-3 sentence factual summary>",
  "action_type": "send_email" | "update_crm" | "create_task" | "schedule_meeting",
  "display_text": "<short human-readable description of the action, max 80 chars>",
  "payload": {
    "to": "<email address if send_email>",
    "subject": "<email subject if send_email>",
    "body": "<email body draft if send_email — 3-5 sentences max>",
    "entity": "<deal or contact name if update_crm>",
    "field_updates": { "<field>": "<value>" },
    "suggested_times": ["<ISO datetime>"],
    "duration_minutes": 30
  },
  "editable_fields": ["<field names the rep will likely want to customise>"],
  "confidence": 0.0,
  "reasoning": "<1 sentence explaining why this action was chosen>"
}

Rules:
- payload fields are optional — only include what is relevant to the action_type
- editable_fields must reference actual payload keys
- confidence is a float 0.0-1.0 based on how well the context supports the action
- enriched_summary must cite only facts present in the context — no hallucination`;
}

function buildUserPrompt(item: CommandCentreItem, enrichmentContext: Record<string, unknown>): string {
  const contextSummary = JSON.stringify(enrichmentContext, null, 2);

  return `Item type: ${item.item_type}
Title: ${item.title}
${item.summary ? `Initial summary: ${item.summary}` : ''}
Urgency: ${item.urgency}
${item.due_date ? `Due: ${item.due_date}` : ''}

Original context:
${JSON.stringify(item.context, null, 2)}

Enrichment context (all sources combined):
${contextSummary}

Synthesise the enrichment context and draft the best action.`;
}

// ---------------------------------------------------------------------------
// Fallback when AI call fails
// ---------------------------------------------------------------------------

function buildFallbackResult(item: CommandCentreItem): DraftResult {
  const actionTypeMap: Record<string, DraftedAction['type']> = {
    follow_up: 'send_email',
    outreach: 'send_email',
    crm_update: 'update_crm',
    deal_action: 'update_crm',
    review: 'create_task',
    meeting_prep: 'schedule_meeting',
    coaching: 'create_task',
    alert: 'create_task',
    insight: 'create_task',
  };

  const actionType = actionTypeMap[item.item_type] ?? 'create_task';

  const fallbackAction: DraftedAction = {
    type: actionType,
    payload: {},
    display_text: `Review and action: ${item.title}`,
    editable_fields: [],
    confidence: 0.1,
    reasoning: 'AI synthesis unavailable — manual review required.',
  };

  return {
    enriched_summary: item.summary ?? item.title,
    drafted_action: fallbackAction,
  };
}

// ---------------------------------------------------------------------------
// Provider-specific AI calls
// ---------------------------------------------------------------------------

async function callAnthropic(
  config: ResolvedModelConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data?.content?.[0]?.text ?? '';
}

async function callOpenAI(
  config: ResolvedModelConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

async function callGemini(
  config: ResolvedModelConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: {
          temperature: config.temperature,
          maxOutputTokens: config.maxTokens,
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callProvider(
  config: ResolvedModelConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  switch (config.provider) {
    case 'anthropic':
      return callAnthropic(config, systemPrompt, userPrompt);
    case 'openai':
      return callOpenAI(config, systemPrompt, userPrompt);
    case 'gemini':
      return callGemini(config, systemPrompt, userPrompt);
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Synthesises enrichment context and drafts the best action for a Command
 * Centre item. Respects user intelligence settings (provider + model).
 * On AI failure, returns a minimal fallback result so downstream continues.
 *
 * Also persists the result back to command_centre_items (status -> 'ready').
 */
export async function synthesiseAndDraft(
  item: CommandCentreItem,
  enrichmentContext: Record<string, unknown>,
): Promise<DraftResult> {
  // We need at least one provider key
  if (!ANTHROPIC_API_KEY && !OPENAI_API_KEY && !GEMINI_API_KEY) {
    console.warn('[cc-drafter] No AI API keys configured — using fallback result');
    const fallback = buildFallbackResult(item);
    await persistDraftResult(item.id, fallback, null);
    return fallback;
  }

  let result: DraftResult;

  try {
    // Resolve model from user intelligence settings
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const modelConfig = await resolveModelConfig(supabase, item.user_id);

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(item, enrichmentContext);

    const rawText = await callProvider(modelConfig, systemPrompt, userPrompt);

    if (!rawText) {
      throw new Error(`Empty response from ${modelConfig.provider}`);
    }

    // Strip any accidental markdown code fences before parsing
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    const draftedAction: DraftedAction = {
      type: parsed.action_type as DraftedAction['type'],
      payload: parsed.payload ?? {},
      display_text: parsed.display_text ?? `Action for: ${item.title}`,
      editable_fields: parsed.editable_fields ?? [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      reasoning: parsed.reasoning ?? '',
    };

    result = {
      enriched_summary: parsed.enriched_summary ?? item.summary ?? item.title,
      drafted_action: draftedAction,
    };

    console.log('[cc-drafter] AI synthesis complete', {
      item_id: item.id,
      provider: modelConfig.provider,
      model: modelConfig.model,
      action_type: draftedAction.type,
      confidence: draftedAction.confidence,
    });
  } catch (err) {
    console.error('[cc-drafter] AI synthesis failed — using fallback', String(err), {
      item_id: item.id,
      item_type: item.item_type,
    });
    result = buildFallbackResult(item);
  }

  await persistDraftResult(item.id, result, null);
  return result;
}

// ---------------------------------------------------------------------------
// Persistence helper
// ---------------------------------------------------------------------------

/**
 * Writes the drafted_action + enriched summary back to the item row
 * and transitions status to 'ready'. Errors are swallowed — the caller
 * already has the result object and can proceed.
 */
async function persistDraftResult(
  itemId: string,
  result: DraftResult,
  confidenceScore: number | null,
): Promise<void> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error } = await supabase
      .from('command_centre_items')
      .update({
        summary: result.enriched_summary,
        drafted_action: result.drafted_action,
        confidence_score: confidenceScore,
        status: 'ready',
        enriched_at: new Date().toISOString(),
      })
      .eq('id', itemId);

    if (error) {
      console.error('[cc-drafter] persistDraftResult: update failed', error.message, { item_id: itemId });
    } else {
      console.log('[cc-drafter] persistDraftResult: item updated to ready', { item_id: itemId });
    }
  } catch (err) {
    console.error('[cc-drafter] persistDraftResult: unexpected error', String(err), { item_id: itemId });
  }
}

/**
 * Persists the drafted result AND a confidence score + factors in one update.
 * Called by the orchestration layer after confidence scoring is complete.
 */
export async function persistDraftWithConfidence(
  itemId: string,
  result: DraftResult,
  confidenceScore: number,
  confidenceFactors: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error } = await supabase
      .from('command_centre_items')
      .update({
        summary: result.enriched_summary,
        drafted_action: result.drafted_action,
        confidence_score: confidenceScore,
        confidence_factors: confidenceFactors,
        status: 'ready',
        enriched_at: new Date().toISOString(),
      })
      .eq('id', itemId);

    if (error) {
      console.error('[cc-drafter] persistDraftWithConfidence: update failed', error.message, { item_id: itemId });
    } else {
      console.log('[cc-drafter] persistDraftWithConfidence: item ready', {
        item_id: itemId,
        confidence_score: confidenceScore,
      });
    }
  } catch (err) {
    console.error('[cc-drafter] persistDraftWithConfidence: unexpected error', String(err), { item_id: itemId });
  }
}
