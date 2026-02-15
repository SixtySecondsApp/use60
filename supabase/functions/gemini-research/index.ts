// supabase/functions/gemini-research/index.ts
// Tool for Claude Haiku agents to call Gemini 3 Flash with Google Search grounding

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { logAICostEvent } from '../_shared/costTracking.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth check
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { query, responseSchema } = await req.json();

    if (!query) {
      throw new Error('query is required');
    }

    console.log(`[gemini-research] Query: ${query.substring(0, 100)}...`);

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const startTime = performance.now();

    // Build prompt with optional schema
    let prompt = query;
    if (responseSchema) {
      prompt += `\n\nReturn JSON matching this schema:\n${JSON.stringify(responseSchema, null, 2)}\n\nReturn ONLY valid JSON, no markdown formatting.`;
    }

    // Call Gemini 3 Flash with Google Search grounding
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
            responseMimeType: responseSchema ? 'application/json' : undefined
          },
          tools: [{ googleSearch: {} }] // Enable search grounding
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Gemini API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const duration = Math.round(performance.now() - startTime);

    if (data.error) {
      throw new Error(`Gemini API error: ${data.error.message}`);
    }

    // Extract text from response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text) {
      throw new Error('No response text from Gemini');
    }

    // Extract grounding sources
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
    const sources: Array<{ title?: string; uri?: string }> = [];

    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web) {
          sources.push({
            title: chunk.web.title,
            uri: chunk.web.uri,
          });
        }
      }
    }

    // Parse response (JSON or text)
    let result: any;
    if (responseSchema) {
      try {
        // Extract JSON from markdown code blocks if present
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
        result = JSON.parse(jsonStr);
      } catch (parseError) {
        console.error('[gemini-research] Failed to parse JSON response');
        result = { raw_text: text };
      }
    } else {
      result = text;
    }

    // Token usage
    const inputTokens = data.usageMetadata?.promptTokenCount || 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
    const totalTokens = data.usageMetadata?.totalTokenCount || 0;

    // Gemini 3 Flash pricing: $0.10 per 1M input, $0.30 per 1M output
    const cost = (inputTokens / 1_000_000) * 0.10 + (outputTokens / 1_000_000) * 0.30;

    // Log cost to ai_cost_events + deduct credits
    await logAICostEvent(
      supabase,
      user.id,
      null, // orgId will be looked up from user's membership
      'gemini',
      'gemini-3-flash-preview',
      inputTokens,
      outputTokens,
      'gemini-research',
      { query: query.substring(0, 100) }
    );

    console.log(`[gemini-research] Completed in ${duration}ms, ${totalTokens} tokens, $${cost.toFixed(6)}, ${sources.length} sources`);

    return new Response(JSON.stringify({
      result,
      sources,
      metadata: {
        duration_ms: duration,
        tokens: { input: inputTokens, output: outputTokens, total: totalTokens },
        cost,
        model: 'gemini-3-flash-preview',
        grounded: sources.length > 0
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[gemini-research] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
