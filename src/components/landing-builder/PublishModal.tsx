/**
 * PublishModal — Publish / manage a landing page deployment.
 *
 * Two states:
 *   1. "Not yet published" — slug + title inputs, URL preview, publish button.
 *   2. "Already published" — live URL, status badge, update/unpublish, custom domain.
 *
 * Covers US-004 (publish modal) and US-006 (custom domain).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Globe,
  Copy,
  ExternalLink,
  Loader2,
  ChevronDown,
  Check,
  AlertTriangle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { usePublishedPage, usePublishPage, useUnpublishPage, useAddCustomDomain } from '@/lib/hooks/useLandingPublish';
import { landingPublishService } from '@/lib/services/landingPublishService';
import { landingAssetService } from '@/lib/services/landingAssetService';
import { generateExport } from './agents/exportPolishAgent';
import { organizationContextService } from '@/lib/services/organizationContextService';
import { generateOgImage } from '@/lib/services/landingPublishService';
import type { LandingSection, BrandConfig, SeoConfig } from './types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PublishModalProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  orgId: string;
  userId: string;
  sections: LandingSection[];
  brandConfig: BrandConfig;
  companyName?: string;
  seoConfig?: SeoConfig;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive a URL-safe slug from a company name. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

/** Validate a slug: lowercase alphanumeric + hyphens, 3-60 chars. */
function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug);
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' }> = {
  published: { label: 'Published', variant: 'success' },
  deploying: { label: 'Deploying', variant: 'warning' },
  failed: { label: 'Failed', variant: 'destructive' },
  unpublished: { label: 'Unpublished', variant: 'default' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PublishModal: React.FC<PublishModalProps> = ({
  open,
  onClose,
  sessionId,
  orgId,
  userId,
  sections,
  brandConfig,
  companyName,
  seoConfig,
}) => {
  // ---- State ----
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [slugError, setSlugError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [domainInput, setDomainInput] = useState('');
  const [domainOpen, setDomainOpen] = useState(false);

  // ---- Hooks ----
  const { data: publishedPage, isLoading: isLoadingPage } = usePublishedPage(sessionId);
  const publishMutation = usePublishPage();
  const unpublishMutation = useUnpublishPage();
  const addDomainMutation = useAddCustomDomain();

  const isPublished = publishedPage && publishedPage.status !== 'unpublished';

  // ---- Auto-fill slug / title from company name ----
  useEffect(() => {
    if (!slug && companyName) {
      setSlug(slugify(companyName));
    }
    if (!title && companyName) {
      setTitle(`${companyName} - Landing Page`);
    }
  }, [companyName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill from existing page when re-opening
  useEffect(() => {
    if (publishedPage) {
      if (!slug) setSlug(publishedPage.slug);
      if (!title) setTitle(publishedPage.title);
      if (publishedPage.custom_domain) {
        setDomainInput(publishedPage.custom_domain);
      }
    }
  }, [publishedPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setSlugError(null);
      setIsChecking(false);
      setIsPublishing(false);
    }
  }, [open]);

  const liveUrl = useMemo(() => {
    if (publishedPage?.vercel_url) {
      return `https://${publishedPage.vercel_url}`;
    }
    return null;
  }, [publishedPage]);

  // ---- Retrieve Vercel token from org context ----
  const getVercelToken = useCallback(async (): Promise<string> => {
    const ctx = await organizationContextService.getContext(orgId);
    const token = ctx.vercel_api_token as string | undefined;
    if (!token) {
      throw new Error('Vercel API token not configured. Add "vercel_api_token" in your organization settings.');
    }
    return token;
  }, [orgId]);

  // ---- Copy URL to clipboard ----
  const handleCopyUrl = useCallback(async () => {
    if (!liveUrl) return;
    try {
      await navigator.clipboard.writeText(liveUrl);
      toast.success('URL copied to clipboard');
    } catch {
      toast.error('Failed to copy URL');
    }
  }, [liveUrl]);

  // ---- Publish / Update flow ----
  const handlePublish = useCallback(async () => {
    // Validate slug
    if (!isValidSlug(slug)) {
      setSlugError('Slug must be 3-60 characters, lowercase letters, numbers, and hyphens only.');
      return;
    }
    if (!title.trim()) {
      toast.error('Please enter a page title.');
      return;
    }

    setSlugError(null);
    setIsPublishing(true);

    try {
      // 1. Check slug availability (skip if updating existing page with same slug)
      if (!publishedPage || publishedPage.slug !== slug) {
        setIsChecking(true);
        const available = await landingPublishService.checkSlugAvailable(slug);
        setIsChecking(false);
        if (!available) {
          setSlugError(`Slug "${slug}" is already taken. Try a different one.`);
          setIsPublishing(false);
          return;
        }
      }

      // 2. Persist section images to Supabase Storage
      const persistedSections = await landingAssetService.persistSectionImages(sections, orgId, sessionId);

      // 3. Auto-generate OG image if no custom one is set (US-024)
      let effectiveSeoConfig = seoConfig ? { ...seoConfig } : undefined;
      if (!effectiveSeoConfig?.og_image_url) {
        const hero = sections.find(s => s.type === 'hero');
        const headline = hero?.copy.headline ?? title;
        try {
          const ogUrl = await generateOgImage(headline, brandConfig, orgId, sessionId);
          if (ogUrl) {
            effectiveSeoConfig = {
              title: effectiveSeoConfig?.title ?? title,
              description: effectiveSeoConfig?.description ?? '',
              ...effectiveSeoConfig,
              og_image_url: ogUrl,
            };
          }
        } catch {
          // OG generation is best-effort — continue without it
        }
      }

      // 4. Generate HTML via export polish agent (includes SEO tags)
      const exportResult = await generateExport({
        sections: persistedSections,
        brandConfig,
        companyName,
        polishWithAI: false,
        seoConfig: effectiveSeoConfig,
      });

      // 5. Get Vercel token
      const vercelToken = await getVercelToken();

      // 6. Publish
      await publishMutation.mutateAsync({
        params: {
          sessionId,
          orgId,
          userId,
          slug,
          title: title.trim(),
          htmlContent: exportResult.html,
          metaDescription: effectiveSeoConfig?.description,
          ogImageUrl: effectiveSeoConfig?.og_image_url,
          seoConfig: effectiveSeoConfig as Record<string, unknown> | undefined,
        },
        vercelToken,
      });

      // Success toast is handled by the mutation hook
    } catch (err) {
      // Error toast is handled by the mutation hook for publish errors,
      // but we need to handle pre-publish errors (token, images, etc.)
      if (err instanceof Error && !err.message.includes('publish')) {
        toast.error('Publish failed', { description: err.message });
      }
    } finally {
      setIsPublishing(false);
    }
  }, [slug, title, publishedPage, sections, orgId, sessionId, userId, brandConfig, companyName, seoConfig, getVercelToken, publishMutation]);

  // ---- Unpublish ----
  const handleUnpublish = useCallback(async () => {
    if (!publishedPage) return;
    unpublishMutation.mutate({ pageId: publishedPage.id });
  }, [publishedPage, unpublishMutation]);

  // ---- Connect custom domain ----
  const handleConnectDomain = useCallback(async () => {
    if (!publishedPage || !domainInput.trim()) return;

    try {
      const vercelToken = await getVercelToken();
      addDomainMutation.mutate({
        pageId: publishedPage.id,
        domain: domainInput.trim(),
        vercelToken,
      });
    } catch (err) {
      toast.error('Failed to connect domain', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [publishedPage, domainInput, getVercelToken, addDomainMutation]);

  // ---- Slug input handler ----
  const handleSlugChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSlug(raw);
    setSlugError(null);
  }, []);

  // ---- Render ----
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-violet-500" />
            Publish Landing Page
          </DialogTitle>
          <DialogDescription>
            {isPublished
              ? 'Manage your published landing page.'
              : 'Deploy your page to a live URL.'}
          </DialogDescription>
        </DialogHeader>

        {isLoadingPage ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : isPublished && publishedPage ? (
          /* -------------------------------------------------------------- */
          /* Already Published State                                        */
          /* -------------------------------------------------------------- */
          <div className="space-y-4">
            {/* Status + URL */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</span>
                <Badge variant={STATUS_CONFIG[publishedPage.status]?.variant ?? 'default'}>
                  {publishedPage.status === 'deploying' && (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  )}
                  {publishedPage.status === 'failed' && (
                    <AlertTriangle className="w-3 h-3 mr-1" />
                  )}
                  {publishedPage.status === 'published' && (
                    <Check className="w-3 h-3 mr-1" />
                  )}
                  {STATUS_CONFIG[publishedPage.status]?.label ?? publishedPage.status}
                </Badge>
              </div>

              {liveUrl && (
                <div className="flex items-center gap-2 p-2.5 rounded-md bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/5">
                  <span className="flex-1 text-sm text-violet-600 dark:text-violet-400 truncate font-mono">
                    {liveUrl}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                    title="Copy URL"
                  >
                    <Copy className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                  <a
                    href={liveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                  </a>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                onClick={handlePublish}
                disabled={isPublishing || publishMutation.isPending}
                className="flex-1"
              >
                {isPublishing || publishMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Globe className="w-4 h-4 mr-2" />
                    Update
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={handleUnpublish}
                disabled={unpublishMutation.isPending}
              >
                {unpublishMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Unpublish'
                )}
              </Button>
            </div>

            {/* Custom Domain (collapsible) */}
            <Collapsible open={domainOpen} onOpenChange={setDomainOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 w-full text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors py-1"
                >
                  <ChevronDown
                    className={cn(
                      'w-4 h-4 transition-transform',
                      domainOpen && 'rotate-180',
                    )}
                  />
                  Custom Domain
                  {publishedPage.custom_domain && (
                    <Badge variant="success" className="ml-auto text-[10px] py-0">
                      <Check className="w-2.5 h-2.5 mr-0.5" />
                      Connected
                    </Badge>
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-3">
                {publishedPage.custom_domain && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Current:</span>
                    <span className="font-mono text-violet-600 dark:text-violet-400">
                      {publishedPage.custom_domain}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Input
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    placeholder="landing.yourcompany.com"
                    className="flex-1 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleConnectDomain}
                    disabled={!domainInput.trim() || addDomainMutation.isPending}
                  >
                    {addDomainMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      'Connect'
                    )}
                  </Button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  Add a CNAME record pointing your domain to{' '}
                  <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-white/5 font-mono text-[11px]">
                    cname.vercel-dns.com
                  </code>
                </p>
              </CollapsibleContent>
            </Collapsible>
          </div>
        ) : (
          /* -------------------------------------------------------------- */
          /* Not Yet Published State                                        */
          /* -------------------------------------------------------------- */
          <div className="space-y-4">
            {/* Title */}
            <div className="space-y-1.5">
              <label htmlFor="publish-title" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Page Title
              </label>
              <Input
                id="publish-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="My Landing Page"
              />
            </div>

            {/* Slug */}
            <div className="space-y-1.5">
              <label htmlFor="publish-slug" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                URL Slug
              </label>
              <Input
                id="publish-slug"
                value={slug}
                onChange={handleSlugChange}
                placeholder="my-company"
                className={cn(slugError && 'border-red-500 focus-visible:ring-red-500')}
              />
              {slugError && (
                <p className="text-xs text-red-500">{slugError}</p>
              )}
            </div>

            {/* URL Preview */}
            <div className="p-2.5 rounded-md bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/5">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Your page will be live at:</p>
              <p className="text-sm font-mono text-violet-600 dark:text-violet-400 break-all">
                https://{slug || 'your-slug'}.vercel.app
              </p>
            </div>

            {/* Publish button */}
            <Button
              onClick={handlePublish}
              disabled={isPublishing || publishMutation.isPending || !slug || !title.trim()}
              className="w-full"
            >
              {isPublishing || publishMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  {isChecking ? 'Checking slug...' : 'Publishing...'}
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4 mr-2" />
                  Publish
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PublishModal;
