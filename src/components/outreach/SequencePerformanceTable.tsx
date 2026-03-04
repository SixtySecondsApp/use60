import React, { useState } from 'react';
import { Trophy, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { campaignStatusLabel, campaignStatusColor } from '@/components/campaigns/campaignUtils';
import type { SequencePerformanceRow } from '@/lib/types/outreachAnalytics';

type SortKey = 'campaignName' | 'leadsCount' | 'sent' | 'openRate' | 'clickRate' | 'replyRate' | 'bounceRate';

interface Props {
  sequences: SequencePerformanceRow[];
}

function RateCell({ value, warn = 0, good = 0 }: { value: number; warn?: number; good?: number }) {
  const color =
    good > 0 && value >= good
      ? 'text-emerald-600 dark:text-emerald-400'
      : warn > 0 && value <= warn
      ? 'text-red-600 dark:text-red-400'
      : 'text-gray-600 dark:text-gray-300';
  return <span className={`text-sm font-medium ${color}`}>{value.toFixed(1)}%</span>;
}

export function SequencePerformanceTable({ sequences }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('replyRate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = [...sequences].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp =
      typeof av === 'string' && typeof bv === 'string'
        ? av.localeCompare(bv)
        : (av as number) - (bv as number);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-indigo-400" />
    ) : (
      <ArrowDown className="h-3 w-3 text-indigo-400" />
    );
  }

  function Th({ label, k }: { label: string; k: SortKey }) {
    return (
      <th
        className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset"
        onClick={() => handleSort(k)}
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleSort(k)}
      >
        <div className="flex items-center gap-1">
          {label}
          <SortIcon k={k} />
        </div>
      </th>
    );
  }

  if (sequences.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-8 text-center">
        <p className="text-sm text-gray-400 dark:text-gray-500">No sequences to compare</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Sequence Performance</h3>
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">Click any column header to sort</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200/50 dark:border-gray-800/50">
              <Th label="Campaign" k="campaignName" />
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-500">Status</th>
              <Th label="Leads" k="leadsCount" />
              <Th label="Sent" k="sent" />
              <Th label="Open %" k="openRate" />
              <Th label="Click %" k="clickRate" />
              <Th label="Reply %" k="replyRate" />
              <Th label="Bounce %" k="bounceRate" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800/30">
            {sorted.map((row) => (
              <tr
                key={row.campaignId}
                className={`hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors ${
                  row.isBestPerformer ? 'bg-emerald-50/50 dark:bg-emerald-500/5' : ''
                }`}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {row.isBestPerformer && (
                      <Trophy className="h-3.5 w-3.5 shrink-0 text-yellow-500 dark:text-yellow-400" />
                    )}
                    <span className="text-sm text-gray-900 dark:text-white truncate max-w-[180px]">
                      {row.campaignName}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${campaignStatusColor(row.status)}`}
                  >
                    {campaignStatusLabel(row.status)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-sm text-gray-600 dark:text-gray-300">{row.leadsCount.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-sm text-gray-600 dark:text-gray-300">{row.sent.toLocaleString()}</td>
                <td className="px-3 py-2.5"><RateCell value={row.openRate} good={25} /></td>
                <td className="px-3 py-2.5"><RateCell value={row.clickRate} good={5} /></td>
                <td className="px-3 py-2.5"><RateCell value={row.replyRate} good={5} /></td>
                <td className="px-3 py-2.5"><RateCell value={row.bounceRate} warn={5} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
