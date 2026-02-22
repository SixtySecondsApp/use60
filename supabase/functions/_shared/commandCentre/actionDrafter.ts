/**
 * Command Centre Action Drafter
 *
 * Calls Claude Haiku to synthesise enrichment context into a brief summary
 * and draft the most appropriate action for a Command Centre item.
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

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

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
// Main export
// ---------------------------------------------------------------------------

/**
 * Calls Claude Haiku to synthesise enrichment context and draft the best action
 * for a Command Centre item. On AI failure, returns a minimal fallback result
 * so downstream processing can continue.
 *
 * Also persists the result back to command_centre_items (status -> 'ready').
 */
export async function synthesiseAndDraft(
  item: CommandCentreItem,
  enrichmentContext: Record<string, unknown>,
): Promise<DraftResult> {
  if (!ANTHROPIC_API_KEY) {
    console.warn('[cc-drafter] ANTHROPIC_API_KEY not set — using fallback result');
    const fallback = buildFallbackResult(item);
    await persistDraftResult(item.id, fallback, null);
    return fallback;
  }

  let result: DraftResult;

  try {
    const messages: ClaudeMessage[] = [
      { role: 'user', content: buildUserPrompt(item, enrichmentContext) },
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 1024,
        system: buildSystemPrompt(),
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const rawText: string = data?.content?.[0]?.text ?? '';

    if (!rawText) {
      throw new Error('Empty response from Claude');
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
