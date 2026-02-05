/// <reference path="../deno.d.ts" />

/**
 * AI-Powered Query Commander for Ops Tables
 *
 * Uses Claude Haiku 4.5 to parse natural language queries into structured operations
 * that can be executed on dynamic tables. Supports 12 action types:
 *
 * Basic (existing):     filter, delete, update
 * Cleanup:              transform, deduplicate
 * Analytics:            summarize
 * Structure:            create_column, create_view, batch_create_views
 * Visual:               sort, apply_formatting
 * Advanced:             conditional_update, export, cross_column_validate
 *
 * POST /ops-table-ai-query
 * {
 *   tableId: string,
 *   query: string,
 *   columns: Array<{ key: string, label: string, column_type: string }>,
 *   rowCount?: number,
 *   sampleValues?: Record<string, string[]>
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
const MAX_TOKENS = 2048;
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
  rowCount?: number;
  sampleValues?: Record<string, string[]>;
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

// =============================================================================
// Filter condition schema (reused across tools)
// =============================================================================

const FILTER_CONDITION_SCHEMA = {
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
};

const CONDITIONS_ARRAY_SCHEMA = {
  type: 'array',
  description: 'Array of filter conditions (AND logic)',
  items: FILTER_CONDITION_SCHEMA,
};

// =============================================================================
// Tool Definitions — 12 tools organized by category
// =============================================================================

// --- Basic tools (existing) ---

const FILTER_ROWS_TOOL: Anthropic.Tool = {
  name: 'filter_rows',
  description:
    'Filter/show rows matching certain conditions. Non-destructive — just changes what rows are visible.',
  input_schema: {
    type: 'object' as const,
    properties: {
      conditions: CONDITIONS_ARRAY_SCHEMA,
    },
    required: ['conditions'],
  },
};

const DELETE_ROWS_TOOL: Anthropic.Tool = {
  name: 'delete_rows',
  description:
    'Delete rows matching conditions. DESTRUCTIVE — permanently removes rows. Use when user says "delete", "remove", "get rid of".',
  input_schema: {
    type: 'object' as const,
    properties: {
      conditions: CONDITIONS_ARRAY_SCHEMA,
    },
    required: ['conditions'],
  },
};

const UPDATE_ROWS_TOOL: Anthropic.Tool = {
  name: 'update_rows',
  description:
    'Update a single column value for rows matching conditions. Use when user wants to set/change ONE column to ONE value for matching rows.',
  input_schema: {
    type: 'object' as const,
    properties: {
      conditions: CONDITIONS_ARRAY_SCHEMA,
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
};

// --- Cleanup tools ---

const TRANSFORM_COLUMN_TOOL: Anthropic.Tool = {
  name: 'transform_column',
  description:
    'Apply an AI transformation to every cell in a column. Use for reformatting data (phone numbers to E.164, trimming whitespace, extracting domains from emails, standardizing names, etc.). The transformation is described in natural language.',
  input_schema: {
    type: 'object' as const,
    properties: {
      column_key: {
        type: 'string',
        description: 'The column key to transform',
      },
      transform_prompt: {
        type: 'string',
        description:
          'Natural language description of the transformation to apply to each cell value. Be specific about the output format.',
      },
      conditions: {
        ...CONDITIONS_ARRAY_SCHEMA,
        description:
          'Optional: only transform cells in rows matching these conditions. Omit to transform all rows.',
      },
    },
    required: ['column_key', 'transform_prompt'],
  },
};

const DEDUPLICATE_ROWS_TOOL: Anthropic.Tool = {
  name: 'deduplicate_rows',
  description:
    'Find and remove duplicate rows based on a column. Groups rows by the specified column value, keeps one row per group based on the keep strategy, and marks the rest for deletion.',
  input_schema: {
    type: 'object' as const,
    properties: {
      group_by_column: {
        type: 'string',
        description: 'The column key to group by (find duplicates in this column)',
      },
      keep_strategy: {
        type: 'string',
        enum: ['most_recent', 'most_filled', 'first', 'last'],
        description:
          'Which row to keep in each duplicate group: most_recent (newest created_at), most_filled (most non-empty cells), first (lowest row_index), last (highest row_index)',
      },
    },
    required: ['group_by_column', 'keep_strategy'],
  },
};

// --- Analytics tools ---

const SUMMARIZE_TABLE_TOOL: Anthropic.Tool = {
  name: 'summarize_table',
  description:
    'Generate summary statistics about the table. Use for questions like "how many leads per stage?", "what percentage have phone numbers?", "breakdown by company", "summarize this table". Returns aggregated counts, percentages, and stats.',
  input_schema: {
    type: 'object' as const,
    properties: {
      group_by_column: {
        type: 'string',
        description:
          'Optional: column key to group by for breakdown (e.g., lifecycle_stage, company). Omit for overall stats.',
      },
      metrics_columns: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional: column keys to compute fill-rate and stats for. Defaults to all columns if omitted.',
      },
      question: {
        type: 'string',
        description: 'The user\'s original question, for context in the response',
      },
    },
    required: ['question'],
  },
};

// --- Structure tools ---

const CREATE_COLUMN_TOOL: Anthropic.Tool = {
  name: 'create_column',
  description:
    'Create a new column in the table. Use for "add a column that...", "create a field for...", "score leads by...", "add a personalized first line column". Can create enrichment columns (AI-powered) or static columns.',
  input_schema: {
    type: 'object' as const,
    properties: {
      label: {
        type: 'string',
        description: 'Human-readable column label',
      },
      column_type: {
        type: 'string',
        enum: ['text', 'number', 'boolean', 'enrichment', 'status', 'dropdown', 'tags'],
        description: 'The column type. Use "enrichment" for AI-generated values.',
      },
      enrichment_prompt: {
        type: 'string',
        description:
          'For enrichment columns: the prompt that generates each cell value. Reference other columns with {column_key}. Example: "Based on {job_title} at {company}, score this lead 1-5 for seniority"',
      },
      auto_run: {
        type: 'boolean',
        description: 'Whether to automatically run enrichment on all existing rows after creation. Default true for enrichment columns.',
      },
    },
    required: ['label', 'column_type'],
  },
};

const CREATE_VIEW_TOOL: Anthropic.Tool = {
  name: 'create_view',
  description:
    'Save the current filter/sort as a named view. Use for "create a view of...", "save this as...", "make a view called...".',
  input_schema: {
    type: 'object' as const,
    properties: {
      view_name: {
        type: 'string',
        description: 'Name for the new view',
      },
      filter_conditions: CONDITIONS_ARRAY_SCHEMA,
      sort_config: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Column key to sort by' },
          dir: { type: 'string', enum: ['asc', 'desc'] },
        },
        required: ['key', 'dir'],
        description: 'Optional sort configuration',
      },
    },
    required: ['view_name', 'filter_conditions'],
  },
};

const BATCH_CREATE_VIEWS_TOOL: Anthropic.Tool = {
  name: 'batch_create_views',
  description:
    'Split the table into multiple views based on unique values in a column. Use for "split into views by lifecycle stage", "create a view for each company".',
  input_schema: {
    type: 'object' as const,
    properties: {
      split_by_column: {
        type: 'string',
        description: 'The column key to split by — one view per unique value',
      },
    },
    required: ['split_by_column'],
  },
};

// --- Visual tools ---

const SORT_ROWS_TOOL: Anthropic.Tool = {
  name: 'sort_rows',
  description:
    'Sort the table by one or more columns. Use for "sort by...", "order by...", "coldest leads first", etc.',
  input_schema: {
    type: 'object' as const,
    properties: {
      sort_config: {
        type: 'array',
        description: 'Array of sort rules applied in order (multi-column sort)',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Column key to sort by' },
            dir: {
              type: 'string',
              enum: ['asc', 'desc'],
              description: 'Sort direction',
            },
          },
          required: ['key', 'dir'],
        },
      },
    },
    required: ['sort_config'],
  },
};

const APPLY_FORMATTING_TOOL: Anthropic.Tool = {
  name: 'apply_formatting',
  description:
    'Apply conditional formatting (color highlighting) to rows. Use for "highlight VP rows in gold", "flag stale leads in red", "color rows where...".',
  input_schema: {
    type: 'object' as const,
    properties: {
      rules: {
        type: 'array',
        description: 'Conditional formatting rules',
        items: {
          type: 'object',
          properties: {
            conditions: CONDITIONS_ARRAY_SCHEMA,
            style: {
              type: 'object',
              properties: {
                bg_color: {
                  type: 'string',
                  description:
                    'Background color as a Tailwind color class suffix (e.g., "amber-900/20", "red-900/20", "green-900/20", "blue-900/20")',
                },
                text_color: {
                  type: 'string',
                  description:
                    'Text color as a Tailwind color class suffix (e.g., "amber-300", "red-300", "green-300")',
                },
              },
            },
            label: {
              type: 'string',
              description: 'Human-readable label for this rule (e.g., "VP or Director")',
            },
          },
          required: ['conditions', 'style'],
        },
      },
    },
    required: ['rules'],
  },
};

// --- Advanced tools ---

const CONDITIONAL_UPDATE_TOOL: Anthropic.Tool = {
  name: 'conditional_update',
  description:
    'Update a column with different values based on different conditions. Use for "assign East Coast to Phil, West Coast to Drue", "set priority based on deal size", or any multi-rule update.',
  input_schema: {
    type: 'object' as const,
    properties: {
      target_column: {
        type: 'string',
        description: 'The column key to update',
      },
      rules: {
        type: 'array',
        description: 'Array of condition→value rules, evaluated in order',
        items: {
          type: 'object',
          properties: {
            conditions: CONDITIONS_ARRAY_SCHEMA,
            new_value: {
              type: 'string',
              description: 'The value to set when conditions match',
            },
            label: {
              type: 'string',
              description: 'Human-readable description of this rule',
            },
          },
          required: ['conditions', 'new_value'],
        },
      },
    },
    required: ['target_column', 'rules'],
  },
};

const EXPORT_ROWS_TOOL: Anthropic.Tool = {
  name: 'export_rows',
  description:
    'Export filtered rows to CSV for download. Use for "export to CSV", "download as spreadsheet", "export Director+ titles".',
  input_schema: {
    type: 'object' as const,
    properties: {
      conditions: {
        ...CONDITIONS_ARRAY_SCHEMA,
        description:
          'Filter conditions for which rows to export. Omit or empty to export all rows.',
      },
      columns: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Column keys to include in the export. Omit to include all visible columns.',
      },
      filename: {
        type: 'string',
        description: 'Suggested filename for the download (without extension)',
      },
    },
    required: [],
  },
};

const CROSS_COLUMN_VALIDATE_TOOL: Anthropic.Tool = {
  name: 'cross_column_validate',
  description:
    'Validate data across two columns using AI. Creates a new flag column with match/mismatch results. Use for "flag where email domain doesn\'t match company", "check if phone matches country", etc.',
  input_schema: {
    type: 'object' as const,
    properties: {
      source_column: {
        type: 'string',
        description: 'First column key to compare',
      },
      target_column: {
        type: 'string',
        description: 'Second column key to compare against',
      },
      validation_prompt: {
        type: 'string',
        description:
          'Natural language description of the validation. E.g., "Check if the email domain matches the company website domain"',
      },
      flag_column_label: {
        type: 'string',
        description: 'Label for the new flag column (e.g., "Domain Match")',
      },
    },
    required: ['source_column', 'target_column', 'validation_prompt'],
  },
};

// --- All tools combined ---

const ALL_TOOLS: Anthropic.Tool[] = [
  FILTER_ROWS_TOOL,
  DELETE_ROWS_TOOL,
  UPDATE_ROWS_TOOL,
  TRANSFORM_COLUMN_TOOL,
  DEDUPLICATE_ROWS_TOOL,
  SUMMARIZE_TABLE_TOOL,
  CREATE_COLUMN_TOOL,
  CREATE_VIEW_TOOL,
  BATCH_CREATE_VIEWS_TOOL,
  SORT_ROWS_TOOL,
  APPLY_FORMATTING_TOOL,
  CONDITIONAL_UPDATE_TOOL,
  EXPORT_ROWS_TOOL,
  CROSS_COLUMN_VALIDATE_TOOL,
];

// =============================================================================
// System Prompt
// =============================================================================

function buildSystemPrompt(
  columns: ColumnInfo[],
  rowCount?: number,
  sampleValues?: Record<string, string[]>
): string {
  const columnList = columns
    .map((c) => `  - ${c.key} (label: "${c.label}", type: ${c.column_type})`)
    .join('\n');

  let sampleSection = '';
  if (sampleValues && Object.keys(sampleValues).length > 0) {
    const samples = Object.entries(sampleValues)
      .map(([key, vals]) => `  ${key}: ${vals.slice(0, 3).map((v) => `"${v}"`).join(', ')}`)
      .join('\n');
    sampleSection = `\n\nSample values (first 3 rows):\n${samples}`;
  }

  return `You are an AI assistant that parses natural language queries into structured table operations.

The user has a table with ${rowCount ?? 'unknown'} rows and the following columns:
${columnList}${sampleSection}

Select the appropriate tool based on user intent:

BASIC OPERATIONS:
- filter_rows: Show/filter rows (non-destructive view change)
- delete_rows: Remove/delete rows permanently
- update_rows: Set ONE column to ONE value for matching rows

DATA CLEANUP:
- transform_column: Reformat/clean data in a column using AI (phone formatting, trimming, extracting, standardizing)
- deduplicate_rows: Find and remove duplicate rows based on a column

ANALYTICS:
- summarize_table: Statistics, breakdowns, counts, percentages ("how many per stage?", "what % have phones?")

TABLE STRUCTURE:
- create_column: Add a new column (enrichment/AI-powered or static)
- create_view: Save current filter/sort as a named view
- batch_create_views: Split table into views by unique values in a column

VISUAL:
- sort_rows: Sort by one or more columns
- apply_formatting: Conditional color highlighting

ADVANCED:
- conditional_update: Different values based on different conditions (multi-rule update)
- export_rows: Export filtered rows to CSV
- cross_column_validate: AI-compare two columns and flag mismatches

Guidelines:
1. Match column references to actual column keys (case-insensitive)
2. For "blank"/"empty"/"missing" → is_empty operator
3. For "not blank"/"has value" → is_not_empty operator
4. Use "contains" for partial text matches
5. For enrichment columns, reference other columns with {column_key} syntax in prompts
6. Always select exactly one tool based on the user's intent`;
}

// =============================================================================
// Column Key Resolution
// =============================================================================

function resolveColumnKey(
  key: string,
  columns: ColumnInfo[]
): string | null {
  // Exact match
  if (columns.some((c) => c.key === key)) return key;

  // Case-insensitive match on key
  const byKey = columns.find(
    (c) => c.key.toLowerCase() === key.toLowerCase()
  );
  if (byKey) return byKey.key;

  // Case-insensitive match on label
  const byLabel = columns.find(
    (c) => c.label.toLowerCase() === key.toLowerCase()
  );
  if (byLabel) return byLabel.key;

  // Partial match on label (for natural language references)
  const byPartial = columns.find(
    (c) => c.label.toLowerCase().includes(key.toLowerCase()) ||
      key.toLowerCase().includes(c.label.toLowerCase())
  );
  if (byPartial) return byPartial.key;

  return null;
}

function resolveConditions(
  conditions: FilterCondition[],
  columns: ColumnInfo[]
): { resolved: FilterCondition[]; errors: string[] } {
  const resolved: FilterCondition[] = [];
  const errors: string[] = [];

  for (const condition of conditions) {
    const resolvedKey = resolveColumnKey(condition.column_key, columns);
    if (resolvedKey) {
      resolved.push({ ...condition, column_key: resolvedKey });
    } else {
      errors.push(
        `Column "${condition.column_key}" not found. Available: ${columns.map((c) => c.label).join(', ')}`
      );
    }
  }

  return { resolved, errors };
}

// =============================================================================
// Generate Column Key from Label
// =============================================================================

function generateColumnKey(label: string, existingKeys: string[]): string {
  let key = label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 40);

  if (!key) key = 'column';

  // Deduplicate
  let finalKey = key;
  let counter = 2;
  while (existingKeys.includes(finalKey)) {
    finalKey = `${key}_${counter}`;
    counter++;
  }

  return finalKey;
}

// =============================================================================
// Generate Summary
// =============================================================================

function generateSummary(
  toolName: string,
  toolInput: Record<string, unknown>,
  columns: ColumnInfo[]
): string {
  const getColLabel = (key: string) => {
    const col = columns.find((c) => c.key === key);
    return col?.label || key;
  };

  const formatConditions = (conditions: FilterCondition[]) => {
    if (!conditions || conditions.length === 0) return '';
    const parts = conditions.map((c) => {
      const label = getColLabel(c.column_key);
      switch (c.operator) {
        case 'is_empty': return `${label} is empty`;
        case 'is_not_empty': return `${label} is not empty`;
        case 'equals': return `${label} = "${c.value}"`;
        case 'not_equals': return `${label} ≠ "${c.value}"`;
        case 'contains': return `${label} contains "${c.value}"`;
        case 'not_contains': return `${label} doesn't contain "${c.value}"`;
        case 'starts_with': return `${label} starts with "${c.value}"`;
        case 'ends_with': return `${label} ends with "${c.value}"`;
        case 'greater_than': return `${label} > ${c.value}`;
        case 'less_than': return `${label} < ${c.value}`;
        default: return `${label} ${c.operator} "${c.value}"`;
      }
    });
    return ` where ${parts.join(' AND ')}`;
  };

  switch (toolName) {
    case 'filter_rows':
      return `Show rows${formatConditions(toolInput.conditions as FilterCondition[])}`;
    case 'delete_rows':
      return `Delete rows${formatConditions(toolInput.conditions as FilterCondition[])}`;
    case 'update_rows':
      return `Set "${getColLabel(toolInput.target_column as string)}" to "${toolInput.new_value}"${formatConditions(toolInput.conditions as FilterCondition[])}`;
    case 'transform_column':
      return `Transform "${getColLabel(toolInput.column_key as string)}": ${toolInput.transform_prompt}`;
    case 'deduplicate_rows':
      return `Deduplicate by "${getColLabel(toolInput.group_by_column as string)}" (keep ${(toolInput.keep_strategy as string || 'most_recent').replace(/_/g, ' ')})`;
    case 'summarize_table':
      return toolInput.group_by_column
        ? `Summarize by "${getColLabel(toolInput.group_by_column as string)}"`
        : 'Summarize table';
    case 'create_column':
      return `Create column "${toolInput.label}"${toolInput.column_type === 'enrichment' ? ' (AI-powered)' : ''}`;
    case 'create_view':
      return `Create view "${toolInput.view_name}"${formatConditions(toolInput.filter_conditions as FilterCondition[])}`;
    case 'batch_create_views':
      return `Split into views by "${getColLabel(toolInput.split_by_column as string)}"`;
    case 'sort_rows': {
      const sorts = (toolInput.sort_config as { key: string; dir: string }[]) || [];
      const sortDesc = sorts.map((s) => `${getColLabel(s.key)} ${s.dir}`).join(', then ');
      return `Sort by ${sortDesc}`;
    }
    case 'apply_formatting': {
      const rules = (toolInput.rules as { label?: string }[]) || [];
      const ruleDesc = rules.map((r) => r.label || 'rule').join(', ');
      return `Apply formatting: ${ruleDesc}`;
    }
    case 'conditional_update': {
      const cRules = (toolInput.rules as { label?: string; new_value: string }[]) || [];
      const updateDesc = cRules.map((r) => r.label || `→ "${r.new_value}"`).join(', ');
      return `Conditional update "${getColLabel(toolInput.target_column as string)}": ${updateDesc}`;
    }
    case 'export_rows':
      return `Export to CSV${formatConditions((toolInput.conditions as FilterCondition[]) || [])}`;
    case 'cross_column_validate':
      return `Validate "${getColLabel(toolInput.source_column as string)}" vs "${getColLabel(toolInput.target_column as string)}"`;
    default:
      return toolName;
  }
}

// =============================================================================
// Response Builders
// =============================================================================

function buildFilterResponse(
  toolInput: Record<string, unknown>,
  columns: ColumnInfo[],
  summary: string
) {
  const { resolved, errors } = resolveConditions(
    (toolInput.conditions as FilterCondition[]) || [],
    columns
  );
  if (errors.length > 0) return { error: errors[0] };

  return {
    type: 'filter',
    action: 'filter',
    conditions: resolved,
    summary,
  };
}

function buildDeleteResponse(
  toolInput: Record<string, unknown>,
  columns: ColumnInfo[],
  summary: string
) {
  const { resolved, errors } = resolveConditions(
    (toolInput.conditions as FilterCondition[]) || [],
    columns
  );
  if (errors.length > 0) return { error: errors[0] };

  return {
    type: 'delete',
    action: 'delete',
    conditions: resolved,
    summary,
  };
}

function buildUpdateResponse(
  toolInput: Record<string, unknown>,
  columns: ColumnInfo[],
  summary: string
) {
  const { resolved, errors } = resolveConditions(
    (toolInput.conditions as FilterCondition[]) || [],
    columns
  );
  if (errors.length > 0) return { error: errors[0] };

  const targetColumn = resolveColumnKey(toolInput.target_column as string, columns);
  if (!targetColumn) {
    return { error: `Target column "${toolInput.target_column}" not found` };
  }

  return {
    type: 'update',
    action: 'update',
    conditions: resolved,
    targetColumn,
    newValue: toolInput.new_value as string,
    summary,
  };
}

function buildTransformResponse(
  toolInput: Record<string, unknown>,
  columns: ColumnInfo[],
  summary: string
) {
  const columnKey = resolveColumnKey(toolInput.column_key as string, columns);
  if (!columnKey) {
    return { error: `Column "${toolInput.column_key}" not found` };
  }

  let resolvedConditions: FilterCondition[] | undefined;
  if (toolInput.conditions && (toolInput.conditions as FilterCondition[]).length > 0) {
    const { resolved, errors } = resolveConditions(
      toolInput.conditions as FilterCondition[],
      columns
    );
    if (errors.length > 0) return { error: errors[0] };
    resolvedConditions = resolved;
  }

  return {
    type: 'transform',
    columnKey,
    transformPrompt: toolInput.transform_prompt as string,
    conditions: resolvedConditions,
    summary,
  };
}

function buildDeduplicateResponse(
  toolInput: Record<string, unknown>,
  columns: ColumnInfo[],
  summary: string
) {
  const groupByColumn = resolveColumnKey(toolInput.group_by_column as string, columns);
  if (!groupByColumn) {
    return { error: `Column "${toolInput.group_by_column}" not found` };
  }

  return {
    type: 'deduplicate',
    groupByColumn,
    keepStrategy: (toolInput.keep_strategy as string) || 'most_recent',
    summary,
  };
}

function buildSummarizeResponse(
  toolInput: Record<string, unknown>,
  columns: ColumnInfo[],
  summary: string
) {
  let groupByColumn: string | undefined;
  if (toolInput.group_by_column) {
    groupByColumn = resolveColumnKey(toolInput.group_by_column as string, columns) ?? undefined;
    if (!groupByColumn) {
      return { error: `Column "${toolInput.group_by_column}" not found` };
    }
  }

  let metricsColumns: string[] | undefined;
  if (toolInput.metrics_columns && (toolInput.metrics_columns as string[]).length > 0) {
    metricsColumns = (toolInput.metrics_columns as string[])
      .map((k) => resolveColumnKey(k, columns))
      .filter(Boolean) as string[];
  }

  return {
    type: 'summarize',
    groupByColumn,
    metricsColumns,
    question: toolInput.question as string,
    summary,
  };
}

function buildCreateColumnResponse(
  toolInput: Record<string, unknown>,
  columns: ColumnInfo[],
  summary: string
) {
  const label = toolInput.label as string;
  const key = generateColumnKey(label, columns.map((c) => c.key));
  const columnType = (toolInput.column_type as string) || 'text';

  return {
    type: 'create_column',
    columnDef: {
      key,
      label,
      columnType,
      enrichmentPrompt: toolInput.enrichment_prompt as string | undefined,
      autoRun: toolInput.auto_run !== false,
    },
    summary,
  };
}

function buildCreateViewResponse(
  toolInput: Record<string, unknown>,
  columns: ColumnInfo[],
  summary: string
) {
  const { resolved, errors } = resolveConditions(
    (toolInput.filter_conditions as FilterCondition[]) || [],
    columns
  );
  if (errors.length > 0) return { error: errors[0] };

  let sortConfig: { key: string; dir: string } | undefined;
  if (toolInput.sort_config) {
    const sc = toolInput.sort_config as { key: string; dir: string };
    const sortKey = resolveColumnKey(sc.key, columns);
    if (sortKey) {
      sortConfig = { key: sortKey, dir: sc.dir };
    }
  }

  return {
    type: 'create_view',
    viewName: toolInput.view_name as string,
    filterConditions: resolved,
    sortConfig,
    summary,
  };
}

function buildBatchCreateViewsResponse(
  toolInput: Record<string, unknown>,
  columns: ColumnInfo[],
  summary: string
) {
  const splitByColumn = resolveColumnKey(toolInput.split_by_column as string, columns);
  if (!splitByColumn) {
    return { error: `Column "${toolInput.split_by_column}" not found` };
  }

  return {
    type: 'batch_create_views',
    splitByColumn,
    summary,
  };
}

function buildSortResponse(
  toolInput: Record<string, unknown>,
  columns: ColumnInfo[],
  summary: string
) {
  const sortConfig = (toolInput.sort_config as { key: string; dir: string }[]) || [];
  const resolved = sortConfig
    .map((s) => {
      const key = resolveColumnKey(s.key, columns);
      return key ? { key, dir: s.dir } : null;
    })
    .filter(Boolean) as { key: string; dir: string }[];

  if (resolved.length === 0) {
    return { error: 'No valid sort columns found' };
  }

  return {
    type: 'sort',
    sortConfig: resolved,
    summary,
  };
}

function buildFormattingResponse(
  toolInput: Record<string, unknown>,
  columns: ColumnInfo[],
  summary: string
) {
  const rules = (toolInput.rules as {
    conditions: FilterCondition[];
    style: { bg_color?: string; text_color?: string };
    label?: string;
  }[]) || [];

  const resolvedRules = rules.map((rule) => {
    const { resolved } = resolveConditions(rule.conditions, columns);
    return {
      conditions: resolved,
      style: rule.style,
      label: rule.label,
    };
  });

  return {
    type: 'formatting',
    rules: resolvedRules,
    summary,
  };
}

function buildConditionalUpdateResponse(
  toolInput: Record<string, unknown>,
  columns: ColumnInfo[],
  summary: string
) {
  const targetColumn = resolveColumnKey(toolInput.target_column as string, columns);
  if (!targetColumn) {
    return { error: `Target column "${toolInput.target_column}" not found` };
  }

  const rules = (toolInput.rules as {
    conditions: FilterCondition[];
    new_value: string;
    label?: string;
  }[]) || [];

  const resolvedRules = rules.map((rule) => {
    const { resolved } = resolveConditions(rule.conditions, columns);
    return {
      conditions: resolved,
      newValue: rule.new_value,
      label: rule.label,
    };
  });

  return {
    type: 'conditional_update',
    targetColumn,
    rules: resolvedRules,
    summary,
  };
}

function buildExportResponse(
  toolInput: Record<string, unknown>,
  columns: ColumnInfo[],
  summary: string
) {
  let resolvedConditions: FilterCondition[] | undefined;
  if (toolInput.conditions && (toolInput.conditions as FilterCondition[]).length > 0) {
    const { resolved, errors } = resolveConditions(
      toolInput.conditions as FilterCondition[],
      columns
    );
    if (errors.length > 0) return { error: errors[0] };
    resolvedConditions = resolved;
  }

  let exportColumns: string[] | undefined;
  if (toolInput.columns && (toolInput.columns as string[]).length > 0) {
    exportColumns = (toolInput.columns as string[])
      .map((k) => resolveColumnKey(k, columns))
      .filter(Boolean) as string[];
  }

  return {
    type: 'export',
    conditions: resolvedConditions,
    columns: exportColumns,
    filename: (toolInput.filename as string) || 'export',
    summary,
  };
}

function buildCrossColumnValidateResponse(
  toolInput: Record<string, unknown>,
  columns: ColumnInfo[],
  summary: string
) {
  const sourceColumn = resolveColumnKey(toolInput.source_column as string, columns);
  if (!sourceColumn) {
    return { error: `Source column "${toolInput.source_column}" not found` };
  }

  const targetColumn = resolveColumnKey(toolInput.target_column as string, columns);
  if (!targetColumn) {
    return { error: `Target column "${toolInput.target_column}" not found` };
  }

  return {
    type: 'cross_column_validate',
    sourceColumn,
    targetColumn,
    validationPrompt: toolInput.validation_prompt as string,
    flagColumnLabel: (toolInput.flag_column_label as string) || 'Validation Result',
    summary,
  };
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
    const { tableId, query, columns, rowCount, sampleValues } = body;

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
    const systemPrompt = buildSystemPrompt(columns, rowCount, sampleValues);

    // Call Claude with tool use
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools: ALL_TOOLS,
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
        "I couldn't understand that query. Try something like 'delete rows with blank emails', 'sort by company', or 'how many leads per stage?'.",
        req,
        400
      );
    }

    // Parse tool response into structured operation
    const toolName = toolUseBlock.name;
    const toolInput = toolUseBlock.input as Record<string, unknown>;

    console.log(`${LOG_PREFIX} Tool selected: ${toolName}`);

    // Generate summary
    const summary = generateSummary(toolName, toolInput, columns);

    // Build typed response based on tool
    let result: Record<string, unknown>;

    switch (toolName) {
      case 'filter_rows':
        result = buildFilterResponse(toolInput, columns, summary);
        break;
      case 'delete_rows':
        result = buildDeleteResponse(toolInput, columns, summary);
        break;
      case 'update_rows':
        result = buildUpdateResponse(toolInput, columns, summary);
        break;
      case 'transform_column':
        result = buildTransformResponse(toolInput, columns, summary);
        break;
      case 'deduplicate_rows':
        result = buildDeduplicateResponse(toolInput, columns, summary);
        break;
      case 'summarize_table':
        result = buildSummarizeResponse(toolInput, columns, summary);
        break;
      case 'create_column':
        result = buildCreateColumnResponse(toolInput, columns, summary);
        break;
      case 'create_view':
        result = buildCreateViewResponse(toolInput, columns, summary);
        break;
      case 'batch_create_views':
        result = buildBatchCreateViewsResponse(toolInput, columns, summary);
        break;
      case 'sort_rows':
        result = buildSortResponse(toolInput, columns, summary);
        break;
      case 'apply_formatting':
        result = buildFormattingResponse(toolInput, columns, summary);
        break;
      case 'conditional_update':
        result = buildConditionalUpdateResponse(toolInput, columns, summary);
        break;
      case 'export_rows':
        result = buildExportResponse(toolInput, columns, summary);
        break;
      case 'cross_column_validate':
        result = buildCrossColumnValidateResponse(toolInput, columns, summary);
        break;
      default:
        return errorResponse(`Unknown tool: ${toolName}`, req, 400);
    }

    // Check for column resolution errors
    if (result.error) {
      return errorResponse(result.error as string, req, 400);
    }

    console.log(`${LOG_PREFIX} Parsed operation:`, JSON.stringify(result));

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
