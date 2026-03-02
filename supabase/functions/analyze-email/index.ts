/**
 * Edge Function: Analyze Email with AI
 *
 * Uses Claude Haiku to analyze sales emails for CRM health tracking.
 * Extracts sentiment, topics, action items, urgency, and response requirements.
 *
 * NOW USES DYNAMIC PROMPTS: Prompts can be customized via Settings > AI Prompts
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { loadPrompt, interpolateVariables } from '../_shared/promptLoader.ts';
import { captureException } from '../_shared/sentryEdge.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface EmailAnalysisRequest {
  subject: string;
  body: string;
  user_id?: string; // Optional: for loading user-specific prompts
}

interface EmailAnalysisResponse {
  sentiment_score: number; // -1 to 1
  key_topics: string[];
  action_items: string[];
  urgency: 'low' | 'medium' | 'high';
  response_required: boolean;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function parseClaudeResponse(content: string): EmailAnalysisResponse {
  // Try to extract JSON from the response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in Claude response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Validate and normalize the response
  return {
    sentiment_score: Math.max(-1, Math.min(1, Number(parsed.sentiment_score) || 0)),
    key_topics: Array.isArray(parsed.key_topics) ? parsed.key_topics.slice(0, 5) : [],
    action_items: Array.isArray(parsed.action_items) ? parsed.action_items : [],
    urgency: ['low', 'medium', 'high'].includes(parsed.urgency) ? parsed.urgency : 'low',
    response_required: Boolean(parsed.response_required),
  };
}

async function analyzeEmailWithAI(
  request: EmailAnalysisRequest,
  supabase: ReturnType<typeof createClient>
): Promise<EmailAnalysisResponse> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  // Load prompt dynamically (checks DB first, falls back to defaults)
  const promptConfig = await loadPrompt(supabase, 'email_analysis', request.user_id);

  // Interpolate variables into the prompt templates
  const variables = {
    subject: request.subject,
    body: request.body,
  };

  const systemPrompt = interpolateVariables(promptConfig.systemPrompt, variables);
  const userPrompt = interpolateVariables(promptConfig.userPrompt, variables);

  console.log(`[analyze-email] Using prompt source: ${promptConfig.source}`);
  console.log(`[analyze-email] Model: ${promptConfig.model}, Temp: ${promptConfig.temperature}`);

  // Determine if this is an OpenRouter model
  const isOpenRouter = promptConfig.model.includes('/');
  const apiUrl = isOpenRouter
    ? 'https://openrouter.ai/api/v1/chat/completions'
    : 'https://api.anthropic.com/v1/messages';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  let body: string;

  if (isOpenRouter) {
    // OpenRouter format
    const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }
    headers['Authorization'] = `Bearer ${OPENROUTER_API_KEY}`;

    body = JSON.stringify({
      model: promptConfig.model,
      max_tokens: promptConfig.maxTokens,
      temperature: promptConfig.temperature,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: userPrompt },
      ],
    });
  } else {
    // Anthropic format
    headers['x-api-key'] = ANTHROPIC_API_KEY;
    headers['anthropic-version'] = '2023-06-01';

    body = JSON.stringify({
      model: promptConfig.model,
      max_tokens: promptConfig.maxTokens,
      temperature: promptConfig.temperature,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // Extract content based on API format
  const content = isOpenRouter
    ? data.choices[0].message.content
    : data.content[0].text;

  return parseClaudeResponse(content);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client for dynamic prompt loading
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { subject, body, user_id } = await req.json();

    if (!subject && !body) {
      return new Response(
        JSON.stringify({ error: 'Email subject or body is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const analysis = await analyzeEmailWithAI(
      {
        subject: subject || '',
        body: body || '',
        user_id,
      },
      supabase
    );

    return new Response(
      JSON.stringify(analysis),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Email analysis error:', error);
    await captureException(error, {
      tags: {
        function: 'analyze-email',
        integration: 'anthropic',
      },
    });

    // Return fallback analysis on error
    return new Response(
      JSON.stringify({
        error: error.message || 'Analysis failed',
        fallback: {
          sentiment_score: 0,
          key_topics: [],
          action_items: [],
          urgency: 'low',
          response_required: false,
        },
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
