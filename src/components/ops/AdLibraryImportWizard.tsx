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
  Zap,
  Table2,
  Plus,
  ArrowRight as ArrowRightIcon,
  Columns,
  Check,
  Minus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { useUser } from '@/lib/hooks/useUser';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdLibraryImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAdIds: Set<string>;
  onSuccess?: () => void;
}

interface OpsTable {
  id: string;
  name: string;
  row_count: number;
  updated_at: string;
}

interface OpsColumn {
  id: string;
  key: string;
  label: string;
  column_type: string;
}

type DestinationMode = 'existing' | 'new';

// The 6 source ad fields the wizard exposes for mapping
const AD_SOURCE_FIELDS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'advertiser_name', label: 'Advertiser', hint: 'Company running the ad' },
  { key: 'headline',        label: 'Headline',   hint: 'Ad headline copy' },
  { key: 'body_text',       label: 'Body Text',  hint: 'Main ad body copy' },
  { key: 'cta_text',        label: 'CTA',        hint: 'Call-to-action button text' },
  { key: 'destination_url', label: 'Landing Page URL', hint: 'Destination URL' },
  { key: 'image_url',       label: 'Creative Image', hint: 'Ad image / creative asset' },
];

// Default label to show in the "Target Column" slot
const DEFAULT_COLUMN_LABELS: Record<string, string> = {
  advertiser_name: 'Advertiser',
  headline:        'Headline',
  body_text:       'Body Text',
  cta_text:        'CTA',
  destination_url: 'Landing Page URL',
  image_url:       'Creative Image',
};

const STEPS = [
  { id: 1, label: 'Destination' },
  { id: 2, label: 'Columns' },
  { id: 3, label: 'Import' },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdLibraryImportWizard({
  open,
  onOpenChange,
  selectedAdIds,
  onSuccess,
}: AdLibraryImportWizardProps) {
  const { user } = useUser();
  const { activeOrg } = useOrg();
  const queryClient = useQueryClient();

  // ── Step state ─────────────────────────────────────────────────────────────
  const [step, setStep] = useState(1);

  // ── Step 1 state ───────────────────────────────────────────────────────────
  const [destinationMode, setDestinationMode] = useState<DestinationMode>('new');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [newTableName, setNewTableName] = useState('');
  const [useTemplate, setUseTemplate] = useState(true);

  // ── Step 2 state ───────────────────────────────────────────────────────────
  // mapping: adFieldKey → custom label (only relevant when useTemplate=false)
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    AD_SOURCE_FIELDS.forEach((f) => { m[f.key] = DEFAULT_COLUMN_LABELS[f.key]; });
    return m;
  });
  // which fields are included (skip = not included)
  const [includedFields, setIncludedFields] = useState<Set<string>>(
    () => new Set(AD_SOURCE_FIELDS.map((f) => f.key))
  );

  // ── Step 3 / import state ──────────────────────────────────────────────────
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    table_id: string;
    table_name: string;
    rows_imported: number;
    columns_matched: number;
    columns_skipped: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // ── Existing tables query ──────────────────────────────────────────────────
  const { data: tables = [], isLoading: tablesLoading } = useQuery({
    queryKey: ['ops-tables', activeOrg?.id],
    queryFn: async () => {
      if (!activeOrg?.id) return [];
      const { data, error } = await supabase
        .from('dynamic_tables')
        .select('id, name, row_count, updated_at')
        .eq('organization_id', activeOrg.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OpsTable[];
    },
    enabled: !!activeOrg?.id && open,
  });

  // ── Existing columns for the selected table ────────────────────────────────
  const { data: existingColumns = [] } = useQuery({
    queryKey: ['ops-table-columns', selectedTableId],
    queryFn: async () => {
      if (!selectedTableId) return [];
      const { data, error } = await supabase
        .from('dynamic_table_columns')
        .select('id, key, label, column_type')
        .eq('table_id', selectedTableId)
        .eq('is_visible', true)
        .order('position');
      if (error) throw error;
      return (data ?? []) as OpsColumn[];
    },
    enabled: !!selectedTableId && destinationMode === 'existing',
  });

  // Auto-map fields to existing column labels when an existing table is chosen
  React.useEffect(() => {
    if (destinationMode === 'existing' && existingColumns.length > 0) {
      setColumnMapping((prev) => {
        const next = { ...prev };
        AD_SOURCE_FIELDS.forEach((f) => {
          const match = existingColumns.find(
            (c) => c.key === f.key || c.label.toLowerCase() === f.label.toLowerCase()
          );
          if (match) {
            next[f.key] = match.label;
          }
        });
        return next;
      });
    }
  }, [existingColumns, destinationMode]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedTable = useMemo(
    () => tables.find((t) => t.id === selectedTableId) ?? null,
    [tables, selectedTableId]
  );

  const targetTableName = useMemo(() => {
    if (destinationMode === 'existing') return selectedTable?.name ?? '';
    return newTableName.trim();
  }, [destinationMode, selectedTable, newTableName]);

  const step1Valid = useMemo(() => {
    if (destinationMode === 'existing') return !!selectedTableId;
    return newTableName.trim().length > 0;
  }, [destinationMode, selectedTableId, newTableName]);

  const step2Valid = useMemo(() => {
    if (useTemplate) return true;
    return includedFields.size > 0;
  }, [useTemplate, includedFields]);

  const mappedFieldsForReview = useMemo(() => {
    if (useTemplate) return AD_SOURCE_FIELDS;
    return AD_SOURCE_FIELDS.filter((f) => includedFields.has(f.key));
  }, [useTemplate, includedFields]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const reset = () => {
    setStep(1);
    setDestinationMode('new');
    setSelectedTableId(null);
    setNewTableName('');
    setUseTemplate(true);
    setColumnMapping(() => {
      const m: Record<string, string> = {};
      AD_SOURCE_FIELDS.forEach((f) => { m[f.key] = DEFAULT_COLUMN_LABELS[f.key]; });
      return m;
    });
    setIncludedFields(new Set(AD_SOURCE_FIELDS.map((f) => f.key)));
    setIsImporting(false);
    setImportResult(null);
    setImportError(null);
  };

  const handleClose = () => {
    if (isImporting) return;
    reset();
    onOpenChange(false);
  };

  const handleNext = () => {
    if (step === 1 && step1Valid) setStep(2);
    else if (step === 2 && step2Valid) handleImport();
  };

  const handleImport = async () => {
    if (!user?.id || !activeOrg?.id) return;

    setStep(3);
    setIsImporting(true);
    setImportError(null);

    try {
      // Build the body
      const body: Record<string, unknown> = {
        org_id: activeOrg.id,
        user_id: user.id,
        ad_ids: Array.from(selectedAdIds),
      };

      if (destinationMode === 'existing' && selectedTableId) {
        body.table_id = selectedTableId;
      } else {
        body.table_name = newTableName.trim();
      }

      if (useTemplate) {
        body.template = 'creative_testing';
      } else {
        const mapping: Record<string, string> = {};
        includedFields.forEach((fieldKey) => {
          mapping[fieldKey] = columnMapping[fieldKey] || DEFAULT_COLUMN_LABELS[fieldKey];
        });
        body.column_mapping = mapping;
      }

      const { data, error } = await supabase.functions.invoke('import-from-ad-library', {
        body,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ['ops-tables'] });
      toast.success(
        `Imported ${data.rows_imported} ad${data.rows_imported !== 1 ? 's' : ''} into "${data.table_name}"`
      );
      onSuccess?.();
    } catch (e: any) {
      const msg = e?.message || 'Import failed';
      setImportError(msg);
      toast.error('Import failed: ' + msg);
    } finally {
      setIsImporting(false);
    }
  };

  const toggleField = (key: string) => {
    setIncludedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-[620px] max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Import Ads to Ops Table</DialogTitle>
          <DialogDescription>
            Import selected LinkedIn ads into a new or existing ops table
          </DialogDescription>
        </DialogHeader>

        {/* ── Header / step indicator ── */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Import {selectedAdIds.size} ad{selectedAdIds.size !== 1 ? 's' : ''} to Ops Table
          </h2>
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.id}>
                <div className="flex items-center gap-1.5">
                  <div
                    className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium ${
                      step > s.id
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                        : step === s.id
                          ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {step > s.id ? <CheckCircle2 className="w-4 h-4" /> : s.id}
                  </div>
                  <span
                    className={`text-xs font-medium hidden sm:inline ${
                      step >= s.id ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-px mx-2 ${
                      step > s.id ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ─────────────────────────────────────────────────────────────────
              Step 1 — Destination
          ───────────────────────────────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Destination mode toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setDestinationMode('new')}
                  className={`flex-1 flex flex-col items-center gap-2 rounded-xl border px-4 py-4 text-sm font-medium transition-colors ${
                    destinationMode === 'new'
                      ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                      : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                  }`}
                >
                  <Plus className={`w-5 h-5 ${destinationMode === 'new' ? 'text-violet-400' : 'text-gray-500'}`} />
                  New Table
                </button>
                <button
                  onClick={() => setDestinationMode('existing')}
                  className={`flex-1 flex flex-col items-center gap-2 rounded-xl border px-4 py-4 text-sm font-medium transition-colors ${
                    destinationMode === 'existing'
                      ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                      : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                  }`}
                >
                  <Table2 className={`w-5 h-5 ${destinationMode === 'existing' ? 'text-violet-400' : 'text-gray-500'}`} />
                  Existing Table
                </button>
              </div>

              {/* New table options */}
              {destinationMode === 'new' && (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-300">
                      Table name
                    </label>
                    <input
                      type="text"
                      value={newTableName}
                      onChange={(e) => setNewTableName(e.target.value)}
                      placeholder="e.g. Competitor Ads — Q2 2026"
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-violet-500"
                      autoFocus
                    />
                  </div>

                  {/* Creative Testing Template preset */}
                  <button
                    onClick={() => setUseTemplate(!useTemplate)}
                    className={`w-full flex items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors ${
                      useTemplate
                        ? 'border-violet-500/60 bg-violet-500/10'
                        : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
                        useTemplate
                          ? 'border-violet-500 bg-violet-500 text-white'
                          : 'border-gray-600 bg-gray-800'
                      }`}
                    >
                      {useTemplate && <Check className="h-3 w-3" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-100">
                        <Zap className="h-4 w-4 text-violet-400" />
                        Creative Testing Template
                      </div>
                      <p className="mt-0.5 text-xs text-gray-400">
                        Pre-configured columns: Advertiser, Headline, Body Text, CTA, Landing Page,
                        Creative Image, AI Image Remix, AI Video, SVG Animation.
                      </p>
                    </div>
                  </button>
                </div>
              )}

              {/* Existing table picker */}
              {destinationMode === 'existing' && (
                <div>
                  {tablesLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                    </div>
                  ) : tables.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-500">
                      No ops tables found. Create a new one instead.
                    </p>
                  ) : (
                    <div className="space-y-1 max-h-[280px] overflow-y-auto rounded-lg border border-gray-800 p-2">
                      {tables.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setSelectedTableId(t.id)}
                          className={`w-full flex items-center justify-between rounded-lg px-4 py-3 text-left transition-colors ${
                            selectedTableId === t.id
                              ? 'bg-violet-500/10 border border-violet-500/30'
                              : 'hover:bg-gray-800 border border-transparent'
                          }`}
                        >
                          <div>
                            <div className="text-sm font-medium text-white">{t.name}</div>
                            <div className="mt-0.5 text-xs text-gray-500">
                              {t.row_count.toLocaleString()} rows
                            </div>
                          </div>
                          {selectedTableId === t.id && (
                            <CheckCircle2 className="w-4 h-4 text-violet-400" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              Step 2 — Column Mapping
          ───────────────────────────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              {useTemplate && destinationMode === 'new' ? (
                /* Template mode: just confirm */
                <div className="space-y-3">
                  <p className="text-sm text-gray-400">
                    The <span className="font-medium text-violet-300">Creative Testing Template</span> will
                    create the following columns automatically. All ad fields will be mapped for you.
                  </p>
                  <div className="rounded-xl border border-gray-800 divide-y divide-gray-800 overflow-hidden">
                    {[
                      { label: 'Advertiser',      type: 'text',          src: 'advertiser_name' },
                      { label: 'Headline',         type: 'text',          src: 'headline' },
                      { label: 'Body Text',        type: 'text',          src: 'body_text' },
                      { label: 'CTA',              type: 'text',          src: 'cta_text' },
                      { label: 'Landing Page URL', type: 'url',           src: 'destination_url' },
                      { label: 'Creative Image',   type: 'url',           src: 'image_url' },
                      { label: 'AI Image Remix',   type: 'ai_image',      src: '—' },
                      { label: 'AI Video',         type: 'fal_video',     src: '—' },
                      { label: 'SVG Animation',    type: 'svg_animation', src: '—' },
                    ].map((col) => (
                      <div
                        key={col.label}
                        className="flex items-center justify-between px-4 py-2.5 text-sm"
                      >
                        <span className="font-medium text-gray-200">{col.label}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500">{col.type}</span>
                          {col.src !== '—' ? (
                            <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-xs text-violet-300">
                              {col.src}
                            </span>
                          ) : (
                            <span className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-500">
                              AI generated
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* Manual mapping mode */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-400">
                      Map source ad fields to target columns. Toggle fields off to skip them.
                    </p>
                    <button
                      onClick={() => {
                        if (includedFields.size === AD_SOURCE_FIELDS.length) {
                          setIncludedFields(new Set());
                        } else {
                          setIncludedFields(new Set(AD_SOURCE_FIELDS.map((f) => f.key)));
                        }
                      }}
                      className="text-xs text-violet-400 hover:text-violet-300"
                    >
                      {includedFields.size === AD_SOURCE_FIELDS.length ? 'Skip all' : 'Include all'}
                    </button>
                  </div>

                  {/* Column header row */}
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-1 mb-1">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Source field</span>
                    <span className="w-5" />
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Target column</span>
                  </div>

                  <div className="space-y-2">
                    {AD_SOURCE_FIELDS.map((field) => {
                      const isIncluded = includedFields.has(field.key);
                      return (
                        <div
                          key={field.key}
                          className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                            isIncluded
                              ? 'border-gray-700 bg-gray-800/60'
                              : 'border-gray-800 bg-gray-900/30 opacity-50'
                          }`}
                        >
                          {/* Source */}
                          <div>
                            <div className="text-sm font-medium text-gray-200">{field.label}</div>
                            <div className="text-xs text-gray-500">{field.hint}</div>
                          </div>

                          {/* Arrow / toggle */}
                          <button
                            onClick={() => toggleField(field.key)}
                            title={isIncluded ? 'Skip this field' : 'Include this field'}
                            className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                              isIncluded
                                ? 'bg-violet-500/20 text-violet-400 hover:bg-red-500/20 hover:text-red-400'
                                : 'bg-gray-800 text-gray-600 hover:bg-violet-500/20 hover:text-violet-400'
                            }`}
                          >
                            {isIncluded ? (
                              <ArrowRightIcon className="w-3.5 h-3.5" />
                            ) : (
                              <Minus className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Target label (editable) */}
                          {isIncluded ? (
                            <input
                              type="text"
                              value={columnMapping[field.key] ?? field.label}
                              onChange={(e) =>
                                setColumnMapping((prev) => ({ ...prev, [field.key]: e.target.value }))
                              }
                              placeholder={field.label}
                              className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white placeholder-gray-500 outline-none focus:border-violet-500"
                            />
                          ) : (
                            <span className="text-xs italic text-gray-600">skipped</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {includedFields.size === 0 && (
                    <p className="text-center text-sm text-amber-400 py-2">
                      At least one field must be included.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              Step 3 — Import / result
          ───────────────────────────────────────────────────────────────── */}
          {step === 3 && (
            <div className="flex flex-col items-center justify-center py-8 space-y-6">
              {isImporting ? (
                <>
                  <Loader2 className="w-10 h-10 text-violet-500 animate-spin" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-200">Importing ads…</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Archiving media and building rows. This may take a moment.
                    </p>
                  </div>
                </>
              ) : importResult ? (
                <>
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="text-lg font-semibold text-white">Import Complete</h3>
                    <p className="text-sm text-gray-400">
                      {importResult.rows_imported.toLocaleString()} ad
                      {importResult.rows_imported !== 1 ? 's' : ''} imported into{' '}
                      <span className="font-medium text-gray-200">"{importResult.table_name}"</span>
                      {' '}with {importResult.columns_matched} column
                      {importResult.columns_matched !== 1 ? 's' : ''}
                      {importResult.columns_skipped > 0 &&
                        ` (${importResult.columns_skipped} skipped)`}
                      .
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleClose}
                    >
                      Close
                    </Button>
                    <Button
                      onClick={() => {
                        handleClose();
                        // Navigate to ops page — the table ID is available for the caller
                        window.location.href = `/ops/${importResult.table_id}`;
                      }}
                      className="gap-2 bg-violet-600 hover:bg-violet-500"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open Table
                    </Button>
                  </div>
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
                  <Button
                    variant="outline"
                    onClick={() => { setStep(2); setImportError(null); }}
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Back
                  </Button>
                </>
              ) : null}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {step < 3 && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex justify-between flex-shrink-0">
            <Button
              variant="ghost"
              onClick={step === 1 ? handleClose : () => setStep((s) => Math.max(1, s - 1))}
              disabled={isImporting}
            >
              {step === 1 ? 'Cancel' : (
                <>
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back
                </>
              )}
            </Button>

            {step === 1 && (
              <Button
                onClick={handleNext}
                disabled={!step1Valid}
                className="gap-1 bg-violet-600 hover:bg-violet-500"
              >
                Next
                <ArrowRight className="w-4 h-4" />
              </Button>
            )}

            {step === 2 && (
              <Button
                onClick={handleNext}
                disabled={!step2Valid}
                className="gap-2 bg-violet-600 hover:bg-violet-500"
              >
                <Columns className="w-4 h-4" />
                Import {selectedAdIds.size} ad{selectedAdIds.size !== 1 ? 's' : ''}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
