/**
 * Exa API Adapter
 *
 * Calls Exa's neural search API for semantic web discovery.
 * Supports date filtering for time-sensitive queries.
 */

export interface ProviderResult {
  raw_text: string;
  sources: Array<{ url: string; title: string }>;
  provider: 'perplexity' | 'exa' | 'apify_linkedin' | 'apify_maps' | 'apify_serp';
}

interface ExaSearchRequest {
  query: string;
  type: 'neural';
  contents?: {
    text?: boolean | { maxCharacters?: number };
  };
  num_results?: number;
  start_published_date?: string;
}

interface ExaSearchResult {
  url: string;
  title: string;
  text?: string;
  highlights?: string[];
  score: number;
}

interface ExaSearchResponse {
  results: ExaSearchResult[];
  autopromptString?: string;
}

/**
 * Call Exa API for semantic search and page discovery
 *
 * @param query - The semantic search query
 * @param apiKey - Exa API key
 * @param options - Optional configuration (dateFilter for time-sensitive queries)
 * @returns Normalized ProviderResult with combined text and sources
 */
export async function exaAdapter(
  query: string,
  apiKey: string,
  options?: { dateFilter?: string }
): Promise<ProviderResult> {
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30-second timeout

  try {
    const requestBody: ExaSearchRequest = {
      query,
      type: 'neural', // Use neural/semantic search mode
      contents: {
        text: true // Request page text content
      },
      num_results: 10 // Get top 10 results
    };

    // Add date filter if provided (for time-sensitive queries)
    if (options?.dateFilter) {
      requestBody.start_published_date = options.dateFilter;
    }

    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // Handle error responses
    if (!response.ok) {
      const errorText = await response.text();

      // Handle specific error cases
      if (response.status === 401 || response.status === 403) {
        throw new Error('EXA_AUTH_FAILED: Invalid API key');
      }
      if (response.status === 429) {
        throw new Error('EXA_RATE_LIMIT: Rate limit exceeded');
      }
      if (response.status >= 500) {
        throw new Error(`EXA_SERVER_ERROR: ${errorText}`);
      }

      throw new Error(`EXA_ERROR: ${response.status} - ${errorText}`);
    }

    const data: ExaSearchResponse = await response.json();

    // Validate response structure
    if (!data.results || !Array.isArray(data.results)) {
      throw new Error('EXA_INVALID_RESPONSE: No results array in response');
    }

    if (data.results.length === 0) {
      throw new Error('EXA_NO_RESULTS: Search returned no results');
    }

    // Extract and combine text content from all results
    const textSegments: string[] = [];
    const sources: Array<{ url: string; title: string }> = [];

    for (const result of data.results) {
      // Add to sources array
      sources.push({
        url: result.url,
        title: result.title || 'Untitled'
      });

      // Combine text content
      if (result.text) {
        textSegments.push(result.text);
      }

      // If highlights are available and no text, use highlights
      if (!result.text && result.highlights && result.highlights.length > 0) {
        textSegments.push(result.highlights.join(' '));
      }
    }

    // Combine all text segments into raw_text
    const raw_text = textSegments.join('\n\n---\n\n');

    if (!raw_text.trim()) {
      throw new Error('EXA_EMPTY_CONTENT: No text content extracted from results');
    }

    return {
      raw_text,
      sources,
      provider: 'exa'
    };

  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort/timeout
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('EXA_TIMEOUT: Request timed out after 30 seconds');
    }

    // Re-throw our structured errors
    if (error instanceof Error && error.message.startsWith('EXA_')) {
      throw error;
    }

    // Wrap unknown errors
    throw new Error(`EXA_UNKNOWN_ERROR: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate Exa API key format
 * Exa keys are typically longer alphanumeric strings
 */
export function validateExaKey(apiKey: string): boolean {
  return apiKey.length > 20 && /^[a-zA-Z0-9-_]+$/.test(apiKey);
}

/**
 * Format date for Exa API
 * Converts common date formats to ISO 8601 format required by Exa
 *
 * @param date - Date string or Date object
 * @returns ISO 8601 formatted date string (YYYY-MM-DD)
 */
export function formatExaDate(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    throw new Error('Invalid date provided to formatExaDate');
  }

  return dateObj.toISOString().split('T')[0]; // Returns YYYY-MM-DD
}
