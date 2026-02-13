import { useState, useMemo } from 'react';
import { Sparkles, X } from 'lucide-react';

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
    <div className="relative mx-0 mb-3 overflow-hidden rounded-xl border border-purple-500/20 bg-gradient-to-r from-purple-950/60 via-indigo-950/40 to-purple-950/60 px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/20">
            <Sparkles className="h-4.5 w-4.5 text-purple-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">
              {totalContacts.toLocaleString()} contacts found — enrich to get verified emails, phone numbers & full profiles
            </p>
            <p className="mt-0.5 text-xs text-purple-300/70">
              Apollo search returns names and titles. Run enrichment to fill in contact details.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onEnrichAll}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-r from-purple-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-500/20 transition-all hover:from-purple-400 hover:to-indigo-500 hover:shadow-purple-500/30"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Enrich All Contacts
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-purple-400/60 transition-colors hover:bg-purple-500/10 hover:text-purple-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
