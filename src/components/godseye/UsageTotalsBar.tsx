/**
 * UsageTotalsBar — Bottom bar showing token usage totals across time windows
 *
 * Displays: All Time | Last 30 Days | Last 7 Days | Last 24 Hours
 * Each shows total tokens (full number, comma-formatted) + estimated cost.
 * Token counts update live every 3 seconds.
 */

import { useState, useEffect, useRef } from 'react';
import { formatCost } from '@/lib/types/aiModels';
import type { UsageTotals } from '@/lib/hooks/useGodsEyeData';

interface UsageTotalsBarProps {
  usageTotals: UsageTotals;
}

/** Format a number with commas: 4930000 → "4,930,000" */
function formatFullNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

interface TotalCardProps {
  label: string;
  tokens: number;
  cost: number;
  accent: string;
}

function TotalCard({ label, tokens, cost, accent }: TotalCardProps) {
  // Animate toward target value for smooth live updates
  const [displayTokens, setDisplayTokens] = useState(tokens);
  const targetRef = useRef(tokens);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    targetRef.current = tokens;
  }, [tokens]);

  // Smoothly interpolate toward the target every frame
  useEffect(() => {
    let running = true;
    const step = () => {
      if (!running) return;
      setDisplayTokens(prev => {
        const diff = targetRef.current - prev;
        if (Math.abs(diff) < 1) return targetRef.current;
        // Move ~10% of the remaining distance each frame for smooth easing
        return prev + diff * 0.1;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <div className="flex-1 px-4 py-3 min-w-[220px]">
      <p className="text-[32px] text-slate-500 uppercase tracking-wider font-semibold leading-tight">{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <span className={`text-xl font-semibold font-mono ${accent}`}>
          {formatFullNumber(displayTokens)}
        </span>
        <span className="text-xs text-slate-500">tokens</span>
      </div>
      <p className="text-[16px] font-semibold text-slate-300 font-mono mt-0.5">
        {formatCost(cost, 'GBP')}
      </p>
    </div>
  );
}

export function UsageTotalsBar({ usageTotals }: UsageTotalsBarProps) {
  return (
    <div className="shrink-0 bg-[#0f172a] border-t border-slate-800/50 pb-[100px]">
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
