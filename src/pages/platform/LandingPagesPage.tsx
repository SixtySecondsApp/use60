/**
 * Landing Pages — Published Pages List & Submissions Viewer
 *
 * US-005: Published pages list view
 * US-012: Form submissions viewer with CSV export
 *
 * Shows all published landing pages for the org with status, live URL,
 * submission counts, and actions. Clicking the submission count opens
 * a slide-over panel with the full submission table and CSV export.
 */

import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  ExternalLink,
  Copy,
  EyeOff,
  Pencil,
  FileText,
  Download,
  Globe,
  Inbox,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

import { useActiveOrgId } from '@/lib/stores/orgStore';
import {
  usePublishedPages,
  useUnpublishPage,
  usePageSubmissions,
  useSubmissionCounts,
} from '@/lib/hooks/useLandingPublish';
import type { PublishedLandingPage, FormSubmission } from '@/lib/services/landingPublishService';

// ============================================================================
// Status badge
// ============================================================================

const STATUS_CONFIG: Record<
  PublishedLandingPage['status'],
  { label: string; variant: 'success' | 'secondary' | 'warning' | 'destructive' }
> = {
  published: { label: 'Published', variant: 'success' },
  unpublished: { label: 'Unpublished', variant: 'secondary' },
  deploying: { label: 'Deploying', variant: 'warning' },
  failed: { label: 'Failed', variant: 'destructive' },
};

function StatusBadge({ status }: { status: PublishedLandingPage['status'] }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.unpublished;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

// ============================================================================
// Empty state
// ============================================================================

function EmptyState({ onCreateNew }: { onCreateNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <Globe className="h-7 w-7 text-slate-400 dark:text-gray-500" />
      </div>
      <h3 className="text-base font-semibold text-slate-700 dark:text-gray-200 mb-1">
        No published pages yet
      </h3>
      <p className="text-sm text-slate-400 dark:text-gray-500 mb-6 max-w-xs text-center">
        Create and publish your first landing page to start capturing leads.
      </p>
      <Button onClick={onCreateNew} className="gap-2">
        <Plus className="h-4 w-4" />
        Create your first landing page
      </Button>
    </div>
  );
}

// ============================================================================
// Table skeleton loader
// ============================================================================

function TableSkeleton() {
  return (
    <div className="space-y-3 p-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-5 w-40 rounded" />
          <Skeleton className="h-5 w-24 rounded" />
          <Skeleton className="h-5 w-20 rounded" />
          <Skeleton className="h-5 w-28 rounded" />
          <Skeleton className="h-5 w-32 rounded" />
          <Skeleton className="h-5 w-12 rounded" />
          <Skeleton className="h-8 w-24 rounded" />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Submissions panel
// ============================================================================

function SubmissionsPanel({
  page,
  open,
  onClose,
}: {
  page: PublishedLandingPage | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: submissions, isLoading } = usePageSubmissions(open ? page?.id : undefined);

  // Derive all unique form_data keys across submissions
  const formDataKeys = useMemo(() => {
    if (!submissions || submissions.length === 0) return [];
    const keys = new Set<string>();
    for (const sub of submissions) {
      if (sub.form_data) {
        for (const key of Object.keys(sub.form_data)) {
          keys.add(key);
        }
      }
    }
    return [...keys].sort();
  }, [submissions]);

  const handleExportCSV = useCallback(() => {
    if (!submissions || submissions.length === 0) return;

    const headers = ['Date', ...formDataKeys, 'Source URL'];
    const rows = submissions.map((sub) => {
      const date = format(new Date(sub.submitted_at), 'yyyy-MM-dd HH:mm:ss');
      const formFields = formDataKeys.map((key) => sub.form_data?.[key] ?? '');
      return [date, ...formFields, sub.source_url ?? ''];
    });

    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `submissions-${page?.slug ?? 'export'}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  }, [submissions, formDataKeys, page?.slug]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="!top-16 !h-[calc(100vh-4rem)] w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>
            Submissions{page ? ` — ${page.title || page.slug}` : ''}
          </SheetTitle>
          <SheetDescription>
            {submissions?.length ?? 0} total submission{(submissions?.length ?? 0) !== 1 ? 's' : ''}
          </SheetDescription>
        </SheetHeader>

        {/* Export button */}
        {submissions && submissions.length > 0 && (
          <div className="mb-4 flex justify-end">
            <Button size="sm" variant="outline" className="gap-2" onClick={handleExportCSV}>
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-5 w-28 rounded" />
                <Skeleton className="h-5 w-32 rounded" />
                <Skeleton className="h-5 w-24 rounded" />
              </div>
            ))}
          </div>
        ) : !submissions || submissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-gray-800 flex items-center justify-center mb-3">
              <Inbox className="h-6 w-6 text-slate-400 dark:text-gray-500" />
            </div>
            <p className="text-sm text-slate-500 dark:text-gray-400">No submissions yet</p>
          </div>
        ) : (
          <div className="w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  {formDataKeys.map((key) => (
                    <TableHead key={key} className="capitalize">
                      {key.replace(/_/g, ' ')}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell className="whitespace-nowrap text-xs text-slate-500 dark:text-gray-400">
                      {formatDistanceToNow(new Date(sub.submitted_at), { addSuffix: true })}
                    </TableCell>
                    {formDataKeys.map((key) => (
                      <TableCell key={key} className="text-sm">
                        {sub.form_data?.[key] ?? '-'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Main page
// ============================================================================

export default function LandingPagesPage() {
  const navigate = useNavigate();
  const orgId = useActiveOrgId();
  const { data: pages, isLoading, isError, refetch } = usePublishedPages(orgId ?? undefined);
  const unpublish = useUnpublishPage();

  const [submissionsPage, setSubmissionsPage] = useState<PublishedLandingPage | null>(null);

  // Get all page IDs for batch submission count query
  const pageIds = useMemo(() => (pages ?? []).map((p) => p.id), [pages]);
  const { data: submissionCounts } = useSubmissionCounts(orgId ?? undefined, pageIds);

  const handleCopyUrl = useCallback((url: string) => {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    navigator.clipboard.writeText(fullUrl);
    toast.success('URL copied to clipboard');
  }, []);

  const handleUnpublish = useCallback(
    (pageId: string) => {
      unpublish.mutate({ pageId });
    },
    [unpublish],
  );

  const handleNavigateToBuilder = useCallback(() => {
    navigate('/landing-page-builder');
  }, [navigate]);

  if (isError) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <FileText className="h-7 w-7 text-red-400" />
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
            Failed to load landing pages
          </p>
          <p className="text-xs text-slate-400 dark:text-gray-500 mb-4">
            Something went wrong. Please try again.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-slate-50 dark:bg-gray-950">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-slate-200 dark:border-gray-800/60 bg-white dark:bg-gray-900/80">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-800 dark:text-gray-100">
              Landing Pages
            </h1>
            <p className="text-sm text-slate-400 dark:text-gray-500 mt-0.5">
              {isLoading
                ? 'Loading...'
                : `${pages?.length ?? 0} page${(pages?.length ?? 0) !== 1 ? 's' : ''}`}
            </p>
          </div>
          <Button onClick={handleNavigateToBuilder} className="gap-2">
            <Plus className="h-4 w-4" />
            New Page
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <TableSkeleton />
        ) : !pages || pages.length === 0 ? (
          <EmptyState onCreateNew={handleNavigateToBuilder} />
        ) : (
          <div className="p-6">
            <div className="bg-white dark:bg-gray-900/80 rounded-xl border border-slate-200 dark:border-gray-800/60 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead>Live URL</TableHead>
                    <TableHead>Submissions</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pages.map((page) => {
                    const liveUrl = page.custom_domain
                      ? `https://${page.custom_domain}`
                      : page.vercel_url
                        ? `https://${page.vercel_url}`
                        : null;
                    const count = submissionCounts?.[page.id] ?? 0;

                    return (
                      <TableRow key={page.id}>
                        {/* Title */}
                        <TableCell>
                          <span className="font-semibold text-slate-800 dark:text-gray-100 text-sm">
                            {page.title || 'Untitled'}
                          </span>
                        </TableCell>

                        {/* Slug */}
                        <TableCell>
                          <code className="text-xs bg-slate-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-gray-400 font-mono">
                            /{page.slug}
                          </code>
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          <StatusBadge status={page.status} />
                        </TableCell>

                        {/* Published date */}
                        <TableCell className="text-sm text-slate-500 dark:text-gray-400 whitespace-nowrap">
                          {page.published_at
                            ? formatDistanceToNow(new Date(page.published_at), { addSuffix: true })
                            : '-'}
                        </TableCell>

                        {/* Live URL */}
                        <TableCell>
                          {liveUrl ? (
                            <a
                              href={liveUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline max-w-[180px] truncate"
                              title={liveUrl}
                            >
                              <ExternalLink className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">
                                {liveUrl.replace('https://', '')}
                              </span>
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-gray-500">-</span>
                          )}
                        </TableCell>

                        {/* Submission count */}
                        <TableCell>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                            onClick={() => setSubmissionsPage(page)}
                          >
                            <FileText className="h-3 w-3" />
                            {count}
                          </button>
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {liveUrl && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  title="Copy URL"
                                  onClick={() => handleCopyUrl(liveUrl)}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  title="Open in new tab"
                                  asChild
                                >
                                  <a href={liveUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                </Button>
                              </>
                            )}
                            {page.status === 'published' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-slate-500 hover:text-red-600 dark:hover:text-red-400"
                                title="Unpublish"
                                onClick={() => handleUnpublish(page.id)}
                                disabled={unpublish.isPending}
                              >
                                <EyeOff className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              title="Edit in builder"
                              onClick={() => navigate('/landing-page-builder')}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      {/* Submissions slide-over */}
      <SubmissionsPanel
        page={submissionsPage}
        open={submissionsPage !== null}
        onClose={() => setSubmissionsPage(null)}
      />
    </div>
  );
}
