/**
 * LinkedInCreativeMappingWizard
 *
 * 3-step wizard that maps ops table columns to LinkedIn creative fields,
 * previews generated creatives from real row data, and configures budget.
 *
 * Config stored in dynamic_tables.integration_config:
 *   {
 *     linkedin: {
 *       ...existing campaign binding fields,
 *       column_mapping: {
 *         headline: string | null,   // column key
 *         body: string | null,
 *         cta_text: string | null,
 *         destination_url: string | null,
 *         media_asset: string | null,
 *       },
 *       budget: {
 *         source: 'manual' | 'column',
 *         daily_budget: number | null,       // used when source = 'manual'
 *         budget_column: string | null,      // column key when source = 'column'
 *         weight_column: string | null,      // optional, for proportional distribution
 *       }
 *     }
 *   }
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  Type,
  FileText,
  MousePointerClick,
  Link2,
  Image,
  DollarSign,
  Columns3,
  Eye,
  MapPin,
  BarChart2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LinkedInColumnMapping {
  headline: string | null;
  body: string | null;
  cta_text: string | null;
  destination_url: string | null;
  media_asset: string | null;
}

export interface LinkedInBudgetConfig {
  source: 'manual' | 'column';
  daily_budget: number | null;
  budget_column: string | null;
  weight_column: string | null;
}

interface TableColumn {
  id: string;
  key: string;
  label: string;
  column_type: string;
}

interface TableRow {
  id: string;
  row_index: number;
  cells: { column_key: string; value: string | null }[];
}

interface LinkedInCreativeMappingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string;
  /** Full integration_config from dynamic_tables — we merge linkedin sub-key */
  integrationConfig: Record<string, unknown> | null;
  /** Called after successful save */
  onSaved: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = [
  { id: 1, label: 'Map Columns', icon: Columns3 },
  { id: 2, label: 'Preview', icon: Eye },
  { id: 3, label: 'Budget', icon: DollarSign },
] as const;

const CREATIVE_FIELDS: {
  key: keyof LinkedInColumnMapping;
  label: string;
  description: string;
  required: boolean;
  icon: React.ElementType;
  maxLen?: number;
  types?: string[];
}[] = [
  {
    key: 'headline',
    label: 'Headline',
    description: 'Short hook — shown bold at the top of the ad',
    required: true,
    icon: Type,
    maxLen: 70,
    types: ['text'],
  },
  {
    key: 'body',
    label: 'Body / Introductory Text',
    description: 'Main ad copy — shown above the creative image',
    required: true,
    icon: FileText,
    maxLen: 600,
    types: ['text'],
  },
  {
    key: 'cta_text',
    label: 'CTA Text',
    description: 'Call-to-action button label (e.g. "Learn More")',
    required: false,
    icon: MousePointerClick,
    types: ['text'],
  },
  {
    key: 'destination_url',
    label: 'Destination URL',
    description: 'Landing page URL for the ad',
    required: false,
    icon: Link2,
    types: ['url', 'text'],
  },
  {
    key: 'media_asset',
    label: 'Media Asset',
    description: 'Image URL, video URL, or AI-generated image column',
    required: false,
    icon: Image,
    types: ['url', 'text', 'ai_image', 'fal_video'],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractMapping(
  integrationConfig: Record<string, unknown> | null
): LinkedInColumnMapping {
  const li = (integrationConfig?.linkedin ?? {}) as Record<string, unknown>;
  const m = (li.column_mapping ?? {}) as Record<string, unknown>;
  return {
    headline: (m.headline as string) || null,
    body: (m.body as string) || null,
    cta_text: (m.cta_text as string) || null,
    destination_url: (m.destination_url as string) || null,
    media_asset: (m.media_asset as string) || null,
  };
}

function extractBudget(
  integrationConfig: Record<string, unknown> | null
): LinkedInBudgetConfig {
  const li = (integrationConfig?.linkedin ?? {}) as Record<string, unknown>;
  const b = (li.budget ?? {}) as Record<string, unknown>;
  return {
    source: (b.source as 'manual' | 'column') || 'manual',
    daily_budget: (b.daily_budget as number) || null,
    budget_column: (b.budget_column as string) || null,
    weight_column: (b.weight_column as string) || null,
  };
}

function getCellValue(
  row: TableRow,
  columnKey: string | null
): string {
  if (!columnKey) return '';
  const cell = row.cells.find((c) => c.column_key === columnKey);
  return cell?.value ?? '';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ColumnSelect({
  value,
  columns,
  onChange,
  placeholder,
  allowedTypes,
}: {
  value: string | null;
  columns: TableColumn[];
  onChange: (key: string | null) => void;
  placeholder?: string;
  allowedTypes?: string[];
}) {
  const filtered = allowedTypes
    ? columns.filter((c) => allowedTypes.includes(c.column_type))
    : columns;

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer"
    >
      <option value="">{placeholder ?? '— not mapped —'}</option>
      {filtered.map((col) => (
        <option key={col.key} value={col.key}>
          {col.label}
          {col.column_type !== 'text' ? ` (${col.column_type})` : ''}
        </option>
      ))}
    </select>
  );
}

/** Mocked LinkedIn sponsored content card */
function LinkedInAdPreviewCard({
  headline,
  body,
  ctaText,
  mediaUrl,
  destinationUrl,
  index,
}: {
  headline: string;
  body: string;
  ctaText: string;
  mediaUrl: string;
  destinationUrl: string;
  index: number;
}) {
  const hasMedia = mediaUrl && (mediaUrl.startsWith('http') || mediaUrl.startsWith('https'));
  const domain = destinationUrl
    ? (() => {
        try {
          return new URL(
            destinationUrl.startsWith('http') ? destinationUrl : `https://${destinationUrl}`
          ).hostname.replace('www.', '');
        } catch {
          return destinationUrl;
        }
      })()
    : 'yoursite.com';

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/60 overflow-hidden w-full max-w-sm">
      {/* Header bar — mimics LinkedIn post header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-700/60">
        <div className="w-8 h-8 rounded-full bg-blue-700/60 flex items-center justify-center text-xs font-bold text-blue-200">
          LI
        </div>
        <div>
          <p className="text-xs font-semibold text-white leading-tight">Your Company</p>
          <p className="text-[10px] text-gray-500 leading-tight">Sponsored</p>
        </div>
      </div>

      {/* Body copy */}
      {body && (
        <div className="px-4 py-2.5">
          <p className="text-xs text-gray-300 line-clamp-3 leading-relaxed">{body}</p>
        </div>
      )}

      {/* Media */}
      <div className="relative bg-gray-900 border-y border-gray-700/60">
        {hasMedia ? (
          <img
            src={mediaUrl}
            alt="Ad creative"
            className="w-full object-cover max-h-40"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-32 flex items-center justify-center gap-2 text-gray-600">
            <Image className="h-6 w-6" />
            <span className="text-xs">No media mapped</span>
          </div>
        )}
        {/* Creative index badge */}
        <div className="absolute top-2 right-2 rounded-full bg-gray-900/80 border border-gray-700 px-2 py-0.5 text-[10px] text-gray-400">
          Row {index + 1}
        </div>
      </div>

      {/* Headline + CTA row */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-800/80">
        <div className="min-w-0">
          <p className="text-[10px] text-gray-500 truncate">{domain}</p>
          <p className="text-xs font-semibold text-white line-clamp-2 leading-tight mt-0.5">
            {headline || <span className="text-gray-500 italic">No headline mapped</span>}
          </p>
        </div>
        <div className="shrink-0 rounded-md border border-gray-600 bg-gray-700 px-2.5 py-1.5 text-[11px] font-medium text-gray-200 whitespace-nowrap">
          {ctaText || 'Learn More'}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function LinkedInCreativeMappingWizard({
  open,
  onOpenChange,
  tableId,
  integrationConfig,
  onSaved,
}: LinkedInCreativeMappingWizardProps) {
  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  // Step 1 state
  const [mapping, setMapping] = useState<LinkedInColumnMapping>(
    extractMapping(integrationConfig)
  );

  // Step 3 state
  const [budget, setBudget] = useState<LinkedInBudgetConfig>(
    extractBudget(integrationConfig)
  );
  const [dailyBudgetStr, setDailyBudgetStr] = useState<string>(
    String(extractBudget(integrationConfig).daily_budget ?? '')
  );

  // Re-sync when config changes (e.g., parent reloads)
  useEffect(() => {
    if (open) {
      const m = extractMapping(integrationConfig);
      const b = extractBudget(integrationConfig);
      setMapping(m);
      setBudget(b);
      setDailyBudgetStr(String(b.daily_budget ?? ''));
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch columns
  const { data: columns = [], isLoading: columnsLoading } = useQuery({
    queryKey: ['ops-columns-for-mapping', tableId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dynamic_table_columns')
        .select('id, key, label, column_type')
        .eq('table_id', tableId)
        .eq('is_visible', true)
        .order('position');
      if (error) throw error;
      return (data ?? []) as TableColumn[];
    },
    enabled: open && !!tableId,
  });

  // Fetch first 3 rows + cells for preview
  const { data: previewRows = [], isLoading: rowsLoading } = useQuery({
    queryKey: ['ops-preview-rows', tableId],
    queryFn: async () => {
      // Get column ID → key mapping
      const colMap = Object.fromEntries(columns.map((c) => [c.id, c.key]));

      const { data: rows, error } = await supabase
        .from('dynamic_table_rows')
        .select('id, row_index, dynamic_table_cells(column_id, value)')
        .eq('table_id', tableId)
        .order('row_index', { ascending: true })
        .limit(3);

      if (error) throw error;

      return ((rows ?? []) as {
        id: string;
        row_index: number;
        dynamic_table_cells: { column_id: string; value: string | null }[];
      }[]).map((row) => ({
        id: row.id,
        row_index: row.row_index,
        cells: (row.dynamic_table_cells ?? []).map((cell) => ({
          column_key: colMap[cell.column_id] ?? cell.column_id,
          value: cell.value,
        })),
      })) as TableRow[];
    },
    enabled: open && step === 2 && columns.length > 0,
  });

  // Derived: number columns only (for budget column mapping)
  const numberColumns = columns.filter((c) => c.column_type === 'number');

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  const mappingValid =
    mapping.headline !== null && mapping.body !== null;

  const budgetValid = (() => {
    if (budget.source === 'manual') {
      const val = parseFloat(dailyBudgetStr);
      return !isNaN(val) && val >= 10;
    }
    return budget.budget_column !== null;
  })();

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  const handleSave = async () => {
    if (!mappingValid) {
      toast.error('Headline and Body mappings are required');
      return;
    }
    if (!budgetValid) {
      toast.error(
        budget.source === 'manual'
          ? 'Daily budget must be at least $10'
          : 'Select a budget column'
      );
      return;
    }

    setIsSaving(true);
    try {
      const resolvedBudget: LinkedInBudgetConfig = {
        ...budget,
        daily_budget:
          budget.source === 'manual' ? parseFloat(dailyBudgetStr) : null,
      };

      const existingLinkedIn = (integrationConfig?.linkedin ?? {}) as Record<string, unknown>;

      const merged: Record<string, unknown> = {
        ...(integrationConfig ?? {}),
        linkedin: {
          ...existingLinkedIn,
          column_mapping: mapping,
          budget: resolvedBudget,
        },
      };

      const { error } = await supabase
        .from('dynamic_tables')
        .update({ integration_config: merged })
        .eq('id', tableId);

      if (error) throw error;

      toast.success('Creative mapping saved');
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save mapping';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  const handleNext = () => {
    if (step === 1 && !mappingValid) {
      toast.error('Map at least Headline and Body before continuing');
      return;
    }
    setStep((s) => Math.min(3, s + 1));
  };

  const handleBack = () => setStep((s) => Math.max(1, s - 1));

  const handleClose = () => {
    if (isSaving) return;
    setStep(1);
    onOpenChange(false);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-[680px] max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>LinkedIn Creative Mapping</DialogTitle>
          <DialogDescription>Map ops table columns to LinkedIn ad creative fields</DialogDescription>
        </DialogHeader>

        {/* ---- Step indicator ---- */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-800">
          <h2 className="text-base font-semibold text-white mb-3">LinkedIn Creative Mapping</h2>
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.id}>
                <div className="flex items-center gap-1.5">
                  <div
                    className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium transition-colors ${
                      step > s.id
                        ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/40'
                        : step === s.id
                        ? 'bg-blue-900/40 text-blue-400 border border-blue-700/40'
                        : 'bg-gray-800 text-gray-500 border border-gray-700'
                    }`}
                  >
                    {step > s.id ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      s.id
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium hidden sm:inline ${
                      step >= s.id ? 'text-gray-300' : 'text-gray-600'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-px mx-2 ${
                      step > s.id ? 'bg-emerald-700/50' : 'bg-gray-700'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ---- Content ---- */}
        <div className="flex-1 overflow-y-auto">
          {/* ================================================================
              STEP 1 — Map Columns
          ================================================================ */}
          {step === 1 && (
            <div className="p-6 space-y-5">
              {columnsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                </div>
              ) : columns.length === 0 ? (
                <div className="flex items-center gap-2.5 rounded-lg border border-amber-700/40 bg-amber-900/10 px-4 py-3">
                  <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                  <p className="text-xs text-amber-300">
                    This table has no visible columns yet. Add columns first.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-400">
                    Match each LinkedIn creative field to a column from your ops table. Headline
                    and Body are required.
                  </p>

                  <div className="space-y-3">
                    {CREATIVE_FIELDS.map((field) => {
                      const FieldIcon = field.icon;
                      return (
                        <div
                          key={field.key}
                          className="rounded-lg border border-gray-700 bg-gray-800/40 p-4"
                        >
                          <div className="flex items-start gap-3">
                            {/* Icon */}
                            <div className="shrink-0 mt-0.5 w-7 h-7 rounded-md bg-gray-700/60 flex items-center justify-center">
                              <FieldIcon className="h-3.5 w-3.5 text-gray-400" />
                            </div>

                            {/* Label + description */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <Label className="text-xs font-medium text-gray-200">
                                  {field.label}
                                </Label>
                                {field.required && (
                                  <span className="text-[10px] text-red-400 font-medium">
                                    Required
                                  </span>
                                )}
                                {field.maxLen && (
                                  <span className="text-[10px] text-gray-500">
                                    max {field.maxLen} chars
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-gray-500 mb-2 leading-relaxed">
                                {field.description}
                              </p>

                              <ColumnSelect
                                value={mapping[field.key]}
                                columns={columns}
                                onChange={(key) =>
                                  setMapping((prev) => ({ ...prev, [field.key]: key }))
                                }
                                placeholder={
                                  field.required ? '— select a column —' : '— not mapped (optional) —'
                                }
                                allowedTypes={field.types}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Validation hint */}
                  {!mappingValid && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-700/40 bg-amber-900/10 px-3 py-2.5">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <p className="text-xs text-amber-300">
                        Map Headline and Body to continue.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ================================================================
              STEP 2 — Preview
          ================================================================ */}
          {step === 2 && (
            <div className="p-6 space-y-5">
              <p className="text-xs text-gray-400">
                Preview how your first rows will look as LinkedIn sponsored content creatives.
                Data is pulled from the live table.
              </p>

              {rowsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                </div>
              ) : previewRows.length === 0 ? (
                <div className="flex items-center gap-2.5 rounded-lg border border-gray-700 bg-gray-800/40 px-4 py-4">
                  <AlertCircle className="h-4 w-4 text-gray-500 shrink-0" />
                  <p className="text-xs text-gray-400">
                    No rows found in this table to preview.
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-4 justify-center">
                  {previewRows.map((row, i) => (
                    <LinkedInAdPreviewCard
                      key={row.id}
                      index={i}
                      headline={getCellValue(row, mapping.headline)}
                      body={getCellValue(row, mapping.body)}
                      ctaText={getCellValue(row, mapping.cta_text)}
                      destinationUrl={getCellValue(row, mapping.destination_url)}
                      mediaUrl={getCellValue(row, mapping.media_asset)}
                    />
                  ))}
                </div>
              )}

              {/* Mapping summary */}
              <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-4">
                <p className="text-xs font-medium text-gray-300 mb-2.5">Active column mapping</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                  {CREATIVE_FIELDS.map((field) => {
                    const mapped = mapping[field.key];
                    const col = columns.find((c) => c.key === mapped);
                    return (
                      <div key={field.key} className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-500 min-w-[90px]">
                          {field.label}
                        </span>
                        {col ? (
                          <span className="text-[11px] text-blue-400 font-medium truncate">
                            {col.label}
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-600 italic">not mapped</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              STEP 3 — Budget
          ================================================================ */}
          {step === 3 && (
            <div className="p-6 space-y-5">
              <p className="text-xs text-gray-400">
                Configure how daily budget is set for the LinkedIn campaign(s) generated from
                this table.
              </p>

              {/* Source selector */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-gray-300">Budget source</Label>
                <div className="space-y-2">
                  {/* Manual */}
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      budget.source === 'manual'
                        ? 'border-blue-500/50 bg-blue-900/10'
                        : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="budget_source"
                      value="manual"
                      checked={budget.source === 'manual'}
                      onChange={() =>
                        setBudget((prev) => ({ ...prev, source: 'manual' }))
                      }
                      className="mt-1 accent-blue-500"
                    />
                    <div>
                      <p className="text-xs font-medium text-white">Manual daily budget</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Enter a fixed daily spend. All campaigns / ad sets share this budget.
                      </p>
                    </div>
                  </label>

                  {/* Column */}
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      budget.source === 'column'
                        ? 'border-blue-500/50 bg-blue-900/10'
                        : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="budget_source"
                      value="column"
                      checked={budget.source === 'column'}
                      onChange={() =>
                        setBudget((prev) => ({ ...prev, source: 'column' }))
                      }
                      className="mt-1 accent-blue-500"
                    />
                    <div>
                      <p className="text-xs font-medium text-white">Map from a number column</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Read each row's daily budget from a number column. Useful when different
                        creatives have different budgets.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Manual: number input */}
              {budget.source === 'manual' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-300">
                    Daily budget (USD)
                    <span className="text-red-400 ml-0.5">*</span>
                  </Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                    <input
                      type="number"
                      min={10}
                      step={1}
                      value={dailyBudgetStr}
                      onChange={(e) => setDailyBudgetStr(e.target.value)}
                      placeholder="50"
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-8 pr-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  {dailyBudgetStr !== '' &&
                    (isNaN(parseFloat(dailyBudgetStr)) || parseFloat(dailyBudgetStr) < 10) && (
                      <p className="text-xs text-red-400 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Minimum daily budget is $10
                      </p>
                    )}
                </div>
              )}

              {/* Column: budget column selector */}
              {budget.source === 'column' && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <BarChart2 className="h-3.5 w-3.5 text-gray-500" />
                      <Label className="text-xs font-medium text-gray-300">
                        Budget column
                        <span className="text-red-400 ml-0.5">*</span>
                      </Label>
                    </div>
                    <p className="text-[11px] text-gray-500 mb-1.5">
                      Each row's value in this column becomes its daily budget.
                    </p>
                    {numberColumns.length === 0 ? (
                      <div className="flex items-center gap-2 rounded-lg border border-amber-700/40 bg-amber-900/10 px-3 py-2.5">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        <p className="text-xs text-amber-300">
                          No number columns found. Add a number column to this table first.
                        </p>
                      </div>
                    ) : (
                      <ColumnSelect
                        value={budget.budget_column}
                        columns={numberColumns}
                        onChange={(key) =>
                          setBudget((prev) => ({ ...prev, budget_column: key }))
                        }
                        placeholder="— select budget column —"
                      />
                    )}
                  </div>

                  {/* Weight column — optional */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <MapPin className="h-3.5 w-3.5 text-gray-500" />
                      <Label className="text-xs font-medium text-gray-300">
                        Weight column
                        <span className="text-gray-500 ml-1 font-normal">(optional)</span>
                      </Label>
                    </div>
                    <p className="text-[11px] text-gray-500 mb-1.5">
                      When set, budgets are distributed proportionally based on this column's
                      values instead of taken directly.
                    </p>
                    <ColumnSelect
                      value={budget.weight_column}
                      columns={numberColumns}
                      onChange={(key) =>
                        setBudget((prev) => ({ ...prev, weight_column: key }))
                      }
                      placeholder="— no weight (use raw values) —"
                    />
                  </div>
                </div>
              )}

              {/* Summary when valid */}
              {budgetValid && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-700/40 bg-emerald-900/10 px-3 py-2.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <p className="text-xs text-emerald-300">
                    {budget.source === 'manual'
                      ? `Daily budget: $${parseFloat(dailyBudgetStr).toFixed(2)} USD`
                      : `Budget from column: "${columns.find((c) => c.key === budget.budget_column)?.label ?? budget.budget_column}"`}
                    {budget.weight_column &&
                      ` — weighted by "${columns.find((c) => c.key === budget.weight_column)?.label ?? budget.weight_column}"`}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---- Footer ---- */}
        <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-between gap-3">
          {/* Back / Cancel */}
          <Button
            variant="ghost"
            size="sm"
            onClick={step === 1 ? handleClose : handleBack}
            disabled={isSaving}
            className="gap-1.5 text-gray-400 hover:text-white"
          >
            {step === 1 ? (
              'Cancel'
            ) : (
              <>
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </>
            )}
          </Button>

          {/* Next / Save */}
          {step < 3 ? (
            <Button
              size="sm"
              onClick={handleNext}
              disabled={step === 1 && !mappingValid}
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
            >
              Next
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !mappingValid || !budgetValid}
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Save Mapping
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
