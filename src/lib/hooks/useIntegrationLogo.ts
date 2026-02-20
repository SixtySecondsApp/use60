import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { getLogoDevUrl } from '@/lib/utils/logoDev';

interface LogoResponse {
  logo_url: string | null;
  cached: boolean;
  error?: string;
}

export interface UseIntegrationLogoOptions {
  /**
   * If true, calls the `fetch-company-logo` edge function in the background to
   * warm/populate the S3 cache. If false, returns the deterministic S3 URL only.
   *
   * Default: true (preserves existing behavior).
   */
  enableFetch?: boolean;
}

// Hardcoded logo URLs for integrations where logo.dev doesn't have good coverage
const HARDCODED_LOGOS: Record<string, string> = {
  teams: 'https://erg-application-logos.s3.eu-west-2.amazonaws.com/logos/microsoft-teams.png',
  'microsoft-teams': 'https://erg-application-logos.s3.eu-west-2.amazonaws.com/logos/microsoft-teams.png',
};

// Map integration names to their official domains for logo.dev lookup
const INTEGRATION_DOMAINS: Record<string, string> = {
  // Google services
  google: 'google.com',
  gmail: 'gmail.com',
  'google-calendar': 'calendar.google.com',
  'google-drive': 'drive.google.com',
  'google-tasks': 'tasks.google.com',
  'google-workspace': 'workspace.google.com',
  'google-meet': 'meet.google.com',

  // Meeting Recorders
  fathom: 'fathom.video',
  fireflies: 'fireflies.ai',
  otter: 'otter.ai',
  granola: 'granola.so',
  gong: 'gong.io',
  chorus: 'chorus.ai',
  avoma: 'avoma.com',
  grain: 'grain.com',

  // Video Conferencing
  zoom: 'zoom.us',
  teams: 'teams.live.com',
  'microsoft-teams': 'teams.live.com',
  webex: 'webex.com',

  // Calendar & Booking
  savvycal: 'savvycal.com',
  calendly: 'calendly.com',
  'cal-com': 'cal.com',
  acuity: 'acuityscheduling.com',
  doodle: 'doodle.com',
  outlook: 'outlook.com',
  'microsoft-outlook': 'outlook.com',

  // CRMs
  salesforce: 'salesforce.com',
  hubspot: 'hubspot.com',
  pipedrive: 'pipedrive.com',
  zoho: 'zoho.com',
  'zoho-crm': 'zoho.com',
  bullhorn: 'bullhorn.com',
  highlevel: 'gohighlevel.com',
  'go-highlevel': 'gohighlevel.com',
  close: 'close.com',
  'close-crm': 'close.com',
  copper: 'copper.com',
  freshsales: 'freshworks.com',
  'monday-crm': 'monday.com',
  attio: 'attio.com',
  folk: 'folk.app',

  // Dialers & Communication
  justcall: 'justcall.io',
  'just-call': 'justcall.io',
  ringover: 'ringover.com',
  cloudcall: 'cloudcall.com',
  '8x8': '8x8.com',
  aircall: 'aircall.io',
  dialpad: 'dialpad.com',
  ringcentral: 'ringcentral.com',
  vonage: 'vonage.com',
  twilio: 'twilio.com',

  // Team Communication
  slack: 'slack.com',
  discord: 'discord.com',
  intercom: 'intercom.com',
  crisp: 'crisp.chat',
  drift: 'drift.com',
  freshdesk: 'freshdesk.com',
  zendesk: 'zendesk.com',

  // Task & Project Management
  notion: 'notion.so',
  asana: 'asana.com',
  trello: 'trello.com',
  monday: 'monday.com',
  linear: 'linear.app',
  clickup: 'clickup.com',
  todoist: 'todoist.com',
  basecamp: 'basecamp.com',
  wrike: 'wrike.com',
  airtable: 'airtable.com',

  // Automation & No-Code
  zapier: 'zapier.com',
  make: 'make.com',
  integromat: 'make.com',
  n8n: 'n8n.io',
  tray: 'tray.io',
  workato: 'workato.com',
  webhooks: 'webhook.site',

  // Email Marketing & Outreach
  mailchimp: 'mailchimp.com',
  activecampaign: 'activecampaign.com',
  lemlist: 'lemlist.com',
  outreach: 'outreach.io',
  salesloft: 'salesloft.com',
  apollo: 'apollo.io',
  instantly: 'instantly.ai',
  'instantly-ai': 'instantly.ai',
  woodpecker: 'woodpecker.co',
  sendgrid: 'sendgrid.com',
  mailgun: 'mailgun.com',
  klaviyo: 'klaviyo.com',
  brevo: 'brevo.com',
  convertkit: 'convertkit.com',

  // Sales Intelligence & Data
  linkedin: 'linkedin.com',
  'linkedin-sales-navigator': 'linkedin.com',
  zoominfo: 'zoominfo.com',
  clearbit: 'clearbit.com',
  lusha: 'lusha.com',
  'seamless-ai': 'seamless.ai',
  cognism: 'cognism.com',
  leadiq: 'leadiq.com',
  hunter: 'hunter.io',
  snov: 'snov.io',

  // E-Signature & Documents
  docusign: 'docusign.com',
  pandadoc: 'pandadoc.com',
  hellosign: 'hellosign.com',
  dropboxsign: 'sign.dropbox.com',
  proposify: 'proposify.com',
  qwilr: 'qwilr.com',
  better_proposals: 'betterproposals.io',

  // Payments & Billing
  stripe: 'stripe.com',
  paypal: 'paypal.com',
  quickbooks: 'quickbooks.intuit.com',
  xero: 'xero.com',
  freshbooks: 'freshbooks.com',
  chargebee: 'chargebee.com',
  paddle: 'paddle.com',
  recurly: 'recurly.com',

  // Analytics & BI
  mixpanel: 'mixpanel.com',
  amplitude: 'amplitude.com',
  segment: 'segment.com',
  'google-analytics': 'analytics.google.com',
  posthog: 'posthog.com',
  heap: 'heap.io',
  hotjar: 'hotjar.com',
  fullstory: 'fullstory.com',
  looker: 'looker.com',
  metabase: 'metabase.com',

  // AI & Productivity
  openai: 'openai.com',
  chatgpt: 'openai.com',
  anthropic: 'anthropic.com',
  claude: 'anthropic.com',
  jasper: 'jasper.ai',
  copy_ai: 'copy.ai',
  grammarly: 'grammarly.com',

  // Storage & Files
  dropbox: 'dropbox.com',
  box: 'box.com',
  onedrive: 'onedrive.live.com',

  // Development
  github: 'github.com',
  gitlab: 'gitlab.com',
  jira: 'atlassian.com',
  bitbucket: 'bitbucket.org',

  // Customer Success
  gainsight: 'gainsight.com',
  totango: 'totango.com',
  churnzero: 'churnzero.net',
  vitally: 'vitally.io',

  // Recruiting & HR
  greenhouse: 'greenhouse.io',
  lever: 'lever.co',
  workday: 'workday.com',
  bamboohr: 'bamboohr.com',
};

// -----------------------------------------------------------------------------
// S3 logo URL helpers + in-memory caching (prevents UI flicker + request storms)
// -----------------------------------------------------------------------------

const DEFAULT_LOGOS_BUCKET = 'erg-application-logos';
const DEFAULT_AWS_REGION = 'eu-west-2';

function getLogosBucketName(): string {
  return (import.meta as any).env?.VITE_LOGOS_BUCKET_NAME || DEFAULT_LOGOS_BUCKET;
}

function getAwsRegion(): string {
  return (import.meta as any).env?.VITE_AWS_REGION || DEFAULT_AWS_REGION;
}

/**
 * Deterministic public S3 URL for a domain logo.
 * Matches the edge function key format: `logos/{domain}.png`.
 */
export function getLogoS3Url(domain: string): string {
  const normalizedDomain = domain
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .toLowerCase();

  const bucket = getLogosBucketName();
  const region = getAwsRegion();
  return `https://${bucket}.s3.${region}.amazonaws.com/logos/${normalizedDomain}.png`;
}

// Cache per normalized domain (not per integrationId) so aliases share results.
const logoUrlCache = new Map<string, string>();
const inFlightFetches = new Map<string, Promise<string | null>>();

/**
 * Hook to fetch integration logos via logo.dev API (with S3 caching)
 * @param integrationId - The integration identifier (e.g., 'slack', 'fathom', 'google-workspace')
 * @returns Logo URL or null if not available
 */
export function useIntegrationLogo(
  integrationId: string | null | undefined,
  options: UseIntegrationLogoOptions = {}
) {
  const enableFetch = options.enableFetch ?? true;
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!integrationId) {
      setLogoUrl(null);
      return;
    }

    // Get domain from mapping, or use integrationId as domain if not found
    const normalizedId = integrationId.toLowerCase().trim();

    // Check for hardcoded logos first (e.g., Microsoft Teams)
    const hardcodedUrl = HARDCODED_LOGOS[normalizedId];
    if (hardcodedUrl) {
      setLogoUrl(hardcodedUrl);
      setIsLoading(false);
      return;
    }

    const domain = INTEGRATION_DOMAINS[normalizedId] || `${normalizedId}.com`;

    if (!domain) {
      setLogoUrl(null);
      return;
    }

    const normalizedDomain = domain
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '')
      .toLowerCase();

    // Use logo.dev URL as immediate source (CloudFront CDN, reliable in browsers).
    // If we've already resolved a cached S3 URL, use that instead.
    const logoDevUrl = getLogoDevUrl(normalizedDomain);
    const cached = logoUrlCache.get(normalizedDomain);
    setLogoUrl(cached || logoDevUrl);

    // Optionally warm/populate the S3 cache via edge function.
    if (!enableFetch) return;

    setIsLoading(true);
    setError(null);

    // Dedupe requests per domain to avoid hammering the function on pages with many cards.
    const existingPromise = inFlightFetches.get(normalizedDomain);
    const promise =
      existingPromise ||
      supabase.functions
        .invoke<LogoResponse>('fetch-company-logo', {
          method: 'POST',
          body: { domain: normalizedDomain },
        })
        .then(({ data, error: fetchError }) => {
          if (fetchError) throw new Error(fetchError.message);
          return data?.logo_url || null;
        })
        .catch((err) => {
          setError(err?.message || 'Failed to fetch logo');
          return null;
        })
        .finally(() => {
          inFlightFetches.delete(normalizedDomain);
        });

    if (!existingPromise) inFlightFetches.set(normalizedDomain, promise);

    promise
      .then((url) => {
        if (!url) return;
        logoUrlCache.set(normalizedDomain, url);
        setLogoUrl(url);
      })
      .finally(() => setIsLoading(false));
  }, [integrationId]);

  return { logoUrl, isLoading, error };
}

/**
 * Get domain for an integration ID (useful for direct URL construction)
 */
export function getIntegrationDomain(integrationId: string): string {
  const normalizedId = integrationId.toLowerCase().trim();
  return INTEGRATION_DOMAINS[normalizedId] || `${normalizedId}.com`;
}

/**
 * List of available integration domain mappings
 */
export const availableIntegrations = Object.keys(INTEGRATION_DOMAINS);