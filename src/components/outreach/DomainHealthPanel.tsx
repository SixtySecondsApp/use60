import React from 'react';
import { Shield, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import type { DomainHealthRow } from '@/lib/types/outreachAnalytics';

interface Props {
  rows: DomainHealthRow[];
}

function HealthBadge({ health }: { health: DomainHealthRow['health'] }) {
  switch (health) {
    case 'good':
      return (
        <span className="inline-flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
          <ShieldCheck className="h-3 w-3" />
          Good
        </span>
      );
    case 'warning':
      return (
        <span className="inline-flex items-center gap-1 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
          <ShieldAlert className="h-3 w-3" />
          Warning
        </span>
      );
    case 'critical':
      return (
        <span className="inline-flex items-center gap-1 rounded border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
          <ShieldX className="h-3 w-3" />
          Critical
        </span>
      );
  }
}

function BounceBar({ rate }: { rate: number }) {
  const pct = Math.min(rate, 20); // cap at 20% for visual
  const color = rate < 2 ? 'bg-emerald-400' : rate < 5 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="w-24 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${(pct / 20) * 100}%` }} />
    </div>
  );
}

export function DomainHealthPanel({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-8 flex flex-col items-center gap-3 text-gray-400 dark:text-gray-500">
        <Shield className="h-8 w-8 opacity-30" />
        <p className="text-sm">No domain health data</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Campaign Health</h3>
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
          Sorted by bounce rate · Green &lt;2% · Amber 2–5% · Red &gt;5%
        </p>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800/30">
        {rows.map((row, idx) => (
          <div key={idx} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-900 dark:text-white truncate">{row.domain}</p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                {row.sent.toLocaleString()} sent · {row.bounced} bounced
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <BounceBar rate={row.bounceRate} />
              <span className="text-sm font-medium w-12 text-right text-gray-600 dark:text-gray-300">
                {row.bounceRate.toFixed(1)}%
              </span>
              <HealthBadge health={row.health} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
