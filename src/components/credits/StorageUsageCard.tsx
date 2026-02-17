/**
 * StorageUsageCard — Shows current storage footprint and projected monthly credit cost.
 */

import { HardDrive, Mic, FileText, Database, Users } from 'lucide-react';
import type { StorageUsage } from '@/lib/services/creditService';

interface StorageUsageCardProps {
  storage: StorageUsage;
}

function StorageRow({
  icon: Icon,
  label,
  value,
  unit,
  cost,
}: {
  icon: typeof HardDrive;
  label: string;
  value: number;
  unit: string;
  cost: number;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      </div>
      <div className="flex items-center gap-4 text-right">
        <span className="text-sm font-medium text-gray-900 dark:text-white tabular-nums">
          {value.toLocaleString()} {unit}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums w-20 text-right">
          ~{cost % 1 === 0 ? cost.toFixed(0) : cost.toFixed(2)} cr/mo
        </span>
      </div>
    </div>
  );
}

export function StorageUsageCard({ storage }: StorageUsageCardProps) {
  const {
    audioHours,
    transcriptCount,
    documentCount,
    enrichmentRecords,
    projectedMonthlyCostCredits,
    lastStorageDeductionDate,
  } = storage;

  // Individual monthly costs
  const audioCost = audioHours * 0.5;
  const transcriptCost = (transcriptCount / 100) * 0.1;
  const documentCost = (documentCount / 100) * 0.05;
  const enrichmentCost = (enrichmentRecords / 500) * 0.1;

  return (
    <div className="space-y-2">
      <StorageRow
        icon={Mic}
        label="Recording audio"
        value={Math.round(audioHours * 10) / 10}
        unit="hours"
        cost={audioCost}
      />
      <StorageRow
        icon={FileText}
        label="Transcripts"
        value={transcriptCount}
        unit="files"
        cost={transcriptCost}
      />
      <StorageRow
        icon={Database}
        label="Documents"
        value={documentCount}
        unit="files"
        cost={documentCost}
      />
      <StorageRow
        icon={Users}
        label="Enrichment records"
        value={enrichmentRecords}
        unit="records"
        cost={enrichmentCost}
      />

      {/* Total projected */}
      <div className="mt-3 flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            Projected monthly storage cost
          </span>
        </div>
        <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
          ~{projectedMonthlyCostCredits % 1 === 0
            ? projectedMonthlyCostCredits.toFixed(0)
            : projectedMonthlyCostCredits.toFixed(2)} cr/mo
        </span>
      </div>

      {lastStorageDeductionDate && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500">
          Last storage charge:{' '}
          {new Date(lastStorageDeductionDate).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      )}
    </div>
  );
}
