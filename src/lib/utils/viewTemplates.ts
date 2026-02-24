import type { OpsTableColumn, FilterCondition, SortConfig } from '@/lib/services/opsTableService';
import type { FormattingRule } from '@/lib/utils/conditionalFormatting';

// ---------------------------------------------------------------------------
// Template types
// ---------------------------------------------------------------------------

export interface ViewTemplate {
  id: string;
  name: string;
  description: string;
  category: 'segmentation' | 'outreach' | 'data_quality' | 'analytics' | 'sync';
  icon: string; // lucide icon name
  /** Returns a view config or null if columns don't match */
  build: (columns: OpsTableColumn[]) => ViewTemplateResult | null;
}

export interface ViewTemplateResult {
  name: string;
  filters: FilterCondition[];
  sorts: SortConfig[];
  columnOrder: string[] | null;
  formattingRules: FormattingRule[];
}

// ---------------------------------------------------------------------------
// Column matchers
// ---------------------------------------------------------------------------

function findCol(columns: OpsTableColumn[], test: (c: OpsTableColumn) => boolean) {
  return columns.find(test) ?? null;
}

function findByType(columns: OpsTableColumn[], type: string) {
  return findCol(columns, (c) => c.column_type === type);
}

function findByKeyPattern(columns: OpsTableColumn[], pattern: RegExp) {
  return findCol(columns, (c) => pattern.test(c.key) || pattern.test(c.label.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const VIEW_TEMPLATES: ViewTemplate[] = [
  {
    id: 'outreach-ready',
    name: 'Email Outreach Ready',
    description: 'Contacts with verified email addresses, sorted by score',
    category: 'outreach',
    icon: 'Mail',
    build: (cols) => {
      const emailCol = findByType(cols, 'email');
      if (!emailCol) return null;
      const scoreCol = findByKeyPattern(cols, /score|rating|rank|icp/i);
      return {
        name: 'Outreach Ready',
        filters: [{ column_key: emailCol.key, operator: 'is_not_empty', value: '' }],
        sorts: scoreCol ? [{ key: scoreCol.key, dir: 'desc' }] : [],
        columnOrder: null,
        formattingRules: [],
      };
    },
  },
  {
    id: 'decision-makers',
    name: 'Decision Makers',
    description: 'VPs, Directors, C-suite — senior contacts only',
    category: 'segmentation',
    icon: 'Crown',
    build: (cols) => {
      const titleCol = findByKeyPattern(cols, /title|role|position|job/i);
      if (!titleCol) return null;
      return {
        name: 'Decision Makers',
        filters: [{ column_key: titleCol.key, operator: 'contains', value: 'VP' }],
        sorts: [],
        columnOrder: null,
        formattingRules: [],
      };
    },
  },
  {
    id: 'data-quality',
    name: 'Data Quality Audit',
    description: 'Find rows with missing critical fields (email, phone, company)',
    category: 'data_quality',
    icon: 'ShieldAlert',
    build: (cols) => {
      const emailCol = findByType(cols, 'email');
      const phoneCol = findByType(cols, 'phone');
      if (!emailCol && !phoneCol) return null;
      const target = emailCol ?? phoneCol!;
      return {
        name: 'Missing Data',
        filters: [{ column_key: target.key, operator: 'is_empty', value: '' }],
        sorts: [],
        columnOrder: null,
        formattingRules: [{
          id: crypto.randomUUID(),
          column_key: target.key,
          operator: 'is_empty' as const,
          value: '',
          scope: 'row' as const,
          style: { backgroundColor: 'rgba(239, 68, 68, 0.15)', textColor: '#fca5a5' },
        }],
      };
    },
  },
  {
    id: 'top-scored',
    name: 'Top Performers',
    description: 'Highest-scoring contacts or leads',
    category: 'analytics',
    icon: 'TrendingUp',
    build: (cols) => {
      const scoreCol = findByKeyPattern(cols, /score|rating|rank|icp|fit/i);
      if (!scoreCol) return null;
      return {
        name: 'Top Performers',
        filters: [],
        sorts: [{ key: scoreCol.key, dir: 'desc' }],
        columnOrder: null,
        formattingRules: [],
      };
    },
  },
  {
    id: 'recently-updated',
    name: 'Recently Updated',
    description: 'Most recently modified entries first',
    category: 'analytics',
    icon: 'Clock',
    build: (cols) => {
      const dateCol = findByType(cols, 'date') ?? findByKeyPattern(cols, /date|updated|modified|created/i);
      if (!dateCol) return null;
      return {
        name: 'Recently Updated',
        filters: [],
        sorts: [{ key: dateCol.key, dir: 'desc' }],
        columnOrder: null,
        formattingRules: [],
      };
    },
  },
  {
    id: 'has-phone',
    name: 'Phone Available',
    description: 'Contacts with phone numbers for direct outreach',
    category: 'outreach',
    icon: 'Phone',
    build: (cols) => {
      const phoneCol = findByType(cols, 'phone');
      if (!phoneCol) return null;
      return {
        name: 'Has Phone',
        filters: [{ column_key: phoneCol.key, operator: 'is_not_empty', value: '' }],
        sorts: [],
        columnOrder: null,
        formattingRules: [],
      };
    },
  },
  {
    id: 'hubspot-synced',
    name: 'HubSpot Synced',
    description: 'Contacts with HubSpot properties synced',
    category: 'sync',
    icon: 'RefreshCw',
    build: (cols) => {
      const hubspotCol = findCol(cols, (c) => !!c.hubspot_property_name);
      if (!hubspotCol) return null;
      return {
        name: 'HubSpot Synced',
        filters: [{ column_key: hubspotCol.key, operator: 'is_not_empty', value: '' }],
        sorts: [],
        columnOrder: null,
        formattingRules: [],
      };
    },
  },
  {
    id: 'pipeline-review',
    name: 'Pipeline Review',
    description: 'Group by status with score-based sorting',
    category: 'analytics',
    icon: 'BarChart3',
    build: (cols) => {
      const statusCol = findByType(cols, 'status') ?? findByType(cols, 'dropdown') ?? findByKeyPattern(cols, /status|stage|pipeline/i);
      const scoreCol = findByKeyPattern(cols, /score|rating|rank|icp/i);
      if (!statusCol) return null;
      return {
        name: 'Pipeline Review',
        filters: [],
        sorts: scoreCol ? [{ key: scoreCol.key, dir: 'desc' }] : [],
        columnOrder: null,
        formattingRules: [],
      };
    },
  },
];

/**
 * Get applicable templates for a set of columns.
 * Returns templates that can match, sorted by relevance.
 */
export function getApplicableTemplates(columns: OpsTableColumn[]): {
  template: ViewTemplate;
  result: ViewTemplateResult;
}[] {
  const applicable: { template: ViewTemplate; result: ViewTemplateResult }[] = [];
  for (const template of VIEW_TEMPLATES) {
    const result = template.build(columns);
    if (result) {
      applicable.push({ template, result });
    }
  }
  return applicable;
}
