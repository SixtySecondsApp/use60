import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  AlertCircle,
  Search,
  Columns,
  Copy,
  Rows3,
  Clock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { useUser } from '@/lib/hooks/useUser';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CrossOpImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (tableId: string) => void;
}

interface SourceTable {
  id: string;
  name: string;
  row_count: number;
  source_type: string | null;
  updated_at: string;
}

interface SourceColumn {
  id: string;
  key: string;
  label: string;
  column_type: string;
  is_enrichment: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = [
  { id: 1, label: 'Source' },
  { id: 2, label: 'Columns' },
  { id: 3, label: 'Import' },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CrossOpImportWizard({ open, onOpenChange, onComplete }: CrossOpImportWizardProps) {
  const { user } = useUser();
  const { activeOrg } = useOrg();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedColumnKeys, setSelectedColumnKeys] = useState<Set<string>>(new Set());
  const [tableName, setTableName] = useState('');
  const [tableSearch, setTableSearch] = useState('');

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    table_id: string;
    rows_imported: number;
    columns_matched: number;
    columns_skipped: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Fetch all org tables
  const { data: tables = [], isLoading: tablesLoading } = useQuery({
    queryKey: ['ops-tables', activeOrg?.id],
    queryFn: async () => {
      if (!activeOrg?.id) return [];
      const { data, error } = await supabase
        .from('dynamic_tables')
        .select('id, name, row_count, source_type, updated_at')
        .eq('organization_id', activeOrg.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SourceTable[];
    },
    enabled: !!activeOrg?.id && open,
  });

  // Fetch columns for selected table
  const { data: sourceColumns = [], isLoading: columnsLoading } = useQuery({
    queryKey: ['ops-table-columns', selectedTableId],
    queryFn: async () => {
      if (!selectedTableId) return [];
      const { data, error } = await supabase
        .from('dynamic_table_columns')
        .select('id, key, label, column_type, is_enrichment')
        .eq('table_id', selectedTableId)
        .eq('is_visible', true)
        .order('position');
      if (error) throw error;
      return (data ?? []) as SourceColumn[];
    },
    enabled: !!selectedTableId,
  });

  // Auto-select all columns when source table changes
  React.useEffect(() => {
    if (sourceColumns.length > 0) {
      setSelectedColumnKeys(new Set(sourceColumns.map((c) => c.key)));
    }
  }, [sourceColumns]);

  const filteredTables = useMemo(() => {
    if (!tableSearch) return tables;
    const q = tableSearch.toLowerCase();
    return tables.filter((t) => t.name.toLowerCase().includes(q));
  }, [tables, tableSearch]);

  const reset = () => {
    setStep(1);
    setSelectedTableId(null);
    setSelectedColumnKeys(new Set());
    setTableName('');
    setTableSearch('');
    setIsImporting(false);
    setImportResult(null);
    setImportError(null);
  };

  const handleClose = () => {
    if (isImporting) return;
    reset();
    onOpenChange(false);
  };

  const handleSelectTable = (table: SourceTable) => {
    setSelectedTableId(table.id);
    setTableName(`${table.name} (copy)`);
    setStep(2);
  };

  const toggleColumn = (key: string) => {
    setSelectedColumnKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleImport = async () => {
    if (!user?.id || !activeOrg?.id || !selectedTableId || !tableName.trim() || selectedColumnKeys.size === 0) return;

    setStep(3);
    setIsImporting(true);
    setImportError(null);

    try {
      const { data, error } = await supabase.functions.invoke('import-from-ops-table', {
        body: {
          org_id: activeOrg.id,
          user_id: user.id,
          source_table_id: selectedTableId,
          table_name: tableName.trim(),
          column_keys: Array.from(selectedColumnKeys),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ['ops-tables'] });
      toast.success(`Imported ${data.rows_imported} rows from source table`);
    } catch (e: any) {
      setImportError(e?.message || 'Import failed');
      toast.error('Cross-op import failed: ' + (e?.message || 'Unknown error'));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Import from Op</DialogTitle>
          <DialogDescription>Copy data from another Ops table</DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Import from Op</h2>
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.id}>
                <div className="flex items-center gap-1.5">
                  <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium ${
                    step > s.id
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                      : step === s.id
                        ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Select source table */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Search tables..."
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-500"
                />
              </div>

              {tablesLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredTables.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleSelectTable(t)}
                      className={`w-full flex items-center justify-between rounded-lg px-4 py-3 text-left transition-colors ${
                        selectedTableId === t.id
                          ? 'bg-indigo-500/10 border border-indigo-500/30'
                          : 'hover:bg-gray-800 border border-transparent'
                      }`}
                    >
                      <div>
                        <div className="text-sm font-medium text-white">{t.name}</div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          <span className="inline-flex items-center gap-1">
                            <Rows3 className="w-3 h-3" />
                            {t.row_count} rows
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                      <Copy className="w-4 h-4 text-gray-500" />
                    </button>
                  ))}
                  {filteredTables.length === 0 && (
                    <p className="py-8 text-center text-sm text-gray-500">No tables found</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Select columns + name */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">New table name</label>
                <input
                  type="text"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-300">
                    Columns to import ({selectedColumnKeys.size} / {sourceColumns.length})
                  </label>
                  <button
                    onClick={() => {
                      if (selectedColumnKeys.size === sourceColumns.length) {
                        setSelectedColumnKeys(new Set());
                      } else {
                        setSelectedColumnKeys(new Set(sourceColumns.map((c) => c.key)));
                      }
                    }}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    {selectedColumnKeys.size === sourceColumns.length ? 'Deselect all' : 'Select all'}
                  </button>
                </div>

                {columnsLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[300px] overflow-y-auto rounded-lg border border-gray-800 p-2">
                    {sourceColumns.map((col) => (
                      <button
                        key={col.key}
                        onClick={() => toggleColumn(col.key)}
                        className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                          selectedColumnKeys.has(col.key)
                            ? 'bg-indigo-500/10 text-indigo-300'
                            : 'text-gray-400 hover:bg-gray-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedColumnKeys.has(col.key)}
                          readOnly
                          className="w-4 h-4 rounded border-gray-600 text-indigo-600 bg-gray-800"
                        />
                        <span className="font-medium">{col.label}</span>
                        <span className="text-xs text-gray-500">{col.column_type}</span>
                        {col.is_enrichment && (
                          <span className="text-xs text-violet-400">enrichment</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Import progress */}
          {step === 3 && (
            <div className="flex flex-col items-center justify-center py-8 space-y-6">
              {importResult ? (
                <>
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="text-center space-y-1">
                    <h3 className="text-lg font-semibold text-white">Import Complete</h3>
                    <p className="text-sm text-gray-400">
                      Copied {importResult.rows_imported.toLocaleString()} rows with {importResult.columns_matched} columns
                      {importResult.columns_skipped > 0 && ` (${importResult.columns_skipped} skipped)`}
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      onComplete?.(importResult.table_id);
                      handleClose();
                    }}
                    className="gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open Table
                  </Button>
                </>
              ) : importError ? (
                <>
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30">
                    <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="text-center space-y-1">
                    <h3 className="text-lg font-semibold text-white">Import Failed</h3>
                    <p className="text-sm text-red-400">{importError}</p>
                  </div>
                  <Button onClick={() => { setStep(2); setImportError(null); }} variant="outline">
                    Back
                  </Button>
                </>
              ) : (
                <>
                  <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                  <p className="text-sm text-gray-400">Copying rows from source table...</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex justify-between">
          <Button
            variant="ghost"
            onClick={step === 1 ? handleClose : () => setStep((s) => Math.max(1, s - 1))}
            disabled={isImporting}
          >
            {step === 1 ? 'Cancel' : <><ArrowLeft className="w-4 h-4 mr-1" /> Back</>}
          </Button>

          {step === 2 && (
            <Button
              onClick={handleImport}
              disabled={selectedColumnKeys.size === 0 || !tableName.trim()}
              className="gap-1 bg-indigo-600 hover:bg-indigo-500"
            >
              Import {selectedColumnKeys.size} columns
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
