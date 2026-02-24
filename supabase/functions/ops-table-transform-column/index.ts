/// <reference path="../deno.d.ts" />

/**
 * AI-Powered Column Transformer for Ops Tables
 *
 * Applies an AI transformation to every cell in a column using Claude Haiku.
 * Processes cells in batches for efficiency.
 *
 * POST /ops-table-transform-column
 * {
 *   tableId: string,
 *   columnKey: string,
 *   transformPrompt: string,
 *   conditions?: FilterCondition[],   // optional: only transform matching rows
 *   previewOnly?: boolean             // if true, only transform first 5 cells
 * }
 *
 * Response:
 * {
 *   transformedCount: number,
 *   failedCount: number,
 *   samples: Array<{ rowId: string, before: string, after: string }>,
 *   totalEligible: number
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { logAICostEvent, extractAnthropicUsage } from '../_shared/costTracking.ts';

// =============================================================================
// Configuration
// =============================================================================

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;
const BATCH_SIZE = 20;
const LOG_PREFIX = '[ops-table-transform-column]';

// =============================================================================
// Types
// =============================================================================

interface FilterCondition {
  column_key: string;
  operator: string;
  value: string;
}

interface RequestBody {
  tableId: string;
  columnKey: string;
  transformPrompt: string;
  conditions?: FilterCondition[];
  previewOnly?: boolean;
}

interface CellToTransform {
  rowId: string;
  cellId: string | null;
  columnId: string;
  value: string;
}

// =============================================================================
// Transform Batch via Claude
// =============================================================================

async function transformBatch(
  anthropic: Anthropic,
  cells: CellToTransform[],
  transformPrompt: string
): Promise<{ results: { rowId: string; before: string; after: string }[]; inputTokens: number; outputTokens: number }> {
  // Build the batch prompt
  const valuesBlock = cells
    .map((c, i) => `[${i}] "${c.value}"`)
    .join('\n');

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: `You transform cell values according to instructions. Return ONLY the transformed values, one per line, prefixed with the index number in brackets. Do not add explanations. If a value cannot be transformed, return it unchanged.

Example output format:
[0] transformed_value_0
[1] transformed_value_1
[2] transformed_value_2`,
    messages: [
      {
        role: 'user',
        content: `Transform these values according to: "${transformPrompt}"

Values:
${valuesBlock}`,
      },
    ],
  });

  const usage = extractAnthropicUsage(response);
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  // Parse results
  const results: { rowId: string; before: string; after: string }[] = [];
  const lines = text.split('\n').filter((l) => l.trim());

  for (const line of lines) {
    const match = line.match(/^\[(\d+)\]\s*(.*)$/);
    if (match) {
      const idx = parseInt(match[1], 10);
      const transformed = match[2].trim();
      if (idx >= 0 && idx < cells.length) {
        results.push({
          rowId: cells[idx].rowId,
          before: cells[idx].value,
          after: transformed,
        });
      }
    }
  }

  // Fill in any missing results with unchanged values
  for (let i = 0; i < cells.length; i++) {
    if (!results.find((r) => r.rowId === cells[i].rowId)) {
      results.push({
        rowId: cells[i].rowId,
        before: cells[i].value,
        after: cells[i].value,
      });
    }
  }

  return { results, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req: Request) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  if (!ANTHROPIC_API_KEY) {
    console.error(`${LOG_PREFIX} ANTHROPIC_API_KEY not configured`);
    return errorResponse('AI service not configured', req, 500);
  }

  try {
    const body: RequestBody = await req.json();
    const { tableId, columnKey, transformPrompt, conditions, previewOnly } = body;

    if (!tableId || !columnKey || !transformPrompt) {
      return errorResponse('Missing required fields: tableId, columnKey, transformPrompt', req, 400);
    }

    console.log(`${LOG_PREFIX} Transform "${columnKey}" in table ${tableId}: "${transformPrompt}" (preview=${!!previewOnly})`);

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Authorization required', req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return errorResponse('Invalid authorization', req, 401);
    }

    // Get column info
    const { data: columns, error: colError } = await supabase
      .from('dynamic_table_columns')
      .select('id, key, column_type')
      .eq('table_id', tableId);

    if (colError) throw colError;

    const targetCol = (columns ?? []).find((c: { key: string }) => c.key === columnKey);
    if (!targetCol) {
      return errorResponse(`Column "${columnKey}" not found`, req, 400);
    }

    const keyToColumnId = new Map<string, string>();
    for (const col of (columns ?? []) as { id: string; key: string }[]) {
      keyToColumnId.set(col.key, col.id);
    }

    // Get all rows (optionally filtered)
    let rowIds: string[];

    if (conditions && conditions.length > 0) {
      // Apply filters to get matching row IDs
      // Simplified: fetch all rows, then filter by conditions client-side
      const { data: allRows, error: rowError } = await supabase
        .from('dynamic_table_rows')
        .select('id')
        .eq('table_id', tableId);

      if (rowError) throw rowError;
      rowIds = (allRows ?? []).map((r: { id: string }) => r.id);

      // Apply each condition
      for (const condition of conditions) {
        const condColId = keyToColumnId.get(condition.column_key);
        if (!condColId) continue;

        const { data: cells } = await supabase
          .from('dynamic_table_cells')
          .select('row_id, value')
          .eq('column_id', condColId)
          .in('row_id', rowIds);

        const cellMap = new Map<string, string>();
        for (const cell of (cells ?? []) as { row_id: string; value: string | null }[]) {
          cellMap.set(cell.row_id, cell.value ?? '');
        }

        rowIds = rowIds.filter((rid) => {
          const val = cellMap.get(rid) ?? '';
          switch (condition.operator) {
            case 'is_empty': return !val;
            case 'is_not_empty': return !!val;
            case 'equals': return val.toLowerCase() === (condition.value || '').toLowerCase();
            case 'contains': return val.toLowerCase().includes((condition.value || '').toLowerCase());
            default: return true;
          }
        });
      }
    } else {
      const { data: allRows, error: rowError } = await supabase
        .from('dynamic_table_rows')
        .select('id')
        .eq('table_id', tableId);

      if (rowError) throw rowError;
      rowIds = (allRows ?? []).map((r: { id: string }) => r.id);
    }

    // Get current cell values for the target column
    const { data: existingCells, error: cellError } = await supabase
      .from('dynamic_table_cells')
      .select('id, row_id, value')
      .eq('column_id', (targetCol as { id: string }).id)
      .in('row_id', rowIds);

    if (cellError) throw cellError;

    const cellMap = new Map<string, { id: string; value: string }>();
    for (const cell of (existingCells ?? []) as { id: string; row_id: string; value: string | null }[]) {
      if (cell.value) {
        cellMap.set(cell.row_id, { id: cell.id, value: cell.value });
      }
    }

    // Build list of cells to transform (skip empty)
    const cellsToTransform: CellToTransform[] = rowIds
      .filter((rid) => cellMap.has(rid))
      .map((rid) => {
        const cell = cellMap.get(rid)!;
        return {
          rowId: rid,
          cellId: cell.id,
          columnId: (targetCol as { id: string }).id,
          value: cell.value,
        };
      });

    const totalEligible = cellsToTransform.length;

    if (totalEligible === 0) {
      return jsonResponse({
        transformedCount: 0,
        failedCount: 0,
        samples: [],
        totalEligible: 0,
      }, req);
    }

    // Preview mode: only process first 5
    const cellsToProcess = previewOnly
      ? cellsToTransform.slice(0, 5)
      : cellsToTransform;

    // Process in batches
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    let transformedCount = 0;
    let failedCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const allSamples: { rowId: string; before: string; after: string }[] = [];

    for (let i = 0; i < cellsToProcess.length; i += BATCH_SIZE) {
      const batch = cellsToProcess.slice(i, i + BATCH_SIZE);

      try {
        const { results, inputTokens, outputTokens } = await transformBatch(
          anthropic,
          batch,
          transformPrompt
        );

        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;

        // Collect samples (first 5 total)
        for (const result of results) {
          if (allSamples.length < 5) {
            allSamples.push(result);
          }
        }

        if (!previewOnly) {
          // Write transformed values back to database
          const upserts = results
            .filter((r) => r.after !== r.before)
            .map((r) => {
              const cell = cellsToProcess.find((c) => c.rowId === r.rowId);
              return {
                row_id: r.rowId,
                column_id: cell!.columnId,
                value: r.after,
              };
            });

          if (upserts.length > 0) {
            const { error: upsertError } = await supabase
              .from('dynamic_table_cells')
              .upsert(upserts, { onConflict: 'row_id,column_id' });

            if (upsertError) {
              console.error(`${LOG_PREFIX} Upsert error for batch ${i}:`, upsertError);
              failedCount += upserts.length;
            } else {
              transformedCount += upserts.length;
            }
          }

          // Count unchanged as "transformed" (they were processed)
          transformedCount += results.length - upserts.length;
        } else {
          transformedCount = results.length;
        }
      } catch (batchError) {
        console.error(`${LOG_PREFIX} Batch ${i} error:`, batchError);
        failedCount += batch.length;
      }
    }

    // Log cost
    await logAICostEvent(
      supabase,
      user.id,
      null,
      'anthropic',
      MODEL,
      totalInputTokens,
      totalOutputTokens,
      'ops_transform',
      { tableId, columnKey, transformPrompt, previewOnly }
    );

    console.log(`${LOG_PREFIX} Complete: ${transformedCount} transformed, ${failedCount} failed`);

    return jsonResponse({
      transformedCount,
      failedCount,
      samples: allSamples,
      totalEligible,
    }, req);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return errorResponse(message, req, 500);
  }
});
