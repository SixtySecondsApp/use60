/**
 * UsageTotalsBar — Bottom bar showing token usage totals across time windows
 *
 * Displays: All Time | Last 30 Days | Last 7 Days | Last 24 Hours
 * Each shows total tokens + estimated cost from pricing matrix.
 */

import { Clock, Coins, Hash } from 'lucide-react';
import { formatTokens, formatCost } from '@/lib/types/aiModels';
import type { UsageTotals } from '@/lib/hooks/useGodsEyeData';

interface UsageTotalsBarProps {
  usageTotals: UsageTotals;
}

interface TotalCardProps {
  label: string;
  tokens: number;
  cost: number;
  accent: string;
}

function TotalCard({ label, tokens, cost, accent }: TotalCardProps) {
  return (
    <div className="flex-1 px-4 py-2 flex items-center justify-between min-w-[180px]">
      <div>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className={`text-lg font-semibold font-mono ${accent}`}>
            {formatTokens(tokens)}
          </span>
          <span className="text-[10px] text-slate-500">tokens</span>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-slate-200 font-mono">
          {formatCost(cost)}
        </p>
        <p className="text-[10px] text-slate-500">est. cost</p>
      </div>
    </div>
  );
}

export function UsageTotalsBar({ usageTotals }: UsageTotalsBarProps) {
  return (
    <div className="shrink-0 bg-[#0f172a] border-t border-slate-800/50">
      <div className="flex items-center divide-x divide-slate-800/50">
        <TotalCard
          label="All Time"
          tokens={usageTotals.all_time.tokens}
          cost={usageTotals.all_time.cost}
          accent="text-slate-200"
        />
        <TotalCard
          label="Last 30 Days"
          tokens={usageTotals.last_30d.tokens}
          cost={usageTotals.last_30d.cost}
          accent="text-indigo-300"
        />
        <TotalCard
          label="Last 7 Days"
          tokens={usageTotals.last_7d.tokens}
          cost={usageTotals.last_7d.cost}
          accent="text-emerald-300"
        />
        <TotalCard
          label="Last 24 Hours"
          tokens={usageTotals.last_24h.tokens}
          cost={usageTotals.last_24h.cost}
          accent="text-amber-300"
        />
      </div>
    </div>
  );
}
