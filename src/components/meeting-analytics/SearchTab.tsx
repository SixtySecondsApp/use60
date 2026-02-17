import { useState, useEffect } from 'react';
import { Search, FileText, ArrowRight, Clock, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMaSearch } from '@/lib/hooks/useMeetingAnalytics';
import { AskAnythingPanel } from './AskAnythingPanel';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getSimilarityVariant(similarity: number) {
  if (similarity >= 0.8) return 'success';
  if (similarity >= 0.6) return 'warning';
  return 'destructive';
}

export function SearchTab() {
  const [mode, setMode] = useState<'search' | 'ask'>('search');
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(inputValue.trim());
    }, 500);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const { data, isLoading } = useMaSearch(
    debouncedQuery ? { query: debouncedQuery } : null
  );

  return (
    <div className="space-y-6">
      <Tabs value={mode} onValueChange={(v) => setMode(v as 'search' | 'ask')}>
        <TabsList>
          <TabsTrigger value="search" className="flex items-center gap-1.5">
            <Search className="h-4 w-4" />
            Semantic Search
          </TabsTrigger>
          <TabsTrigger value="ask" className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4" />
            Ask Anything
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === 'ask' ? (
        <AskAnythingPanel />
      ) : (
      <>
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search across all meeting transcripts..."
          className="h-12 pl-10 text-base"
        />
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Results */}
      {!isLoading && data && data.results.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Found {data.totalResults} result{data.totalResults !== 1 ? 's' : ''} in {data.searchTimeMs}ms
          </p>

          {data.results.map((result) => {
            const truncatedText =
              result.segment.text.length > 200
                ? result.segment.text.slice(0, 200) + '...'
                : result.segment.text;

            const matchPercent = Math.round(result.similarity * 100);

            return (
              <Card key={result.segment.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      {result.transcriptTitle || 'Untitled Transcript'}
                    </CardTitle>
                    <Badge variant={getSimilarityVariant(result.similarity)}>
                      {matchPercent}% match
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {truncatedText}
                  </p>
                  {result.segment.startTime != null && result.segment.endTime != null && (
                    <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        {formatTime(result.segment.startTime)} - {formatTime(result.segment.endTime)}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* No results */}
      {!isLoading && data && data.results.length === 0 && debouncedQuery && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="h-10 w-10 text-muted-foreground/40 mb-4" />
          <p className="text-sm text-muted-foreground">
            No results found for &apos;{debouncedQuery}&apos;
          </p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !debouncedQuery && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="h-10 w-10 text-muted-foreground/40 mb-4" />
          <p className="text-sm text-muted-foreground">
            Enter a search query to find relevant meeting segments
          </p>
        </div>
      )}
      </>
      )}
    </div>
  );
}
