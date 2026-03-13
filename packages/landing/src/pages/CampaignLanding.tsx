/**
 * CampaignLanding
 *
 * Resolves /t/{code} campaign links OR /t/{domain.com} creator URLs.
 *
 * Route detection:
 * - If :code contains a "." + has cid/email params → CreatorView (auth-gated)
 * - If :code contains a "." without creator params → DomainDemoView (public demo)
 * - If :code is alphanumeric (6-char base62) → prospect mode → existing flow
 *
 * CMP-004: Instant load from pre-enriched data + tracking init
 * UCR-001: Domain vs code route detection
 * UCR-002: Auth gate + query param parsing for creator view
 */

import { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, AlertCircle } from 'lucide-react';
import { SandboxExperience } from '../sandbox/SandboxExperience';
import type { ResearchData } from '../demo/demo-types';
import type { VisitorInfo } from '../sandbox/data/generatePersonalizedData';
import { generateResearchFromUrl } from '../demo/demo-data';

const CreatorView = lazy(() => import('./CreatorView'));

/** UCR-001: Domain contains a dot, campaign codes are alphanumeric base62. */
function isDomain(code: string): boolean {
  return code.includes('.');
}

export interface CampaignQueryParams {
  fn?: string;
  ln?: string;
  email?: string;
  cid?: string;
  title?: string;
}

interface CampaignLinkRow {
  id: string;
  code: string;
  visitor_first_name: string | null;
  visitor_last_name: string | null;
  visitor_email: string | null;
  visitor_title: string | null;
  visitor_company: string;
  visitor_domain: string | null;
  research_data: ResearchData | null;
  ai_content: Record<string, unknown> | null;
  campaign_name: string | null;
  status: string;
}

export default function CampaignLanding() {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();

  // UCR-001: If code is a domain, render creator view (with params) or public demo
  if (code && isDomain(code)) {
    const hasCreatorParams = searchParams.get('cid') || searchParams.get('email');
    if (hasCreatorParams) {
      const queryParams: CampaignQueryParams = {
        fn: searchParams.get('fn') || searchParams.get('f') || undefined,
        ln: searchParams.get('ln') || searchParams.get('l') || undefined,
        email: searchParams.get('email') || undefined,
        cid: searchParams.get('cid') || searchParams.get('id') || undefined,
        title: searchParams.get('title') || searchParams.get('t') || undefined,
      };

      return (
        <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
          <CreatorView domain={code} queryParams={queryParams} />
        </Suspense>
      );
    }
    // Public domain demo — no auth needed
    return <DomainDemoView domain={code} />;
  }

  // Prospect view — existing campaign link resolution
  return <ProspectView code={code} />;
}

function DomainDemoView({ domain }: { domain: string }) {
  const [loading, setLoading] = useState(true);
  const [research, setResearch] = useState<ResearchData | null>(null);

  useEffect(() => {
    // Generate instant mock data from domain, then optionally upgrade with real research
    const mockResearch = generateResearchFromUrl(domain);
    setResearch(mockResearch);
    setLoading(false);

    // Fire-and-forget: attempt real research upgrade
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (supabaseUrl && anonKey) {
      fetch(`${supabaseUrl}/functions/v1/demo-research`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ domain }),
      })
        .then(res => res.ok ? res.json() : null)
        .then(json => {
          if (json?.success && json.data) {
            setResearch(json.data);
          }
        })
        .catch(() => {});
    }
  }, [domain]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/20 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-violet-400" />
            </div>
            <div className="absolute inset-0 w-14 h-14 rounded-2xl border-2 border-violet-500/30 border-t-violet-400 animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-sm text-zinc-400 font-medium">Preparing your demo...</p>
            <p className="text-xs text-zinc-600 mt-1">Researching {domain}</p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!research) return null;

  return (
    <div className="min-h-screen bg-zinc-950">
      <SandboxExperience research={research} />
    </div>
  );
}

function ProspectView({ code }: { code: string | undefined }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [research, setResearch] = useState<ResearchData | null>(null);
  const [visitor, setVisitor] = useState<VisitorInfo | undefined>();
  const [campaignLinkId, setCampaignLinkId] = useState<string | undefined>();

  useEffect(() => {
    if (!code) {
      navigate('/');
      return;
    }

    resolveCampaignLink(code);
  }, [code, navigate]);

  function applyFallbackData() {
    const mockResearch = generateResearchFromUrl('example.com');
    setResearch(mockResearch);
    setLoading(false);
  }

  async function resolveCampaignLink(linkCode: string) {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

      if (!supabaseUrl || !anonKey) {
        applyFallbackData();
        return;
      }

      const response = await fetch(
        `${supabaseUrl}/rest/v1/campaign_links?code=eq.${linkCode}&select=id,code,visitor_first_name,visitor_last_name,visitor_email,visitor_title,visitor_company,visitor_domain,research_data,ai_content,campaign_name,status&limit=1`,
        {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
        }
      );

      if (!response.ok) {
        applyFallbackData();
        return;
      }

      const data: CampaignLinkRow[] = await response.json();

      if (!data.length || data[0].status !== 'active') {
        setError('This link has expired or is no longer available.');
        setLoading(false);
        return;
      }

      const link = data[0];

      // Store the link ID for tracking attribution
      setCampaignLinkId(link.id);

      // Set visitor info for personalized greeting
      setVisitor({
        first_name: link.visitor_first_name ?? undefined,
        last_name: link.visitor_last_name ?? undefined,
        email: link.visitor_email ?? undefined,
        title: link.visitor_title ?? undefined,
        company_name: link.visitor_company,
        domain: link.visitor_domain ?? undefined,
      });

      // Resolve research data using the priority chain:
      // 1. Pre-enriched research_data (instant load, no re-enrichment)
      // 2. Generate from domain + merge ai_content if available
      // 3. Pure fallback generation from domain
      const linkDomain =
        link.visitor_domain ||
        (link.visitor_company ? `${link.visitor_company.toLowerCase().replace(/\s+/g, '')}.com` : null);

      if (link.research_data) {
        // CMP-004: Use pre-enriched data directly - no re-enrichment needed
        // Override company name/domain from the campaign link to ensure consistency
        const enriched = { ...link.research_data };
        if (link.visitor_company && enriched.company) {
          enriched.company = {
            ...enriched.company,
            name: link.visitor_company,
            domain: linkDomain ?? enriched.company.domain,
          };
        }
        setResearch(enriched);
      } else {
        const domain = linkDomain ?? 'example.com';
        const baseResearch = generateResearchFromUrl(domain);

        // Override company name from campaign link data
        if (link.visitor_company) {
          baseResearch.company.name = link.visitor_company;
          if (linkDomain) baseResearch.company.domain = linkDomain;
        }

        if (link.ai_content) {
          const merged = mergeAiContent(baseResearch, link.ai_content);
          setResearch(merged);
        } else {
          setResearch(baseResearch);
        }
      }

      // Track the view (fire and forget)
      trackView(supabaseUrl, anonKey, link.code);

      setLoading(false);
    } catch {
      applyFallbackData();
    }
  }

  function trackView(supabaseUrl: string, anonKey: string, linkCode: string) {
    // Increment view count via RPC (fire-and-forget)
    fetch(`${supabaseUrl}/rest/v1/rpc/increment_campaign_view`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ link_code: linkCode }),
    }).catch(() => {
      // Silent fail - tracking is non-critical
    });
  }

  // Loading state: branded spinner
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/20 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-violet-400" />
            </div>
            <div className="absolute inset-0 w-14 h-14 rounded-2xl border-2 border-violet-500/30 border-t-violet-400 animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-sm text-zinc-400 font-medium">Preparing your demo...</p>
            <p className="text-xs text-zinc-600 mt-1">Personalizing your experience</p>
          </div>
        </motion.div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-5">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-sm"
        >
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-red-400" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">Link not found</h2>
          <p className="text-sm text-zinc-500 mb-6">{error}</p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-zinc-950 text-sm font-semibold hover:bg-zinc-100 transition-colors"
          >
            Try the demo
          </a>
        </motion.div>
      </div>
    );
  }

  if (!research) return null;

  return (
    <div className="min-h-screen bg-zinc-950">
      <SandboxExperience
        research={research}
        visitor={visitor}
        campaignCode={code}
        campaignLinkId={campaignLinkId}
        onSignup={() => {}}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Merge pre-generated ai_content into ResearchData.
 * ai_content may contain fields like:
 *   - cold_outreach.email_preview
 *   - meeting_prep.talking_points
 *   - pipeline_action overrides
 * We deep-merge these into the demo_actions of the base research.
 */
function mergeAiContent(
  base: ResearchData,
  aiContent: Record<string, unknown>
): ResearchData {
  const merged = { ...base };

  // Merge cold_outreach overrides
  if (aiContent.cold_outreach && typeof aiContent.cold_outreach === 'object') {
    merged.demo_actions = {
      ...merged.demo_actions,
      cold_outreach: {
        ...merged.demo_actions.cold_outreach,
        ...(aiContent.cold_outreach as Record<string, unknown>),
      } as ResearchData['demo_actions']['cold_outreach'],
    };
  }

  // Merge meeting_prep overrides
  if (aiContent.meeting_prep && typeof aiContent.meeting_prep === 'object') {
    merged.demo_actions = {
      ...merged.demo_actions,
      meeting_prep: {
        ...merged.demo_actions.meeting_prep,
        ...(aiContent.meeting_prep as Record<string, unknown>),
      } as ResearchData['demo_actions']['meeting_prep'],
    };
  }

  // Merge pipeline_action overrides
  if (aiContent.pipeline_action && typeof aiContent.pipeline_action === 'object') {
    merged.demo_actions = {
      ...merged.demo_actions,
      pipeline_action: {
        ...merged.demo_actions.pipeline_action,
        ...(aiContent.pipeline_action as Record<string, unknown>),
      } as ResearchData['demo_actions']['pipeline_action'],
    };
  }

  return merged;
}
