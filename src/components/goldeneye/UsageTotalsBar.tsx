/**
 * UsageTotalsBar — Bottom bar showing token usage totals across time windows
 *
 * Displays: All Time | Last 30 Days | Last 7 Days | Last 24 Hours
 * Each shows in/out tokens (comma-formatted) + estimated cost in GBP.
 */

import { useState, useEffect, useRef } from 'react';
import type { UsageTotals, UsageBucket } from '@/lib/hooks/useGoldenEyeData';

interface UsageTotalsBarProps {
  usageTotals: UsageTotals;
}

/** Compact token count: 124961 → "125.0K", 508376071 → "508.4M" */
function formatCompactTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

// ─── FX Rate (shared cache with ActivityLogTerminal) ─────────────────

const FX_CACHE_KEY = 'goldeneye_usd_gbp_fx';
const FX_CACHE_TTL = 4 * 60 * 60 * 1000;
const FX_FALLBACK = 0.79;

interface FxCache { rate: number; fetchedAt: number }

function useFxRate(): number {
  const [rate, setRate] = useState<number>(() => {
    try {
      const cached = localStorage.getItem(FX_CACHE_KEY);
      if (cached) {
        const parsed: FxCache = JSON.parse(cached);
        if (Date.now() - parsed.fetchedAt < FX_CACHE_TTL) return parsed.rate;
      }
    } catch { /* ignore */ }
    return FX_FALLBACK;
  });

  useEffect(() => {
    let cancelled = false;
    async function fetchRate() {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        if (!res.ok) return;
        const data = await res.json();
        const gbp = data?.rates?.GBP;
        if (typeof gbp === 'number' && !cancelled) {
          setRate(gbp);
          localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ rate: gbp, fetchedAt: Date.now() }));
        }
      } catch { /* use cached or fallback */ }
    }
    try {
      const cached = localStorage.getItem(FX_CACHE_KEY);
      if (cached) {
        const parsed: FxCache = JSON.parse(cached);
        if (Date.now() - parsed.fetchedAt < FX_CACHE_TTL) return;
      }
    } catch { /* fetch anyway */ }
    fetchRate();
    return () => { cancelled = true; };
  }, []);

  return rate;
}

function formatGbp(usd: number, fxRate: number): string {
  const gbp = usd * fxRate;
  if (gbp < 0.01) return `£${gbp.toFixed(4)}`;
  return `£${gbp.toFixed(2)}`;
}

interface TotalCardProps {
  label: string;
  bucket: UsageBucket;
  accent: string;
  fxRate: number;
}

function useAnimatedNumber(target: number): number {
  const [display, setDisplay] = useState(target);
  const targetRef = useRef(target);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    let running = true;
    const step = () => {
      if (!running) return;
      setDisplay(prev => {
        const diff = targetRef.current - prev;
        if (Math.abs(diff) < 1) return targetRef.current;
        return prev + diff * 0.1;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, []);

  return display;
}

function TotalCard({ label, bucket, accent, fxRate }: TotalCardProps) {
  const displayIn = useAnimatedNumber(bucket.tokensIn);
  const displayOut = useAnimatedNumber(bucket.tokensOut);

  return (
    <div className="flex-1 px-4 py-3 min-w-[220px]">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-mono leading-tight">{label}</p>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className={`text-lg font-semibold font-mono ${accent}`}>
          {formatCompactTokens(displayIn)}
        </span>
        <span className="text-[9px] text-slate-600 font-mono">/</span>
        <span className={`text-lg font-semibold font-mono ${accent}`}>
          {formatCompactTokens(displayOut)}
        </span>
        <span className="text-[9px] text-slate-500 font-mono">in/out</span>
      </div>
      <p className="text-[10px] font-semibold text-slate-300 font-mono mt-0.5">
        {formatGbp(bucket.cost, fxRate)}
      </p>
    </div>
  );
}

export function UsageTotalsBar({ usageTotals }: UsageTotalsBarProps) {
  const fxRate = useFxRate();

  return (
    <div className="shrink-0 bg-[#0f172a] border-t border-slate-800/50 pb-[100px]">
      <div className="flex items-center divide-x divide-slate-800/50">
        <TotalCard
          label="All Time"
          bucket={usageTotals.all_time}
          accent="text-slate-200"
          fxRate={fxRate}
        />
        <TotalCard
          label="Last 30 Days"
          bucket={usageTotals.last_30d}
          accent="text-indigo-300"
          fxRate={fxRate}
        />
        <TotalCard
          label="Last 7 Days"
          bucket={usageTotals.last_7d}
          accent="text-emerald-300"
          fxRate={fxRate}
        />
        <TotalCard
          label="Last 24 Hours"
          bucket={usageTotals.last_24h}
          accent="text-amber-300"
          fxRate={fxRate}
        />
      </div>
    </div>
  );
}
