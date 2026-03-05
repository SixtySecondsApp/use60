/**
 * PipelineManagerView (PIPE-ADV-003)
 *
 * Manager view showing each rep's pipeline as summary cards with drill-down.
 * Groups deals by owner_id and shows aggregate metrics per rep.
 */

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, TrendingUp, AlertTriangle } from 'lucide-react';
import type { PipelineDeal, StageMetric } from './hooks/usePipelineData';
import { useOrgMoney } from '@/lib/hooks/useOrgMoney';

interface PipelineManagerViewProps {
  deals: PipelineDeal[];
  stageMetrics: StageMetric[];
  onDealClick: (dealId: string) => void;
}

interface RepSummary {
  ownerId: string;
  ownerName: string;
  deals: PipelineDeal[];
  totalValue: number;
  weightedValue: number;
  dealCount: number;
  healthyCount: number;
  warningCount: number;
  criticalCount: number;
  stalledCount: number;
  avgHealthScore: number;
  stageBreakdown: Record<string, { count: number; value: number; stageName: string; color: string | null }>;
}

function getAvatarGradient(name: string | null): string {
  const gradients = [
    'from-violet-600 to-violet-400',
    'from-blue-600 to-blue-400',
    'from-emerald-600 to-emerald-400',
    'from-amber-600 to-amber-400',
    'from-pink-600 to-pink-400',
    'from-cyan-600 to-cyan-400',
  ];
  if (!name) return gradients[0];
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
}

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

interface RepCardProps {
  rep: RepSummary;
  onDealClick: (dealId: string) => void;
}

function RepCard({ rep, onDealClick }: RepCardProps) {
  const { formatMoney: fmtMoney } = useOrgMoney();
  const fmt = (v: number) => fmtMoney(v, { compact: true });
  const [expanded, setExpanded] = useState(false);

  const healthPercent = rep.dealCount > 0
    ? Math.round((rep.healthyCount / rep.dealCount) * 100)
    : 0;

  const healthColor = healthPercent >= 70
    ? 'text-emerald-600 dark:text-emerald-400'
    : healthPercent >= 40
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-600 dark:text-red-400';

  return (
    <div className="rounded-2xl overflow-hidden bg-white/80 dark:bg-white/[0.03] backdrop-blur-xl border border-gray-200/80 dark:border-white/[0.06]">
      {/* Rep header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 p-4 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors text-left"
      >
        {/* Avatar */}
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${getAvatarGradient(rep.ownerName)} flex items-center justify-center flex-shrink-0`}>
          <span className="text-[11px] font-bold text-white">{getInitials(rep.ownerName)}</span>
        </div>

        {/* Name + count */}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm text-gray-900 dark:text-white truncate">
            {rep.ownerName}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            {rep.dealCount} deal{rep.dealCount !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Metrics */}
        <div className="hidden sm:flex items-center gap-6 mr-2">
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Pipeline</div>
            <div className="text-sm font-bold text-gray-900 dark:text-white">{fmt(rep.totalValue)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Weighted</div>
            <div className="text-sm font-bold text-gray-900 dark:text-white">{fmt(rep.weightedValue)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Health</div>
            <div className={`text-sm font-bold ${healthColor}`}>{healthPercent}%</div>
          </div>
        </div>

        {/* Health dots */}
        <div className="hidden md:flex items-center gap-2 mr-2">
          {rep.criticalCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400 font-medium">
              <AlertTriangle className="w-3 h-3" />
              {rep.criticalCount}
            </span>
          )}
          {rep.warningCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {rep.warningCount}
            </span>
          )}
        </div>

        {/* Expand chevron */}
        {expanded
          ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
          : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
        }
      </button>

      {/* Stage breakdown bar */}
      <div className="px-4 pb-3 -mt-1">
        <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5">
          {Object.values(rep.stageBreakdown)
            .filter((s) => s.count > 0)
            .map((stage) => (
              <div
                key={stage.stageName}
                className="h-full rounded-full transition-all"
                style={{
                  flex: stage.count,
                  backgroundColor: stage.color || '#3B82F6',
                  opacity: 0.7,
                }}
                title={`${stage.stageName}: ${stage.count} deals`}
              />
            ))}
        </div>
      </div>

      {/* Drill-down: deal list */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-white/[0.06]">
          {rep.deals.map((deal, i) => {
            const isLast = i === rep.deals.length - 1;
            return (
              <button
                key={deal.id}
                onClick={() => onDealClick(deal.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors text-left ${
                  !isLast ? 'border-b border-gray-50 dark:border-white/[0.04]' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{deal.company || deal.name}</div>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{deal.stage_name || 'No stage'}</div>
                </div>
                <div className="flex items-center gap-3 text-right flex-shrink-0">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {fmtMoney(deal.value ?? 0, { compact: true })}
                  </span>
                  {deal.health_status && (
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        deal.health_status === 'healthy' ? 'bg-emerald-500'
                        : deal.health_status === 'warning' ? 'bg-amber-500'
                        : deal.health_status === 'critical' ? 'bg-red-500'
                        : 'bg-gray-400'
                      }`}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PipelineManagerView({ deals, stageMetrics, onDealClick }: PipelineManagerViewProps) {
  const { formatMoney: fmtMoney } = useOrgMoney();

  // Build stage lookup for color
  const stageLookup = useMemo(() => {
    const lookup: Record<string, StageMetric> = {};
    stageMetrics.forEach((s) => { lookup[s.stage_id] = s; });
    return lookup;
  }, [stageMetrics]);

  // Group deals by owner
  const repSummaries = useMemo(() => {
    const grouped: Record<string, PipelineDeal[]> = {};
    const noOwnerKey = '__no_owner__';

    deals.forEach((deal) => {
      const ownerId = deal.owner_id || noOwnerKey;
      if (!grouped[ownerId]) grouped[ownerId] = [];
      grouped[ownerId].push(deal);
    });

    return Object.entries(grouped).map(([ownerId, repDeals]): RepSummary => {
      const ownerName = repDeals[0]?.split_users?.[0]?.full_name
        || (ownerId === noOwnerKey ? 'Unassigned' : `Rep ${ownerId.slice(0, 6)}`);

      const totalValue = repDeals.reduce((sum, d) => sum + (d.value || 0), 0);
      const weightedValue = repDeals.reduce((sum, d) => sum + (d.value || 0) * ((d.probability || 0) / 100), 0);

      const healthyCount = repDeals.filter((d) => d.health_status === 'healthy').length;
      const warningCount = repDeals.filter((d) => d.health_status === 'warning').length;
      const criticalCount = repDeals.filter((d) => d.health_status === 'critical').length;
      const stalledCount = repDeals.filter((d) => d.health_status === 'stalled').length;

      const scores = repDeals.map((d) => d.health_score || 0).filter((s) => s > 0);
      const avgHealthScore = scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;

      const stageBreakdown: RepSummary['stageBreakdown'] = {};
      repDeals.forEach((d) => {
        if (!d.stage_id) return;
        if (!stageBreakdown[d.stage_id]) {
          const stage = stageLookup[d.stage_id];
          stageBreakdown[d.stage_id] = {
            count: 0,
            value: 0,
            stageName: stage?.stage_name || 'Unknown',
            color: stage?.stage_color || null,
          };
        }
        stageBreakdown[d.stage_id].count += 1;
        stageBreakdown[d.stage_id].value += d.value || 0;
      });

      return {
        ownerId,
        ownerName,
        deals: repDeals.sort((a, b) => (b.value || 0) - (a.value || 0)),
        totalValue,
        weightedValue,
        dealCount: repDeals.length,
        healthyCount,
        warningCount,
        criticalCount,
        stalledCount,
        avgHealthScore,
        stageBreakdown,
      };
    }).sort((a, b) => b.totalValue - a.totalValue);
  }, [deals, stageLookup]);

  if (repSummaries.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        No deals found
      </div>
    );
  }

  // Team totals
  const teamTotal = repSummaries.reduce((sum, r) => sum + r.totalValue, 0);
  const teamWeighted = repSummaries.reduce((sum, r) => sum + r.weightedValue, 0);

  return (
    <div className="space-y-3">
      {/* Team summary banner */}
      <div className="flex items-center gap-4 px-4 py-3 rounded-2xl bg-blue-50/60 dark:bg-blue-500/[0.06] border border-blue-100 dark:border-blue-500/15">
        <TrendingUp className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" />
        <div className="flex items-center gap-6 text-sm">
          <span className="text-gray-600 dark:text-gray-300">
            Team pipeline: <strong className="text-gray-900 dark:text-white">{fmtMoney(teamTotal, { compact: true })}</strong>
          </span>
          <span className="text-gray-600 dark:text-gray-300">
            Weighted: <strong className="text-gray-900 dark:text-white">{fmtMoney(teamWeighted, { compact: true })}</strong>
          </span>
          <span className="text-gray-500 dark:text-gray-400">
            {repSummaries.length} rep{repSummaries.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Rep cards */}
      {repSummaries.map((rep) => (
        <RepCard key={rep.ownerId} rep={rep} onDealClick={onDealClick} />
      ))}
    </div>
  );
}
