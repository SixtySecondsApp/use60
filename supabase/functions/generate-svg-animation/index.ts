/// <reference path="../deno.d.ts" />

/**
 * Gemini 3.1 Pro SVG Animation Generator for Ops Tables
 *
 * POST /generate-svg-animation
 * {
 *   action: 'generate',
 *   org_id: string,
 *   user_id: string,
 *   table_id: string,
 *   column_id: string,
 *   row_ids: string[],
 *   complexity?: 'simple' | 'medium' | 'complex'
 * }
 *
 * For each row:
 *   1. Fetch column integration_config for prompt_template + complexity
 *   2. Fetch all cells for the row to build rowContext
 *   3. Interpolate prompt template with {{column_key}} syntax
 *   4. Call Gemini 3.1 Pro with thinking budget based on complexity
 *   5. Extract SVG from response
 *   6. Upload to Supabase Storage (ai-images bucket)
 *   7. Update cell with result JSON
 *   8. Deduct credits
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders } from '../_shared/corsHelper.ts';
import { INTEGRATION_CREDIT_COSTS, deductCreditsOrdered } from '../_shared/creditPacks.ts';

// =============================================================================
// Configuration
// =============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const GEMINI_MODEL = 'gemini-3.1-pro-preview';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const LOG_PREFIX = '[generate-svg-animation]';
const MAX_BATCH = 25;

const SYSTEM_PROMPT =
  'You are an expert SVG animation generator. Generate a single self-contained animated SVG using CSS @keyframes (not SMIL). Include viewBox, prefers-reduced-motion media query, and no fixed width/height. Output ONLY the SVG markup, nothing else.';

type Complexity = 'simple' | 'medium' | 'complex';

const THINKING_BUDGETS: Record<Complexity, number> = {
  simple: 2048,
  medium: 8192,
  complex: 16384,
};

const CREDIT_COST_KEYS: Record<Complexity, keyof typeof INTEGRATION_CREDIT_COSTS> = {
  simple: 'gemini_svg_simple',
  medium: 'gemini_svg_medium',
  complex: 'gemini_svg_complex',
};

// =============================================================================
// Types
// =============================================================================

interface RequestBody {
  action: string;
  org_id: string;
  user_id: string;
  table_id: string;
  column_id: string;
  row_ids: string[];
  complexity?: Complexity;
}

interface ColumnConfig {
  prompt_template?: string;
  complexity?: Complexity;
}

interface GenerationResult {
  row_id: string;
  success: boolean;
  error?: string;
  svg_content?: string;
  storage_url?: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Interpolate {{column_key}} placeholders in a prompt template with row context values.
 */
function interpolatePrompt(template: string, context: Record<string, string>): string {
  return template.replace(/\{\{([\w\s]+?)\}\}/g, (_match, rawKey) => {
    const key = rawKey.trim();
    const snakeKey = key.replace(/\s+/g, '_');
    return context[key] ?? context[snakeKey] ?? '';
  });
}

/**
 * Extract SVG markup from Gemini response text.
 * Looks for content between <svg and </svg> (inclusive).
 */
function extractSvg(text: string): string | null {
  const match = text.match(/<svg[\s\S]*?<\/svg>/i);
  return match ? match[0] : null;
}

/**
 * Resolve the Gemini API key: user's personal key first, then env var fallback.
 */
async function resolveGeminiApiKey(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  // Check user's personal key first
  const { data: userSettings } = await supabase
    .from('user_settings')
    .select('ai_provider_keys')
    .eq('user_id', userId)
    .maybeSingle();

  const userKey = (userSettings?.ai_provider_keys as Record<string, string> | null)?.gemini;
  if (userKey && typeof userKey === 'string' && userKey.trim().length > 0) {
    console.log(`${LOG_PREFIX} Using user's personal Gemini API key`);
    return userKey.trim();
  }

  // Fall back to environment variable
  const envKey = Deno.env.get('GEMINI_API_KEY');
  if (envKey) {
    console.log(`${LOG_PREFIX} Using platform Gemini API key`);
    return envKey;
  }

  return null;
}

/**
 * Call Gemini 3.1 Pro API to generate an SVG animation.
 */
async function callGemini(
  apiKey: string,
  prompt: string,
  complexity: Complexity
): Promise<{ svg: string; rawText: string }> {
  const budget = THINKING_BUDGETS[complexity];

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 32768,
        thinkingConfig: { thinkingBudget: budget },
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Gemini API error (${response.status}): ${errorData?.error?.message || response.statusText}`
    );
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`Gemini API error: ${data.error.message}`);
  }

  const candidates = data.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error('Gemini returned no candidates');
  }

  // Filter out thinking parts — only keep actual content
  const parts = candidates[0].content?.parts ?? [];
  const textParts = parts.filter(
    (p: { text?: string; thought?: boolean }) => p.text && p.thought !== true
  );
  const rawText = textParts.map((p: { text: string }) => p.text).join('');

  const svg = extractSvg(rawText);
  if (!svg) {
    throw new Error('Gemini response did not contain valid SVG markup');
  }

  return { svg, rawText };
}

// =============================================================================
// Main Handler
// =============================================================================

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: getCorsHeaders(req) });
  }

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // ── Auth ────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Parse body ──────────────────────────────────────────────────
    const body: RequestBody = await req.json();
    const { action, org_id, table_id, column_id, row_ids, complexity: bodyComplexity } = body;

    if (action !== 'generate') {
      return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!org_id || !table_id || !column_id || !row_ids?.length) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields: org_id, table_id, column_id, row_ids',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const clampedRowIds = row_ids.slice(0, MAX_BATCH);
    console.log(
      `${LOG_PREFIX} Generate SVG for ${clampedRowIds.length} rows in table ${table_id}, column ${column_id}`
    );

    // ── Service client for privileged operations ────────────────────
    const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Resolve Gemini API key ──────────────────────────────────────
    const apiKey = await resolveGeminiApiKey(svc, user.id);
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: 'Gemini API key not configured. Add your key in Settings or contact support.',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // ── Fetch column config ─────────────────────────────────────────
    const { data: column, error: colError } = await svc
      .from('dynamic_table_columns')
      .select('id, key, column_type, integration_config')
      .eq('id', column_id)
      .maybeSingle();

    if (colError || !column) {
      return new Response(
        JSON.stringify({ error: `Column not found: ${colError?.message || 'unknown'}` }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const config = (column.integration_config ?? {}) as ColumnConfig;
    const promptTemplate = config.prompt_template || 'Generate an animated SVG';
    const complexity: Complexity = bodyComplexity || config.complexity || 'medium';

    console.log(`${LOG_PREFIX} Complexity: ${complexity}, template: "${promptTemplate.slice(0, 80)}..."`);

    // ── Fetch all columns for this table (for key mapping) ──────────
    const { data: allColumns, error: allColError } = await svc
      .from('dynamic_table_columns')
      .select('id, key')
      .eq('table_id', table_id);

    if (allColError) {
      throw new Error(`Failed to fetch columns: ${allColError.message}`);
    }

    const colIdToKey: Record<string, string> = {};
    for (const col of allColumns ?? []) {
      colIdToKey[col.id] = col.key;
    }

    // ── Write "pending" status to all target cells immediately ──────
    const pendingCells = clampedRowIds.map((rowId) => ({
      row_id: rowId,
      column_id,
      value: JSON.stringify({ status: 'pending' }),
    }));

    await svc
      .from('dynamic_table_cells')
      .upsert(pendingCells, { onConflict: 'row_id,column_id' });

    // ── Process each row ────────────────────────────────────────────
    const results: GenerationResult[] = [];
    const creditCost = INTEGRATION_CREDIT_COSTS[CREDIT_COST_KEYS[complexity]];

    for (const rowId of clampedRowIds) {
      try {
        // Fetch all cells for this row to build context
        const { data: rowCells, error: cellError } = await svc
          .from('dynamic_table_cells')
          .select('column_id, value')
          .eq('row_id', rowId);

        if (cellError) {
          throw new Error(`Failed to fetch cells for row ${rowId}: ${cellError.message}`);
        }

        // Build row context map (column_key -> value)
        const rowContext: Record<string, string> = {};
        for (const cell of rowCells ?? []) {
          const key = colIdToKey[cell.column_id];
          if (key && cell.value) {
            // Skip JSON-structured cells (like our own pending status)
            try {
              const parsed = JSON.parse(cell.value);
              if (typeof parsed === 'object' && parsed !== null && parsed.status) {
                continue; // Skip status-bearing cells
              }
            } catch {
              // Not JSON, use as plain text
            }
            rowContext[key] = cell.value;
          }
        }

        // Interpolate prompt
        const prompt = interpolatePrompt(promptTemplate, rowContext);
        console.log(`${LOG_PREFIX} Row ${rowId.slice(0, 8)}: prompt="${prompt.slice(0, 100)}..."`);

        // Call Gemini
        const { svg } = await callGemini(apiKey, prompt, complexity);
        console.log(`${LOG_PREFIX} Row ${rowId.slice(0, 8)}: SVG generated (${svg.length} chars)`);

        // Upload SVG to Supabase Storage
        const storagePath = `svg-animations/${org_id}/${table_id}/${rowId}.svg`;
        const svgBytes = new TextEncoder().encode(svg);

        const { error: uploadError } = await svc.storage
          .from('ai-images')
          .upload(storagePath, svgBytes, {
            contentType: 'image/svg+xml',
            upsert: true,
          });

        if (uploadError) {
          console.error(`${LOG_PREFIX} Storage upload failed for row ${rowId}:`, uploadError.message);
          throw new Error(`Storage upload failed: ${uploadError.message}`);
        }

        const { data: urlData } = svc.storage.from('ai-images').getPublicUrl(storagePath);
        const storageUrl = urlData.publicUrl;

        // Update cell with completed result
        const cellValue = JSON.stringify({
          status: 'completed',
          svg_content: svg,
          storage_url: storageUrl,
          model_id: `gemini-3.1-pro`,
          complexity,
          credit_cost: creditCost,
        });

        const { error: updateError } = await svc
          .from('dynamic_table_cells')
          .upsert(
            { row_id: rowId, column_id, value: cellValue },
            { onConflict: 'row_id,column_id' }
          );

        if (updateError) {
          console.error(`${LOG_PREFIX} Cell update failed for row ${rowId}:`, updateError.message);
        }

        // Deduct credits
        const deductResult = await deductCreditsOrdered(svc, org_id, creditCost, 'gemini_svg_animation', complexity, {
          table_id,
          column_id,
          row_id: rowId,
          model: GEMINI_MODEL,
        });

        if (!deductResult.success) {
          console.warn(`${LOG_PREFIX} Credit deduction failed for row ${rowId} (non-blocking)`);
        }

        results.push({
          row_id: rowId,
          success: true,
          svg_content: svg,
          storage_url: storageUrl,
        });
      } catch (rowError) {
        const message = rowError instanceof Error ? rowError.message : 'Unknown error';
        console.error(`${LOG_PREFIX} Row ${rowId} failed:`, message);

        // Write error status to cell
        const errorValue = JSON.stringify({
          status: 'error',
          error: message,
          model_id: `gemini-3.1-pro`,
          complexity,
        });

        await svc
          .from('dynamic_table_cells')
          .upsert(
            { row_id: rowId, column_id, value: errorValue },
            { onConflict: 'row_id,column_id' }
          );

        results.push({
          row_id: rowId,
          success: false,
          error: message,
        });
      }
    }

    // ── Summary ─────────────────────────────────────────────────────
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    console.log(`${LOG_PREFIX} Complete: ${succeeded} succeeded, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        generated: succeeded,
        failed,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
