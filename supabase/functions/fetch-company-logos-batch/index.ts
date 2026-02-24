/**
 * Edge Function: fetch-company-logos-batch
 *
 * Batch-fetches company logos for multiple domains in a single request.
 * Uses Clearbit Logo API (free, no key) with Google Favicon fallback.
 * Caches results in the companies table logo_url column.
 *
 * Request: { domains: string[] }
 * Response: { logos: Record<string, string> }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

/**
 * Normalize domain for consistent lookups
 */
function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .split('/')[0];
}

/**
 * Fetch logo from Clearbit (free, no API key)
 */
async function fetchClearbitLogo(domain: string): Promise<string | null> {
  try {
    const url = `https://logo.clearbit.com/${domain}`;
    const response = await fetch(url, { method: 'HEAD' });

    if (response.ok) {
      return url;
    }

    return null;
  } catch (error) {
    console.error(`[Clearbit] Failed for ${domain}:`, error);
    return null;
  }
}

/**
 * Fetch logo from Google Favicon API (fallback)
 */
function getGoogleFavicon(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

/**
 * Fetch a single logo with fallback chain
 */
async function fetchLogo(domain: string): Promise<string> {
  // Try Clearbit first
  const clearbitLogo = await fetchClearbitLogo(domain);
  if (clearbitLogo) {
    return clearbitLogo;
  }

  // Fallback to Google Favicon
  return getGoogleFavicon(domain);
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Create user-scoped Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    );

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', detail: authError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { domains } = await req.json();

    if (!Array.isArray(domains) || domains.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: domains must be a non-empty array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize domains
    const normalizedDomains = domains.map(normalizeDomain).filter(Boolean);

    if (normalizedDomains.length === 0) {
      return new Response(
        JSON.stringify({ logos: {} }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for existing logos in companies table (user-scoped, respects RLS)
    const { data: existingCompanies } = await supabase
      .from('companies')
      .select('website, logo_url')
      .not('logo_url', 'is', null)
      .in('website', normalizedDomains);

    // Build result map with cached logos
    const logoMap: Record<string, string> = {};
    const cachedDomains = new Set<string>();

    if (existingCompanies) {
      for (const company of existingCompanies) {
        if (company.website && company.logo_url) {
          const normalized = normalizeDomain(company.website);
          logoMap[normalized] = company.logo_url;
          cachedDomains.add(normalized);
        }
      }
    }

    // Fetch missing logos in parallel (max 50 concurrent to avoid rate limits)
    const missingDomains = normalizedDomains.filter(d => !cachedDomains.has(d));
    const batchSize = 50;

    for (let i = 0; i < missingDomains.length; i += batchSize) {
      const batch = missingDomains.slice(i, i + batchSize);

      const results = await Promise.all(
        batch.map(async (domain) => {
          const logo = await fetchLogo(domain);
          return { domain, logo };
        })
      );

      // Add to result map
      for (const { domain, logo } of results) {
        logoMap[domain] = logo;
      }

      // Cache in companies table (user-scoped, respects RLS)
      // Only update if company exists for this user
      for (const { domain, logo } of results) {
        await supabase
          .from('companies')
          .update({ logo_url: logo })
          .eq('website', domain)
          .is('logo_url', null); // Only update if not already set
      }
    }

    return new Response(
      JSON.stringify({ logos: logoMap }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[fetch-company-logos-batch] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        detail: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
