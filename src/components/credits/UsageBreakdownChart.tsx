/**
 * UsageBreakdownChart — Horizontal bar chart showing credit usage by category.
 * Categories: Copilot, Meetings, Research, Content, AR, Storage, Integrations.
 */

import type { FeatureUsage } from '@/lib/services/creditService';
import { Bot, Mic, Users, FileText, Cpu, HardDrive, Plug } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UsageBreakdownChartProps {
  usageByFeature: FeatureUsage[];
  storageCostCredits?: number;
}

const CATEGORY_MAP: Record<string, { label: string; icon: typeof Bot; color: string }> = {
  copilot: { label: 'Copilot', icon: Bot, color: 'bg-indigo-500' },
  meetings: { label: 'Meetings', icon: Mic, color: 'bg-purple-500' },
  research: { label: 'Research', icon: Users, color: 'bg-blue-500' },
  content: { label: 'Content', icon: FileText, color: 'bg-teal-500' },
  crm_update: { label: 'CRM', icon: Cpu, color: 'bg-cyan-500' },
  task_execution: { label: 'Tasks', icon: Cpu, color: 'bg-sky-500' },
};

const INTEGRATION_KEYS = ['apollo_search', 'ai_ark_company', 'ai_ark_people', 'exa_enrichment', 'email_send'];
const STORAGE_KEYS = ['storage_audio', 'storage_transcripts', 'storage_docs', 'storage_enrichment', 'storage_metering'];

interface CategoryTotal {
  key: string;
  label: string;
  icon: typeof Bot;
  color: string;
  totalCost: number;
  callCount: number;
}

function aggregateCategories(
  usageByFeature: FeatureUsage[],
  storageCostCredits = 0
): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();

  for (const feature of usageByFeature) {
    let catKey = 'other';
    let catLabel = 'Other';
    let catIcon = Cpu;
    let catColor = 'bg-gray-400';

    const fk = feature.featureKey.toLowerCase();

    if (STORAGE_KEYS.some((k) => fk.includes(k))) {
      catKey = 'storage';
      catLabel = 'Storage';
      catIcon = HardDrive;
      catColor = 'bg-slate-500';
    } else if (INTEGRATION_KEYS.some((k) => fk.includes(k))) {
      catKey = 'integrations';
      catLabel = 'Integrations';
      catIcon = Plug;
      catColor = 'bg-orange-500';
    } else if (fk.includes('ar_budget') || fk.includes('proactive')) {
      catKey = 'ar';
      catLabel = 'AR Budget';
      catIcon = Cpu;
      catColor = 'bg-rose-500';
    } else {
      // Match to category map by checking which category key is contained in feature key
      for (const [key, meta] of Object.entries(CATEGORY_MAP)) {
        if (fk.includes(key) || fk.replace('_', '').includes(key.replace('_', ''))) {
          catKey = key;
          catLabel = meta.label;
          catIcon = meta.icon;
          catColor = meta.color;
          break;
        }
      }
    }

    const existing = map.get(catKey);
    if (existing) {
      existing.totalCost += feature.totalCost;
      existing.callCount += feature.callCount;
    } else {
      map.set(catKey, {
        key: catKey,
        label: catLabel,
        icon: catIcon,
        color: catColor,
        totalCost: feature.totalCost,
        callCount: feature.callCount,
      });
    }
  }

  // Add storage from monthly cost if provided
  if (storageCostCredits > 0) {
    const storageEntry = map.get('storage');
    if (storageEntry) {
      storageEntry.totalCost += storageCostCredits;
    } else {
      map.set('storage', {
        key: 'storage',
        label: 'Storage',
        icon: HardDrive,
        color: 'bg-slate-500',
        totalCost: storageCostCredits,
        callCount: 0,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
}

export function UsageBreakdownChart({ usageByFeature, storageCostCredits }: UsageBreakdownChartProps) {
  const categories = aggregateCategories(usageByFeature, storageCostCredits);

  if (categories.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
        No usage recorded in the last 30 days
      </p>
    );
  }

  const maxCost = Math.max(...categories.map((c) => c.totalCost));

  return (
    <div className="space-y-3">
      {categories.map((cat) => {
        const Icon = cat.icon;
        const pct = maxCost > 0 ? (cat.totalCost / maxCost) * 100 : 0;
        const formattedCost = cat.totalCost % 1 === 0
          ? cat.totalCost.toFixed(0)
          : cat.totalCost.toFixed(1);

        return (
          <div key={cat.key} className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 w-28 flex-shrink-0">
              <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                {cat.label}
              </span>
            </div>
            <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-500', cat.color)}
                style={{ width: `${Math.max(pct, 1)}%` }}
              />
            </div>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 tabular-nums w-16 text-right flex-shrink-0">
              {formattedCost} cr
            </span>
            {cat.callCount > 0 && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums w-14 text-right flex-shrink-0">
                {cat.callCount.toLocaleString()} calls
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
