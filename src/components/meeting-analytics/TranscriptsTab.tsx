import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Clock, ChevronLeft, ChevronRight, Languages, Trash2, Hash } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useMaTranscripts, useMaDeleteTranscript } from '@/lib/hooks/useMeetingAnalytics';

interface DateRange {
  start: Date;
  end: Date;
}

interface TranscriptsTabProps {
  timeRange?: string;
  period?: string;
  dateRange?: DateRange;
}

const PAGE_SIZE = 50;

function formatDuration(seconds: number | null): string {
  if (!seconds) return '\u2014';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function confidenceBadgeClass(confidence: number | null): string {
  if (confidence === null) return 'bg-gray-100 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400';
  const pct = confidence * 100;
  if (pct > 90) return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
  if (pct > 70) return 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400';
  return 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400';
}

export function TranscriptsTab({ timeRange, period, dateRange }: TranscriptsTabProps) {
  const navigate = useNavigate();
  const [searchFilter, setSearchFilter] = useState('');
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const deleteMutation = useMaDeleteTranscript();

  // Reset to first page whenever the date filter changes
  useEffect(() => {
    setPage(0);
  }, [period, dateRange?.start?.toISOString(), dateRange?.end?.toISOString()]);

  const startDate = dateRange?.start ? dateRange.start.toISOString() : undefined;
  const endDate = dateRange?.end ? dateRange.end.toISOString() : undefined;

  const { data: transcripts, isLoading, isError, error } = useMaTranscripts({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    order: 'DESC',
    startDate,
    endDate,
  });

  const filtered = useMemo(() => {
    if (!transcripts) return [];
    if (!searchFilter.trim()) return transcripts;
    const query = searchFilter.toLowerCase();
    return transcripts.filter((t) =>
      (t.title ?? '').toLowerCase().includes(query)
    );
  }, [transcripts, searchFilter]);

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-xl border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
        <input
          type="text"
          placeholder="Filter transcripts by title..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="h-11 w-full pl-10 pr-4 text-sm rounded-xl bg-transparent border-0 outline-none focus:ring-0 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
        />
      </div>

      {/* Error state */}
      {isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {error instanceof Error ? error.message : 'Failed to load transcripts.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Table container */}
      <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10 overflow-hidden">
        {/* Table header row */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800/50 bg-gray-50/80 dark:bg-gray-800/30 flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Transcripts</span>
        </div>

        {isLoading ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <Skeleton className="h-4 w-[220px]" />
                <Skeleton className="h-4 w-[60px]" />
                <Skeleton className="h-4 w-[70px]" />
                <Skeleton className="h-4 w-[60px]" />
                <Skeleton className="h-4 w-[70px]" />
                <Skeleton className="h-4 w-[80px]" />
                <Skeleton className="h-4 w-[70px]" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800/50">
              <FileText className="h-7 w-7 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No transcripts found</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Try adjusting your search or time range</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-gray-800/30 border-b border-gray-100 dark:border-gray-800/50">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Title</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Language</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Words</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Confidence</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((transcript) => (
                <tr
                  key={transcript.id}
                  onClick={() => navigate(`/meeting-analytics/${transcript.id}`)}
                  className="border-b border-gray-100 dark:border-gray-800/50 last:border-b-0 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-3.5 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {transcript.title || 'Untitled'}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                      <Languages className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                      <span className="bg-gray-100 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400 rounded-lg px-2 py-0.5 text-xs font-medium">
                        {transcript.languageCode?.toUpperCase() || '\u2014'}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                      <Clock className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                      {formatDuration(transcript.audioDuration)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                      <Hash className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                      {transcript.wordCount?.toLocaleString() ?? '\u2014'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${confidenceBadgeClass(transcript.overallConfidence)}`}>
                      {transcript.overallConfidence !== null
                        ? `${(transcript.overallConfidence * 100).toFixed(1)}%`
                        : '\u2014'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                    {new Date(transcript.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3.5">
                    {transcript.processedAt ? (
                      <span className="inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                        Processed
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <button
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget({ id: transcript.id, title: transcript.title || 'Untitled' });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && !isError && (
        <div className="bg-white/80 dark:bg-gray-900/40 backdrop-blur-xl rounded-2xl p-3 sm:p-4 border border-gray-200/50 dark:border-gray-700/30 shadow-sm dark:shadow-lg dark:shadow-black/10 mt-4 flex items-center justify-between">
          <button
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200/50 dark:border-gray-700/30 bg-white/60 dark:bg-gray-800/30 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Page {page + 1}
          </span>
          <button
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200/50 dark:border-gray-700/30 bg-white/60 dark:bg-gray-800/30 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => setPage((p) => p + 1)}
            disabled={!transcripts || transcripts.length < PAGE_SIZE}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/30 shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-gray-100">Delete Transcript</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Are you sure you want to delete &quot;{deleteTarget?.title || 'this transcript'}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg border border-gray-200/50 dark:border-gray-700/30 bg-white/60 dark:bg-gray-800/30 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-red-600 hover:bg-red-700 text-white dark:bg-red-500 dark:hover:bg-red-600"
              onClick={async () => {
                if (!deleteTarget) return;
                try {
                  await deleteMutation.mutateAsync(deleteTarget.id);
                  toast.success('Transcript deleted');
                  setDeleteTarget(null);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Failed to delete');
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
