import React from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DetectedColumn, DynamicColumnType } from '@/lib/services/csvDynamicTableService';

const COLUMN_TYPES: { value: DynamicColumnType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'url', label: 'URL' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'person', label: 'Person' },
  { value: 'company', label: 'Company' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'date', label: 'Date' },
];

interface CSVColumnMappingStepProps {
  columns: DetectedColumn[];
  onColumnsChange: (columns: DetectedColumn[]) => void;
  tableName: string;
  onTableNameChange: (name: string) => void;
  rowCount: number;
}

export function CSVColumnMappingStep({
  columns,
  onColumnsChange,
  tableName,
  onTableNameChange,
  rowCount,
}: CSVColumnMappingStepProps) {
  const includedCount = columns.filter(c => c.included).length;

  const updateColumn = (index: number, updates: Partial<DetectedColumn>) => {
    const next = columns.map((col, i) => i === index ? { ...col, ...updates } : col);
    onColumnsChange(next);
  };

  return (
    <div className="space-y-5">
      {/* Table name */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Table Name</label>
        <Input
          value={tableName}
          onChange={(e) => onTableNameChange(e.target.value)}
          placeholder="My imported data"
          className="max-w-sm"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {rowCount.toLocaleString()} rows detected
        </p>
      </div>

      {/* Column mapping table */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Column Mapping
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Configure how each CSV column maps to your table. Uncheck columns you don't need.
        </p>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[40px_1fr_120px_1fr_40px] gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <div></div>
            <div>CSV Header</div>
            <div>Type</div>
            <div>Sample Values</div>
            <div></div>
          </div>

          {/* Column rows */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {columns.map((col, index) => (
              <div
                key={col.key}
                className={`grid grid-cols-[40px_1fr_120px_1fr_40px] gap-2 px-3 py-2.5 items-center transition-colors ${
                  !col.included ? 'opacity-50 bg-gray-50/50 dark:bg-gray-900/30' : ''
                }`}
              >
                {/* Include checkbox */}
                <div className="flex items-center justify-center">
                  <Checkbox
                    checked={col.included}
                    onCheckedChange={(checked) => updateColumn(index, { included: !!checked })}
                  />
                </div>

                {/* Editable label */}
                <div>
                  <Input
                    value={col.label}
                    onChange={(e) => updateColumn(index, { label: e.target.value })}
                    className="h-8 text-sm"
                    disabled={!col.included}
                  />
                </div>

                {/* Type dropdown */}
                <div>
                  <Select
                    value={col.type}
                    onValueChange={(value) => updateColumn(index, { type: value as DynamicColumnType })}
                    disabled={!col.included}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLUMN_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Sample values */}
                <div className="flex items-center gap-1 overflow-hidden">
                  {col.sampleValues.length > 0 ? (
                    col.sampleValues.map((v, vi) => (
                      <span
                        key={vi}
                        className="inline-block max-w-[120px] truncate px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-600 dark:text-gray-400"
                      >
                        {v}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-gray-400 italic">No data</span>
                  )}
                </div>

                {/* Visual indicator for auto-detected */}
                <div className="flex items-center justify-center">
                  {col.type !== 'text' && (
                    <span className="text-[10px] text-blue-500" title="Auto-detected">
                      auto
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {includedCount} of {columns.length} columns selected
        </p>
      </div>
    </div>
  );
}
