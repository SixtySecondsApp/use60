/**
 * useCompanyLogoBatch Hook
 *
 * React Query hook that batch-fetches company logos for all domains in the pipeline.
 * Eliminates per-card queries by loading all logos upfront in a single request.
 *
 * Usage:
 * const domains = deals.map(d => extractDomain(d.company)).filter(Boolean);
 * const { data: logoMap } = useCompanyLogoBatch(domains);
 * const logo = logoMap.get(normalizedDomain);
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';

/**
 * Normalize a domain for consistent lookups
 * - Remove www. prefix
 * - Lowercase
 * - Trim trailing slash
 */
export function normalizeDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;

  let normalized = domain.trim().toLowerCase();

  // Remove protocol if present
  normalized = normalized.replace(/^https?:\/\//, '');

  // Remove www. prefix
  normalized = normalized.replace(/^www\./, '');

  // Remove trailing slash
  normalized = normalized.replace(/\/$/, '');

  // Remove path (keep only domain)
  normalized = normalized.split('/')[0];

  return normalized || null;
}

/**
 * Extract domain from company name or URL
 */
export function extractDomain(company: string | null | undefined): string | null {
  if (!company) return null;

  // If it looks like a URL, parse it
  if (company.includes('.') || company.includes('http')) {
    return normalizeDomain(company);
  }

  // Otherwise, construct a domain from the company name
  // e.g., "Acme Corp" -> "acmecorp.com"
  const slug = company
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '') // Remove non-alphanumeric
    .trim();

  return slug ? `${slug}.com` : null;
}

/**
 * Batch-fetch company logos for multiple domains
 */
export function useCompanyLogoBatch(domains: (string | null | undefined)[]) {
  // Normalize and dedupe domains
  const normalizedDomains = Array.from(
    new Set(
      domains
        .map(normalizeDomain)
        .filter((d): d is string => !!d)
    )
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['companyLogos', [...normalizedDomains].sort().join(',')],
    queryFn: async (): Promise<Map<string, string>> => {
      if (normalizedDomains.length === 0) {
        return new Map();
      }

      try {
        const { data, error } = await supabase.functions.invoke(
          'fetch-company-logos-batch',
          {
            body: { domains: normalizedDomains },
          }
        );

        if (error) {
          console.error('[useCompanyLogoBatch] Edge function error:', error);
          return new Map();
        }

        // Convert object to Map for efficient lookups
        const logos = data?.logos || {};
        return new Map(Object.entries(logos));
      } catch (err) {
        console.error('[useCompanyLogoBatch] Request failed:', err);
        return new Map();
      }
    },
    enabled: normalizedDomains.length > 0,
    staleTime: 24 * 60 * 60 * 1000, // 24h cache
    gcTime: 24 * 60 * 60 * 1000, // 24h garbage collection
    refetchOnWindowFocus: false, // Logos don't change frequently
    retry: 1, // Only retry once on failure
  });

  return {
    data: data || new Map<string, string>(),
    isLoading,
    error,
    refetch,
  };
}

/**
 * Helper hook to get a single logo from batched data
 */
export function useCompanyLogo(
  company: string | null | undefined,
  logoMap: Map<string, string>
): string | null {
  const domain = extractDomain(company);
  if (!domain) return null;

  const normalized = normalizeDomain(domain);
  if (!normalized) return null;

  return logoMap.get(normalized) || null;
}
