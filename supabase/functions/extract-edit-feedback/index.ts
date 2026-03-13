/**
 * extract-edit-feedback — US-028
 *
 * Analyses edits made by a rep during HITL approval and extracts writing/style
 * preferences as copilot_memories with category='preference'.
 *
 * Trigger: Called fire-and-forget from actionExecutor.approveWithEdits() when
 * a CC item is approved with modifications.
 *
 * Flow:
 *   1. Receives original_content + edited_content + action_type
 *   2. Calls Claude Haiku to compare and infer preferences
 *   3. Upserts into copilot_memories (deduplicates by subject similarity)
 *
 * Auth: JWT-protected (called from actionExecutor via supabase.functions.invoke).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExtractRequest {
  item_id: string;
  user_id: string;
  original_content: Record<string, unknown>;
  edited_content: Record<string, unknown>;
  action_type: string;
}

interface ExtractedPreference {
  subject: string;
  content: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a sales writing coach analysing edits a salesperson made to an AI-drafted action.

Compare the original and edited versions, then extract ACTIONABLE writing preferences the AI should learn for future drafts.

Focus on:
- Tone changes (more/less formal, warmer, more direct)
- Structural changes (shorter paragraphs, bullet points vs prose)
- Vocabulary preferences (words added or removed consistently)
- Content changes (what they removed — too pushy? what they added — more context?)
- Greeting/sign-off preferences
- Length preferences

For each preference, provide:
- subject: A short identifier like "email_tone" or "greeting_style" (prefix with the action_type)
- content: A clear, specific instruction the AI can follow (e.g., "Always use first name in greetings, never 'Dear'")
- confidence: 0.0-1.0 how confident you are this is a genuine preference (not a one-off edit)

Return a JSON array of preferences. Only include high-signal preferences (confidence >= 0.5).
If no meaningful preferences can be extracted, return an empty array: []

Return ONLY the JSON array, no markdown, no explanation.`;

// ---------------------------------------------------------------------------
// AI call
// ---------------------------------------------------------------------------

async function extractPreferences(
  original: Record<string, unknown>,
  edited: Record<string, unknown>,
  actionType: string,
): Promise<ExtractedPreference[]> {
  if (!ANTHROPIC_API_KEY) {
    console.warn('[extract-edit-feedback] ANTHROPIC_API_KEY not set — skipping');
    return [];
  }

  const userMessage = `Action type: ${actionType}

ORIGINAL (AI-generated):
${JSON.stringify(original, null, 2)}

EDITED (by the salesperson):
${JSON.stringify(edited, null, 2)}

Extract writing preferences from these edits.`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      console.error(`[extract-edit-feedback] Anthropic API error ${response.status}: ${errText}`);
      return [];
    }

    const data = await response.json();
    const rawText = data?.content?.[0]?.text ?? '';

    if (!rawText) return [];

    // Strip markdown fences if present
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned) as ExtractedPreference[];

    // Filter low-confidence
    return parsed.filter((p) => p.confidence >= 0.5);
  } catch (err) {
    console.error('[extract-edit-feedback] AI extraction failed:', String(err));
    return [];
  }
}

// ---------------------------------------------------------------------------
// Dedup + upsert into copilot_memories
// ---------------------------------------------------------------------------

async function upsertPreferences(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  preferences: ExtractedPreference[],
): Promise<number> {
  let upserted = 0;

  for (const pref of preferences) {
    try {
      // Check for existing preference with same subject
      const { data: existing } = await supabase
        .from('copilot_memories')
        .select('id, confidence, access_count')
        .eq('user_id', userId)
        .eq('category', 'preference')
        .eq('subject', pref.subject)
        .maybeSingle();

      if (existing) {
        // Update confidence (weighted average) and content
        const newConfidence = Math.min(
          1.0,
          existing.confidence * 0.6 + pref.confidence * 0.4,
        );

        const { error } = await supabase
          .from('copilot_memories')
          .update({
            content: pref.content,
            confidence: newConfidence,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) {
          console.error('[extract-edit-feedback] update error:', error.message);
        } else {
          upserted++;
        }
      } else {
        // Insert new preference memory
        const { error } = await supabase
          .from('copilot_memories')
          .insert({
            user_id: userId,
            category: 'preference',
            subject: pref.subject,
            content: pref.content,
            confidence: pref.confidence,
            context_summary: 'edit_feedback',
            access_count: 0,
          });

        if (error) {
          console.error('[extract-edit-feedback] insert error:', error.message);
        } else {
          upserted++;
        }
      }
    } catch (err) {
      console.error('[extract-edit-feedback] upsert error for subject:', pref.subject, String(err));
    }
  }

  return upserted;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const body = (await req.json()) as ExtractRequest;

    if (!body.item_id || !body.user_id || !body.original_content || !body.edited_content) {
      return errorResponse('Missing required fields: item_id, user_id, original_content, edited_content', req, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log('[extract-edit-feedback] processing', {
      item_id: body.item_id,
      user_id: body.user_id,
      action_type: body.action_type,
    });

    // 1. Extract preferences via Claude
    const preferences = await extractPreferences(
      body.original_content,
      body.edited_content,
      body.action_type,
    );

    if (preferences.length === 0) {
      console.log('[extract-edit-feedback] no preferences extracted');
      return jsonResponse({ extracted: 0, upserted: 0 }, req);
    }

    console.log('[extract-edit-feedback] extracted preferences', {
      count: preferences.length,
      subjects: preferences.map((p) => p.subject),
    });

    // 2. Upsert into copilot_memories
    const upserted = await upsertPreferences(supabase, body.user_id, preferences);

    console.log('[extract-edit-feedback] done', {
      item_id: body.item_id,
      extracted: preferences.length,
      upserted,
    });

    return jsonResponse({ extracted: preferences.length, upserted }, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[extract-edit-feedback] Unhandled error:', message);
    return errorResponse(message, req, 500);
  }
});
