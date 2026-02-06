/**
 * Sync AI Models Edge Function
 *
 * Fetches available models from AI providers and syncs to ai_models table.
 * Providers: Anthropic, Google (Gemini), OpenRouter, Kimi
 *
 * Can be called:
 * - Manually via POST request
 * - By cron job (daily at 3am UTC)
 *
 * Query params:
 * - provider: Sync only specific provider (optional)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AIModel {
  provider: 'anthropic' | 'google' | 'openrouter' | 'kimi';
  model_id: string;
  display_name: string;
  input_cost_per_million: number;
  output_cost_per_million: number;
  context_window: number | null;
  max_output_tokens: number | null;
  supports_vision: boolean;
  supports_function_calling: boolean;
  supports_streaming: boolean;
  is_available: boolean;
  provider_metadata: Record<string, unknown>;
}

interface SyncResult {
  provider: string;
  success: boolean;
  modelsCount: number;
  error?: string;
}

// ============================================================================
// Provider: Anthropic
// ============================================================================

async function syncAnthropicModels(apiKey: string): Promise<AIModel[]> {
  // Anthropic doesn't have a public models endpoint, use known models
  // Pricing as of Feb 2026
  const models: AIModel[] = [
    {
      provider: 'anthropic',
      model_id: 'claude-3-5-sonnet-20241022',
      display_name: 'Claude 3.5 Sonnet',
      input_cost_per_million: 3.00,
      output_cost_per_million: 15.00,
      context_window: 200000,
      max_output_tokens: 8192,
      supports_vision: true,
      supports_function_calling: true,
      supports_streaming: true,
      is_available: true,
      provider_metadata: { family: 'claude-3.5' },
    },
    {
      provider: 'anthropic',
      model_id: 'claude-3-5-haiku-20241022',
      display_name: 'Claude 3.5 Haiku',
      input_cost_per_million: 0.80,
      output_cost_per_million: 4.00,
      context_window: 200000,
      max_output_tokens: 8192,
      supports_vision: true,
      supports_function_calling: true,
      supports_streaming: true,
      is_available: true,
      provider_metadata: { family: 'claude-3.5' },
    },
    {
      provider: 'anthropic',
      model_id: 'claude-3-opus-20240229',
      display_name: 'Claude 3 Opus',
      input_cost_per_million: 15.00,
      output_cost_per_million: 75.00,
      context_window: 200000,
      max_output_tokens: 4096,
      supports_vision: true,
      supports_function_calling: true,
      supports_streaming: true,
      is_available: true,
      provider_metadata: { family: 'claude-3' },
    },
    {
      provider: 'anthropic',
      model_id: 'claude-sonnet-4-20250514',
      display_name: 'Claude Sonnet 4',
      input_cost_per_million: 3.00,
      output_cost_per_million: 15.00,
      context_window: 200000,
      max_output_tokens: 64000,
      supports_vision: true,
      supports_function_calling: true,
      supports_streaming: true,
      is_available: true,
      provider_metadata: { family: 'claude-4' },
    },
    {
      provider: 'anthropic',
      model_id: 'claude-haiku-4-5-20250514',
      display_name: 'Claude Haiku 4.5',
      input_cost_per_million: 0.80,
      output_cost_per_million: 4.00,
      context_window: 200000,
      max_output_tokens: 64000,
      supports_vision: true,
      supports_function_calling: true,
      supports_streaming: true,
      is_available: true,
      provider_metadata: { family: 'claude-4.5' },
    },
    {
      provider: 'anthropic',
      model_id: 'claude-opus-4-20250514',
      display_name: 'Claude Opus 4',
      input_cost_per_million: 15.00,
      output_cost_per_million: 75.00,
      context_window: 200000,
      max_output_tokens: 32000,
      supports_vision: true,
      supports_function_calling: true,
      supports_streaming: true,
      is_available: true,
      provider_metadata: { family: 'claude-4' },
    },
  ];

  // Optionally verify API key works
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    if (!response.ok && response.status === 401) {
      console.warn('[sync-ai-models] Anthropic API key invalid');
      return models.map((m) => ({ ...m, is_available: false }));
    }
  } catch (error) {
    console.warn('[sync-ai-models] Could not verify Anthropic API:', error);
  }

  return models;
}

// ============================================================================
// Provider: Google (Gemini)
// ============================================================================

async function syncGoogleModels(apiKey: string): Promise<AIModel[]> {
  const models: AIModel[] = [];

  try {
    // Fetch models from Google AI API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    if (!response.ok) {
      console.error('[sync-ai-models] Google API error:', response.status);
      return getDefaultGoogleModels();
    }

    const data = await response.json();

    for (const model of data.models || []) {
      // Only include generative models
      if (!model.name?.includes('gemini')) continue;

      const modelId = model.name.replace('models/', '');

      // Skip embedding models
      if (modelId.includes('embedding')) continue;

      // Determine pricing based on model
      let inputCost = 0.075;
      let outputCost = 0.30;

      if (modelId.includes('pro')) {
        inputCost = 1.25;
        outputCost = 5.00;
      }

      models.push({
        provider: 'google',
        model_id: modelId,
        display_name: model.displayName || modelId,
        input_cost_per_million: inputCost,
        output_cost_per_million: outputCost,
        context_window: model.inputTokenLimit || 1000000,
        max_output_tokens: model.outputTokenLimit || 8192,
        supports_vision: model.supportedGenerationMethods?.includes('generateContent') ?? true,
        supports_function_calling: true,
        supports_streaming: true,
        is_available: true,
        provider_metadata: {
          version: model.version,
          supportedMethods: model.supportedGenerationMethods,
        },
      });
    }
  } catch (error) {
    console.error('[sync-ai-models] Error fetching Google models:', error);
    return getDefaultGoogleModels();
  }

  return models.length > 0 ? models : getDefaultGoogleModels();
}

function getDefaultGoogleModels(): AIModel[] {
  return [
    {
      provider: 'google',
      model_id: 'gemini-2.5-flash',
      display_name: 'Gemini 2.5 Flash',
      input_cost_per_million: 0.075,
      output_cost_per_million: 0.30,
      context_window: 1000000,
      max_output_tokens: 8192,
      supports_vision: true,
      supports_function_calling: true,
      supports_streaming: true,
      is_available: true,
      provider_metadata: {},
    },
    {
      provider: 'google',
      model_id: 'gemini-2.5-pro',
      display_name: 'Gemini 2.5 Pro',
      input_cost_per_million: 1.25,
      output_cost_per_million: 5.00,
      context_window: 1000000,
      max_output_tokens: 8192,
      supports_vision: true,
      supports_function_calling: true,
      supports_streaming: true,
      is_available: true,
      provider_metadata: {},
    },
    {
      provider: 'google',
      model_id: 'gemini-1.5-pro',
      display_name: 'Gemini 1.5 Pro',
      input_cost_per_million: 1.25,
      output_cost_per_million: 5.00,
      context_window: 2000000,
      max_output_tokens: 8192,
      supports_vision: true,
      supports_function_calling: true,
      supports_streaming: true,
      is_available: true,
      provider_metadata: {},
    },
    {
      provider: 'google',
      model_id: 'gemini-1.5-flash',
      display_name: 'Gemini 1.5 Flash',
      input_cost_per_million: 0.075,
      output_cost_per_million: 0.30,
      context_window: 1000000,
      max_output_tokens: 8192,
      supports_vision: true,
      supports_function_calling: true,
      supports_streaming: true,
      is_available: true,
      provider_metadata: {},
    },
  ];
}

// ============================================================================
// Provider: OpenRouter
// ============================================================================

async function syncOpenRouterModels(apiKey: string): Promise<AIModel[]> {
  const models: AIModel[] = [];

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      console.error('[sync-ai-models] OpenRouter API error:', response.status);
      return getDefaultOpenRouterModels();
    }

    const data = await response.json();

    for (const model of data.data || []) {
      // Parse pricing (OpenRouter uses per-token pricing)
      const inputCost = (model.pricing?.prompt || 0) * 1000000;
      const outputCost = (model.pricing?.completion || 0) * 1000000;

      models.push({
        provider: 'openrouter',
        model_id: model.id,
        display_name: model.name || model.id,
        input_cost_per_million: inputCost,
        output_cost_per_million: outputCost,
        context_window: model.context_length || null,
        max_output_tokens: model.top_provider?.max_completion_tokens || null,
        supports_vision: model.architecture?.modality?.includes('image') ?? false,
        supports_function_calling: true,
        supports_streaming: true,
        is_available: true,
        provider_metadata: {
          architecture: model.architecture,
          top_provider: model.top_provider,
        },
      });
    }
  } catch (error) {
    console.error('[sync-ai-models] Error fetching OpenRouter models:', error);
    return getDefaultOpenRouterModels();
  }

  return models.length > 0 ? models : getDefaultOpenRouterModels();
}

function getDefaultOpenRouterModels(): AIModel[] {
  return [
    {
      provider: 'openrouter',
      model_id: 'anthropic/claude-3.5-sonnet',
      display_name: 'Claude 3.5 Sonnet (via OpenRouter)',
      input_cost_per_million: 3.00,
      output_cost_per_million: 15.00,
      context_window: 200000,
      max_output_tokens: 8192,
      supports_vision: true,
      supports_function_calling: true,
      supports_streaming: true,
      is_available: true,
      provider_metadata: {},
    },
    {
      provider: 'openrouter',
      model_id: 'google/gemini-2.5-flash',
      display_name: 'Gemini 2.5 Flash (via OpenRouter)',
      input_cost_per_million: 0.075,
      output_cost_per_million: 0.30,
      context_window: 1000000,
      max_output_tokens: 8192,
      supports_vision: true,
      supports_function_calling: true,
      supports_streaming: true,
      is_available: true,
      provider_metadata: {},
    },
    {
      provider: 'openrouter',
      model_id: 'meta-llama/llama-3.1-405b',
      display_name: 'Llama 3.1 405B',
      input_cost_per_million: 2.70,
      output_cost_per_million: 2.70,
      context_window: 131072,
      max_output_tokens: 4096,
      supports_vision: false,
      supports_function_calling: true,
      supports_streaming: true,
      is_available: true,
      provider_metadata: {},
    },
    {
      provider: 'openrouter',
      model_id: 'deepseek/deepseek-r1',
      display_name: 'DeepSeek R1',
      input_cost_per_million: 0.55,
      output_cost_per_million: 2.19,
      context_window: 65536,
      max_output_tokens: 8192,
      supports_vision: false,
      supports_function_calling: true,
      supports_streaming: true,
      is_available: true,
      provider_metadata: {},
    },
  ];
}

// ============================================================================
// Provider: Kimi (Moonshot)
// ============================================================================

async function syncKimiModels(apiKey: string): Promise<AIModel[]> {
  const models: AIModel[] = [];

  try {
    const response = await fetch('https://api.moonshot.cn/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      console.error('[sync-ai-models] Kimi API error:', response.status);
      return getDefaultKimiModels();
    }

    const data = await response.json();

    for (const model of data.data || []) {
      models.push({
        provider: 'kimi',
        model_id: model.id,
        display_name: model.id.replace('moonshot-', 'Kimi ').replace('-', ' '),
        input_cost_per_million: 0.80, // Approximate pricing
        output_cost_per_million: 0.80,
        context_window: parseInt(model.id.match(/\d+k/)?.[0] || '128') * 1000,
        max_output_tokens: 8192,
        supports_vision: false,
        supports_function_calling: true,
        supports_streaming: true,
        is_available: true,
        provider_metadata: {
          object: model.object,
          owned_by: model.owned_by,
        },
      });
    }
  } catch (error) {
    console.error('[sync-ai-models] Error fetching Kimi models:', error);
    return getDefaultKimiModels();
  }

  return models.length > 0 ? models : getDefaultKimiModels();
}

function getDefaultKimiModels(): AIModel[] {
  return [
    {
      provider: 'kimi',
      model_id: 'moonshot-v1-8k',
      display_name: 'Kimi Moonshot 8K',
      input_cost_per_million: 0.80,
      output_cost_per_million: 0.80,
      context_window: 8000,
      max_output_tokens: 4096,
      supports_vision: false,
      supports_function_calling: true,
      supports_streaming: true,
      is_available: true,
      provider_metadata: {},
    },
    {
      provider: 'kimi',
      model_id: 'moonshot-v1-32k',
      display_name: 'Kimi Moonshot 32K',
      input_cost_per_million: 0.80,
      output_cost_per_million: 0.80,
      context_window: 32000,
      max_output_tokens: 8192,
      supports_vision: false,
      supports_function_calling: true,
      supports_streaming: true,
      is_available: true,
      provider_metadata: {},
    },
    {
      provider: 'kimi',
      model_id: 'moonshot-v1-128k',
      display_name: 'Kimi Moonshot 128K',
      input_cost_per_million: 0.80,
      output_cost_per_million: 0.80,
      context_window: 128000,
      max_output_tokens: 8192,
      supports_vision: false,
      supports_function_calling: true,
      supports_streaming: true,
      is_available: true,
      provider_metadata: {},
    },
    {
      provider: 'kimi',
      model_id: 'kimi-k2',
      display_name: 'Kimi K2',
      input_cost_per_million: 1.00,
      output_cost_per_million: 1.00,
      context_window: 200000,
      max_output_tokens: 16384,
      supports_vision: false,
      supports_function_calling: true,
      supports_streaming: true,
      is_available: true,
      provider_metadata: {},
    },
  ];
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get API keys
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    const geminiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_GEMINI_API_KEY');
    const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');
    const kimiKey = Deno.env.get('KIMI_API_KEY');

    // Check for specific provider filter
    const url = new URL(req.url);
    const providerFilter = url.searchParams.get('provider');

    console.log('[sync-ai-models] Starting sync...', { providerFilter });

    const results: SyncResult[] = [];
    const allModels: AIModel[] = [];

    // Sync Anthropic
    if (!providerFilter || providerFilter === 'anthropic') {
      if (anthropicKey) {
        try {
          const models = await syncAnthropicModels(anthropicKey);
          allModels.push(...models);
          results.push({ provider: 'anthropic', success: true, modelsCount: models.length });
        } catch (error) {
          results.push({ provider: 'anthropic', success: false, modelsCount: 0, error: String(error) });
        }
      } else {
        results.push({ provider: 'anthropic', success: false, modelsCount: 0, error: 'No API key' });
      }
    }

    // Sync Google
    if (!providerFilter || providerFilter === 'google') {
      if (geminiKey) {
        try {
          const models = await syncGoogleModels(geminiKey);
          allModels.push(...models);
          results.push({ provider: 'google', success: true, modelsCount: models.length });
        } catch (error) {
          results.push({ provider: 'google', success: false, modelsCount: 0, error: String(error) });
        }
      } else {
        results.push({ provider: 'google', success: false, modelsCount: 0, error: 'No API key' });
      }
    }

    // Sync OpenRouter
    if (!providerFilter || providerFilter === 'openrouter') {
      if (openrouterKey) {
        try {
          const models = await syncOpenRouterModels(openrouterKey);
          // Limit OpenRouter models to top 50 by usage/popularity
          const limitedModels = models.slice(0, 50);
          allModels.push(...limitedModels);
          results.push({ provider: 'openrouter', success: true, modelsCount: limitedModels.length });
        } catch (error) {
          results.push({ provider: 'openrouter', success: false, modelsCount: 0, error: String(error) });
        }
      } else {
        results.push({ provider: 'openrouter', success: false, modelsCount: 0, error: 'No API key' });
      }
    }

    // Sync Kimi
    if (!providerFilter || providerFilter === 'kimi') {
      if (kimiKey) {
        try {
          const models = await syncKimiModels(kimiKey);
          allModels.push(...models);
          results.push({ provider: 'kimi', success: true, modelsCount: models.length });
        } catch (error) {
          results.push({ provider: 'kimi', success: false, modelsCount: 0, error: String(error) });
        }
      } else {
        // Kimi key is optional, use defaults
        const models = getDefaultKimiModels();
        allModels.push(...models);
        results.push({ provider: 'kimi', success: true, modelsCount: models.length });
      }
    }

    // Upsert all models to database
    console.log(`[sync-ai-models] Upserting ${allModels.length} models...`);

    for (const model of allModels) {
      const { error } = await supabase.from('ai_models').upsert(
        {
          provider: model.provider,
          model_id: model.model_id,
          display_name: model.display_name,
          input_cost_per_million: model.input_cost_per_million,
          output_cost_per_million: model.output_cost_per_million,
          context_window: model.context_window,
          max_output_tokens: model.max_output_tokens,
          supports_vision: model.supports_vision,
          supports_function_calling: model.supports_function_calling,
          supports_streaming: model.supports_streaming,
          is_available: model.is_available,
          provider_metadata: model.provider_metadata,
          last_synced_at: new Date().toISOString(),
        },
        {
          onConflict: 'provider,model_id',
        }
      );

      if (error) {
        console.error(`[sync-ai-models] Error upserting model ${model.model_id}:`, error);
      }
    }

    console.log('[sync-ai-models] Sync complete:', results);

    return new Response(
      JSON.stringify({
        success: true,
        results,
        totalModels: allModels.length,
        syncedAt: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[sync-ai-models] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
