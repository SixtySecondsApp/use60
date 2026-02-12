/**
 * Apify API Adapters
 *
 * Provides adapters for Apify actors:
 * - LinkedIn profile/company scraper
 * - Google Maps business scraper
 * - Google SERP scraper
 *
 * All adapters use synchronous mode with 60-second timeout.
 */

export interface ProviderResult {
  raw_text: string;
  sources: Array<{ url: string; title: string }>;
  provider: 'perplexity' | 'exa' | 'apify_linkedin' | 'apify_maps' | 'apify_serp';
}

// Apify Actor IDs for different scrapers
const APIFY_ACTORS = {
  linkedin: 'apify/linkedin-profile-scraper',
  maps: 'nwua9Gu5YrADL7ZDj', // Google Maps Scraper
  serp: 'apify/google-search-scraper'
} as const;

interface ApifyRunResponse {
  data: {
    id: string;
    status: string;
    defaultDatasetId: string;
  };
}

interface ApifyDatasetItem {
  // LinkedIn fields
  profileUrl?: string;
  fullName?: string;
  headline?: string;
  location?: string;
  summary?: string;
  experience?: Array<{ title: string; company: string; description?: string }>;
  education?: Array<{ school: string; degree?: string }>;
  skills?: string[];

  // Maps fields
  title?: string;
  address?: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewsCount?: number;
  categoryName?: string;
  description?: string;
  url?: string;
  placeId?: string;

  // SERP fields
  searchQuery?: string;
  organicResults?: Array<{
    title: string;
    url: string;
    description: string;
    position: number;
  }>;
  relatedSearches?: string[];
  peopleAlsoAsk?: Array<{
    question: string;
    answer: string;
  }>;
}

/**
 * Call Apify actor and wait for results (synchronous mode)
 */
async function runApifyActor(
  actorId: string,
  input: Record<string, unknown>,
  apiKey: string,
  timeout = 60
): Promise<ApifyDatasetItem[]> {
  // Step 1: Start the actor run with synchronous wait
  const runResponse = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/runs?token=${apiKey}&waitForFinish=${timeout}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    }
  );

  if (!runResponse.ok) {
    const errorText = await runResponse.text();

    // Handle specific error cases
    if (runResponse.status === 401) {
      throw new Error('APIFY_AUTH_FAILED: Invalid API token');
    }
    if (runResponse.status === 429) {
      throw new Error('APIFY_RATE_LIMIT: Rate limit exceeded');
    }
    if (runResponse.status === 404) {
      throw new Error(`APIFY_ACTOR_NOT_FOUND: Actor ${actorId} not found`);
    }
    if (runResponse.status >= 500) {
      throw new Error(`APIFY_SERVER_ERROR: ${errorText}`);
    }

    throw new Error(`APIFY_ERROR: ${runResponse.status} - ${errorText}`);
  }

  const runData: ApifyRunResponse = await runResponse.json();

  // Check run status
  if (runData.data.status === 'TIMEOUT' || runData.data.status === 'TIMED-OUT') {
    throw new Error('APIFY_TIMEOUT: Actor run timed out after 60 seconds');
  }

  if (runData.data.status === 'FAILED') {
    throw new Error('APIFY_RUN_FAILED: Actor run failed');
  }

  if (runData.data.status !== 'SUCCEEDED') {
    throw new Error(`APIFY_UNEXPECTED_STATUS: Actor finished with status ${runData.data.status}`);
  }

  // Step 2: Fetch results from the dataset
  const datasetId = runData.data.defaultDatasetId;
  const datasetResponse = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey}&format=json`,
    { method: 'GET' }
  );

  if (!datasetResponse.ok) {
    throw new Error(`APIFY_DATASET_ERROR: Failed to fetch dataset items (${datasetResponse.status})`);
  }

  const items: ApifyDatasetItem[] = await datasetResponse.json();
  return items;
}

/**
 * LinkedIn Profile/Company Scraper
 *
 * @param linkedinUrl - Full LinkedIn URL (profile or company page)
 * @param apiKey - Apify API token
 * @returns Normalized ProviderResult with profile/company data
 */
export async function apifyLinkedInAdapter(
  linkedinUrl: string,
  apiKey: string
): Promise<ProviderResult> {
  try {
    const input = {
      urls: [linkedinUrl],
      // Additional options for better data quality
      sessionCookieValue: '', // Can be provided for better rate limits
      proxyConfiguration: {
        useApifyProxy: true,
        apifyProxyGroups: ['RESIDENTIAL']
      }
    };

    const results = await runApifyActor(APIFY_ACTORS.linkedin, input, apiKey);

    if (!results || results.length === 0) {
      throw new Error('APIFY_LINKEDIN_EMPTY: No data returned from LinkedIn scraper');
    }

    const profile = results[0];

    // Build structured text from LinkedIn data
    const textParts: string[] = [];

    if (profile.fullName) {
      textParts.push(`Name: ${profile.fullName}`);
    }

    if (profile.headline) {
      textParts.push(`Headline: ${profile.headline}`);
    }

    if (profile.location) {
      textParts.push(`Location: ${profile.location}`);
    }

    if (profile.summary) {
      textParts.push(`\nSummary:\n${profile.summary}`);
    }

    if (profile.experience && profile.experience.length > 0) {
      textParts.push('\nExperience:');
      profile.experience.forEach(exp => {
        textParts.push(`- ${exp.title} at ${exp.company}`);
        if (exp.description) {
          textParts.push(`  ${exp.description}`);
        }
      });
    }

    if (profile.education && profile.education.length > 0) {
      textParts.push('\nEducation:');
      profile.education.forEach(edu => {
        const degree = edu.degree ? `${edu.degree}, ` : '';
        textParts.push(`- ${degree}${edu.school}`);
      });
    }

    if (profile.skills && profile.skills.length > 0) {
      textParts.push(`\nSkills: ${profile.skills.slice(0, 10).join(', ')}`);
    }

    const raw_text = textParts.join('\n');

    return {
      raw_text,
      sources: [{
        url: profile.profileUrl || linkedinUrl,
        title: profile.fullName || 'LinkedIn Profile'
      }],
      provider: 'apify_linkedin'
    };

  } catch (error) {
    // Re-throw our structured errors
    if (error instanceof Error && error.message.startsWith('APIFY_')) {
      throw error;
    }

    // Wrap unknown errors
    throw new Error(`APIFY_LINKEDIN_ERROR: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Google Maps Business Scraper
 *
 * @param businessName - Business name or search query
 * @param location - Location/city to search in (e.g., "San Francisco, CA")
 * @param apiKey - Apify API token
 * @returns Normalized ProviderResult with business data
 */
export async function apifyMapsAdapter(
  businessName: string,
  location: string,
  apiKey: string
): Promise<ProviderResult> {
  try {
    const input = {
      searchStringsArray: [`${businessName} ${location}`],
      maxCrawledPlacesPerSearch: 1, // We just want the top result
      language: 'en',
      maxReviews: 0, // Don't fetch reviews to save time
      maxImages: 0, // Don't fetch images
      exportPlaceUrls: true,
      includeWebResults: false
    };

    const results = await runApifyActor(APIFY_ACTORS.maps, input, apiKey);

    if (!results || results.length === 0) {
      throw new Error('APIFY_MAPS_EMPTY: No business found matching the query');
    }

    const business = results[0];

    // Build structured text from Maps data
    const textParts: string[] = [];

    if (business.title) {
      textParts.push(`Business: ${business.title}`);
    }

    if (business.categoryName) {
      textParts.push(`Category: ${business.categoryName}`);
    }

    if (business.address) {
      textParts.push(`Address: ${business.address}`);
    }

    if (business.phone) {
      textParts.push(`Phone: ${business.phone}`);
    }

    if (business.website) {
      textParts.push(`Website: ${business.website}`);
    }

    if (business.rating) {
      const reviewText = business.reviewsCount ? ` (${business.reviewsCount} reviews)` : '';
      textParts.push(`Rating: ${business.rating}/5${reviewText}`);
    }

    if (business.description) {
      textParts.push(`\nDescription:\n${business.description}`);
    }

    const raw_text = textParts.join('\n');

    return {
      raw_text,
      sources: [{
        url: business.url || `https://www.google.com/maps/search/${encodeURIComponent(businessName + ' ' + location)}`,
        title: business.title || businessName
      }],
      provider: 'apify_maps'
    };

  } catch (error) {
    // Re-throw our structured errors
    if (error instanceof Error && error.message.startsWith('APIFY_')) {
      throw error;
    }

    // Wrap unknown errors
    throw new Error(`APIFY_MAPS_ERROR: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Google SERP Scraper
 *
 * @param searchQuery - Google search query
 * @param apiKey - Apify API token
 * @returns Normalized ProviderResult with search results
 */
export async function apifySerpAdapter(
  searchQuery: string,
  apiKey: string
): Promise<ProviderResult> {
  try {
    const input = {
      queries: [searchQuery],
      maxPagesPerQuery: 1, // Just first page of results
      resultsPerPage: 10,
      mobileResults: false,
      languageCode: 'en',
      includeUnfilteredResults: false
    };

    const results = await runApifyActor(APIFY_ACTORS.serp, input, apiKey);

    if (!results || results.length === 0) {
      throw new Error('APIFY_SERP_EMPTY: No search results returned');
    }

    const serpData = results[0];
    const textParts: string[] = [];
    const sources: Array<{ url: string; title: string }> = [];

    // Add organic search results
    if (serpData.organicResults && serpData.organicResults.length > 0) {
      textParts.push(`Search results for: "${searchQuery}"\n`);

      serpData.organicResults.forEach((result, idx) => {
        textParts.push(`${idx + 1}. ${result.title}`);
        textParts.push(`   ${result.description}`);
        textParts.push(`   URL: ${result.url}\n`);

        // Add to sources
        sources.push({
          url: result.url,
          title: result.title
        });
      });
    }

    // Add People Also Ask section
    if (serpData.peopleAlsoAsk && serpData.peopleAlsoAsk.length > 0) {
      textParts.push('\nPeople Also Ask:');
      serpData.peopleAlsoAsk.forEach(paa => {
        textParts.push(`Q: ${paa.question}`);
        textParts.push(`A: ${paa.answer}\n`);
      });
    }

    // Add Related Searches
    if (serpData.relatedSearches && serpData.relatedSearches.length > 0) {
      textParts.push('\nRelated Searches:');
      textParts.push(serpData.relatedSearches.join(', '));
    }

    const raw_text = textParts.join('\n');

    return {
      raw_text,
      sources,
      provider: 'apify_serp'
    };

  } catch (error) {
    // Re-throw our structured errors
    if (error instanceof Error && error.message.startsWith('APIFY_')) {
      throw error;
    }

    // Wrap unknown errors
    throw new Error(`APIFY_SERP_ERROR: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate Apify API token format
 * Apify tokens typically start with 'apify_api_'
 */
export function validateApifyToken(apiKey: string): boolean {
  return apiKey.startsWith('apify_api_') && apiKey.length > 20;
}
