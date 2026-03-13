/**
 * LinkedInCampaignLauncher
 *
 * "Launch Campaign" button with a spend-approval gate.
 * Visible only when a campaign is bound (integration_config.linkedin.campaign_id exists).
 *
 * Pre-conditions before launch is enabled:
 *   1. At least one creative has been pushed (a cell has metadata.linkedin_creative_urn)
 *   2. A budget has been configured (integration_config.linkedin.budget exists)
 *   3. The linked campaign is NOT already ACTIVE
 *
 * Launch flow:
 *   1. User clicks "Launch Campaign" → spend confirmation modal opens
 *   2. Modal shows campaign name / group, creative count, daily budget, estimated monthly spend
 *   3. User must type "LAUNCH" to enable the confirm button — this is a SECURITY gate
 *   4. On confirm → calls linkedin-campaign-manager with action: 'update_status', status: 'ACTIVE'
 *   5. On success → "Campaign Live" badge shown, success toast
 *   6. On failure → error toast with LinkedIn API error message
 */

import React, { useState, useMemo } from 'react';
import {
  Rocket,
  ShieldAlert,
  CheckCircle2,
  Loader2,
  X,
  DollarSign,
  Layers,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LinkedInCampaignLauncherProps {
  tableId: string;
  /** Current integration_config from the dynamic_tables row */
  integrationConfig: Record<string, unknown> | null;
  /** Called after a successful launch so the parent can refresh */
  onLaunched?: () => void;
}

interface ManagedCampaign {
  id: string;
  name: string;
  status: string;
  version_tag: string | null;
  linkedin_campaign_id: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractLinkedInConfig(config: Record<string, unknown> | null) {
  const li = config?.linkedin as Record<string, unknown> | undefined;
  if (!li) return null;
  return {
    campaign_id: (li.campaign_id as string) || '',
    campaign_name: (li.campaign_name as string) || '',
    campaign_group_name: (li.campaign_group_name as string) || '',
    structure: (li.structure as string) || 'single_campaign',
    budget: li.budget as Record<string, unknown> | undefined,
  };
}

function formatCurrency(usd: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(usd);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LinkedInCampaignLauncher({
  tableId,
  integrationConfig,
  onLaunched,
}: LinkedInCampaignLauncherProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);

  const liConfig = useMemo(() => extractLinkedInConfig(integrationConfig), [integrationConfig]);

  // Only render when a campaign_id is bound
  if (!liConfig?.campaign_id) return null;

  return (
    <LinkedInCampaignLauncherInner
      tableId={tableId}
      liConfig={liConfig}
      modalOpen={modalOpen}
      setModalOpen={setModalOpen}
      confirmText={confirmText}
      setConfirmText={setConfirmText}
      isLaunching={isLaunching}
      setIsLaunching={setIsLaunching}
      onLaunched={onLaunched}
    />
  );
}

// ---------------------------------------------------------------------------
// Inner component (avoids conditional hooks above)
// ---------------------------------------------------------------------------

function LinkedInCampaignLauncherInner({
  tableId,
  liConfig,
  modalOpen,
  setModalOpen,
  confirmText,
  setConfirmText,
  isLaunching,
  setIsLaunching,
  onLaunched,
}: {
  tableId: string;
  liConfig: NonNullable<ReturnType<typeof extractLinkedInConfig>>;
  modalOpen: boolean;
  setModalOpen: (v: boolean) => void;
  confirmText: string;
  setConfirmText: (v: string) => void;
  isLaunching: boolean;
  setIsLaunching: (v: boolean) => void;
  onLaunched?: () => void;
}) {
  // ---- Query: managed campaign record ----
  const { data: campaign, isLoading: campaignLoading } = useQuery<ManagedCampaign | null>({
    queryKey: ['linkedin-managed-campaign', liConfig.campaign_id],
    queryFn: async () => {
      if (!liConfig.campaign_id) return null;
      const { data, error } = await supabase
        .from('linkedin_managed_campaigns')
        .select('id, name, status, version_tag, linkedin_campaign_id')
        .eq('linkedin_campaign_id', liConfig.campaign_id)
        .maybeSingle();
      if (error) {
        console.warn('[LinkedInCampaignLauncher] Failed to fetch campaign:', error.message);
        return null;
      }
      return data as ManagedCampaign | null;
    },
    enabled: !!liConfig.campaign_id,
    staleTime: 30_000,
  });

  // ---- Query: creative count (cells with linkedin_creative_urn in metadata) ----
  const { data: creativeCount = 0, isLoading: creativesLoading } = useQuery<number>({
    queryKey: ['linkedin-creative-count', tableId],
    queryFn: async () => {
      // Count dynamic_table_cells where metadata->linkedin_creative_urn is not null
      // We query the rows first, then count cells with the URN set
      const { data: rows, error: rowsError } = await supabase
        .from('dynamic_table_rows')
        .select('id')
        .eq('table_id', tableId);

      if (rowsError || !rows || rows.length === 0) return 0;

      const rowIds = rows.map((r: { id: string }) => r.id);

      // Fetch all cells for these rows that have metadata
      const { data: cells, error: cellsError } = await supabase
        .from('dynamic_table_cells')
        .select('row_id, metadata')
        .in('row_id', rowIds)
        .not('metadata', 'is', null);

      if (cellsError || !cells) return 0;

      // Count unique rows that have at least one cell with linkedin_creative_urn
      const rowsWithCreative = new Set<string>();
      for (const cell of cells) {
        const meta = cell.metadata as Record<string, unknown> | null;
        if (meta?.linkedin_creative_urn) {
          rowsWithCreative.add(cell.row_id as string);
        }
      }
      return rowsWithCreative.size;
    },
    enabled: !!tableId,
    staleTime: 30_000,
  });

  // ---- Derived state ----
  const hasBudget = !!liConfig.budget?.source;
  const hasCreatives = creativeCount > 0;
  const isAlreadyActive = campaign?.status === 'ACTIVE';
  const canLaunch = hasCreatives && hasBudget && !isAlreadyActive && !campaignLoading;

  // Daily budget for display
  const dailyBudgetDisplay = useMemo(() => {
    const b = liConfig.budget;
    if (!b) return null;
    if (b.source === 'manual' && typeof b.daily_budget === 'number') {
      return b.daily_budget as number;
    }
    return null; // column-mode budget — cannot display exact amount client-side
  }, [liConfig.budget]);

  const monthlyEstimate = dailyBudgetDisplay !== null ? dailyBudgetDisplay * 30 : null;

  // ---- Confirm text check ----
  const confirmEnabled = confirmText.trim().toUpperCase() === 'LAUNCH';

  // ---- Launch handler ----
  const handleLaunch = async () => {
    if (!confirmEnabled) return;
    if (!campaign?.id) {
      toast.error('Campaign record not found. Please ensure the campaign has been synced to LinkedIn.');
      return;
    }

    setIsLaunching(true);
    try {
      const { data, error } = await supabase.functions.invoke('linkedin-campaign-manager', {
        body: {
          action: 'update_status',
          campaign_id: campaign.id,
          status: 'ACTIVE',
          version_tag: campaign.version_tag ?? 'initial',
        },
      });

      if (error) throw new Error(error.message || 'Launch failed');
      if (data?.error) throw new Error(data.error as string);

      toast.success('Campaign is now live on LinkedIn');
      setModalOpen(false);
      setConfirmText('');
      onLaunched?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to launch campaign';
      toast.error(message);
    } finally {
      setIsLaunching(false);
    }
  };

  const handleClose = () => {
    if (isLaunching) return;
    setModalOpen(false);
    setConfirmText('');
  };

  // ---- Render: toolbar button ----
  const isLoading = campaignLoading || creativesLoading;

  if (isAlreadyActive) {
    // Already live — show a read-only badge
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/40 bg-emerald-900/15 px-2.5 py-1.5 text-xs font-medium text-emerald-300">
        <Zap className="h-3.5 w-3.5 text-emerald-400" />
        Campaign Live
      </span>
    );
  }

  return (
    <>
      {/* Toolbar trigger */}
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        disabled={!canLaunch || isLoading}
        title={
          !hasCreatives
            ? 'Push creatives to LinkedIn first'
            : !hasBudget
            ? 'Configure budget first'
            : 'Launch this campaign on LinkedIn'
        }
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          canLaunch
            ? 'border-emerald-700/50 bg-emerald-900/20 text-emerald-300 hover:bg-emerald-900/40 hover:text-emerald-200'
            : 'border-gray-700 bg-gray-800 text-gray-500'
        }`}
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Rocket className="h-3.5 w-3.5" />
        )}
        Launch
      </button>

      {/* Spend approval modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="launch-modal-title"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Dialog */}
          <div className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-gray-900 shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-900/30 border border-emerald-700/30">
                  <Rocket className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <h2
                    id="launch-modal-title"
                    className="text-base font-semibold text-white"
                  >
                    Launch Campaign
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Review spend before going live
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={isLaunching}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-white/[0.06] hover:text-gray-300 transition-colors disabled:opacity-50"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5">
              {/* Campaign summary */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] divide-y divide-white/[0.06]">
                <SummaryRow
                  label="Campaign"
                  value={liConfig.campaign_name || liConfig.campaign_id}
                />
                {liConfig.campaign_group_name && (
                  <SummaryRow
                    label="Group"
                    value={liConfig.campaign_group_name}
                  />
                )}
                <SummaryRow
                  label="Structure"
                  value={
                    liConfig.structure === 'per_row_campaign'
                      ? 'Per-row campaigns'
                      : 'Single campaign'
                  }
                />
                <SummaryRow
                  label="Creatives"
                  icon={<Layers className="h-3.5 w-3.5 text-blue-400" />}
                  value={
                    creativeCount > 0
                      ? `${creativeCount} variation${creativeCount !== 1 ? 's' : ''} ready`
                      : 'No creatives pushed yet'
                  }
                  valueClass={creativeCount > 0 ? 'text-blue-300' : 'text-red-400'}
                />
                <SummaryRow
                  label="Daily budget"
                  icon={<DollarSign className="h-3.5 w-3.5 text-emerald-400" />}
                  value={
                    dailyBudgetDisplay !== null
                      ? formatCurrency(dailyBudgetDisplay)
                      : liConfig.budget?.source === 'column'
                      ? 'From column (variable)'
                      : 'Not configured'
                  }
                  valueClass={
                    dailyBudgetDisplay !== null
                      ? 'text-emerald-300 font-semibold tabular-nums'
                      : liConfig.budget?.source === 'column'
                      ? 'text-blue-300'
                      : 'text-red-400'
                  }
                />
                {monthlyEstimate !== null && (
                  <SummaryRow
                    label="Est. monthly"
                    value={`~${formatCurrency(monthlyEstimate)}`}
                    valueClass="text-gray-400 tabular-nums"
                  />
                )}
              </div>

              {/* Warning banner */}
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-700/30 bg-amber-900/10 px-3.5 py-3">
                <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-300">
                    This will start spending real budget
                  </p>
                  <p className="text-xs text-amber-300/70 mt-0.5">
                    LinkedIn will begin serving your ads immediately. You can pause from
                    the LinkedIn Campaign Manager or by changing status back to PAUSED.
                  </p>
                </div>
              </div>

              {/* LAUNCH confirmation input */}
              <div className="space-y-2">
                <label
                  htmlFor="launch-confirm-input"
                  className="block text-xs font-medium text-gray-300"
                >
                  Type{' '}
                  <span className="font-mono font-bold text-white tracking-widest bg-white/[0.06] rounded px-1.5 py-0.5">
                    LAUNCH
                  </span>{' '}
                  to confirm
                </label>
                <input
                  id="launch-confirm-input"
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Type LAUNCH here"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                  disabled={isLaunching}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm font-mono text-white placeholder-gray-600 outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 px-6 pb-6">
              <button
                type="button"
                onClick={handleClose}
                disabled={isLaunching}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleLaunch}
                disabled={!confirmEnabled || isLaunching || !campaign?.id}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-600/50 bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isLaunching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Launching…
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4" />
                    Launch Campaign
                  </>
                )}
              </button>
            </div>

            {/* Campaign not found warning */}
            {!campaignLoading && !campaign && (
              <div className="mx-6 mb-6 -mt-2 flex items-start gap-2 rounded-lg border border-amber-700/30 bg-amber-900/10 px-3 py-2.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300/80">
                  Campaign record not found in local database. Make sure you have created
                  the campaign via the LinkedIn Campaign Manager before launching.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: SummaryRow
// ---------------------------------------------------------------------------

function SummaryRow({
  label,
  value,
  icon,
  valueClass = 'text-white',
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <div className={`flex items-center gap-1.5 text-xs text-right ${valueClass}`}>
        {icon}
        <span>{value}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Re-export the "already live" badge for standalone use
// ---------------------------------------------------------------------------

export function LinkedInCampaignLiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/40 bg-emerald-900/15 px-2.5 py-1.5 text-xs font-medium text-emerald-300">
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
      Campaign Live
    </span>
  );
}
