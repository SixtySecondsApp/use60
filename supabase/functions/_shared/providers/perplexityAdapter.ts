/**
 * Perplexity API Adapter
 *
 * Calls Perplexity's Sonar API for general web research questions.
 * Supports different depth levels with appropriate model selection.
 */

export interface ProviderResult {
  raw_text: string;
  sources: Array<{ url: string; title: string }>;
  provider: 'perplexity' | 'exa' | 'apify_linkedin' | 'apify_maps' | 'apify_serp';
}

interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface PerplexityRequest {
  model: string;
  messages: PerplexityMessage[];
  temperature?: number;
  max_tokens?: number;
}

interface PerplexityResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  citations?: string[];
}

/**
 * Call Perplexity API for web research
 *
 * @param query - The research question
 * @param depth - Research depth: 'low' (sonar), 'medium' (sonar), 'high' (sonar-pro)
 * @param apiKey - Perplexity API key
 * @returns Normalized ProviderResult with text and sources
 */
export async function perplexityAdapter(
  query: string,
  depth: 'low' | 'medium' | 'high',
  apiKey: string
): Promise<ProviderResult> {
  // Select model based on depth
  const model = depth === 'high' ? 'sonar-pro' : 'sonar';

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30-second timeout

  try {
    const requestBody: PerplexityRequest = {
      model,
      messages: [
        {
          role: 'system',
          content: 'Answer concisely and cite sources.'
        },
        {
          role: 'user',
          content: query
        }
      ],
      temperature: 0.2, // Lower temperature for more focused, factual responses
      max_tokens: depth === 'high' ? 2000 : 1000 // More tokens for deeper research
    };

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
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
      if (response.status === 401) {
        throw new Error('PERPLEXITY_AUTH_FAILED: Invalid API key');
      }
      if (response.status === 429) {
        throw new Error('PERPLEXITY_RATE_LIMIT: Rate limit exceeded');
      }
      if (response.status >= 500) {
        throw new Error(`PERPLEXITY_SERVER_ERROR: ${errorText}`);
      }

      throw new Error(`PERPLEXITY_ERROR: ${response.status} - ${errorText}`);
    }

    const data: PerplexityResponse = await response.json();

    // Extract content from response
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('PERPLEXITY_EMPTY_RESPONSE: No content in response');
    }

    // Extract and normalize citations/sources
    const sources: Array<{ url: string; title: string }> = [];

    if (data.citations && Array.isArray(data.citations)) {
      // Perplexity returns citations as an array of URLs
      data.citations.forEach((url, index) => {
        sources.push({
          url,
          title: `Source ${index + 1}` // Perplexity doesn't provide titles in citations
        });
      });
    }

    // Additionally, try to extract inline citations from the content
    // Perplexity often includes [1], [2], etc. references in the text
    const inlineCitationPattern = /\[(\d+)\]/g;
    const citationMatches = content.match(inlineCitationPattern);

    // If we found inline citations but no explicit citations array, note this
    if (citationMatches && sources.length === 0) {
      // The citations are referenced but not provided separately
      // We'll just use the content as-is
      console.log('Inline citations found but no citation URLs provided');
    }

    return {
      raw_text: content,
      sources,
      provider: 'perplexity'
    };

  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort/timeout
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('PERPLEXITY_TIMEOUT: Request timed out after 30 seconds');
    }

    // Re-throw our structured errors
    if (error instanceof Error && error.message.startsWith('PERPLEXITY_')) {
      throw error;
    }

    // Wrap unknown errors
    throw new Error(`PERPLEXITY_UNKNOWN_ERROR: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate Perplexity API key format
 * Perplexity keys typically start with 'pplx-'
 */
export function validatePerplexityKey(apiKey: string): boolean {
  return apiKey.startsWith('pplx-') && apiKey.length > 10;
}
