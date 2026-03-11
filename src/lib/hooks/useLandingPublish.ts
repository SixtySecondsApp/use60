/**
 * useLandingPublish
 *
 * React Query hooks for landing page publish operations.
 * Wraps landingPublishService with caching, mutations, and toast feedback.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  landingPublishService,
  type PublishParams,
} from '@/lib/services/landingPublishService';
import { toast } from 'sonner';
import logger from '@/lib/utils/logger';

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

const publishedPageKeys = {
  all: ['publishedPages'] as const,
  bySession: (sessionId: string) => [...publishedPageKeys.all, 'session', sessionId] as const,
  byOrg: (orgId: string) => [...publishedPageKeys.all, 'org', orgId] as const,
  submissions: (pageId: string) => [...publishedPageKeys.all, 'submissions', pageId] as const,
  submissionCounts: (orgId: string) => [...publishedPageKeys.all, 'submissionCounts', orgId] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Fetch the published page for a specific builder session.
 * Returns null if no page has been published for this session.
 */
export function usePublishedPage(sessionId: string | undefined) {
  return useQuery({
    queryKey: publishedPageKeys.bySession(sessionId ?? ''),
    queryFn: async () => {
      if (!sessionId) return null;
      return landingPublishService.getPublishedPage(sessionId);
    },
    enabled: !!sessionId,
    staleTime: 30_000,
  });
}

/**
 * List all published pages for an organization.
 */
export function usePublishedPages(orgId: string | undefined) {
  return useQuery({
    queryKey: publishedPageKeys.byOrg(orgId ?? ''),
    queryFn: async () => {
      if (!orgId) return [];
      return landingPublishService.getPublishedPages(orgId);
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Publish a landing page to Vercel.
 * Requires vercelToken to be passed alongside publish params.
 */
export function usePublishPage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      params,
      vercelToken,
    }: {
      params: PublishParams;
      vercelToken: string;
    }) => {
      return landingPublishService.publish(params, vercelToken);
    },
    onSuccess: (result, variables) => {
      toast.success('Landing page published', {
        description: result.url,
      });
      queryClient.invalidateQueries({
        queryKey: publishedPageKeys.bySession(variables.params.sessionId),
      });
      queryClient.invalidateQueries({
        queryKey: publishedPageKeys.byOrg(variables.params.orgId),
      });
    },
    onError: (err) => {
      logger.error('[usePublishPage] publish failed:', err);
      toast.error('Failed to publish landing page', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    },
  });
}

/**
 * Unpublish a landing page (sets status to 'unpublished').
 */
export function useUnpublishPage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pageId }: { pageId: string }) => {
      return landingPublishService.unpublish(pageId);
    },
    onSuccess: () => {
      toast.success('Landing page unpublished');
      // Invalidate all published page queries since we don't know the session/org from pageId alone
      queryClient.invalidateQueries({
        queryKey: publishedPageKeys.all,
      });
    },
    onError: (err) => {
      logger.error('[useUnpublishPage] unpublish failed:', err);
      toast.error('Failed to unpublish landing page', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Submission Queries
// ---------------------------------------------------------------------------

/**
 * Fetch form submissions for a specific published page.
 */
export function usePageSubmissions(pageId: string | undefined) {
  return useQuery({
    queryKey: publishedPageKeys.submissions(pageId ?? ''),
    queryFn: async () => {
      if (!pageId) return [];
      return landingPublishService.getSubmissions(pageId);
    },
    enabled: !!pageId,
    staleTime: 30_000,
  });
}

/**
 * Fetch submission counts for all published pages in an org.
 * Returns a map of pageId -> count.
 */
export function useSubmissionCounts(orgId: string | undefined, pageIds: string[]) {
  return useQuery({
    queryKey: publishedPageKeys.submissionCounts(orgId ?? ''),
    queryFn: async () => {
      if (pageIds.length === 0) return {};
      return landingPublishService.getSubmissionCounts(pageIds);
    },
    enabled: !!orgId && pageIds.length > 0,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Custom Domain Mutation
// ---------------------------------------------------------------------------

/**
 * Add a custom domain to a published landing page via Vercel.
 */
export function useAddCustomDomain() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pageId,
      domain,
      vercelToken,
    }: {
      pageId: string;
      domain: string;
      vercelToken: string;
    }) => {
      return landingPublishService.addCustomDomain(pageId, domain, vercelToken);
    },
    onSuccess: () => {
      toast.success('Custom domain connected');
      queryClient.invalidateQueries({
        queryKey: publishedPageKeys.all,
      });
    },
    onError: (err) => {
      logger.error('[useAddCustomDomain] failed:', err);
      toast.error('Failed to connect custom domain', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    },
  });
}
