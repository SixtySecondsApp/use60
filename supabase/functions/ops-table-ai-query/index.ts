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

const MODEL = 'claude-haiku-4-5-20251001';
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
  sessionId?: string; // OI-026: Conversational context
  recipeId?: string; // OI-015: Execute saved recipe
  saveAsRecipe?: { // OI-015: Save current query as recipe
    name: string;
    description?: string;
    triggerType?: string;
  };
  action?: string; // OI-015: Action type for save_recipe/execute_recipe
  parsedAction?: any; // OI-015: Parsed action config for saving
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
                  enum: ['green', 'red', 'amber', 'yellow', 'blue', 'purple', 'orange', 'gold'],
                  description: 'Highlight color name',
                },
                text_color: {
                  type: 'string',
                  description:
                    'Optional text color override (Tailwind suffix like "green-300"). Usually omit — the bg_color auto-selects a matching text color.',
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

// Move rows to top/bottom
const MOVE_ROWS_TOOL: Anthropic.Tool = {
  name: 'move_rows',
  description:
    'Move specific rows to the top or bottom of the table. Use for "put Zak at the bottom", "move completed deals to the top", "send blank rows to the bottom", etc. This repositions matching rows without changing the sort order of other rows.',
  input_schema: {
    type: 'object' as const,
    properties: {
      conditions: CONDITIONS_ARRAY_SCHEMA,
      position: {
        type: 'string',
        enum: ['top', 'bottom'],
        description: 'Where to move the matching rows',
      },
    },
    required: ['conditions', 'position'],
  },
};

// OI-021: Cross-table query tool
const CROSS_TABLE_QUERY_TOOL: Anthropic.Tool = {
  name: 'cross_table_query',
  description:
    'ONLY use when the user explicitly asks to cross-reference, enrich from, or compare against a DIFFERENT table or data source (e.g. "cross-reference with deals", "pull meeting notes for these contacts", "compare against the Bristol table"). Do NOT use for filtering, sorting, or querying within the current table.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description:
          'Natural language description of the cross-table operation. Examples: "Cross-reference with deals table", "Pull Fathom meeting notes for these contacts", "Compare against outreach table, show net-new only"',
      },
      target_sources: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional specific data sources to query. Available: other ops table names, "contacts", "deals", "companies", "activities", "meetings"',
      },
    },
    required: ['query'],
  },
};

const SUGGEST_VIEWS_TOOL: Anthropic.Tool = {
  name: 'suggest_views',
  description:
    'Analyze the table data and suggest 3-5 useful saved views based on column types, value patterns, and common sales ops workflows. Use when the user says "__suggest_views__" or asks for view recommendations.',
  input_schema: {
    type: 'object' as const,
    properties: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'View name' },
            description: { type: 'string', description: 'Why this view is useful' },
            filter_conditions: CONDITIONS_ARRAY_SCHEMA,
            sort_config: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string' },
                  dir: { type: 'string', enum: ['asc', 'desc'] },
                },
                required: ['key', 'dir'],
              },
            },
          },
          required: ['name', 'description', 'filter_conditions'],
        },
        description: '3-5 suggested views',
      },
    },
    required: ['suggestions'],
  },
};

const CONFIGURE_VIEW_TOOL: Anthropic.Tool = {
  name: 'configure_view',
  description:
    'Parse a natural language view description into a structured view configuration. Use when the user describes what they want to see in a view, like "show me California leads with > $10k deal size, sorted by score, hide the email column".',
  input_schema: {
    type: 'object' as const,
    properties: {
      view_name: { type: 'string', description: 'Suggested view name' },
      filter_conditions: CONDITIONS_ARRAY_SCHEMA,
      sort_config: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            dir: { type: 'string', enum: ['asc', 'desc'] },
          },
          required: ['key', 'dir'],
        },
      },
      hidden_columns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Column keys to hide from the view',
      },
    },
    required: ['view_name', 'filter_conditions'],
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
  MOVE_ROWS_TOOL,
  CROSS_TABLE_QUERY_TOOL, // OI-021
  SUGGEST_VIEWS_TOOL,     // PV-009
  CONFIGURE_VIEW_TOOL,    // PV-010
];

// =============================================================================
// System Prompt
// =============================================================================

function buildSystemPrompt(
  columns: ColumnInfo[],
  rowCount?: number,
  sampleValues?: Record<string, string[]>,
  conversationHistory: Array<{ role: string; content: string }> = [],
  tableContext: Record<string, any> = {},
  availableDataSources: Array<{ source_name: string; source_type: string }> = []
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

  // OI-026: Build conversational context section
  let contextSection = '';
  if (conversationHistory.length > 0 || Object.keys(tableContext).length > 0) {
    const recentMessages = conversationHistory.slice(-10);
    const conversationText = recentMessages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    contextSection = `\n\nCURRENT TABLE STATE:
- Current filters: ${JSON.stringify(tableContext.current_filters || [])}
- Current sort: ${JSON.stringify(tableContext.current_sort || null)}
- Visible columns: ${tableContext.visible_columns?.join(', ') || 'all'}
- Row count: ${tableContext.row_count || 'unknown'}

CONVERSATION HISTORY (last 10 messages):
${conversationText || 'No previous messages'}

When the user asks follow-up questions like "just the senior ones" or "how many?", use the context above to understand what they're referring to. Build upon previous filters and operations where appropriate.`;
  }

  // OI-021: Build available data sources section for cross-table queries
  let dataSourcesSection = '';
  if (availableDataSources.length > 0) {
    const sourcesList = availableDataSources
      .map((s) => `  - ${s.source_name} (${s.source_type})`)
      .join('\n');

    dataSourcesSection = `\n\nAVAILABLE DATA SOURCES FOR CROSS-TABLE QUERIES:
${sourcesList}

Use the cross_table_query tool to join or enrich data from these sources.`;
  }

  const hasColumns = columns.length > 0;

  return `You are an AI assistant that parses natural language queries into structured table operations.

${hasColumns
    ? `The user has a table with ${rowCount ?? 'unknown'} rows and the following columns:\n${columnList}${sampleSection}`
    : `The user has a NEW TABLE with no columns yet. When they describe data they want (e.g. "add columns for name, email, and company" or "create a lead tracking table"), use the create_column tool to add each column. Infer appropriate column_type from the data description (e.g. "email" → email, "website" → url, "phone" → phone, "LinkedIn" → linkedin, "company" → company, "name" → person). You can call create_column multiple times.`
  }${contextSection}${dataSourcesSection}

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
- move_rows: Move specific rows to top or bottom ("put Zak at the bottom", "move empty rows to bottom")
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
6. Always select exactly one tool based on the user's intent
7. SORT: For "who has X first" / "non-empty first" / "filled values first" → use sort_rows with dir: "asc". Empty values are automatically pushed to the end. For "empty first" → use filter_rows with is_empty.
8. FORMAT: When asked to highlight a person's row or a matching row, use apply_formatting with the conditions that identify the row. The entire row gets highlighted, not just one cell.
9. FORMAT: Use sample values to identify which column a person's name is in. If the query says "Zak", look at sample values to find which column contains "Zak".`;
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
    case 'move_rows':
      return `Move rows${formatConditions(toolInput.conditions as FilterCondition[])} to ${toolInput.position}`;
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

function buildSuggestViewsResponse(
  toolInput: Record<string, unknown>,
  columns: ColumnInfo[],
  summary: string
) {
  const suggestions = (toolInput.suggestions as Array<{
    name: string;
    description: string;
    filter_conditions?: Array<{ column_key: string; operator: string; value?: string }>;
    sort_config?: Array<{ key: string; dir: string }>;
  }>) || [];

  const resolved = suggestions.map((s) => ({
    name: s.name,
    description: s.description,
    filterConditions: (s.filter_conditions || [])
      .map((c) => {
        const key = resolveColumnKey(c.column_key, columns);
        return key ? { column_key: key, operator: c.operator, value: c.value ?? '' } : null;
      })
      .filter(Boolean),
    sortConfig: (s.sort_config || [])
      .map((sc) => {
        const key = resolveColumnKey(sc.key, columns);
        return key ? { key, dir: sc.dir } : null;
      })
      .filter(Boolean),
  }));

  return {
    type: 'suggest_views',
    suggestions: resolved,
    summary,
  };
}

function buildConfigureViewResponse(
  toolInput: Record<string, unknown>,
  columns: ColumnInfo[],
  summary: string
) {
  const viewName = (toolInput.view_name as string) || 'Custom View';
  const filterConditions = ((toolInput.filter_conditions as Array<{ column_key: string; operator: string; value?: string }>) || [])
    .map((c) => {
      const key = resolveColumnKey(c.column_key, columns);
      return key ? { column_key: key, operator: c.operator, value: c.value ?? '' } : null;
    })
    .filter(Boolean);
  const sortConfig = ((toolInput.sort_config as Array<{ key: string; dir: string }>) || [])
    .map((s) => {
      const key = resolveColumnKey(s.key, columns);
      return key ? { key, dir: s.dir } : null;
    })
    .filter(Boolean);
  const hiddenColumns = ((toolInput.hidden_columns as string[]) || [])
    .map((k) => resolveColumnKey(k, columns))
    .filter(Boolean) as string[];

  return {
    type: 'configure_view',
    viewName,
    filterConditions,
    sortConfig,
    hiddenColumns,
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

function buildMoveRowsResponse(
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
    type: 'move_rows',
    conditions: resolved,
    position: toolInput.position as string,
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

    console.log(`${LOG_PREFIX} Body received:`, JSON.stringify({
      hasTableId: !!tableId,
      hasQuery: !!query,
      hasColumns: !!columns,
      columnsLength: columns?.length ?? 'null',
      bodyKeys: Object.keys(body),
    }));

    if (!tableId || !query) {
      return errorResponse(
        `Missing required fields: ${!tableId ? 'tableId' : ''} ${!query ? 'query' : ''}`.trim(),
        req,
        400
      );
    }

    // Columns may be empty for new/fresh tables — AI can still create columns
    const effectiveColumns = columns ?? [];

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

    // OI-026: Load or create chat session for conversational context
    let conversationHistory: Array<{ role: string; content: string }> = [];
    let tableContext: Record<string, any> = {};
    let currentSessionId = body.sessionId;

    if (body.sessionId) {
      const { data: session } = await supabase
        .from('ops_table_chat_sessions')
        .select('*')
        .eq('id', body.sessionId)
        .maybeSingle();

      if (session) {
        conversationHistory = session.messages || [];
        tableContext = session.context || {};
      }
    } else {
      // Create new session
      const { data: newSession } = await supabase
        .from('ops_table_chat_sessions')
        .insert({
          table_id: tableId,
          user_id: user.id,
          messages: [],
          context: {},
        })
        .select()
        .maybeSingle();

      if (newSession) {
        currentSessionId = newSession.id;
      }
    }

    // OI-015: Handle save_recipe action
    if (body.action === 'save_recipe' && body.saveAsRecipe) {
      const { saveAsRecipe, parsedAction } = body;

      const { data: recipe, error: saveError } = await supabase
        .from('ops_table_recipes')
        .insert({
          org_id: (await supabase.from('dynamic_tables').select('organization_id').eq('id', tableId).single()).data?.organization_id,
          table_id: tableId,
          created_by: user.id,
          name: saveAsRecipe.name,
          description: saveAsRecipe.description,
          query_text: body.query,
          parsed_config: parsedAction, // Store the AI-parsed action
          trigger_type: saveAsRecipe.triggerType || 'one_shot',
          run_count: 0,
        })
        .select()
        .single();

      if (saveError) throw saveError;

      return jsonResponse({ type: 'recipe_saved', recipe }, req);
    }

    // OI-015: Handle execute_recipe action
    if (body.action === 'execute_recipe' && body.recipeId) {
      const { recipeId } = body;

      // Load recipe
      const { data: recipe, error: recipeError } = await supabase
        .from('ops_table_recipes')
        .select('*')
        .eq('id', recipeId)
        .single();

      if (recipeError) throw recipeError;

      // Use stored parsed_config to build result (skip AI parsing)
      const result = {
        ...recipe.parsed_config,
        summary: `Executed recipe: ${recipe.name}`,
      };

      // Increment run count
      await supabase
        .from('ops_table_recipes')
        .update({
          run_count: (recipe.run_count || 0) + 1,
          last_run_at: new Date().toISOString(),
        })
        .eq('id', recipeId);

      return jsonResponse(result, req);
    }

    // OI-021: Load available data sources for cross-table queries
    const { data: availableDataSources } = await supabase
      .rpc('get_available_data_sources', { p_table_id: tableId })
      .returns<Array<{ source_name: string; source_type: string }>>() || { data: [] };

    // Initialize Anthropic client
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    // Build system prompt with column context, conversation history, and available data sources
    const systemPrompt = buildSystemPrompt(
      effectiveColumns,
      rowCount,
      sampleValues,
      conversationHistory,
      tableContext,
      availableDataSources || []
    );

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

    // Extract ALL tool_use blocks from response
    const allToolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (allToolUseBlocks.length === 0) {
      console.error(`${LOG_PREFIX} No tool use in response`, response.content);
      return errorResponse(
        "I couldn't understand that query. Try something like 'delete rows with blank emails', 'sort by company', or 'how many leads per stage?'.",
        req,
        400
      );
    }

    // Check for batch create_column: if multiple tool calls are all create_column, batch them
    const allCreateColumn = allToolUseBlocks.every((b) => b.name === 'create_column');
    if (allCreateColumn && allToolUseBlocks.length > 1) {
      console.log(`${LOG_PREFIX} Batch create_column: ${allToolUseBlocks.length} columns`);
      const columnDefs = allToolUseBlocks.map((block) => {
        const input = block.input as Record<string, unknown>;
        const label = input.label as string;
        const key = generateColumnKey(label, effectiveColumns.map((c) => c.key));
        // Add key to effectiveColumns so next column doesn't collide
        effectiveColumns.push({ key, label, column_type: (input.column_type as string) || 'text' });
        return {
          key,
          label,
          columnType: (input.column_type as string) || 'text',
          enrichmentPrompt: input.enrichment_prompt as string | undefined,
          autoRun: input.auto_run !== false,
        };
      });
      const summaryText = `Created ${columnDefs.length} columns: ${columnDefs.map((c) => c.label).join(', ')}`;
      const batchResult: Record<string, unknown> = {
        type: 'batch_create_columns',
        columnDefs,
        summary: summaryText,
        sessionId: currentSessionId,
      };

      return jsonResponse(batchResult, req);
    }

    // Single tool call — use the first one
    const toolUseBlock = allToolUseBlocks[0];

    // Parse tool response into structured operation
    const toolName = toolUseBlock.name;
    const toolInput = toolUseBlock.input as Record<string, unknown>;

    console.log(`${LOG_PREFIX} Tool selected: ${toolName}`);

    // Generate summary
    const summary = generateSummary(toolName, toolInput, effectiveColumns);

    // Build typed response based on tool
    let result: Record<string, unknown>;

    switch (toolName) {
      case 'filter_rows':
        result = buildFilterResponse(toolInput, effectiveColumns, summary);
        break;
      case 'delete_rows':
        result = buildDeleteResponse(toolInput, effectiveColumns, summary);
        break;
      case 'update_rows':
        result = buildUpdateResponse(toolInput, effectiveColumns, summary);
        break;
      case 'transform_column':
        result = buildTransformResponse(toolInput, effectiveColumns, summary);
        break;
      case 'deduplicate_rows':
        result = buildDeduplicateResponse(toolInput, effectiveColumns, summary);
        break;
      case 'summarize_table':
        result = buildSummarizeResponse(toolInput, effectiveColumns, summary);
        break;
      case 'create_column':
        result = buildCreateColumnResponse(toolInput, effectiveColumns, summary);
        break;
      case 'create_view':
        result = buildCreateViewResponse(toolInput, effectiveColumns, summary);
        break;
      case 'batch_create_views':
        result = buildBatchCreateViewsResponse(toolInput, effectiveColumns, summary);
        break;
      case 'sort_rows':
        result = buildSortResponse(toolInput, effectiveColumns, summary);
        break;
      case 'apply_formatting':
        result = buildFormattingResponse(toolInput, effectiveColumns, summary);
        break;
      case 'conditional_update':
        result = buildConditionalUpdateResponse(toolInput, effectiveColumns, summary);
        break;
      case 'export_rows':
        result = buildExportResponse(toolInput, effectiveColumns, summary);
        break;
      case 'move_rows':
        result = buildMoveRowsResponse(toolInput, effectiveColumns, summary);
        break;
      case 'cross_column_validate':
        result = buildCrossColumnValidateResponse(toolInput, effectiveColumns, summary);
        break;
      // PV-009: Suggest views
      case 'suggest_views':
        result = buildSuggestViewsResponse(toolInput, effectiveColumns, summary);
        break;

      // PV-010: Configure view from natural language
      case 'configure_view':
        result = buildConfigureViewResponse(toolInput, effectiveColumns, summary);
        break;

      // OI-021: Cross-table query handler
      case 'cross_table_query': {
        const { query: crossQuery, target_sources } = toolInput;

        // Delegate to cross-query edge function
        const { data: crossResult, error: crossError } = await supabase.functions.invoke(
          'ops-table-cross-query',
          {
            body: { tableId, query: crossQuery, dataSources: target_sources },
          }
        );

        if (crossError) {
          throw new Error(`Cross-table query failed: ${crossError.message}`);
        }

        result = {
          type: 'cross_query' as const,
          joinConfig: crossResult.joinConfig,
          enrichedRows: crossResult.enrichedRows,
          newColumns: crossResult.newColumns,
          matched: crossResult.matched,
          netNew: crossResult.netNew,
          summary: summary || 'Cross-table query completed',
        };
        break;
      }
      default:
        return errorResponse(`Unknown tool: ${toolName}`, req, 400);
    }

    // Check for column resolution errors
    if (result.error) {
      return errorResponse(result.error as string, req, 400);
    }

    console.log(`${LOG_PREFIX} Parsed operation:`, JSON.stringify(result));

    // OI-026: Update chat session with new messages and context
    if (currentSessionId) {
      const newUserMessage = {
        role: 'user',
        content: query,
        timestamp: new Date().toISOString(),
        action_result: null,
      };

      const newAssistantMessage = {
        role: 'assistant',
        content: `Executed ${result.type || result.action} action`,
        timestamp: new Date().toISOString(),
      };

      const updatedMessages = [...conversationHistory, newUserMessage, newAssistantMessage];

      // Update context with current table state
      const updatedContext = {
        current_filters: result.conditions || result.filterConditions || tableContext.current_filters,
        current_sort: result.sortConfig || tableContext.current_sort,
        visible_columns: result.visibleColumns || tableContext.visible_columns,
        row_count: rowCount,
        last_query_result: result,
      };

      await supabase
        .from('ops_table_chat_sessions')
        .update({
          messages: updatedMessages,
          context: updatedContext,
        })
        .eq('id', currentSessionId);

      // Add session info to response
      result.sessionId = currentSessionId;
      result.sessionMessages = updatedMessages;
    }

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
