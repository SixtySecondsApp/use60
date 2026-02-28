// supabase/functions/landing-research/index.ts
// Auto-research for the Landing Page Builder: company, competitors, social proof, market context
// Runs 5 parallel queries (4 Gemini Search-grounded + 1 Exa enrichment) with 12s timeout

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { executeExaSearch } from '../_shared/exaSearch.ts';
import { logAICostEvent } from '../_shared/costTracking.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResearchRequest {
  brief: Record<string, string>;
  company_domain?: string;
  company_name?: string;
  org_id?: string;
}

interface CompanyProfile {
  company_name: string;
  description: string;
  industry: string;
  differentiators: string[];
  products: string[];
  customer_segments: string[];
  pricing_approach: string;
}

interface CompetitorEntry {
  name: string;
  website: string;
  tagline: string;
  positioning: string;
  landing_page_patterns: string[];
}

interface SocialProofData {
  social_proof: string[];
  review_site_ratings: string[];
  notable_customers: string[];
}

interface MarketTrendsData {
  market_trends: string[];
  audience_pain_language: string[];
  pricing_benchmarks: string[];
  buying_triggers: string[];
}

interface ResearchSource {
  title: string;
  url: string;
  provider: string;
}

// ---------------------------------------------------------------------------
// Gemini Search helper
// ---------------------------------------------------------------------------

async function geminiSearchQuery<T>(
  apiKey: string,
  query: string,
  responseSchema: Record<string, unknown>,
): Promise<{ result: T | null; sources: ResearchSource[]; inputTokens: number; outputTokens: number }> {
  const prompt = `${query}\n\nReturn JSON matching this schema:\n${JSON.stringify(responseSchema, null, 2)}\n\nReturn ONLY valid JSON, no markdown formatting.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
        tools: [{ googleSearch: {} }],
      }),
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Gemini API error: ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Extract sources from grounding metadata
  const sources: ResearchSource[] = [];
  const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
  if (groundingMetadata?.groundingChunks) {
    for (const chunk of groundingMetadata.groundingChunks) {
      if (chunk.web) {
        sources.push({ title: chunk.web.title || '', url: chunk.web.uri || '', provider: 'gemini-search' });
      }
    }
  }

  const inputTokens = data.usageMetadata?.promptTokenCount || 0;
  const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;

  if (!text) return { result: null, sources, inputTokens, outputTokens };

  try {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
    return { result: JSON.parse(jsonStr) as T, sources, inputTokens, outputTokens };
  } catch {
    console.warn('[landing-research] Failed to parse Gemini JSON response');
    return { result: null, sources, inputTokens, outputTokens };
  }
}

// ---------------------------------------------------------------------------
// Build search queries from brief
// ---------------------------------------------------------------------------

function buildSearchContext(brief: Record<string, string>, companyName?: string, companyDomain?: string): string {
  const parts: string[] = [];
  if (companyName) parts.push(`Company: ${companyName}`);
  if (companyDomain) parts.push(`Website: ${companyDomain}`);
  if (brief.offer) parts.push(`Product/Offer: ${brief.offer}`);
  if (brief.audience) parts.push(`Target Audience: ${brief.audience}`);
  if (brief.goal) parts.push(`Goal: ${brief.goal}`);
  if (brief.outcome) parts.push(`Key Outcome: ${brief.outcome}`);
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  // CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  try {
    // Auth
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return errorResponse('Unauthorized', req, 401);
    }

    const body: ResearchRequest = await req.json();
    const { brief, company_domain, company_name, org_id } = body;

    if (!brief || Object.keys(brief).length === 0) {
      return errorResponse('brief is required', req);
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      return errorResponse('GEMINI_API_KEY not configured', req, 500);
    }

    const startTime = performance.now();
    const searchContext = buildSearchContext(brief, company_name, company_domain);
    const allSources: ResearchSource[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    console.log(`[landing-research] Starting research for: ${company_name || brief.offer || 'unknown'}`);

    // -----------------------------------------------------------------------
    // Run 5 queries in parallel with 12s timeout
    // -----------------------------------------------------------------------

    const TIMEOUT_MS = 12_000;

    const withTimeout = <T>(promise: Promise<T>, label: string): Promise<T | null> =>
      Promise.race([
        promise,
        new Promise<null>((resolve) =>
          setTimeout(() => {
            console.warn(`[landing-research] ${label} timed out after ${TIMEOUT_MS}ms`);
            resolve(null);
          }, TIMEOUT_MS),
        ),
      ]);

    const [companyResult, competitorsResult, socialProofResult, marketResult, exaResult] =
      await Promise.allSettled([
        // Query 1: Company profile + positioning
        withTimeout(
          geminiSearchQuery<CompanyProfile>(
            GEMINI_API_KEY,
            `Research this company and describe their market positioning:\n${searchContext}\n\nFind: company description, industry, key differentiators, products/services, customer segments, and pricing approach (freemium, enterprise sales, self-serve, etc.)`,
            {
              company_name: 'string',
              description: 'string',
              industry: 'string',
              differentiators: ['string'],
              products: ['string'],
              customer_segments: ['string'],
              pricing_approach: 'string',
            },
          ),
          'company-profile',
        ),

        // Query 2: Competitor landing pages
        withTimeout(
          geminiSearchQuery<{ competitors: CompetitorEntry[] }>(
            GEMINI_API_KEY,
            `Find the top 3-5 competitors for this company and analyze their landing pages:\n${searchContext}\n\nFor each competitor, find: their name, website URL, main tagline, positioning statement, and notable landing page patterns (e.g. "video hero", "social proof above fold", "interactive demo", "comparison table").`,
            {
              competitors: [
                {
                  name: 'string',
                  website: 'string',
                  tagline: 'string',
                  positioning: 'string',
                  landing_page_patterns: ['string'],
                },
              ],
            },
          ),
          'competitor-pages',
        ),

        // Query 3: Case studies + social proof
        withTimeout(
          geminiSearchQuery<SocialProofData>(
            GEMINI_API_KEY,
            `Find real social proof, case studies, and review site ratings for this company:\n${searchContext}\n\nLook for: specific metrics from case studies, G2/Capterra/Trustpilot ratings and review snippets, notable customer logos or company names using the product. Only include real, verifiable proof points.`,
            {
              social_proof: ['string'],
              review_site_ratings: ['string'],
              notable_customers: ['string'],
            },
          ),
          'social-proof',
        ),

        // Query 4: Market trends + audience language
        withTimeout(
          geminiSearchQuery<MarketTrendsData>(
            GEMINI_API_KEY,
            `Research the market landscape and audience language for this company's space:\n${searchContext}\n\nFind: current industry trends, phrases and language the target audience actually uses when describing their problems, pricing benchmarks for similar solutions, and what triggers this audience to buy now.`,
            {
              market_trends: ['string'],
              audience_pain_language: ['string'],
              pricing_benchmarks: ['string'],
              buying_triggers: ['string'],
            },
          ),
          'market-trends',
        ),

        // Query 5: Exa structured enrichment
        withTimeout(
          company_domain
            ? executeExaSearch(company_domain)
            : Promise.resolve(null),
          'exa-enrichment',
        ),
      ]);

    // -----------------------------------------------------------------------
    // Assemble results (partial is OK)
    // -----------------------------------------------------------------------

    // Company profile
    let company = null;
    if (companyResult.status === 'fulfilled' && companyResult.value?.result) {
      const r = companyResult.value;
      company = r.result;
      allSources.push(...r.sources);
      totalInputTokens += r.inputTokens;
      totalOutputTokens += r.outputTokens;
    }

    // Competitors
    let competitors: CompetitorEntry[] = [];
    if (competitorsResult.status === 'fulfilled' && competitorsResult.value?.result) {
      const r = competitorsResult.value;
      competitors = r.result.competitors || [];
      allSources.push(...r.sources);
      totalInputTokens += r.inputTokens;
      totalOutputTokens += r.outputTokens;
    }

    // Social proof
    let socialProof: string[] = [];
    let reviewRatings: string[] = [];
    let notableCustomers: string[] = [];
    if (socialProofResult.status === 'fulfilled' && socialProofResult.value?.result) {
      const r = socialProofResult.value;
      const sp = r.result;
      socialProof = sp.social_proof || [];
      reviewRatings = sp.review_site_ratings || [];
      notableCustomers = sp.notable_customers || [];
      allSources.push(...r.sources);
      totalInputTokens += r.inputTokens;
      totalOutputTokens += r.outputTokens;
    }

    // Market trends
    let marketTrends: string[] = [];
    let audienceLanguage: string[] = [];
    let pricingSignals: string[] = [];
    let buyingTriggers: string[] = [];
    if (marketResult.status === 'fulfilled' && marketResult.value?.result) {
      const r = marketResult.value;
      const mt = r.result;
      marketTrends = mt.market_trends || [];
      audienceLanguage = mt.audience_pain_language || [];
      pricingSignals = mt.pricing_benchmarks || [];
      buyingTriggers = mt.buying_triggers || [];
      allSources.push(...r.sources);
      totalInputTokens += r.inputTokens;
      totalOutputTokens += r.outputTokens;
    }

    // Exa enrichment — merge competitor + company data
    if (exaResult.status === 'fulfilled' && exaResult.value) {
      const exa = exaResult.value as { result: any; cost: number; error: string | null };
      if (exa.result) {
        // Merge Exa competitors if we don't already have them
        if (competitors.length === 0 && exa.result.key_competitors?.length) {
          competitors = exa.result.key_competitors.map((name: string) => ({
            name,
            website: '',
            tagline: '',
            positioning: '',
            landing_page_patterns: [],
          }));
        }
        // Backfill company data from Exa if Gemini didn't return it
        if (!company && exa.result.company_name) {
          company = {
            company_name: exa.result.company_name,
            description: exa.result.description || '',
            industry: exa.result.industry || '',
            differentiators: exa.result.competitive_differentiators || [],
            products: exa.result.products_services || [],
            customer_segments: exa.result.customer_segments || [],
            pricing_approach: '',
          };
        }
        allSources.push({ title: `Exa enrichment: ${company_domain}`, url: `https://${company_domain}`, provider: 'exa' });
      }
    }

    // Competitor messaging patterns (extracted from landing page patterns)
    const messagingPatterns = competitors
      .flatMap((c) => c.landing_page_patterns || [])
      .filter(Boolean)
      .slice(0, 10);

    const durationMs = Math.round(performance.now() - startTime);

    // Gemini 3 Flash pricing: $0.10/1M input, $0.30/1M output
    const geminiCost = (totalInputTokens / 1_000_000) * 0.10 + (totalOutputTokens / 1_000_000) * 0.30;
    const exaCost = company_domain ? 0.006 : 0; // Exa + Gemini extraction
    const totalCost = geminiCost + exaCost;
    const costCredits = Math.ceil(totalCost / 0.10 * 10) / 10; // Round to 0.1 credits

    // Log cost
    await logAICostEvent(
      supabase,
      user.id,
      org_id || null,
      'gemini',
      'gemini-3-flash-preview',
      totalInputTokens,
      totalOutputTokens,
      'landing-research',
      { company: company_name || brief.offer, queries: 5 },
    );

    console.log(
      `[landing-research] Completed in ${durationMs}ms — ` +
      `company: ${!!company}, competitors: ${competitors.length}, ` +
      `social_proof: ${socialProof.length}, sources: ${allSources.length}, ` +
      `cost: $${totalCost.toFixed(4)}`,
    );

    const researchData = {
      status: 'complete' as const,
      company: company
        ? {
            name: company.company_name || company_name || '',
            description: company.description || '',
            industry: company.industry || '',
            differentiators: company.differentiators || [],
            products: company.products || [],
            customer_segments: company.customer_segments || [],
            pricing_approach: company.pricing_approach || '',
          }
        : null,
      competitors,
      market_context: {
        messaging_patterns: messagingPatterns,
        social_proof_examples: socialProof,
        pricing_signals: pricingSignals,
        audience_language: audienceLanguage,
        market_trends: marketTrends,
        buying_triggers: buyingTriggers,
        review_ratings: reviewRatings,
        notable_customers: notableCustomers,
      },
      sources: allSources.slice(0, 20), // Cap sources
      cost_credits: costCredits,
      duration_ms: durationMs,
    };

    return jsonResponse(researchData, req);
  } catch (error) {
    console.error('[landing-research] Error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Unknown error occurred',
      req,
      500,
    );
  }
});
