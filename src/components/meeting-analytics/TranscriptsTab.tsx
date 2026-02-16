import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Clock, ChevronLeft, ChevronRight, Languages } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMaTranscripts } from '@/lib/hooks/useMeetingAnalytics';

interface TranscriptsTabProps {
  timeRange: string;
}

const PAGE_SIZE = 50;

function formatDuration(seconds: number | null): string {
  if (!seconds) return '\u2014';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function confidenceColor(confidence: number | null): string {
  if (confidence === null) return 'text-muted-foreground';
  const pct = confidence * 100;
  if (pct > 90) return 'text-green-600';
  if (pct > 70) return 'text-yellow-600';
  return 'text-red-600';
}

export function TranscriptsTab({ timeRange }: TranscriptsTabProps) {
  const navigate = useNavigate();
  const [searchFilter, setSearchFilter] = useState('');
  const [page, setPage] = useState(0);

  const { data: transcripts, isLoading, isError, error } = useMaTranscripts({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    order: 'DESC',
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
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Filter transcripts by title..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="pl-9"
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

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Transcripts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-[200px]" />
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
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="mb-3 h-10 w-10" />
              <p className="text-sm">No transcripts found</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-sm text-muted-foreground">
                  <th className="pb-3 font-medium">Title</th>
                  <th className="pb-3 font-medium">Language</th>
                  <th className="pb-3 font-medium">Duration</th>
                  <th className="pb-3 font-medium">Words</th>
                  <th className="pb-3 font-medium">Confidence</th>
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((transcript) => (
                  <tr
                    key={transcript.id}
                    onClick={() => navigate(`/meeting-analytics/${transcript.id}`)}
                    className="hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <td className="py-3 pr-4 text-sm font-medium">
                      {transcript.title || 'Untitled'}
                    </td>
                    <td className="py-3 pr-4 text-sm">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Languages className="h-3.5 w-3.5" />
                        {transcript.languageCode?.toUpperCase() || '\u2014'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-sm">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDuration(transcript.audioDuration)}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-sm text-muted-foreground">
                      {transcript.wordCount?.toLocaleString() ?? '\u2014'}
                    </td>
                    <td className="py-3 pr-4 text-sm">
                      <span className={confidenceColor(transcript.overallConfidence)}>
                        {transcript.overallConfidence !== null
                          ? `${(transcript.overallConfidence * 100).toFixed(1)}%`
                          : '\u2014'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-sm text-muted-foreground">
                      {new Date(transcript.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-sm">
                      {transcript.processedAt ? (
                        <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">
                          Processed
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
                          Pending
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {!isLoading && !isError && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={!transcripts || transcripts.length < PAGE_SIZE}
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
