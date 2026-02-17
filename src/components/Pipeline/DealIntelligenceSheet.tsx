/**
 * DealIntelligenceSheet Component (PIPE-009)
 *
 * Right-side sheet panel showing deal intelligence with health scores,
 * risk signals, and quick actions. Premium glass-morphism design.
 */

import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Brain,
  Edit,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw,
  Heart,
  Shield,
  Ghost,
  ChevronRight,
  X,
  DollarSign,
  Layers,
  Calendar,
  Timer,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import type { PipelineDeal } from './hooks/usePipelineData';
import { DealRiskFactors } from './DealRiskFactors';
import { useCopilot } from '@/lib/contexts/CopilotContext';
import { useOrgStore } from '@/lib/stores/orgStore';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

interface DealIntelligenceSheetProps {
  dealId: string | null;
  deal: PipelineDeal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Format currency
 */
function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return '$0';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Get a deterministic gradient for the company avatar
 */
function getAvatarGradient(name: string | null): string {
  const gradients = [
    'from-violet-600 to-violet-400',
    'from-blue-600 to-blue-400',
    'from-emerald-600 to-emerald-400',
    'from-amber-600 to-amber-400',
    'from-pink-600 to-pink-400',
    'from-cyan-600 to-cyan-400',
    'from-red-600 to-red-400',
    'from-indigo-600 to-indigo-400',
  ];
  if (!name) return gradients[0];
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
}

/**
 * Get health score color classes (text + bg)
 */
function getHealthColor(status: string | null): {
  text: string;
  bg: string;
  iconBg: string;
  border: string;
} {
  switch (status) {
    case 'healthy':
      return {
        text: 'text-emerald-600 dark:text-emerald-400',
        bg: 'bg-emerald-500/10',
        iconBg: 'bg-emerald-500/15 dark:bg-emerald-500/20',
        border: 'border-emerald-500/20',
      };
    case 'warning':
    case 'at_risk':
      return {
        text: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-500/10',
        iconBg: 'bg-amber-500/15 dark:bg-amber-500/20',
        border: 'border-amber-500/20',
      };
    case 'critical':
      return {
        text: 'text-red-600 dark:text-red-400',
        bg: 'bg-red-500/10',
        iconBg: 'bg-red-500/15 dark:bg-red-500/20',
        border: 'border-red-500/20',
      };
    case 'stalled':
    case 'ghost':
      return {
        text: 'text-gray-500 dark:text-gray-400',
        bg: 'bg-gray-500/10',
        iconBg: 'bg-gray-500/15 dark:bg-gray-500/20',
        border: 'border-gray-500/20',
      };
    default:
      return {
        text: 'text-gray-500 dark:text-gray-400',
        bg: 'bg-gray-500/10',
        iconBg: 'bg-gray-500/15 dark:bg-gray-500/20',
        border: 'border-gray-500/20',
      };
  }
}

/**
 * Get probability bar gradient
 */
function getProbabilityGradient(probability: number): string {
  if (probability >= 70) return 'from-emerald-500 to-emerald-400';
  if (probability >= 40) return 'from-amber-500 to-amber-400';
  return 'from-red-500 to-red-400';
}

/**
 * Get probability text color
 */
function getProbabilityColor(probability: number): string {
  if (probability >= 70) return 'text-emerald-600 dark:text-emerald-400';
  if (probability >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

/**
 * Capitalize first letter
 */
function capitalize(str: string | null): string {
  if (!str) return 'Unknown';
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
}

// =============================================================================
// Component
// =============================================================================

export function DealIntelligenceSheet({
  dealId: _dealId,
  deal,
  open,
  onOpenChange,
}: DealIntelligenceSheetProps) {
  const { openCopilot, setContext } = useCopilot();
  const activeOrgId = useOrgStore((state) => state.activeOrgId);
  const [crmSyncStatus, setCrmSyncStatus] = useState<{
    hasHubSpot: boolean;
    hasAttio: boolean;
    lastSyncedAt: string | null;
    syncStatus: 'synced' | 'pending' | 'error' | 'none';
  }>({ hasHubSpot: false, hasAttio: false, lastSyncedAt: null, syncStatus: 'none' });
  const [isSyncing, setIsSyncing] = useState(false);

  // Fetch CRM integration status
  useEffect(() => {
    if (!activeOrgId || !open) return;

    async function fetchCRMStatus() {
      try {
        // Check for HubSpot integration
        const { data: hubspot } = await supabase
          .from('hubspot_org_integrations')
          .select('id, clerk_org_id')
          .eq('clerk_org_id', activeOrgId)
          .eq('is_active', true)
          .maybeSingle();

        // Check for Attio integration
        const { data: attio } = await supabase
          .from('attio_org_integrations')
          .select('id, clerk_org_id')
          .eq('clerk_org_id', activeOrgId)
          .eq('is_active', true)
          .maybeSingle();

        const hasHubSpot = !!hubspot;
        const hasAttio = !!attio;

        // Get last sync timestamp from deal_health_scores
        if (deal && (hasHubSpot || hasAttio)) {
          const { data: healthScore } = await supabase
            .from('deal_health_scores')
            .select('updated_at')
            .eq('deal_id', deal.id)
            .maybeSingle();

          setCrmSyncStatus({
            hasHubSpot,
            hasAttio,
            lastSyncedAt: healthScore?.updated_at || null,
            syncStatus: healthScore?.updated_at ? 'synced' : 'none',
          });
        } else {
          setCrmSyncStatus({
            hasHubSpot,
            hasAttio,
            lastSyncedAt: null,
            syncStatus: 'none',
          });
        }
      } catch (error) {
        console.error('Error fetching CRM status:', error);
      }
    }

    fetchCRMStatus();
  }, [activeOrgId, deal, open]);

  // Handle retry sync
  const handleRetrySync = async () => {
    if (!deal || !activeOrgId) return;

    setIsSyncing(true);
    try {
      // Trigger health recalculation which will trigger CRM sync
      const { error } = await supabase
        .from('health_recalc_queue')
        .insert({
          deal_id: deal.id,
          trigger_type: 'manual_crm_sync',
          trigger_source: 'pipeline_ui',
        });

      if (error) throw error;

      toast.success('CRM sync triggered. Health scores will be pushed to CRM shortly.');

      // Update status to pending
      setCrmSyncStatus((prev) => ({ ...prev, syncStatus: 'pending' }));
    } catch (error) {
      console.error('Error triggering CRM sync:', error);
      toast.error('Failed to trigger CRM sync');
    } finally {
      setIsSyncing(false);
    }
  };

  if (!deal) {
    return null;
  }

  // Handle "Ask Copilot" button click
  const handleAskCopilot = () => {
    // Build a comprehensive context message about the deal
    const contextParts = [];

    // Basic deal info
    contextParts.push(`Deal: ${deal.name}`);
    contextParts.push(`Company: ${deal.company || 'Unknown'}`);
    contextParts.push(`Value: ${formatCurrency(deal.value)}`);
    contextParts.push(`Stage: ${deal.stage_name || 'Unknown'}`);

    // Health scores
    if (deal.health_score !== null) {
      contextParts.push(`Deal Health: ${deal.health_score}/100 (${deal.health_status || 'unknown'})`);
    }
    if (deal.relationship_health_score !== null) {
      contextParts.push(`Relationship Health: ${deal.relationship_health_score}/100 (${deal.relationship_health_status || 'unknown'})`);
    }
    if (deal.ghost_probability !== null && deal.ghost_probability > 0) {
      contextParts.push(`Ghost Risk: ${deal.ghost_probability}%`);
    }

    // Risk factors
    const allRiskFactors = [
      ...(deal.risk_factors || []),
      ...(deal.relationship_risk_factors || []),
    ];
    if (allRiskFactors.length > 0) {
      contextParts.push(`Risk Signals: ${allRiskFactors.join(', ')}`);
    }

    // Activity context
    if (deal.days_in_current_stage !== null) {
      contextParts.push(`Days in current stage: ${deal.days_in_current_stage}`);
    }
    if (deal.pending_actions_count > 0) {
      contextParts.push(`Pending actions: ${deal.pending_actions_count}${deal.high_urgency_actions_count > 0 ? ` (${deal.high_urgency_actions_count} high urgency)` : ''}`);
    }

    // Build the initial message
    const contextMessage = `Analyzing deal: ${deal.company || deal.name}\n\n${contextParts.join('\n')}\n\nWhat would you like to know about this deal?`;

    // Set deal context in copilot
    setContext({
      dealIds: [deal.id],
      currentView: 'pipeline',
    });

    // Open copilot with pre-loaded context
    openCopilot(contextMessage, true);
  };

  const companyInitial = (deal.company || deal.name || '?').charAt(0).toUpperCase();
  const winProbability = deal.predicted_close_probability ?? deal.probability;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="md:!top-16 md:!h-[calc(100vh-4rem)] !top-0 !h-screen w-full md:w-[500px] md:max-w-[600px] p-0 border-l border-gray-200/80 dark:border-white/[0.06] bg-white/80 dark:bg-white/[0.03] backdrop-blur-xl overflow-hidden"
      >
        {/* Scrollable content area */}
        <div className="h-full flex flex-col">
          <div className="flex-1 overflow-y-auto">
            {/* ---------------------------------------------------------------- */}
            {/* Header                                                           */}
            {/* ---------------------------------------------------------------- */}
            <SheetHeader className="p-5 pb-4">
              <div className="flex items-start gap-3.5">
                {/* Company Avatar */}
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getAvatarGradient(deal.company)} flex items-center justify-center flex-shrink-0 shadow-sm`}
                >
                  <span className="text-[15px] font-bold text-white leading-none">
                    {companyInitial}
                  </span>
                </div>

                {/* Company + Deal Name */}
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-[17px] font-bold text-gray-900 dark:text-white leading-tight">
                    {deal.company || 'Unknown Company'}
                  </SheetTitle>
                  <p className="text-[13px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                    {deal.name}
                  </p>
                </div>

                {/* Close button */}
                <button
                  onClick={() => onOpenChange(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </SheetHeader>

            <div className="px-5 pb-5 space-y-5">
              {/* ---------------------------------------------------------------- */}
              {/* Stat Grid (2x2)                                                  */}
              {/* ---------------------------------------------------------------- */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* Deal Value */}
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.06]">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                    <span className="text-[10.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      Value
                    </span>
                  </div>
                  <p className="text-[17px] font-bold text-gray-900 dark:text-white leading-tight">
                    {formatCurrency(deal.value)}
                  </p>
                </div>

                {/* Stage */}
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.06]">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Layers className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                    <span className="text-[10.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      Stage
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {deal.stage_color && (
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: deal.stage_color }}
                      />
                    )}
                    <span className="text-[13px] font-semibold text-gray-900 dark:text-white truncate">
                      {deal.stage_name || 'Unknown'}
                    </span>
                  </div>
                </div>

                {/* Close Date */}
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.06]">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Calendar className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                    <span className="text-[10.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      Close Date
                    </span>
                  </div>
                  <p className="text-[13px] font-semibold text-gray-900 dark:text-white">
                    {deal.close_date
                      ? format(new Date(deal.close_date), 'MMM d, yyyy')
                      : 'Not set'}
                  </p>
                </div>

                {/* Days in Stage */}
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.06]">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Timer className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                    <span className="text-[10.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      Days in Stage
                    </span>
                  </div>
                  <p className="text-[17px] font-bold text-gray-900 dark:text-white leading-tight">
                    {deal.days_in_current_stage !== null ? deal.days_in_current_stage : '--'}
                  </p>
                </div>
              </div>

              {/* ---------------------------------------------------------------- */}
              {/* Win Probability                                                   */}
              {/* ---------------------------------------------------------------- */}
              {winProbability !== null && (
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.06]">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[10.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-gray-200 dark:after:bg-white/[0.06]">
                      Win Probability
                    </span>
                    <span className={`text-[15px] font-bold ${getProbabilityColor(winProbability)} ml-3`}>
                      {winProbability}%
                    </span>
                  </div>
                  <div className="h-[7px] rounded-full bg-gray-100 dark:bg-white/[0.03] overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${getProbabilityGradient(winProbability)} transition-all duration-500 ease-out`}
                      style={{ width: `${Math.min(winProbability, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* ---------------------------------------------------------------- */}
              {/* Copilot CTA                                                       */}
              {/* ---------------------------------------------------------------- */}
              <button
                onClick={handleAskCopilot}
                className="w-full bg-gradient-to-r from-violet-500/[0.06] to-blue-500/[0.06] border border-violet-500/[0.12] rounded-xl p-3.5 flex items-center gap-3 group hover:from-violet-500/[0.10] hover:to-blue-500/[0.10] hover:border-violet-500/[0.20] transition-all duration-200 text-left"
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Brain className="w-4.5 h-4.5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 dark:text-white leading-tight">
                    Ask Copilot about this deal
                  </p>
                  <p className="text-[11.5px] text-gray-500 dark:text-gray-400 mt-0.5">
                    Get AI-powered insights, next steps & risk analysis
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-violet-500 dark:group-hover:text-violet-400 transition-colors flex-shrink-0" />
              </button>

              {/* ---------------------------------------------------------------- */}
              {/* Health Overview                                                   */}
              {/* ---------------------------------------------------------------- */}
              <div>
                <h3 className="text-[10.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2 mb-3 after:content-[''] after:flex-1 after:h-px after:bg-gray-200 dark:after:bg-white/[0.06]">
                  Health Overview
                </h3>
                <div className="space-y-2">
                  {/* Deal Health */}
                  {(() => {
                    const colors = getHealthColor(deal.health_status);
                    return (
                      <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.06]">
                        <div className={`w-8 h-8 rounded-full ${colors.iconBg} flex items-center justify-center flex-shrink-0`}>
                          <Heart className={`w-4 h-4 ${colors.text}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-gray-500 dark:text-gray-400 leading-tight">
                            Deal Health
                          </p>
                          <p className="text-[13px] font-semibold text-gray-900 dark:text-white leading-tight mt-0.5">
                            {capitalize(deal.health_status)}
                          </p>
                        </div>
                        <span className={`text-[20px] font-bold ${colors.text} tabular-nums`}>
                          {deal.health_score !== null ? deal.health_score : '--'}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Relationship Health */}
                  {(() => {
                    const colors = getHealthColor(deal.relationship_health_status);
                    return (
                      <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.06]">
                        <div className={`w-8 h-8 rounded-full ${colors.iconBg} flex items-center justify-center flex-shrink-0`}>
                          <Shield className={`w-4 h-4 ${colors.text}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-gray-500 dark:text-gray-400 leading-tight">
                            Relationship Health
                          </p>
                          <p className="text-[13px] font-semibold text-gray-900 dark:text-white leading-tight mt-0.5">
                            {capitalize(deal.relationship_health_status)}
                          </p>
                        </div>
                        <span className={`text-[20px] font-bold ${colors.text} tabular-nums`}>
                          {deal.relationship_health_score !== null ? deal.relationship_health_score : '--'}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Ghost Risk */}
                  {deal.ghost_probability !== null && deal.ghost_probability > 0 && (() => {
                    const ghostStatus = deal.ghost_probability > 50 ? 'critical' : 'warning';
                    const colors = getHealthColor(ghostStatus);
                    return (
                      <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.06]">
                        <div className={`w-8 h-8 rounded-full ${colors.iconBg} flex items-center justify-center flex-shrink-0`}>
                          <Ghost className={`w-4 h-4 ${colors.text}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-gray-500 dark:text-gray-400 leading-tight">
                            Ghost Risk
                          </p>
                          <p className="text-[13px] font-semibold text-gray-900 dark:text-white leading-tight mt-0.5">
                            {deal.ghost_probability > 70 ? 'High' : deal.ghost_probability > 40 ? 'Medium' : 'Low'}
                          </p>
                        </div>
                        <span className={`text-[20px] font-bold ${colors.text} tabular-nums`}>
                          {deal.ghost_probability}%
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* ---------------------------------------------------------------- */}
              {/* Risk Signals                                                      */}
              {/* ---------------------------------------------------------------- */}
              {((deal.risk_factors && deal.risk_factors.length > 0) ||
                (deal.relationship_risk_factors && deal.relationship_risk_factors.length > 0)) && (
                <div>
                  <h3 className="text-[10.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2 mb-3 after:content-[''] after:flex-1 after:h-px after:bg-gray-200 dark:after:bg-white/[0.06]">
                    Risk Signals
                  </h3>
                  <DealRiskFactors
                    riskFactors={deal.risk_factors || []}
                    relationshipRiskFactors={deal.relationship_risk_factors || []}
                    riskLevel={deal.risk_level}
                  />
                </div>
              )}

              {/* ---------------------------------------------------------------- */}
              {/* Next Actions                                                      */}
              {/* ---------------------------------------------------------------- */}
              {deal.pending_actions_count > 0 && (
                <div>
                  <h3 className="text-[10.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2 mb-3 after:content-[''] after:flex-1 after:h-px after:bg-gray-200 dark:after:bg-white/[0.06]">
                    Next Actions ({deal.pending_actions_count})
                  </h3>
                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.06]">
                    <p className="text-[13px] text-gray-600 dark:text-gray-400">
                      {deal.pending_actions_count} pending action{deal.pending_actions_count !== 1 ? 's' : ''}
                      {deal.high_urgency_actions_count > 0 && (
                        <span className="text-red-600 dark:text-red-400 font-medium">
                          {' '}({deal.high_urgency_actions_count} high urgency)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* ---------------------------------------------------------------- */}
              {/* CRM Sync Status                                                   */}
              {/* ---------------------------------------------------------------- */}
              {(crmSyncStatus.hasHubSpot || crmSyncStatus.hasAttio) && (
                <div>
                  <h3 className="text-[10.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-2 mb-3 after:content-[''] after:flex-1 after:h-px after:bg-gray-200 dark:after:bg-white/[0.06]">
                    CRM Sync
                  </h3>
                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.06] space-y-2.5">
                    {/* Connected CRMs */}
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-gray-500 dark:text-gray-400">Connected CRMs</span>
                      <div className="flex items-center gap-1.5">
                        {crmSyncStatus.hasHubSpot && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-white/[0.06]">
                            HubSpot
                          </Badge>
                        )}
                        {crmSyncStatus.hasAttio && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-white/[0.06]">
                            Attio
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Sync Status */}
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-gray-500 dark:text-gray-400">Status</span>
                      <div className="flex items-center gap-1.5">
                        {crmSyncStatus.syncStatus === 'synced' && (
                          <>
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">Synced</span>
                          </>
                        )}
                        {crmSyncStatus.syncStatus === 'pending' && (
                          <>
                            <Clock className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-amber-600 dark:text-amber-400 text-[11px] font-medium">Pending</span>
                          </>
                        )}
                        {crmSyncStatus.syncStatus === 'error' && (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-red-500" />
                            <span className="text-red-600 dark:text-red-400 text-[11px] font-medium">Error</span>
                          </>
                        )}
                        {crmSyncStatus.syncStatus === 'none' && (
                          <span className="text-gray-500 dark:text-gray-500 text-[11px]">Not synced</span>
                        )}
                      </div>
                    </div>

                    {/* Last Synced */}
                    {crmSyncStatus.lastSyncedAt && (
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-gray-500 dark:text-gray-400">Last synced</span>
                        <span className="text-gray-900 dark:text-white text-[11px] font-medium">
                          {formatDistanceToNow(new Date(crmSyncStatus.lastSyncedAt), { addSuffix: true })}
                        </span>
                      </div>
                    )}

                    {/* Retry Button */}
                    {(crmSyncStatus.syncStatus === 'error' || crmSyncStatus.syncStatus === 'none') && (
                      <Button
                        className="w-full justify-center mt-1"
                        variant="outline"
                        size="sm"
                        onClick={handleRetrySync}
                        disabled={isSyncing}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isSyncing ? 'animate-spin' : ''}`} />
                        {isSyncing ? 'Syncing...' : 'Retry Sync'}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Bottom spacer for sticky footer */}
              <div className="h-20" />
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Quick Actions - Sticky Footer                                     */}
          {/* ---------------------------------------------------------------- */}
          <div className="flex-shrink-0 border-t border-gray-200/80 dark:border-white/[0.06] bg-white/80 dark:bg-white/[0.03] backdrop-blur-xl p-4">
            <div className="flex items-center gap-2.5">
              <Button
                onClick={handleAskCopilot}
                className="flex-1 bg-gradient-to-r from-blue-500/20 to-violet-500/20 border border-blue-500/25 hover:from-blue-500/30 hover:to-violet-500/30 hover:border-blue-500/35 text-gray-900 dark:text-white font-semibold text-[13px] h-10 rounded-xl transition-all duration-200"
                variant="ghost"
              >
                <Brain className="w-4 h-4 mr-1.5" />
                Ask Copilot
              </Button>
              <Button
                variant="ghost"
                className="flex-1 border border-gray-200/80 dark:border-white/[0.06] hover:bg-gray-50 dark:hover:bg-white/[0.04] text-gray-700 dark:text-gray-300 font-semibold text-[13px] h-10 rounded-xl transition-all duration-200"
              >
                <Edit className="w-4 h-4 mr-1.5" />
                Edit Deal
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
