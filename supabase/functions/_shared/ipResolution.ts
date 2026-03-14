// supabase/functions/_shared/ipResolution.ts
// Provider-agnostic IP-to-Company resolution service

export interface CompanyResolution {
  companyName: string | null;
  companyDomain: string | null;
  companyData: Record<string, unknown> | null;
  resolutionStatus: 'resolved' | 'unresolvable' | 'residential';
  provider: string;
}

interface PDLIPResponse {
  status: number;
  data?: {
    name?: string;
    website?: string;
    display_name?: string;
    industry?: string;
    size?: string;
    location?: {
      country?: string;
      region?: string;
      locality?: string;
    };
    employee_count?: number;
    founded?: number;
    linkedin_url?: string;
    type?: string; // 'business', 'isp', 'education', etc.
  };
  error?: { message?: string };
}

/**
 * Resolve an IP address to a company using People Data Labs.
 */
async function resolvePDL(ip: string): Promise<CompanyResolution> {
  const apiKey = Deno.env.get('PEOPLE_DATA_LABS_API_KEY');
  if (!apiKey) {
    console.error('[ipResolution] PEOPLE_DATA_LABS_API_KEY not set');
    return { companyName: null, companyDomain: null, companyData: null, resolutionStatus: 'unresolvable', provider: 'pdl' };
  }

  const url = `https://api.peopledatalabs.com/v5/ip/enrich?ip=${encodeURIComponent(ip)}`;
  const resp = await fetch(url, {
    headers: {
      'X-Api-Key': apiKey,
      'Accept': 'application/json',
    },
  });

  if (!resp.ok) {
    console.warn(`[ipResolution] PDL API error: ${resp.status} ${resp.statusText}`);
    if (resp.status === 404) {
      return { companyName: null, companyDomain: null, companyData: null, resolutionStatus: 'unresolvable', provider: 'pdl' };
    }
    throw new Error(`PDL API error: ${resp.status}`);
  }

  const result: PDLIPResponse = await resp.json();

  if (!result.data) {
    return { companyName: null, companyDomain: null, companyData: null, resolutionStatus: 'unresolvable', provider: 'pdl' };
  }

  // ISP / residential IPs — no company match
  const ipType = result.data.type?.toLowerCase();
  if (ipType === 'isp' || ipType === 'residential' || ipType === 'mobile') {
    return {
      companyName: null,
      companyDomain: null,
      companyData: result.data as Record<string, unknown>,
      resolutionStatus: 'residential',
      provider: 'pdl',
    };
  }

  const companyName = result.data.display_name || result.data.name || null;
  const companyDomain = result.data.website?.replace(/^https?:\/\//, '').replace(/\/$/, '') || null;

  if (!companyName && !companyDomain) {
    return { companyName: null, companyDomain: null, companyData: result.data as Record<string, unknown>, resolutionStatus: 'unresolvable', provider: 'pdl' };
  }

  return {
    companyName,
    companyDomain,
    companyData: result.data as Record<string, unknown>,
    resolutionStatus: 'resolved',
    provider: 'pdl',
  };
}

/**
 * Provider-agnostic IP resolution. Dispatches to the correct adapter.
 */
export async function resolveIPToCompany(ip: string, provider = 'pdl'): Promise<CompanyResolution> {
  switch (provider) {
    case 'pdl':
      return resolvePDL(ip);
    default:
      console.warn(`[ipResolution] Unknown provider: ${provider}, falling back to PDL`);
      return resolvePDL(ip);
  }
}

/**
 * Extract real client IP from request headers.
 * Checks Cloudflare, standard proxy, and fallback headers.
 */
export function extractClientIP(req: Request): string | null {
  // Cloudflare
  const cfIP = req.headers.get('cf-connecting-ip');
  if (cfIP) return cfIP.trim();

  // Standard proxy headers
  const xForwardedFor = req.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const firstIP = xForwardedFor.split(',')[0].trim();
    if (firstIP) return firstIP;
  }

  const xRealIP = req.headers.get('x-real-ip');
  if (xRealIP) return xRealIP.trim();

  return null;
}
