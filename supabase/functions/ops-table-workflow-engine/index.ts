/// <reference path="../deno.d.ts" />

/**
 * OI-002: Ops Table Workflow Engine
 *
 * Parses natural language workflow descriptions into structured steps,
 * executes multi-step workflows, and manages workflow lifecycle.
 *
 * POST /ops-table-workflow-engine
 * {
 *   tableId: string,
 *   action: 'parse' | 'execute' | 'save',
 *   description?: string,  // for parse
 *   workflowId?: string,   // for execute
 *   workflow?: object      // for save
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
const LOG_PREFIX = '[ops-table-workflow-engine]';

// =============================================================================
// Types
// =============================================================================

interface RequestBody {
  tableId: string;
  action: 'parse' | 'execute' | 'save';
  description?: string;
  workflowId?: string;
  workflow?: any;
}

interface WorkflowStep {
  condition?: string;
  action_type: string;
  action_config: any;
  on_error: 'continue' | 'abort';
}

// =============================================================================
// Parse Natural Language to Workflow
// =============================================================================

async function parseWorkflowDescription(
  anthropic: Anthropic,
  description: string,
  tableMetadata: any
): Promise<{ steps: WorkflowStep[]; inputTokens: number; outputTokens: number }> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: `You are a workflow parser. Convert natural language workflow descriptions into structured steps.

Available action types:
- filter_rows: Filter table rows by condition
- update_cells: Update cell values
- enrich_apollo: Enrich contacts via Apollo.io (email/domain lookup)
- score_icp: Score contacts against ICP criteria
- assign_by_territory: Assign to rep based on territory
- create_task: Create a task
- send_slack: Send Slack notification
- draft_email: Draft an email
- add_to_instantly_sequence: Add to Instantly.ai campaign
- move_to_table: Move rows to another table

Table columns: ${tableMetadata.columns.map((c: any) => c.key).join(', ')}

Return ONLY a JSON array of steps. Each step:
{
  "condition": "optional filter condition",
  "action_type": "one of the above",
  "action_config": { action-specific config },
  "on_error": "continue" or "abort"
}`,
    messages: [
      {
        role: 'user',
        content: `Parse this workflow: "${description}"`,
      },
    ],
  });

  const usage = extractAnthropicUsage(response);
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  // Extract JSON from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Failed to parse workflow steps from AI response');
  }

  const steps = JSON.parse(jsonMatch[0]);
  return { steps, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
}

// =============================================================================
// Step Executors
// =============================================================================

async function executeFilterRows(
  supabase: any,
  tableId: string,
  config: any
): Promise<{ rowIds: string[]; count: number }> {
  // For now, return all rows - full implementation would apply filter logic
  const { data: rows } = await supabase
    .from('dynamic_table_rows')
    .select('id')
    .eq('table_id', tableId);

  return { rowIds: (rows || []).map((r: any) => r.id), count: rows?.length || 0 };
}

async function executeUpdateCells(
  supabase: any,
  tableId: string,
  config: any,
  rowIds: string[]
): Promise<{ updated: number }> {
  const { columnKey, value } = config;

  // Get column ID
  const { data: column } = await supabase
    .from('dynamic_table_columns')
    .select('id')
    .eq('table_id', tableId)
    .eq('key', columnKey)
    .maybeSingle();

  if (!column) throw new Error(`Column ${columnKey} not found`);

  // Upsert cells
  const upserts = rowIds.map((rowId) => ({
    row_id: rowId,
    column_id: column.id,
    value,
  }));

  const { error } = await supabase
    .from('dynamic_table_cells')
    .upsert(upserts, { onConflict: 'row_id,column_id' });

  if (error) throw error;
  return { updated: upserts.length };
}

async function executeEnrichApollo(
  supabase: any,
  tableId: string,
  config: any,
  rowIds: string[]
): Promise<{ enriched: number }> {
  // Placeholder - would call Apollo API
  console.log(`${LOG_PREFIX} Apollo enrichment for ${rowIds.length} rows (not implemented)`);
  return { enriched: 0 };
}

async function executeScoreICP(
  supabase: any,
  tableId: string,
  config: any,
  rowIds: string[]
): Promise<{ scored: number }> {
  // Placeholder - would apply ICP scoring logic
  console.log(`${LOG_PREFIX} ICP scoring for ${rowIds.length} rows (not implemented)`);
  return { scored: 0 };
}

async function executeAssignByTerritory(
  supabase: any,
  tableId: string,
  config: any,
  rowIds: string[]
): Promise<{ assigned: number }> {
  // Placeholder - would read territory config and assign
  console.log(`${LOG_PREFIX} Territory assignment for ${rowIds.length} rows (not implemented)`);
  return { assigned: 0 };
}

async function executeCreateTask(
  supabase: any,
  tableId: string,
  config: any,
  rowIds: string[]
): Promise<{ created: number }> {
  // Placeholder - would create tasks
  console.log(`${LOG_PREFIX} Task creation for ${rowIds.length} rows (not implemented)`);
  return { created: 0 };
}

async function executeSendSlack(
  supabase: any,
  tableId: string,
  config: any,
  rowIds: string[]
): Promise<{ sent: boolean }> {
  // Placeholder - would send Slack message
  console.log(`${LOG_PREFIX} Slack notification (not implemented)`);
  return { sent: false };
}

async function executeDraftEmail(
  supabase: any,
  tableId: string,
  config: any,
  rowIds: string[]
): Promise<{ drafted: number }> {
  // Placeholder - would draft emails
  console.log(`${LOG_PREFIX} Email drafting for ${rowIds.length} rows (not implemented)`);
  return { drafted: 0 };
}

async function executeAddToInstantlySequence(
  supabase: any,
  tableId: string,
  config: any,
  rowIds: string[]
): Promise<{ added: number }> {
  // Placeholder - would call Instantly API
  console.log(`${LOG_PREFIX} Instantly sequence add for ${rowIds.length} rows (not implemented)`);
  return { added: 0 };
}

async function executeMoveToTable(
  supabase: any,
  tableId: string,
  config: any,
  rowIds: string[]
): Promise<{ moved: number }> {
  // Placeholder - would move rows to another table
  console.log(`${LOG_PREFIX} Move to table for ${rowIds.length} rows (not implemented)`);
  return { moved: 0 };
}

// =============================================================================
// Execute Workflow
// =============================================================================

async function executeWorkflow(
  supabase: any,
  workflow: any,
  tableId: string
): Promise<any> {
  const steps = workflow.steps || [];
  const stepResults = [];
  let currentRowIds: string[] = [];

  // Start with all rows
  const { data: allRows } = await supabase
    .from('dynamic_table_rows')
    .select('id')
    .eq('table_id', tableId);

  currentRowIds = (allRows || []).map((r: any) => r.id);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const startTime = Date.now();

    try {
      let result;

      switch (step.action_type) {
        case 'filter_rows':
          result = await executeFilterRows(supabase, tableId, step.action_config);
          currentRowIds = result.rowIds;
          break;
        case 'update_cells':
          result = await executeUpdateCells(supabase, tableId, step.action_config, currentRowIds);
          break;
        case 'enrich_apollo':
          result = await executeEnrichApollo(supabase, tableId, step.action_config, currentRowIds);
          break;
        case 'score_icp':
          result = await executeScoreICP(supabase, tableId, step.action_config, currentRowIds);
          break;
        case 'assign_by_territory':
          result = await executeAssignByTerritory(supabase, tableId, step.action_config, currentRowIds);
          break;
        case 'create_task':
          result = await executeCreateTask(supabase, tableId, step.action_config, currentRowIds);
          break;
        case 'send_slack':
          result = await executeSendSlack(supabase, tableId, step.action_config, currentRowIds);
          break;
        case 'draft_email':
          result = await executeDraftEmail(supabase, tableId, step.action_config, currentRowIds);
          break;
        case 'add_to_instantly_sequence':
          result = await executeAddToInstantlySequence(supabase, tableId, step.action_config, currentRowIds);
          break;
        case 'move_to_table':
          result = await executeMoveToTable(supabase, tableId, step.action_config, currentRowIds);
          break;
        default:
          throw new Error(`Unknown action type: ${step.action_type}`);
      }

      stepResults.push({
        step_index: i,
        status: 'completed',
        result,
        error: null,
        duration_ms: Date.now() - startTime,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      stepResults.push({
        step_index: i,
        status: 'failed',
        result: null,
        error: errorMsg,
        duration_ms: Date.now() - startTime,
      });

      if (step.on_error === 'abort') {
        break;
      }
    }
  }

  return { stepResults, finalRowCount: currentRowIds.length };
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
    const { tableId, action } = body;

    if (!tableId || !action) {
      return errorResponse('Missing required fields: tableId, action', req, 400);
    }

    console.log(`${LOG_PREFIX} Action: ${action}, Table: ${tableId}`);

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

    // Get table metadata
    const { data: table } = await supabase
      .from('dynamic_tables')
      .select('id, name, organization_id')
      .eq('id', tableId)
      .maybeSingle();

    if (!table) {
      return errorResponse('Table not found', req, 404);
    }

    const tableWithOrg = { ...table, org_id: table.organization_id };

    const { data: columns } = await supabase
      .from('dynamic_table_columns')
      .select('id, key, name, column_type')
      .eq('table_id', tableId);

    const tableMetadata = { ...table, columns: columns || [] };

    // Handle action
    if (action === 'parse') {
      if (!body.description) {
        return errorResponse('Missing description for parse action', req, 400);
      }

      const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
      const { steps, inputTokens, outputTokens } = await parseWorkflowDescription(
        anthropic,
        body.description,
        tableMetadata
      );

      await logAICostEvent(
        supabase,
        user.id,
        null,
        'anthropic',
        MODEL,
        inputTokens,
        outputTokens,
        'ops_workflow',
        { action: 'parse', tableId }
      );

      return jsonResponse({ steps }, req);
    }

    if (action === 'execute') {
      if (!body.workflowId) {
        return errorResponse('Missing workflowId for execute action', req, 400);
      }

      // Load workflow
      const { data: workflow, error: workflowError } = await supabase
        .from('ops_table_workflows')
        .select('*')
        .eq('id', body.workflowId)
        .maybeSingle();

      if (workflowError || !workflow) {
        return errorResponse('Workflow not found', req, 404);
      }

      // Create execution record
      const { data: execution, error: execError } = await supabase
        .from('ops_table_workflow_executions')
        .insert({
          workflow_id: workflow.id,
          trigger_event: 'manual',
          status: 'running',
        })
        .select()
        .single();

      if (execError) throw execError;

      // Execute workflow
      const { stepResults, finalRowCount } = await executeWorkflow(
        supabase,
        workflow,
        tableId
      );

      // Update execution record
      const allSuccess = stepResults.every((r: any) => r.status === 'completed');
      await supabase
        .from('ops_table_workflow_executions')
        .update({
          status: allSuccess ? 'completed' : 'failed',
          step_results: stepResults,
          completed_at: new Date().toISOString(),
        })
        .eq('id', execution.id);

      return jsonResponse({
        executionId: execution.id,
        status: allSuccess ? 'completed' : 'failed',
        stepResults,
        finalRowCount,
      }, req);
    }

    if (action === 'save') {
      if (!body.workflow) {
        return errorResponse('Missing workflow for save action', req, 400);
      }

      const { data: savedWorkflow, error: saveError } = await supabase
        .from('ops_table_workflows')
        .insert({
          org_id: tableWithOrg.org_id,
          table_id: tableId,
          name: body.workflow.name,
          description: body.workflow.description,
          trigger_type: body.workflow.trigger_type || 'manual',
          trigger_config: body.workflow.trigger_config || {},
          steps: body.workflow.steps,
          created_by: user.id,
        })
        .select()
        .single();

      if (saveError) throw saveError;

      return jsonResponse({ workflow: savedWorkflow }, req);
    }

    return errorResponse(`Unknown action: ${action}`, req, 400);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return errorResponse(message, req, 500);
  }
});
