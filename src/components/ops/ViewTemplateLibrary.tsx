import React, { useMemo } from 'react';
import {
  Mail,
  Crown,
  ShieldAlert,
  TrendingUp,
  Clock,
  Phone,
  RefreshCw,
  BarChart3,
  Sparkles,
  X,
} from 'lucide-react';
import { getApplicableTemplates, type ViewTemplate, type ViewTemplateResult } from '@/lib/utils/viewTemplates';
import type { OpsTableColumn } from '@/lib/services/opsTableService';

// ---------------------------------------------------------------------------
// Icon mapping
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Mail,
  Crown,
  ShieldAlert,
  TrendingUp,
  Clock,
  Phone,
  RefreshCw,
  BarChart3,
};

const CATEGORY_LABELS: Record<string, string> = {
  segmentation: 'Segmentation',
  outreach: 'Outreach',
  data_quality: 'Data Quality',
  analytics: 'Analytics',
  sync: 'Sync',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ViewTemplateLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  columns: OpsTableColumn[];
  onApply: (result: ViewTemplateResult) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ViewTemplateLibrary({
  isOpen,
  onClose,
  columns,
  onApply,
}: ViewTemplateLibraryProps) {
  const applicable = useMemo(() => getApplicableTemplates(columns), [columns]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, { template: ViewTemplate; result: ViewTemplateResult }[]>();
    for (const item of applicable) {
      const cat = item.template.category;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return map;
  }, [applicable]);

  if (!isOpen) return null;

  return (
    <div className="absolute top-0 left-0 right-0 bottom-0 z-10 overflow-y-auto bg-gray-900 rounded-lg">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 sticky top-0 bg-gray-900 z-10">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold text-white">View Templates</span>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
          <X className="w-4 h-4" />
        </button>
      </div>

      {applicable.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-gray-400">No templates match your table's columns.</p>
          <p className="text-xs text-gray-600 mt-1">
            Templates auto-detect column types like email, phone, status, score, etc.
          </p>
        </div>
      ) : (
        <div className="p-4 space-y-5">
          {[...grouped.entries()].map(([cat, items]) => (
            <div key={cat}>
              <h3 className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-2">
                {CATEGORY_LABELS[cat] ?? cat}
              </h3>
              <div className="space-y-2">
                {items.map(({ template, result }) => {
                  const IconComp = ICON_MAP[template.icon];
                  return (
                    <button
                      key={template.id}
                      onClick={() => {
                        onApply(result);
                        onClose();
                      }}
                      className="flex w-full items-start gap-3 rounded-lg border border-gray-800 bg-gray-800/50 p-3 text-left transition-colors hover:border-violet-500/30 hover:bg-violet-500/5"
                    >
                      <div className="rounded-lg bg-gray-700/50 p-2 shrink-0">
                        {IconComp ? (
                          <IconComp className="w-4 h-4 text-violet-400" />
                        ) : (
                          <Sparkles className="w-4 h-4 text-violet-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">{template.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{template.description}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {result.filters.length > 0 && (
                            <span className="rounded bg-gray-700/50 px-1.5 py-0.5 text-[10px] text-gray-400">
                              {result.filters.length} filter{result.filters.length !== 1 ? 's' : ''}
                            </span>
                          )}
                          {result.sorts.length > 0 && (
                            <span className="rounded bg-gray-700/50 px-1.5 py-0.5 text-[10px] text-gray-400">
                              sorted
                            </span>
                          )}
                          {result.formattingRules.length > 0 && (
                            <span className="rounded bg-gray-700/50 px-1.5 py-0.5 text-[10px] text-gray-400">
                              formatted
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
