import { NormalizedResult } from '@/lib/utils/apifyResultNormalizer';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Building2, Users, ExternalLink } from 'lucide-react';
import { useState } from 'react';

interface QueryResultsPreviewProps {
  results: NormalizedResult[];
  onAddToTable: (result: NormalizedResult) => void;
  onAddAllToTable?: () => void;
  isLoading?: boolean;
  entityType?: 'companies' | 'people';
  parsedSummary?: {
    entity_type: string;
    count: number;
    location?: string;
    keywords?: string[];
  };
}

export function QueryResultsPreview({
  results,
  onAddToTable,
  onAddAllToTable,
  isLoading = false,
  entityType = 'companies',
  parsedSummary
}: QueryResultsPreviewProps) {
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const isCompanySearch = entityType === 'companies';

  // Pagination
  const startIndex = page * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedResults = results.slice(startIndex, endIndex);
  const totalPages = Math.ceil(results.length / pageSize);

  // Count by provider
  const providerCounts = results.reduce((acc, r) => {
    acc[r.source_provider] = (acc[r.source_provider] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Provider badge colors
  const providerColors: Record<string, string> = {
    linkedin: 'bg-blue-500',
    maps: 'bg-green-500',
    serp: 'bg-purple-500',
    apollo: 'bg-orange-500',
    ai_ark: 'bg-pink-500'
  };

  if (results.length === 0 && !isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No results found. Try a different query.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Parsed Query Summary */}
      {parsedSummary && (
        <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30 text-sm">
          {isCompanySearch ? (
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <div className="flex flex-wrap gap-2 items-center">
            <Badge variant="secondary">
              {isCompanySearch ? 'Companies' : 'People'}
            </Badge>
            {parsedSummary.count && (
              <span className="text-muted-foreground">
                {parsedSummary.count} requested
              </span>
            )}
            {parsedSummary.location && (
              <Badge variant="outline">{parsedSummary.location}</Badge>
            )}
            {parsedSummary.keywords?.map((kw, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {kw}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">
            {results.length} Results
          </h3>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(providerCounts).map(([provider, count]) => (
              <Badge
                key={provider}
                variant="secondary"
                className={providerColors[provider]}
              >
                {provider}: {count}
              </Badge>
            ))}
          </div>
        </div>

        {onAddAllToTable && results.length > 0 && (
          <Button onClick={onAddAllToTable} variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Add All to Table
          </Button>
        )}
      </div>

      {/* Results table - adaptive columns based on entity type */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              {isCompanySearch ? (
                <>
                  <TableHead>Company</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Employees</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </>
              ) : (
                <>
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedResults.map((result, i) => (
              <TableRow key={i}>
                {isCompanySearch ? (
                  <>
                    <TableCell className="font-medium">
                      {result.company || result.name || '-'}
                    </TableCell>
                    <TableCell>{result.industry || '-'}</TableCell>
                    <TableCell>
                      {result.employee_count ? result.employee_count.toLocaleString() : '-'}
                    </TableCell>
                    <TableCell>{result.location || '-'}</TableCell>
                    <TableCell>
                      {result.website ? (
                        <a
                          href={result.website.startsWith('http') ? result.website : `https://${result.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-600 hover:underline text-sm"
                        >
                          {result.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : '-'}
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="font-medium">
                      {result.name || '-'}
                    </TableCell>
                    <TableCell>{result.title || '-'}</TableCell>
                    <TableCell>{result.company || '-'}</TableCell>
                    <TableCell>{result.location || '-'}</TableCell>
                  </>
                )}
                <TableCell>
                  <Badge
                    variant="outline"
                    className={providerColors[result.source_provider]}
                  >
                    {result.source_provider}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onAddToTable(result)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
