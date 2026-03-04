/**
 * CompetitiveMatrix — WL-005
 * Competitor win/loss table sorted by frequency.
 * Win rate color-coded: green >50%, red <50%.
 */

import React from 'react';
import { Shield, TrendingUp, TrendingDown } from 'lucide-react';
import type { CompetitorMatrixRow } from '@/lib/types/winLoss';

interface Props {
  rows: CompetitorMatrixRow[];
  isLoading?: boolean;
}

function WinRateBadge({ rate }: { rate: number | null }) {
  if (rate === null)
    return <span className="text-xs text-gray-600">—</span>;

  const isGood = rate >= 50;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${
        isGood ? 'text-emerald-400' : 'text-red-400'
      }`}
    >
      {isGood
        ? <TrendingUp className="h-3 w-3" />
        : <TrendingDown className="h-3 w-3" />}
      {rate.toFixed(1)}%
    </span>
  );
}

export function CompetitiveMatrix({ rows, isLoading }: Props) {
  if (!isLoading && rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-8 flex flex-col items-center gap-3 text-gray-500">
        <Shield className="h-8 w-8 opacity-30" />
        <p className="text-sm">No competitive data for this period</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50">
      <div className="px-4 py-3 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-white">Competitive Win/Loss Matrix</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Sorted by frequency · Green &gt;50% win rate · Red &lt;50%
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Competitor</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Faced</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Won</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Lost</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Win Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {rows.map((row) => (
              <tr key={row.competitor_name} className="hover:bg-gray-800/30 transition-colors">
                <td className="px-4 py-2.5 font-medium text-white">{row.competitor_name}</td>
                <td className="px-4 py-2.5 text-right text-gray-400">{row.deals_faced}</td>
                <td className="px-4 py-2.5 text-right text-emerald-400">{row.won}</td>
                <td className="px-4 py-2.5 text-right text-red-400">{row.lost}</td>
                <td className="px-4 py-2.5 text-right">
                  <WinRateBadge rate={row.win_rate} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
