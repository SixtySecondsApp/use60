/**
 * Landing Publish Service
 *
 * Deploys landing page HTML to Vercel and manages published landing pages.
 * Handles slug uniqueness, deployments, custom domains, and status tracking.
 *
 * Vercel token is stored as `vercel_api_token` in organization_context
 * and retrieved by the caller before passing to deploy methods.
 */

import { supabase } from '@/lib/supabase/clientV2';
import logger from '@/lib/utils/logger';
import { nanoBananaService } from './nanoBananaService';
import { landingAssetService } from './landingAssetService';
import type { BrandConfig } from '@/components/landing-builder/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PublishedLandingPage {
  id: string;
  session_id: string;
  org_id: string;
  user_id: string;
  slug: string;
  title: string;
  html_content: string;
  meta_description: string | null;
  og_image_url: string | null;
  seo_config: Record<string, unknown> | null;
  vercel_deployment_id: string | null;
  vercel_url: string | null;
  custom_domain: string | null;
  status: 'published' | 'unpublished' | 'deploying' | 'failed';
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FormSubmission {
  id: string;
  page_id: string;
  org_id: string;
  form_data: Record<string, string>;
  source_url: string | null;
  submitted_at: string;
}

export interface PublishParams {
  sessionId: string;
  orgId: string;
  userId: string;
  slug: string;
  title: string;
  htmlContent: string;
  metaDescription?: string;
  ogImageUrl?: string;
  seoConfig?: Record<string, unknown>;
}

interface VercelDeploymentResponse {
  id: string;
  url: string;
  readyState?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VERCEL_DEPLOY_URL = 'https://api.vercel.com/v13/deployments';
const VERCEL_PROJECTS_URL = 'https://api.vercel.com/v9/projects';

const PUBLISHED_PAGE_COLUMNS = [
  'id',
  'session_id',
  'org_id',
  'user_id',
  'slug',
  'title',
  'html_content',
  'meta_description',
  'og_image_url',
  'seo_config',
  'vercel_deployment_id',
  'vercel_url',
  'custom_domain',
  'status',
  'published_at',
  'created_at',
  'updated_at',
].join(', ');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deploy HTML content to Vercel as a single-page site.
 */
async function deployToVercel(
  slug: string,
  htmlContent: string,
  vercelToken: string,
): Promise<VercelDeploymentResponse> {
  const base64Content = btoa(unescape(encodeURIComponent(htmlContent)));

  const response = await fetch(VERCEL_DEPLOY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${vercelToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: slug,
      files: [
        {
          file: 'index.html',
          data: base64Content,
        },
      ],
      target: 'production',
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error('[publish] Vercel deploy failed:', { status: response.status, body: errorBody });
    throw new Error(`Vercel deployment failed (${response.status}): ${errorBody}`);
  }

  const result = await response.json();
  return {
    id: result.id,
    url: result.url,
    readyState: result.readyState,
  };
}

// ---------------------------------------------------------------------------
// OG Image Generation (US-024)
// ---------------------------------------------------------------------------

/**
 * Generate an OG image (1200x630) using nanoBananaService.
 * Returns the permanent Supabase Storage URL, or null on failure.
 *
 * Called during publish when no custom OG image has been set.
 */
export async function generateOgImage(
  headline: string,
  brandConfig: BrandConfig,
  orgId: string,
  sessionId: string,
): Promise<string | null> {
  try {
    const prompt = `Social media preview card: ${headline}. Brand colors: ${brandConfig.primary_color}, ${brandConfig.accent_color}. Clean, professional, minimal text. 1200x630.`;

    logger.log('[publish] Generating OG image', { headline: headline.slice(0, 40) });

    const result = await nanoBananaService.generateImage({
      prompt,
      aspect_ratio: 'landscape',
      num_images: 1,
    });

    if (!result.images?.length) {
      logger.warn('[publish] OG image generation returned no images');
      return null;
    }

    // Upload the generated image to permanent storage
    const imageUrl = result.images[0];
    const permanentUrl = await landingAssetService.uploadFromUrl(imageUrl, orgId, sessionId);

    logger.log('[publish] OG image generated and uploaded', { permanentUrl });
    return permanentUrl;
  } catch (error) {
    logger.error('[publish] OG image generation failed:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const landingPublishService = {
  /**
   * Fetch the published page for a given session.
   * Returns null if no page exists.
   */
  async getPublishedPage(sessionId: string): Promise<PublishedLandingPage | null> {
    const { data, error } = await supabase
      .from('published_landing_pages')
      .select(PUBLISHED_PAGE_COLUMNS)
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error) {
      logger.error('[publish] Failed to get published page:', error);
      throw error;
    }

    return data as PublishedLandingPage | null;
  },

  /**
   * List all published pages for an organization.
   */
  async getPublishedPages(orgId: string): Promise<PublishedLandingPage[]> {
    const { data, error } = await supabase
      .from('published_landing_pages')
      .select(PUBLISHED_PAGE_COLUMNS)
      .eq('org_id', orgId)
      .order('updated_at', { ascending: false });

    if (error) {
      logger.error('[publish] Failed to list published pages:', error);
      throw error;
    }

    return (data as PublishedLandingPage[]) || [];
  },

  /**
   * Check whether a slug is available (unique across all published pages).
   */
  async checkSlugAvailable(slug: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('published_landing_pages')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      logger.error('[publish] Failed to check slug availability:', error);
      throw error;
    }

    return data === null;
  },

  /**
   * Publish a landing page: upsert DB row + deploy to Vercel.
   *
   * @param params - Publish parameters (session, org, slug, HTML, etc.)
   * @param vercelToken - Vercel API token (retrieved by caller from org context)
   * @returns The live URL of the deployed page
   */
  async publish(
    params: PublishParams,
    vercelToken: string,
  ): Promise<{ url: string; page: PublishedLandingPage }> {
    const {
      sessionId,
      orgId,
      userId,
      slug,
      title,
      htmlContent,
      metaDescription,
      ogImageUrl,
      seoConfig,
    } = params;

    // Check for existing page for this session
    const existing = await this.getPublishedPage(sessionId);

    // Upsert the row with 'deploying' status
    const row = {
      session_id: sessionId,
      org_id: orgId,
      user_id: userId,
      slug,
      title,
      html_content: htmlContent,
      meta_description: metaDescription ?? null,
      og_image_url: ogImageUrl ?? null,
      seo_config: seoConfig ?? null,
      status: 'deploying' as const,
    };

    let pageId: string;

    if (existing) {
      const { data, error } = await supabase
        .from('published_landing_pages')
        .update(row)
        .eq('id', existing.id)
        .select(PUBLISHED_PAGE_COLUMNS)
        .single();

      if (error) {
        logger.error('[publish] Failed to update published page:', error);
        throw error;
      }
      pageId = data.id;
    } else {
      const { data, error } = await supabase
        .from('published_landing_pages')
        .insert(row)
        .select(PUBLISHED_PAGE_COLUMNS)
        .single();

      if (error) {
        logger.error('[publish] Failed to insert published page:', error);
        throw error;
      }
      pageId = data.id;
    }

    // Auto-inject visitor tracking snippet if enabled for this org
    let finalHtml = htmlContent;
    try {
      const snippetHtml = await injectVisitorSnippet(orgId, htmlContent);
      if (snippetHtml) finalHtml = snippetHtml;
    } catch (snippetErr) {
      logger.warn('[publish] Visitor snippet injection skipped:', snippetErr);
    }

    // Deploy to Vercel
    let deployment: VercelDeploymentResponse;
    try {
      deployment = await deployToVercel(slug, finalHtml, vercelToken);
    } catch (deployError) {
      // Mark as failed in DB
      await supabase
        .from('published_landing_pages')
        .update({ status: 'failed' })
        .eq('id', pageId);

      logger.error('[publish] Vercel deployment failed:', deployError);
      throw deployError;
    }

    // Update row with deployment info and mark as published
    const { data: updatedPage, error: updateError } = await supabase
      .from('published_landing_pages')
      .update({
        vercel_deployment_id: deployment.id,
        vercel_url: deployment.url,
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .eq('id', pageId)
      .select(PUBLISHED_PAGE_COLUMNS)
      .single();

    if (updateError) {
      logger.error('[publish] Failed to update deployment info:', updateError);
      throw updateError;
    }

    const liveUrl = `https://${deployment.url}`;
    return { url: liveUrl, page: updatedPage as PublishedLandingPage };
  },

  /**
   * Unpublish a page (set status to 'unpublished').
   * Does not delete the Vercel deployment.
   */
  async unpublish(pageId: string): Promise<void> {
    const { error } = await supabase
      .from('published_landing_pages')
      .update({ status: 'unpublished' })
      .eq('id', pageId);

    if (error) {
      logger.error('[publish] Failed to unpublish page:', error);
      throw error;
    }
  },

  /**
   * Update the slug for a published page and trigger a redeployment.
   *
   * @param pageId - ID of the published page
   * @param newSlug - New slug value
   * @param vercelToken - Vercel API token
   * @returns The new live URL
   */
  async updateSlug(
    pageId: string,
    newSlug: string,
    vercelToken: string,
  ): Promise<string> {
    // Fetch the existing page
    const { data: page, error: fetchError } = await supabase
      .from('published_landing_pages')
      .select(PUBLISHED_PAGE_COLUMNS)
      .eq('id', pageId)
      .single();

    if (fetchError) {
      logger.error('[publish] Failed to fetch page for slug update:', fetchError);
      throw fetchError;
    }

    const typedPage = page as PublishedLandingPage;

    // Check slug availability
    const available = await this.checkSlugAvailable(newSlug);
    if (!available) {
      throw new Error(`Slug "${newSlug}" is already taken`);
    }

    // Update slug in DB
    await supabase
      .from('published_landing_pages')
      .update({ slug: newSlug, status: 'deploying' })
      .eq('id', pageId);

    // Redeploy with new slug
    let deployment: VercelDeploymentResponse;
    try {
      deployment = await deployToVercel(newSlug, typedPage.html_content, vercelToken);
    } catch (deployError) {
      await supabase
        .from('published_landing_pages')
        .update({ status: 'failed' })
        .eq('id', pageId);

      logger.error('[publish] Redeployment for slug update failed:', deployError);
      throw deployError;
    }

    // Update deployment info
    const { error: updateError } = await supabase
      .from('published_landing_pages')
      .update({
        vercel_deployment_id: deployment.id,
        vercel_url: deployment.url,
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .eq('id', pageId);

    if (updateError) {
      logger.error('[publish] Failed to update slug deployment info:', updateError);
      throw updateError;
    }

    return `https://${deployment.url}`;
  },

  /**
   * Add a custom domain to the Vercel project associated with a published page.
   *
   * @param pageId - ID of the published page
   * @param domain - Custom domain to add (e.g. "landing.example.com")
   * @param vercelToken - Vercel API token
   */
  async addCustomDomain(
    pageId: string,
    domain: string,
    vercelToken: string,
  ): Promise<void> {
    // Fetch page to get the slug (project name)
    const { data: page, error: fetchError } = await supabase
      .from('published_landing_pages')
      .select('id, slug')
      .eq('id', pageId)
      .single();

    if (fetchError) {
      logger.error('[publish] Failed to fetch page for domain addition:', fetchError);
      throw fetchError;
    }

    // Call Vercel Domains API
    const response = await fetch(
      `${VERCEL_PROJECTS_URL}/${page.slug}/domains`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${vercelToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: domain }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('[publish] Vercel domain addition failed:', { status: response.status, body: errorBody });
      throw new Error(`Failed to add custom domain (${response.status}): ${errorBody}`);
    }

    // Store custom domain in DB
    const { error: updateError } = await supabase
      .from('published_landing_pages')
      .update({ custom_domain: domain })
      .eq('id', pageId);

    if (updateError) {
      logger.error('[publish] Failed to store custom domain in DB:', updateError);
      throw updateError;
    }
  },

  // ---------------------------------------------------------------------------
  // Form Submissions
  // ---------------------------------------------------------------------------

  /**
   * Fetch all form submissions for a published page.
   */
  async getSubmissions(pageId: string): Promise<FormSubmission[]> {
    const { data, error } = await supabase
      .from('landing_form_submissions')
      .select('id, page_id, org_id, form_data, source_url, submitted_at')
      .eq('page_id', pageId)
      .order('submitted_at', { ascending: false });

    if (error) {
      logger.error('[publish] Failed to get form submissions:', error);
      throw error;
    }

    return (data as FormSubmission[]) || [];
  },

  /**
   * Get the count of form submissions for a published page.
   */
  async getSubmissionCount(pageId: string): Promise<number> {
    const { count, error } = await supabase
      .from('landing_form_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('page_id', pageId);

    if (error) {
      logger.error('[publish] Failed to get submission count:', error);
      throw error;
    }

    return count ?? 0;
  },

  /**
   * Get submission counts for multiple pages in a single call.
   * Returns a map of pageId -> count.
   */
  async getSubmissionCounts(pageIds: string[]): Promise<Record<string, number>> {
    if (pageIds.length === 0) return {};

    const { data, error } = await supabase
      .from('landing_form_submissions')
      .select('page_id')
      .in('page_id', pageIds);

    if (error) {
      logger.error('[publish] Failed to get submission counts:', error);
      throw error;
    }

    const counts: Record<string, number> = {};
    for (const id of pageIds) counts[id] = 0;
    for (const row of data || []) {
      counts[row.page_id] = (counts[row.page_id] || 0) + 1;
    }

    return counts;
  },
};

// ---------------------------------------------------------------------------
// Visitor Snippet Auto-Injection (US-009)
// ---------------------------------------------------------------------------

/**
 * If the org has visitor intelligence enabled, inject the tracking snippet
 * into the HTML before </body>. Returns modified HTML or null if not applicable.
 */
async function injectVisitorSnippet(orgId: string, html: string): Promise<string | null> {
  // Check if org has visitor tracking enabled
  const { data: config } = await supabase
    .from('visitor_snippet_configs')
    .select('snippet_token, is_active, allowed_domains')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .maybeSingle();

  if (!config?.snippet_token) return null;

  // Don't double-inject if snippet already present
  if (html.includes('visitor-snippet-serve') || html.includes('__60vi')) return null;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const snippetTag = `<script async src="${supabaseUrl}/functions/v1/visitor-snippet-serve?t=${config.snippet_token}"></script>`;

  // Inject before </body>
  if (html.includes('</body>')) {
    return html.replace('</body>', `${snippetTag}\n</body>`);
  }

  // Fallback: append to end
  return html + `\n${snippetTag}`;
}
