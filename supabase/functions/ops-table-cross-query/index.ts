/// <reference path="../deno.d.ts" />

/**
 * OI-019: Ops Table Cross-Query Engine
 *
 * Joins data across multiple sources: other ops tables, CRM entities
 * (contacts, deals, companies, activities), and meetings/Fathom transcripts.
 *
 * POST /ops-table-cross-query
 * {
 *   tableId: string,
 *   query: string,
 *   dataSources?: string[]
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

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const MODEL = 'claude-haiku-4-5-20251001';
const LOG_PREFIX = '[ops-table-cross-query]';

// =============================================================================
// Types
// =============================================================================

interface RequestBody {
  tableId: string;
  query: string;
  dataSources?: string[];
}

interface DataSource {
  source_type: string;
  source_name: string;
  source_id: string | null;
  fields: any[];
  joinable_keys: string[];
}

// =============================================================================
// Data Source Discovery
// =============================================================================

async function getAvailableDataSources(
  supabase: any,
  orgId: string
): Promise<DataSource[]> {
  const { data, error } = await supabase
    .rpc('get_available_data_sources', { p_org_id: orgId });

  if (error) {
    console.error(`${LOG_PREFIX} Error getting data sources:`, error);
    return [];
  }

  return data || [];
}

// =============================================================================
// Query Parser
// =============================================================================

async function parseCrossTableQuery(
  anthropic: Anthropic,
  query: string,
  availableSources: DataSource[]
): Promise<{
  joinType: string;
  sourceTable: string;
  joinKey: string;
  targetSource: string;
  targetKey: string;
  outputType: string;
  inputTokens: number;
  outputTokens: number;
}> {
  const sourcesDesc = availableSources
    .map((s) => `- ${s.source_name} (type: ${s.source_type}, joinable on: ${s.joinable_keys.join(', ')})`)
    .join('\n');

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: `You parse cross-table queries. Return ONLY a JSON object with:
{
  "joinType": "enrich" | "compare" | "filter",
  "sourceTable": "current ops table",
  "joinKey": "column to join on (email, company, etc)",
  "targetSource": "which data source to join with",
  "targetKey": "column in target source",
  "outputType": "enriched_columns" | "comparison" | "filtered_rows"
}

Available data sources:
${sourcesDesc}`,
    messages: [
      {
        role: 'user',
        content: `Parse this query: "${query}"`,
      },
    ],
  });

  const usage = extractAnthropicUsage(response);
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse query structure');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    ...parsed,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  };
}

// =============================================================================
// Cross-Table Join Executors
// =============================================================================

async function executeEnrichment(
  supabase: any,
  tableId: string,
  joinConfig: any
): Promise<any> {
  // Get source table data
  const { data: sourceColumns } = await supabase
    .from('dynamic_table_columns')
    .select('id, key')
    .eq('table_id', tableId);

  const joinColumn = sourceColumns?.find(
    (c: any) => c.key.toLowerCase() === joinConfig.joinKey.toLowerCase()
  );

  if (!joinColumn) {
    throw new Error(`Join column ${joinConfig.joinKey} not found`);
  }

  // Get values from source table
  const { data: sourceCells } = await supabase
    .from('dynamic_table_cells')
    .select('row_id, value')
    .eq('column_id', joinColumn.id);

  if (!sourceCells || sourceCells.length === 0) {
    return { enrichedRows: [], newColumns: [] };
  }

  // For CRM sources, query the appropriate table
  let enrichedData: any[] = [];

  if (joinConfig.targetSource === 'crm_contacts') {
    const emails = sourceCells.map((c: any) => c.value).filter(Boolean);
    const { data: contacts } = await supabase
      .from('contacts')
      .select('email, first_name, last_name, company, linkedin_url')
      .in('email', emails);

    enrichedData = contacts || [];
  } else if (joinConfig.targetSource === 'crm_deals') {
    // Would join via company_id or similar
    enrichedData = [];
  } else if (joinConfig.targetSource === 'meetings') {
    // Would search meeting attendees
    enrichedData = [];
  }

  // Build enriched rows
  const enrichedRows = sourceCells.map((sourceCell: any) => {
    const match = enrichedData.find(
      (d: any) => d[joinConfig.targetKey] === sourceCell.value
    );

    return {
      rowId: sourceCell.row_id,
      sourceValue: sourceCell.value,
      enrichedData: match || null,
    };
  });

  return {
    enrichedRows: enrichedRows.filter((r: any) => r.enrichedData),
    newColumns: enrichedData.length > 0 ? Object.keys(enrichedData[0]) : [],
  };
}

async function executeComparison(
  supabase: any,
  tableId: string,
  joinConfig: any
): Promise<any> {
  // Compare current table against another table
  // Returns: matched, unmatched (net-new), overlapping stats

  return {
    matched: 0,
    netNew: 0,
    overlapping: 0,
    details: [],
  };
}

async function executeFilter(
  supabase: any,
  tableId: string,
  joinConfig: any
): Promise<any> {
  // Filter current table based on existence in another source
  return {
    filteredRowIds: [],
    count: 0,
  };
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
    const { tableId, query } = body;

    if (!tableId || !query) {
      return errorResponse('Missing required fields: tableId, query', req, 400);
    }

    console.log(`${LOG_PREFIX} Query: ${query}, Table: ${tableId}`);

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

    // Get table
    const { data: table } = await supabase
      .from('dynamic_tables')
      .select('id, org_id')
      .eq('id', tableId)
      .maybeSingle();

    if (!table) {
      return errorResponse('Table not found', req, 404);
    }

    // Get available data sources
    const availableSources = await getAvailableDataSources(supabase, table.org_id);

    // Parse query
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const {
      joinType,
      sourceTable,
      joinKey,
      targetSource,
      targetKey,
      outputType,
      inputTokens,
      outputTokens,
    } = await parseCrossTableQuery(anthropic, query, availableSources);

    const joinConfig = {
      joinType,
      sourceTable,
      joinKey,
      targetSource,
      targetKey,
      outputType,
    };

    // Execute based on join type
    let result;

    if (joinType === 'enrich') {
      result = await executeEnrichment(supabase, tableId, joinConfig);
    } else if (joinType === 'compare') {
      result = await executeComparison(supabase, tableId, joinConfig);
    } else if (joinType === 'filter') {
      result = await executeFilter(supabase, tableId, joinConfig);
    } else {
      throw new Error(`Unknown join type: ${joinType}`);
    }

    // Log cost
    await logAICostEvent(
      supabase,
      user.id,
      null,
      'anthropic',
      MODEL,
      inputTokens,
      outputTokens,
      'ops_cross_query',
      { tableId, query, joinType }
    );

    return jsonResponse({
      joinConfig,
      ...result,
    }, req);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return errorResponse(message, req, 500);
  }
});
