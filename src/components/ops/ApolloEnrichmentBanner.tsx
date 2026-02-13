import { useState, useMemo } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ApolloEnrichmentBannerProps {
  rows: Array<{ cells: Record<string, { value: string | null }> }>;
  columns: Array<{ key: string; column_type: string }>;
  onEnrichAll: () => void;
  isEnriching?: boolean;
}

export function ApolloEnrichmentBanner({
  rows,
  columns,
  onEnrichAll,
  isEnriching,
}: ApolloEnrichmentBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  const { shouldShow, totalContacts } = useMemo(() => {
    if (rows.length === 0) return { shouldShow: false, totalContacts: 0 };

    const emailCol = columns.find(c => c.key === 'email');
    if (!emailCol) return { shouldShow: false, totalContacts: 0 };

    const emptyCount = rows.filter(r => {
      const val = r.cells[emailCol.key]?.value;
      return !val || val.trim() === '';
    }).length;

    const emptyRatio = emptyCount / rows.length;
    return { shouldShow: emptyRatio > 0.7, totalContacts: rows.length };
  }, [rows, columns]);

  if (dismissed || !shouldShow || isEnriching) return null;

  return (
    <div className="mx-4 mb-3 rounded-xl border border-violet-500/30 bg-violet-500/5 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
          <Sparkles className="h-4 w-4 text-violet-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-violet-300">
            {totalContacts.toLocaleString()} contacts ready to enrich
          </h4>
          <p className="mt-0.5 text-xs text-violet-300/70">
            Enrich to get verified emails, phone numbers & full profiles from Apollo.
          </p>
          <div className="mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onEnrichAll}
              className="h-7 gap-1.5 border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 text-xs"
            >
              <Sparkles className="h-3 w-3" />
              Enrich All Contacts
            </Button>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 text-violet-400/50 transition-colors hover:text-violet-400"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
