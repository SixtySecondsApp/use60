import type { OpsTableColumn, OpsTableRow } from '@/lib/services/opsTableService';
import type { FormattingRule } from '@/lib/utils/conditionalFormatting';

// Color palette for dropdown/status values
const PALETTE = [
  { bg: 'rgba(34, 197, 94, 0.15)', text: '#4ade80' },   // green
  { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa' },   // blue
  { bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc' },   // purple
  { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24' },   // amber
  { bg: 'rgba(236, 72, 153, 0.15)', text: '#f472b6' },   // pink
  { bg: 'rgba(6, 182, 212, 0.15)', text: '#22d3ee' },    // cyan
  { bg: 'rgba(239, 68, 68, 0.15)', text: '#fca5a5' },    // red
  { bg: 'rgba(163, 163, 163, 0.15)', text: '#a3a3a3' },  // gray
];

/**
 * Generate smart formatting rules based on column types and data distributions.
 */
export function generateAutoFormatRules(
  columns: OpsTableColumn[],
  rows: OpsTableRow[]
): FormattingRule[] {
  const rules: FormattingRule[] = [];

  for (const col of columns) {
    // ---- Dropdown/Status columns: color per unique value ----
    if (col.column_type === 'dropdown' || col.column_type === 'status') {
      // Use dropdown_options colors if available
      if (col.dropdown_options && col.dropdown_options.length > 0) {
        col.dropdown_options.forEach((opt, i) => {
          const color = PALETTE[i % PALETTE.length];
          rules.push({
            id: crypto.randomUUID(),
            column_key: col.key,
            operator: 'equals',
            value: opt.value,
            scope: 'cell',
            style: {
              backgroundColor: color.bg,
              textColor: color.text,
            },
          });
        });
      } else {
        // Infer from data
        const uniqueVals = new Set<string>();
        for (const row of rows) {
          const v = row.cells[col.key]?.value;
          if (v) uniqueVals.add(v);
        }
        let i = 0;
        for (const val of uniqueVals) {
          const color = PALETTE[i % PALETTE.length];
          rules.push({
            id: crypto.randomUUID(),
            column_key: col.key,
            operator: 'equals',
            value: val,
            scope: 'cell',
            style: {
              backgroundColor: color.bg,
              textColor: color.text,
            },
          });
          i++;
          if (i >= 8) break; // Max 8 colors
        }
      }
    }

    // ---- Number columns: red/yellow/green gradient ----
    if (col.column_type === 'number') {
      const nums: number[] = [];
      for (const row of rows) {
        const v = parseFloat(row.cells[col.key]?.value ?? '');
        if (!isNaN(v)) nums.push(v);
      }
      if (nums.length > 2) {
        const sorted = nums.sort((a, b) => a - b);
        const p33 = sorted[Math.floor(sorted.length * 0.33)];
        const p66 = sorted[Math.floor(sorted.length * 0.66)];
        rules.push(
          {
            id: crypto.randomUUID(),
            column_key: col.key,
            operator: 'less_than',
            value: String(p33),
            scope: 'cell',
            style: { backgroundColor: 'rgba(239, 68, 68, 0.15)', textColor: '#fca5a5' },
          },
          {
            id: crypto.randomUUID(),
            column_key: col.key,
            operator: 'greater_than',
            value: String(p66),
            scope: 'cell',
            style: { backgroundColor: 'rgba(34, 197, 94, 0.15)', textColor: '#4ade80' },
          }
        );
      }
    }

    // ---- Empty required-looking fields: red ----
    if (col.column_type === 'email' || col.column_type === 'phone') {
      rules.push({
        id: crypto.randomUUID(),
        column_key: col.key,
        operator: 'is_empty',
        value: '',
        scope: 'cell',
        style: { backgroundColor: 'rgba(239, 68, 68, 0.1)', textColor: '#f87171' },
      });
    }

    // ---- Person columns: bold ----
    if (col.column_type === 'person') {
      rules.push({
        id: crypto.randomUUID(),
        column_key: col.key,
        operator: 'is_not_empty',
        value: '',
        scope: 'cell',
        style: { bold: true },
      });
    }
  }

  return rules;
}
