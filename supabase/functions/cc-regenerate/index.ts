/**
 * cc-regenerate — Regenerate a CC item's email draft with user feedback
 *
 * Takes the existing drafted_action + user feedback instructions and asks AI
 * to rewrite the email. Also stores feedback as a style preference for future drafts.
 *
 * POST { item_id, feedback, current_draft? }
 * Returns { drafted_action } with the regenerated email
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders } from '../_shared/corsHelper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });

    const { item_id, feedback } = await req.json();
    if (!item_id || !feedback) {
      return new Response(JSON.stringify({ error: 'item_id and feedback are required' }), { status: 400, headers: cors });
    }

    // Fetch the item (service role to bypass RLS, but verify user_id)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: item, error: fetchError } = await supabase
      .from('command_centre_items')
      .select('id, user_id, title, summary, drafted_action, enrichment_context')
      .eq('id', item_id)
      .maybeSingle();

    if (fetchError || !item) {
      return new Response(JSON.stringify({ error: 'Item not found' }), { status: 404, headers: cors });
    }
    if (item.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
    }

    const currentDraft = item.drafted_action as Record<string, unknown> ?? {};
    const context = item.enrichment_context as Record<string, unknown> ?? {};

    // Build regeneration prompt
    const systemPrompt = `You are a sales email assistant. The user had an AI-drafted email and wants it rewritten based on their feedback.

Rules:
- Apply the user's feedback precisely
- Keep the same general intent and recipient
- Return ONLY valid JSON with these fields: { "to", "subject", "body_html", "reasoning" }
- body_html should be clean HTML suitable for email (use <p>, <br>, <strong>, <ul>/<li> — no <div> wrappers)
- Keep the email concise and professional
- Match a natural, human writing style — no corporate jargon unless the user asks for it`;

    const userPrompt = `Original email draft:
To: ${currentDraft.to ?? ''}
Subject: ${currentDraft.subject ?? ''}
Body: ${currentDraft.body_html ?? currentDraft.body ?? ''}

Context about this item:
Title: ${item.title}
Summary: ${item.summary ?? ''}
${Object.keys(context).length > 0 ? `Enrichment: ${JSON.stringify(context).slice(0, 2000)}` : ''}

User feedback: "${feedback}"

Rewrite the email applying the user's feedback. Return JSON only.`;

    let responseText: string;

    if (GEMINI_API_KEY) {
      // Prefer Gemini for speed
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
          }),
        },
      );
      if (!resp.ok) throw new Error(`Gemini error: ${resp.status}`);
      const data = await resp.json();
      responseText = data?.candidates?.[0]?.content?.parts
        ?.filter((p: Record<string, unknown>) => !p.thought)
        ?.map((p: Record<string, unknown>) => p.text)
        ?.join('') ?? '';
    } else if (ANTHROPIC_API_KEY) {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          temperature: 0.3,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      if (!resp.ok) throw new Error(`Anthropic error: ${resp.status}`);
      const data = await resp.json();
      responseText = data?.content?.[0]?.text ?? '';
    } else {
      return new Response(JSON.stringify({ error: 'No AI provider configured' }), { status: 500, headers: cors });
    }

    // Parse response
    const cleaned = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    // Build updated drafted_action
    const updatedAction = {
      ...currentDraft,
      to: parsed.to ?? currentDraft.to,
      subject: parsed.subject ?? currentDraft.subject,
      body_html: parsed.body_html ?? currentDraft.body_html,
      body: parsed.body_html ?? currentDraft.body_html,
      reasoning: parsed.reasoning ?? currentDraft.reasoning,
      regenerated_with_feedback: feedback,
    };

    // Persist to DB
    const { error: updateError } = await supabase
      .from('command_centre_items')
      .update({ drafted_action: updatedAction })
      .eq('id', item_id);

    if (updateError) {
      console.error('[cc-regenerate] Failed to persist:', updateError.message);
    }

    // Store feedback as a style preference for future drafts
    await supabase.from('cc_user_preferences').upsert({
      user_id: user.id,
      preference_type: 'style_feedback',
      value: feedback,
      item_id: item_id,
      created_at: new Date().toISOString(),
    }, { onConflict: 'user_id,item_id' }).catch(() => {
      // Table may not exist yet — non-blocking
      console.warn('[cc-regenerate] cc_user_preferences upsert skipped (table may not exist)');
    });

    return new Response(JSON.stringify({ drafted_action: updatedAction }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[cc-regenerate] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: cors });
  }
});
