/**
 * LinkedInBudgetManager
 *
 * Reads the budget config stored in `dynamic_tables.integration_config.linkedin.budget`
 * and surfaces a UI to inspect, validate, and sync budgets to LinkedIn campaigns.
 *
 * Budget config shape (from LinkedInCreativeMappingWizard Step 3):
 *   {
 *     source: 'manual' | 'column',
 *     daily_budget: number | null,     -- used when source = 'manual'
 *     budget_column: string | null,    -- column key when source = 'column'
 *     weight_column: string | null,    -- optional, proportional distribution
 *   }
 *
 * Sync is one-directional: ops table → LinkedIn only.
 * Minimum $10/day per LinkedIn campaign (enforced here AND in the edge function).
 */

import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  Calculator,
  Scale,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import type { LinkedInBudgetConfig } from './LinkedInCreativeMappingWizard';
import type { LinkedInCampaignConfig } from './LinkedInCampaignBinding';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LINKEDIN_MIN_DAILY_BUDGET = 10; // USD

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

/** A single per-campaign budget line: row label + resolved daily budget */
interface CampaignBudgetLine {
  rowId: string;
  rowIndex: number;
  label: string;
  rawValue: number | null;
  weight: number | null;
  dailyBudget: number | null;
  error: string | null;
}

interface LinkedInBudgetManagerProps {
  tableId: string;
  integrationConfig: Record<string, unknown> | null;
  onSaved?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractBudgetConfig(
  integrationConfig: Record<string, unknown> | null
): LinkedInBudgetConfig | null {
  const li = integrationConfig?.linkedin as Record<string, unknown> | undefined;
  if (!li) return null;
  const b = li.budget as Record<string, unknown> | undefined;
  if (!b?.source) return null;
  return {
    source: b.source as 'manual' | 'column',
    daily_budget: (b.daily_budget as number) ?? null,
    budget_column: (b.budget_column as string) ?? null,
    weight_column: (b.weight_column as string) ?? null,
  };
}

function extractCampaignConfig(
  integrationConfig: Record<string, unknown> | null
): LinkedInCampaignConfig | null {
  const li = integrationConfig?.linkedin as Record<string, unknown> | undefined;
  if (!li?.campaign_group_id) return null;
  return {
    campaign_group_id: li.campaign_group_id as string,
    campaign_group_name: (li.campaign_group_name as string) || '',
    campaign_id: (li.campaign_id as string) || '',
    campaign_name: (li.campaign_name as string) || '',
    structure: (li.structure as 'single_campaign' | 'per_row_campaign') || 'single_campaign',
  };
}

function getCellValue(row: TableRow, columnKey: string | null): string {
  if (!columnKey) return '';
  const cell = row.cells.find((c) => c.column_key === columnKey);
  return cell?.value ?? '';
}

function parseNumber(value: string): number | null {
  const n = parseFloat(value);
  return isNaN(n) ? null : n;
}

/**
 * Given raw row values and optional weight column values, compute per-row
 * daily budgets. Weights distribute a total proportionally.
 */
function resolvePerRowBudgets(
  rows: TableRow[],
  budgetConfig: LinkedInBudgetConfig,
  columns: TableColumn[]
): CampaignBudgetLine[] {
  const nameCol = columns.find(
    (c) => c.column_type === 'text' && c.key !== budgetConfig.budget_column && c.key !== budgetConfig.weight_column
  );

  // Gather raw budget values
  const rawValues = rows.map((row) => {
    const rawStr = getCellValue(row, budgetConfig.budget_column);
    return { row, raw: parseNumber(rawStr) };
  });

  // Gather weight values if configured
  const hasWeights = !!budgetConfig.weight_column;
  const weightValues = hasWeights
    ? rows.map((row) => parseNumber(getCellValue(row, budgetConfig.weight_column)))
    : null;

  // Compute total weight
  const totalWeight = weightValues
    ? weightValues.reduce<number>((sum, w) => sum + (w ?? 0), 0)
    : null;

  // Compute total budget (sum of raw values, used when weights are active)
  const totalBudget = hasWeights
    ? rawValues.reduce<number>((sum, { raw }) => sum + (raw ?? 0), 0)
    : null;

  return rawValues.map(({ row, raw }, i) => {
    const label = nameCol ? (getCellValue(row, nameCol.key) || `Row ${row.row_index + 1}`) : `Row ${row.row_index + 1}`;
    const weight = weightValues ? weightValues[i] : null;

    let dailyBudget: number | null = null;
    let error: string | null = null;

    if (hasWeights && totalWeight && totalBudget !== null && weight !== null) {
      // Proportional distribution: (weight / totalWeight) * totalBudget
      dailyBudget = totalWeight > 0 ? (weight / totalWeight) * totalBudget : 0;
    } else {
      // Use raw value directly
      dailyBudget = raw;
    }

    if (dailyBudget === null) {
      error = 'No budget value in this row';
    } else if (dailyBudget < 0) {
      error = 'Budget cannot be negative';
    } else if (dailyBudget < LINKEDIN_MIN_DAILY_BUDGET) {
      error = `Minimum is $${LINKEDIN_MIN_DAILY_BUDGET}/day`;
    }

    return {
      rowId: row.id,
      rowIndex: row.row_index,
      label,
      rawValue: raw,
      weight,
      dailyBudget,
      error,
    };
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BudgetValidationBadge({ error }: { error: string | null }) {
  if (!error) {
    return (
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-red-700/40 bg-red-900/10 px-1.5 py-0.5 text-[10px] text-red-400">
      <AlertCircle className="h-3 w-3 shrink-0" />
      {error}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function LinkedInBudgetManager({
  tableId,
  integrationConfig,
  onSaved,
}: LinkedInBudgetManagerProps) {
  const [expanded, setExpanded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const budgetConfig = extractBudgetConfig(integrationConfig);
  const campaignConfig = extractCampaignConfig(integrationConfig);

  // Only render when both campaign binding AND budget config exist
  if (!budgetConfig || !campaignConfig) return null;

  return (
    <BudgetManagerInner
      tableId={tableId}
      integrationConfig={integrationConfig}
      budgetConfig={budgetConfig}
      campaignConfig={campaignConfig}
      expanded={expanded}
      setExpanded={setExpanded}
      isSyncing={isSyncing}
      setIsSyncing={setIsSyncing}
      onSaved={onSaved}
    />
  );
}

// Inner component has access to validated config — avoids prop drilling and conditional hook issues
function BudgetManagerInner({
  tableId,
  integrationConfig,
  budgetConfig,
  campaignConfig,
  expanded,
  setExpanded,
  isSyncing,
  setIsSyncing,
  onSaved,
}: {
  tableId: string;
  integrationConfig: Record<string, unknown> | null;
  budgetConfig: LinkedInBudgetConfig;
  campaignConfig: LinkedInCampaignConfig;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  isSyncing: boolean;
  setIsSyncing: (v: boolean) => void;
  onSaved?: () => void;
}) {
  const isColumnMode = budgetConfig.source === 'column';
  const isPerRow = campaignConfig.structure === 'per_row_campaign';

  // Fetch columns (needed for column mode to resolve labels)
  const { data: columns = [] } = useQuery<TableColumn[]>({
    queryKey: ['ops-columns-for-budget', tableId],
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
    enabled: isColumnMode,
    staleTime: 30_000,
  });

  // Fetch all rows + cells (only needed in column mode)
  const { data: rows = [], isLoading: rowsLoading } = useQuery<TableRow[]>({
    queryKey: ['ops-rows-for-budget', tableId],
    queryFn: async () => {
      const colMap = Object.fromEntries(columns.map((c) => [c.id, c.key]));

      const { data, error } = await supabase
        .from('dynamic_table_rows')
        .select('id, row_index, dynamic_table_cells(column_id, value)')
        .eq('table_id', tableId)
        .order('row_index', { ascending: true });

      if (error) throw error;

      return ((data ?? []) as {
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
    enabled: isColumnMode && expanded && columns.length > 0,
    staleTime: 30_000,
  });

  // Compute per-row budget lines (column mode only)
  const budgetLines = useMemo<CampaignBudgetLine[]>(() => {
    if (!isColumnMode || rows.length === 0) return [];
    return resolvePerRowBudgets(rows, budgetConfig, columns);
  }, [rows, budgetConfig, columns, isColumnMode]);

  // Validation state
  const manualBudgetError: string | null = useMemo(() => {
    if (budgetConfig.source !== 'manual') return null;
    const v = budgetConfig.daily_budget;
    if (v === null) return 'No budget configured';
    if (v < 0) return 'Budget cannot be negative';
    if (v < LINKEDIN_MIN_DAILY_BUDGET) return `Minimum is $${LINKEDIN_MIN_DAILY_BUDGET}/day`;
    return null;
  }, [budgetConfig]);

  const columnModeErrors = budgetLines.filter((l) => l.error !== null);
  const hasErrors = budgetConfig.source === 'manual' ? !!manualBudgetError : columnModeErrors.length > 0;

  // Summary values
  const totalBudgetDisplay = useMemo(() => {
    if (budgetConfig.source === 'manual') {
      return budgetConfig.daily_budget !== null
        ? `$${budgetConfig.daily_budget.toFixed(2)}`
        : '—';
    }
    // Column mode: sum of all resolved daily budgets
    if (budgetLines.length === 0) return '—';
    const total = budgetLines.reduce<number>(
      (sum, l) => sum + (l.dailyBudget ?? 0),
      0
    );
    return `$${total.toFixed(2)}`;
  }, [budgetConfig, budgetLines]);

  const budgetColumnLabel = columns.find((c) => c.key === budgetConfig.budget_column)?.label ?? budgetConfig.budget_column ?? '—';
  const weightColumnLabel = budgetConfig.weight_column
    ? (columns.find((c) => c.key === budgetConfig.weight_column)?.label ?? budgetConfig.weight_column)
    : null;

  // ---- Sync handler ----

  const handleSync = async () => {
    if (hasErrors) {
      toast.error('Fix validation errors before syncing');
      return;
    }

    setIsSyncing(true);
    try {
      // Build the payload for the edge function
      const payload: Record<string, unknown> = {
        action: 'update_campaign_budget',
        table_id: tableId,
      };

      const { data, error } = await supabase.functions.invoke('linkedin-campaign-manager', {
        body: payload,
      });

      if (error) throw new Error(error.message || 'Sync failed');
      if (data?.error) throw new Error(data.error);

      const updatedCount = (data?.updated_count as number) ?? 0;
      toast.success(
        updatedCount > 0
          ? `Budget synced to ${updatedCount} campaign${updatedCount !== 1 ? 's' : ''}`
          : 'Budget sync complete'
      );

      onSaved?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to sync budget';
      toast.error(message);
    } finally {
      setIsSyncing(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="rounded-xl border border-blue-800/30 bg-blue-950/10 overflow-hidden">
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-blue-900/10 transition-colors"
      >
        {/* Icon */}
        <div className="shrink-0 w-7 h-7 rounded-md bg-blue-900/30 border border-blue-800/40 flex items-center justify-center">
          {isColumnMode ? (
            budgetConfig.weight_column ? (
              <Scale className="h-3.5 w-3.5 text-blue-400" />
            ) : (
              <Calculator className="h-3.5 w-3.5 text-blue-400" />
            )
          ) : (
            <DollarSign className="h-3.5 w-3.5 text-blue-400" />
          )}
        </div>

        {/* Labels */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-blue-200">Budget</span>

            {/* Mode badge */}
            <span className="text-[10px] text-blue-500 rounded px-1 py-0.5 bg-blue-900/30 border border-blue-800/30">
              {budgetConfig.source === 'manual' ? 'Manual' : 'Column'}
              {isPerRow ? ' · Per Campaign' : ' · Shared'}
            </span>

            {/* Error badge */}
            {hasErrors && (
              <span className="inline-flex items-center gap-1 text-[10px] text-red-400">
                <AlertCircle className="h-3 w-3" />
                {budgetConfig.source === 'manual' ? '1 error' : `${columnModeErrors.length} error${columnModeErrors.length !== 1 ? 's' : ''}`}
              </span>
            )}
          </div>

          <p className="text-[11px] text-blue-400/70 mt-0.5 truncate">
            {budgetConfig.source === 'manual'
              ? `${totalBudgetDisplay}/day`
              : `From column: ${budgetColumnLabel}${weightColumnLabel ? ` · weighted by ${weightColumnLabel}` : ''}`}
          </p>
        </div>

        {/* Total budget (right side) */}
        <div className="shrink-0 flex items-center gap-2">
          <span className={`text-sm font-semibold tabular-nums ${hasErrors ? 'text-red-400' : 'text-blue-200'}`}>
            {totalBudgetDisplay}
            <span className="text-[10px] font-normal text-blue-500 ml-0.5">/day</span>
          </span>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-blue-500" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-blue-500" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-blue-800/20 px-4 pb-4 pt-3 space-y-4">
          {/* ---- Manual mode ---- */}
          {budgetConfig.source === 'manual' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-300">Daily Budget</p>
                  {isPerRow ? (
                    <p className="text-[11px] text-gray-500">
                      Shared across all campaigns in this table
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-500">
                      Applied to the single linked campaign
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className={`text-lg font-bold tabular-nums ${manualBudgetError ? 'text-red-400' : 'text-white'}`}>
                    {budgetConfig.daily_budget !== null ? `$${budgetConfig.daily_budget.toFixed(2)}` : '—'}
                  </p>
                  <p className="text-[10px] text-gray-500">USD / day</p>
                </div>
              </div>

              {/* Validation error */}
              {manualBudgetError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-700/40 bg-red-900/10 px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                  <p className="text-xs text-red-400">{manualBudgetError}</p>
                </div>
              )}

              {/* Info banner for per-row structure */}
              {!manualBudgetError && isPerRow && (
                <div className="flex items-start gap-2 rounded-lg border border-blue-800/30 bg-blue-900/10 px-3 py-2">
                  <Info className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-blue-400/80">
                    This fixed daily budget will be set on every campaign in the per-row structure.
                    Use "Map from a number column" in the wizard if you need per-campaign budgets.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ---- Column mode ---- */}
          {budgetConfig.source === 'column' && (
            <div className="space-y-3">
              {/* Config summary */}
              <div className="flex items-center gap-4 text-[11px] text-gray-400 pb-1">
                <span>
                  Budget column:{' '}
                  <span className="text-blue-400 font-medium">{budgetColumnLabel}</span>
                </span>
                {weightColumnLabel && (
                  <span>
                    Weight column:{' '}
                    <span className="text-blue-400 font-medium">{weightColumnLabel}</span>
                  </span>
                )}
              </div>

              {/* Row budget table */}
              {rowsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                </div>
              ) : budgetLines.length === 0 ? (
                <div className="flex items-center gap-2.5 rounded-lg border border-gray-700 bg-gray-800/40 px-3 py-3">
                  <AlertCircle className="h-4 w-4 text-gray-500 shrink-0" />
                  <p className="text-xs text-gray-400">No rows found in this table.</p>
                </div>
              ) : (
                <div className="rounded-lg border border-gray-700/60 overflow-hidden">
                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-3 py-1.5 bg-gray-800/60 border-b border-gray-700/60">
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Row</span>
                    {weightColumnLabel && (
                      <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide text-right">Weight</span>
                    )}
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide text-right">
                      {weightColumnLabel ? 'Raw' : 'Daily Budget'}
                    </span>
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide text-right">
                      {weightColumnLabel ? 'Resolved' : 'Status'}
                    </span>
                  </div>

                  {/* Rows */}
                  <div className="divide-y divide-gray-700/40">
                    {budgetLines.map((line) => (
                      <div
                        key={line.rowId}
                        className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center px-3 py-2 ${
                          line.error ? 'bg-red-900/5' : ''
                        }`}
                      >
                        {/* Row label */}
                        <span className="text-xs text-gray-300 truncate">
                          {line.label}
                        </span>

                        {/* Weight */}
                        {weightColumnLabel && (
                          <span className="text-xs text-gray-500 tabular-nums text-right">
                            {line.weight !== null ? line.weight.toFixed(2) : '—'}
                          </span>
                        )}

                        {/* Raw value */}
                        <span className="text-xs text-gray-400 tabular-nums text-right">
                          {line.rawValue !== null ? `$${line.rawValue.toFixed(2)}` : '—'}
                        </span>

                        {/* Resolved budget / error */}
                        <div className="flex items-center justify-end gap-1.5">
                          {line.error ? (
                            <BudgetValidationBadge error={line.error} />
                          ) : (
                            <>
                              <span className="text-xs font-medium text-emerald-400 tabular-nums">
                                ${(line.dailyBudget ?? 0).toFixed(2)}
                              </span>
                              <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Footer: total */}
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-3 py-2 bg-gray-800/40 border-t border-gray-700/60">
                    <span className="text-[11px] font-medium text-gray-400">Total daily budget</span>
                    {weightColumnLabel && <span />}
                    <span />
                    <span className={`text-[11px] font-bold tabular-nums text-right ${hasErrors ? 'text-red-400' : 'text-white'}`}>
                      {totalBudgetDisplay}/day
                    </span>
                  </div>
                </div>
              )}

              {/* Errors summary */}
              {columnModeErrors.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-red-700/40 bg-red-900/10 px-3 py-2.5">
                  <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-red-400">
                      {columnModeErrors.length} row{columnModeErrors.length !== 1 ? 's' : ''} have budget errors
                    </p>
                    <p className="text-[11px] text-red-400/70 mt-0.5">
                      Fix values in the ops table, then sync again. LinkedIn requires a minimum of
                      $10/day per campaign.
                    </p>
                  </div>
                </div>
              )}

              {/* Weight distribution explanation */}
              {weightColumnLabel && !hasErrors && budgetLines.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-blue-800/30 bg-blue-900/10 px-3 py-2">
                  <Scale className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-blue-400/80">
                    Budgets are distributed proportionally using the weight column. Total budget is
                    the sum of the budget column values; each campaign receives{' '}
                    <span className="font-medium">(weight / total weight) × total budget</span>.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ---- Sync button ---- */}
          <div className="flex items-center justify-between pt-1 border-t border-blue-800/20">
            <p className="text-[11px] text-gray-500">
              Sync is one-directional: ops table → LinkedIn
            </p>
            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing || hasErrors}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                hasErrors
                  ? 'border border-gray-700 bg-gray-800 text-gray-500 cursor-not-allowed'
                  : 'border border-blue-700/40 bg-blue-900/20 text-blue-300 hover:bg-blue-900/40 hover:text-blue-200'
              }`}
            >
              {isSyncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {isSyncing ? 'Syncing…' : 'Sync Budget'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
