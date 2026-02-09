import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Zap } from 'lucide-react';
import { toast } from 'sonner';
import type { ApolloSearchParams } from '@/lib/services/apolloSearchService';
import { useApolloCollectMore } from '@/lib/hooks/useApolloCollectMore';
import {
  SENIORITY_LABELS,
  DEPARTMENT_LABELS,
} from './ApolloFilterEditor';

interface ApolloCollectMoreModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string;
  sourceQuery: ApolloSearchParams;
  currentRowCount: number;
  onComplete: () => void;
}

const COUNT_PRESETS = [10, 25, 50, 100];

function FilterSummary({ filters }: { filters: ApolloSearchParams }) {
  const chips: { label: string; values: string[] }[] = [];

  if (filters.person_titles?.length) {
    chips.push({ label: 'Titles', values: filters.person_titles });
  }
  if (filters.person_locations?.length) {
    chips.push({ label: 'Locations', values: filters.person_locations });
  }
  if (filters.person_seniorities?.length) {
    chips.push({
      label: 'Seniority',
      values: filters.person_seniorities.map((s) => SENIORITY_LABELS[s] || s),
    });
  }
  if (filters.person_departments?.length) {
    chips.push({
      label: 'Department',
      values: filters.person_departments.map((d) => DEPARTMENT_LABELS[d] || d),
    });
  }
  if (filters.q_keywords) {
    chips.push({ label: 'Keywords', values: [filters.q_keywords] });
  }
  if (filters.q_organization_domains?.length) {
    chips.push({ label: 'Domains', values: filters.q_organization_domains });
  }
  if (filters.organization_num_employees_ranges?.length) {
    chips.push({ label: 'Size', values: filters.organization_num_employees_ranges });
  }
  if (filters.organization_latest_funding_stage_cd?.length) {
    chips.push({ label: 'Funding', values: filters.organization_latest_funding_stage_cd });
  }

  if (chips.length === 0) {
    return <p className="text-xs text-zinc-500">No filters configured</p>;
  }

  return (
    <div className="space-y-2">
      {chips.map((group) => (
        <div key={group.label} className="flex items-start gap-2">
          <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider min-w-[70px] pt-0.5">
            {group.label}
          </span>
          <div className="flex flex-wrap gap-1">
            {group.values.map((v) => (
              <span
                key={v}
                className="inline-block rounded bg-purple-500/10 px-2 py-0.5 text-xs text-purple-300 border border-purple-500/20"
              >
                {v}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ApolloCollectMoreModal({
  open,
  onOpenChange,
  tableId,
  sourceQuery,
  currentRowCount,
  onComplete,
}: ApolloCollectMoreModalProps) {
  const [desiredCount, setDesiredCount] = useState(25);
  const [isCustom, setIsCustom] = useState(false);
  const [enrichEmail, setEnrichEmail] = useState(false);
  const [enrichPhone, setEnrichPhone] = useState(false);
  const collectMore = useApolloCollectMore();

  const handleCollect = () => {
    const hasAutoEnrich = enrichEmail || enrichPhone;

    collectMore.mutate(
      {
        tableId,
        searchParams: sourceQuery,
        desiredCount,
        ...(hasAutoEnrich
          ? {
              autoEnrich: {
                email: enrichEmail,
                phone: enrichPhone,
              },
            }
          : {}),
      },
      {
        onSuccess: (result) => {
          if (result.rows_added === 0) {
            toast.info(
              result.message ||
                `Searched ${result.total_searched} contacts but all were duplicates. Try adjusting filters.`
            );
          } else {
            const dedupMsg =
              result.duplicates_skipped > 0
                ? ` (${result.duplicates_skipped} duplicates skipped)`
                : '';
            toast.success(
              `Added ${result.rows_added} contacts${dedupMsg}. Table now has ${result.new_row_count} rows.`
            );
          }
          onComplete();
          onOpenChange(false);
          // Reset state
          setIsCustom(false);
          setEnrichEmail(false);
          setEnrichPhone(false);
        },
        onError: (error) => {
          toast.error(error.message || 'Failed to collect more data');
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-zinc-900 border-zinc-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Plus className="w-5 h-5 text-purple-400" />
            Collect More Leads
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Append more contacts from Apollo using the current filters.
            Duplicates are automatically skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-4">
          {/* Current filters summary */}
          <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
            <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-2">
              Current filters
            </p>
            <FilterSummary filters={sourceQuery} />
          </div>

          {/* Count selector */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2">
              How many contacts to collect?
            </label>
            <div className="flex items-center gap-2">
              {COUNT_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => { setDesiredCount(n); setIsCustom(false); }}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    desiredCount === n && !isCustom
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600 hover:text-zinc-300'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setIsCustom(true)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  isCustom
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600 hover:text-zinc-300'
                }`}
              >
                Custom
              </button>
            </div>
            {isCustom && (
              <input
                type="number"
                min={1}
                max={10000}
                value={desiredCount}
                onChange={(e) => setDesiredCount(Math.max(1, parseInt(e.target.value) || 1))}
                placeholder="Enter amount..."
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/30"
                autoFocus
              />
            )}
            <p className="mt-1.5 text-[11px] text-zinc-600">
              Currently {currentRowCount} rows in table
            </p>
          </div>

          {/* Enrichment options */}
          <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/40 px-3.5 py-3">
            <div className="flex items-center gap-2 mb-2.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-medium text-zinc-300">Enrich on import</span>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 cursor-pointer hover:border-zinc-600 transition-colors">
                <input
                  type="checkbox"
                  checked={enrichEmail}
                  onChange={(e) => setEnrichEmail(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500/30"
                />
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-sm text-zinc-200">Enrich emails</span>
                  <span className="text-xs text-zinc-500">1 credit/contact</span>
                </div>
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 cursor-pointer hover:border-zinc-600 transition-colors">
                <input
                  type="checkbox"
                  checked={enrichPhone}
                  onChange={(e) => setEnrichPhone(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500/30"
                />
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-sm text-zinc-200">Enrich phone numbers</span>
                  <span className="text-xs text-zinc-500">8 credits/contact</span>
                </div>
              </label>
            </div>
          </div>

          {/* Action */}
          <div className="flex items-center justify-end pt-2">
            <Button
              onClick={handleCollect}
              disabled={collectMore.isPending}
              className="gap-2 bg-purple-600 hover:bg-purple-500 text-white"
            >
              {collectMore.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {collectMore.isPending
                ? 'Collecting...'
                : `Collect ${desiredCount} More`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
