/**
 * Apify Result Normalizer
 *
 * Normalizes results from different data providers (LinkedIn, Maps, SERP, Apollo, AI Ark)
 * into a consistent schema for UI display.
 */

export interface NormalizedResult {
  // Core fields (always present)
  source_provider: 'linkedin' | 'maps' | 'serp' | 'apollo' | 'ai_ark';

  // Person fields
  name?: string;
  title?: string;
  company?: string;
  location?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;

  // Company fields
  website?: string;
  industry?: string;
  employee_count?: number;
  description?: string;
  address?: string;
  rating?: number;

  // Raw data (for debugging/inspection)
  raw_data: any;
}

/**
 * Normalizes LinkedIn profile results
 */
export function normalizeLinkedInResult(raw: any): NormalizedResult {
  // LinkedIn profile structure:
  // { firstName, lastName, headline, company, location, profileUrl, ... }

  return {
    source_provider: 'linkedin',
    name: `${raw.firstName || ''} ${raw.lastName || ''}`.trim() || undefined,
    title: raw.headline || raw.occupation,
    company: raw.company?.name || raw.companyName,
    location: raw.location || raw.geoLocation,
    linkedin_url: raw.profileUrl || raw.url,
    raw_data: raw
  };
}

/**
 * Normalizes Google Maps business results
 */
export function normalizeMapsResult(raw: any): NormalizedResult {
  // Maps business structure:
  // { title, address, phone, website, rating, reviewsCount, ... }

  return {
    source_provider: 'maps',
    name: raw.title || raw.name,
    company: raw.title || raw.name, // Business name
    address: raw.address || raw.formattedAddress,
    location: raw.city || extractCity(raw.address || raw.formattedAddress),
    phone: raw.phone || raw.phoneNumber,
    website: raw.website || raw.url,
    rating: raw.rating || raw.stars,
    description: raw.description || raw.about,
    raw_data: raw
  };
}

/**
 * Normalizes Google SERP (search results) results
 */
export function normalizeSerpResult(raw: any): NormalizedResult {
  // SERP result structure:
  // { title, link, snippet, displayedLink, ... }

  return {
    source_provider: 'serp',
    name: raw.title,
    company: extractCompanyFromUrl(raw.link) || raw.displayedLink,
    website: raw.link,
    description: raw.snippet || raw.description,
    raw_data: raw
  };
}

/**
 * Normalizes Apollo contact results
 */
export function normalizeApolloResult(raw: any): NormalizedResult {
  // Apollo contact structure:
  // { first_name, last_name, title, organization_name, email, linkedin_url, ... }

  return {
    source_provider: 'apollo',
    name: `${raw.first_name || ''} ${raw.last_name || ''}`.trim() || undefined,
    title: raw.title,
    company: raw.organization_name || raw.company,
    email: raw.email,
    phone: raw.phone || raw.sanitized_phone,
    linkedin_url: raw.linkedin_url,
    location: raw.city || raw.state || raw.country,
    raw_data: raw
  };
}

/**
 * Normalizes AI Ark contact results
 */
export function normalizeAiArkResult(raw: any): NormalizedResult {
  // AI Ark deeply nested structure:
  // { profile: { first_name, title }, link: { linkedin }, location: { default }, ... }

  return {
    source_provider: 'ai_ark',
    name: `${raw.profile?.first_name || ''} ${raw.profile?.last_name || ''}`.trim() || undefined,
    title: raw.profile?.title,
    company: raw.experiences?.[0]?.company?.name,
    linkedin_url: raw.link?.linkedin,
    location: raw.location?.default,
    email: raw.contact?.email,
    phone: raw.contact?.phone,
    raw_data: raw
  };
}

/**
 * Main normalizer - auto-detects provider and normalizes result
 */
export function normalizeResult(raw: any, provider: string): NormalizedResult {
  switch (provider) {
    case 'linkedin':
      return normalizeLinkedInResult(raw);
    case 'maps':
      return normalizeMapsResult(raw);
    case 'serp':
      return normalizeSerpResult(raw);
    case 'apollo':
      return normalizeApolloResult(raw);
    case 'ai_ark':
      return normalizeAiArkResult(raw);
    default:
      // Fallback: return raw with minimal normalization
      return {
        source_provider: provider as any,
        name: raw.name || raw.title,
        raw_data: raw
      };
  }
}

/**
 * Batch normalize multiple results
 */
export function normalizeResults(results: any[], provider: string): NormalizedResult[] {
  return results.map(result => normalizeResult(result, provider));
}

// Helper utilities

/**
 * Extracts city from a full address string
 */
function extractCity(address: string | undefined): string | undefined {
  if (!address) return undefined;

  // Simple regex to extract city from address
  // Matches pattern: "..., City, ST ..."
  const match = address.match(/,\s*([^,]+),\s*[A-Z]{2}/);
  return match?.[1]?.trim();
}

/**
 * Extracts company name from a URL
 */
function extractCompanyFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;

  try {
    // Extract domain name as company name
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^/]+)/);
    const domain = match?.[1];

    if (!domain) return undefined;

    // Remove TLD and capitalize
    const name = domain
      .replace(/\.(com|io|co|net|org|ai|app|dev)$/, '')
      .split('.')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

    return name;
  } catch {
    return undefined;
  }
}
