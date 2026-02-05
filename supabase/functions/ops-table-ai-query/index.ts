/// <reference path="../deno.d.ts" />

/**
 * AI-Powered Query Parser for Ops Tables
 *
 * Uses Claude Haiku 4.5 to parse natural language queries into structured operations
 * that can be executed on dynamic tables.
 *
 * POST /ops-table-ai-query
 * {
 *   tableId: string,
 *   query: string,
 *   columns: Array<{ key: string, label: string, column_type: string }>
 * }
 *
 * Response:
 * {
 *   action: 'filter' | 'delete' | 'update',
 *   conditions: Array<{ column_key: string, operator: string, value: string }>,
 *   targetColumn?: string,  // for update actions
 *   newValue?: string,      // for update actions
 *   summary: string         // human-readable description of what will happen
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

const MODEL = 'claude-haiku-4-5-20250121';
const MAX_TOKENS = 1024;
const LOG_PREFIX = '[ops-table-ai-query]';

// =============================================================================
// Types
// =============================================================================

interface ColumnInfo {
  key: string;
  label: string;
  column_type: string;
}

interface RequestBody {
  tableId: string;
  query: string;
  columns: ColumnInfo[];
}

type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'
  | 'is_empty'
  | 'is_not_empty';

interface FilterCondition {
  column_key: string;
  operator: FilterOperator;
  value: string;
}

interface ParsedOperation {
  action: 'filter' | 'delete' | 'update';
  conditions: FilterCondition[];
  targetColumn?: string;
  newValue?: string;
  summary: string;
}

// =============================================================================
// Claude Tool Definitions
// =============================================================================

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'filter_rows',
    description:
      'Filter/show rows matching certain conditions. This is non-destructive and just changes what rows are visible in the table view.',
    input_schema: {
      type: 'object' as const,
      properties: {
        conditions: {
          type: 'array',
          description: 'Array of filter conditions to apply (AND logic)',
          items: {
            type: 'object',
            properties: {
              column_key: {
                type: 'string',
                description: 'The column key to filter on',
              },
              operator: {
                type: 'string',
                enum: [
                  'equals',
                  'not_equals',
                  'contains',
                  'not_contains',
                  'starts_with',
                  'ends_with',
                  'greater_than',
                  'less_than',
                  'is_empty',
                  'is_not_empty',
                ],
                description: 'The comparison operator',
              },
              value: {
                type: 'string',
                description:
                  'The value to compare against (leave empty for is_empty/is_not_empty)',
              },
            },
            required: ['column_key', 'operator'],
          },
        },
      },
      required: ['conditions'],
    },
  },
  {
    name: 'delete_rows',
    description:
      'Delete rows matching certain conditions. This is DESTRUCTIVE and permanently removes rows from the table. Use this when the user wants to remove, delete, or get rid of rows.',
    input_schema: {
      type: 'object' as const,
      properties: {
        conditions: {
          type: 'array',
          description:
            'Array of filter conditions to identify rows to delete (AND logic)',
          items: {
            type: 'object',
            properties: {
              column_key: {
                type: 'string',
                description: 'The column key to filter on',
              },
              operator: {
                type: 'string',
                enum: [
                  'equals',
                  'not_equals',
                  'contains',
                  'not_contains',
                  'starts_with',
                  'ends_with',
                  'greater_than',
                  'less_than',
                  'is_empty',
                  'is_not_empty',
                ],
                description: 'The comparison operator',
              },
              value: {
                type: 'string',
                description:
                  'The value to compare against (leave empty for is_empty/is_not_empty)',
              },
            },
            required: ['column_key', 'operator'],
          },
        },
      },
      required: ['conditions'],
    },
  },
  {
    name: 'update_rows',
    description:
      'Update a column value for rows matching certain conditions. Use this when the user wants to set, change, or modify values in a column for specific rows.',
    input_schema: {
      type: 'object' as const,
      properties: {
        conditions: {
          type: 'array',
          description:
            'Array of filter conditions to identify rows to update (AND logic)',
          items: {
            type: 'object',
            properties: {
              column_key: {
                type: 'string',
                description: 'The column key to filter on',
              },
              operator: {
                type: 'string',
                enum: [
                  'equals',
                  'not_equals',
                  'contains',
                  'not_contains',
                  'starts_with',
                  'ends_with',
                  'greater_than',
                  'less_than',
                  'is_empty',
                  'is_not_empty',
                ],
                description: 'The comparison operator',
              },
              value: {
                type: 'string',
                description:
                  'The value to compare against (leave empty for is_empty/is_not_empty)',
              },
            },
            required: ['column_key', 'operator'],
          },
        },
        target_column: {
          type: 'string',
          description: 'The column key to update',
        },
        new_value: {
          type: 'string',
          description: 'The new value to set',
        },
      },
      required: ['conditions', 'target_column', 'new_value'],
    },
  },
];

// =============================================================================
// System Prompt
// =============================================================================

function buildSystemPrompt(columns: ColumnInfo[]): string {
  const columnList = columns
    .map((c) => `- ${c.key} (${c.label}): type=${c.column_type}`)
    .join('\n');

  return `You are an AI assistant that parses natural language queries into structured table operations.

The user has a table with the following columns:
${columnList}

Your job is to understand what the user wants to do and call the appropriate tool:
- filter_rows: For showing/filtering rows (non-destructive)
- delete_rows: For removing/deleting rows (destructive)
- update_rows: For changing/setting values in a column

Important guidelines:
1. Match column references to the actual column keys (not labels)
2. Use case-insensitive matching for column names
3. For "blank", "empty", "missing" values, use the is_empty operator
4. For "not blank", "has value", use is_not_empty operator
5. Use "contains" for partial text matches
6. Be precise with operator selection

Examples:
- "delete rows with blank names" → delete_rows with is_empty on name column
- "remove emails containing @test.com" → delete_rows with contains on email column
- "show only verified emails" → filter_rows with equals 'verified' on status column
- "set status to 'archived' where email is empty" → update_rows on status column

Always select exactly one tool based on the user's intent.`;
}

// =============================================================================
// Generate Summary
// =============================================================================

function generateSummary(
  action: string,
  conditions: FilterCondition[],
  columns: ColumnInfo[],
  targetColumn?: string,
  newValue?: string
): string {
  const conditionDescriptions = conditions.map((c) => {
    const col = columns.find((col) => col.key === c.column_key);
    const colName = col?.label || c.column_key;

    switch (c.operator) {
      case 'is_empty':
        return `${colName} is empty`;
      case 'is_not_empty':
        return `${colName} is not empty`;
      case 'equals':
        return `${colName} equals "${c.value}"`;
      case 'not_equals':
        return `${colName} does not equal "${c.value}"`;
      case 'contains':
        return `${colName} contains "${c.value}"`;
      case 'not_contains':
        return `${colName} does not contain "${c.value}"`;
      case 'starts_with':
        return `${colName} starts with "${c.value}"`;
      case 'ends_with':
        return `${colName} ends with "${c.value}"`;
      case 'greater_than':
        return `${colName} > ${c.value}`;
      case 'less_than':
        return `${colName} < ${c.value}`;
      default:
        return `${colName} ${c.operator} "${c.value}"`;
    }
  });

  const whereClause =
    conditionDescriptions.length > 0
      ? ` where ${conditionDescriptions.join(' AND ')}`
      : '';

  switch (action) {
    case 'filter':
      return `Show rows${whereClause}`;
    case 'delete':
      return `Delete rows${whereClause}`;
    case 'update': {
      const targetCol = columns.find((c) => c.key === targetColumn);
      const targetName = targetCol?.label || targetColumn;
      return `Set "${targetName}" to "${newValue}"${whereClause}`;
    }
    default:
      return `${action}${whereClause}`;
  }
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  // Only allow POST
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  // Check API key
  if (!ANTHROPIC_API_KEY) {
    console.error(`${LOG_PREFIX} ANTHROPIC_API_KEY not configured`);
    return errorResponse('AI service not configured', req, 500);
  }

  try {
    // Parse request body
    const body: RequestBody = await req.json();
    const { tableId, query, columns } = body;

    if (!tableId || !query || !columns || columns.length === 0) {
      return errorResponse(
        'Missing required fields: tableId, query, columns',
        req,
        400
      );
    }

    console.log(`${LOG_PREFIX} Processing query for table ${tableId}: "${query}"`);

    // Get auth header for user context
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Authorization required', req, 401);
    }

    // Create user-scoped client for cost tracking
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get user for cost tracking
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return errorResponse('Invalid authorization', req, 401);
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    // Build system prompt with column context
    const systemPrompt = buildSystemPrompt(columns);

    // Call Claude with tool use
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools: TOOLS,
      tool_choice: { type: 'any' }, // Force tool use
      messages: [
        {
          role: 'user',
          content: query,
        },
      ],
    });

    console.log(`${LOG_PREFIX} Claude response stop_reason: ${response.stop_reason}`);

    // Log cost
    const usage = extractAnthropicUsage(response);
    await logAICostEvent(
      supabase,
      user.id,
      null,
      'anthropic',
      MODEL,
      usage.inputTokens,
      usage.outputTokens,
      'ops_ai_query',
      { tableId, query }
    );

    // Extract tool use from response
    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (!toolUseBlock) {
      console.error(`${LOG_PREFIX} No tool use in response`, response.content);
      return errorResponse(
        "I couldn't understand that query. Try something like 'delete rows with blank emails' or 'show only verified contacts'.",
        req,
        400
      );
    }

    // Parse tool response into operation
    const toolName = toolUseBlock.name;
    const toolInput = toolUseBlock.input as Record<string, unknown>;

    let action: 'filter' | 'delete' | 'update';
    let conditions: FilterCondition[] = [];
    let targetColumn: string | undefined;
    let newValue: string | undefined;

    switch (toolName) {
      case 'filter_rows':
        action = 'filter';
        conditions = (toolInput.conditions as FilterCondition[]) || [];
        break;
      case 'delete_rows':
        action = 'delete';
        conditions = (toolInput.conditions as FilterCondition[]) || [];
        break;
      case 'update_rows':
        action = 'update';
        conditions = (toolInput.conditions as FilterCondition[]) || [];
        targetColumn = toolInput.target_column as string;
        newValue = toolInput.new_value as string;
        break;
      default:
        return errorResponse(`Unknown tool: ${toolName}`, req, 400);
    }

    // Validate conditions reference actual columns
    for (const condition of conditions) {
      const columnExists = columns.some((c) => c.key === condition.column_key);
      if (!columnExists) {
        // Try case-insensitive match
        const matchedCol = columns.find(
          (c) =>
            c.key.toLowerCase() === condition.column_key.toLowerCase() ||
            c.label.toLowerCase() === condition.column_key.toLowerCase()
        );
        if (matchedCol) {
          condition.column_key = matchedCol.key;
        } else {
          return errorResponse(
            `Column "${condition.column_key}" not found in table. Available columns: ${columns.map((c) => c.label).join(', ')}`,
            req,
            400
          );
        }
      }
    }

    // Validate target column for update
    if (action === 'update' && targetColumn) {
      const colExists = columns.some((c) => c.key === targetColumn);
      if (!colExists) {
        const matchedCol = columns.find(
          (c) =>
            c.key.toLowerCase() === targetColumn!.toLowerCase() ||
            c.label.toLowerCase() === targetColumn!.toLowerCase()
        );
        if (matchedCol) {
          targetColumn = matchedCol.key;
        } else {
          return errorResponse(
            `Target column "${targetColumn}" not found in table`,
            req,
            400
          );
        }
      }
    }

    // Generate human-readable summary
    const summary = generateSummary(
      action,
      conditions,
      columns,
      targetColumn,
      newValue
    );

    const result: ParsedOperation = {
      action,
      conditions,
      summary,
      ...(targetColumn && { targetColumn }),
      ...(newValue !== undefined && { newValue }),
    };

    console.log(`${LOG_PREFIX} Parsed operation:`, result);

    return jsonResponse(result, req);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error:`, error);

    if (error instanceof SyntaxError) {
      return errorResponse('Invalid JSON in request body', req, 400);
    }

    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';
    return errorResponse(message, req, 500);
  }
});
