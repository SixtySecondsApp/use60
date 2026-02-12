import { SourcePreference } from '@/lib/types/apifyQuery';
import { supabase } from '@/lib/supabase/clientV2';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProviderRanking {
  provider: SourcePreference;
  rank: number; // 1 = highest priority (0 for user-boosted)
  available: boolean;
  reason: string;
}

export interface ResolveSourceOptions {
  userPreference?: SourcePreference;
  queryType?: 'company' | 'person' | 'location';
  organizationId: string;
}

// ---------------------------------------------------------------------------
// Integration Type Mapping
// ---------------------------------------------------------------------------

/**
 * Maps integration_credentials.provider to SourcePreference
 * Note: integration_credentials uses 'apollo', 'apify', 'ai_ark' as provider names
 */
function mapIntegrationToProviders(integrationTypes: string[]): Set<SourcePreference> {
  const providers = new Set<SourcePreference>();

  for (const type of integrationTypes) {
    switch (type) {
      case 'apollo':
        providers.add('apollo');
        break;
      case 'apify':
        // Apify enables LinkedIn, Maps, and SERP
        providers.add('linkedin');
        providers.add('maps');
        providers.add('serp');
        break;
      case 'ai_ark':
        providers.add('ai_ark');
        break;
    }
  }

  return providers;
}

// ---------------------------------------------------------------------------
// Provider Ranking
// ---------------------------------------------------------------------------

/**
 * Resolves source preferences into a ranked list of providers
 * Checks integration availability per organization
 * Returns ranked provider list based on availability + user preference
 */
export async function resolveSourcePreferences(
  options: ResolveSourceOptions
): Promise<ProviderRanking[]> {
  const { userPreference, queryType, organizationId } = options;

  // ------------------------------------------------------------------
  // 1. Check which integrations are available for this org
  // ------------------------------------------------------------------
  const { data: credentials } = await supabase
    .from('integration_credentials')
    .select('provider')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .in('provider', ['apollo', 'apify', 'ai_ark']);

  const integrationTypes = credentials?.map((c) => c.provider) || [];
  const availableProviders = mapIntegrationToProviders(integrationTypes);

  // ------------------------------------------------------------------
  // 2. Build initial rankings based on query type
  // ------------------------------------------------------------------
  const rankings: ProviderRanking[] = [];

  if (queryType === 'person') {
    rankings.push(
      {
        provider: 'linkedin',
        rank: 1,
        available: availableProviders.has('linkedin'),
        reason: 'Best for people data',
      },
      {
        provider: 'apollo',
        rank: 2,
        available: availableProviders.has('apollo'),
        reason: 'Good for B2B contacts',
      },
      {
        provider: 'ai_ark',
        rank: 3,
        available: availableProviders.has('ai_ark'),
        reason: 'General people search',
      },
      {
        provider: 'serp',
        rank: 4,
        available: availableProviders.has('serp'),
        reason: 'Web fallback',
      }
    );
  } else if (queryType === 'location') {
    rankings.push(
      {
        provider: 'maps',
        rank: 1,
        available: availableProviders.has('maps'),
        reason: 'Best for location-based',
      },
      {
        provider: 'serp',
        rank: 2,
        available: availableProviders.has('serp'),
        reason: 'Local search',
      },
      {
        provider: 'apollo',
        rank: 3,
        available: availableProviders.has('apollo'),
        reason: 'Company locations',
      }
    );
  } else {
    // 'company' or default
    rankings.push(
      {
        provider: 'apollo',
        rank: 1,
        available: availableProviders.has('apollo'),
        reason: 'Best for companies',
      },
      {
        provider: 'ai_ark',
        rank: 2,
        available: availableProviders.has('ai_ark'),
        reason: 'Rich company data',
      },
      {
        provider: 'linkedin',
        rank: 3,
        available: availableProviders.has('linkedin'),
        reason: 'Company profiles',
      },
      {
        provider: 'serp',
        rank: 4,
        available: availableProviders.has('serp'),
        reason: 'Web fallback',
      }
    );
  }

  // ------------------------------------------------------------------
  // 3. If user has explicit preference, boost it to rank 0 (top)
  // ------------------------------------------------------------------
  if (userPreference) {
    const preferredIndex = rankings.findIndex((r) => r.provider === userPreference);
    if (preferredIndex > -1) {
      const [preferred] = rankings.splice(preferredIndex, 1);
      preferred.rank = 0; // Boost to top
      preferred.reason = 'User preference';
      rankings.unshift(preferred);

      // Re-rank others (shift down)
      rankings.forEach((r, i) => {
        if (i > 0) r.rank = i;
      });
    }
  }

  // ------------------------------------------------------------------
  // 4. Filter out unavailable providers (unless explicitly requested)
  // ------------------------------------------------------------------
  const filtered = userPreference
    ? rankings // Keep all if user specified (will show error if unavailable)
    : rankings.filter((r) => r.available);

  return filtered.sort((a, b) => a.rank - b.rank);
}

/**
 * Get the top N providers for execution
 * Only returns available providers
 */
export function getTopProviders(
  rankings: ProviderRanking[],
  count: number = 1
): SourcePreference[] {
  return rankings
    .filter((r) => r.available)
    .slice(0, count)
    .map((r) => r.provider);
}

/**
 * Check if a specific provider is available for this organization
 */
export async function isProviderAvailable(
  provider: SourcePreference,
  organizationId: string
): Promise<boolean> {
  const rankings = await resolveSourcePreferences({
    organizationId,
    userPreference: provider,
  });

  const ranking = rankings.find((r) => r.provider === provider);
  return ranking?.available || false;
}

/**
 * Get a human-readable reason why a provider is unavailable
 */
export function getProviderUnavailableReason(provider: SourcePreference): string {
  switch (provider) {
    case 'apollo':
      return 'Apollo integration not configured. Add API key in Settings.';
    case 'ai_ark':
      return 'AI Ark integration not configured. Add API key in Settings.';
    case 'linkedin':
    case 'maps':
    case 'serp':
      return 'Apify integration not configured. Add API key in Settings.';
    default:
      return 'Integration not available.';
  }
}
