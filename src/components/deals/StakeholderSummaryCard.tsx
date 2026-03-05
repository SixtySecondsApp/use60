/**
 * StakeholderSummaryCard (STAKE-008)
 *
 * Compact card shown in the deal sheet sidebar.
 * Traffic-light coverage: green=full, amber=partial, red=missing.
 * Shows champion, economic buyer status, committee size, MEDDIC hints.
 */

import React from 'react';
import { Users, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStakeholders } from '@/lib/hooks/useStakeholders';
import { getMeddicCoverage } from '@/lib/types/stakeholder';

interface StakeholderSummaryCardProps {
  dealId: string;
  /** Called when user clicks to open the full stakeholder panel */
  onOpen?: () => void;
  className?: string;
}

export function StakeholderSummaryCard({
  dealId,
  onOpen,
  className,
}: StakeholderSummaryCardProps) {
  const {
    stakeholders,
    loading,
    committeeSize,
    hasEconomicBuyer,
    hasChampion,
    activeCount,
    coldCount,
  } = useStakeholders(dealId);

  const coverage = getMeddicCoverage(stakeholders);

  const coverageConfig = {
    full: {
      dot: 'bg-emerald-500',
      label: 'Buying committee covered',
      labelColor: 'text-emerald-600 dark:text-emerald-400',
    },
    partial: {
      dot: 'bg-amber-500',
      label: 'Committee partially mapped',
      labelColor: 'text-amber-600 dark:text-amber-400',
    },
    missing: {
      dot: 'bg-red-500',
      label: 'Key roles missing',
      labelColor: 'text-red-600 dark:text-red-400',
    },
  };

  const config = coverageConfig[coverage.coverageLevel];

  if (loading) {
    return (
      <div className={cn('animate-pulse h-16 rounded-xl bg-muted/50', className)} />
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'w-full text-left p-3 rounded-xl border transition-colors',
        'bg-gray-50 dark:bg-white/[0.02] border-gray-200/80 dark:border-white/[0.06]',
        onOpen && 'hover:bg-gray-100 dark:hover:bg-white/[0.04] cursor-pointer',
        !onOpen && 'cursor-default',
        className,
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
          <span className="text-[10.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Buying Committee
          </span>
        </div>
        {onOpen && (
          <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
        )}
      </div>

      {committeeSize === 0 ? (
        <p className="text-[12px] text-gray-500 dark:text-gray-400">
          No stakeholders mapped yet
        </p>
      ) : (
        <>
          {/* Coverage traffic light */}
          <div className="flex items-center gap-2 mb-2">
            <span className={cn('w-2 h-2 rounded-full flex-shrink-0', config.dot)} />
            <span className={cn('text-[12px] font-medium', config.labelColor)}>
              {config.label}
            </span>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            <StatChip
              label="Total"
              value={committeeSize}
              color="text-gray-900 dark:text-white"
            />
            <StatChip
              label="Active"
              value={activeCount}
              color="text-emerald-600 dark:text-emerald-400"
            />
            <StatChip
              label="Cold"
              value={coldCount}
              color={coldCount > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}
            />
          </div>

          {/* MEDDIC hints */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <MeddicPill
              label="Econ. Buyer"
              covered={hasEconomicBuyer}
            />
            <MeddicPill
              label="Champion"
              covered={hasChampion}
            />
          </div>
        </>
      )}
    </button>
  );
}

function StatChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="text-center">
      <p className={cn('text-[16px] font-bold leading-tight', color)}>{value}</p>
      <p className="text-[10px] text-gray-400 dark:text-gray-500">{label}</p>
    </div>
  );
}

function MeddicPill({ label, covered }: { label: string; covered: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium',
        covered
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'bg-red-500/10 text-red-600 dark:text-red-400',
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', covered ? 'bg-emerald-500' : 'bg-red-400')} />
      {label}
    </span>
  );
}
