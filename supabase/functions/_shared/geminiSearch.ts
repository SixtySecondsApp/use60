// supabase/functions/_shared/geminiSearch.ts
// Gemini 3 Flash with Google Search grounding for company research enrichment

interface GeminiSearchResult {
  result: CompanyEnrichmentData | null;
  cost: number;
  duration: number;
  error: string | null;
  tokensUsed?: {
    input: number;
    output: number;
    total: number;
  };
  sources?: Array<{ title?: string; uri?: string }>;
}

interface CompanyEnrichmentData {
  company_name: string | null;
  description: string | null;
  industry: string | null;
  employee_count_range: string | null;
  founded_year: number | null;
  headquarters_location: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  funding_stage: string | null;
  funding_total: string | null;
  key_investors: string[] | null;
  leadership_team: Array<{ name: string; title: string; background: string }> | null;
  products_services: string[] | null;
  customer_segments: string[] | null;
  key_competitors: string[] | null;
  competitive_differentiators: string[] | null;
  tech_stack: string[] | null;
  recent_news: string[] | null;
  glassdoor_rating: number | null;
}

/**
 * Execute Gemini 3 Flash search with Google Search grounding for company research
 * @param domain - Company domain to research
 * @returns Search results with enrichment data, cost, duration, and sources
 */
export async function executeGeminiSearch(domain: string): Promise<GeminiSearchResult> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

  if (!GEMINI_API_KEY) {
    return {
      result: null,
      cost: 0,
      duration: 0,
      error: 'GEMINI_API_KEY not configured'
    };
  }

  const startTime = performance.now();

  try {
    const prompt = `Research the company at domain "${domain}" and provide a comprehensive profile with current, accurate information from the web.

Return JSON with these exact fields (use null for fields you cannot find):
{
  "company_name": "string",
  "description": "string (comprehensive company description)",
  "industry": "string",
  "employee_count_range": "string (e.g., 11-50, 51-200, 201-500)",
  "founded_year": number,
  "headquarters_location": "string (city, country)",
  "website_url": "string",
  "linkedin_url": "string",
  "funding_stage": "string (e.g., Seed, Series A, Series B, Bootstrapped)",
  "funding_total": "string (e.g., $5M, $50M)",
  "key_investors": ["string"] or null,
  "leadership_team": [{"name": "string", "title": "string", "background": "string"}] or null,
  "products_services": ["string"] or null,
  "customer_segments": ["string"] or null,
  "key_competitors": ["string"] or null,
  "competitive_differentiators": ["string"] or null,
  "tech_stack": ["string"] or null,
  "recent_news": ["string (headline or brief)"] or null,
  "glassdoor_rating": number or null
}

Use web search to find accurate, current information. Focus on:
- Recent news and announcements
- Leadership changes and team information
- Funding rounds and investor details
- Product launches and customer segments
- Technology stack and competitive positioning

Return ONLY valid JSON with no markdown formatting.`;

    const requestBody = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.1, // Low temp for factual extraction
        maxOutputTokens: 4096,
        // Note: responseMimeType: 'application/json' is NOT compatible with Google Search grounding
        // So we omit it and parse JSON from text response instead
      },
      tools: [{ googleSearch: {} }] // Enable search grounding
    };

    console.log(`[geminiSearch] Calling Gemini 3.0 Flash for domain: ${domain}`);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Gemini API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const duration = Math.round(performance.now() - startTime);

    console.log(`[geminiSearch] Gemini response status: ${response.status}`);
    console.log(`[geminiSearch] Gemini candidates count: ${data.candidates?.length || 0}`);

    if (data.error) {
      throw new Error(`Gemini API error: ${data.error.message}`);
    }

    // Extract text from response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log(`[geminiSearch] Gemini response text length: ${text.length} chars`);

    if (!text) {
      throw new Error('No response text from Gemini');
    }

    // Extract grounding sources from web search results
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
    const sources: Array<{ title?: string; uri?: string }> = [];

    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web) {
          sources.push({
            title: chunk.web.title,
            uri: chunk.web.uri,
          });
        }
      }
    }

    console.log(`[geminiSearch] Extracted ${sources.length} grounding sources`);

    // Parse JSON from response
    let enrichmentData: CompanyEnrichmentData;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) ||
                       text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
      enrichmentData = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('[geminiSearch] Failed to parse Gemini JSON response');
      throw new Error('Failed to parse JSON from Gemini response');
    }

    // Calculate token usage and cost
    const inputTokens = data.usageMetadata?.promptTokenCount || 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
    const totalTokens = data.usageMetadata?.totalTokenCount || 0;

    // Gemini 3 Flash pricing: $0.10 per 1M input tokens, $0.30 per 1M output tokens
    const cost = (inputTokens / 1_000_000) * 0.10 + (outputTokens / 1_000_000) * 0.30;

    console.log(`[geminiSearch] Tokens used - Input: ${inputTokens}, Output: ${outputTokens}, Total: ${totalTokens}`);
    console.log(`[geminiSearch] Cost: $${cost.toFixed(6)}`);

    return {
      result: enrichmentData,
      cost,
      duration,
      error: null,
      tokensUsed: {
        input: inputTokens,
        output: outputTokens,
        total: totalTokens
      },
      sources
    };

  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    console.error('[geminiSearch] Error:', error);
    return {
      result: null,
      cost: 0,
      duration,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
