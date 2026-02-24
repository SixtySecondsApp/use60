import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { CRMFieldMapping, DetectedField } from '@/lib/hooks/useCRMFieldMapping';

// ============================================================
// Known sixty field names for the select dropdown
// ============================================================

const SIXTY_FIELD_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'phone', label: 'Phone' },
  { value: 'mobile_phone', label: 'Mobile Phone' },
  { value: 'company_name', label: 'Company Name' },
  { value: 'job_title', label: 'Job Title' },
  { value: 'website', label: 'Website' },
  { value: 'city', label: 'City' },
  { value: 'country', label: 'Country' },
  { value: 'linkedin_url', label: 'LinkedIn URL' },
  { value: 'name', label: 'Name (Deal)' },
  { value: 'value', label: 'Value (Deal)' },
  { value: 'stage', label: 'Stage (Deal)' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'expected_close_date', label: 'Expected Close Date' },
  { value: 'description', label: 'Description' },
  { value: 'next_steps', label: 'Next Steps' },
  { value: 'notes', label: 'Notes' },
  { value: 'owner_id', label: 'Owner' },
  { value: 'stage_probability', label: 'Stage Probability' },
  { value: 'contacts_count', label: 'Contacts Count' },
];

// ============================================================
// Confidence Badge
// ============================================================

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 0.8) {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-xs">
        {Math.round(confidence * 100)}%
      </Badge>
    );
  }
  if (confidence >= 0.5) {
    return (
      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 text-xs">
        {Math.round(confidence * 100)}%
      </Badge>
    );
  }
  if (confidence > 0) {
    return (
      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 text-xs">
        {Math.round(confidence * 100)}%
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-xs">
      None
    </Badge>
  );
}

// ============================================================
// FieldMappingTable
// ============================================================

export interface FieldRow {
  crm_field_name: string;
  crm_field_type?: string;
  crm_field_label?: string;
  confidence: number;
  sixty_field_name: string | null;
  is_excluded: boolean;
  is_confirmed: boolean;
}

interface FieldMappingTableProps {
  rows: FieldRow[];
  onChange: (rows: FieldRow[]) => void;
}

export function FieldMappingTable({ rows, onChange }: FieldMappingTableProps) {
  function handleRowChange(index: number, patch: Partial<FieldRow>) {
    const updated = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange(updated);
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        No fields detected. Click Auto-Detect to fetch CRM fields.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900/50 text-left">
            <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-[240px]">CRM Field</th>
            <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-[100px]">Type</th>
            <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-[80px]">Confidence</th>
            <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Sixty Mapping</th>
            <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-[80px] text-center">Exclude</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((row, i) => (
            <tr
              key={row.crm_field_name}
              className={cn(
                'transition-colors',
                row.is_excluded
                  ? 'opacity-40 bg-gray-50/50 dark:bg-gray-900/20'
                  : 'bg-white dark:bg-gray-900/0 hover:bg-gray-50/50 dark:hover:bg-gray-900/20'
              )}
            >
              <td className="px-4 py-3">
                <div className="font-mono text-xs text-gray-800 dark:text-gray-200">
                  {row.crm_field_name}
                </div>
                {row.crm_field_label && row.crm_field_label !== row.crm_field_name && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {row.crm_field_label}
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {row.crm_field_type || 'string'}
                </span>
              </td>
              <td className="px-4 py-3">
                <ConfidenceBadge confidence={row.confidence} />
              </td>
              <td className="px-4 py-3">
                <Select
                  value={row.sixty_field_name ?? '_none'}
                  onValueChange={(v) =>
                    handleRowChange(i, {
                      sixty_field_name: v === '_none' ? null : v,
                      is_confirmed: v !== '_none',
                    })
                  }
                  disabled={row.is_excluded}
                >
                  <SelectTrigger className="h-8 text-xs w-[200px]">
                    <SelectValue placeholder="Select sixty field..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Not mapped —</SelectItem>
                    {SIXTY_FIELD_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>
              <td className="px-4 py-3 text-center">
                <Checkbox
                  checked={row.is_excluded}
                  onCheckedChange={(checked) =>
                    handleRowChange(i, { is_excluded: !!checked })
                  }
                  aria-label={`Exclude ${row.crm_field_name}`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
