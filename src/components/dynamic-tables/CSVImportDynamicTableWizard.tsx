import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, Columns, Eye, Loader2, CheckCircle2, ArrowLeft, ArrowRight, ExternalLink, AlertCircle } from 'lucide-react';
import { parseCSVFile, transformRowsForDynamicTable } from '@/lib/services/csvDynamicTableService';
import type { DetectedColumn } from '@/lib/services/csvDynamicTableService';
import { CSVColumnMappingStep } from './CSVColumnMappingStep';
import { DynamicTableService } from '@/lib/services/dynamicTableService';
import { supabase } from '@/lib/supabase/clientV2';
import { useUser } from '@/lib/hooks/useUser';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface CSVImportDynamicTableWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (tableId: string) => void;
}

// Wizard steps
const STEPS = [
  { id: 1, label: 'Upload', icon: Upload },
  { id: 2, label: 'Map Columns', icon: Columns },
  { id: 3, label: 'Preview', icon: Eye },
  { id: 4, label: 'Import', icon: CheckCircle2 },
] as const;

type ImportPhase = 'idle' | 'creating_table' | 'adding_columns' | 'inserting_rows' | 'complete' | 'error';

const tableService = new DynamicTableService(supabase);

export function CSVImportDynamicTableWizard({ open, onOpenChange, onComplete }: CSVImportDynamicTableWizardProps) {
  const { user } = useUser();
  const { activeOrg } = useOrg();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<DetectedColumn[]>([]);
  const [tableName, setTableName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Import state
  const [importPhase, setImportPhase] = useState<ImportPhase>('idle');
  const [importError, setImportError] = useState<string | null>(null);
  const [createdTableId, setCreatedTableId] = useState<string | null>(null);
  const [rowsInserted, setRowsInserted] = useState(0);

  const includedColumns = columns.filter(c => c.included);

  const reset = () => {
    setStep(1);
    setFile(null);
    setHeaders([]);
    setRows([]);
    setColumns([]);
    setTableName('');
    setIsProcessing(false);
    setImportPhase('idle');
    setImportError(null);
    setCreatedTableId(null);
    setRowsInserted(0);
  };

  const handleClose = () => {
    if (importPhase !== 'idle' && importPhase !== 'complete' && importPhase !== 'error') return; // Don't close during import
    reset();
    onOpenChange(false);
  };

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.csv')) {
      toast.error('Please upload a .csv file');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('File must be under 10MB');
      return;
    }

    setFile(selectedFile);
    setIsProcessing(true);

    try {
      const result = await parseCSVFile(selectedFile);
      if (!result.headers?.length) {
        toast.error('No columns found in CSV');
        setIsProcessing(false);
        return;
      }
      if (!result.rows?.length) {
        toast.error('No data rows found in CSV');
        setIsProcessing(false);
        return;
      }

      setHeaders(result.headers);
      setRows(result.rows);

      // Default table name from filename
      const defaultName = selectedFile.name.replace(/\.csv$/i, '').replace(/[_-]+/g, ' ');
      setTableName(defaultName);

      // Auto-detect columns
      const { detectColumns } = await import('@/lib/services/csvDynamicTableService');
      const detected = detectColumns(result.headers, result.rows);
      setColumns(detected);

      setStep(2);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to parse CSV');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // Import execution
  const handleImport = async () => {
    if (!user?.id || !activeOrg?.id || !tableName.trim()) return;

    setStep(4);
    setImportPhase('creating_table');
    setImportError(null);

    try {
      // 1. Create table
      const table = await tableService.createTable({
        organizationId: activeOrg.id,
        createdBy: user.id,
        name: tableName.trim(),
        sourceType: 'csv',
      });
      setCreatedTableId(table.id);

      // 2. Add columns
      setImportPhase('adding_columns');
      for (let i = 0; i < includedColumns.length; i++) {
        const col = includedColumns[i];
        await tableService.addColumn({
          tableId: table.id,
          key: col.key,
          label: col.label,
          columnType: col.type,
          position: i,
        });
      }

      // 3. Insert rows in batches
      setImportPhase('inserting_rows');
      const transformed = transformRowsForDynamicTable(rows, columns);
      const BATCH_SIZE = 100;
      let inserted = 0;

      for (let i = 0; i < transformed.length; i += BATCH_SIZE) {
        const batch = transformed.slice(i, i + BATCH_SIZE);
        await tableService.addRows(table.id, batch);
        inserted += batch.length;
        setRowsInserted(inserted);
      }

      // 4. Done
      setImportPhase('complete');
      queryClient.invalidateQueries({ queryKey: ['dynamic-tables'] });
      toast.success(`Imported ${inserted} rows to "${tableName}"`);
    } catch (e: any) {
      setImportPhase('error');
      setImportError(e?.message || 'Import failed');
      toast.error('Import failed: ' + (e?.message || 'Unknown error'));
    }
  };

  // Drag-and-drop handlers
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) handleFileSelect(selectedFile);
  };

  // Preview data (first 5 rows)
  const previewRows = rows.slice(0, 5);

  // Can proceed from step 2?
  const canProceedFromMapping = includedColumns.length > 0 && tableName.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Import CSV to Dynamic Table</DialogTitle>
          <DialogDescription>Upload a CSV file to create a new Dynamic Table</DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Import CSV</h2>
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.id}>
                <div className="flex items-center gap-1.5">
                  <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium ${
                    step > s.id
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                      : step === s.id
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                  }`}>
                    {step > s.id ? <CheckCircle2 className="w-4 h-4" /> : s.id}
                  </div>
                  <span className={`text-xs font-medium hidden sm:inline ${
                    step >= s.id ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'
                  }`}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-2 ${
                    step > s.id ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-gray-200 dark:bg-gray-700'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Upload */}
          {step === 1 && (
            <div className="space-y-4">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
                  isDragging
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/10'
                    : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
                }`}
                onClick={() => document.getElementById('csv-file-input')?.click()}
              >
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">Parsing CSV...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-xl">
                      <FileSpreadsheet className="w-8 h-8 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Drop your CSV file here, or click to browse
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        .csv files up to 10MB
                      </p>
                    </div>
                    {file && (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
                        <FileSpreadsheet className="w-4 h-4 text-gray-500" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{file.name}</span>
                        <span className="text-xs text-gray-500">({(file.size / 1024).toFixed(0)} KB)</span>
                      </div>
                    )}
                  </div>
                )}
                <input
                  id="csv-file-input"
                  type="file"
                  accept=".csv"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </div>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 2 && (
            <CSVColumnMappingStep
              columns={columns}
              onColumnsChange={setColumns}
              tableName={tableName}
              onTableNameChange={setTableName}
              rowCount={rows.length}
            />
          )}

          {/* Step 3: Preview */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Preview: {tableName}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Ready to import <span className="font-medium text-gray-700 dark:text-gray-200">{rows.length.toLocaleString()}</span> rows with <span className="font-medium text-gray-700 dark:text-gray-200">{includedColumns.length}</span> columns
                </p>
              </div>

              {/* Preview table */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10">#</th>
                        {includedColumns.map(col => (
                          <th key={col.key} className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            <div className="flex items-center gap-1.5">
                              {col.label}
                              <span className="text-[10px] font-normal normal-case text-gray-400 dark:text-gray-500">
                                {col.type}
                              </span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {previewRows.map((row, ri) => (
                        <tr key={ri} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                          <td className="px-3 py-2 text-xs text-gray-400">{ri + 1}</td>
                          {includedColumns.map(col => (
                            <td key={col.key} className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 max-w-[200px] truncate">
                              {row[col.label] || <span className="text-gray-300 dark:text-gray-600">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {rows.length > 5 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                  Showing first 5 of {rows.length.toLocaleString()} rows
                </p>
              )}
            </div>
          )}

          {/* Step 4: Import */}
          {step === 4 && (
            <div className="flex flex-col items-center justify-center py-8 space-y-6">
              {importPhase === 'complete' ? (
                <>
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="text-center space-y-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Import Complete</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Successfully imported {rowsInserted.toLocaleString()} rows into "{tableName}"
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      if (createdTableId) {
                        onComplete?.(createdTableId);
                      }
                      handleClose();
                    }}
                    className="gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open Table
                  </Button>
                </>
              ) : importPhase === 'error' ? (
                <>
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30">
                    <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="text-center space-y-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Import Failed</h3>
                    <p className="text-sm text-red-500 dark:text-red-400">
                      {importError}
                    </p>
                  </div>
                  <Button onClick={() => { setStep(3); setImportPhase('idle'); }} variant="outline">
                    Back to Preview
                  </Button>
                </>
              ) : (
                <>
                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                  <div className="w-full max-w-sm space-y-3">
                    {/* Progress steps */}
                    {(['creating_table', 'adding_columns', 'inserting_rows'] as const).map((phase) => {
                      const labels: Record<typeof phase, string> = {
                        creating_table: 'Creating table',
                        adding_columns: `Adding ${includedColumns.length} columns`,
                        inserting_rows: `Inserting rows (${rowsInserted.toLocaleString()} / ${rows.length.toLocaleString()})`,
                      };
                      const phases = ['creating_table', 'adding_columns', 'inserting_rows'] as const;
                      const currentIdx = phases.indexOf(importPhase as typeof phase);
                      const phaseIdx = phases.indexOf(phase);
                      const isDone = phaseIdx < currentIdx;
                      const isCurrent = phase === importPhase;

                      return (
                        <div key={phase} className="flex items-center gap-3">
                          <div className={`flex items-center justify-center w-6 h-6 rounded-full ${
                            isDone
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                              : isCurrent
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                          }`}>
                            {isDone ? (
                              <CheckCircle2 className="w-4 h-4" />
                            ) : isCurrent ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <div className="w-2 h-2 rounded-full bg-current" />
                            )}
                          </div>
                          <span className={`text-sm ${
                            isDone ? 'text-emerald-600 dark:text-emerald-400' :
                            isCurrent ? 'text-gray-700 dark:text-gray-300 font-medium' :
                            'text-gray-400 dark:text-gray-500'
                          }`}>
                            {labels[phase]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer with navigation */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex justify-between">
          <Button
            variant="ghost"
            onClick={step === 1 ? handleClose : () => setStep(s => Math.max(1, s - 1))}
            disabled={isProcessing || (step === 4 && importPhase !== 'idle' && importPhase !== 'complete' && importPhase !== 'error')}
          >
            {step === 1 ? 'Cancel' : step === 4 && importPhase === 'complete' ? 'Close' : (
              <><ArrowLeft className="w-4 h-4 mr-1" /> Back</>
            )}
          </Button>

          {step === 1 && (
            <Button disabled className="opacity-50">
              Continue
            </Button>
          )}

          {step === 2 && (
            <Button
              onClick={() => setStep(3)}
              disabled={!canProceedFromMapping}
              className="gap-1"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </Button>
          )}

          {step === 3 && (
            <Button
              onClick={handleImport}
              className="gap-1"
            >
              Import {rows.length.toLocaleString()} Rows
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
